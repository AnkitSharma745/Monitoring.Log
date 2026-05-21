import { create } from 'zustand';

import { unwrapIpcResponse } from '@renderer/ipc/unwrapIpcResponse';
import type {
  DirectoryScanResult,
  LogFileMetadata,
  PathScanIssue,
  DirectoryTreeNode,
} from '@shared/contracts/files';

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

interface WorkspaceStoreState {
  directories: DirectoryScanResult[];
  filesByPath: Record<string, LogFileMetadata>;
  openTabs: OpenLogTab[];
  recentSources: RecentSourceItem[];
  scanIssues: PathScanIssue[];
  pendingOperations: number;
  statusMessage: string | null;
  errorMessage: string | null;

  setPending: (pending: boolean) => void;
  setError: (msg: string | null) => void;
  setStatus: (msg: string | null) => void;

  selectFilesFromDialog: (loadFile: (path: string) => Promise<unknown>) => Promise<void>;
  selectDirectoryFromDialog: () => Promise<void>;
  scanDroppedFiles: (files: File[], loadFile: (path: string) => Promise<unknown>) => Promise<void>;
  openRecentSource: (path: string, loadFile: (path: string) => Promise<unknown>) => Promise<void>;

  registerFiles: (files: LogFileMetadata[], loadFile: (path: string) => Promise<unknown>) => void;
  registerDirectories: (
    directories: DirectoryScanResult[],
    loadFile: (path: string) => Promise<unknown>,
  ) => void;

  closeTab: (
    filePath: string,
    selectedFilePath: string | null,
    setSelectedFilePath: (path: string | null) => void,
  ) => void;
  removeFile: (
    filePath: string,
    selectedFilePath: string | null,
    setSelectedFilePath: (path: string | null) => void,
  ) => void;
  removeDirectory: (
    dirPath: string,
    selectedFilePath: string | null,
    setSelectedFilePath: (path: string | null) => void,
  ) => void;
  pinTab: (filePath: string) => void;
  setTabScrollPosition: (filePath: string, scrollTop: number) => void;
  upsertOpenTab: (filePath: string) => void;
  clearWorkspaceHistory: () => void;

  restoreWorkspaceState: (
    persisted: any,
    loadFile: (path: string) => Promise<unknown>,
    startWatching: (path: string) => Promise<void>,
  ) => void;
  updateOpenTabsUnread: (
    filePath: string,
    activeFilePath: string | null,
    newLinesCount: number,
  ) => void;
  updateFileMetadata: (filePath: string, sizeBytes: number, changedAt: string) => void;
}

const MAX_RECENT_ITEMS = 12;

export const useWorkspaceStore = create<WorkspaceStoreState>((set, get) => ({
  directories: [],
  filesByPath: {},
  openTabs: [],
  recentSources: [],
  scanIssues: [],
  pendingOperations: 0,
  statusMessage: null,
  errorMessage: null,

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

  selectFilesFromDialog: async (loadFile): Promise<void> => {
    set((state) => ({
      pendingOperations: state.pendingOperations + 1,
      statusMessage: null,
      errorMessage: null,
    }));

    try {
      const result = unwrapIpcResponse(await window.desktop.files.selectFiles());

      if (result.canceled) {
        set({ statusMessage: 'File selection canceled.' });
        return;
      }

      get().registerFiles(result.files, loadFile);
      set({ statusMessage: `Selected ${result.files.length} file(s).` });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to select files.';
      set({ errorMessage: message });
    } finally {
      set((state) => ({ pendingOperations: Math.max(0, state.pendingOperations - 1) }));
    }
  },

  selectDirectoryFromDialog: async (): Promise<void> => {
    set((state) => ({
      pendingOperations: state.pendingOperations + 1,
      statusMessage: null,
      errorMessage: null,
    }));

    try {
      const result = unwrapIpcResponse(await window.desktop.files.selectDirectory());

      if (result.canceled || !result.scan) {
        set({ statusMessage: 'Directory selection canceled.' });
        return;
      }

      get().registerDirectories([result.scan], async () => {});
      set({ statusMessage: `Discovered ${result.scan.files.length} file(s).` });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to select directory.';
      set({ errorMessage: message });
    } finally {
      set((state) => ({ pendingOperations: Math.max(0, state.pendingOperations - 1) }));
    }
  },

  scanDroppedFiles: async (files, loadFile): Promise<void> => {
    const paths = window.desktop.files.getDroppedPaths(files);

    if (paths.length === 0) {
      set({ statusMessage: 'No readable file paths were dropped.' });
      return;
    }

    set((state) => ({
      pendingOperations: state.pendingOperations + 1,
      statusMessage: null,
      errorMessage: null,
      scanIssues: [],
    }));

    try {
      const result = unwrapIpcResponse(await window.desktop.files.scanPaths(paths));
      const discoveredFileCount =
        result.files.length +
        result.directories.reduce((count, directory) => count + directory.files.length, 0);

      get().registerFiles(result.files, loadFile);
      get().registerDirectories(result.directories, loadFile);
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
      const message = error instanceof Error ? error.message : 'Unable to scan dropped paths.';
      set({ errorMessage: message });
    } finally {
      set((state) => ({ pendingOperations: Math.max(0, state.pendingOperations - 1) }));
    }
  },

  openRecentSource: async (path, loadFile): Promise<void> => {
    set((state) => ({
      pendingOperations: state.pendingOperations + 1,
      statusMessage: null,
      errorMessage: null,
    }));

    try {
      const result = unwrapIpcResponse(await window.desktop.files.scanPaths([path]));

      get().registerFiles(result.files, loadFile);
      get().registerDirectories(result.directories, loadFile);

      set({
        scanIssues: result.errors.map((issue) => ({
          path: issue.path,
          reason: issue.reason,
        })),
        statusMessage:
          result.files.length > 0 || result.directories.length > 0
            ? 'Recent source restored.'
            : 'Recent source is no longer available.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to open recent source.';
      set({ errorMessage: message });
    } finally {
      set((state) => ({ pendingOperations: Math.max(0, state.pendingOperations - 1) }));
    }
  },

  registerFiles: (incomingFiles, loadFile): void => {
    if (incomingFiles.length === 0) {
      return;
    }

    set((state) => {
      const filesByPath = { ...state.filesByPath };
      let openTabs = state.openTabs;
      let recentSources = state.recentSources;

      for (const file of incomingFiles) {
        filesByPath[file.path] = file;
        openTabs = upsertOpenTabList(openTabs, file.path);
        recentSources = upsertRecentSourceList(recentSources, {
          path: file.path,
          name: file.name,
          kind: 'file',
          lastOpenedAt: new Date().toISOString(),
        });
      }

      return {
        filesByPath,
        openTabs,
        recentSources,
      };
    });

    const firstFile = incomingFiles[0]?.path;
    if (firstFile) {
      void loadFile(firstFile);
    }
  },

  registerDirectories: (incomingDirectories, loadFile): void => {
    if (incomingDirectories.length === 0) {
      return;
    }

    set((state) => {
      const directoriesByPath = new Map(
        state.directories.map((directory) => [directory.root.path, directory]),
      );
      let recentSources = state.recentSources;

      for (const directory of incomingDirectories) {
        directoriesByPath.set(directory.root.path, directory);
        recentSources = upsertRecentSourceList(recentSources, {
          path: directory.root.path,
          name: directory.root.name,
          kind: 'directory',
          lastOpenedAt: new Date().toISOString(),
        });
      }

      return {
        directories: Array.from(directoriesByPath.values()).sort((left, right) =>
          left.root.path.localeCompare(right.root.path),
        ),
        recentSources,
      };
    });

    get().registerFiles(
      incomingDirectories.flatMap((directory) => directory.files),
      loadFile,
    );
  },

  closeTab: (filePath, selectedFilePath, setSelectedFilePath): void => {
    const tab = get().openTabs.find((item) => item.filePath === filePath);

    if (tab?.pinned) {
      set({ statusMessage: 'Pinned tabs stay open until unpinned.' });
      return;
    }

    set((state) => {
      const nextTabs = state.openTabs.filter((item) => item.filePath !== filePath);
      const nextSelected =
        selectedFilePath === filePath ? (nextTabs.at(-1)?.filePath ?? null) : selectedFilePath;

      setTimeout(() => setSelectedFilePath(nextSelected), 0);

      return {
        openTabs: nextTabs,
        statusMessage: 'Closed log tab.',
      };
    });
  },

  removeFile: (filePath, selectedFilePath, setSelectedFilePath): void => {
    set((state) => {
      const filesByPath = { ...state.filesByPath };
      delete filesByPath[filePath];

      const openTabs = state.openTabs.filter((tab) => tab.filePath !== filePath);
      const recentSources = state.recentSources.filter((src) => src.path !== filePath);

      const nextSelected =
        selectedFilePath === filePath ? (openTabs.at(-1)?.filePath ?? null) : selectedFilePath;

      setTimeout(() => setSelectedFilePath(nextSelected), 0);

      return {
        filesByPath,
        openTabs,
        recentSources,
        statusMessage: 'Removed file from workspace.',
      };
    });
  },

  removeDirectory: (dirPath, selectedFilePath, setSelectedFilePath): void => {
    set((state) => {
      const directory = state.directories.find((d) => d.root.path === dirPath);
      if (!directory) {
        return state;
      }

      // Collect all files under this directory tree recursively
      const getAllFilePaths = (node: DirectoryTreeNode): string[] => {
        const filePaths: string[] = [];
        for (const child of node.children) {
          if (child.kind === 'file') {
            filePaths.push(child.path);
          } else if (child.kind === 'directory') {
            filePaths.push(...getAllFilePaths(child));
          }
        }
        return filePaths;
      };

      const filePathsToRemove = new Set(getAllFilePaths(directory.root));

      const filesByPath = { ...state.filesByPath };
      for (const filePath of filePathsToRemove) {
        delete filesByPath[filePath];
      }

      const directories = state.directories.filter((d) => d.root.path !== dirPath);
      const openTabs = state.openTabs.filter((tab) => !filePathsToRemove.has(tab.filePath));
      const recentSources = state.recentSources.filter(
        (src) => src.path !== dirPath && !filePathsToRemove.has(src.path),
      );

      const nextSelected =
        selectedFilePath && filePathsToRemove.has(selectedFilePath)
          ? (openTabs.at(-1)?.filePath ?? null)
          : selectedFilePath;

      setTimeout(() => setSelectedFilePath(nextSelected), 0);

      return {
        directories,
        filesByPath,
        openTabs,
        recentSources,
        statusMessage: 'Removed directory from workspace.',
      };
    });
  },

  pinTab: (filePath): void => {
    set((state) => ({
      openTabs: state.openTabs.map((tab) =>
        tab.filePath === filePath ? { ...tab, pinned: !tab.pinned } : tab,
      ),
    }));
  },

  setTabScrollPosition: (filePath, scrollTop): void => {
    set((state) => ({
      openTabs: state.openTabs.map((tab) =>
        tab.filePath === filePath ? { ...tab, scrollTop } : tab,
      ),
    }));
  },

  upsertOpenTab: (filePath): void => {
    set((state) => ({
      openTabs: upsertOpenTabList(state.openTabs, filePath),
    }));
  },

  clearWorkspaceHistory: (): void => {
    set({
      recentSources: [],
      statusMessage: 'Workspace history cleared.',
    });
  },

  restoreWorkspaceState: (persisted, loadFile, startWatching): void => {
    set({
      openTabs: persisted.openTabs ?? [],
      recentSources: persisted.recentSources ?? [],
      statusMessage: 'Workspace restored.',
    });

    for (const filePath of persisted.watchedFilePaths ?? []) {
      void startWatching(filePath);
    }

    if (persisted.selectedFilePath) {
      void loadFile(persisted.selectedFilePath);
    }
  },

  updateOpenTabsUnread: (filePath, activeFilePath, newLinesCount): void => {
    set((state) => ({
      openTabs: upsertOpenTabList(state.openTabs, filePath).map((tab) =>
        tab.filePath === filePath
          ? {
              ...tab,
              unreadCount: activeFilePath === filePath ? 0 : tab.unreadCount + newLinesCount,
            }
          : tab,
      ),
    }));
  },

  updateFileMetadata: (filePath, sizeBytes, changedAt): void => {
    set((state) => {
      const file = state.filesByPath[filePath];
      if (!file) return state;
      return {
        filesByPath: {
          ...state.filesByPath,
          [filePath]: {
            ...file,
            sizeBytes,
            modifiedAt: changedAt,
          },
        },
      };
    });
  },
}));

const upsertOpenTabList = (tabs: OpenLogTab[], filePath: string): OpenLogTab[] => {
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

const upsertRecentSourceList = (
  recentSources: RecentSourceItem[],
  item: RecentSourceItem,
): RecentSourceItem[] => {
  return [item, ...recentSources.filter((source) => source.path !== item.path)].slice(
    0,
    MAX_RECENT_ITEMS,
  );
};
