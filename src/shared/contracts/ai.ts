import type { BusinessRuleReference, KnownIncidentReference } from './evidence';
import type { HardwareContext } from './hardware';
import type { StructuredLogEntry } from './logs';

export interface EvidencePack {
  id: string;
  investigationId: string;
  question: string;
  entries: StructuredLogEntry[];
  businessRules: BusinessRuleReference[];
  hardwareContext: HardwareContext[];
  knownIncidents: KnownIncidentReference[];
  constraints: string[];
  createdAt: string;
}

export interface AiCitation {
  kind: 'logEntry' | 'businessRule' | 'knownIncident' | 'hardwareState';
  id: string;
  label: string;
}

export type EvidenceStrength = 'high' | 'medium' | 'low';
export type FindingCategory = 'deterministic' | 'assisted';

export interface AiEvidenceResponse {
  id: string;
  evidencePackId: string;
  summary: string;
  observedFacts: string[];
  possibleCorrelations: string[];
  missingEvidence: string[];
  evidenceStrength: EvidenceStrength;
  findingCategory: FindingCategory;
  sourcesCount: {
    logs: number;
    rules: number;
    symptoms: number;
  };
  citations: AiCitation[];
  orchestrationTrace: string[];
  createdAt: string;
}
