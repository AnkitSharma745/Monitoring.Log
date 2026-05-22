import { create } from 'zustand';

import { unwrapIpcResponse } from '@renderer/ipc/unwrapIpcResponse';
import { getEngineWorkerClient } from '@renderer/services/workerClient';
import { useSearchStore } from './searchStore';
import { useSettingsStore } from './settingsStore';
import type { FileContentResult } from '@shared/contracts/files';
import type { StructuredLogEntry } from '@shared/contracts/logs';

const INITIAL_READ_BYTES = 512 * 1024;
export const MAX_RENDERER_CONTENT_CHARS = 400_000;

export interface LoadedFileDocument {
  content: string;
  bytesRead: number;
  startOffset: number;
  nextOffset: number;
  truncatedHead: boolean;
  trimmedInRenderer: boolean;
  trimmedCharacters: number;
  lineCount: number;
  lastUpdatedAt: string;
}

export type ViewerMode = 'tail' | 'randomAccess' | 'comparison' | 'incidentReplay';

export interface ViewerWindow {
  sourceId: string;
  startRow: number;
  endRow: number;
}

interface ViewerStoreState {
  selectedFilePath: string | null;
  documentsByPath: Record<string, LoadedFileDocument>;
  mode: ViewerMode;
  activeWindow: ViewerWindow | null;
  errorMessage: string | null;
  statusMessage: string | null;
  pendingOperations: number;
  viewportEntries: StructuredLogEntry[];
  viewportTotalRows: number;
  viewportMatchedCount: number;
  viewportMatchedIndices: number[];
  viewportSeverityStats: {
    error: number;
    warn: number;
    info: number;
    debug: number;
    neutral: number;
    total: number;
  };
  splitFilePath: string | null;
  isSplitActive: boolean;
  isScrollSyncActive: boolean;
  selectedLineEntry: StructuredLogEntry | null;
  setMode: (mode: ViewerMode) => void;
  setActiveWindow: (window: ViewerWindow | null) => void;
  selectFile: (filePath: string, upsertTab: (path: string) => void) => Promise<void>;
  loadFile: (
    filePath: string,
    registerFile: (res: FileContentResult) => void,
  ) => Promise<FileContentResult | null>;
  clearActiveView: () => void;
  removeFileState: (filePath: string) => void;
  applyFileUpdate: (
    filePath: string,
    content: string,
    bytesRead: number,
    previousOffset: number,
    nextOffset: number,
    sizeBytes: number,
    changedAt: string,
    changeType: 'append' | 'reset',
  ) => void;
  setPending: (pending: boolean) => void;
  setError: (msg: string | null) => void;
  setStatus: (msg: string | null) => void;
  fetchViewportEntries: (sourceId: string, startRow: number, endRow: number) => Promise<void>;
  targetLineRowIndex: number | null;
  scrollToLineRowIndex: (idx: number | null) => void;
  setSplitActive: (active: boolean) => void;
  selectSplitFile: (filePath: string | null) => void;
  toggleScrollSync: () => void;
  setSelectedLineEntry: (entry: StructuredLogEntry | null) => void;
}

export const trimContent = (
  content: string,
): { content: string; wasTrimmed: boolean; trimmedCharacters: number } => {
  if (content.length <= MAX_RENDERER_CONTENT_CHARS) {
    return { content, wasTrimmed: false, trimmedCharacters: 0 };
  }

  const trimmedCharacters = content.length - MAX_RENDERER_CONTENT_CHARS;

  return {
    content: content.slice(trimmedCharacters),
    wasTrimmed: true,
    trimmedCharacters,
  };
};

export const countLines = (content: string): number => {
  return content.length === 0 ? 0 : content.split(/\r?\n/).length;
};

export const useViewerStore = create<ViewerStoreState>((set, get) => ({
  selectedFilePath: null,
  documentsByPath: {},
  mode: 'tail',
  activeWindow: null,
  errorMessage: null,
  statusMessage: null,
  pendingOperations: 0,
  viewportEntries: [],
  viewportTotalRows: 0,
  viewportMatchedCount: 0,
  viewportMatchedIndices: [],
  viewportSeverityStats: { error: 0, warn: 0, info: 0, debug: 0, neutral: 0, total: 0 },
  targetLineRowIndex: null,
  splitFilePath: null,
  isSplitActive: false,
  isScrollSyncActive: false,
  selectedLineEntry: null,

  scrollToLineRowIndex: (idx): void => {
    set({ targetLineRowIndex: idx });
  },

  setSplitActive: (active): void => {
    set({ isSplitActive: active });
  },

  selectSplitFile: (filePath): void => {
    set({ splitFilePath: filePath });
  },

  toggleScrollSync: (): void => {
    set((state) => ({ isScrollSyncActive: !state.isScrollSyncActive }));
  },

  setSelectedLineEntry: (entry): void => {
    set({ selectedLineEntry: entry });
  },

  setMode: (mode): void => {
    set({ mode });
  },

  setActiveWindow: (activeWindow): void => {
    set({ activeWindow });
  },

  setPending: (pending): void => {
    set((state) => ({
      pendingOperations: Math.max(0, state.pendingOperations + (pending ? 1 : -1)),
    }));
  },

  setError: (msg): void => {
    set({ errorMessage: msg });
  },

  setStatus: (msg): void => {
    set({ statusMessage: msg });
  },

  selectFile: async (filePath, upsertTab): Promise<void> => {
    set({
      selectedFilePath: filePath,
      errorMessage: null,
    });
    upsertTab(filePath);

    if (!get().documentsByPath[filePath]) {
      // Load file will be initiated via fileMonitorStore or direct call
    }
  },

  loadFile: async (filePath, registerFile): Promise<FileContentResult | null> => {
    set((state) => ({
      pendingOperations: state.pendingOperations + 1,
      statusMessage: 'Loading initial content...',
      errorMessage: null,
    }));

    try {
      const result = unwrapIpcResponse(
        await window.desktop.files.readFile({ filePath, maxBytes: INITIAL_READ_BYTES }),
      );
      const trimmedContent = trimContent(result.content);

      registerFile(result);

      set((state) => ({
        documentsByPath: {
          ...state.documentsByPath,
          [filePath]: {
            content: trimmedContent.content,
            bytesRead: result.bytesRead,
            startOffset: result.startOffset,
            nextOffset: result.nextOffset,
            truncatedHead: result.truncatedHead,
            trimmedInRenderer: trimmedContent.wasTrimmed,
            trimmedCharacters: trimmedContent.trimmedCharacters,
            lineCount: countLines(trimmedContent.content),
            lastUpdatedAt: new Date().toISOString(),
          },
        },
      }));

      // Parse and index the initial chunk off-thread in the web worker
      const startingLineNumber = 1;
      const initialChunk = {
        id: `${filePath}:chunk:0`,
        sourceId: filePath,
        filePath,
        byteStart: result.startOffset,
        byteEnd: result.nextOffset,
        lineStart: startingLineNumber,
        lineEnd: 0,
        contentHash: '',
        parsedEntryCount: 0,
        indexed: false,
      };

      const workerClient = getEngineWorkerClient();
      let initialIndexedCount = 0;

      try {
        const parseRes = await workerClient.request({
          type: 'parseChunk',
          requestId: `parse:${filePath}:${Date.now()}`,
          chunk: initialChunk,
          text: result.content,
          startingLineNumber,
        });

        if (parseRes.type === 'parseChunk:done') {
          initialIndexedCount = parseRes.entries.length;
          await workerClient.request({
            type: 'indexEntries',
            requestId: `index:${filePath}:${Date.now()}`,
            sourceId: filePath,
            entries: parseRes.entries,
          });

          // Refresh the view immediately for high responsiveness
          const activeWin = get().activeWindow;
          if (get().selectedFilePath === filePath) {
            const startRow = activeWin ? activeWin.startRow : 0;
            const endRow = activeWin ? activeWin.endRow : 100;
            void get().fetchViewportEntries(filePath, startRow, endRow);
          }
        }
      } catch (err) {
        console.error('Failed to parse/index initial chunk in worker:', err);
      }

      // Progressive Background Processing for larger files
      const totalSizeBytes = result.file.sizeBytes;
      if (totalSizeBytes > result.bytesRead) {
        // Spawn progressive loading in background so we never freeze or block the renderer thread
        setTimeout(async () => {
          try {
            let currentOffset = 0;
            let chunkIdx = 1;
            let currentLineNumber = startingLineNumber + initialIndexedCount;
            const PROGRESSIVE_CHUNK_SIZE = 1024 * 1024; // 1MB chunks

            while (currentOffset < totalSizeBytes) {
              // Skip the range already covered by the initial load
              if (currentOffset >= result.startOffset && currentOffset < result.nextOffset) {
                currentOffset = result.nextOffset;
                continue;
              }

              const endOffset = Math.min(totalSizeBytes, currentOffset + PROGRESSIVE_CHUNK_SIZE);

              const chunkResult = unwrapIpcResponse(
                await window.desktop.files.readFile({
                  filePath,
                  startOffset: currentOffset,
                  endOffset,
                }),
              );

              const chunk = {
                id: `${filePath}:chunk:${chunkIdx}`,
                sourceId: filePath,
                filePath,
                byteStart: currentOffset,
                byteEnd: endOffset,
                lineStart: currentLineNumber,
                lineEnd: 0,
                contentHash: '',
                parsedEntryCount: 0,
                indexed: false,
              };

              const parseRes = await workerClient.request({
                type: 'parseChunk',
                requestId: `parse-prog:${filePath}:${chunkIdx}:${Date.now()}`,
                chunk,
                text: chunkResult.content,
                startingLineNumber: currentLineNumber,
              });

              if (parseRes.type === 'parseChunk:done') {
                await workerClient.request({
                  type: 'indexEntries',
                  requestId: `index-prog:${filePath}:${chunkIdx}:${Date.now()}`,
                  sourceId: filePath,
                  entries: parseRes.entries,
                });
                currentLineNumber += parseRes.entries.length;
              }

              currentOffset = endOffset;
              chunkIdx++;

              // Mild throttle to prevent clogging the main process IPC channel and worker thread
              await new Promise((r) => setTimeout(r, 60));

              // Progressively stream viewport row updates
              if (get().selectedFilePath === filePath) {
                const activeWin = get().activeWindow;
                const startRow = activeWin ? activeWin.startRow : 0;
                const endRow = activeWin ? activeWin.endRow : 100;
                void get().fetchViewportEntries(filePath, startRow, endRow);
              }
            }
          } catch (bgErr) {
            console.error('Progressive chunk reading background error:', bgErr);
          }
        }, 100);
      }

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to read file.';
      set({ errorMessage: message });
      window.desktop.logging.log('error', 'Unable to read file.', 'viewerStore.ts', {
        error: message,
      });
      return null;
    } finally {
      set((state) => ({ pendingOperations: Math.max(0, state.pendingOperations - 1) }));
    }
  },

  clearActiveView: (): void => {
    const filePath = get().selectedFilePath;

    if (!filePath) {
      return;
    }

    set((state) => {
      const currentDocument = state.documentsByPath[filePath];

      if (!currentDocument) {
        return state;
      }

      return {
        documentsByPath: {
          ...state.documentsByPath,
          [filePath]: {
            ...currentDocument,
            content: '',
            bytesRead: 0,
            trimmedInRenderer: false,
            trimmedCharacters: 0,
            lineCount: 0,
            lastUpdatedAt: new Date().toISOString(),
          },
        },
        statusMessage: 'Cleared current viewer buffer.',
      };
    });
  },

  removeFileState: (filePath): void => {
    set((state) => {
      const documentsByPath = { ...state.documentsByPath };
      delete documentsByPath[filePath];

      const selectedFilePath = state.selectedFilePath === filePath ? null : state.selectedFilePath;

      return {
        documentsByPath,
        selectedFilePath,
      };
    });
  },

  applyFileUpdate: (
    filePath,
    content,
    bytesRead,
    previousOffset,
    nextOffset,
    _sizeBytes,
    changedAt,
    changeType,
  ): void => {
    set((state) => {
      const currentDocument = state.documentsByPath[filePath];
      const rawContent =
        changeType === 'reset' ? content : `${currentDocument?.content ?? ''}${content}`;
      const trimmedContent = trimContent(rawContent);
      const existingTrimmedCharacters =
        changeType === 'reset' ? 0 : (currentDocument?.trimmedCharacters ?? 0);
      const lineCount = countLines(trimmedContent.content);

      return {
        documentsByPath: {
          ...state.documentsByPath,
          [filePath]: {
            content: trimmedContent.content,
            bytesRead:
              changeType === 'reset' ? bytesRead : (currentDocument?.bytesRead ?? 0) + bytesRead,
            startOffset:
              changeType === 'reset' ? 0 : (currentDocument?.startOffset ?? previousOffset),
            nextOffset: nextOffset,
            truncatedHead:
              (currentDocument?.truncatedHead ?? previousOffset > 0) || trimmedContent.wasTrimmed,
            trimmedInRenderer:
              (currentDocument?.trimmedInRenderer ?? false) || trimmedContent.wasTrimmed,
            trimmedCharacters: existingTrimmedCharacters + trimmedContent.trimmedCharacters,
            lineCount,
            lastUpdatedAt: changedAt,
          },
        },
      };
    });

    // Background Web Worker parsing and indexing for live file changes
    const currentDoc = get().documentsByPath[filePath];
    const startingLineNumber =
      (currentDoc?.lineCount ?? 0) + 1 - (changeType === 'reset' ? 0 : countLines(content));
    const normalizedStartLine = Math.max(1, startingLineNumber);
    const chunk = {
      id: `${filePath}:chunk:append:${Date.now()}`,
      sourceId: filePath,
      filePath,
      byteStart: previousOffset,
      byteEnd: nextOffset,
      lineStart: normalizedStartLine,
      lineEnd: 0,
      contentHash: '',
      parsedEntryCount: 0,
      indexed: false,
    };

    const workerClient = getEngineWorkerClient();
    workerClient
      .request({
        type: 'parseChunk',
        requestId: `parse-append:${filePath}:${Date.now()}`,
        chunk,
        text: content,
        startingLineNumber: normalizedStartLine,
      })
      .then(async (parseRes) => {
        if (parseRes.type === 'parseChunk:done') {
          await workerClient.request({
            type: 'indexEntries',
            requestId: `index-append:${filePath}:${Date.now()}`,
            sourceId: filePath,
            entries: parseRes.entries,
          });

          // Refetch viewport entries if we are viewing this file currently
          if (get().selectedFilePath === filePath && get().activeWindow) {
            const { startRow, endRow } = get().activeWindow!;
            void get().fetchViewportEntries(filePath, startRow, endRow);
          }
        }
      })
      .catch((err) => {
        console.error('Failed to parse/index append in worker:', err);
      });
  },

  fetchViewportEntries: async (sourceId, startRow, endRow): Promise<void> => {
    const searchStore = useSearchStore.getState();
    const settingsStore = useSettingsStore.getState();
    const searchQuery = searchStore.searchQuery;
    const filterToMatches = settingsStore.preferences.filterToMatches;
    const severityFilters = settingsStore.preferences.severityFilters;
    const isRegex = searchStore.isRegex;
    const isCaseSensitive = searchStore.isCaseSensitive;
    const isWholeWord = searchStore.isWholeWord;
    const includeFilter = settingsStore.preferences.includeFilter;
    const excludeFilter = settingsStore.preferences.excludeFilter;

    const workerClient = getEngineWorkerClient();
    try {
      const res = await workerClient.request({
        type: 'getVisibleWindow',
        requestId: `window:${sourceId}:${startRow}:${endRow}:${Date.now()}`,
        sourceId,
        startRow,
        endRow,
        severityFilters,
        searchQuery,
        filterToMatches,
        isRegex,
        isCaseSensitive,
        isWholeWord,
        includeFilter,
        excludeFilter,
      });

      if (res.type === 'getVisibleWindow:done') {
        set({
          viewportEntries: res.window.entries,
          viewportTotalRows: res.window.totalRows,
          viewportMatchedCount: res.window.matchedCount ?? 0,
          viewportMatchedIndices: res.window.matchedIndices ?? [],
          viewportSeverityStats: res.window.severityStats ?? {
            error: 0,
            warn: 0,
            info: 0,
            debug: 0,
            neutral: 0,
            total: 0,
          },
        });
      }
    } catch (error) {
      console.error('Failed to fetch viewport entries from worker:', error);
    }
  },
}));
