import type { LogChunk, LogSourceIdentity } from '@shared/contracts/logs';

export const DEFAULT_CHUNK_SIZE_BYTES = 512 * 1024;

export interface ChunkReadPlan {
  source: LogSourceIdentity;
  chunkSizeBytes: number;
  chunks: LogChunk[];
}

export const createChunkReadPlan = (
  source: LogSourceIdentity,
  chunkSizeBytes = DEFAULT_CHUNK_SIZE_BYTES,
): ChunkReadPlan => {
  const normalizedChunkSize = Math.max(1, Math.floor(chunkSizeBytes));
  const chunks: LogChunk[] = [];
  let byteStart = 0;
  let chunkIndex = 0;

  while (byteStart < source.sizeBytes) {
    const byteEnd = Math.min(source.sizeBytes, byteStart + normalizedChunkSize);

    chunks.push({
      id: `${source.id}:chunk:${chunkIndex}`,
      sourceId: source.id,
      filePath: source.filePath,
      byteStart,
      byteEnd,
      lineStart: 0,
      lineEnd: 0,
      contentHash: '',
      parsedEntryCount: 0,
      indexed: false,
    });

    byteStart = byteEnd;
    chunkIndex += 1;
  }

  if (chunks.length === 0) {
    chunks.push({
      id: `${source.id}:chunk:0`,
      sourceId: source.id,
      filePath: source.filePath,
      byteStart: 0,
      byteEnd: 0,
      lineStart: 0,
      lineEnd: 0,
      contentHash: '',
      parsedEntryCount: 0,
      indexed: false,
    });
  }

  return {
    source,
    chunkSizeBytes: normalizedChunkSize,
    chunks,
  };
};
