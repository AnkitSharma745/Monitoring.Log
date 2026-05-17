export interface LoadedFileDocument {
  content: string;
  bytesRead: number;
  startOffset: number;
  nextOffset: number;
  truncatedHead: boolean;
  trimmedInRenderer: boolean;
  lastUpdatedAt: string;
}

export interface WatchingFileState {
  offset: number;
  startedAt: string;
  alreadyWatching: boolean;
}
