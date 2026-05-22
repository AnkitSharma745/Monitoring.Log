import { create } from 'zustand';

import type { EvidenceItem } from '@shared/contracts/evidence';
import type {
  Investigation,
  InvestigationMode,
  EvidenceBookmark,
  SavedFilter,
  InvestigationSnapshot,
} from '@shared/contracts/investigations';

interface InvestigationStoreState {
  activeInvestigationId: string | null;
  investigationsById: Record<string, Investigation>;
  evidenceById: Record<string, EvidenceItem>;

  // Actions
  setActiveInvestigation: (investigationId: string | null) => void;
  upsertInvestigation: (investigation: Investigation) => void;
  upsertEvidence: (evidence: EvidenceItem) => void;

  // Workspace Actions (operating on active investigation)
  setInvestigationMode: (mode: InvestigationMode) => void;
  updateNotes: (notes: string) => void;
  addBookmark: (bookmark: Omit<EvidenceBookmark, 'id' | 'createdAt'>) => void;
  removeBookmark: (bookmarkId: string) => void;
  updateBookmarkNote: (bookmarkId: string, note: string) => void;
  saveFilter: (filter: Omit<SavedFilter, 'id'>) => void;
  removeSavedFilter: (filterId: string) => void;
  takeSnapshot: (title: string, activeSourceId: string | null) => void;
  restoreSnapshot: (snapshotId: string) => void;
  ensureActiveInvestigation: () => string; // returns active ID, creating one if empty
}

const DEFAULT_INVESTIGATION_ID = 'default-investigation-workspace';

const createDefaultInvestigation = (): Investigation => {
  const now = new Date().toISOString();
  return {
    id: DEFAULT_INVESTIGATION_ID,
    title: 'Workspace Investigation (Draft)',
    mode: 'investigation',
    sourceIds: [],
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

export const useInvestigationStore = create<InvestigationStoreState>((set, get) => ({
  activeInvestigationId: null,
  investigationsById: {},
  evidenceById: {},

  setActiveInvestigation: (investigationId): void => {
    set({ activeInvestigationId: investigationId });
  },

  upsertInvestigation: (investigation): void => {
    set((state) => ({
      investigationsById: {
        ...state.investigationsById,
        [investigation.id]: investigation,
      },
    }));
  },

  upsertEvidence: (evidence): void => {
    set((state) => ({
      evidenceById: {
        ...state.evidenceById,
        [evidence.id]: evidence,
      },
    }));
  },

  ensureActiveInvestigation: (): string => {
    const state = get();
    let activeId = state.activeInvestigationId;

    if (!activeId) {
      activeId = DEFAULT_INVESTIGATION_ID;
      if (!state.investigationsById[DEFAULT_INVESTIGATION_ID]) {
        const draft = createDefaultInvestigation();
        set((state) => ({
          activeInvestigationId: DEFAULT_INVESTIGATION_ID,
          investigationsById: {
            ...state.investigationsById,
            [DEFAULT_INVESTIGATION_ID]: draft,
          },
        }));
      } else {
        set({ activeInvestigationId: DEFAULT_INVESTIGATION_ID });
      }
    }
    return activeId;
  },

  setInvestigationMode: (mode): void => {
    const activeId = get().ensureActiveInvestigation();
    set((state) => {
      const inv = state.investigationsById[activeId];
      if (!inv) return {};
      return {
        investigationsById: {
          ...state.investigationsById,
          [activeId]: {
            ...inv,
            mode,
            updatedAt: new Date().toISOString(),
          },
        },
      };
    });
  },

  updateNotes: (notes): void => {
    const activeId = get().ensureActiveInvestigation();
    set((state) => {
      const inv = state.investigationsById[activeId];
      if (!inv) return {};
      return {
        investigationsById: {
          ...state.investigationsById,
          [activeId]: {
            ...inv,
            notes,
            updatedAt: new Date().toISOString(),
          },
        },
      };
    });
  },

  addBookmark: (bookmarkData): void => {
    const activeId = get().ensureActiveInvestigation();
    const newBookmark: EvidenceBookmark = {
      ...bookmarkData,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };

    set((state) => {
      const inv = state.investigationsById[activeId];
      if (!inv) return {};
      return {
        investigationsById: {
          ...state.investigationsById,
          [activeId]: {
            ...inv,
            bookmarks: [...inv.bookmarks, newBookmark],
            updatedAt: new Date().toISOString(),
          },
        },
      };
    });
  },

  removeBookmark: (bookmarkId): void => {
    const activeId = get().ensureActiveInvestigation();
    set((state) => {
      const inv = state.investigationsById[activeId];
      if (!inv) return {};
      return {
        investigationsById: {
          ...state.investigationsById,
          [activeId]: {
            ...inv,
            bookmarks: inv.bookmarks.filter((b) => b.id !== bookmarkId),
            updatedAt: new Date().toISOString(),
          },
        },
      };
    });
  },

  updateBookmarkNote: (bookmarkId, note): void => {
    const activeId = get().ensureActiveInvestigation();
    set((state) => {
      const inv = state.investigationsById[activeId];
      if (!inv) return {};
      return {
        investigationsById: {
          ...state.investigationsById,
          [activeId]: {
            ...inv,
            bookmarks: inv.bookmarks.map((b) =>
              b.id === bookmarkId ? { ...b, note } : b
            ),
            updatedAt: new Date().toISOString(),
          },
        },
      };
    });
  },

  saveFilter: (filterData): void => {
    const activeId = get().ensureActiveInvestigation();
    const newFilter: SavedFilter = {
      ...filterData,
      id: crypto.randomUUID(),
    };

    set((state) => {
      const inv = state.investigationsById[activeId];
      if (!inv) return {};
      return {
        investigationsById: {
          ...state.investigationsById,
          [activeId]: {
            ...inv,
            savedFilters: [...inv.savedFilters, newFilter],
            updatedAt: new Date().toISOString(),
          },
        },
      };
    });
  },

  removeSavedFilter: (filterId): void => {
    const activeId = get().ensureActiveInvestigation();
    set((state) => {
      const inv = state.investigationsById[activeId];
      if (!inv) return {};
      return {
        investigationsById: {
          ...state.investigationsById,
          [activeId]: {
            ...inv,
            savedFilters: inv.savedFilters.filter((f) => f.id !== filterId),
            updatedAt: new Date().toISOString(),
          },
        },
      };
    });
  },

  takeSnapshot: (title, activeSourceId): void => {
    const activeId = get().ensureActiveInvestigation();
    set((state) => {
      const inv = state.investigationsById[activeId];
      if (!inv) return {};

      const newSnapshot: InvestigationSnapshot = {
        id: crypto.randomUUID(),
        title,
        timestamp: new Date().toISOString(),
        activeSourceId,
        savedFilters: [...inv.savedFilters],
        bookmarks: [...inv.bookmarks],
        notes: inv.notes,
      };

      return {
        investigationsById: {
          ...state.investigationsById,
          [activeId]: {
            ...inv,
            snapshots: [...inv.snapshots, newSnapshot],
            updatedAt: new Date().toISOString(),
          },
        },
      };
    });
  },

  restoreSnapshot: (snapshotId): void => {
    const activeId = get().ensureActiveInvestigation();
    set((state) => {
      const inv = state.investigationsById[activeId];
      if (!inv) return {};

      const snap = inv.snapshots.find((s) => s.id === snapshotId);
      if (!snap) return {};

      return {
        investigationsById: {
          ...state.investigationsById,
          [activeId]: {
            ...inv,
            savedFilters: [...snap.savedFilters],
            bookmarks: [...snap.bookmarks],
            notes: snap.notes,
            updatedAt: new Date().toISOString(),
          },
        },
      };
    });
  },
}));
