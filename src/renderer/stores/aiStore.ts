import { create } from 'zustand';
import { getEngineWorkerClient } from '@renderer/services/workerClient';
import type { AiEvidenceResponse, EvidencePack } from '@shared/contracts/ai';
import type { Incident } from '@shared/contracts/investigations';
import type { StructuredLogEntry } from '@shared/contracts/logs';

interface AiStoreState {
  activeEvidencePackId: string | null;
  evidencePacksById: Record<string, EvidencePack>;
  responsesById: Record<string, AiEvidenceResponse>;
  activeResponse: AiEvidenceResponse | null;
  semanticMatches: StructuredLogEntry[];
  similarIncidents: Incident[];
  loading: boolean;
  error: string | null;

  upsertEvidencePack: (evidencePack: EvidencePack) => void;
  upsertResponse: (response: AiEvidenceResponse) => void;

  runSemanticSearchAssist: (sourceId: string, query: string) => Promise<void>;
  findSimilarIncidents: (sourceId: string, incidentId: string) => Promise<void>;
  runAiReasoning: (
    investigationId: string,
    question: string,
    entries: StructuredLogEntry[],
  ) => Promise<AiEvidenceResponse | null>;
  clearActiveResponse: () => void;
}

export const useAiStore = create<AiStoreState>((set) => ({
  activeEvidencePackId: null,
  evidencePacksById: {},
  responsesById: {},
  activeResponse: null,
  semanticMatches: [],
  similarIncidents: [],
  loading: false,
  error: null,

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
      activeResponse: response,
      responsesById: {
        ...state.responsesById,
        [response.id]: response,
      },
    }));
  },

  runSemanticSearchAssist: async (sourceId, query): Promise<void> => {
    if (!query.trim()) {
      set({ semanticMatches: [] });
      return;
    }
    set({ loading: true, error: null });
    try {
      const client = getEngineWorkerClient();
      const requestId = `semantic-search:${sourceId}:${Date.now()}`;

      const res = await client.request({
        type: 'searchSemanticAssist',
        requestId,
        query,
        sourceId,
      });

      if (res.type === 'searchSemanticAssist:done') {
        set({ semanticMatches: res.results, loading: false });
      } else {
        set({ loading: false, error: 'Semantic search returned unexpected payload.' });
      }
    } catch (err) {
      console.error('Semantic assist search failed:', err);
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Unknown search failure.',
      });
    }
  },

  findSimilarIncidents: async (sourceId, incidentId): Promise<void> => {
    set({ loading: true, error: null });
    try {
      const client = getEngineWorkerClient();
      const requestId = `similar-incidents:${incidentId}:${Date.now()}`;

      const res = await client.request({
        type: 'findSimilarIncidents',
        requestId,
        incidentId,
        sourceId,
      });

      if (res.type === 'findSimilarIncidents:done') {
        set({ similarIncidents: res.incidents, loading: false });
      } else {
        set({ loading: false, error: 'Incident similarity query failed.' });
      }
    } catch (err) {
      console.error('Incident similarity search failed:', err);
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Unknown similarity search failure.',
      });
    }
  },

  runAiReasoning: async (
    investigationId,
    question,
    entries,
  ): Promise<AiEvidenceResponse | null> => {
    set({ loading: true, error: null, activeResponse: null });
    try {
      const client = getEngineWorkerClient();
      const now = Date.now();

      // 1. First build the Evidence Pack
      const packRes = await client.request({
        type: 'buildEvidencePack',
        requestId: `pack:${investigationId}:${now}`,
        investigationId,
        question,
        entries,
      });

      if (packRes.type !== 'buildEvidencePack:done') {
        set({ loading: false, error: 'Failed to construct evidence pack.' });
        return null;
      }

      const evidencePack = packRes.evidencePack;
      set((state) => ({
        activeEvidencePackId: evidencePack.id,
        evidencePacksById: {
          ...state.evidencePacksById,
          [evidencePack.id]: evidencePack,
        },
      }));

      // 2. Invoke local evidence analysis pipeline
      const assistRes = await client.request({
        type: 'runInvestigationAssist',
        requestId: `assist:${evidencePack.id}:${now}`,
        evidencePack,
      });

      if (assistRes.type === 'runInvestigationAssist:done') {
        const response = assistRes.response;
        set((state) => ({
          activeResponse: response,
          responsesById: {
            ...state.responsesById,
            [response.id]: response,
          },
          loading: false,
        }));
        return response;
      } else {
        set({ loading: false, error: 'Investigation assistant analysis failed.' });
        return null;
      }
    } catch (err) {
      console.error('Assistant reasoning failed:', err);
      const errMsg = err instanceof Error ? err.message : 'Unknown analysis failure.';
      set({ loading: false, error: errMsg });
      return null;
    }
  },

  clearActiveResponse: (): void => {
    set({ activeResponse: null, error: null });
  },
}));
