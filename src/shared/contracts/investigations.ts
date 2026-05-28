import type { ExtractedRule } from './knowledge';
import type { LogSeverity } from './logs';

export type InvestigationMode =
  | 'liveMonitoring'
  | 'investigation'
  | 'comparison'
  | 'aiRca'
  | 'incidentReplay';

export type InvestigationStatus = 'active' | 'paused' | 'closed';

export type InvestigationEntityType =
  | 'incident'
  | 'operationalSequence'
  | 'evidenceCluster'
  | 'operationalState'
  | 'ruleViolation'
  | 'correlationGroup'
  | 'recoveryFlow';

export type IncidentCategory =
  | 'payment_timeout'
  | 'printer_reconnect'
  | 'terminal_id_failure'
  | 'heartbeat_dropout'
  | 'reset_cycle'
  | 'api_retry_storm'
  | 'generic_failure';

export type OperationalPatternCategory =
  | IncidentCategory
  | 'retry_storm'
  | 'timeout_chain'
  | 'reset_loop'
  | 'heartbeat_instability'
  | 'operational_degradation'
  | 'recovery_flow'
  | 'payment_failure'
  | 'state_transition'
  | 'rule_violation'
  | 'correlation';

export interface EvidenceReference {
  id: string;
  sourceId: string;
  filePath: string;
  chunkId: string;
  entryId: string;
  lineNumber: number;
  byteStart: number;
  byteEnd: number;
  timestamp: string | null;
  timestampEpochMs: number | null;
  severity: LogSeverity;
  source: string | null;
  message: string;
  raw: string;
  orderingKey: number;
}

export interface EntityExplainability {
  summary: string;
  ruleIds: string[];
  matchedSignals: string[];
  evidenceLineNumbers: number[];
  confidenceFactors: string[];
  limitations: string[];
}

export interface EntityEvidenceSummary {
  totalFrames: number;
  retainedFrames: number;
  truncated: boolean;
  lineStart: number | null;
  lineEnd: number | null;
}

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
  primaryLineNumber?: number | null;
  evidenceRefs?: EvidenceReference[];
  evidenceSummary?: EntityEvidenceSummary;
  explanation?: EntityExplainability;
  relatedEntityIds?: string[];
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

  // Phase 8 Custom Rule inject capability
  customRules?: ExtractedRule[];

  // Phase 10 Ecosystem additions
  rulePacks?: RulePack[];
  playbooks?: Playbook[];
  observedPatterns?: ObservedPattern[];
  activeRcaDrafts?: Record<string, RcaDraft>;
  auditLog?: InvestigationAuditEntry[];
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

// Phase 8 Lightweight Knowledge Graph Structure
export interface GraphNode {
  id: string;
  type: 'incident' | 'hardware' | 'state' | 'rule' | 'symptom' | 'log_reference';
  label: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface GraphEdge {
  sourceId: string;
  targetId: string;
  relationship: string; // "triggers" | "violates" | "affects" | "correlated_with"
  confidence: number;
}

export interface IncidentKnowledgeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// Phase 8 Operational Degradation Scoring Structures
export interface OperationalDegradationResult {
  score: number; // 0 to 100
  level: 'nominal' | 'degraded' | 'critical';
  factors: string[];
}

// Phase 10 Ecosystem Structures

export type PlaybookStepType =
  | 'scan_keyword'
  | 'state_transition'
  | 'correlation_check'
  | 'peripheral_status';

export interface PlaybookStep {
  id: string;
  title: string;
  description: string;
  type: PlaybookStepType;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'skipped';
  criteria: {
    pattern?: string;
    stateName?: string;
    expectedBehavior?: string;
  };
  matchedEntryIds: string[];
  matchedLineNumbers: number[];
  evidenceSummary?: string;
}

export interface Playbook {
  id: string;
  name: string;
  description: string;
  category: 'payment' | 'hardware' | 'network' | 'system';
  steps: PlaybookStep[];
  status: 'idle' | 'running' | 'completed' | 'failed';
}

export interface RulePack {
  id: string;
  name: string;
  version: string;
  description: string;
  category: 'payment' | 'hardware' | 'network' | 'system';
  rules: ExtractedRule[];
}

export interface ObservedPattern {
  id: string;
  pattern: string;
  occurrencesCount: number;
  incidentCategory: IncidentCategory;
  averageConfidence: number;
  sampleMessage: string;
  sourceFilePaths: string[];
  suggestedRuleName: string;
  suggestedExpectedBehavior: string;
  isApproved: boolean;
}

export interface RcaConfidenceBreakdown {
  score: number; // 0 to 100
  matchedRulesCount: number;
  matchedStatesCount: number;
  contributingTelemetryLines: number[];
  uncertaintyFactors: string[];
}

export interface RcaDraft {
  id: string;
  incidentId: string;
  confidence: RcaConfidenceBreakdown;
  reasoningTrace: string[];
  deterministicViolations: string[];
  timelinePropagation: string[];
  uncertainties: string[];
  evidenceLinks: Array<{ entryId: string; lineNumber: number; message: string }>;
  suggestedRecoveryPath: string;
  draftMarkdown: string;
}

export interface TriageRank {
  incidentId: string;
  severityScore: number; // 0 to 100
  impactLevel: 'low' | 'medium' | 'high';
  primaryStartingCoordinate: number;
  propagationDepth: number;
  contributingFactors: string[];
}

export interface InvestigationAuditEntry {
  id: string;
  timestamp: string;
  action: 'rule_create' | 'rule_delete' | 'playbook_run' | 'pattern_promote' | 'case_export';
  targetId: string;
  details: string;
  evidenceLinks: Array<{ entryId: string; lineNumber: number }>;
}

export interface InvestigationEntityBase {
  id: string;
  type: InvestigationEntityType;
  sourceId: string;
  title: string;
  description: string;
  category: OperationalPatternCategory;
  severity: LogSeverity;
  confidence: number;
  timestampStart: string | null;
  timestampEnd: string | null;
  durationMs: number | null;
  evidenceRefs: EvidenceReference[];
  evidenceSummary: EntityEvidenceSummary;
  explanation: EntityExplainability;
  createdAt: string;
}

export interface OperationalSequence extends InvestigationEntityBase {
  type: 'operationalSequence';
  sequenceKind:
    | 'retry_storm'
    | 'timeout_chain'
    | 'reset_loop'
    | 'heartbeat_instability'
    | 'payment_flow'
    | 'state_transition'
    | 'failure_chain';
  orderedEntryIds: string[];
  transitionLabels: string[];
  relatedIncidentIds: string[];
}

export interface EvidenceCluster extends InvestigationEntityBase {
  type: 'evidenceCluster';
  clusterKind: 'temporal' | 'correlation' | 'pattern' | 'rule';
  clusterKey: string;
  entryCount: number;
  dominantSources: string[];
  relatedIncidentIds: string[];
}

export interface OperationalState extends InvestigationEntityBase {
  type: 'operationalState';
  stateName: string;
  previousState: string | null;
  nextState: string | null;
  transitionEntryId: string;
  lineNumber: number;
}

export interface RuleViolation extends InvestigationEntityBase {
  type: 'ruleViolation';
  ruleId: string;
  ruleName: string;
  ruleCategory: DomainRuleResult['category'];
  expectedBehavior: string;
  status: 'violation';
}

export interface CorrelationGroup extends InvestigationEntityBase {
  type: 'correlationGroup';
  correlationKind: 'correlationId' | 'paymentId' | 'sessionId' | 'hardwareId';
  correlationKey: string;
  entryIds: string[];
  relatedEntityIds: string[];
}

export interface RecoveryFlow extends InvestigationEntityBase {
  type: 'recoveryFlow';
  recoveryKind: 'automatic' | 'manual' | 'unknown';
  status: 'recovered' | 'failed' | 'partial' | 'unknown';
  startLineNumber: number;
  endLineNumber: number | null;
}

export interface OperationalTimelineEvent {
  id: string;
  sourceId: string;
  entityId: string;
  entityType: InvestigationEntityType;
  title: string;
  timestamp: string | null;
  timestampEpochMs: number | null;
  lineNumber: number | null;
  severity: LogSeverity;
  orderingKey: number;
  evidenceRefs: EvidenceReference[];
}

export interface InvestigationEntityProcessingStats {
  entriesAnalyzed: number;
  entitiesDetected: number;
  evidenceRefsRetained: number;
  processingDurationMs: number;
  generatedAt: string;
}

export interface InvestigationEntitySet {
  sourceId: string;
  generatedAt: string;
  incidents: Incident[];
  stateSequence: StateTransitionSequence;
  ruleResults: DomainRuleResult[];
  failureChains: FailureChainCandidate[];
  incidentGraph: IncidentKnowledgeGraph;
  degradation: OperationalDegradationResult;
  operationalSequences: OperationalSequence[];
  evidenceClusters: EvidenceCluster[];
  operationalStates: OperationalState[];
  ruleViolations: RuleViolation[];
  correlationGroups: CorrelationGroup[];
  recoveryFlows: RecoveryFlow[];
  timelineEvents: OperationalTimelineEvent[];
  processingStats: InvestigationEntityProcessingStats;
  explanation: EntityExplainability;
}

export interface InvestigationEntityBuildStatus {
  state: 'idle' | 'building' | 'ready' | 'error';
  message: string;
  updatedAt: string;
}
