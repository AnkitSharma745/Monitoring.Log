import { create } from 'zustand';

import { unwrapIpcResponse } from '@renderer/ipc/unwrapIpcResponse';
import { getEngineWorkerClient } from '@renderer/services/workerClient';
import { normalizePath } from './pathUtils';
import { useSearchStore } from './searchStore';
import { useSettingsStore } from './settingsStore';
import { useWorkspaceStore } from './workspaceStore';
import type { FileContentResult } from '@shared/contracts/files';
import type {
  ActiveMemoryWindow,
  SourceIndexStats,
  StructuredLogEntry,
} from '@shared/contracts/logs';

const INITIAL_READ_BYTES = 512 * 1024;
const ACTIVE_MEMORY_WINDOW_BUFFER_ROWS = 600;
const ACTIVE_MEMORY_WINDOW_REFETCH_GUARD_ROWS = 120;
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
  activeWindowByPath: Record<string, ViewerWindow>;
  errorMessage: string | null;
  statusMessage: string | null;
  pendingOperations: number;
  viewportEntriesByPath: Record<string, StructuredLogEntry[]>;
  viewportWindowStartByPath: Record<string, number>;
  activeMemoryWindowByPath: Record<string, ActiveMemoryWindow>;
  viewportLoadingByPath: Record<string, boolean>;
  sourceIndexStatsByPath: Record<string, SourceIndexStats>;
  viewportTotalRowsByPath: Record<string, number>;
  viewportMatchedCountByPath: Record<string, number>;
  viewportMatchedIndicesByPath: Record<string, number[]>;
  viewportSeverityStatsByPath: Record<
    string,
    {
      error: number;
      warn: number;
      info: number;
      debug: number;
      neutral: number;
      total: number;
    }
  >;
  splitFilePath: string | null;
  isSplitActive: boolean;
  isScrollSyncActive: boolean;
  selectedLineEntry: StructuredLogEntry | null;
  setMode: (mode: ViewerMode) => void;
  setActiveWindow: (filePath: string, window: ViewerWindow | null) => void;
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
  refreshSourceIndexStats: (sourceId: string) => Promise<void>;
  targetLineRowIndexByPath: Record<string, number | null>;
  scrollToLineRowIndex: (idx: number | null, filePath?: string) => void;
  setSplitActive: (active: boolean) => void;
  selectSplitFile: (filePath: string | null) => Promise<void>;
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

// Deduplication map to cache loading tasks for active paths in transit
const activeLoadPromises: Record<string, Promise<FileContentResult | null> | undefined> = {};

const invalidateActiveMemoryWindow = (
  filePath: string,
  setState: (partial: (state: ViewerStoreState) => Partial<ViewerStoreState>) => void,
): void => {
  setState((state) => {
    const activeMemoryWindowByPath = { ...state.activeMemoryWindowByPath };
    delete activeMemoryWindowByPath[filePath];
    return { activeMemoryWindowByPath };
  });
};

export const useViewerStore = create<ViewerStoreState>((set, get) => ({
  selectedFilePath: null,
  documentsByPath: {},
  mode: 'tail',
  activeWindowByPath: {},
  errorMessage: null,
  statusMessage: null,
  pendingOperations: 0,
  viewportEntriesByPath: {},
  viewportWindowStartByPath: {},
  activeMemoryWindowByPath: {},
  viewportLoadingByPath: {},
  sourceIndexStatsByPath: {},
  viewportTotalRowsByPath: {},
  viewportMatchedCountByPath: {},
  viewportMatchedIndicesByPath: {},
  viewportSeverityStatsByPath: {},
  targetLineRowIndexByPath: {},
  splitFilePath: null,
  isSplitActive: false,
  isScrollSyncActive: false,
  selectedLineEntry: null,

  scrollToLineRowIndex: (idx, filePath): void => {
    const path = normalizePath(filePath || get().selectedFilePath);
    if (path) {
      set((state) => ({
        targetLineRowIndexByPath: {
          ...state.targetLineRowIndexByPath,
          [path]: idx,
        },
      }));
    }
  },

  setSplitActive: (active): void => {
    set({ isSplitActive: active });
  },

  selectSplitFile: async (filePath): Promise<void> => {
    const normalized = filePath ? normalizePath(filePath) : null;
    window.desktop.logging.log(
      'info',
      `Selecting split compare target file: ${normalized || 'none'}`,
      'viewerStore.ts',
    );

    if (normalized && normalized === normalizePath(get().selectedFilePath)) {
      window.desktop.logging.log(
        'warn',
        `Attempted to select the same file in split view: ${normalized}`,
        'viewerStore.ts',
      );
      return; // Do not allow selecting the same file in split view
    }

    try {
      set({ splitFilePath: normalized });
      if (normalized && !get().documentsByPath[normalized]) {
        window.desktop.logging.log(
          'info',
          `Split compare file ${normalized} not loaded. Initiating load.`,
          'viewerStore.ts',
        );
        await get().loadFile(normalized, (res) => {
          useWorkspaceStore.getState().registerFiles([res.file], async () => {});
        });
      }
      window.desktop.logging.log(
        'info',
        `Successfully selected split compare file: ${normalized || 'none'}`,
        'viewerStore.ts',
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      window.desktop.logging.log(
        'error',
        `Failed to select split file ${normalized}: ${msg}`,
        'viewerStore.ts',
        { error: msg },
      );
      throw err;
    }
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

  setActiveWindow: (filePath, activeWindow): void => {
    const normalizedPath = normalizePath(filePath);
    if (activeWindow) {
      set((state) => ({
        activeWindowByPath: {
          ...state.activeWindowByPath,
          [normalizedPath]: activeWindow,
        },
      }));
    } else {
      set((state) => {
        const next = { ...state.activeWindowByPath };
        delete next[normalizedPath];
        return { activeWindowByPath: next };
      });
    }
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
    const normalizedPath = normalizePath(filePath);
    window.desktop.logging.log(
      'info',
      `Selecting active log file: ${normalizedPath}`,
      'viewerStore.ts',
    );
    try {
      set({
        selectedFilePath: normalizedPath,
        errorMessage: null,
        selectedLineEntry: null,
      });
      upsertTab(normalizedPath);
      window.desktop.logging.log(
        'info',
        `Successfully selected active log file: ${normalizedPath}`,
        'viewerStore.ts',
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      window.desktop.logging.log(
        'error',
        `Failed to select active log file ${normalizedPath}: ${msg}`,
        'viewerStore.ts',
        { error: msg },
      );
      throw err;
    }
  },

  loadFile: async (filePath, registerFile): Promise<FileContentResult | null> => {
    const normalizedPath = normalizePath(filePath);
    window.desktop.logging.log(
      'info',
      `loadFile initiated for: ${normalizedPath}`,
      'viewerStore.ts',
    );

    // If already loading this path, wait for it and trigger callback
    if (activeLoadPromises[normalizedPath]) {
      window.desktop.logging.log(
        'info',
        `loadFile: already loading ${normalizedPath}, joining existing promise`,
        'viewerStore.ts',
      );
      const res = await activeLoadPromises[normalizedPath];
      if (res) {
        registerFile(res);
      }
      return res;
    }

    const loadPromise = (async (): Promise<FileContentResult | null> => {
      set((state) => ({
        pendingOperations: state.pendingOperations + 1,
        statusMessage: 'Loading initial content...',
        errorMessage: null,
      }));

      try {
        window.desktop.logging.log(
          'info',
          `loadFile: starting raw read of ${normalizedPath}`,
          'viewerStore.ts',
        );
        const result = unwrapIpcResponse(
          await window.desktop.files.readFile({
            filePath: normalizedPath,
            maxBytes: INITIAL_READ_BYTES,
          }),
        );
        window.desktop.logging.log(
          'info',
          `loadFile: successfully read ${result.bytesRead} bytes from ${normalizedPath}`,
          'viewerStore.ts',
        );
        const trimmedContent = trimContent(result.content);

        set((state) => ({
          documentsByPath: {
            ...state.documentsByPath,
            [normalizedPath]: {
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
          id: `${normalizedPath}:chunk:0`,
          sourceId: normalizedPath,
          filePath: normalizedPath,
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
            requestId: `parse:${normalizedPath}:${Date.now()}`,
            chunk: initialChunk,
            text: result.content,
            startingLineNumber,
          });

          if (parseRes.type === 'parseChunk:done') {
            initialIndexedCount = parseRes.entries.length;
            await workerClient.request({
              type: 'indexEntries',
              requestId: `index:${normalizedPath}:${Date.now()}`,
              sourceId: normalizedPath,
              entries: parseRes.entries,
            });
            void get().refreshSourceIndexStats(normalizedPath);

            // Refresh the view immediately for high responsiveness
            const activeWin = get().activeWindowByPath[normalizedPath];
            if (get().selectedFilePath === normalizedPath) {
              invalidateActiveMemoryWindow(normalizedPath, set);
              const startRow = activeWin ? activeWin.startRow : 0;
              const endRow = activeWin ? activeWin.endRow : 100;
              void get().fetchViewportEntries(normalizedPath, startRow, endRow);
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
                    filePath: normalizedPath,
                    startOffset: currentOffset,
                    endOffset,
                  }),
                );

                const chunk = {
                  id: `${normalizedPath}:chunk:${chunkIdx}`,
                  sourceId: normalizedPath,
                  filePath: normalizedPath,
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
                  requestId: `parse-prog:${normalizedPath}:${chunkIdx}:${Date.now()}`,
                  chunk,
                  text: chunkResult.content,
                  startingLineNumber: currentLineNumber,
                });

                if (parseRes.type === 'parseChunk:done') {
                  await workerClient.request({
                    type: 'indexEntries',
                    requestId: `index-prog:${normalizedPath}:${chunkIdx}:${Date.now()}`,
                    sourceId: normalizedPath,
                    entries: parseRes.entries,
                  });
                  currentLineNumber += parseRes.entries.length;
                  void get().refreshSourceIndexStats(normalizedPath);
                }

                currentOffset = endOffset;
                chunkIdx++;

                // Mild throttle to prevent clogging the main process IPC channel and worker thread
                await new Promise((r) => setTimeout(r, 60));

                // Progressively stream viewport row updates
                if (get().selectedFilePath === normalizedPath) {
                  invalidateActiveMemoryWindow(normalizedPath, set);
                  const activeWin = get().activeWindowByPath[normalizedPath];
                  const startRow = activeWin ? activeWin.startRow : 0;
                  const endRow = activeWin ? activeWin.endRow : 100;
                  void get().fetchViewportEntries(normalizedPath, startRow, endRow);
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
    })();

    activeLoadPromises[normalizedPath] = loadPromise;

    try {
      const res = await loadPromise;
      if (res) {
        registerFile(res);
      }
      return res;
    } finally {
      delete activeLoadPromises[normalizedPath];
    }
  },

  clearActiveView: (): void => {
    const filePath = normalizePath(get().selectedFilePath);

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
    const normalizedPath = normalizePath(filePath);
    set((state) => {
      const documentsByPath = { ...state.documentsByPath };
      delete documentsByPath[normalizedPath];

      const selectedFilePath =
        state.selectedFilePath === normalizedPath ? null : state.selectedFilePath;

      const activeWindowByPath = { ...state.activeWindowByPath };
      delete activeWindowByPath[normalizedPath];

      const viewportEntriesByPath = { ...state.viewportEntriesByPath };
      delete viewportEntriesByPath[normalizedPath];

      const viewportWindowStartByPath = { ...state.viewportWindowStartByPath };
      delete viewportWindowStartByPath[normalizedPath];

      const activeMemoryWindowByPath = { ...state.activeMemoryWindowByPath };
      delete activeMemoryWindowByPath[normalizedPath];

      const viewportLoadingByPath = { ...state.viewportLoadingByPath };
      delete viewportLoadingByPath[normalizedPath];

      const sourceIndexStatsByPath = { ...state.sourceIndexStatsByPath };
      delete sourceIndexStatsByPath[normalizedPath];

      const viewportTotalRowsByPath = { ...state.viewportTotalRowsByPath };
      delete viewportTotalRowsByPath[normalizedPath];

      const viewportMatchedCountByPath = { ...state.viewportMatchedCountByPath };
      delete viewportMatchedCountByPath[normalizedPath];

      const viewportMatchedIndicesByPath = { ...state.viewportMatchedIndicesByPath };
      delete viewportMatchedIndicesByPath[normalizedPath];

      const viewportSeverityStatsByPath = { ...state.viewportSeverityStatsByPath };
      delete viewportSeverityStatsByPath[normalizedPath];

      const targetLineRowIndexByPath = { ...state.targetLineRowIndexByPath };
      delete targetLineRowIndexByPath[normalizedPath];

      return {
        documentsByPath,
        selectedFilePath,
        activeWindowByPath,
        viewportEntriesByPath,
        viewportWindowStartByPath,
        activeMemoryWindowByPath,
        viewportLoadingByPath,
        sourceIndexStatsByPath,
        viewportTotalRowsByPath,
        viewportMatchedCountByPath,
        viewportMatchedIndicesByPath,
        viewportSeverityStatsByPath,
        targetLineRowIndexByPath,
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
    const normalizedPath = normalizePath(filePath);
    set((state) => {
      const currentDocument = state.documentsByPath[normalizedPath];
      const rawContent =
        changeType === 'reset' ? content : `${currentDocument?.content ?? ''}${content}`;
      const trimmedContent = trimContent(rawContent);
      const existingTrimmedCharacters =
        changeType === 'reset' ? 0 : (currentDocument?.trimmedCharacters ?? 0);
      const lineCount = countLines(trimmedContent.content);

      return {
        documentsByPath: {
          ...state.documentsByPath,
          [normalizedPath]: {
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
    const currentDoc = get().documentsByPath[normalizedPath];
    const startingLineNumber =
      (currentDoc?.lineCount ?? 0) + 1 - (changeType === 'reset' ? 0 : countLines(content));
    const normalizedStartLine = Math.max(1, startingLineNumber);
    const chunk = {
      id: `${normalizedPath}:chunk:append:${Date.now()}`,
      sourceId: normalizedPath,
      filePath: normalizedPath,
      byteStart: previousOffset,
      byteEnd: nextOffset,
      lineStart: normalizedStartLine,
      lineEnd: 0,
      contentHash: '',
      parsedEntryCount: 0,
      indexed: false,
    };

    const workerClient = getEngineWorkerClient();
    const resetSourceBeforeIndex =
      changeType === 'reset'
        ? workerClient.request({
            type: 'resetSource',
            requestId: `reset-source:${normalizedPath}:${Date.now()}`,
            sourceId: normalizedPath,
          })
        : Promise.resolve(null);

    resetSourceBeforeIndex
      .then(() =>
        workerClient.request({
          type: 'parseChunk',
          requestId: `parse-append:${normalizedPath}:${Date.now()}`,
          chunk,
          text: content,
          startingLineNumber: normalizedStartLine,
        }),
      )
      .then(async (parseRes) => {
        if (parseRes.type === 'parseChunk:done') {
          await workerClient.request({
            type: 'indexEntries',
            requestId: `index-append:${normalizedPath}:${Date.now()}`,
            sourceId: normalizedPath,
            entries: parseRes.entries,
          });
          void get().refreshSourceIndexStats(normalizedPath);

          // Refetch viewport entries if we are viewing this file currently
          const activeWin = get().activeWindowByPath[normalizedPath];
          if (get().selectedFilePath === normalizedPath && activeWin) {
            set((state) => {
              const activeMemoryWindowByPath = { ...state.activeMemoryWindowByPath };
              delete activeMemoryWindowByPath[normalizedPath];
              return { activeMemoryWindowByPath };
            });
            const { startRow, endRow } = activeWin;
            void get().fetchViewportEntries(normalizedPath, startRow, endRow);
          }
        }
      })
      .catch((err) => {
        console.error('Failed to parse/index append in worker:', err);
      });
  },

  fetchViewportEntries: async (sourceId, startRow, endRow): Promise<void> => {
    const normalizedSourceId = normalizePath(sourceId);
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
    const querySignature = createViewportQuerySignature({
      severityFilters,
      searchQuery,
      filterToMatches,
      isRegex,
      isCaseSensitive,
      isWholeWord,
      includeFilter,
      excludeFilter,
    });
    const visibleStartRow = Math.max(0, Math.floor(startRow));
    const visibleEndRow = Math.max(visibleStartRow, Math.floor(endRow));
    const visibleRowSpan = Math.max(1, visibleEndRow - visibleStartRow + 1);
    const bufferRows = Math.max(ACTIVE_MEMORY_WINDOW_BUFFER_ROWS, visibleRowSpan * 3);
    const existingWindow = get().activeMemoryWindowByPath[normalizedSourceId];

    if (
      existingWindow &&
      existingWindow.querySignature === querySignature &&
      visibleStartRow >= existingWindow.startRow + ACTIVE_MEMORY_WINDOW_REFETCH_GUARD_ROWS &&
      visibleEndRow <= existingWindow.endRow - ACTIVE_MEMORY_WINDOW_REFETCH_GUARD_ROWS
    ) {
      return;
    }

    const activeStartRow = Math.max(0, visibleStartRow - bufferRows);
    const activeEndRow = visibleEndRow + bufferRows;

    const workerClient = getEngineWorkerClient();
    set((state) => ({
      viewportLoadingByPath: {
        ...state.viewportLoadingByPath,
        [normalizedSourceId]: true,
      },
      statusMessage: 'Loading visible range...',
    }));

    try {
      const res = await workerClient.request({
        type: 'getVisibleWindow',
        requestId: `window:${normalizedSourceId}:${activeStartRow}:${activeEndRow}:${Date.now()}`,
        sourceId: normalizedSourceId,
        startRow: activeStartRow,
        endRow: activeEndRow,
        visibleStartRow,
        visibleEndRow,
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
        set((state) => ({
          viewportEntriesByPath: {
            ...state.viewportEntriesByPath,
            [normalizedSourceId]: res.window.entries,
          },
          viewportWindowStartByPath: {
            ...state.viewportWindowStartByPath,
            [normalizedSourceId]: res.window.startRow,
          },
          activeMemoryWindowByPath: {
            ...state.activeMemoryWindowByPath,
            [normalizedSourceId]:
              res.window.activeMemoryWindow ??
              createFallbackMemoryWindow(
                normalizedSourceId,
                res.window.startRow,
                res.window.endRow,
                visibleStartRow,
                visibleEndRow,
                res.window.totalRows,
                querySignature,
              ),
          },
          viewportLoadingByPath: {
            ...state.viewportLoadingByPath,
            [normalizedSourceId]: false,
          },
          viewportTotalRowsByPath: {
            ...state.viewportTotalRowsByPath,
            [normalizedSourceId]: res.window.totalRows,
          },
          viewportMatchedCountByPath: {
            ...state.viewportMatchedCountByPath,
            [normalizedSourceId]: res.window.matchedCount ?? 0,
          },
          viewportMatchedIndicesByPath: {
            ...state.viewportMatchedIndicesByPath,
            [normalizedSourceId]: res.window.matchedIndices ?? [],
          },
          viewportSeverityStatsByPath: {
            ...state.viewportSeverityStatsByPath,
            [normalizedSourceId]: res.window.severityStats ?? {
              error: 0,
              warn: 0,
              info: 0,
              debug: 0,
              neutral: 0,
              total: 0,
            },
          },
        }));
      }
    } catch (error) {
      console.error('Failed to fetch viewport entries from worker:', error);
      set((state) => ({
        viewportLoadingByPath: {
          ...state.viewportLoadingByPath,
          [normalizedSourceId]: false,
        },
        errorMessage: error instanceof Error ? error.message : 'Failed to load visible range.',
      }));
    }
  },

  refreshSourceIndexStats: async (sourceId): Promise<void> => {
    const normalizedSourceId = normalizePath(sourceId);
    const workerClient = getEngineWorkerClient();

    try {
      const res = await workerClient.request({
        type: 'getSourceIndexStats',
        requestId: `stats:${normalizedSourceId}:${Date.now()}`,
        sourceId: normalizedSourceId,
      });

      if (res.type === 'getSourceIndexStats:done') {
        set((state) => ({
          sourceIndexStatsByPath: {
            ...state.sourceIndexStatsByPath,
            [normalizedSourceId]: res.stats,
          },
        }));
      }
    } catch (error) {
      console.error('Failed to refresh source index stats:', error);
    }
  },
}));

const createViewportQuerySignature = (options: {
  severityFilters?: Record<string, boolean>;
  searchQuery?: string;
  filterToMatches?: boolean;
  isRegex?: boolean;
  isCaseSensitive?: boolean;
  isWholeWord?: boolean;
  includeFilter?: string;
  excludeFilter?: string;
}): string => {
  const severityFilters = options.severityFilters ?? {};
  const severitySignature = Object.keys(severityFilters)
    .sort()
    .map((key) => `${key}:${severityFilters[key] ? '1' : '0'}`)
    .join(',');

  return [
    `sev=${severitySignature}`,
    `q=${options.searchQuery ?? ''}`,
    `matchOnly=${options.filterToMatches ? '1' : '0'}`,
    `regex=${options.isRegex ? '1' : '0'}`,
    `case=${options.isCaseSensitive ? '1' : '0'}`,
    `word=${options.isWholeWord ? '1' : '0'}`,
    `include=${options.includeFilter ?? ''}`,
    `exclude=${options.excludeFilter ?? ''}`,
  ].join('|');
};

const createFallbackMemoryWindow = (
  sourceId: string,
  startRow: number,
  endRow: number,
  visibleStartRow: number,
  visibleEndRow: number,
  totalRows: number,
  querySignature: string,
): ActiveMemoryWindow => {
  return {
    sourceId,
    startRow,
    endRow,
    visibleStartRow,
    visibleEndRow,
    beforeRows: Math.max(0, visibleStartRow - startRow),
    afterRows: Math.max(0, endRow - visibleEndRow),
    loadedRows: Math.max(0, endRow - startRow + 1),
    totalRows,
    querySignature,
    indexGeneration: 0,
  };
};
