import { stat } from 'fs/promises';
import { resolve } from 'path';

import chokidar, { type FSWatcher } from 'chokidar';

import type { FileReaderService } from '@main/filesystem/fileReader';
import type {
  FileUpdateEvent,
  FileWatchErrorEvent,
  StopWatchingFileResult,
  WatchFileRequest,
  WatchFileResult,
} from '@shared/contracts/files';
import type { Logger } from 'winston';

interface ActiveWatcher {
  watcher: FSWatcher;
  offset: number;
}

type FileUpdatePublisher = (event: FileUpdateEvent) => void;
type FileWatchErrorPublisher = (event: FileWatchErrorEvent) => void;

export class FileWatcherService {
  private readonly watchers = new Map<string, ActiveWatcher>();

  public constructor(
    private readonly fileReader: FileReaderService,
    private readonly logger: Logger,
    private readonly publishUpdate: FileUpdatePublisher,
    private readonly publishError: FileWatchErrorPublisher,
  ) {}

  public async startWatching(request: WatchFileRequest): Promise<WatchFileResult> {
    const file = await this.fileReader.refreshMetadata(request.filePath);
    const existingWatcher = this.watchers.get(file.path);

    if (existingWatcher) {
      this.logger.info('File watcher already exists.', {
        filePath: file.path,
        offset: existingWatcher.offset,
      });

      return {
        file,
        offset: existingWatcher.offset,
        alreadyWatching: true,
      };
    }

    const offset = this.normalizeOffset(request.startOffset, file.sizeBytes);
    const watcher = chokidar.watch(file.path, {
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 150,
        pollInterval: 50,
      },
    });

    watcher.on('change', () => {
      void this.handleFileChanged(file.path);
    });
    watcher.on('error', (error) => {
      this.handleWatcherError(file.path, error);
    });

    this.watchers.set(file.path, { watcher, offset });

    this.logger.info('Started watching file.', {
      filePath: file.path,
      offset,
    });

    return {
      file,
      offset,
      alreadyWatching: false,
    };
  }

  public async stopWatching(filePath: string): Promise<StopWatchingFileResult> {
    const resolvedPath = resolve(filePath);
    const watcherState = this.watchers.get(resolvedPath);

    if (!watcherState) {
      return {
        filePath: resolvedPath,
        stopped: false,
      };
    }

    await watcherState.watcher.close();
    this.watchers.delete(resolvedPath);

    this.logger.info('Stopped watching file.', { filePath: resolvedPath });

    return {
      filePath: resolvedPath,
      stopped: true,
    };
  }

  public async stopAll(): Promise<void> {
    const paths = Array.from(this.watchers.keys());

    await Promise.all(paths.map((filePath) => this.stopWatching(filePath)));

    if (paths.length > 0) {
      this.logger.info('Stopped all file watchers.', { watcherCount: paths.length });
    }
  }

  private async handleFileChanged(filePath: string): Promise<void> {
    const watcherState = this.watchers.get(filePath);

    if (!watcherState) {
      return;
    }

    try {
      const fileStat = await stat(filePath);
      const previousOffset = watcherState.offset;
      const didReset = fileStat.size < previousOffset;
      const readOffset = didReset ? 0 : previousOffset;

      if (fileStat.size <= readOffset) {
        watcherState.offset = fileStat.size;
        return;
      }

      const readResult = await this.fileReader.readRange(filePath, readOffset, fileStat.size);
      watcherState.offset = readResult.nextOffset;

      const updateEvent: FileUpdateEvent = {
        filePath,
        content: readResult.content,
        encoding: 'utf8',
        bytesRead: readResult.bytesRead,
        previousOffset,
        nextOffset: readResult.nextOffset,
        sizeBytes: fileStat.size,
        changedAt: new Date().toISOString(),
        changeType: didReset ? 'reset' : 'append',
      };

      this.publishUpdate(updateEvent);
      this.logger.info('Read file update.', {
        filePath,
        bytesRead: readResult.bytesRead,
        previousOffset,
        nextOffset: readResult.nextOffset,
        changeType: updateEvent.changeType,
      });
    } catch (error) {
      this.handleWatcherError(filePath, error);
    }
  }

  private handleWatcherError(filePath: string, error: unknown): void {
    const message = error instanceof Error ? error.message : 'Unknown watcher error.';

    this.logger.error('File watcher error.', {
      filePath,
      error,
    });

    this.publishError({
      filePath,
      message,
      occurredAt: new Date().toISOString(),
    });
  }

  private normalizeOffset(startOffset: number | undefined, fileSize: number): number {
    if (startOffset === undefined || !Number.isFinite(startOffset)) {
      return fileSize;
    }

    return Math.min(Math.max(Math.floor(startOffset), 0), fileSize);
  }
}
