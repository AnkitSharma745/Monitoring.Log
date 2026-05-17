import { dialog, type BrowserWindow, type OpenDialogOptions } from 'electron';

import {
  SUPPORTED_LOG_FILE_EXTENSIONS,
  type DirectoryPickerResult,
  type FilePickerResult,
} from '@shared/contracts/files';
import { createLogFileMetadata } from './supportedFiles';

import type { DirectoryScanner } from './directoryScanner';
import type { Logger } from 'winston';

const supportedDialogExtensions = SUPPORTED_LOG_FILE_EXTENSIONS.map((extension) =>
  extension.slice(1),
);

export class FileDialogService {
  public constructor(
    private readonly directoryScanner: DirectoryScanner,
    private readonly logger: Logger,
  ) {}

  public async selectFiles(owner: BrowserWindow | null): Promise<FilePickerResult> {
    const result = await this.showOpenDialog(owner, {
      title: 'Select log files',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Log and text files', extensions: supportedDialogExtensions }],
    });

    if (result.canceled) {
      this.logger.info('File selection canceled.');
      return { canceled: true, files: [] };
    }

    const files = await Promise.all(
      result.filePaths.map((filePath) => createLogFileMetadata(filePath)),
    );

    this.logger.info('Selected files.', {
      fileCount: files.length,
      filePaths: files.map((file) => file.path),
    });

    return { canceled: false, files };
  }

  public async selectDirectory(owner: BrowserWindow | null): Promise<DirectoryPickerResult> {
    const result = await this.showOpenDialog(owner, {
      title: 'Select log directory',
      properties: ['openDirectory'],
    });

    if (result.canceled || !result.filePaths[0]) {
      this.logger.info('Directory selection canceled.');
      return { canceled: true, scan: null };
    }

    const directoryPath = result.filePaths[0];
    const scan = await this.directoryScanner.scan(directoryPath);

    this.logger.info('Selected directory.', {
      directoryPath,
      fileCount: scan.files.length,
    });

    return { canceled: false, scan };
  }

  private showOpenDialog(
    owner: BrowserWindow | null,
    options: OpenDialogOptions,
  ): ReturnType<typeof dialog.showOpenDialog> {
    if (owner) {
      return dialog.showOpenDialog(owner, options);
    }

    return dialog.showOpenDialog(options);
  }
}
