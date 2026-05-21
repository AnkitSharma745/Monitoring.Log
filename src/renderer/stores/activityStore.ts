import { create } from 'zustand';

export interface IngestionMetricSample {
  sourceId: string;
  receivedAt: string;
  bytesRead: number;
  lineCount: number;
}

interface ActivityStoreState {
  samples: IngestionMetricSample[];
  appendSample: (sample: IngestionMetricSample) => void;
  clearSamples: () => void;
}

export const useActivityStore = create<ActivityStoreState>((set) => ({
  samples: [],

  appendSample: (sample): void => {
    set((state) => ({
      samples: [...state.samples, sample].slice(-240),
    }));
  },

  clearSamples: (): void => {
    set({ samples: [] });
  },
}));
