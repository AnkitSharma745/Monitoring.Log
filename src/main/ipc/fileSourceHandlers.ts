import { BrowserWindow, ipcMain } from 'electron';

import { FILE_IPC_CHANNELS } from '@shared/ipc/fileChannels';
import { IpcValidationError, ipcSuccess, toIpcFailure } from './ipcResponse';

import type { DirectoryScanner } from '@main/filesystem/directoryScanner';
import type { FileDialogService } from '@main/filesystem/fileDialogService';
import type { FileReaderService } from '@main/filesystem/fileReader';
import type { PathScanner } from '@main/filesystem/pathScanner';
import type { FileWatcherService } from '@main/watchers/fileWatcherService';
import type {
  DirectoryPickerResult,
  DirectoryScanResult,
  FileContentResult,
  FilePickerResult,
  PathScanResult,
  ReadFileRequest,
  StopWatchingFileRequest,
  StopWatchingFileResult,
  WatchFileRequest,
  WatchFileResult,
} from '@shared/contracts/files';
import type { Logger } from 'winston';

export interface FileSourceIpcServices {
  dialogs: FileDialogService;
  directoryScanner: DirectoryScanner;
  pathScanner: PathScanner;
  reader: FileReaderService;
  watcher: FileWatcherService;
}

export const registerFileSourceIpcHandlers = (
  services: FileSourceIpcServices,
  logger: Logger,
): void => {
  ipcMain.handle(FILE_IPC_CHANNELS.selectFiles, async (event) => {
    try {
      logger.info('Received file selection IPC request.');
      const result = await services.dialogs.selectFiles(
        BrowserWindow.fromWebContents(event.sender),
      );
      return ipcSuccess<FilePickerResult>(result);
    } catch (error) {
      logger.error('File selection IPC request failed.', { error });
      return toIpcFailure<FilePickerResult>(error);
    }
  });

  ipcMain.handle(FILE_IPC_CHANNELS.selectDirectory, async (event) => {
    try {
      logger.info('Received directory selection IPC request.');
      const result = await services.dialogs.selectDirectory(
        BrowserWindow.fromWebContents(event.sender),
      );
      return ipcSuccess<DirectoryPickerResult>(result);
    } catch (error) {
      logger.error('Directory selection IPC request failed.', { error });
      return toIpcFailure<DirectoryPickerResult>(error);
    }
  });

  ipcMain.handle(FILE_IPC_CHANNELS.scanPaths, async (_event, payload: unknown) => {
    try {
      const paths = validatePathArray(payload);
      logger.info('Received path scan IPC request.', { pathCount: paths.length });
      const result = await services.pathScanner.scanPaths(paths);
      return ipcSuccess<PathScanResult>(result);
    } catch (error) {
      logger.error('Path scan IPC request failed.', { error });
      return toIpcFailure<PathScanResult>(error);
    }
  });

  ipcMain.handle(FILE_IPC_CHANNELS.scanDirectory, async (_event, payload: unknown) => {
    try {
      const directoryPath = validatePath(payload, 'directoryPath');
      logger.info('Received directory scan IPC request.', { directoryPath });
      const result = await services.directoryScanner.scan(directoryPath);
      return ipcSuccess<DirectoryScanResult>(result);
    } catch (error) {
      logger.error('Directory scan IPC request failed.', { error });
      return toIpcFailure<DirectoryScanResult>(error);
    }
  });

  ipcMain.handle(FILE_IPC_CHANNELS.readFile, async (_event, payload: unknown) => {
    try {
      const request = validateReadFileRequest(payload);
      logger.info('Received read file IPC request.', { filePath: request.filePath });
      const result = await services.reader.readInitialContent(request);
      return ipcSuccess<FileContentResult>(result);
    } catch (error) {
      logger.error('Read file IPC request failed.', { error });
      return toIpcFailure<FileContentResult>(error);
    }
  });

  ipcMain.handle(FILE_IPC_CHANNELS.startWatching, async (_event, payload: unknown) => {
    try {
      const request = validateWatchFileRequest(payload);
      logger.info('Received start watcher IPC request.', { filePath: request.filePath });
      const result = await services.watcher.startWatching(request);
      return ipcSuccess<WatchFileResult>(result);
    } catch (error) {
      logger.error('Start watcher IPC request failed.', { error });
      return toIpcFailure<WatchFileResult>(error);
    }
  });

  ipcMain.handle(FILE_IPC_CHANNELS.stopWatching, async (_event, payload: unknown) => {
    try {
      const request = validateStopWatchingFileRequest(payload);
      logger.info('Received stop watcher IPC request.', { filePath: request.filePath });
      const result = await services.watcher.stopWatching(request.filePath);
      return ipcSuccess<StopWatchingFileResult>(result);
    } catch (error) {
      logger.error('Stop watcher IPC request failed.', { error });
      return toIpcFailure<StopWatchingFileResult>(error);
    }
  });
};

const validatePathArray = (payload: unknown): string[] => {
  if (!Array.isArray(payload)) {
    throw new IpcValidationError('INVALID_PATHS', 'Expected an array of paths.');
  }

  const paths = payload.map((item) => validatePath(item, 'path'));

  if (paths.length === 0) {
    throw new IpcValidationError('EMPTY_PATHS', 'At least one path is required.');
  }

  return paths;
};

const validateReadFileRequest = (payload: unknown): ReadFileRequest => {
  const record = validateRecord(payload, 'read file request');
  const filePath = validatePath(record['filePath'], 'filePath');
  const maxBytes = record['maxBytes'];

  if (maxBytes !== undefined && typeof maxBytes !== 'number') {
    throw new IpcValidationError('INVALID_MAX_BYTES', 'maxBytes must be a number.');
  }

  return typeof maxBytes === 'number' ? { filePath, maxBytes } : { filePath };
};

const validateWatchFileRequest = (payload: unknown): WatchFileRequest => {
  const record = validateRecord(payload, 'watch file request');
  const filePath = validatePath(record['filePath'], 'filePath');
  const startOffset = record['startOffset'];

  if (startOffset !== undefined && typeof startOffset !== 'number') {
    throw new IpcValidationError('INVALID_START_OFFSET', 'startOffset must be a number.');
  }

  return typeof startOffset === 'number' ? { filePath, startOffset } : { filePath };
};

const validateStopWatchingFileRequest = (payload: unknown): StopWatchingFileRequest => {
  const record = validateRecord(payload, 'stop watcher request');
  return {
    filePath: validatePath(record['filePath'], 'filePath'),
  };
};

const validatePath = (value: unknown, fieldName: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new IpcValidationError('INVALID_PATH', `${fieldName} must be a non-empty string.`);
  }

  return value;
};

const validateRecord = (payload: unknown, label: string): Record<string, unknown> => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new IpcValidationError('INVALID_PAYLOAD', `Expected ${label} payload.`);
  }

  return payload as Record<string, unknown>;
};
