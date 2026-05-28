import { create } from 'zustand';

import { getEngineWorkerClient } from '@renderer/services/workerClient';
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
  Playbook,
  RulePack,
  ObservedPattern,
  RcaDraft,
  TriageRank,
  InvestigationAuditEntry,
  StateTransition,
  DomainRuleResult,
  Incident,
  InvestigationEntitySet,
  InvestigationEntityBuildStatus,
} from '@shared/contracts/investigations';
import type { ExtractedRule } from '@shared/contracts/knowledge';
import type { StructuredLogEntry } from '@shared/contracts/logs';

interface InvestigationStoreState {
  activeInvestigationId: string | null;
  investigationsById: Record<string, Investigation>;
  investigationsList: string[];
  evidenceById: Record<string, EvidenceItem>;

  // Phase 10 Ecosystem properties
  rulePacks: RulePack[];
  activePlaybook: Playbook | null;
  observedPatterns: ObservedPattern[];
  activeRcaDrafts: Record<string, RcaDraft>;
  triageRanks: TriageRank[];
  auditLog: InvestigationAuditEntry[];
  entitySetsBySourceId: Record<string, InvestigationEntitySet>;
  entityBuildStatusBySourceId: Record<string, InvestigationEntityBuildStatus>;

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

  // Phase 10 Ecosystem Actions
  importRulePack: (packJson: string) => void;
  exportRulePack: (packId: string) => string;
  loadPlaybooks: () => void;
  executePlaybookAction: (
    playbookId: string,
    entries: StructuredLogEntry[],
    transitions: StateTransition[],
    ruleResults: DomainRuleResult[],
  ) => Promise<void>;
  promotePatternToRule: (patternId: string) => void;
  compileRcaDraft: (
    incident: Incident,
    entries: StructuredLogEntry[],
    transitions: StateTransition[],
    ruleResults: DomainRuleResult[],
  ) => Promise<void>;
  triageIncidentsAction: (incidents: Incident[], ruleResults: DomainRuleResult[]) => Promise<void>;
  detectRecurringPatternsAction: (entries: StructuredLogEntry[]) => Promise<void>;
  buildInvestigationEntitiesAction: (
    sourceId: string,
    customRules?: ExtractedRule[],
  ) => Promise<InvestigationEntitySet | null>;
  clearInvestigationEntities: (sourceId: string) => void;
  addAuditEntry: (
    action: 'rule_create' | 'rule_delete' | 'playbook_run' | 'pattern_promote' | 'case_export',
    targetId: string,
    details: string,
    evidenceLinks: Array<{ entryId: string; lineNumber: number }>,
  ) => void;
}

const DEFAULT_INVESTIGATION_ID = 'default-investigation-workspace';

const STANDARD_PLAYBOOKS: Playbook[] = [
  {
    id: 'playbook-cashless-sla',
    name: 'Cashless Transaction Response SLA Verification',
    description:
      'Validates POS transaction authorize requests, gateway latency, and SLA compliance.',
    category: 'payment',
    status: 'idle',
    steps: [
      {
        id: 'step-payment-request',
        title: 'Detect POS payment authorize requests',
        description: 'Scan log frames for cashless transaction or authorize start statements.',
        type: 'scan_keyword',
        status: 'pending',
        criteria: {
          pattern: 'payment|transaction|authorize|cashless',
        },
        matchedEntryIds: [],
        matchedLineNumbers: [],
      },
      {
        id: 'step-latency-breach',
        title: 'Check for transaction SLA latency breaches',
        description:
          'Validate authorization delays or orphaned transactions against 30s threshold.',
        type: 'correlation_check',
        status: 'pending',
        criteria: {
          expectedBehavior: 'Under 30s cashless response time compliance check.',
        },
        matchedEntryIds: [],
        matchedLineNumbers: [],
      },
    ],
  },
  {
    id: 'playbook-printer-stability',
    name: 'Thermal Printer Hardware Stability Check',
    description: 'Audits Serial/USB printer COM dropouts and auto-retry delay compliance.',
    category: 'hardware',
    status: 'idle',
    steps: [
      {
        id: 'step-printer-disconnects',
        title: 'Scan printer disconnect patterns',
        description: 'Find COM/USB port lost, failed to open, or printer offline telemetry events.',
        type: 'scan_keyword',
        status: 'pending',
        criteria: {
          pattern: 'printer|com[0-9]|serial|usb|disconnect|lost|offline',
        },
        matchedEntryIds: [],
        matchedLineNumbers: [],
      },
      {
        id: 'step-printer-retry-sla',
        title: 'Verify auto-retry routine bounds',
        description: 'Audit if reconnect sequence executes within 5 seconds of dropouts.',
        type: 'peripheral_status',
        status: 'pending',
        criteria: {
          pattern: 'printer|com[0-9]|serial|usb',
        },
        matchedEntryIds: [],
        matchedLineNumbers: [],
      },
    ],
  },
  {
    id: 'playbook-network-ping-continuity',
    name: 'Network Heartbeat Continuity Audit',
    description: 'Validates active telemetry connection pings and connection dropout limits.',
    category: 'network',
    status: 'idle',
    steps: [
      {
        id: 'step-ping-drops',
        title: 'Detect heartbeat connection drops',
        description: 'Scan telemetry for lost ping, network timeouts, or socket dropout frames.',
        type: 'scan_keyword',
        status: 'pending',
        criteria: {
          pattern: 'heartbeat|ping|disconnect|lost|timeout',
        },
        matchedEntryIds: [],
        matchedLineNumbers: [],
      },
      {
        id: 'step-watchdog-reset',
        title: 'Verify watchdog hardware reset activation',
        description:
          'Audit if 3 consecutive ping drops trigger an automatic watchdog restart sequence.',
        type: 'state_transition',
        status: 'pending',
        criteria: {
          stateName: 'FAILURE',
        },
        matchedEntryIds: [],
        matchedLineNumbers: [],
      },
    ],
  },
];

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
    customRules: [],
    rulePacks: [],
    playbooks: [...STANDARD_PLAYBOOKS],
    observedPatterns: [],
    activeRcaDrafts: {},
    auditLog: [],
  };
};

export const useInvestigationStore = create<InvestigationStoreState>((set, get) => ({
  activeInvestigationId: null,
  investigationsById: {},
  investigationsList: [],
  evidenceById: {},

  // Phase 10 state fields
  rulePacks: [],
  activePlaybook: null,
  observedPatterns: [],
  activeRcaDrafts: {},
  triageRanks: [],
  auditLog: [],
  entitySetsBySourceId: {},
  entityBuildStatusBySourceId: {},

  setActiveInvestigation: (investigationId): void => {
    set((state) => {
      const inv = investigationId ? state.investigationsById[investigationId] : null;
      return {
        activeInvestigationId: investigationId,
        rulePacks: inv?.rulePacks || [],
        activePlaybook: inv?.playbooks?.[0] || null,
        observedPatterns: inv?.observedPatterns || [],
        activeRcaDrafts: inv?.activeRcaDrafts || {},
        auditLog: inv?.auditLog || [],
      };
    });
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
          rulePacks: draft.rulePacks || [],
          activePlaybook: draft.playbooks?.[0] || null,
          observedPatterns: draft.observedPatterns || [],
          activeRcaDrafts: draft.activeRcaDrafts || {},
          auditLog: draft.auditLog || [],
        }));
      } else {
        const inv = state.investigationsById[DEFAULT_INVESTIGATION_ID]!;
        set((state) => ({
          activeInvestigationId: DEFAULT_INVESTIGATION_ID,
          investigationsList: state.investigationsList.includes(DEFAULT_INVESTIGATION_ID)
            ? state.investigationsList
            : [...state.investigationsList, DEFAULT_INVESTIGATION_ID],
          rulePacks: inv.rulePacks || [],
          activePlaybook: inv.playbooks?.[0] || null,
          observedPatterns: inv.observedPatterns || [],
          activeRcaDrafts: inv.activeRcaDrafts || {},
          auditLog: inv.auditLog || [],
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
      rulePacks: [],
      playbooks: [...STANDARD_PLAYBOOKS],
      observedPatterns: [],
      activeRcaDrafts: {},
      auditLog: [],
    };
    set((state) => ({
      activeInvestigationId: id,
      investigationsList: [...state.investigationsList, id],
      investigationsById: {
        ...state.investigationsById,
        [id]: newCase,
      },
      rulePacks: [],
      activePlaybook: newCase.playbooks?.[0] || null,
      observedPatterns: [],
      activeRcaDrafts: {},
      triageRanks: [],
      auditLog: [],
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
    // Track audit log export
    get().addAuditEntry('case_export', id, `Exported investigation case: "${inv.title}"`, []);

    // Grab updated one
    const updatedInv = get().investigationsById[id]!;
    return JSON.stringify(updatedInv, null, 2);
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
        rulePacks: parsed.rulePacks || [],
        playbooks: parsed.playbooks || [...STANDARD_PLAYBOOKS],
        observedPatterns: parsed.observedPatterns || [],
        activeRcaDrafts: parsed.activeRcaDrafts || {},
        auditLog: parsed.auditLog || [],
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
          rulePacks: inv.rulePacks || [],
          activePlaybook: inv.playbooks?.[0] || null,
          observedPatterns: inv.observedPatterns || [],
          activeRcaDrafts: inv.activeRcaDrafts || {},
          auditLog: inv.auditLog || [],
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
      const updatedInv = {
        ...inv,
        customRules: [...currentRules, newRule],
        updatedAt: new Date().toISOString(),
      };
      return {
        investigationsById: {
          ...state.investigationsById,
          [activeId]: updatedInv,
        },
      };
    });

    get().addAuditEntry(
      'rule_create',
      newRule.ruleId,
      `Created custom SLA behavior rule: "${newRule.name}" checking pattern: "${newRule.pattern}"`,
      [],
    );
  },

  deleteCustomRule: (ruleId): void => {
    const activeId = get().ensureActiveInvestigation();
    set((state) => {
      const inv = state.investigationsById[activeId];
      if (!inv) return {};
      const currentRules = inv.customRules || [];
      const updatedInv = {
        ...inv,
        customRules: currentRules.filter((r) => r.ruleId !== ruleId),
        updatedAt: new Date().toISOString(),
      };
      return {
        investigationsById: {
          ...state.investigationsById,
          [activeId]: updatedInv,
        },
      };
    });

    get().addAuditEntry(
      'rule_delete',
      ruleId,
      'Deleted custom SLA behavior rule from workspace.',
      [],
    );
  },

  // Phase 10 Ecosystem Actions
  importRulePack: (packJson): void => {
    const activeId = get().ensureActiveInvestigation();
    try {
      const pack = JSON.parse(packJson) as RulePack;
      if (!pack.id || !pack.name || !pack.rules) {
        throw new Error('Invalid Rule Pack: Must contain an id, name, and a list of rules.');
      }

      set((state) => {
        const inv = state.investigationsById[activeId];
        if (!inv) return {};

        const currentPacks = inv.rulePacks || [];
        // Prevent duplicate packs
        const nextPacks = currentPacks.filter((p) => p.id !== pack.id).concat(pack);

        // Also inject the pack's rules directly into the workspace's customRules
        const existingRules = inv.customRules || [];
        const nextRules = [...existingRules];
        pack.rules.forEach((r) => {
          if (!nextRules.some((ex) => ex.ruleId === r.ruleId)) {
            nextRules.push(r);
          }
        });

        const updatedInv: Investigation = {
          ...inv,
          rulePacks: nextPacks,
          customRules: nextRules,
          updatedAt: new Date().toISOString(),
        };

        return {
          investigationsById: {
            ...state.investigationsById,
            [activeId]: updatedInv,
          },
          rulePacks: nextPacks,
        };
      });

      get().addAuditEntry(
        'rule_create',
        pack.id,
        `Imported versioned SLA Rule Pack: "${pack.name}" v${pack.version} containing ${pack.rules.length} ASC rules.`,
        [],
      );
    } catch (e) {
      console.error('Failed to import rule pack:', e);
      throw e;
    }
  },

  exportRulePack: (packId): string => {
    const state = get();
    const activeId = state.ensureActiveInvestigation();
    const inv = state.investigationsById[activeId];
    if (!inv) {
      throw new Error('No active case loaded.');
    }
    const pack = inv.rulePacks?.find((p) => p.id === packId);
    if (!pack) {
      throw new Error(`Rule Pack ${packId} not found in this workspace.`);
    }
    return JSON.stringify(pack, null, 2);
  },

  loadPlaybooks: (): void => {
    const activeId = get().ensureActiveInvestigation();
    set((state) => {
      const inv = state.investigationsById[activeId];
      if (!inv) return {};
      const updatedInv: Investigation = {
        ...inv,
        playbooks: [...STANDARD_PLAYBOOKS],
      };
      return {
        investigationsById: {
          ...state.investigationsById,
          [activeId]: updatedInv,
        },
        activePlaybook: STANDARD_PLAYBOOKS[0] || null,
      };
    });
  },

  executePlaybookAction: async (playbookId, entries, transitions, ruleResults): Promise<void> => {
    const activeId = get().ensureActiveInvestigation();
    const inv = get().investigationsById[activeId];
    if (!inv) return;

    const playbooks = inv.playbooks || [];
    const playbook = playbooks.find((p) => p.id === playbookId);
    if (!playbook) return;

    try {
      const workerClient = getEngineWorkerClient();
      const response = await workerClient.request({
        type: 'executePlaybook',
        requestId: `playbook:${playbookId}:${Date.now()}`,
        playbook,
        entries,
        transitions,
        ruleResults,
      });

      if (response.type === 'executePlaybook:done') {
        const validatedPlaybook = response.playbook;

        set((state) => {
          const inv2 = state.investigationsById[activeId]!;
          const nextPlaybooks = (inv2.playbooks || []).map((p) =>
            p.id === playbookId ? validatedPlaybook : p,
          );

          const updatedInv: Investigation = {
            ...inv2,
            playbooks: nextPlaybooks,
            updatedAt: new Date().toISOString(),
          };

          return {
            investigationsById: {
              ...state.investigationsById,
              [activeId]: updatedInv,
            },
            activePlaybook:
              state.activePlaybook?.id === playbookId ? validatedPlaybook : state.activePlaybook,
          };
        });

        // Track audit logs for failing/passing step runs
        const auditDetails = `Executed Guided Playbook: "${playbook.name}" - Status: ${validatedPlaybook.status.toUpperCase()}`;
        const links = validatedPlaybook.steps
          .flatMap((s) =>
            s.matchedLineNumbers.map((line) => ({
              entryId: s.matchedEntryIds[0] || '',
              lineNumber: line,
            })),
          )
          .slice(0, 10);

        get().addAuditEntry('playbook_run', playbookId, auditDetails, links);
      }
    } catch (err) {
      console.error('Playbook execution failed:', err);
    }
  },

  promotePatternToRule: (patternId): void => {
    const activeId = get().ensureActiveInvestigation();
    const currentPatterns = get().observedPatterns;
    const pattern = currentPatterns.find((p) => p.id === patternId);
    if (!pattern) return;

    // Strict Product Law: Promote requires manual user intervention, never silent
    const newRule: ExtractedRule = {
      ruleId: `custom-rule-${crypto.randomUUID()}`,
      name: pattern.suggestedRuleName,
      category: pattern.incidentCategory === 'payment_timeout' ? 'payment' : 'system',
      pattern: pattern.pattern,
      expectedBehavior: pattern.suggestedExpectedBehavior,
      severity: pattern.incidentCategory === 'payment_timeout' ? 'error' : 'warn',
    };

    set((state) => {
      const inv = state.investigationsById[activeId];
      if (!inv) return {};

      const nextPatterns = state.observedPatterns.map((p) =>
        p.id === patternId ? { ...p, isApproved: true } : p,
      );

      const existingRules = inv.customRules || [];
      const updatedInv: Investigation = {
        ...inv,
        customRules: [...existingRules, newRule],
        observedPatterns: nextPatterns,
        updatedAt: new Date().toISOString(),
      };

      return {
        investigationsById: {
          ...state.investigationsById,
          [activeId]: updatedInv,
        },
        observedPatterns: nextPatterns,
      };
    });

    get().addAuditEntry(
      'pattern_promote',
      patternId,
      `Promoted observed recurring telemetry pattern: "${pattern.pattern}" into official workspace rule: "${newRule.name}".`,
      [],
    );
  },

  compileRcaDraft: async (incident, entries, transitions, ruleResults): Promise<void> => {
    const activeId = get().ensureActiveInvestigation();
    try {
      const workerClient = getEngineWorkerClient();
      const response = await workerClient.request({
        type: 'generateRcaDraft',
        requestId: `rca-draft:${incident.id}:${Date.now()}`,
        incident,
        entries,
        transitions,
        ruleResults,
      });

      if (response.type === 'generateRcaDraft:done') {
        const draft = response.draft;
        set((state) => {
          const inv = state.investigationsById[activeId]!;
          const currentDrafts = inv.activeRcaDrafts || {};
          const nextDrafts = { ...currentDrafts, [incident.id]: draft };

          const updatedInv: Investigation = {
            ...inv,
            activeRcaDrafts: nextDrafts,
            updatedAt: new Date().toISOString(),
          };

          return {
            investigationsById: {
              ...state.investigationsById,
              [activeId]: updatedInv,
            },
            activeRcaDrafts: nextDrafts,
          };
        });
      }
    } catch (e) {
      console.error('Failed to generate off-thread RCA draft:', e);
    }
  },

  triageIncidentsAction: async (incidents, ruleResults): Promise<void> => {
    if (incidents.length === 0) {
      set({ triageRanks: [] });
      return;
    }
    try {
      const workerClient = getEngineWorkerClient();
      const response = await workerClient.request({
        type: 'triageIncidents',
        requestId: `triage:${Date.now()}`,
        incidents,
        ruleResults,
      });

      if (response.type === 'triageIncidents:done') {
        set({ triageRanks: response.ranks });
      }
    } catch (e) {
      console.error('Failed to triage incidents:', e);
    }
  },

  detectRecurringPatternsAction: async (entries): Promise<void> => {
    const activeId = get().ensureActiveInvestigation();
    try {
      const workerClient = getEngineWorkerClient();
      const response = await workerClient.request({
        type: 'detectRecurringPatterns',
        requestId: `patterns-rec:${Date.now()}`,
        entries,
      });

      if (response.type === 'detectRecurringPatterns:done') {
        const patterns = response.patterns;
        set((state) => {
          const inv = state.investigationsById[activeId]!;
          const updatedInv: Investigation = {
            ...inv,
            observedPatterns: patterns,
            updatedAt: new Date().toISOString(),
          };

          return {
            investigationsById: {
              ...state.investigationsById,
              [activeId]: updatedInv,
            },
            observedPatterns: patterns,
          };
        });
      }
    } catch (e) {
      console.error('Failed to detect recurring patterns:', e);
    }
  },

  buildInvestigationEntitiesAction: async (
    sourceId,
    customRules,
  ): Promise<InvestigationEntitySet | null> => {
    const startedAt = new Date().toISOString();
    set((state) => ({
      entityBuildStatusBySourceId: {
        ...state.entityBuildStatusBySourceId,
        [sourceId]: {
          state: 'building',
          message: 'Building deterministic investigation entities...',
          updatedAt: startedAt,
        },
      },
    }));

    try {
      const workerClient = getEngineWorkerClient();
      const request =
        customRules && customRules.length > 0
          ? {
              type: 'buildInvestigationEntities' as const,
              requestId: `entities:${sourceId}:${Date.now()}`,
              sourceId,
              customRules,
            }
          : {
              type: 'buildInvestigationEntities' as const,
              requestId: `entities:${sourceId}:${Date.now()}`,
              sourceId,
            };
      const response = await workerClient.request(request);

      if (response.type === 'buildInvestigationEntities:done') {
        const entitySet = response.entitySet;
        set((state) => ({
          entitySetsBySourceId: {
            ...state.entitySetsBySourceId,
            [sourceId]: entitySet,
          },
          entityBuildStatusBySourceId: {
            ...state.entityBuildStatusBySourceId,
            [sourceId]: {
              state: 'ready',
              message: `Built ${entitySet.processingStats.entitiesDetected} deterministic entities from ${entitySet.processingStats.entriesAnalyzed} entries.`,
              updatedAt: entitySet.generatedAt,
            },
          },
        }));
        return entitySet;
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to build investigation entities.';
      set((state) => ({
        entityBuildStatusBySourceId: {
          ...state.entityBuildStatusBySourceId,
          [sourceId]: {
            state: 'error',
            message,
            updatedAt: new Date().toISOString(),
          },
        },
      }));
      console.error('Failed to build investigation entities:', error);
    }

    return null;
  },

  clearInvestigationEntities: (sourceId): void => {
    set((state) => {
      const entitySetsBySourceId = { ...state.entitySetsBySourceId };
      const entityBuildStatusBySourceId = { ...state.entityBuildStatusBySourceId };
      delete entitySetsBySourceId[sourceId];
      delete entityBuildStatusBySourceId[sourceId];
      return { entitySetsBySourceId, entityBuildStatusBySourceId };
    });
  },

  addAuditEntry: (action, targetId, details, evidenceLinks): void => {
    const activeId = get().ensureActiveInvestigation();
    const newEntry: InvestigationAuditEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      action,
      targetId,
      details,
      evidenceLinks,
    };

    set((state) => {
      const inv = state.investigationsById[activeId];
      if (!inv) return {};
      const currentLog = inv.auditLog || [];
      const updatedLog = [newEntry, ...currentLog].slice(0, 500); // capped at 500 chronological entries for performance

      const updatedInv: Investigation = {
        ...inv,
        auditLog: updatedLog,
        updatedAt: new Date().toISOString(),
      };

      return {
        investigationsById: {
          ...state.investigationsById,
          [activeId]: updatedInv,
        },
        auditLog: updatedLog,
      };
    });
  },
}));
