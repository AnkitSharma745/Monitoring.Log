import { OperationalCorrelationEngine } from './correlationEngine';
import type {
  CorrelationGroup,
  DomainRuleResult,
  EntityEvidenceSummary,
  EntityExplainability,
  EvidenceCluster,
  EvidenceReference,
  FailureChainCandidate,
  Incident,
  InvestigationEntityBase,
  InvestigationEntitySet,
  InvestigationEntityType,
  OperationalPatternCategory,
  OperationalSequence,
  OperationalState,
  OperationalTimelineEvent,
  RecoveryFlow,
  RuleViolation,
  StateTransition,
} from '@shared/contracts/investigations';
import type { ExtractedRule } from '@shared/contracts/knowledge';
import type { LogSeverity, StructuredLogEntry } from '@shared/contracts/logs';

interface PatternDefinition {
  id: string;
  category: OperationalPatternCategory;
  sequenceKind: OperationalSequence['sequenceKind'];
  title: string;
  description: string;
  severity: LogSeverity;
  minEntries: number;
  windowMs: number;
  matcher: RegExp;
}

interface EntityBaseInput {
  id: string;
  type: InvestigationEntityType;
  sourceId: string;
  title: string;
  description: string;
  category: OperationalPatternCategory;
  severity: LogSeverity;
  confidence: number;
  entries: StructuredLogEntry[];
  generatedAt: string;
  ruleIds: string[];
  matchedSignals: string[];
  confidenceFactors: string[];
  limitations?: string[];
}

const MAX_ENTITY_COUNT = 120;
const MAX_CORRELATION_GROUPS = 80;
const MAX_ENTITY_EVIDENCE_REFS = 160;
const RECOVERY_WINDOW_MS = 120000;
const TEMPORAL_FALLBACK_LINE_WINDOW = 120;

const PATTERN_DEFINITIONS: PatternDefinition[] = [
  {
    id: 'retry-storm',
    category: 'retry_storm',
    sequenceKind: 'retry_storm',
    title: 'Retry Storm',
    description: 'Repeated retry attempts were detected in a compact operational window.',
    severity: 'warn',
    minEntries: 3,
    windowMs: 20000,
    matcher: /retry|reattempt|attempt\s+\d+|backoff/i,
  },
  {
    id: 'timeout-chain',
    category: 'timeout_chain',
    sequenceKind: 'timeout_chain',
    title: 'Timeout Chain',
    description: 'Timeout or deadline failures cluster together in the operational timeline.',
    severity: 'error',
    minEntries: 2,
    windowMs: 45000,
    matcher: /timeout|timed out|deadline|latency exceeded|response overdue/i,
  },
  {
    id: 'reset-loop',
    category: 'reset_loop',
    sequenceKind: 'reset_loop',
    title: 'Reset Loop',
    description: 'Reset, restart, or watchdog events repeat in a short operational range.',
    severity: 'warn',
    minEntries: 2,
    windowMs: 90000,
    matcher: /reset|restart|reboot|shutdown|watchdog|system_restart|kiosk_start/i,
  },
  {
    id: 'heartbeat-instability',
    category: 'heartbeat_instability',
    sequenceKind: 'heartbeat_instability',
    title: 'Heartbeat Instability',
    description: 'Heartbeat, ping, or connectivity failures recur close together.',
    severity: 'error',
    minEntries: 2,
    windowMs: 45000,
    matcher: /heartbeat|ping|disconnect|connection lost|socket closed|offline/i,
  },
  {
    id: 'payment-failure',
    category: 'payment_failure',
    sequenceKind: 'payment_flow',
    title: 'Payment Failure Flow',
    description: 'Payment or cashless transaction failures are grouped for reconstruction.',
    severity: 'error',
    minEntries: 1,
    windowMs: 60000,
    matcher: /payment|transaction|cashless|authorize|merchant|gateway|declined|cancel/i,
  },
];

const FAILURE_PATTERN = /disconnect|offline|lost|timeout|fail|error|exception|unavailable/i;
const RECOVERY_PATTERN = /recover|reconnect|restored|ready|online|success|opened|resumed/i;

export class InvestigationEntityPipeline {
  public static buildEntitySet(
    sourceId: string,
    entries: StructuredLogEntry[],
    customRules?: ExtractedRule[],
  ): InvestigationEntitySet {
    const startedAt = Date.now();
    const generatedAt = new Date().toISOString();
    const sortedEntries = this.sortEntries(entries);
    const entryById = new Map(sortedEntries.map((entry) => [entry.id, entry]));

    const incidents = OperationalCorrelationEngine.detectIncidents(
      sourceId,
      sortedEntries,
      customRules,
    ).map((incident) => this.enrichIncident(incident, entryById, generatedAt));

    const stateSequence = OperationalCorrelationEngine.reconstructStates(
      sourceId,
      sortedEntries,
      customRules,
    );
    const ruleResults = OperationalCorrelationEngine.validateDomainRules(
      sourceId,
      sortedEntries,
      customRules,
    );
    const failureChains = OperationalCorrelationEngine.detectFailureChains(sourceId, incidents);
    const degradation = OperationalCorrelationEngine.calculateDegradationScore(
      incidents,
      ruleResults,
    );
    const incidentGraph = OperationalCorrelationEngine.compileIncidentGraph(
      incidents,
      stateSequence,
      ruleResults,
    );

    const patternClusters = this.buildPatternEvidenceClusters(sourceId, sortedEntries, generatedAt);
    const correlationGroups = this.buildCorrelationGroups(sourceId, sortedEntries, generatedAt);
    const ruleViolations = this.buildRuleViolations(sourceId, ruleResults, entryById, generatedAt);
    const operationalStates = this.buildOperationalStates(
      sourceId,
      stateSequence.transitions,
      entryById,
      generatedAt,
    );
    const recoveryFlows = this.buildRecoveryFlows(sourceId, sortedEntries, generatedAt);
    const operationalSequences = [
      ...this.buildFailureChainSequences(sourceId, failureChains, entryById, generatedAt),
      ...this.buildPatternSequences(sourceId, patternClusters, incidents, generatedAt),
      ...this.buildStateSequenceEntities(
        sourceId,
        stateSequence.transitions,
        entryById,
        generatedAt,
      ),
    ].slice(0, MAX_ENTITY_COUNT);

    const evidenceClusters = patternClusters.slice(0, MAX_ENTITY_COUNT);
    const allEntities: InvestigationEntityBase[] = [
      ...operationalSequences,
      ...evidenceClusters,
      ...operationalStates,
      ...ruleViolations,
      ...correlationGroups,
      ...recoveryFlows,
    ];
    const timelineEvents = this.buildTimelineEvents(sourceId, allEntities);
    const evidenceRefsRetained = allEntities.reduce(
      (sum, entity) => sum + entity.evidenceRefs.length,
      0,
    );
    const entitiesDetected =
      incidents.length +
      operationalSequences.length +
      evidenceClusters.length +
      operationalStates.length +
      ruleViolations.length +
      correlationGroups.length +
      recoveryFlows.length;

    return {
      sourceId,
      generatedAt,
      incidents,
      stateSequence,
      ruleResults,
      failureChains,
      incidentGraph,
      degradation,
      operationalSequences,
      evidenceClusters,
      operationalStates,
      ruleViolations,
      correlationGroups,
      recoveryFlows,
      timelineEvents,
      processingStats: {
        entriesAnalyzed: sortedEntries.length,
        entitiesDetected,
        evidenceRefsRetained,
        processingDurationMs: Date.now() - startedAt,
        generatedAt,
      },
      explanation: {
        summary: `Built ${entitiesDetected} deterministic investigation entities from ${sortedEntries.length} indexed log entries.`,
        ruleIds: [
          'incident-detectors',
          'domain-rule-validator',
          'pattern-cluster-detectors',
          'correlation-group-detectors',
          'recovery-flow-detector',
        ],
        matchedSignals: [
          `${incidents.length} incidents`,
          `${ruleViolations.length} rule violations`,
          `${operationalSequences.length} sequences`,
          `${correlationGroups.length} correlation groups`,
        ],
        evidenceLineNumbers: timelineEvents
          .map((event) => event.lineNumber)
          .filter((lineNumber): lineNumber is number => lineNumber !== null)
          .slice(0, MAX_ENTITY_EVIDENCE_REFS),
        confidenceFactors: [
          'Entities are derived from indexed structured log entries.',
          'All surfaced entities carry line-level evidence references.',
          'Pattern rules are deterministic regular-expression and temporal-window checks.',
        ],
        limitations: [
          'Entity evidence references are bounded per entity to protect renderer memory.',
          'Correlation remains deterministic and intentionally lightweight.',
        ],
      },
    };
  }

  private static enrichIncident(
    incident: Incident,
    entryById: Map<string, StructuredLogEntry>,
    generatedAt: string,
  ): Incident {
    const entries = this.sortEntries(
      incident.entryIds
        .map((entryId) => entryById.get(entryId))
        .filter((entry): entry is StructuredLogEntry => entry !== undefined),
    );
    const evidenceRefs = this.retainEvidenceRefs(entries);

    return {
      ...incident,
      primaryLineNumber: entries[0]?.lineNumber ?? null,
      evidenceRefs,
      evidenceSummary: this.buildEvidenceSummary(entries, evidenceRefs),
      explanation: {
        summary: `${incident.title} was grouped by the deterministic incident detector for category ${incident.category}.`,
        ruleIds: [`incident-detector:${incident.category}`],
        matchedSignals: [incident.category, incident.severity],
        evidenceLineNumbers: evidenceRefs.map((ref) => ref.lineNumber),
        confidenceFactors: [
          `Grouped ${incident.entryIds.length} operational frames.`,
          `Detector confidence ${(incident.confidence * 100).toFixed(0)}%.`,
        ],
        limitations: generatedAt
          ? ['Incident grouping is deterministic and does not infer beyond matching evidence.']
          : [],
      },
      relatedEntityIds: incident.relatedEntityIds ?? [],
    };
  }

  private static buildPatternEvidenceClusters(
    sourceId: string,
    entries: StructuredLogEntry[],
    generatedAt: string,
  ): EvidenceCluster[] {
    const clusters: EvidenceCluster[] = [];

    for (const definition of PATTERN_DEFINITIONS) {
      const matches = entries.filter((entry) => definition.matcher.test(this.entryText(entry)));
      const groups = this.groupEntriesByWindow(matches, definition.windowMs);

      for (const group of groups) {
        if (group.length < definition.minEntries) continue;
        const first = group[0];
        const last = group[group.length - 1];
        if (!first || !last) continue;

        const base = this.createBaseEntity({
          id: this.stableEntityId(
            'cluster',
            sourceId,
            definition.id,
            first.lineNumber,
            last.lineNumber,
          ),
          type: 'evidenceCluster',
          sourceId,
          title: definition.title,
          description: definition.description,
          category: definition.category,
          severity: definition.severity,
          confidence: Math.min(0.7 + group.length * 0.04, 0.98),
          entries: group,
          generatedAt,
          ruleIds: [`pattern:${definition.id}`],
          matchedSignals: [definition.category, definition.matcher.source],
          confidenceFactors: [
            `${group.length} matching evidence frames.`,
            `Temporal window ${Math.round(definition.windowMs / 1000)}s.`,
          ],
        });

        clusters.push({
          ...base,
          type: 'evidenceCluster',
          clusterKind: 'pattern',
          clusterKey: `${definition.id}:${first.lineNumber}-${last.lineNumber}`,
          entryCount: group.length,
          dominantSources: this.getDominantSources(group),
          relatedIncidentIds: [],
        });
      }
    }

    return clusters.slice(0, MAX_ENTITY_COUNT);
  }

  private static buildCorrelationGroups(
    sourceId: string,
    entries: StructuredLogEntry[],
    generatedAt: string,
  ): CorrelationGroup[] {
    const groups: CorrelationGroup[] = [];
    const collect = (
      kind: CorrelationGroup['correlationKind'],
      getIds: (entry: StructuredLogEntry) => string[],
    ): void => {
      const entriesByKey = new Map<string, StructuredLogEntry[]>();
      for (const entry of entries) {
        for (const id of getIds(entry)) {
          const bucket = entriesByKey.get(id) ?? [];
          bucket.push(entry);
          entriesByKey.set(id, bucket);
        }
      }

      for (const [key, bucket] of entriesByKey.entries()) {
        if (bucket.length < 2 || groups.length >= MAX_CORRELATION_GROUPS) continue;
        const sortedBucket = this.sortEntries(bucket);
        const first = sortedBucket[0];
        const last = sortedBucket[sortedBucket.length - 1];
        if (!first || !last) continue;

        const base = this.createBaseEntity({
          id: this.stableEntityId(
            'correlation',
            sourceId,
            kind,
            key,
            first.lineNumber,
            last.lineNumber,
          ),
          type: 'correlationGroup',
          sourceId,
          title: `${kind}: ${key}`,
          description: `${bucket.length} log frames share ${kind} "${key}".`,
          category: 'correlation',
          severity: this.maxSeverity(sortedBucket),
          confidence: Math.min(0.72 + bucket.length * 0.03, 0.99),
          entries: sortedBucket,
          generatedAt,
          ruleIds: [`correlation:${kind}`],
          matchedSignals: [kind, key],
          confidenceFactors: [`${bucket.length} frames share the same operational identifier.`],
        });

        groups.push({
          ...base,
          type: 'correlationGroup',
          correlationKind: kind,
          correlationKey: key,
          entryIds: sortedBucket.map((entry) => entry.id),
          relatedEntityIds: [],
        });
      }
    };

    collect('correlationId', (entry) => entry.correlationIds);
    collect('paymentId', (entry) => entry.paymentIds);
    collect('sessionId', (entry) => entry.sessionIds);
    collect('hardwareId', (entry) => entry.hardwareIds);

    return groups;
  }

  private static buildRuleViolations(
    sourceId: string,
    ruleResults: DomainRuleResult[],
    entryById: Map<string, StructuredLogEntry>,
    generatedAt: string,
  ): RuleViolation[] {
    return ruleResults
      .filter((rule) => rule.status === 'violation')
      .map((rule) => {
        const entries = this.sortEntries(
          rule.evidenceEntryIds
            .map((entryId) => entryById.get(entryId))
            .filter((entry): entry is StructuredLogEntry => entry !== undefined),
        );
        if (entries.length === 0) return null;
        const first = entries[0]!;
        const last = entries[entries.length - 1]!;
        const base = this.createBaseEntity({
          id: this.stableEntityId(
            'rule-violation',
            sourceId,
            rule.ruleId,
            first.lineNumber,
            last.lineNumber,
          ),
          type: 'ruleViolation',
          sourceId,
          title: `Rule Violation: ${rule.name}`,
          description: rule.notes || rule.expectedBehavior,
          category: 'rule_violation',
          severity: rule.category === 'payment' || rule.category === 'system' ? 'error' : 'warn',
          confidence: 0.95,
          entries,
          generatedAt,
          ruleIds: [rule.ruleId],
          matchedSignals: [rule.name, rule.expectedBehavior],
          confidenceFactors: ['Rule status returned violation with concrete evidence entries.'],
        });

        return {
          ...base,
          type: 'ruleViolation',
          ruleId: rule.ruleId,
          ruleName: rule.name,
          ruleCategory: rule.category,
          expectedBehavior: rule.expectedBehavior,
          status: 'violation',
        };
      })
      .filter((violation): violation is RuleViolation => violation !== null);
  }

  private static buildOperationalStates(
    sourceId: string,
    transitions: StateTransition[],
    entryById: Map<string, StructuredLogEntry>,
    generatedAt: string,
  ): OperationalState[] {
    return transitions
      .map((transition, index) => {
        const entry = entryById.get(transition.entryId);
        if (!entry) return null;
        const base = this.createBaseEntity({
          id: this.stableEntityId(
            'state',
            sourceId,
            transition.fromState,
            transition.toState,
            transition.lineNumber,
          ),
          type: 'operationalState',
          sourceId,
          title: `${transition.fromState} -> ${transition.toState}`,
          description: transition.triggerMessage,
          category: 'state_transition',
          severity: entry.severity,
          confidence: 0.9,
          entries: [entry],
          generatedAt,
          ruleIds: ['state-transition-reconstruction'],
          matchedSignals: [transition.fromState, transition.toState],
          confidenceFactors: ['State transition was reconstructed from an exact log line.'],
        });

        const operationalState: OperationalState = {
          ...base,
          type: 'operationalState',
          stateName: transition.toState,
          previousState: transition.fromState,
          nextState: transitions[index + 1]?.toState ?? null,
          transitionEntryId: transition.entryId,
          lineNumber: transition.lineNumber,
        };
        return operationalState;
      })
      .filter((state): state is OperationalState => state !== null);
  }

  private static buildFailureChainSequences(
    sourceId: string,
    chains: FailureChainCandidate[],
    entryById: Map<string, StructuredLogEntry>,
    generatedAt: string,
  ): OperationalSequence[] {
    return chains
      .map((chain) => {
        const entries = this.sortEntries(
          chain.orderedIncidents
            .flatMap((incident) => incident.entryIds)
            .map((entryId) => entryById.get(entryId))
            .filter((entry): entry is StructuredLogEntry => entry !== undefined),
        );
        if (entries.length < 2) return null;
        const first = entries[0]!;
        const last = entries[entries.length - 1]!;
        const relatedIncidentIds = chain.orderedIncidents.map((incident) => incident.id);
        const base = this.createBaseEntity({
          id: this.stableEntityId(
            'sequence-chain',
            sourceId,
            chain.id,
            first.lineNumber,
            last.lineNumber,
          ),
          type: 'operationalSequence',
          sourceId,
          title: chain.title,
          description: chain.description,
          category: chain.orderedIncidents[0]?.category ?? 'operational_degradation',
          severity: this.maxSeverity(entries),
          confidence: chain.probability,
          entries,
          generatedAt,
          ruleIds: ['failure-chain-correlation'],
          matchedSignals: chain.orderedIncidents.map((incident) => incident.category),
          confidenceFactors: [`${chain.orderedIncidents.length} incidents linked in order.`],
        });

        return {
          ...base,
          type: 'operationalSequence',
          sequenceKind: 'failure_chain',
          orderedEntryIds: entries.map((entry) => entry.id),
          transitionLabels: chain.orderedIncidents.map((incident) => incident.title),
          relatedIncidentIds,
        };
      })
      .filter((sequence): sequence is OperationalSequence => sequence !== null);
  }

  private static buildPatternSequences(
    sourceId: string,
    clusters: EvidenceCluster[],
    incidents: Incident[],
    generatedAt: string,
  ): OperationalSequence[] {
    return clusters.map((cluster) => {
      const relatedIncidentIds = this.findRelatedIncidentIds(cluster.evidenceRefs, incidents);
      return {
        ...cluster,
        id: this.stableEntityId('sequence-pattern', sourceId, cluster.id),
        type: 'operationalSequence',
        sequenceKind: this.sequenceKindForCategory(cluster.category),
        orderedEntryIds: cluster.evidenceRefs.map((ref) => ref.entryId),
        transitionLabels: cluster.evidenceRefs
          .slice(0, 12)
          .map((ref) => `Line ${ref.lineNumber}: ${ref.severity}`),
        relatedIncidentIds,
        createdAt: generatedAt,
      };
    });
  }

  private static buildStateSequenceEntities(
    sourceId: string,
    transitions: StateTransition[],
    entryById: Map<string, StructuredLogEntry>,
    generatedAt: string,
  ): OperationalSequence[] {
    if (transitions.length < 2) return [];
    const entries = this.sortEntries(
      transitions
        .map((transition) => entryById.get(transition.entryId))
        .filter((entry): entry is StructuredLogEntry => entry !== undefined),
    );
    if (entries.length < 2) return [];
    const first = entries[0]!;
    const last = entries[entries.length - 1]!;
    const base = this.createBaseEntity({
      id: this.stableEntityId('sequence-state', sourceId, first.lineNumber, last.lineNumber),
      type: 'operationalSequence',
      sourceId,
      title: 'Operational State Transition Sequence',
      description: `${transitions.length} state transitions reconstructed from log evidence.`,
      category: 'state_transition',
      severity: this.maxSeverity(entries),
      confidence: 0.88,
      entries,
      generatedAt,
      ruleIds: ['state-transition-reconstruction'],
      matchedSignals: transitions.map(
        (transition) => `${transition.fromState}->${transition.toState}`,
      ),
      confidenceFactors: [
        'Ordered state transitions were reconstructed from exact log references.',
      ],
    });

    return [
      {
        ...base,
        type: 'operationalSequence',
        sequenceKind: 'state_transition',
        orderedEntryIds: entries.map((entry) => entry.id),
        transitionLabels: transitions.map(
          (transition) => `${transition.fromState} -> ${transition.toState}`,
        ),
        relatedIncidentIds: [],
      },
    ];
  }

  private static buildRecoveryFlows(
    sourceId: string,
    entries: StructuredLogEntry[],
    generatedAt: string,
  ): RecoveryFlow[] {
    const flows: RecoveryFlow[] = [];
    const consumedFailures = new Set<string>();

    for (let index = 0; index < entries.length && flows.length < MAX_ENTITY_COUNT; index++) {
      const failureEntry = entries[index];
      if (!failureEntry || consumedFailures.has(failureEntry.id)) continue;
      if (!FAILURE_PATTERN.test(this.entryText(failureEntry))) continue;

      let recoveryEntry: StructuredLogEntry | null = null;
      for (let nextIndex = index + 1; nextIndex < entries.length; nextIndex++) {
        const candidate = entries[nextIndex];
        if (!candidate) continue;
        if (!this.isWithinWindow(failureEntry, candidate, RECOVERY_WINDOW_MS)) break;
        if (RECOVERY_PATTERN.test(this.entryText(candidate))) {
          recoveryEntry = candidate;
          break;
        }
      }

      if (!recoveryEntry && failureEntry.severity !== 'error') continue;
      consumedFailures.add(failureEntry.id);

      const flowEntries = recoveryEntry ? [failureEntry, recoveryEntry] : [failureEntry];
      const status: RecoveryFlow['status'] = recoveryEntry ? 'recovered' : 'failed';
      const base = this.createBaseEntity({
        id: this.stableEntityId(
          'recovery-flow',
          sourceId,
          failureEntry.lineNumber,
          recoveryEntry?.lineNumber ?? 'unresolved',
        ),
        type: 'recoveryFlow',
        sourceId,
        title: recoveryEntry ? 'Failure Recovery Flow' : 'Unresolved Recovery Flow',
        description: recoveryEntry
          ? 'A failure signal was followed by deterministic recovery evidence.'
          : 'A failure signal has no recovery evidence inside the recovery window.',
        category: 'recovery_flow',
        severity: recoveryEntry ? 'warn' : 'error',
        confidence: recoveryEntry ? 0.86 : 0.74,
        entries: flowEntries,
        generatedAt,
        ruleIds: ['recovery-flow-detector'],
        matchedSignals: recoveryEntry
          ? [this.entryText(failureEntry), this.entryText(recoveryEntry)]
          : [this.entryText(failureEntry)],
        confidenceFactors: recoveryEntry
          ? ['Failure and recovery entries were found inside the recovery window.']
          : ['Failure entry remained unresolved within the recovery window.'],
      });

      flows.push({
        ...base,
        type: 'recoveryFlow',
        recoveryKind: this.classifyRecoveryKind(recoveryEntry),
        status,
        startLineNumber: failureEntry.lineNumber,
        endLineNumber: recoveryEntry?.lineNumber ?? null,
      });
    }

    return flows;
  }

  private static createBaseEntity(input: EntityBaseInput): InvestigationEntityBase {
    const sortedEntries = this.sortEntries(input.entries);
    const evidenceRefs = this.retainEvidenceRefs(sortedEntries);
    const first = sortedEntries[0];
    const last = sortedEntries[sortedEntries.length - 1];
    const durationMs =
      first?.timestampEpochMs !== null &&
      first?.timestampEpochMs !== undefined &&
      last?.timestampEpochMs !== null &&
      last?.timestampEpochMs !== undefined
        ? last.timestampEpochMs - first.timestampEpochMs
        : null;

    return {
      id: input.id,
      type: input.type,
      sourceId: input.sourceId,
      title: input.title,
      description: input.description,
      category: input.category,
      severity: input.severity,
      confidence: input.confidence,
      timestampStart: first?.timestamp ?? null,
      timestampEnd: last?.timestamp ?? null,
      durationMs,
      evidenceRefs,
      evidenceSummary: this.buildEvidenceSummary(sortedEntries, evidenceRefs),
      explanation: this.createExplanation(input, evidenceRefs),
      createdAt: input.generatedAt,
    };
  }

  private static createExplanation(
    input: EntityBaseInput,
    evidenceRefs: EvidenceReference[],
  ): EntityExplainability {
    return {
      summary: input.description,
      ruleIds: input.ruleIds,
      matchedSignals: input.matchedSignals.slice(0, 20),
      evidenceLineNumbers: evidenceRefs.map((ref) => ref.lineNumber),
      confidenceFactors: input.confidenceFactors,
      limitations: input.limitations ?? [],
    };
  }

  private static buildTimelineEvents(
    sourceId: string,
    entities: InvestigationEntityBase[],
  ): OperationalTimelineEvent[] {
    return entities
      .map((entity) => {
        const firstRef = entity.evidenceRefs[0];
        return {
          id: this.stableEntityId('timeline', sourceId, entity.id),
          sourceId,
          entityId: entity.id,
          entityType: entity.type,
          title: entity.title,
          timestamp: firstRef?.timestamp ?? entity.timestampStart,
          timestampEpochMs: firstRef?.timestampEpochMs ?? null,
          lineNumber: firstRef?.lineNumber ?? entity.evidenceSummary.lineStart,
          severity: entity.severity,
          orderingKey: firstRef?.orderingKey ?? entity.evidenceSummary.lineStart ?? 0,
          evidenceRefs: firstRef ? [firstRef] : [],
        };
      })
      .sort((a, b) => a.orderingKey - b.orderingKey);
  }

  private static groupEntriesByWindow(
    entries: StructuredLogEntry[],
    windowMs: number,
  ): StructuredLogEntry[][] {
    const sortedEntries = this.sortEntries(entries);
    const groups: StructuredLogEntry[][] = [];
    let currentGroup: StructuredLogEntry[] = [];

    for (const entry of sortedEntries) {
      const previous = currentGroup[currentGroup.length - 1];
      if (!previous) {
        currentGroup = [entry];
        continue;
      }

      if (this.isWithinWindow(previous, entry, windowMs)) {
        currentGroup.push(entry);
      } else {
        groups.push(currentGroup);
        currentGroup = [entry];
      }
    }

    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    return groups;
  }

  private static isWithinWindow(
    first: StructuredLogEntry,
    second: StructuredLogEntry,
    windowMs: number,
  ): boolean {
    if (first.timestampEpochMs !== null && second.timestampEpochMs !== null) {
      return second.timestampEpochMs - first.timestampEpochMs <= windowMs;
    }

    return second.lineNumber - first.lineNumber <= TEMPORAL_FALLBACK_LINE_WINDOW;
  }

  private static retainEvidenceRefs(entries: StructuredLogEntry[]): EvidenceReference[] {
    const refs = this.sortEntries(entries).map((entry) => this.toEvidenceReference(entry));
    if (refs.length <= MAX_ENTITY_EVIDENCE_REFS) {
      return refs;
    }

    const headCount = Math.ceil(MAX_ENTITY_EVIDENCE_REFS * 0.7);
    const tailCount = MAX_ENTITY_EVIDENCE_REFS - headCount;
    return [...refs.slice(0, headCount), ...refs.slice(-tailCount)];
  }

  private static buildEvidenceSummary(
    entries: StructuredLogEntry[],
    evidenceRefs: EvidenceReference[],
  ): EntityEvidenceSummary {
    const lineNumbers = entries.map((entry) => entry.lineNumber);
    return {
      totalFrames: entries.length,
      retainedFrames: evidenceRefs.length,
      truncated: evidenceRefs.length < entries.length,
      lineStart: lineNumbers.length > 0 ? Math.min(...lineNumbers) : null,
      lineEnd: lineNumbers.length > 0 ? Math.max(...lineNumbers) : null,
    };
  }

  private static toEvidenceReference(entry: StructuredLogEntry): EvidenceReference {
    return {
      id: `evidence:${entry.sourceId}:${entry.id}`,
      sourceId: entry.sourceId,
      filePath: entry.filePath,
      chunkId: entry.chunkId,
      entryId: entry.id,
      lineNumber: entry.lineNumber,
      byteStart: entry.byteStart,
      byteEnd: entry.byteEnd,
      timestamp: entry.timestamp,
      timestampEpochMs: entry.timestampEpochMs,
      severity: entry.severity,
      source: entry.source,
      message: entry.message,
      raw: entry.raw,
      orderingKey: entry.timestampEpochMs ?? entry.lineNumber,
    };
  }

  private static sortEntries(entries: StructuredLogEntry[]): StructuredLogEntry[] {
    return [...entries].sort((a, b) => {
      const aKey = a.timestampEpochMs ?? a.lineNumber;
      const bKey = b.timestampEpochMs ?? b.lineNumber;
      if (aKey !== bKey) return aKey - bKey;
      return a.lineNumber - b.lineNumber;
    });
  }

  private static entryText(entry: StructuredLogEntry): string {
    return entry.message || entry.raw || '';
  }

  private static maxSeverity(entries: StructuredLogEntry[]): LogSeverity {
    const order: LogSeverity[] = ['error', 'warn', 'info', 'debug', 'neutral'];
    for (const severity of order) {
      if (entries.some((entry) => entry.severity === severity)) {
        return severity;
      }
    }
    return 'neutral';
  }

  private static getDominantSources(entries: StructuredLogEntry[]): string[] {
    const counts = new Map<string, number>();
    for (const entry of entries) {
      const source = entry.source || 'unknown';
      counts.set(source, (counts.get(source) ?? 0) + 1);
    }

    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([source]) => source);
  }

  private static findRelatedIncidentIds(
    evidenceRefs: EvidenceReference[],
    incidents: Incident[],
  ): string[] {
    const evidenceEntryIds = new Set(evidenceRefs.map((ref) => ref.entryId));
    return incidents
      .filter((incident) => incident.entryIds.some((entryId) => evidenceEntryIds.has(entryId)))
      .map((incident) => incident.id);
  }

  private static sequenceKindForCategory(
    category: OperationalPatternCategory,
  ): OperationalSequence['sequenceKind'] {
    if (category === 'retry_storm' || category === 'api_retry_storm') return 'retry_storm';
    if (category === 'timeout_chain' || category === 'payment_timeout') return 'timeout_chain';
    if (category === 'reset_loop' || category === 'reset_cycle') return 'reset_loop';
    if (category === 'heartbeat_instability' || category === 'heartbeat_dropout') {
      return 'heartbeat_instability';
    }
    if (category === 'payment_failure') return 'payment_flow';
    return 'state_transition';
  }

  private static classifyRecoveryKind(
    entry: StructuredLogEntry | null,
  ): RecoveryFlow['recoveryKind'] {
    if (!entry) return 'unknown';
    const text = this.entryText(entry);
    if (/auto|retry|watchdog|self-heal/i.test(text)) return 'automatic';
    if (/manual|operator|user/i.test(text)) return 'manual';
    return 'unknown';
  }

  private static stableEntityId(prefix: string, ...parts: Array<string | number>): string {
    const source = parts.join('|');
    return `entity:${prefix}:${this.stableHash(source)}`;
  }

  private static stableHash(value: string): string {
    let hash = 5381;
    for (let index = 0; index < value.length; index++) {
      hash = (hash * 33) ^ value.charCodeAt(index);
    }
    return (hash >>> 0).toString(36);
  }
}
