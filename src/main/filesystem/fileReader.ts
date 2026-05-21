import { createReadStream } from 'fs';

import {
  type FileContentResult,
  type LogFileMetadata,
  type ReadFileRequest,
} from '@shared/contracts/files';
import { createLogFileMetadata } from './supportedFiles';

import type { Logger } from 'winston';

const DEFAULT_MAX_READ_BYTES = 512 * 1024;
const MAX_READ_BYTES = 5 * 1024 * 1024;

export interface FileRangeReadResult {
  content: string;
  encoding: 'utf8';
  bytesRead: number;
  nextOffset: number;
}

export class FileReaderService {
  public constructor(private readonly logger: Logger) {}

  public async readInitialContent(request: ReadFileRequest): Promise<FileContentResult> {
    const file = await createLogFileMetadata(request.filePath);

    let startOffset = request.startOffset;
    let endOffset = request.endOffset;

    if (startOffset === undefined || endOffset === undefined) {
      const maxBytes = this.normalizeMaxBytes(request.maxBytes);
      startOffset = Math.max(0, file.sizeBytes - maxBytes);
      endOffset = file.sizeBytes;
    }

    const readResult = await this.readRange(file.path, startOffset, endOffset);

    this.logger.info('Read file content.', {
      filePath: file.path,
      bytesRead: readResult.bytesRead,
      truncatedHead: startOffset > 0,
      startOffset,
      endOffset,
    });

    return {
      file,
      content: readResult.content,
      encoding: 'utf8',
      bytesRead: readResult.bytesRead,
      startOffset,
      nextOffset: readResult.nextOffset,
      truncatedHead: startOffset > 0,
    };
  }

  public async readRange(
    filePath: string,
    startOffset: number,
    endOffset: number,
  ): Promise<FileRangeReadResult> {
    if (endOffset <= startOffset) {
      return {
        content: '',
        encoding: 'utf8',
        bytesRead: 0,
        nextOffset: startOffset,
      };
    }

    const buffer = await this.readBuffer(filePath, startOffset, endOffset);

    return {
      content: buffer.toString('utf8'),
      encoding: 'utf8',
      bytesRead: buffer.length,
      nextOffset: startOffset + buffer.length,
    };
  }

  public refreshMetadata(filePath: string): Promise<LogFileMetadata> {
    return createLogFileMetadata(filePath);
  }

  private normalizeMaxBytes(maxBytes: number | undefined): number {
    if (!maxBytes || !Number.isFinite(maxBytes)) {
      return DEFAULT_MAX_READ_BYTES;
    }

    return Math.min(Math.max(Math.floor(maxBytes), 1), MAX_READ_BYTES);
  }

  private readBuffer(filePath: string, startOffset: number, endOffset: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const stream = createReadStream(filePath, {
        start: startOffset,
        end: endOffset - 1,
      });

      stream.on('data', (chunk: Buffer | string) => {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      });
      stream.on('error', reject);
      stream.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
    });
  }
}
