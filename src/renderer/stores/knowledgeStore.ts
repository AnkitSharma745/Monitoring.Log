import { create } from 'zustand';
import { getEngineWorkerClient } from '@renderer/services/workerClient';
import type {
  IngestedDocument,
  TroubleshooterMatch,
  KnowledgeQueryResult,
} from '@shared/contracts/knowledge';
import type { EngineWorkerRequest } from '@workers/workerProtocol';

export interface KnowledgeStoreState {
  ingestedDocuments: IngestedDocument[];
  troubleshooterMatches: TroubleshooterMatch[];
  queryResults: KnowledgeQueryResult[];
  loading: boolean;
  activeSymptomMatch: TroubleshooterMatch | null;
  searchTerm: string;

  ingestDocument: (
    name: string,
    content: string,
    filePath?: string,
  ) => Promise<IngestedDocument | null>;
  queryKnowledge: (query: string) => Promise<void>;
  fetchTroubleshooterMatches: (sourceId: string) => Promise<void>;
  setActiveSymptomMatch: (match: TroubleshooterMatch | null) => void;
  clearSearch: () => void;
  setSearchTerm: (term: string) => void;
}

export const useKnowledgeStore = create<KnowledgeStoreState>((set) => ({
  ingestedDocuments: [],
  troubleshooterMatches: [],
  queryResults: [],
  loading: false,
  activeSymptomMatch: null,
  searchTerm: '',

  ingestDocument: async (
    name: string,
    content: string,
    filePath?: string,
  ): Promise<IngestedDocument | null> => {
    set({ loading: true });
    try {
      const workerClient = getEngineWorkerClient();
      const requestId = `ingest:${name}:${Date.now()}`;

      const payload: EngineWorkerRequest = {
        type: 'ingestDocument',
        requestId,
        name,
        content,
      };
      if (filePath !== undefined) {
        payload.filePath = filePath;
      }

      const response = await workerClient.request(payload);

      if (response.type === 'ingestDocument:done') {
        const { document } = response;
        set((state) => {
          const docs = [...state.ingestedDocuments];
          const existingIdx = docs.findIndex((d) => d.name === name);
          if (existingIdx !== -1) {
            docs[existingIdx] = document;
          } else {
            docs.push(document);
          }
          return {
            ingestedDocuments: docs,
            loading: false,
          };
        });
        return document;
      }
      set({ loading: false });
      return null;
    } catch (err) {
      console.error('Failed to ingest document:', err);
      set({ loading: false });
      return null;
    }
  },

  queryKnowledge: async (query: string): Promise<void> => {
    if (!query.trim()) {
      set({ queryResults: [], searchTerm: '' });
      return;
    }

    set({ loading: true, searchTerm: query });
    try {
      const workerClient = getEngineWorkerClient();
      const requestId = `query:${query}:${Date.now()}`;

      const response = await workerClient.request({
        type: 'queryKnowledgeBase',
        requestId,
        query,
      });

      if (response.type === 'queryKnowledgeBase:done') {
        set({ queryResults: response.results, loading: false });
      } else {
        set({ loading: false });
      }
    } catch (err) {
      console.error('Failed to query knowledge base:', err);
      set({ loading: false });
    }
  },

  fetchTroubleshooterMatches: async (sourceId: string): Promise<void> => {
    set({ loading: true });
    try {
      const workerClient = getEngineWorkerClient();
      const requestId = `troubleshooter:${sourceId}:${Date.now()}`;

      const response = await workerClient.request({
        type: 'getTroubleshooterMatches',
        requestId,
        sourceId,
      });

      if (response.type === 'getTroubleshooterMatches:done') {
        set((state) => {
          // If we had an active match, check if it's still present in the matches
          const prevActive = state.activeSymptomMatch;
          let nextActive = null;
          if (prevActive) {
            nextActive =
              response.matches.find((m) => m.symptom.id === prevActive.symptom.id) || null;
          }
          // Default to the first match if nothing is selected yet
          if (!nextActive && response.matches.length > 0) {
            nextActive = response.matches[0]!;
          }

          return {
            troubleshooterMatches: response.matches,
            activeSymptomMatch: nextActive,
            loading: false,
          };
        });
      } else {
        set({ loading: false });
      }
    } catch (err) {
      console.error('Failed to fetch troubleshooter matches:', err);
      set({ loading: false });
    }
  },

  setActiveSymptomMatch: (match: TroubleshooterMatch | null): void => {
    set({ activeSymptomMatch: match });
  },

  clearSearch: (): void => {
    set({ queryResults: [], searchTerm: '' });
  },

  setSearchTerm: (term: string): void => {
    set({ searchTerm: term });
  },
}));
