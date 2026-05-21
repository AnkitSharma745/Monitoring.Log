import type {
  Investigation,
  InvestigationMode,
  InvestigationStatus,
} from '@shared/contracts/investigations';

export interface CreateInvestigationInput {
  title: string;
  mode: InvestigationMode;
  sourceIds: string[];
}

export const createInvestigation = ({
  title,
  mode,
  sourceIds,
}: CreateInvestigationInput): Investigation => {
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    title,
    mode,
    sourceIds,
    incidentIds: [],
    evidenceIds: [],
    createdAt: now,
    updatedAt: now,
    status: 'active',
    savedFilters: [],
    bookmarks: [],
    notes: '',
    snapshots: [],
  };
};

export const updateInvestigationStatus = (
  investigation: Investigation,
  status: InvestigationStatus,
): Investigation => {
  return {
    ...investigation,
    status,
    updatedAt: new Date().toISOString(),
  };
};
