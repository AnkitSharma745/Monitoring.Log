import type { EvidencePack } from '@shared/contracts/ai';
import type {
  Incident,
  StateTransitionSequence,
  DomainRuleResult,
  FailureChainCandidate,
} from '@shared/contracts/investigations';
import type { LogChunk, StructuredLogEntry, VisibleLogWindow } from '@shared/contracts/logs';
import type { SearchQuery, SearchResult } from '@shared/contracts/search';

export type EngineWorkerRequest =
  | {
      type: 'parseChunk';
      requestId: string;
      chunk: LogChunk;
      text: string;
      startingLineNumber: number;
    }
  | {
      type: 'indexEntries';
      requestId: string;
      sourceId: string;
      entries: StructuredLogEntry[];
    }
  | {
      type: 'search';
      requestId: string;
      query: SearchQuery;
    }
  | {
      type: 'getVisibleWindow';
      requestId: string;
      sourceId: string;
      startRow: number;
      endRow: number;
      severityFilters?: Record<string, boolean>;
      searchQuery?: string;
      filterToMatches?: boolean;
      isRegex?: boolean;
      isCaseSensitive?: boolean;
      isWholeWord?: boolean;
      includeFilter?: string;
      excludeFilter?: string;
    }
  | {
      type: 'getCorrelationSequence';
      requestId: string;
      sourceId: string;
      field: 'correlationId' | 'paymentId' | 'sessionId' | 'hardwareId';
      value: string;
    }
  | {
      type: 'detectPatterns';
      requestId: string;
      sourceId: string;
    }
  | {
      type: 'buildEvidencePack';
      requestId: string;
      investigationId: string;
      question: string;
      entries: StructuredLogEntry[];
    }
  // Phase 4 Intelligence Requests
  | {
      type: 'detectIncidents';
      requestId: string;
      sourceId: string;
    }
  | {
      type: 'reconstructStates';
      requestId: string;
      sourceId: string;
    }
  | {
      type: 'detectFailureChains';
      requestId: string;
      sourceId: string;
      incidents: Incident[];
    }
  | {
      type: 'validateDomainRules';
      requestId: string;
      sourceId: string;
    };

export type EngineWorkerResponse =
  | {
      type: 'parseChunk:done';
      requestId: string;
      chunk: LogChunk;
      entries: StructuredLogEntry[];
    }
  | {
      type: 'indexEntries:done';
      requestId: string;
      sourceId: string;
      indexedCount: number;
    }
  | {
      type: 'search:done';
      requestId: string;
      result: SearchResult;
    }
  | {
      type: 'getVisibleWindow:done';
      requestId: string;
      window: VisibleLogWindow;
    }
  | {
      type: 'getCorrelationSequence:done';
      requestId: string;
      sequence: any | null;
    }
  | {
      type: 'detectPatterns:done';
      requestId: string;
      patterns: Array<{
        type: 'payment_retry' | 'heartbeat_failure' | 'kiosk_reset_chain' | 'api_storm';
        description: string;
        indicators: string[];
        affectedEntryCount: number;
        severity: 'error' | 'warn';
      }>;
    }
  | {
      type: 'buildEvidencePack:done';
      requestId: string;
      evidencePack: EvidencePack;
    }
  // Phase 4 Intelligence Responses
  | {
      type: 'detectIncidents:done';
      requestId: string;
      incidents: Incident[];
    }
  | {
      type: 'reconstructStates:done';
      requestId: string;
      sequence: StateTransitionSequence;
    }
  | {
      type: 'detectFailureChains:done';
      requestId: string;
      chains: FailureChainCandidate[];
    }
  | {
      type: 'validateDomainRules:done';
      requestId: string;
      results: DomainRuleResult[];
    }
  | {
      type: 'error';
      requestId: string;
      message: string;
    };
