export const SUPPORTED_LOG_FILE_EXTENSIONS = ['.log', '.txt'] as const;

export type SupportedLogFileExtension = (typeof SUPPORTED_LOG_FILE_EXTENSIONS)[number];

export type FileTreeNode = DirectoryTreeNode | LogFileTreeNode;

export interface LogFileMetadata {
  name: string;
  path: string;
  extension: SupportedLogFileExtension;
  sizeBytes: number;
  modifiedAt: string;
}

export interface LogFileTreeNode extends LogFileMetadata {
  kind: 'file';
}

export interface DirectoryTreeNode {
  kind: 'directory';
  name: string;
  path: string;
  supportedFileCount: number;
  children: FileTreeNode[];
}

export interface DirectoryScanResult {
  root: DirectoryTreeNode;
  files: LogFileMetadata[];
}

export interface FilePickerResult {
  canceled: boolean;
  files: LogFileMetadata[];
}

export interface DirectoryPickerResult {
  canceled: boolean;
  scan: DirectoryScanResult | null;
}

export interface PathScanIssue {
  path: string;
  reason: string;
}

export interface PathScanResult {
  files: LogFileMetadata[];
  directories: DirectoryScanResult[];
  unsupportedPaths: string[];
  errors: PathScanIssue[];
}

export interface ReadFileRequest {
  filePath: string;
  maxBytes?: number;
}

export interface FileContentResult {
  file: LogFileMetadata;
  content: string;
  encoding: 'utf8';
  bytesRead: number;
  startOffset: number;
  nextOffset: number;
  truncatedHead: boolean;
}

export interface WatchFileRequest {
  filePath: string;
  startOffset?: number;
}

export interface WatchFileResult {
  file: LogFileMetadata;
  offset: number;
  alreadyWatching: boolean;
}

export interface StopWatchingFileRequest {
  filePath: string;
}

export interface StopWatchingFileResult {
  filePath: string;
  stopped: boolean;
}

export interface FileUpdateEvent {
  filePath: string;
  content: string;
  encoding: 'utf8';
  bytesRead: number;
  previousOffset: number;
  nextOffset: number;
  sizeBytes: number;
  changedAt: string;
  changeType: 'append' | 'reset';
}

export interface FileWatchErrorEvent {
  filePath: string;
  message: string;
  occurredAt: string;
}
