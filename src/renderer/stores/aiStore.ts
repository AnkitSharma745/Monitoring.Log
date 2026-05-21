import { create } from 'zustand';

import type { AiEvidenceResponse, EvidencePack } from '@shared/contracts/ai';

interface AiStoreState {
  activeEvidencePackId: string | null;
  evidencePacksById: Record<string, EvidencePack>;
  responsesById: Record<string, AiEvidenceResponse>;
  upsertEvidencePack: (evidencePack: EvidencePack) => void;
  upsertResponse: (response: AiEvidenceResponse) => void;
}

export const useAiStore = create<AiStoreState>((set) => ({
  activeEvidencePackId: null,
  evidencePacksById: {},
  responsesById: {},

  upsertEvidencePack: (evidencePack): void => {
    set((state) => ({
      activeEvidencePackId: evidencePack.id,
      evidencePacksById: {
        ...state.evidencePacksById,
        [evidencePack.id]: evidencePack,
      },
    }));
  },

  upsertResponse: (response): void => {
    set((state) => ({
      responsesById: {
        ...state.responsesById,
        [response.id]: response,
      },
    }));
  },
}));
