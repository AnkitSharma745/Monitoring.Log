import { lstat } from 'fs/promises';
import { resolve } from 'path';

import { createLogFileMetadata, isSupportedLogFilePath } from './supportedFiles';

import type { DirectoryScanner } from './directoryScanner';
import type { PathScanIssue, PathScanResult } from '@shared/contracts/files';
import type { Logger } from 'winston';

export class PathScanner {
  public constructor(
    private readonly directoryScanner: DirectoryScanner,
    private readonly logger: Logger,
  ) {}

  public async scanPaths(paths: string[]): Promise<PathScanResult> {
    const uniquePaths = Array.from(new Set(paths.map((filePath) => resolve(filePath))));
    const result: PathScanResult = {
      files: [],
      directories: [],
      unsupportedPaths: [],
      errors: [],
    };

    this.logger.info('Started scanning dropped paths.', { pathCount: uniquePaths.length });

    for (const path of uniquePaths) {
      await this.scanPath(path, result);
    }

    this.logger.info('Finished scanning dropped paths.', {
      pathCount: uniquePaths.length,
      fileCount: result.files.length,
      directoryCount: result.directories.length,
      unsupportedCount: result.unsupportedPaths.length,
      errorCount: result.errors.length,
    });

    return result;
  }

  private async scanPath(path: string, result: PathScanResult): Promise<void> {
    try {
      const pathStat = await lstat(path);

      if (pathStat.isSymbolicLink()) {
        result.unsupportedPaths.push(path);
        return;
      }

      if (pathStat.isDirectory()) {
        result.directories.push(await this.directoryScanner.scan(path));
        return;
      }

      if (pathStat.isFile() && isSupportedLogFilePath(path)) {
        result.files.push(await createLogFileMetadata(path));
        return;
      }

      result.unsupportedPaths.push(path);
    } catch (error) {
      const issue: PathScanIssue = {
        path,
        reason: error instanceof Error ? error.message : 'Unable to scan path.',
      };
      result.errors.push(issue);
      this.logger.warn('Unable to scan path.', { path, error });
    }
  }
}
