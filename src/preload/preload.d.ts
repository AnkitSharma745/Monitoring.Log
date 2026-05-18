import type {
  DirectoryPickerResult,
  DirectoryScanResult,
  FileContentResult,
  FilePickerResult,
  FileUpdateEvent,
  FileWatchErrorEvent,
  PathScanResult,
  ReadFileRequest,
  StopWatchingFileRequest,
  StopWatchingFileResult,
  WatchFileRequest,
  WatchFileResult,
} from '@shared/contracts/files';
import type { IpcResponse } from '@shared/contracts/ipc';

type RendererLogLevel = 'error' | 'warn' | 'info' | 'debug';

export interface DesktopApi {
  app: {
    reloadWindow: () => Promise<void>;
  };
  files: {
    selectFiles: () => Promise<IpcResponse<FilePickerResult>>;
    selectDirectory: () => Promise<IpcResponse<DirectoryPickerResult>>;
    scanPaths: (paths: string[]) => Promise<IpcResponse<PathScanResult>>;
    scanDirectory: (directoryPath: string) => Promise<IpcResponse<DirectoryScanResult>>;
    readFile: (request: ReadFileRequest) => Promise<IpcResponse<FileContentResult>>;
    startWatching: (request: WatchFileRequest) => Promise<IpcResponse<WatchFileResult>>;
    stopWatching: (
      request: StopWatchingFileRequest,
    ) => Promise<IpcResponse<StopWatchingFileResult>>;
    onFileUpdated: (callback: (event: FileUpdateEvent) => void) => () => void;
    onWatchError: (callback: (event: FileWatchErrorEvent) => void) => () => void;
    getDroppedPaths: (files: File[]) => string[];
  };
  logging: {
    log: (level: RendererLogLevel, message: string, fileName: string, data?: unknown) => void;
  };
}

declare global {
  interface Window {
    desktop: DesktopApi;
  }
}

export {};
