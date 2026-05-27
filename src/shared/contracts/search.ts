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
  isRegex?: boolean;
  isCaseSensitive?: boolean;
  isWholeWord?: boolean;
  maxDurationMs?: number;
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
  raw?: string;
}

export interface SearchResult {
  queryId: string;
  sourceIds: string[];
  totalMatches: number;
  matches: SearchMatch[];
  searchedEntryCount?: number;
  status?: 'complete' | 'partial' | 'invalid';
  errorMessage?: string;
  completedAt: string;
}

export interface SearchCacheSummary {
  queryId: string;
  sourceIds: string[];
  totalMatches: number;
  createdAt: string;
  lastUsedAt: string;
}

export interface SavedInvestigationFilter {
  id: string;
  name: string;
  searchText: string;
  includeFilter: string;
  excludeFilter: string;
  severityFilters: Record<LogSeverity, boolean>;
  isRegex: boolean;
  isCaseSensitive: boolean;
  isWholeWord: boolean;
  createdAt: string;
  lastUsedAt: string;
}
