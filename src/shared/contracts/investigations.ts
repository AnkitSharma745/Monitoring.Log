export type InvestigationMode =
  | 'liveMonitoring'
  | 'investigation'
  | 'comparison'
  | 'aiRca'
  | 'incidentReplay';

export type InvestigationStatus = 'active' | 'paused' | 'closed';

export type IncidentCategory =
  | 'payment_timeout'
  | 'printer_reconnect'
  | 'terminal_id_failure'
  | 'heartbeat_dropout'
  | 'reset_cycle'
  | 'api_retry_storm'
  | 'generic_failure';

export interface Incident {
  id: string;
  sourceId: string;
  category: IncidentCategory;
  title: string;
  description: string;
  entryIds: string[]; // List of structured log entry IDs belonging to this incident
  severity: 'error' | 'warn';
  timestampStart: string | null;
  timestampEnd: string | null;
  durationMs: number | null;
  confidence: number;
}

export interface StateTransition {
  fromState: string;
  toState: string;
  timestamp: string | null;
  entryId: string;
  lineNumber: number;
  triggerMessage: string;
}

export interface StateTransitionSequence {
  sourceId: string;
  currentState: string;
  transitions: StateTransition[];
}

export interface DomainRuleResult {
  ruleId: string;
  name: string;
  category: 'payment' | 'hardware' | 'network' | 'system';
  expectedBehavior: string;
  status: 'passed' | 'violation' | 'unknown';
  evidenceEntryIds: string[];
  notes?: string;
}

export interface SavedFilter {
  id: string;
  name: string;
  query: string;
  severityFilters: Record<string, boolean>;
}

export interface EvidenceBookmark {
  id: string;
  entryId: string;
  lineNumber: number;
  timestamp: string | null;
  message: string;
  sourceId?: string;
  note?: string;
  createdAt: string;
}

export interface InvestigationSnapshot {
  id: string;
  title: string;
  timestamp: string;
  activeSourceId: string | null;
  savedFilters: SavedFilter[];
  bookmarks: EvidenceBookmark[];
  notes: string;
  searchQuery?: string;
  searchOptions?: { isRegex: boolean; isCaseSensitive: boolean; isWholeWord: boolean };
  focusedLineNumber?: number | null;
}

export interface Investigation {
  id: string;
  title: string;
  mode: InvestigationMode;
  sourceIds: string[];
  incidentIds: string[];
  evidenceIds: string[];
  createdAt: string;
  updatedAt: string;
  status: InvestigationStatus;

  // Phase 4 Workspaces elements
  savedFilters: SavedFilter[];
  bookmarks: EvidenceBookmark[];
  notes: string;
  snapshots: InvestigationSnapshot[];
}

export interface InvestigationTimelineEvent {
  id: string;
  investigationId: string;
  timestamp: string | null;
  title: string;
  entryIds: string[];
  evidenceIds: string[];
  confidence: number;
}

export interface FailureChainCandidate {
  id: string;
  title: string;
  description: string;
  orderedIncidents: Incident[];
  probability: number;
  openQuestions: string[];
}
