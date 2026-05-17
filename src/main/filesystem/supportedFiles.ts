import { stat } from 'fs/promises';
import { basename, extname, resolve } from 'path';

import {
  SUPPORTED_LOG_FILE_EXTENSIONS,
  type LogFileMetadata,
  type SupportedLogFileExtension,
} from '@shared/contracts/files';

const supportedExtensions = new Set<string>(SUPPORTED_LOG_FILE_EXTENSIONS);

export class FileSourceError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'FileSourceError';
  }
}

export const toSupportedLogExtension = (filePath: string): SupportedLogFileExtension | null => {
  const extension = extname(filePath).toLowerCase();

  if (supportedExtensions.has(extension)) {
    return extension as SupportedLogFileExtension;
  }

  return null;
};

export const isSupportedLogFilePath = (filePath: string): boolean => {
  return toSupportedLogExtension(filePath) !== null;
};

export const createLogFileMetadata = async (filePath: string): Promise<LogFileMetadata> => {
  const resolvedPath = resolve(filePath);
  const extension = toSupportedLogExtension(resolvedPath);

  if (!extension) {
    throw new FileSourceError('UNSUPPORTED_FILE_TYPE', 'File type is not supported.');
  }

  const fileStat = await stat(resolvedPath);

  if (!fileStat.isFile()) {
    throw new FileSourceError('NOT_A_FILE', 'Path is not a file.');
  }

  return {
    name: basename(resolvedPath),
    path: resolvedPath,
    extension,
    sizeBytes: fileStat.size,
    modifiedAt: fileStat.mtime.toISOString(),
  };
};
