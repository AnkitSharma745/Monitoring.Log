import { create } from 'zustand';

import { useActivityStore } from './activityStore';
import { useSearchStore } from './searchStore';
import { useSettingsStore } from './settingsStore';
import { useViewerStore } from './viewerStore';
import { useWatcherStore } from './watcherStore';
import { useWorkspaceStore } from './workspaceStore';
import type { LogSeverity } from '@renderer/features/logViewer/logParsing';
import type {
  DirectoryScanResult,
  FileContentResult,
  FileUpdateEvent,
  FileWatchErrorEvent,
  LogFileMetadata,
  PathScanIssue,
} from '@shared/contracts/files';

const MAX_ACTIVITY_SAMPLES = 240;

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

export interface WatchingFileState {
  offset: number;
  startedAt: string;
  lastUpdateAt: string | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
  updateCount: number;
  bytesRead: number;
  alreadyWatching: boolean;
}

interface LastFileUpdate {
  filePath: string;
  bytesRead: number;
  changedAt: string;
  changeType: FileUpdateEvent['changeType'];
}

export interface ViewerPreferences {
  autoScroll: boolean;
  lineWrap: boolean;
  showLineNumbers: boolean;
  filterToMatches: boolean;
  compactMode: boolean;
  collapseRepeatedLogs: boolean;
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

export interface RecentSourceItem {
  path: string;
  name: string;
  kind: 'file' | 'directory';
  lastOpenedAt: string;
}

export interface ActivitySample {
  filePath: string;
  receivedAt: string;
  bytesRead: number;
  lineCount: number;
}

export interface WorkspacePreferencesSnapshot {
  themeMode: ThemeMode;
  isSidebarVisible: boolean;
  isExplorerVisible: boolean;
  isLogViewerExpanded: boolean;
  preferences: ViewerPreferences;
  recentSources: RecentSourceItem[];
  searchHistory: string[];
}

interface FileMonitorState {
  directories: DirectoryScanResult[];
  filesByPath: Record<string, LogFileMetadata>;
  selectedFilePath: string | null;
  scanIssues: PathScanIssue[];
  documentsByPath: Record<string, LoadedFileDocument>;
  watchingFiles: Record<string, WatchingFileState>;
  openTabs: OpenLogTab[];
  recentSources: RecentSourceItem[];
  activitySamples: ActivitySample[];
  searchQuery: string;
  searchHistory: string[];
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
  openRecentSource: (path: string) => Promise<void>;
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
  toggleCompactMode: () => void;
  toggleCollapseRepeatedLogs: () => void;
  toggleSeverityFilter: (severity: LogSeverity) => void;
  resetLogFilters: () => void;
  saveCurrentSearch: () => void;
  exportWorkspacePreferences: () => string;
  importWorkspacePreferences: (rawValue: string) => void;
  closeTab: (filePath: string) => void;
  removeFile: (filePath: string) => void;
  removeDirectory: (dirPath: string) => void;
  pinTab: (filePath: string) => void;
  setTabScrollPosition: (filePath: string, scrollTop: number) => void;
  restoreWorkspace: () => void;
  clearWorkspaceHistory: () => void;
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

const createDefaultPreferences = (): ViewerPreferences => {
  return {
    autoScroll: true,
    lineWrap: true,
    showLineNumbers: true,
    filterToMatches: false,
    compactMode: false,
    collapseRepeatedLogs: true,
    severityFilters: createEnabledSeverityFilters(),
  };
};

const mergePreferencesWithDefaults = (
  userPrefs: Partial<ViewerPreferences> | null | undefined,
): ViewerPreferences => {
  const defaults = createDefaultPreferences();
  if (!userPrefs) return defaults;
  return {
    ...defaults,
    ...userPrefs,
    severityFilters: {
      ...defaults.severityFilters,
      ...(userPrefs.severityFilters || {}),
    },
  };
};

export const useFileMonitorStore = create<FileMonitorState>((set, get) => ({
  // Local/Legacy States synced from modular stores
  directories: [],
  filesByPath: {},
  selectedFilePath: null,
  scanIssues: [],
  documentsByPath: {},
  watchingFiles: {},
  openTabs: [],
  recentSources: [],
  activitySamples: [],
  searchQuery: '',
  searchHistory: [],
  activeSearchMatchIndex: 0,
  preferences: createDefaultPreferences(),
  themeMode: 'light',
  isSettingsOpen: false,
  isSidebarVisible: true,
  isExplorerVisible: true,
  isLogViewerExpanded: false,
  statusMessage: null,
  errorMessage: null,
  pendingOperations: 0,
  lastUpdate: null,

  // Delegated Actions
  selectFilesFromDialog: async (): Promise<void> => {
    await useWorkspaceStore.getState().selectFilesFromDialog(async (path) => {
      return get().loadFile(path);
    });
  },

  selectDirectoryFromDialog: async (): Promise<void> => {
    await useWorkspaceStore.getState().selectDirectoryFromDialog();
  },

  scanDroppedFiles: async (files: File[]): Promise<void> => {
    await useWorkspaceStore.getState().scanDroppedFiles(files, async (path) => {
      return get().loadFile(path);
    });
  },

  openRecentSource: async (path: string): Promise<void> => {
    await useWorkspaceStore.getState().openRecentSource(path, async (filePath) => {
      return get().loadFile(filePath);
    });
  },

  selectFile: async (filePath: string): Promise<void> => {
    useSettingsStore.getState().closeAdvancedSettings();
    await useViewerStore.getState().selectFile(filePath, (path) => {
      useWorkspaceStore.getState().upsertOpenTab(path);
    });
    if (!get().documentsByPath[filePath]) {
      await get().loadFile(filePath);
    }
  },

  loadFile: async (filePath: string): Promise<FileContentResult | null> => {
    return useViewerStore.getState().loadFile(filePath, (res) => {
      useWorkspaceStore.getState().registerFiles([res.file], async () => {});
    });
  },

  startWatching: async (filePath: string): Promise<void> => {
    await useWatcherStore.getState().startWatching(
      filePath,
      () => useViewerStore.getState().documentsByPath[filePath]?.nextOffset,
      async () => {
        if (!get().documentsByPath[filePath]) {
          await get().loadFile(filePath);
        }
      },
    );
  },

  stopWatching: async (filePath: string): Promise<void> => {
    await useWatcherStore.getState().stopWatching(filePath);
  },

  stopAllWatching: async (): Promise<void> => {
    await useWatcherStore.getState().stopAllWatching();
  },

  applyFileUpdate: (event: FileUpdateEvent): void => {
    queueFileUpdate(set, event);
  },

  applyWatchError: (event: FileWatchErrorEvent): void => {
    useWatcherStore.getState().applyWatchError(event);
    set({
      errorMessage: `${event.filePath}: ${event.message}`,
    });
  },

  clearActiveView: (): void => {
    useViewerStore.getState().clearActiveView();
  },

  copyTextToClipboard: async (text: string): Promise<void> => {
    if (text.length === 0) {
      set({ statusMessage: 'There is no visible log content to copy.' });
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      set({ statusMessage: 'Copied visible logs to clipboard.' });
    } catch (error) {
      set({ errorMessage: error instanceof Error ? error.message : 'Unable to copy.' });
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
  },

  reloadApplicationWindow: async (): Promise<void> => {
    await window.desktop.app.reloadWindow();
  },

  setSearchQuery: (query: string): void => {
    useSearchStore.getState().setSearchQuery(query);
  },

  selectNextSearchMatch: (): void => {
    useSearchStore.getState().selectNextSearchMatch();
  },

  selectPreviousSearchMatch: (): void => {
    useSearchStore.getState().selectPreviousSearchMatch();
  },

  setThemeMode: (themeMode: ThemeMode): void => {
    useSettingsStore.getState().setTheme(themeMode);
  },

  toggleSettingsPanel: (): void => {
    useSettingsStore.getState().toggleSettingsPanel();
  },

  closeSettingsPanel: (): void => {
    useSettingsStore.getState().closeSettingsPanel();
  },

  toggleSidebarVisibility: (): void => {
    set((state) => ({
      isSidebarVisible: !state.isSidebarVisible,
      statusMessage: state.isSidebarVisible ? 'Sidebar hidden.' : 'Sidebar shown.',
    }));
  },

  toggleExplorerVisibility: (): void => {
    set((state) => ({
      isExplorerVisible: !state.isExplorerVisible,
      statusMessage: state.isExplorerVisible ? 'File explorer hidden.' : 'File explorer shown.',
    }));
  },

  toggleLogViewerExpanded: (): void => {
    set((state) => ({
      isLogViewerExpanded: !state.isLogViewerExpanded,
      isSettingsOpen: false,
      statusMessage: state.isLogViewerExpanded
        ? 'Exited focused log view.'
        : 'Entered focused log view.',
    }));
  },

  toggleAutoScroll: (): void => {
    useSettingsStore.getState().toggleAutoScroll();
  },

  toggleLineWrap: (): void => {
    useSettingsStore.getState().toggleLineWrap();
  },

  toggleLineNumbers: (): void => {
    useSettingsStore.getState().toggleLineNumbers();
  },

  toggleFilterToMatches: (): void => {
    useSettingsStore.getState().toggleFilterToMatches();
  },

  toggleCompactMode: (): void => {
    useSettingsStore.getState().toggleCompactMode();
  },

  toggleCollapseRepeatedLogs: (): void => {
    useSettingsStore.getState().toggleCollapseRepeatedLogs();
  },

  toggleSeverityFilter: (severity: LogSeverity): void => {
    useSettingsStore.getState().toggleSeverityFilter(severity);
  },

  resetLogFilters: (): void => {
    useSettingsStore.getState().resetLogFilters();
    useSearchStore.getState().setSearchQuery('');
    set({ statusMessage: 'Log filters reset.' });
  },

  saveCurrentSearch: (): void => {
    useSearchStore.getState().saveCurrentSearch();
  },

  exportWorkspacePreferences: (): string => {
    const state = get();
    const snapshot = {
      themeMode: state.themeMode,
      isSidebarVisible: state.isSidebarVisible,
      isExplorerVisible: state.isExplorerVisible,
      isLogViewerExpanded: state.isLogViewerExpanded,
      preferences: state.preferences,
      recentSources: state.recentSources,
      searchHistory: state.searchHistory,
    };
    return JSON.stringify(snapshot, null, 2);
  },

  importWorkspacePreferences: (rawValue: string): void => {
    try {
      const parsed = JSON.parse(rawValue);
      useSettingsStore.setState({
        theme: parsed.themeMode === 'dark' ? 'dark' : 'light',
        preferences: mergePreferencesWithDefaults(parsed.preferences),
      });
      useWorkspaceStore.setState({
        recentSources: parsed.recentSources ?? [],
      });
      useSearchStore.setState({
        searchHistory: parsed.searchHistory ?? [],
      });
      set({
        isSidebarVisible: parsed.isSidebarVisible ?? true,
        isExplorerVisible: parsed.isExplorerVisible ?? true,
        isLogViewerExpanded: parsed.isLogViewerExpanded ?? false,
        statusMessage: 'Workspace preferences imported.',
      });
    } catch (error) {
      set({ errorMessage: 'Unable to import preferences.' });
    }
  },

  closeTab: (filePath: string): void => {
    useWorkspaceStore.getState().closeTab(filePath, get().selectedFilePath, (path) => {
      set({ selectedFilePath: path });
    });
  },

  removeFile: (filePath: string): void => {
    void useWatcherStore.getState().stopWatching(filePath);
    useViewerStore.getState().removeFileState(filePath);
    useWorkspaceStore.getState().removeFile(filePath, get().selectedFilePath, (path) => {
      if (path) {
        void get().selectFile(path);
      } else {
        useViewerStore.setState({ selectedFilePath: null });
      }
    });
  },

  removeDirectory: (dirPath: string): void => {
    const directory = useWorkspaceStore.getState().directories.find((d) => d.root.path === dirPath);
    if (directory) {
      const getAllFilePaths = (node: any): string[] => {
        const paths = node.files.map((f: any) => f.path);
        const childPaths = node.children.flatMap((child: any) =>
          child.kind === 'directory' ? getAllFilePaths(child) : [child.path],
        );
        return [...paths, ...childPaths];
      };
      const filePathsToRemove = getAllFilePaths(directory.root);
      for (const filePath of filePathsToRemove) {
        void useWatcherStore.getState().stopWatching(filePath);
        useViewerStore.getState().removeFileState(filePath);
      }
    }

    useWorkspaceStore.getState().removeDirectory(dirPath, get().selectedFilePath, (path) => {
      if (path) {
        void get().selectFile(path);
      } else {
        useViewerStore.setState({ selectedFilePath: null });
      }
    });
  },

  pinTab: (filePath: string): void => {
    useWorkspaceStore.getState().pinTab(filePath);
  },

  setTabScrollPosition: (filePath: string, scrollTop: number): void => {
    useWorkspaceStore.getState().setTabScrollPosition(filePath, scrollTop);
  },

  restoreWorkspace: (): void => {
    const raw = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (!raw) return;

    try {
      const persisted = JSON.parse(raw);
      useSettingsStore.setState({
        theme: persisted.themeMode ?? 'light',
        preferences: mergePreferencesWithDefaults(persisted.preferences),
      });
      useSearchStore.setState({
        searchHistory: persisted.searchHistory ?? [],
        searchQuery: persisted.searchQuery ?? '',
      });
      set({
        selectedFilePath: persisted.selectedFilePath,
        isSidebarVisible: persisted.isSidebarVisible ?? true,
        isExplorerVisible: persisted.isExplorerVisible ?? true,
        isLogViewerExpanded: persisted.isLogViewerExpanded ?? false,
      });
      useWorkspaceStore.getState().restoreWorkspaceState(
        persisted,
        async (path) => get().loadFile(path),
        async (path) => get().startWatching(path),
      );
    } catch {
      // ignore
    }
  },

  clearWorkspaceHistory: (): void => {
    useWorkspaceStore.getState().clearWorkspaceHistory();
    useSearchStore.getState().clearSearchHistory();
    set({ statusMessage: 'Workspace history cleared.' });
  },
}));

// Set up two-way subscription syncs to make modular stores work in absolute harmony with the legacy store
useSettingsStore.subscribe((settingsState) => {
  useFileMonitorStore.setState({
    themeMode: settingsState.theme,
    isSettingsOpen: settingsState.isSettingsOpen,
    preferences: settingsState.preferences,
  });
});

useWatcherStore.subscribe((watcherState) => {
  useFileMonitorStore.setState({
    watchingFiles: watcherState.watchingFiles,
  });
});

useSearchStore.subscribe((searchState) => {
  useFileMonitorStore.setState({
    searchQuery: searchState.searchQuery,
    searchHistory: searchState.searchHistory,
    activeSearchMatchIndex: searchState.activeSearchMatchIndex,
  });
});

useViewerStore.subscribe((viewerState) => {
  useFileMonitorStore.setState({
    selectedFilePath: viewerState.selectedFilePath,
    documentsByPath: viewerState.documentsByPath,
    errorMessage: viewerState.errorMessage,
    statusMessage: viewerState.statusMessage,
  });
});

useWorkspaceStore.subscribe((workspaceState) => {
  useFileMonitorStore.setState({
    directories: workspaceState.directories,
    filesByPath: workspaceState.filesByPath,
    openTabs: workspaceState.openTabs,
    recentSources: workspaceState.recentSources,
    scanIssues: workspaceState.scanIssues,
  });
});

// Performance optimization: batch updates using animation frame queue
let queuedFileUpdates: FileUpdateEvent[] = [];
let isFileUpdateFlushScheduled = false;

const queueFileUpdate = (set: any, event: FileUpdateEvent): void => {
  queuedFileUpdates = [...queuedFileUpdates, event];

  if (isFileUpdateFlushScheduled) {
    return;
  }

  isFileUpdateFlushScheduled = true;

  const flushQueuedUpdates = (): void => {
    const events = queuedFileUpdates;
    queuedFileUpdates = [];
    isFileUpdateFlushScheduled = false;

    if (events.length > 0) {
      applyQueuedFileUpdates(set, events);
    }
  };

  window.requestAnimationFrame(flushQueuedUpdates);
};

const applyQueuedFileUpdates = (set: any, events: FileUpdateEvent[]): void => {
  const state = useFileMonitorStore.getState();
  const activitySamples = [...state.activitySamples];
  let lastUpdate: LastFileUpdate | null = state.lastUpdate;

  for (const event of events) {
    useViewerStore
      .getState()
      .applyFileUpdate(
        event.filePath,
        event.content,
        event.bytesRead,
        event.previousOffset,
        event.nextOffset,
        event.sizeBytes,
        event.changedAt,
        event.changeType,
      );
    useWorkspaceStore
      .getState()
      .updateFileMetadata(event.filePath, event.sizeBytes, event.changedAt);
    useWorkspaceStore
      .getState()
      .updateOpenTabsUnread(event.filePath, state.selectedFilePath, countNewLines(event.content));
    useWatcherStore
      .getState()
      .updateWatcherOffset(event.filePath, event.nextOffset, event.bytesRead, event.changedAt);

    useActivityStore.getState().appendSample({
      sourceId: event.filePath,
      receivedAt: event.changedAt,
      bytesRead: event.bytesRead,
      lineCount: countNewLines(event.content),
    });

    activitySamples.push({
      filePath: event.filePath,
      receivedAt: event.changedAt,
      bytesRead: event.bytesRead,
      lineCount: countNewLines(event.content),
    });

    lastUpdate = {
      filePath: event.filePath,
      bytesRead: event.bytesRead,
      changedAt: event.changedAt,
      changeType: event.changeType,
    };
  }

  set({
    activitySamples: activitySamples.slice(-MAX_ACTIVITY_SAMPLES),
    lastUpdate,
  });
};

const countNewLines = (content: string): number => {
  if (content.length === 0) {
    return 0;
  }
  return content.endsWith('\n') ? content.split(/\r?\n/).length - 1 : content.split(/\r?\n/).length;
};

// Workspace Persistence Auto-save on subscribe
let lastPersistedWorkspaceSignature = '';

const writePersistedWorkspace = (state: FileMonitorState): void => {
  const workspaceState = {
    selectedFilePath: state.selectedFilePath,
    openTabs: state.openTabs,
    watchedFilePaths: Object.keys(state.watchingFiles),
    recentSources: state.recentSources,
    searchHistory: state.searchHistory,
    themeMode: state.themeMode,
    isSidebarVisible: state.isSidebarVisible,
    isExplorerVisible: state.isExplorerVisible,
    isLogViewerExpanded: state.isLogViewerExpanded,
    searchQuery: state.searchQuery,
    preferences: state.preferences,
  };
  const serializedWorkspace = JSON.stringify(workspaceState);

  if (serializedWorkspace === lastPersistedWorkspaceSignature) {
    return;
  }

  lastPersistedWorkspaceSignature = serializedWorkspace;

  try {
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, serializedWorkspace);
  } catch {
    // ignore
  }
};

useFileMonitorStore.subscribe((state) => {
  writePersistedWorkspace(state);
});
