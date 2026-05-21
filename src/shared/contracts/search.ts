import type { LogSeverity } from './logs';

export interface SearchQuery {
  id: string;
  sourceIds: string[];
  text: string;
  filterToMatches: boolean;
  severityFilters: Record<LogSeverity, boolean>;
  timeRange: {
    start: string | null;
    end: string | null;
  };
  limit: number;
}

export interface SearchMatch {
  entryId: string;
  sourceId: string;
  lineNumber: number;
  byteStart: number;
  byteEnd: number;
  matchRanges: Array<{
    startColumn: number;
    endColumn: number;
  }>;
}

export interface SearchResult {
  queryId: string;
  sourceIds: string[];
  totalMatches: number;
  matches: SearchMatch[];
  completedAt: string;
}

export interface SearchCacheSummary {
  queryId: string;
  sourceIds: string[];
  totalMatches: number;
  createdAt: string;
  lastUsedAt: string;
}
