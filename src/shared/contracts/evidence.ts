export interface EvidenceLineRange {
  startLine: number;
  endLine: number;
}

export interface EvidenceTimestampRange {
  start: string | null;
  end: string | null;
}

export type EvidenceCreator = 'user' | 'rule' | 'ai';

export interface EvidenceItem {
  id: string;
  sourceId: string;
  entryIds: string[];
  lineRange: EvidenceLineRange;
  timestampRange: EvidenceTimestampRange;
  label: string;
  reason: string;
  createdBy: EvidenceCreator;
  confidence: number;
  createdAt: string;
}

export interface BusinessRuleReference {
  id: string;
  title: string;
  sourceDocumentId: string;
  section: string | null;
  expectedBehavior: string;
}

export interface KnownIncidentReference {
  id: string;
  title: string;
  similarityScore: number;
  evidenceItemIds: string[];
}
