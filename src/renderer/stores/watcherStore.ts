import { create } from 'zustand';

import { unwrapIpcResponse } from '@renderer/ipc/unwrapIpcResponse';
import type { FileWatchErrorEvent } from '@shared/contracts/files';

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

interface WatcherStoreState {
  watchingFiles: Record<string, WatchingFileState>;
  startWatching: (
    filePath: string,
    getNextOffset: () => number | undefined,
    loadFileIfNeeded: () => Promise<void>,
  ) => Promise<void>;
  stopWatching: (filePath: string) => Promise<void>;
  stopAllWatching: () => Promise<void>;
  applyWatchError: (event: FileWatchErrorEvent) => void;
  updateWatcherOffset: (
    filePath: string,
    nextOffset: number,
    bytesRead: number,
    changedAt: string,
  ) => void;
}

export const useWatcherStore = create<WatcherStoreState>((set, get) => ({
  watchingFiles: {},

  startWatching: async (filePath, getNextOffset, loadFileIfNeeded): Promise<void> => {
    if (get().watchingFiles[filePath]) {
      return;
    }

    try {
      await loadFileIfNeeded();
      const nextOffset = getNextOffset();

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
            lastUpdateAt: null,
            lastErrorAt: null,
            lastErrorMessage: null,
            updateCount: 0,
            bytesRead: 0,
            alreadyWatching: result.alreadyWatching,
          },
        },
      }));
    } catch (error) {
      window.desktop.logging.log('error', 'Unable to start watcher.', 'watcherStore.ts', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },

  stopWatching: async (filePath): Promise<void> => {
    try {
      const result = unwrapIpcResponse(await window.desktop.files.stopWatching({ filePath }));

      set((state) => {
        const watchingFiles = { ...state.watchingFiles };
        delete watchingFiles[result.filePath];

        return {
          watchingFiles,
        };
      });
    } catch (error) {
      window.desktop.logging.log('error', 'Unable to stop watcher.', 'watcherStore.ts', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },

  stopAllWatching: async (): Promise<void> => {
    const watchedPaths = Object.keys(get().watchingFiles);

    if (watchedPaths.length === 0) {
      return;
    }

    try {
      await Promise.all(
        watchedPaths.map(async (filePath) =>
          unwrapIpcResponse(await window.desktop.files.stopWatching({ filePath })),
        ),
      );

      set({
        watchingFiles: {},
      });
    } catch (error) {
      window.desktop.logging.log('error', 'Unable to stop all watchers.', 'watcherStore.ts', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },

  applyWatchError: (event): void => {
    set((state) => {
      const watcher = state.watchingFiles[event.filePath];

      return {
        watchingFiles: watcher
          ? {
              ...state.watchingFiles,
              [event.filePath]: {
                ...watcher,
                lastErrorAt: event.occurredAt,
                lastErrorMessage: event.message,
              },
            }
          : state.watchingFiles,
      };
    });
  },

  updateWatcherOffset: (filePath, nextOffset, bytesRead, changedAt): void => {
    set((state) => {
      const watcher = state.watchingFiles[filePath];
      if (!watcher) return state;
      return {
        watchingFiles: {
          ...state.watchingFiles,
          [filePath]: {
            ...watcher,
            offset: nextOffset,
            lastUpdateAt: changedAt,
            lastErrorAt: null,
            lastErrorMessage: null,
            updateCount: watcher.updateCount + 1,
            bytesRead: watcher.bytesRead + bytesRead,
          },
        },
      };
    });
  },
}));
