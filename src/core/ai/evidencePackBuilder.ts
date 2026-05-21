import type { EvidencePack } from '@shared/contracts/ai';
import type { BusinessRuleReference, KnownIncidentReference } from '@shared/contracts/evidence';
import type { HardwareContext } from '@shared/contracts/hardware';
import type { StructuredLogEntry } from '@shared/contracts/logs';

export interface BuildEvidencePackInput {
  investigationId: string;
  question: string;
  entries: StructuredLogEntry[];
  businessRules?: BusinessRuleReference[];
  hardwareContext?: HardwareContext[];
  knownIncidents?: KnownIncidentReference[];
}

export const buildEvidencePack = ({
  investigationId,
  question,
  entries,
  businessRules = [],
  hardwareContext = [],
  knownIncidents = [],
}: BuildEvidencePackInput): EvidencePack => {
  return {
    id: crypto.randomUUID(),
    investigationId,
    question,
    entries,
    businessRules,
    hardwareContext,
    knownIncidents,
    constraints: [
      'Use only cited evidence.',
      'Separate observed facts from probable interpretation.',
      'Report insufficient evidence when citations do not support a claim.',
    ],
    createdAt: new Date().toISOString(),
  };
};
