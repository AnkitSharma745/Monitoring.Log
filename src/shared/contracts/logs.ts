export type LogSeverity = 'error' | 'warn' | 'info' | 'debug' | 'neutral';

export interface LogSourceIdentity {
  id: string;
  filePath: string;
  name: string;
  sizeBytes: number;
  modifiedAt: string;
}

export interface LogChunk {
  id: string;
  sourceId: string;
  filePath: string;
  byteStart: number;
  byteEnd: number;
  lineStart: number;
  lineEnd: number;
  contentHash: string;
  parsedEntryCount: number;
  indexed: boolean;
}

export interface StructuredLogEntry {
  id: string;
  sourceId: string;
  filePath: string;
  chunkId: string;
  lineNumber: number;
  byteStart: number;
  byteEnd: number;
  timestamp: string | null;
  timestampEpochMs: number | null;
  severity: LogSeverity;
  source: string | null;
  eventKind: string | null;
  correlationIds: string[];
  hardwareIds: string[];
  paymentIds: string[];
  sessionIds: string[];
  message: string;
  raw: string;
  parseConfidence: number;
}

export interface VisibleLogWindowRequest {
  sourceId: string;
  startRow: number;
  endRow: number;
  queryId: string | null;
}

export interface VisibleLogWindow {
  sourceId: string;
  startRow: number;
  endRow: number;
  totalRows: number;
  entries: StructuredLogEntry[];
  matchedCount?: number;
  matchedIndices?: number[];
  severityStats?: {
    error: number;
    warn: number;
    info: number;
    debug: number;
    neutral: number;
    total: number;
  };
}

export interface CorrelationSequence {
  id: string;
  field: 'correlationId' | 'paymentId' | 'sessionId' | 'hardwareId';
  value: string;
  entries: StructuredLogEntry[];
  startTime: string | null;
  endTime: string | null;
  durationMs: number | null;
  hasErrors: boolean;
}
