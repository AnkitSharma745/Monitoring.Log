import { readdir, stat } from 'fs/promises';
import { basename, join, resolve } from 'path';

import {
  type DirectoryScanResult,
  type DirectoryTreeNode,
  type FileTreeNode,
} from '@shared/contracts/files';
import { createLogFileMetadata, isSupportedLogFilePath } from './supportedFiles';

import type { Dirent } from 'fs';
import type { Logger } from 'winston';

export class DirectoryScanner {
  public constructor(private readonly logger: Logger) {}

  public async scan(directoryPath: string): Promise<DirectoryScanResult> {
    const resolvedPath = resolve(directoryPath);
    const directoryStat = await stat(resolvedPath);

    if (!directoryStat.isDirectory()) {
      throw new Error('Selected path is not a directory.');
    }

    this.logger.info('Started scanning directory.', { directoryPath: resolvedPath });

    const files: DirectoryScanResult['files'] = [];
    const root = await this.scanDirectoryNode(resolvedPath, files);

    this.logger.info('Finished scanning directory.', {
      directoryPath: resolvedPath,
      fileCount: files.length,
    });

    return { root, files };
  }

  private async scanDirectoryNode(
    directoryPath: string,
    files: DirectoryScanResult['files'],
  ): Promise<DirectoryTreeNode> {
    const children: FileTreeNode[] = [];
    let supportedFileCount = 0;
    let entries: Dirent[];

    try {
      entries = await readdir(directoryPath, { withFileTypes: true });
    } catch (error) {
      this.logger.warn('Unable to read directory while scanning.', { directoryPath, error });
      return this.createDirectoryNode(directoryPath, supportedFileCount, children);
    }

    const sortedEntries = entries.toSorted((left, right) => {
      if (left.isDirectory() !== right.isDirectory()) {
        return left.isDirectory() ? -1 : 1;
      }

      return left.name.localeCompare(right.name);
    });

    for (const entry of sortedEntries) {
      const childPath = join(directoryPath, entry.name);

      if (entry.isSymbolicLink()) {
        continue;
      }

      if (entry.isDirectory()) {
        const directoryNode = await this.scanDirectoryNode(childPath, files);
        supportedFileCount += directoryNode.supportedFileCount;
        children.push(directoryNode);
        continue;
      }

      if (!entry.isFile() || !isSupportedLogFilePath(childPath)) {
        continue;
      }

      try {
        const metadata = await createLogFileMetadata(childPath);
        files.push(metadata);
        supportedFileCount += 1;
        children.push({ ...metadata, kind: 'file' });
      } catch (error) {
        this.logger.warn('Unable to read file metadata while scanning.', {
          filePath: childPath,
          error,
        });
      }
    }

    return this.createDirectoryNode(directoryPath, supportedFileCount, children);
  }

  private createDirectoryNode(
    directoryPath: string,
    supportedFileCount: number,
    children: FileTreeNode[],
  ): DirectoryTreeNode {
    return {
      kind: 'directory',
      name: basename(directoryPath) || directoryPath,
      path: directoryPath,
      supportedFileCount,
      children,
    };
  }
}
