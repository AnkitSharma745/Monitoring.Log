import { create } from 'zustand';

import { unwrapIpcResponse } from '@renderer/ipc/unwrapIpcResponse';

import type { LogSeverity } from '@renderer/features/logViewer/logParsing';
import type {
  DirectoryScanResult,
  FileContentResult,
  FileUpdateEvent,
  FileWatchErrorEvent,
  LogFileMetadata,
  PathScanIssue,
} from '@shared/contracts/files';

const INITIAL_READ_BYTES = 512 * 1024;
const MAX_RENDERER_CONTENT_CHARS = 400_000;

export interface LoadedFileDocument {
  content: string;
  bytesRead: number;
  startOffset: number;
  nextOffset: number;
  truncatedHead: boolean;
  trimmedInRenderer: boolean;
  lastUpdatedAt: string;
}

export interface WatchingFileState {
  offset: number;
  startedAt: string;
  alreadyWatching: boolean;
}

interface LastFileUpdate {
  filePath: string;
  bytesRead: number;
  changedAt: string;
  changeType: FileUpdateEvent['changeType'];
}

interface ViewerPreferences {
  autoScroll: boolean;
  lineWrap: boolean;
  showLineNumbers: boolean;
  filterToMatches: boolean;
  severityFilters: Record<LogSeverity, boolean>;
}

export type ThemeMode = 'light' | 'dark';

export interface OpenLogTab {
  filePath: string;
  pinned: boolean;
  unreadCount: number;
  openedAt: string;
  lastViewedAt: string;
  scrollTop: number;
}

interface FileMonitorState {
  directories: DirectoryScanResult[];
  filesByPath: Record<string, LogFileMetadata>;
  selectedFilePath: string | null;
  scanIssues: PathScanIssue[];
  documentsByPath: Record<string, LoadedFileDocument>;
  watchingFiles: Record<string, WatchingFileState>;
  openTabs: OpenLogTab[];
  searchQuery: string;
  activeSearchMatchIndex: number;
  preferences: ViewerPreferences;
  themeMode: ThemeMode;
  isSettingsOpen: boolean;
  isSidebarVisible: boolean;
  isExplorerVisible: boolean;
  isLogViewerExpanded: boolean;
  statusMessage: string | null;
  errorMessage: string | null;
  pendingOperations: number;
  lastUpdate: LastFileUpdate | null;
  selectFilesFromDialog: () => Promise<void>;
  selectDirectoryFromDialog: () => Promise<void>;
  scanDroppedFiles: (files: File[]) => Promise<void>;
  selectFile: (filePath: string) => Promise<void>;
  loadFile: (filePath: string) => Promise<FileContentResult | null>;
  startWatching: (filePath: string) => Promise<void>;
  stopWatching: (filePath: string) => Promise<void>;
  stopAllWatching: () => Promise<void>;
  applyFileUpdate: (event: FileUpdateEvent) => void;
  applyWatchError: (event: FileWatchErrorEvent) => void;
  clearActiveView: () => void;
  copyTextToClipboard: (text: string) => Promise<void>;
  exportTextToFile: (text: string, fileName: string) => void;
  reloadApplicationWindow: () => Promise<void>;
  setSearchQuery: (query: string) => void;
  selectNextSearchMatch: () => void;
  selectPreviousSearchMatch: () => void;
  setThemeMode: (themeMode: ThemeMode) => void;
  toggleSettingsPanel: () => void;
  closeSettingsPanel: () => void;
  toggleSidebarVisibility: () => void;
  toggleExplorerVisibility: () => void;
  toggleLogViewerExpanded: () => void;
  toggleAutoScroll: () => void;
  toggleLineWrap: () => void;
  toggleLineNumbers: () => void;
  toggleFilterToMatches: () => void;
  toggleSeverityFilter: (severity: LogSeverity) => void;
  resetLogFilters: () => void;
  closeTab: (filePath: string) => void;
  pinTab: (filePath: string) => void;
  setTabScrollPosition: (filePath: string, scrollTop: number) => void;
  restoreWorkspace: () => void;
}

type FileMonitorSet = (
  partial: Partial<FileMonitorState> | ((state: FileMonitorState) => Partial<FileMonitorState>),
  replace?: false,
) => void;

type FileMonitorGet = () => FileMonitorState;

interface PersistedWorkspaceState {
  selectedFilePath: string | null;
  openTabs: OpenLogTab[];
  watchedFilePaths: string[];
  themeMode: ThemeMode;
  isSidebarVisible: boolean;
  isExplorerVisible: boolean;
  isLogViewerExpanded: boolean;
  searchQuery: string;
  preferences: ViewerPreferences;
}

const WORKSPACE_STORAGE_KEY = 'monitoring-log.workspace.v1';

const createEnabledSeverityFilters = (): Record<LogSeverity, boolean> => {
  return {
    error: true,
    warn: true,
    info: true,
    debug: true,
    neutral: true,
  };
};

export const useFileMonitorStore = create<FileMonitorState>((set, get) => ({
  directories: [],
  filesByPath: {},
  selectedFilePath: null,
  scanIssues: [],
  documentsByPath: {},
  watchingFiles: {},
  openTabs: [],
  searchQuery: '',
  activeSearchMatchIndex: 0,
  preferences: {
    autoScroll: true,
    lineWrap: true,
    showLineNumbers: true,
    filterToMatches: false,
    severityFilters: createEnabledSeverityFilters(),
  },
  themeMode: 'light',
  isSettingsOpen: false,
  isSidebarVisible: true,
  isExplorerVisible: true,
  isLogViewerExpanded: false,
  statusMessage: null,
  errorMessage: null,
  pendingOperations: 0,
  lastUpdate: null,

  selectFilesFromDialog: async (): Promise<void> => {
    beginOperation(set);
    clearMessages(set);
    logRendererInfo('Renderer requested file selection.');

    try {
      const result = unwrapIpcResponse(await window.desktop.files.selectFiles());

      if (result.canceled) {
        set({ statusMessage: 'File selection canceled.' });
        return;
      }

      registerFiles(set, get, result.files);
      set({ statusMessage: `Selected ${result.files.length} file(s).` });
    } catch (error) {
      applyError(set, error, 'Unable to select files.');
    } finally {
      finishOperation(set);
    }
  },

  selectDirectoryFromDialog: async (): Promise<void> => {
    beginOperation(set);
    clearMessages(set);
    logRendererInfo('Renderer requested directory selection.');

    try {
      const result = unwrapIpcResponse(await window.desktop.files.selectDirectory());

      if (result.canceled || !result.scan) {
        set({ statusMessage: 'Directory selection canceled.' });
        return;
      }

      registerDirectories(set, get, [result.scan]);
      set({ statusMessage: `Discovered ${result.scan.files.length} file(s).` });
    } catch (error) {
      applyError(set, error, 'Unable to select directory.');
    } finally {
      finishOperation(set);
    }
  },

  scanDroppedFiles: async (files: File[]): Promise<void> => {
    const paths = window.desktop.files.getDroppedPaths(files);

    if (paths.length === 0) {
      set({ statusMessage: 'No readable file paths were dropped.' });
      return;
    }

    beginOperation(set);
    clearMessages(set);
    set({ scanIssues: [] });
    logRendererInfo('Renderer requested dropped path scan.', { pathCount: paths.length });

    try {
      const result = unwrapIpcResponse(await window.desktop.files.scanPaths(paths));
      const discoveredFileCount =
        result.files.length +
        result.directories.reduce((count, directory) => count + directory.files.length, 0);

      registerFiles(set, get, result.files);
      registerDirectories(set, get, result.directories);
      set({
        scanIssues: [
          ...result.errors,
          ...result.unsupportedPaths.map((path) => ({
            path,
            reason: 'Unsupported path or file type.',
          })),
        ],
        statusMessage: `Discovered ${discoveredFileCount} file(s).`,
      });
    } catch (error) {
      applyError(set, error, 'Unable to scan dropped paths.');
    } finally {
      finishOperation(set);
    }
  },

  selectFile: async (filePath: string): Promise<void> => {
    set((state) => ({
      selectedFilePath: filePath,
      errorMessage: null,
      activeSearchMatchIndex: 0,
      openTabs: upsertOpenTab(state.openTabs, filePath).map((tab) =>
        tab.filePath === filePath
          ? { ...tab, unreadCount: 0, lastViewedAt: new Date().toISOString() }
          : tab,
      ),
    }));

    if (!get().documentsByPath[filePath]) {
      await get().loadFile(filePath);
    }
  },

  loadFile: async (filePath: string): Promise<FileContentResult | null> => {
    beginOperation(set);
    clearMessages(set);

    try {
      const result = unwrapIpcResponse(
        await window.desktop.files.readFile({ filePath, maxBytes: INITIAL_READ_BYTES }),
      );
      const trimmedContent = trimContent(result.content);

      set((state) => ({
        filesByPath: {
          ...state.filesByPath,
          [result.file.path]: result.file,
        },
        openTabs: upsertOpenTab(state.openTabs, result.file.path),
        documentsByPath: {
          ...state.documentsByPath,
          [filePath]: {
            content: trimmedContent.content,
            bytesRead: result.bytesRead,
            startOffset: result.startOffset,
            nextOffset: result.nextOffset,
            truncatedHead: result.truncatedHead,
            trimmedInRenderer: trimmedContent.wasTrimmed,
            lastUpdatedAt: new Date().toISOString(),
          },
        },
      }));

      return result;
    } catch (error) {
      applyError(set, error, 'Unable to read file.');
      return null;
    } finally {
      finishOperation(set);
    }
  },

  startWatching: async (filePath: string): Promise<void> => {
    if (get().watchingFiles[filePath]) {
      set({ statusMessage: 'File is already being watched.' });
      return;
    }

    beginOperation(set);
    clearMessages(set);
    logRendererInfo('Renderer requested watcher start.', { filePath });

    try {
      const currentDocument = get().documentsByPath[filePath];
      const loadedDocument = currentDocument ? null : await get().loadFile(filePath);
      const nextOffset = currentDocument?.nextOffset ?? loadedDocument?.nextOffset;

      if (nextOffset === undefined) {
        throw new Error('Unable to determine file offset before watching.');
      }

      const result = unwrapIpcResponse(
        await window.desktop.files.startWatching({ filePath, startOffset: nextOffset }),
      );

      set((state) => ({
        watchingFiles: {
          ...state.watchingFiles,
          [result.file.path]: {
            offset: result.offset,
            startedAt: new Date().toISOString(),
            alreadyWatching: result.alreadyWatching,
          },
        },
        statusMessage: result.alreadyWatching
          ? 'Watcher already active.'
          : 'Started watching file.',
      }));
    } catch (error) {
      applyError(set, error, 'Unable to start watcher.');
    } finally {
      finishOperation(set);
    }
  },

  stopWatching: async (filePath: string): Promise<void> => {
    beginOperation(set);
    clearMessages(set);
    logRendererInfo('Renderer requested watcher stop.', { filePath });

    try {
      const result = unwrapIpcResponse(await window.desktop.files.stopWatching({ filePath }));

      set((state) => {
        const watchingFiles = { ...state.watchingFiles };
        delete watchingFiles[result.filePath];

        return {
          watchingFiles,
          statusMessage: result.stopped ? 'Stopped watching file.' : 'Watcher was not active.',
        };
      });
    } catch (error) {
      applyError(set, error, 'Unable to stop watcher.');
    } finally {
      finishOperation(set);
    }
  },

  stopAllWatching: async (): Promise<void> => {
    const watchedPaths = Object.keys(get().watchingFiles);

    if (watchedPaths.length === 0) {
      return;
    }

    beginOperation(set);
    clearMessages(set);
    logRendererInfo('Renderer requested all watchers stop.', { watcherCount: watchedPaths.length });

    try {
      await Promise.all(
        watchedPaths.map(async (filePath) =>
          unwrapIpcResponse(await window.desktop.files.stopWatching({ filePath })),
        ),
      );

      set({
        watchingFiles: {},
        statusMessage: `Stopped ${watchedPaths.length} watcher(s).`,
      });
    } catch (error) {
      applyError(set, error, 'Unable to stop all watchers.');
    } finally {
      finishOperation(set);
    }
  },

  applyFileUpdate: (event: FileUpdateEvent): void => {
    set((state) => {
      const currentDocument = state.documentsByPath[event.filePath];
      const nextContent =
        event.changeType === 'reset'
          ? event.content
          : `${currentDocument?.content ?? ''}${event.content}`;
      const trimmedContent = trimContent(nextContent);
      const currentWatch = state.watchingFiles[event.filePath];

      return {
        documentsByPath: {
          ...state.documentsByPath,
          [event.filePath]: {
            content: trimmedContent.content,
            bytesRead: (currentDocument?.bytesRead ?? 0) + event.bytesRead,
            startOffset: event.changeType === 'reset' ? 0 : (currentDocument?.startOffset ?? 0),
            nextOffset: event.nextOffset,
            truncatedHead: currentDocument?.truncatedHead ?? false,
            trimmedInRenderer:
              (currentDocument?.trimmedInRenderer ?? false) || trimmedContent.wasTrimmed,
            lastUpdatedAt: event.changedAt,
          },
        },
        watchingFiles: currentWatch
          ? {
              ...state.watchingFiles,
              [event.filePath]: {
                ...currentWatch,
                offset: event.nextOffset,
              },
            }
          : state.watchingFiles,
        openTabs: state.openTabs.map((tab) =>
          tab.filePath === event.filePath
            ? {
                ...tab,
                unreadCount:
                  state.selectedFilePath === event.filePath
                    ? 0
                    : tab.unreadCount + Math.max(1, event.content.split(/\r?\n/).length - 1),
              }
            : tab,
        ),
        lastUpdate: {
          filePath: event.filePath,
          bytesRead: event.bytesRead,
          changedAt: event.changedAt,
          changeType: event.changeType,
        },
        statusMessage: `Read ${event.bytesRead} appended byte(s).`,
      };
    });
  },

  applyWatchError: (event: FileWatchErrorEvent): void => {
    set({
      errorMessage: `${event.filePath}: ${event.message}`,
      statusMessage: null,
    });
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
            lastUpdatedAt: new Date().toISOString(),
          },
        },
        statusMessage: 'Cleared current viewer buffer.',
      };
    });
    logRendererInfo('Renderer cleared active log view.', { filePath });
  },

  copyTextToClipboard: async (text: string): Promise<void> => {
    if (text.length === 0) {
      set({ statusMessage: 'There is no visible log content to copy.' });
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      set({ statusMessage: 'Copied visible logs to clipboard.' });
      logRendererInfo('Renderer copied visible log content.', { characterCount: text.length });
    } catch (error) {
      applyError(set, error, 'Unable to copy logs.');
    }
  },

  exportTextToFile: (text: string, fileName: string): void => {
    if (text.length === 0) {
      set({ statusMessage: 'There is no visible log content to export.' });
      return;
    }

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
    set({ statusMessage: 'Exported visible logs.' });
    logRendererInfo('Renderer exported visible log content.', {
      fileName,
      characterCount: text.length,
    });
  },

  reloadApplicationWindow: async (): Promise<void> => {
    logRendererInfo('Renderer requested window reload from settings.');
    await window.desktop.app.reloadWindow();
  },

  setSearchQuery: (query: string): void => {
    set({ searchQuery: query, activeSearchMatchIndex: 0 });
  },

  selectNextSearchMatch: (): void => {
    set((state) => ({
      activeSearchMatchIndex: state.activeSearchMatchIndex + 1,
    }));
  },

  selectPreviousSearchMatch: (): void => {
    set((state) => ({
      activeSearchMatchIndex: Math.max(0, state.activeSearchMatchIndex - 1),
    }));
  },

  setThemeMode: (themeMode: ThemeMode): void => {
    set({ themeMode, statusMessage: `Theme changed to ${themeMode} mode.` });
    logRendererInfo('Renderer changed theme.', { themeMode });
  },

  toggleSettingsPanel: (): void => {
    set((state) => ({
      isSettingsOpen: !state.isSettingsOpen,
    }));
  },

  closeSettingsPanel: (): void => {
    set({ isSettingsOpen: false });
  },

  toggleSidebarVisibility: (): void => {
    set((state) => ({
      isSidebarVisible: !state.isSidebarVisible,
      statusMessage: state.isSidebarVisible ? 'Sidebar hidden.' : 'Sidebar shown.',
    }));
    logRendererInfo('Renderer toggled sidebar visibility.');
  },

  toggleExplorerVisibility: (): void => {
    set((state) => ({
      isExplorerVisible: !state.isExplorerVisible,
      statusMessage: state.isExplorerVisible ? 'File explorer hidden.' : 'File explorer shown.',
    }));
    logRendererInfo('Renderer toggled file explorer visibility.');
  },

  toggleLogViewerExpanded: (): void => {
    set((state) => ({
      isLogViewerExpanded: !state.isLogViewerExpanded,
      isSettingsOpen: false,
      statusMessage: state.isLogViewerExpanded
        ? 'Exited focused log view.'
        : 'Entered focused log view.',
    }));
    logRendererInfo('Renderer toggled focused log view.');
  },

  toggleAutoScroll: (): void => {
    set((state) => ({
      preferences: {
        ...state.preferences,
        autoScroll: !state.preferences.autoScroll,
      },
    }));
  },

  toggleLineWrap: (): void => {
    set((state) => ({
      preferences: {
        ...state.preferences,
        lineWrap: !state.preferences.lineWrap,
      },
    }));
  },

  toggleLineNumbers: (): void => {
    set((state) => ({
      preferences: {
        ...state.preferences,
        showLineNumbers: !state.preferences.showLineNumbers,
      },
    }));
  },

  toggleFilterToMatches: (): void => {
    set((state) => ({
      preferences: {
        ...state.preferences,
        filterToMatches: !state.preferences.filterToMatches,
      },
    }));
  },

  toggleSeverityFilter: (severity: LogSeverity): void => {
    set((state) => ({
      preferences: {
        ...state.preferences,
        severityFilters: {
          ...state.preferences.severityFilters,
          [severity]: !state.preferences.severityFilters[severity],
        },
      },
    }));
  },

  resetLogFilters: (): void => {
    set((state) => ({
      searchQuery: '',
      activeSearchMatchIndex: 0,
      preferences: {
        ...state.preferences,
        filterToMatches: false,
        severityFilters: createEnabledSeverityFilters(),
      },
      statusMessage: 'Log filters reset.',
    }));
  },

  closeTab: (filePath: string): void => {
    const tab = get().openTabs.find((item) => item.filePath === filePath);

    if (tab?.pinned) {
      set({ statusMessage: 'Pinned tabs stay open until unpinned.' });
      return;
    }

    set((state) => {
      const nextTabs = state.openTabs.filter((item) => item.filePath !== filePath);
      const selectedFilePath =
        state.selectedFilePath === filePath
          ? (nextTabs.at(-1)?.filePath ?? null)
          : state.selectedFilePath;

      return {
        openTabs: nextTabs,
        selectedFilePath,
        statusMessage: 'Closed log tab.',
      };
    });
    logRendererInfo('Renderer closed log tab.', { filePath });
  },

  pinTab: (filePath: string): void => {
    set((state) => ({
      openTabs: state.openTabs.map((tab) =>
        tab.filePath === filePath ? { ...tab, pinned: !tab.pinned } : tab,
      ),
    }));
    logRendererInfo('Renderer toggled log tab pin.', { filePath });
  },

  setTabScrollPosition: (filePath: string, scrollTop: number): void => {
    set((state) => ({
      openTabs: state.openTabs.map((tab) =>
        tab.filePath === filePath ? { ...tab, scrollTop } : tab,
      ),
    }));
  },

  restoreWorkspace: (): void => {
    const persistedWorkspace = readPersistedWorkspace();

    if (!persistedWorkspace) {
      return;
    }

    set({
      selectedFilePath: persistedWorkspace.selectedFilePath,
      openTabs: persistedWorkspace.openTabs,
      themeMode: persistedWorkspace.themeMode,
      isSidebarVisible: persistedWorkspace.isSidebarVisible,
      isExplorerVisible: persistedWorkspace.isExplorerVisible,
      isLogViewerExpanded: persistedWorkspace.isLogViewerExpanded,
      searchQuery: persistedWorkspace.searchQuery,
      preferences: persistedWorkspace.preferences,
      statusMessage: 'Workspace restored.',
    });

    for (const filePath of persistedWorkspace.watchedFilePaths) {
      void get().startWatching(filePath);
    }

    if (persistedWorkspace.selectedFilePath) {
      void get().loadFile(persistedWorkspace.selectedFilePath);
    }

    logRendererInfo('Renderer restored workspace.', {
      tabCount: persistedWorkspace.openTabs.length,
      watcherCount: persistedWorkspace.watchedFilePaths.length,
    });
  },
}));

const registerFiles = (
  set: FileMonitorSet,
  get: FileMonitorGet,
  incomingFiles: LogFileMetadata[],
): void => {
  if (incomingFiles.length === 0) {
    return;
  }

  set((state) => {
    const filesByPath = { ...state.filesByPath };
    let openTabs = state.openTabs;

    for (const file of incomingFiles) {
      filesByPath[file.path] = file;
      openTabs = upsertOpenTab(openTabs, file.path);
    }

    return {
      filesByPath,
      openTabs,
      selectedFilePath: state.selectedFilePath ?? incomingFiles[0]?.path ?? null,
    };
  });

  const selectedFilePath = get().selectedFilePath;

  if (selectedFilePath && !get().documentsByPath[selectedFilePath]) {
    void get().loadFile(selectedFilePath);
  }
};

const upsertOpenTab = (tabs: OpenLogTab[], filePath: string): OpenLogTab[] => {
  if (tabs.some((tab) => tab.filePath === filePath)) {
    return tabs;
  }

  return [
    ...tabs,
    {
      filePath,
      pinned: false,
      unreadCount: 0,
      openedAt: new Date().toISOString(),
      lastViewedAt: new Date().toISOString(),
      scrollTop: 0,
    },
  ];
};

const registerDirectories = (
  set: FileMonitorSet,
  get: FileMonitorGet,
  incomingDirectories: DirectoryScanResult[],
): void => {
  if (incomingDirectories.length === 0) {
    return;
  }

  set((state) => {
    const directoriesByPath = new Map(
      state.directories.map((directory) => [directory.root.path, directory]),
    );

    for (const directory of incomingDirectories) {
      directoriesByPath.set(directory.root.path, directory);
    }

    return {
      directories: Array.from(directoriesByPath.values()).sort((left, right) =>
        left.root.path.localeCompare(right.root.path),
      ),
    };
  });

  registerFiles(
    set,
    get,
    incomingDirectories.flatMap((directory) => directory.files),
  );
};

const beginOperation = (set: FileMonitorSet): void => {
  set((state) => ({
    pendingOperations: state.pendingOperations + 1,
  }));
};

const finishOperation = (set: FileMonitorSet): void => {
  set((state) => ({
    pendingOperations: Math.max(0, state.pendingOperations - 1),
  }));
};

const clearMessages = (set: FileMonitorSet): void => {
  set({
    statusMessage: null,
    errorMessage: null,
  });
};

const applyError = (set: FileMonitorSet, error: unknown, fallbackMessage: string): void => {
  const message = error instanceof Error ? error.message : fallbackMessage;

  set({
    errorMessage: message,
    statusMessage: null,
  });
  window.desktop.logging.log('error', fallbackMessage, 'file-monitor-store.ts', { error: message });
};

const trimContent = (content: string): { content: string; wasTrimmed: boolean } => {
  if (content.length <= MAX_RENDERER_CONTENT_CHARS) {
    return { content, wasTrimmed: false };
  }

  return {
    content: content.slice(content.length - MAX_RENDERER_CONTENT_CHARS),
    wasTrimmed: true,
  };
};

const logRendererInfo = (message: string, data?: Record<string, unknown>): void => {
  window.desktop.logging.log('info', message, 'file-monitor-store.ts', data);
};

const readPersistedWorkspace = (): PersistedWorkspaceState | null => {
  try {
    const rawValue = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);

    if (!rawValue) {
      return null;
    }

    return JSON.parse(rawValue) as PersistedWorkspaceState;
  } catch (error) {
    window.desktop.logging.log(
      'warn',
      'Failed to restore persisted workspace.',
      'file-monitor-store.ts',
      {
        error: error instanceof Error ? error.message : 'Unknown restore error.',
      },
    );
    return null;
  }
};

const writePersistedWorkspace = (state: FileMonitorState): void => {
  const workspaceState: PersistedWorkspaceState = {
    selectedFilePath: state.selectedFilePath,
    openTabs: state.openTabs,
    watchedFilePaths: Object.keys(state.watchingFiles),
    themeMode: state.themeMode,
    isSidebarVisible: state.isSidebarVisible,
    isExplorerVisible: state.isExplorerVisible,
    isLogViewerExpanded: state.isLogViewerExpanded,
    searchQuery: state.searchQuery,
    preferences: state.preferences,
  };

  try {
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(workspaceState));
  } catch (error) {
    window.desktop.logging.log('warn', 'Failed to persist workspace.', 'file-monitor-store.ts', {
      error: error instanceof Error ? error.message : 'Unknown persist error.',
    });
  }
};

useFileMonitorStore.subscribe((state) => {
  writePersistedWorkspace(state);
});
