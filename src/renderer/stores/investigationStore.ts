import { create } from 'zustand';

import { useFileMonitorStore } from './fileMonitorStore';
import { useLayoutStore } from './layoutStore';
import { useSearchStore } from './searchStore';
import { useViewerStore } from './viewerStore';
import type { EvidenceItem } from '@shared/contracts/evidence';
import type {
  Investigation,
  InvestigationMode,
  EvidenceBookmark,
  SavedFilter,
  InvestigationSnapshot,
} from '@shared/contracts/investigations';
import type { ExtractedRule } from '@shared/contracts/knowledge';

interface InvestigationStoreState {
  activeInvestigationId: string | null;
  investigationsById: Record<string, Investigation>;
  investigationsList: string[];
  evidenceById: Record<string, EvidenceItem>;

  // Actions
  setActiveInvestigation: (investigationId: string | null) => void;
  upsertInvestigation: (investigation: Investigation) => void;
  upsertEvidence: (evidence: EvidenceItem) => void;

  // Case Management Actions
  createNewInvestigationCase: (title: string) => void;
  deleteInvestigationCase: (id: string) => void;
  exportInvestigationCase: (id: string) => string;
  importInvestigationCase: (bundleJson: string) => void;

  // Layout Preset Selector Action
  applyLayoutPreset: (preset: 'rca' | 'explorer' | 'split' | 'replay') => void;

  // Custom Rules Actions
  addCustomRule: (rule: Omit<ExtractedRule, 'ruleId'>) => void;
  deleteCustomRule: (ruleId: string) => void;

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
  investigationsList: [],
  evidenceById: {},

  setActiveInvestigation: (investigationId): void => {
    set({ activeInvestigationId: investigationId });
  },

  upsertInvestigation: (investigation): void => {
    set((state) => {
      const nextList = state.investigationsList.includes(investigation.id)
        ? state.investigationsList
        : [...state.investigationsList, investigation.id];
      return {
        investigationsById: {
          ...state.investigationsById,
          [investigation.id]: investigation,
        },
        investigationsList: nextList,
      };
    });
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
          investigationsList: [DEFAULT_INVESTIGATION_ID],
          investigationsById: {
            ...state.investigationsById,
            [DEFAULT_INVESTIGATION_ID]: draft,
          },
        }));
      } else {
        set((state) => ({
          activeInvestigationId: DEFAULT_INVESTIGATION_ID,
          investigationsList: state.investigationsList.includes(DEFAULT_INVESTIGATION_ID)
            ? state.investigationsList
            : [...state.investigationsList, DEFAULT_INVESTIGATION_ID],
        }));
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
            bookmarks: inv.bookmarks.map((b) => (b.id === bookmarkId ? { ...b, note } : b)),
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
    const searchState = useSearchStore.getState();
    const viewerState = useViewerStore.getState();
    set((state) => {
      const inv = state.investigationsById[activeId];
      if (!inv) return {};

      const sourceId = activeSourceId || viewerState.selectedFilePath;
      const newSnapshot: InvestigationSnapshot = {
        id: crypto.randomUUID(),
        title,
        timestamp: new Date().toISOString(),
        activeSourceId: sourceId,
        savedFilters: [...inv.savedFilters],
        bookmarks: [...inv.bookmarks],
        notes: inv.notes,
        searchQuery: searchState.searchQuery,
        searchOptions: {
          isRegex: searchState.isRegex,
          isCaseSensitive: searchState.isCaseSensitive,
          isWholeWord: searchState.isWholeWord,
        },
        focusedLineNumber: viewerState.selectedLineEntry?.lineNumber ?? null,
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

      // Restore search state
      if (snap.searchQuery !== undefined) {
        useSearchStore.setState({
          searchQuery: snap.searchQuery,
          isRegex: snap.searchOptions?.isRegex ?? false,
          isCaseSensitive: snap.searchOptions?.isCaseSensitive ?? false,
          isWholeWord: snap.searchOptions?.isWholeWord ?? false,
        });
      }

      // Restore file tab & viewport scroll focus
      if (snap.activeSourceId) {
        void useFileMonitorStore
          .getState()
          .selectFile(snap.activeSourceId)
          .then(() => {
            if (snap.focusedLineNumber != null) {
              useViewerStore
                .getState()
                .scrollToLineRowIndex(snap.focusedLineNumber - 1, snap.activeSourceId!);
            }
          });
      }

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

  createNewInvestigationCase: (title: string): void => {
    const id = `case-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const newCase: Investigation = {
      id,
      title,
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
      customRules: [],
    };
    set((state) => ({
      activeInvestigationId: id,
      investigationsList: [...state.investigationsList, id],
      investigationsById: {
        ...state.investigationsById,
        [id]: newCase,
      },
    }));
  },

  deleteInvestigationCase: (id: string): void => {
    set((state) => {
      const nextById = { ...state.investigationsById };
      delete nextById[id];
      const nextList = state.investigationsList.filter((item) => item !== id);
      
      let nextActiveId = state.activeInvestigationId;
      if (state.activeInvestigationId === id) {
        nextActiveId = nextList[0] || null;
      }
      
      return {
        investigationsById: nextById,
        investigationsList: nextList,
        activeInvestigationId: nextActiveId,
      };
    });
    // Ensure we have at least one active investigation
    get().ensureActiveInvestigation();
  },

  exportInvestigationCase: (id: string): string => {
    const state = get();
    const inv = state.investigationsById[id];
    if (!inv) {
      throw new Error(`Case ${id} not found.`);
    }
    return JSON.stringify(inv, null, 2);
  },

  importInvestigationCase: (bundleJson: string): void => {
    try {
      const parsed = JSON.parse(bundleJson) as Partial<Investigation>;
      if (!parsed.id || !parsed.title) {
        throw new Error('Invalid bundle format: Missing id or title.');
      }
      const inv: Investigation = {
        id: parsed.id,
        title: parsed.title,
        mode: parsed.mode || 'investigation',
        sourceIds: parsed.sourceIds || [],
        incidentIds: parsed.incidentIds || [],
        evidenceIds: parsed.evidenceIds || [],
        createdAt: parsed.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: parsed.status || 'active',
        savedFilters: parsed.savedFilters || [],
        bookmarks: parsed.bookmarks || [],
        notes: parsed.notes || '',
        snapshots: parsed.snapshots || [],
        customRules: parsed.customRules || [],
      };
      set((state) => {
        const nextList = state.investigationsList.includes(inv.id)
          ? state.investigationsList
          : [...state.investigationsList, inv.id];
        return {
          investigationsById: {
            ...state.investigationsById,
            [inv.id]: inv,
          },
          investigationsList: nextList,
          activeInvestigationId: inv.id,
        };
      });
    } catch (e) {
      console.error('Failed to import case bundle:', e);
      throw e;
    }
  },

  applyLayoutPreset: (preset): void => {
    const layoutStore = useLayoutStore;
    
    if (preset === 'rca') {
      layoutStore.setState({
        activeSidePanel: 'investigations',
        isSidePanelVisible: true,
        activeBottomPanel: 'diagnostics',
        isBottomPanelVisible: true,
      });
      useViewerStore.setState({ isSplitActive: false });
    } else if (preset === 'explorer') {
      layoutStore.setState({
        activeSidePanel: 'explorer',
        isSidePanelVisible: true,
        isBottomPanelVisible: false,
      });
      useViewerStore.setState({ isSplitActive: false });
    } else if (preset === 'split') {
      layoutStore.setState({
        activeSidePanel: 'timeline',
        isSidePanelVisible: true,
        isBottomPanelVisible: false,
      });
      useViewerStore.setState({
        isSplitActive: true,
        isScrollSyncActive: true,
      });
    } else if (preset === 'replay') {
      layoutStore.setState({
        activeSidePanel: 'investigations',
        isSidePanelVisible: true,
        isBottomPanelVisible: false,
      });
      useViewerStore.setState({ isSplitActive: false });
    }
  },

  addCustomRule: (ruleData): void => {
    const activeId = get().ensureActiveInvestigation();
    const newRule: ExtractedRule = {
      ...ruleData,
      ruleId: `custom-rule-${crypto.randomUUID()}`,
    };
    set((state) => {
      const inv = state.investigationsById[activeId];
      if (!inv) return {};
      const currentRules = inv.customRules || [];
      return {
        investigationsById: {
          ...state.investigationsById,
          [activeId]: {
            ...inv,
            customRules: [...currentRules, newRule],
            updatedAt: new Date().toISOString(),
          },
        },
      };
    });
  },

  deleteCustomRule: (ruleId): void => {
    const activeId = get().ensureActiveInvestigation();
    set((state) => {
      const inv = state.investigationsById[activeId];
      if (!inv) return {};
      const currentRules = inv.customRules || [];
      return {
        investigationsById: {
          ...state.investigationsById,
          [activeId]: {
            ...inv,
            customRules: currentRules.filter((r) => r.ruleId !== ruleId),
            updatedAt: new Date().toISOString(),
          },
        },
      };
    });
  },
}));
