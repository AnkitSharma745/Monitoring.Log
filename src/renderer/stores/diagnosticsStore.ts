import { create } from 'zustand';

export interface DiagnosticEvent {
  id: string;
  timestamp: number;
  category: 'performance' | 'file-system' | 'viewer' | 'system';
  severity: 'info' | 'warning' | 'error';
  message: string;
  durationMs?: number;
}

export interface DiagnosticsStoreState {
  events: DiagnosticEvent[];
  addEvent: (event: Omit<DiagnosticEvent, 'id' | 'timestamp'>) => void;
  clearEvents: () => void;
}

export const useDiagnosticsStore = create<DiagnosticsStoreState>((set) => ({
  events: [],

  addEvent: (event): void => {
    const newEvent: DiagnosticEvent = {
      ...event,
      id: Math.random().toString(36).substring(2, 9),
      timestamp: Date.now(),
    };

    set((state) => ({
      events: [newEvent, ...state.events].slice(0, 200), // Cap at 200 events
    }));
  },

  clearEvents: (): void => {
    set({ events: [] });
  },
}));
