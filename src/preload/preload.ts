import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron';

import {
  type DirectoryPickerResult,
  type DirectoryScanResult,
  type FileContentResult,
  type FilePickerResult,
  type FileUpdateEvent,
  type FileWatchErrorEvent,
  type PathScanResult,
  type ReadFileRequest,
  type StopWatchingFileRequest,
  type StopWatchingFileResult,
  type WatchFileRequest,
  type WatchFileResult,
} from '@shared/contracts/files';
import { type IpcResponse } from '@shared/contracts/ipc';
import { APP_IPC_CHANNELS } from '@shared/ipc/appChannels';
import { FILE_IPC_CHANNELS } from '@shared/ipc/fileChannels';

type RendererLogLevel = 'error' | 'warn' | 'info' | 'debug';

type FileUpdateCallback = (event: FileUpdateEvent) => void;
type FileWatchErrorCallback = (event: FileWatchErrorEvent) => void;

const invokeFileChannel = <T>(channel: string, payload?: unknown): Promise<IpcResponse<T>> => {
  if (payload === undefined) {
    return ipcRenderer.invoke(channel) as Promise<IpcResponse<T>>;
  }

  return ipcRenderer.invoke(channel, payload) as Promise<IpcResponse<T>>;
};

const desktop = {
  app: {
    reloadWindow: (): Promise<void> =>
      ipcRenderer.invoke(APP_IPC_CHANNELS.reloadWindow) as Promise<void>,
  },
  files: {
    selectFiles: (): Promise<IpcResponse<FilePickerResult>> =>
      invokeFileChannel<FilePickerResult>(FILE_IPC_CHANNELS.selectFiles),
    selectDirectory: (): Promise<IpcResponse<DirectoryPickerResult>> =>
      invokeFileChannel<DirectoryPickerResult>(FILE_IPC_CHANNELS.selectDirectory),
    scanPaths: (paths: string[]): Promise<IpcResponse<PathScanResult>> =>
      invokeFileChannel<PathScanResult>(FILE_IPC_CHANNELS.scanPaths, paths),
    scanDirectory: (directoryPath: string): Promise<IpcResponse<DirectoryScanResult>> =>
      invokeFileChannel<DirectoryScanResult>(FILE_IPC_CHANNELS.scanDirectory, directoryPath),
    readFile: (request: ReadFileRequest): Promise<IpcResponse<FileContentResult>> =>
      invokeFileChannel<FileContentResult>(FILE_IPC_CHANNELS.readFile, request),
    startWatching: (request: WatchFileRequest): Promise<IpcResponse<WatchFileResult>> =>
      invokeFileChannel<WatchFileResult>(FILE_IPC_CHANNELS.startWatching, request),
    stopWatching: (
      request: StopWatchingFileRequest,
    ): Promise<IpcResponse<StopWatchingFileResult>> =>
      invokeFileChannel<StopWatchingFileResult>(FILE_IPC_CHANNELS.stopWatching, request),
    onFileUpdated: (callback: FileUpdateCallback): (() => void) => {
      const listener = (_event: IpcRendererEvent, update: FileUpdateEvent): void => {
        callback(update);
      };

      ipcRenderer.on(FILE_IPC_CHANNELS.fileUpdated, listener);

      return () => {
        ipcRenderer.removeListener(FILE_IPC_CHANNELS.fileUpdated, listener);
      };
    },
    onWatchError: (callback: FileWatchErrorCallback): (() => void) => {
      const listener = (_event: IpcRendererEvent, update: FileWatchErrorEvent): void => {
        callback(update);
      };

      ipcRenderer.on(FILE_IPC_CHANNELS.watchError, listener);

      return () => {
        ipcRenderer.removeListener(FILE_IPC_CHANNELS.watchError, listener);
      };
    },
    getDroppedPaths: (files: File[]): string[] => {
      return files
        .map((file) => webUtils.getPathForFile(file))
        .filter((filePath) => filePath.length > 0);
    },
  },
  logging: {
    log: (level: RendererLogLevel, message: string, fileName: string, data?: unknown): void => {
      ipcRenderer.send('log-message', { level, message, fileName, data });
    },
  },
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('desktop', desktop);
  } catch (error) {
    console.error('Preload contextBridge error:', error);
  }
} else {
  Object.defineProperty(window, 'desktop', {
    value: desktop,
  });
}
