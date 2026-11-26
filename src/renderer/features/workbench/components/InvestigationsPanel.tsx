import { useEffect, useState, useRef, type JSX } from 'react';
import { useFileMonitorStore } from '@renderer/stores/fileMonitorStore';
import { useInvestigationStore } from '@renderer/stores/investigationStore';
import { useSearchStore } from '@renderer/stores/searchStore';
import { useSettingsStore, type ViewerPreferences } from '@renderer/stores/settingsStore';
import { useViewerStore } from '@renderer/stores/viewerStore';
import type {
  Incident,
  StateTransitionSequence,
  DomainRuleResult,
  FailureChainCandidate,
  InvestigationMode,
  SavedFilter,
  EvidenceBookmark,
  IncidentKnowledgeGraph,
  OperationalDegradationResult,
} from '@shared/contracts/investigations';
import type { StructuredLogEntry } from '@shared/contracts/logs';

type ActiveTab =
  | 'workspace'
  | 'incidents'
  | 'states'
  | 'rules'
  | 'playbooks'
  | 'crossLearning'
  | 'graph'
  | 'replay'
  | 'cases';

export const InvestigationsPanel = (): JSX.Element => {
  const selectedFilePath = useViewerStore((state) => state.selectedFilePath);
  const scrollToLineRowIndex = useViewerStore((state) => state.scrollToLineRowIndex);

  // Investigation Workspace store bindings
  const ensureActiveInvestigation = useInvestigationStore(
    (state) => state.ensureActiveInvestigation,
  );
  const activeInvestigationId = useInvestigationStore((state) => state.activeInvestigationId);
  const investigationsById = useInvestigationStore((state) => state.investigationsById);
  const investigationsList = useInvestigationStore((state) => state.investigationsList);

  const createNewInvestigationCase = useInvestigationStore(
    (state) => state.createNewInvestigationCase,
  );
  const deleteInvestigationCase = useInvestigationStore((state) => state.deleteInvestigationCase);
  const exportInvestigationCase = useInvestigationStore((state) => state.exportInvestigationCase);
  const importInvestigationCase = useInvestigationStore((state) => state.importInvestigationCase);
  const addCustomRule = useInvestigationStore((state) => state.addCustomRule);
  const deleteCustomRule = useInvestigationStore((state) => state.deleteCustomRule);
  const applyLayoutPreset = useInvestigationStore((state) => state.applyLayoutPreset);

  const setInvestigationMode = useInvestigationStore((state) => state.setInvestigationMode);
  const updateNotes = useInvestigationStore((state) => state.updateNotes);
  const addBookmark = useInvestigationStore((state) => state.addBookmark);
  const removeBookmark = useInvestigationStore((state) => state.removeBookmark);
  const updateBookmarkNote = useInvestigationStore((state) => state.updateBookmarkNote);
  const saveFilter = useInvestigationStore((state) => state.saveFilter);
  const removeSavedFilter = useInvestigationStore((state) => state.removeSavedFilter);
  const takeSnapshot = useInvestigationStore((state) => state.takeSnapshot);
  const restoreSnapshot = useInvestigationStore((state) => state.restoreSnapshot);
  const selectFile = useFileMonitorStore((state) => state.selectFile);

  // Phase 10 Store Bindings
  const rulePacks = useInvestigationStore((state) => state.rulePacks);
  const observedPatterns = useInvestigationStore((state) => state.observedPatterns);
  const activeRcaDrafts = useInvestigationStore((state) => state.activeRcaDrafts);
  const triageRanks = useInvestigationStore((state) => state.triageRanks);
  const auditLog = useInvestigationStore((state) => state.auditLog);

  const importRulePack = useInvestigationStore((state) => state.importRulePack);
  const exportRulePack = useInvestigationStore((state) => state.exportRulePack);
  const executePlaybookAction = useInvestigationStore((state) => state.executePlaybookAction);
  const promotePatternToRule = useInvestigationStore((state) => state.promotePatternToRule);
  const compileRcaDraft = useInvestigationStore((state) => state.compileRcaDraft);
  const triageIncidentsAction = useInvestigationStore((state) => state.triageIncidentsAction);
  const detectRecurringPatternsAction = useInvestigationStore(
    (state) => state.detectRecurringPatternsAction,
  );
  const buildInvestigationEntitiesAction = useInvestigationStore(
    (state) => state.buildInvestigationEntitiesAction,
  );
  const investigationEntitySet = useInvestigationStore((state) =>
    selectedFilePath ? (state.entitySetsBySourceId[selectedFilePath] ?? null) : null,
  );
  const entityBuildStatus = useInvestigationStore((state) =>
    selectedFilePath ? (state.entityBuildStatusBySourceId[selectedFilePath] ?? null) : null,
  );

  // Panel active tabs
  const [activeTab, setActiveTab] = useState<ActiveTab>('workspace');
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [stateSequence, setStateSequence] = useState<StateTransitionSequence | null>(null);
  // failureChains are populated by the graph compilation logic (compileIncidentGraph)
  // The value is written by the worker but not directly displayed in JSX (graph tab shows nodes/edges)
  const [_failureChains, setFailureChains] = useState<FailureChainCandidate[]>([]);
  const [ruleResults, setRuleResults] = useState<DomainRuleResult[]>([]);

  // Phase 8 Off-Thread Calculated States
  const [degradation, setDegradation] = useState<OperationalDegradationResult | null>(null);
  const [incidentGraph, setIncidentGraph] = useState<IncidentKnowledgeGraph | null>(null);

  // Input states
  const [newFilterName, setNewFilterName] = useState('');
  const [newSnapshotTitle, setNewSnapshotTitle] = useState('');
  const [bookmarkNote, setBookmarkNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [rcaLoadingId, setRcaLoadingId] = useState<string | null>(null);
  const [expandedRcaId, setExpandedRcaId] = useState<string | null>(null);
  const [patternsScanning, setPatternsScanning] = useState(false);

  // Cases Tab local inputs
  const [newCaseTitleInput, setNewCaseTitleInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rulePackInputRef = useRef<HTMLInputElement>(null);

  // Custom SLA Rule Tab local inputs
  const [ruleName, setRuleName] = useState('');
  const [rulePattern, setRulePattern] = useState('');
  const [ruleExpected, setRuleExpected] = useState('');
  const [ruleCategory, setRuleCategory] = useState<'payment' | 'hardware' | 'network' | 'system'>(
    'payment',
  );
  const [ruleSeverity, setRuleSeverity] = useState<'error' | 'warn'>('error');

  // Replay Player State
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 2 | 5 | 10>(1);
  const [currentTransitionIdx, setCurrentTransitionIdx] = useState(-1);

  // Graph Explorer local state
  const [expandedGraphNodeId, setExpandedGraphNodeId] = useState<string | null>(null);

  // Initialize active investigation draft if none is set
  useEffect(() => {
    ensureActiveInvestigation();
  }, [ensureActiveInvestigation]);

  const activeInv = activeInvestigationId ? investigationsById[activeInvestigationId] : null;

  // Scan and fetch operational intelligence from Web Worker
  useEffect(() => {
    if (!selectedFilePath) {
      setTimeout(() => {
        setIncidents([]);
        setStateSequence(null);
        setFailureChains([]);
        setRuleResults([]);
        setDegradation(null);
        setIncidentGraph(null);
      }, 0);
      return;
    }

    let isDisposed = false;
    let isAnalysisInFlight = false;

    const runOffThreadAnalysis = async (): Promise<void> => {
      if (isDisposed || isAnalysisInFlight) return;
      isAnalysisInFlight = true;
      setLoading(true);
      try {
        const activeCustomRules = activeInv?.customRules || [];
        const entitySet = await buildInvestigationEntitiesAction(
          selectedFilePath,
          activeCustomRules,
        );

        if (entitySet && !isDisposed) {
          setIncidents(entitySet.incidents);
          setStateSequence(entitySet.stateSequence);
          setFailureChains(entitySet.failureChains);
          setRuleResults(entitySet.ruleResults);
          setDegradation(entitySet.degradation);
          setIncidentGraph(entitySet.incidentGraph);
        }
      } catch (err) {
        console.error('Failed to run operational correlation analysis:', err);
      } finally {
        isAnalysisInFlight = false;
        if (!isDisposed) {
          setLoading(false);
        }
      }
    };

    void runOffThreadAnalysis();

    // Poll for updates every 8 seconds if live Monitoring or tail mode is running
    const interval = setInterval(runOffThreadAnalysis, 8000);
    return () => {
      isDisposed = true;
      clearInterval(interval);
    };
  }, [selectedFilePath, activeInv?.customRules, buildInvestigationEntitiesAction]);

  // Phase 10: Prioritized Triage Trigger
  useEffect(() => {
    if (incidents.length > 0) {
      void triageIncidentsAction(incidents, ruleResults);
    }
  }, [incidents, ruleResults, triageIncidentsAction]);

  // Replay Player engine
  useEffect(() => {
    if (!isPlaying || !stateSequence || stateSequence.transitions.length === 0) {
      return;
    }

    const intervalTime = 1800 / playbackSpeed;

    const timer = setInterval(() => {
      setCurrentTransitionIdx((prev) => {
        const next = prev + 1;
        if (next >= stateSequence.transitions.length) {
          setIsPlaying(false);
          return prev; // Stop at end of replay sequence
        }

        const t = stateSequence.transitions[next]!;
        scrollToLineRowIndex(t.lineNumber - 1);

        // Highlight line in view
        const viewportEntries =
          useViewerStore.getState().viewportEntriesByPath[selectedFilePath || ''] || [];
        const entry = viewportEntries.find((e) => e.lineNumber === t.lineNumber);
        if (entry) {
          useViewerStore.getState().setSelectedLineEntry(entry);
        }

        return next;
      });
    }, intervalTime);

    return () => clearInterval(timer);
  }, [isPlaying, stateSequence, playbackSpeed, scrollToLineRowIndex, selectedFilePath]);

  const handleSaveFilter = (): void => {
    if (!newFilterName.trim()) return;
    const currentQuery = useSearchStore.getState().searchQuery;
    const currentSeverities = useSettingsStore.getState().preferences?.severityFilters || {};

    saveFilter({
      name: newFilterName.trim(),
      query: currentQuery,
      severityFilters: { ...currentSeverities },
    });
    setNewFilterName('');
  };

  const handleApplyFilter = (filter: SavedFilter): void => {
    useSearchStore.getState().setSearchQuery(filter.query);
    useSettingsStore.setState((state) => ({
      preferences: {
        ...(state.preferences || {}),
        severityFilters: filter.severityFilters as unknown as ViewerPreferences['severityFilters'],
      } as ViewerPreferences,
    }));
  };

  const handleTakeSnapshot = (): void => {
    if (!newSnapshotTitle.trim()) return;
    takeSnapshot(newSnapshotTitle.trim(), selectedFilePath);
    setNewSnapshotTitle('');
  };

  const handleAddBookmark = (
    entry: Pick<StructuredLogEntry, 'id' | 'lineNumber'> & {
      timestamp?: string | null;
      message?: string;
      raw?: string;
    },
  ): void => {
    const bookmarkData: Omit<EvidenceBookmark, 'id' | 'createdAt'> = {
      entryId: entry.id,
      lineNumber: entry.lineNumber,
      timestamp: entry.timestamp ?? null,
      message: entry.message || entry.raw || '',
      sourceId: selectedFilePath || '',
    };
    if (bookmarkNote.trim()) {
      bookmarkData.note = bookmarkNote.trim();
    }
    addBookmark(bookmarkData);
    setBookmarkNote('');
  };

  const handleBookmarkJump = async (b: EvidenceBookmark): Promise<void> => {
    if (b.sourceId) {
      await selectFile(b.sourceId);
    }
    scrollToLineRowIndex(b.lineNumber - 1);
  };

  const handleFocusIncident = (incident: Incident): void => {
    if (incident.entryIds.length === 0) return;
    useSearchStore.getState().setSearchQuery(incident.category);
  };

  // Case management handlers
  const handleCreateCase = (): void => {
    if (!newCaseTitleInput.trim()) return;
    createNewInvestigationCase(newCaseTitleInput.trim());
    setNewCaseTitleInput('');
  };

  const handleExportCase = (id: string, title: string): void => {
    try {
      const dataStr = exportInvestigationCase(id);
      const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

      const exportFileDefaultName = `${title.toLowerCase().replace(/[^a-z0-9]/g, '_')}_case_bundle.json`;

      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();
    } catch (e) {
      console.error(e);
    }
  };

  const handleImportCaseClick = (): void => {
    fileInputRef.current?.click();
  };

  const handleImportCaseFile = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result;
      if (typeof content === 'string') {
        try {
          importInvestigationCase(content);
        } catch (err) {
          alert('Failed to parse case bundle JSON.');
        }
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  // Rule Pack import/export handlers
  const handleImportRulePackClick = (): void => {
    rulePackInputRef.current?.click();
  };

  const handleImportRulePackFile = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result;
      if (typeof content === 'string') {
        try {
          importRulePack(content);
        } catch (err) {
          alert('Failed to parse SLA Rule Pack JSON.');
        }
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const handleExportRulePack = (packId: string, packName: string): void => {
    try {
      const dataStr = exportRulePack(packId);
      const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
      const filename = `${packName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_v1_rules.json`;

      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', filename);
      linkElement.click();
    } catch (e) {
      console.error(e);
    }
  };

  // Custom rule creation handler
  const handleCreateCustomRule = (): void => {
    if (!ruleName.trim() || !rulePattern.trim()) return;
    addCustomRule({
      name: ruleName.trim(),
      pattern: rulePattern.trim(),
      expectedBehavior: ruleExpected.trim() || 'Custom validation pattern must not fail',
      category: ruleCategory,
      severity: ruleSeverity,
    });
    setRuleName('');
    setRulePattern('');
    setRuleExpected('');
  };

  // Playback scrub control
  const handleScrub = (idx: number): void => {
    if (!stateSequence || !stateSequence.transitions[idx]) return;
    setCurrentTransitionIdx(idx);
    const t = stateSequence.transitions[idx]!;
    scrollToLineRowIndex(t.lineNumber - 1);

    const viewportEntries =
      useViewerStore.getState().viewportEntriesByPath[selectedFilePath || ''] || [];
    const entry = viewportEntries.find((e) => e.lineNumber === t.lineNumber);
    if (entry) {
      useViewerStore.getState().setSelectedLineEntry(entry);
    }
  };

  // Playbook runner handler
  const handleRunPlaybook = async (playbookId: string): Promise<void> => {
    const entries = useViewerStore.getState().viewportEntriesByPath[selectedFilePath || ''] || [];
    const transitions = stateSequence?.transitions || [];
    await executePlaybookAction(playbookId, entries, transitions, ruleResults);
  };

  // RCA Copilot compiler trigger
  const handleCompileRca = async (incident: Incident): Promise<void> => {
    setRcaLoadingId(incident.id);
    try {
      const entries = useViewerStore.getState().viewportEntriesByPath[selectedFilePath || ''] || [];
      const transitions = stateSequence?.transitions || [];
      await compileRcaDraft(incident, entries, transitions, ruleResults);
      setExpandedRcaId(incident.id);
    } catch (e) {
      console.error('Failed to compile RCA draft:', e);
    } finally {
      setRcaLoadingId(null);
    }
  };

  // Recurring Pattern scanner trigger
  const handleScanPatterns = async (): Promise<void> => {
    setPatternsScanning(true);
    try {
      const entries = useViewerStore.getState().viewportEntriesByPath[selectedFilePath || ''] || [];
      await detectRecurringPatternsAction(entries);
    } catch (e) {
      console.error('Pattern scan failed:', e);
    } finally {
      setPatternsScanning(false);
    }
  };

  if (!selectedFilePath) {
    return (
      <div className="flex h-full w-full items-center justify-center p-6 text-center text-subtle bg-ink-950 font-mono text-xs">
        <div className="max-w-xs space-y-2">
          <div className="text-xl">📁</div>
          <div>
            Select an active operational log document to load the Correlation Intelligence Core.
          </div>
        </div>
      </div>
    );
  }

  // Calculate SLA compliance ratios
  const passedRules = ruleResults.filter((r) => r.status === 'passed').length;
  const totalCheckedRules = ruleResults.filter((r) => r.status !== 'unknown').length;
  const complianceRate =
    totalCheckedRules > 0 ? Math.round((passedRules / totalCheckedRules) * 100) : 0;

  // Premium Health Ring Color Computation
  const healthScore = degradation ? degradation.score : 100;
  const healthLevel = degradation ? degradation.level : 'nominal';
  const ringColor =
    healthLevel === 'critical' ? '#f43f5e' : healthLevel === 'degraded' ? '#f59e0b' : '#10b981';
  const ringBg =
    healthLevel === 'critical'
      ? 'bg-rose-950/40 text-rose-500 border-rose-900/60'
      : healthLevel === 'degraded'
        ? 'bg-amber-950/40 text-amber-500 border-amber-900/60'
        : 'bg-emerald-950/40 text-emerald-500 border-emerald-900/60';

  // SVG Circular Dash offset calculations (Circumference of r=18 is 113.1)
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (healthScore / 100) * circumference;

  // Sorted incidents by Triage Rank (Phase 10 prioritizer)
  const sortedIncidents = [...incidents].sort((a, b) => {
    const rankA = triageRanks.find((r) => r.incidentId === a.id);
    const rankB = triageRanks.find((r) => r.incidentId === b.id);
    return (rankB?.severityScore || 0) - (rankA?.severityScore || 0);
  });
  const entityCount = investigationEntitySet?.processingStats.entitiesDetected ?? 0;
  const entitySequenceCount = investigationEntitySet?.operationalSequences.length ?? 0;
  const entityRuleViolationCount = investigationEntitySet?.ruleViolations.length ?? 0;
  const entityTimelineCount = investigationEntitySet?.timelineEvents.length ?? 0;

  return (
    <div className="flex h-full w-full flex-col bg-ink-950 text-readable font-mono select-none overflow-hidden border-l border-ink-800">
      {/* Visual Telemetry Enterprise Header */}
      <div className="p-3.5 bg-ink-900 border-b border-ink-800 flex items-center justify-between gap-3 shrink-0">
        <div className="space-y-1.5 flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-extrabold text-accent tracking-widest uppercase">
              Operational Intelligence Ecosystem v10
            </span>
            {(loading || patternsScanning) && (
              <span className="flex h-1.5 w-1.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-accent" />
              </span>
            )}
          </div>
          <div className="flex items-center justify-between text-xs">
            <span
              className="text-readable font-bold truncate max-w-[150px]"
              title={activeInv?.title}
            >
              {activeInv?.title || 'Draft Case'}
            </span>
          </div>
          <div className="flex min-w-0 items-center gap-2 text-[9px] text-subtle">
            <span className="truncate">
              Entities: {entityBuildStatus?.state === 'building' ? 'building' : entityCount}
            </span>
            {entityBuildStatus?.state === 'error' && (
              <span className="truncate text-danger" title={entityBuildStatus.message}>
                Entity build failed
              </span>
            )}
          </div>
        </div>

        {/* Degradation Score Premium Ring */}
        <div
          className={`flex items-center gap-2 px-2.5 py-1 rounded-lg border shrink-0 ${ringBg}`}
          title={degradation?.factors.join('\n') || 'Determining health score...'}
        >
          <div className="relative w-10 h-10 flex items-center justify-center">
            <svg className="w-10 h-10 -rotate-90">
              <circle
                cx="20"
                cy="20"
                r={radius}
                className="stroke-ink-850 fill-transparent"
                strokeWidth="3.5"
              />
              <circle
                cx="20"
                cy="20"
                r={radius}
                className="fill-transparent transition-all duration-500 ease-out"
                stroke={ringColor}
                strokeWidth="3.5"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
              />
            </svg>
            <span className="absolute text-[10px] font-extrabold">{healthScore}%</span>
          </div>
          <div className="flex flex-col text-left">
            <span className="text-[8px] font-bold text-subtle tracking-wider uppercase">
              Health
            </span>
            <span className="text-[10px] font-extrabold capitalize">{healthLevel}</span>
          </div>
        </div>
      </div>

      {/* Responsive Navigation 3x3 Tabs Grid */}
      <div className="grid grid-cols-3 border-b border-ink-800 bg-ink-900/60 shrink-0 text-[9px] font-bold">
        {(
          [
            { id: 'workspace', label: 'RCA Core', icon: '🔬' },
            { id: 'incidents', label: `Incidents (${incidents.length})`, icon: '⚠️' },
            { id: 'states', label: 'States', icon: '🔄' },
            { id: 'rules', label: `SLA (${complianceRate}%)`, icon: '🛡️' },
            { id: 'playbooks', label: `Playbooks`, icon: '📋' },
            { id: 'crossLearning', label: `Patterns`, icon: '🚀' },
            { id: 'graph', label: 'Graph Map', icon: '🕸️' },
            { id: 'replay', label: 'Replay', icon: '🔄' },
            { id: 'cases', label: 'Cases & Audit', icon: '💼' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center justify-center gap-1 py-1.5 transition border-b-2 font-bold ${
              activeTab === tab.id
                ? 'border-accent bg-ink-950 text-readable'
                : 'border-transparent text-subtle hover:text-readable hover:bg-ink-900/40'
            }`}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Panels Content */}
      <div className="flex-1 overflow-y-auto min-h-0 bg-ink-950">
        {/* TAB 1: WORKSPACE & RCA NOTES */}
        {activeTab === 'workspace' && activeInv && (
          <div className="p-3.5 space-y-4">
            {/* Workbench Layout Presets Selector */}
            <div className="space-y-1 p-2 bg-ink-900/80 border border-ink-800 rounded-lg">
              <label className="text-[9px] font-extrabold text-accent uppercase tracking-wider">
                Workbench View Presets
              </label>
              <div className="grid grid-cols-2 gap-1.5 pt-1.5">
                {(
                  [
                    { id: 'explorer', label: '📁 Explorer', desc: 'Standard files view' },
                    { id: 'rca', label: '🔬 RCA Focus', desc: 'Notes & Diagnostics' },
                    { id: 'split', label: '📊 Dual Split', desc: 'Timeline Sync Diff' },
                    { id: 'replay', label: '🔄 Replay', desc: 'Chronological path' },
                  ] as const
                ).map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => applyLayoutPreset(preset.id)}
                    className="bg-ink-850 hover:bg-accent hover:text-ink-950 text-readable text-[10px] py-1 px-1.5 rounded font-bold transition border border-ink-750 flex flex-col items-center justify-center text-center space-y-0.5"
                    title={preset.desc}
                  >
                    <span>{preset.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Diagnostic Degradation Summary */}
            {degradation && degradation.factors.length > 0 && (
              <div className="p-2.5 bg-ink-900/60 border border-ink-800 rounded-lg space-y-1">
                <span className="text-[9px] font-bold text-rose-400 uppercase tracking-wider">
                  Operational Health Factors:
                </span>
                <ul className="list-disc pl-3 text-[10px] text-subtle space-y-1 leading-relaxed">
                  {degradation.factors.map((f, idx) => (
                    <li key={idx} className="hover:text-readable transition">
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {investigationEntitySet && (
              <div className="p-2.5 bg-ink-900/50 border border-ink-800 rounded-lg space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[9px] font-bold text-accent uppercase tracking-wider">
                    Deterministic Entity Foundation
                  </span>
                  <span
                    className="text-[8px] text-subtle font-bold truncate"
                    title={entityBuildStatus?.message}
                  >
                    {investigationEntitySet.processingStats.processingDurationMs}ms
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1.5 text-center">
                  <div className="bg-ink-950 border border-ink-850 rounded px-1.5 py-1">
                    <div className="text-[11px] text-readable font-extrabold">
                      {entitySequenceCount}
                    </div>
                    <div className="text-[8px] text-subtle uppercase">Sequences</div>
                  </div>
                  <div className="bg-ink-950 border border-ink-850 rounded px-1.5 py-1">
                    <div className="text-[11px] text-readable font-extrabold">
                      {entityRuleViolationCount}
                    </div>
                    <div className="text-[8px] text-subtle uppercase">Violations</div>
                  </div>
                  <div className="bg-ink-950 border border-ink-850 rounded px-1.5 py-1">
                    <div className="text-[11px] text-readable font-extrabold">
                      {entityTimelineCount}
                    </div>
                    <div className="text-[8px] text-subtle uppercase">Timeline</div>
                  </div>
                </div>

                {investigationEntitySet.ruleViolations.length > 0 && (
                  <div className="space-y-1 pt-1">
                    {investigationEntitySet.ruleViolations.slice(0, 3).map((violation) => (
                      <button
                        key={violation.id}
                        onClick={() => {
                          const lineNumber = violation.evidenceRefs[0]?.lineNumber;
                          if (lineNumber) {
                            scrollToLineRowIndex(lineNumber - 1);
                          }
                        }}
                        className="w-full min-w-0 text-left bg-ink-950 hover:border-accent border border-ink-850 rounded px-2 py-1 transition"
                        title={violation.explanation.summary}
                      >
                        <span className="block truncate text-[9px] font-bold text-warning">
                          {violation.ruleName}
                        </span>
                        <span className="block truncate text-[8px] text-subtle">
                          Line {violation.evidenceRefs[0]?.lineNumber ?? 'n/a'} -{' '}
                          {violation.evidenceSummary.totalFrames} evidence frames
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Mode Switcher */}
            <div className="space-y-1">
              <label className="text-[9px] font-bold text-subtle uppercase">
                Workspace Diagnostic Mode
              </label>
              <select
                value={activeInv.mode}
                onChange={(e) => setInvestigationMode(e.target.value as InvestigationMode)}
                className="w-full bg-ink-900 border border-ink-800 rounded px-2 py-1 text-xs text-readable focus:outline-none focus:border-accent"
              >
                <option value="investigation">Incident Investigation (RCA)</option>
                <option value="liveMonitoring">Live Monitoring Dashboard</option>
                <option value="comparison">Peripheral Comparative Mode</option>
                <option value="aiRca">Autonomous AI RCA</option>
                <option value="incidentReplay">Incident Sequence Replay</option>
              </select>
            </div>

            {/* RCA Notes Textarea */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[9px] font-bold text-subtle uppercase">
                  RCA Investigation Notes
                </label>
                <span className="text-[9px] text-accent font-bold">Autosaved</span>
              </div>
              <textarea
                value={activeInv.notes}
                onChange={(e) => updateNotes(e.target.value)}
                placeholder="Write evidence notes, timeline anomalies, merchant POS failures here..."
                className="w-full h-32 bg-ink-900 border border-ink-800 rounded p-2 text-xs text-readable placeholder-subtle font-mono focus:outline-none focus:border-accent resize-none leading-relaxed"
              />
            </div>

            {/* Saved Filters Toolbox */}
            <div className="space-y-2 p-2.5 bg-ink-900/40 border border-ink-800/60 rounded-lg">
              <span className="text-[10px] font-bold text-accent">Active Filter Bookmarks</span>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newFilterName}
                  onChange={(e) => setNewFilterName(e.target.value)}
                  placeholder="Filter name (e.g. POS Drops)"
                  className="flex-1 bg-ink-900 border border-ink-800 rounded px-2 py-1 text-[11px] text-readable placeholder-subtle focus:outline-none focus:border-accent"
                />
                <button
                  onClick={handleSaveFilter}
                  className="bg-ink-850 hover:bg-ink-800 text-readable border border-ink-700 px-3.5 py-1 rounded text-[10px] font-bold transition shrink-0"
                >
                  Save Active
                </button>
              </div>

              {activeInv.savedFilters.length === 0 ? (
                <div className="text-[10px] text-subtle italic">
                  No saved workspace filters yet.
                </div>
              ) : (
                <div className="space-y-1.5 pt-1">
                  {activeInv.savedFilters.map((f) => (
                    <div
                      key={f.id}
                      className="flex items-center justify-between bg-ink-900 p-1.5 rounded border border-ink-850"
                    >
                      <div className="truncate pr-2">
                        <div className="text-[10px] font-bold text-readable truncate">{f.name}</div>
                        <div className="text-[9px] text-subtle truncate font-mono">
                          {f.query || 'All severities'}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => handleApplyFilter(f)}
                          className="bg-accent hover:bg-accent-light text-ink-950 font-bold text-[9px] px-2 py-0.5 rounded transition"
                        >
                          Apply
                        </button>
                        <button
                          onClick={() => removeSavedFilter(f.id)}
                          className="text-danger hover:text-danger-light text-[9px] px-1 transition"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Log Snapshots */}
            <div className="space-y-2 p-2.5 bg-ink-900/40 border border-ink-800/60 rounded-lg">
              <span className="text-[10px] font-bold text-accent">Workspace Snapshots</span>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newSnapshotTitle}
                  onChange={(e) => setNewSnapshotTitle(e.target.value)}
                  placeholder="Snapshot label..."
                  className="flex-1 bg-ink-900 border border-ink-800 rounded px-2 py-1 text-[11px] text-readable placeholder-subtle focus:outline-none focus:border-accent"
                />
                <button
                  onClick={handleTakeSnapshot}
                  className="bg-accent hover:bg-accent-light text-ink-950 px-3.5 py-1 rounded text-[10px] font-bold transition shrink-0"
                >
                  Capture
                </button>
              </div>

              {activeInv.snapshots.length === 0 ? (
                <div className="text-[10px] text-subtle italic">No snapshots saved.</div>
              ) : (
                <div className="space-y-1.5 pt-1">
                  {activeInv.snapshots.map((s) => (
                    <div
                      key={s.id}
                      className="bg-ink-900 p-1.5 rounded border border-ink-850 flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="text-[10px] font-bold text-readable">{s.title}</div>
                        <div className="text-[8px] text-subtle">
                          {new Date(s.timestamp).toLocaleTimeString()}
                        </div>
                      </div>
                      <button
                        onClick={() => restoreSnapshot(s.id)}
                        className="bg-ink-800 hover:bg-ink-700 text-readable border border-ink-700 text-[9px] font-bold px-2 py-0.5 rounded transition"
                      >
                        Restore
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Evidence Bookmarks */}
            <div className="space-y-2 p-2.5 bg-ink-900/40 border border-ink-800/60 rounded-lg">
              <div className="text-[10px] font-bold text-accent">
                Line Bookmarks ({activeInv.bookmarks.length})
              </div>
              {activeInv.bookmarks.length === 0 ? (
                <div className="text-[10px] text-subtle italic">
                  No log entries bookmarked yet. Right-click or bookmark inside active lines.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {activeInv.bookmarks.map((b) => (
                    <div
                      key={b.id}
                      onClick={() => void handleBookmarkJump(b)}
                      className="p-2 bg-ink-900 border border-ink-850 hover:border-accent/40 rounded cursor-pointer transition space-y-2"
                    >
                      <div className="flex items-center justify-between text-[9px] text-subtle font-bold">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="text-accent shrink-0">Line {b.lineNumber}</span>
                          {b.sourceId && (
                            <span
                              className="text-[8px] text-emerald-400 bg-ink-950 px-1 py-0.2 rounded truncate max-w-[80px]"
                              title={b.sourceId}
                            >
                              {b.sourceId.split(/[\\/]/).pop()}
                            </span>
                          )}
                        </div>
                        <span>{b.timestamp}</span>
                      </div>
                      <div className="text-[10px] text-readable line-clamp-2 truncate font-mono">
                        {b.message}
                      </div>

                      {/* Inline annotation input */}
                      <div className="mt-1" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          value={b.note || ''}
                          onChange={(e) => updateBookmarkNote(b.id, e.target.value)}
                          placeholder="Add diagnostic annotation note..."
                          className="w-full bg-ink-950 border border-ink-800 rounded px-1.5 py-0.5 text-[9px] text-warning placeholder-subtle font-mono focus:outline-none focus:border-accent"
                        />
                      </div>

                      <div className="flex justify-end pt-0.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeBookmark(b.id);
                          }}
                          className="text-danger hover:text-danger-light text-[9px] transition"
                        >
                          Remove Bookmark
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Manual bookmark creation form */}
              <div className="flex flex-col gap-1.5 pt-2 border-t border-ink-800/40">
                <span className="text-[9px] font-bold text-subtle uppercase">
                  Add Manual Note / Bookmark
                </span>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={bookmarkNote}
                    onChange={(e) => setBookmarkNote(e.target.value)}
                    placeholder="Enter manual analysis note..."
                    className="flex-1 bg-ink-900 border border-ink-800 rounded px-2 py-1 text-[10px] text-readable placeholder-subtle focus:outline-none focus:border-accent"
                  />
                  <button
                    onClick={() => {
                      handleAddBookmark({
                        id: 'manual-' + Date.now(),
                        lineNumber: 1,
                        timestamp: new Date().toLocaleTimeString(),
                        message: 'Manual investigator note',
                      });
                    }}
                    className="bg-accent hover:bg-accent-light text-ink-950 px-3 py-1 rounded text-[10px] font-bold transition shrink-0"
                  >
                    + Add
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: INCIDENTS & RCA COPILOT */}
        {activeTab === 'incidents' && (
          <div className="p-3.5 space-y-3">
            <div className="text-[10px] font-bold text-subtle tracking-wider uppercase">
              Prioritized Telemetry Incidents ({sortedIncidents.length})
            </div>

            {sortedIncidents.length === 0 ? (
              <div className="text-xs text-subtle italic p-4 text-center bg-ink-900/20 rounded">
                No active operational anomalies or failure loops detected.
              </div>
            ) : (
              <div className="space-y-3">
                {sortedIncidents.map((incident) => {
                  const rank = triageRanks.find((r) => r.incidentId === incident.id);
                  const score = rank ? rank.severityScore : Math.round(incident.confidence * 100);
                  const impact = rank
                    ? rank.impactLevel
                    : incident.severity === 'error'
                      ? 'high'
                      : 'medium';
                  const isRcaCompiled = activeRcaDrafts && activeRcaDrafts[incident.id];
                  const isExpanded = expandedRcaId === incident.id;

                  let borderClass = 'border-ink-800 bg-ink-900/40';
                  let scoreBadge = 'bg-ink-850 text-subtle border-ink-700';

                  if (impact === 'high') {
                    borderClass = 'border-danger/30 bg-danger-soft/5 hover:border-danger/50';
                    scoreBadge = 'bg-danger text-readable border-danger/40';
                  } else if (impact === 'medium') {
                    borderClass = 'border-warning/30 bg-warning-soft/5 hover:border-warning/50';
                    scoreBadge = 'bg-warning text-ink-950 border-warning/40';
                  } else if (impact === 'low') {
                    borderClass =
                      'border-emerald-800/30 bg-emerald-950/5 hover:border-emerald-800/50';
                    scoreBadge = 'bg-success text-readable border-success/40';
                  }

                  return (
                    <div
                      key={incident.id}
                      className={`p-3 border rounded-xl transition select-none flex flex-col space-y-2 ${borderClass}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded tracking-wide uppercase ${
                              incident.severity === 'error'
                                ? 'bg-danger text-readable'
                                : 'bg-warning text-ink-950'
                            }`}
                          >
                            {incident.category.replace('_', ' ')}
                          </span>
                          <span className="text-[8px] font-bold text-subtle uppercase">
                            Impact: {impact}
                          </span>
                        </div>
                        <div
                          className={`text-[10px] font-extrabold border px-2 py-0.5 rounded-lg ${scoreBadge}`}
                        >
                          Triage Score: {score}
                        </div>
                      </div>

                      <div className="text-[11px] font-bold text-readable leading-relaxed">
                        {incident.title}
                      </div>

                      <div className="text-[10px] text-subtle leading-relaxed font-sans">
                        {incident.description}
                      </div>

                      {incident.durationMs !== null && (
                        <div className="text-[9px] text-accent font-bold">
                          Propagation Period: {(incident.durationMs / 1000).toFixed(2)} seconds
                        </div>
                      )}

                      {rank && rank.contributingFactors.length > 0 && (
                        <div className="text-[8px] text-subtle bg-ink-950/60 p-1.5 rounded border border-ink-850">
                          <span className="text-warning font-bold">Triage Factors:</span>{' '}
                          {rank.contributingFactors.join(' | ')}
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-1.5 border-t border-ink-800/40">
                        <span className="text-[8px] text-subtle font-mono">
                          {incident.entryIds.length} telemetry frames correlated
                        </span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleFocusIncident(incident)}
                            className="text-[9px] text-accent font-bold hover:underline"
                          >
                            Filter Logs
                          </button>
                          <button
                            onClick={async () => {
                              const primaryLineNumber =
                                incident.primaryLineNumber ??
                                incident.evidenceRefs?.[0]?.lineNumber;
                              if (primaryLineNumber) {
                                scrollToLineRowIndex(primaryLineNumber - 1);
                              } else if (incident.entryIds[0]) {
                                const viewportEntries =
                                  useViewerStore.getState().viewportEntriesByPath[
                                    selectedFilePath || ''
                                  ] || [];
                                const entry = viewportEntries.find(
                                  (e) => e.id === incident.entryIds[0],
                                );
                                if (entry) {
                                  scrollToLineRowIndex(entry.lineNumber - 1);
                                }
                              }
                            }}
                            className="text-[9px] text-readable hover:underline"
                          >
                            Jump to Source
                          </button>
                        </div>
                      </div>

                      {/* RCA Copilot Control */}
                      <div className="pt-2 border-t border-ink-800/20 flex flex-col gap-2">
                        <div className="flex justify-between items-center">
                          <button
                            onClick={() => handleCompileRca(incident)}
                            disabled={rcaLoadingId === incident.id}
                            className="text-[9px] bg-accent/20 hover:bg-accent text-accent hover:text-ink-950 font-bold px-2 py-1 rounded transition border border-accent/30 flex items-center gap-1 disabled:opacity-50"
                          >
                            {rcaLoadingId === incident.id
                              ? '⚙️ Compiling RCA...'
                              : '✨ RCA Copilot'}
                          </button>

                          {isRcaCompiled && (
                            <button
                              onClick={() => setExpandedRcaId(isExpanded ? null : incident.id)}
                              className="text-[9px] text-subtle hover:text-readable font-bold"
                            >
                              {isExpanded ? 'Hide Draft ▴' : 'Show Draft ▾'}
                            </button>
                          )}
                        </div>

                        {/* Collapsible RCA Copilot Panel */}
                        {isRcaCompiled && isExpanded && (
                          <div className="mt-1 p-3 bg-ink-900 border border-ink-800 rounded-lg space-y-3 text-[10px] text-readable animate-fadeIn">
                            <div className="flex items-center justify-between border-b border-ink-800 pb-1.5">
                              <span className="text-[9px] font-extrabold text-accent uppercase tracking-wider">
                                Explainable Diagnostic Draft
                              </span>
                              <span className="text-[10px] font-extrabold text-success bg-success-soft/10 border border-success/30 px-2 py-0.2 rounded">
                                Conf: {activeRcaDrafts[incident.id]?.confidence.score}%
                              </span>
                            </div>

                            {/* Confidence indicators */}
                            <div className="grid grid-cols-2 gap-2 text-[8px] bg-ink-950 p-2 border border-ink-850 rounded">
                              <div>
                                <span className="text-subtle">Verified Rules:</span>{' '}
                                <span className="text-accent font-bold">
                                  {activeRcaDrafts[incident.id]?.confidence.matchedRulesCount}
                                </span>
                              </div>
                              <div>
                                <span className="text-subtle">States Validated:</span>{' '}
                                <span className="text-success font-bold">
                                  {activeRcaDrafts[incident.id]?.confidence.matchedStatesCount}
                                </span>
                              </div>
                            </div>

                            {/* Reasoning trace */}
                            <div className="space-y-1">
                              <span className="text-[9px] font-bold text-subtle uppercase">
                                Reasoning Trace:
                              </span>
                              <ul className="list-disc pl-3 text-subtle space-y-0.5 text-[9px] leading-relaxed">
                                {activeRcaDrafts[incident.id]?.reasoningTrace.map((trace, tIdx) => (
                                  <li key={tIdx}>{trace}</li>
                                ))}
                              </ul>
                            </div>

                            {/* Deterministic violations */}
                            {activeRcaDrafts[incident.id]?.deterministicViolations.length ? (
                              <div className="space-y-1">
                                <span className="text-[9px] font-bold text-rose-400 uppercase">
                                  Deterministic Breaches:
                                </span>
                                <ul className="list-disc pl-3 text-rose-300/80 space-y-0.5 text-[9px]">
                                  {activeRcaDrafts[incident.id]?.deterministicViolations.map(
                                    (v, vIdx) => (
                                      <li key={vIdx}>{v}</li>
                                    ),
                                  )}
                                </ul>
                              </div>
                            ) : null}

                            {/* Telemetry uncertainties */}
                            {activeRcaDrafts[incident.id]?.uncertainties.length ? (
                              <div className="space-y-1 p-2 bg-rose-950/20 border border-rose-900/40 rounded">
                                <span className="text-[8px] font-extrabold text-warning uppercase block">
                                  ⚠️ Trace Gaps & Telemetry Gaps:
                                </span>
                                <ul className="list-disc pl-3 text-warning-soft/80 space-y-0.5 text-[9px]">
                                  {activeRcaDrafts[incident.id]?.uncertainties.map((u, uIdx) => (
                                    <li key={uIdx}>{u}</li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}

                            {/* Suggested Recovery */}
                            <div className="p-2 bg-emerald-950/30 border border-emerald-900/40 rounded space-y-1">
                              <span className="text-[9px] font-extrabold text-success uppercase block">
                                Suggested Operator Recovery:
                              </span>
                              <div className="text-[10px] text-emerald-300 font-bold leading-normal">
                                {activeRcaDrafts[incident.id]?.suggestedRecoveryPath}
                              </div>
                            </div>

                            {/* Evidences link */}
                            <div className="space-y-1">
                              <span className="text-[8px] font-bold text-subtle uppercase block">
                                Linked Telemetry Coordinates:
                              </span>
                              <div className="flex flex-wrap gap-1">
                                {activeRcaDrafts[incident.id]?.evidenceLinks.map((link, lIdx) => (
                                  <button
                                    key={lIdx}
                                    onClick={() => scrollToLineRowIndex(link.lineNumber - 1)}
                                    className="bg-ink-950 border border-ink-800 hover:border-accent text-accent font-bold text-[8px] px-1.5 py-0.5 rounded transition"
                                    title={link.message}
                                  >
                                    Row {link.lineNumber}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: STATE TIMELINE TRANSITIONS */}
        {activeTab === 'states' && (
          <div className="p-3.5 space-y-3">
            <div className="text-[10px] font-bold text-subtle tracking-wider uppercase mb-2">
              Kiosk State Transitions
            </div>

            {!stateSequence || stateSequence.transitions.length === 0 ? (
              <div className="text-xs text-subtle italic p-4 text-center bg-ink-900/20 rounded">
                No explicit system boot, shutdown, or ready state transition events detected.
              </div>
            ) : (
              <div className="space-y-4">
                {/* Active State Badge */}
                <div className="bg-ink-900 p-2 border border-ink-800 rounded-lg flex items-center justify-between">
                  <span className="text-[9px] text-subtle font-bold uppercase">
                    Current Machine State:
                  </span>
                  <span className="text-xs font-bold text-accent bg-accent-soft/20 px-2 py-0.5 rounded border border-accent/40 animate-pulse">
                    {stateSequence.currentState}
                  </span>
                </div>

                {/* Chronology List */}
                <div className="relative pl-4 border-l border-ink-800 ml-2.5 space-y-4">
                  {stateSequence.transitions.map((t, idx) => (
                    <div key={idx} className="relative group">
                      <span className="absolute -left-[20.5px] top-1 w-2.5 h-2.5 rounded-full bg-ink-800 border border-ink-950 flex items-center justify-center group-hover:bg-accent transition">
                        <span className="w-1 h-1 bg-ink-950 rounded-full" />
                      </span>

                      <div
                        onClick={() => scrollToLineRowIndex(t.lineNumber - 1)}
                        className="p-2 border border-ink-850 bg-ink-900/40 rounded hover:bg-ink-900 hover:border-accent/40 cursor-pointer transition space-y-1"
                      >
                        <div className="flex items-center justify-between text-[9px] text-subtle font-bold">
                          <span>{t.timestamp}</span>
                          <span className="text-accent bg-ink-800 px-1 rounded">
                            Row {t.lineNumber}
                          </span>
                        </div>
                        <div className="text-[10px] font-bold text-readable flex items-center gap-1.5">
                          <span className="text-subtle line-through decoration-danger/45">
                            {t.fromState}
                          </span>
                          <span className="text-accent">→</span>
                          <span className="text-success font-bold">{t.toState}</span>
                        </div>
                        <div className="text-[9px] text-subtle italic truncate font-sans">
                          Trigger: &quot;{t.triggerMessage}&quot;
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: UNIFIED SLA RULES & COMPILER */}
        {activeTab === 'rules' && (
          <div className="p-3.5 space-y-4">
            {/* Rule Pack Loader Box */}
            <div className="space-y-2 p-3 bg-ink-900 border border-ink-800 rounded-xl">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-accent">
                  Import Versioned Rule Packs
                </span>
                <button
                  onClick={handleImportRulePackClick}
                  className="bg-ink-850 hover:bg-ink-800 text-readable border border-ink-700 text-[9px] py-1 px-2.5 rounded font-bold transition text-center"
                >
                  📥 Load Rule Pack
                </button>
                <input
                  type="file"
                  ref={rulePackInputRef}
                  onChange={handleImportRulePackFile}
                  accept=".json"
                  className="hidden"
                />
              </div>

              {rulePacks.length === 0 ? (
                <div className="text-[9px] text-subtle italic">
                  No external rule packages loaded.
                </div>
              ) : (
                <div className="space-y-1.5 pt-1">
                  {rulePacks.map((pack) => (
                    <div
                      key={pack.id}
                      className="bg-ink-950 p-2 rounded border border-ink-850 flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="text-[10px] font-bold text-readable flex items-center gap-1.5">
                          <span>{pack.name}</span>
                          <span className="bg-emerald-950/60 text-emerald-400 text-[8px] font-bold px-1 rounded">
                            v{pack.version}
                          </span>
                        </div>
                        <div className="text-[8px] text-subtle pt-0.5 truncate max-w-[160px]">
                          {pack.rules.length} ASC behavior rules | {pack.category}
                        </div>
                      </div>
                      <button
                        onClick={() => handleExportRulePack(pack.id, pack.name)}
                        className="bg-ink-850 hover:bg-ink-800 text-accent border border-ink-700 text-[8px] font-bold px-2 py-0.5 rounded transition"
                      >
                        Export Pack
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Custom SLA Rule Compiler Form */}
            <div className="p-3 bg-ink-900 border border-ink-800 rounded-xl space-y-3">
              <span className="text-[10px] font-bold text-accent block">
                Compile Telemetry Rule
              </span>
              <div className="space-y-2.5 text-xs">
                <div className="space-y-0.5">
                  <label className="text-[9px] font-bold text-subtle uppercase block">
                    Rule Name
                  </label>
                  <input
                    type="text"
                    value={ruleName}
                    onChange={(e) => setRuleName(e.target.value)}
                    placeholder="Merchant API Timeout Check"
                    className="w-full bg-ink-950 border border-ink-800 rounded px-2 py-0.5 text-xs text-readable placeholder-subtle focus:outline-none focus:border-accent font-mono"
                  />
                </div>
                <div className="space-y-0.5">
                  <label className="text-[9px] font-bold text-subtle uppercase block">
                    Regex Pattern
                  </label>
                  <input
                    type="text"
                    value={rulePattern}
                    onChange={(e) => setRulePattern(e.target.value)}
                    placeholder="api_gateway.*timeout"
                    className="w-full bg-ink-950 border border-ink-800 rounded px-2 py-0.5 text-xs text-readable placeholder-subtle focus:outline-none focus:border-accent font-mono"
                  />
                </div>
                <div className="space-y-0.5">
                  <label className="text-[9px] font-bold text-subtle uppercase block">
                    Expected Behavior Description
                  </label>
                  <input
                    type="text"
                    value={ruleExpected}
                    onChange={(e) => setRuleExpected(e.target.value)}
                    placeholder="API authorization requests must return inside SLA bounds"
                    className="w-full bg-ink-950 border border-ink-800 rounded px-2 py-0.5 text-xs text-readable placeholder-subtle focus:outline-none focus:border-accent font-mono"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-0.5">
                    <label className="text-[9px] font-bold text-subtle uppercase block">
                      Category
                    </label>
                    <select
                      value={ruleCategory}
                      onChange={(e) =>
                        setRuleCategory(
                          e.target.value as 'payment' | 'hardware' | 'network' | 'system',
                        )
                      }
                      className="w-full bg-ink-950 border border-ink-800 rounded px-2 py-0.5 text-xs text-readable focus:outline-none"
                    >
                      <option value="payment">payment</option>
                      <option value="hardware">hardware</option>
                      <option value="network">network</option>
                      <option value="system">system</option>
                    </select>
                  </div>
                  <div className="space-y-0.5">
                    <label className="text-[9px] font-bold text-subtle uppercase block">
                      Severity
                    </label>
                    <select
                      value={ruleSeverity}
                      onChange={(e) => setRuleSeverity(e.target.value as 'error' | 'warn')}
                      className="w-full bg-ink-950 border border-ink-800 rounded px-2 py-0.5 text-xs text-readable focus:outline-none"
                    >
                      <option value="error">error</option>
                      <option value="warn">warn</option>
                    </select>
                  </div>
                </div>
                <button
                  onClick={handleCreateCustomRule}
                  className="w-full bg-accent hover:bg-accent-light text-ink-950 py-1.5 rounded text-xs font-bold transition"
                >
                  Save & Audit Custom SLA Rule
                </button>
              </div>
            </div>

            {/* SLA Compliance Auditor results */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold text-subtle tracking-wider uppercase">
                  SLA Compliance Results
                </span>
                <span className="text-[9px] font-bold text-accent bg-accent-soft/20 border border-accent/30 px-1.5 rounded">
                  {complianceRate}% Compliant
                </span>
              </div>

              {ruleResults.length === 0 ? (
                <div className="text-[10px] text-subtle italic p-3 text-center bg-ink-900/10 border border-ink-800 rounded-lg">
                  No domain rules checked.
                </div>
              ) : (
                <div className="space-y-2">
                  {ruleResults.map((rule) => {
                    let statusColor = 'border-ink-800 bg-ink-900/40 text-subtle';
                    let statusBadge = 'UNKNOWN';
                    let statusBg = 'bg-ink-850 text-subtle';

                    if (rule.status === 'passed') {
                      statusColor = 'border-success/30 bg-success-soft/5';
                      statusBadge = 'COMPLIANT';
                      statusBg = 'bg-success text-readable';
                    } else if (rule.status === 'violation') {
                      statusColor = 'border-danger/30 bg-danger-soft/5';
                      statusBadge = 'VIOLATION';
                      statusBg = 'bg-danger text-readable';
                    }

                    return (
                      <div
                        key={rule.ruleId}
                        className={`p-2.5 border rounded-lg space-y-1.5 ${statusColor}`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-readable truncate pr-2">
                            {rule.name}
                          </span>
                          <span
                            className={`text-[8px] font-bold px-1.5 rounded shrink-0 ${statusBg}`}
                          >
                            {statusBadge}
                          </span>
                        </div>
                        <div className="text-[9px] text-subtle bg-ink-950 p-1.5 rounded border border-ink-900 italic font-sans leading-relaxed">
                          Behavior: &quot;{rule.expectedBehavior}&quot;
                        </div>
                        {rule.notes && (
                          <div className="text-[10px] text-readable font-sans">{rule.notes}</div>
                        )}

                        {rule.status === 'violation' && rule.evidenceEntryIds.length > 0 && (
                          <div className="space-y-1">
                            <span className="text-[8px] font-bold text-danger uppercase block">
                              Anomalous Telemetry Lines:
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {rule.evidenceEntryIds.slice(0, 10).map((id, idx) => (
                                <button
                                  key={id}
                                  onClick={() => {
                                    const violation = investigationEntitySet?.ruleViolations.find(
                                      (item) => item.ruleId === rule.ruleId,
                                    );
                                    const lineNumber =
                                      violation?.evidenceRefs.find((ref) => ref.entryId === id)
                                        ?.lineNumber ?? violation?.evidenceRefs[idx]?.lineNumber;
                                    if (lineNumber) {
                                      scrollToLineRowIndex(lineNumber - 1);
                                    }
                                  }}
                                  className="bg-ink-950 border border-danger/30 text-danger font-bold text-[8px] px-1.5 py-0.2 rounded hover:border-danger transition"
                                >
                                  Coord #{idx + 1}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Custom rules in case bundle */}
            <div className="space-y-2">
              <span className="text-[9px] font-bold text-subtle uppercase tracking-wider block">
                Custom Built Rules in Workspace
              </span>
              {!activeInv?.customRules || activeInv.customRules.length === 0 ? (
                <div className="text-[9px] text-subtle italic">No workspace rules built.</div>
              ) : (
                <div className="space-y-1.5">
                  {activeInv.customRules.map((rule) => (
                    <div
                      key={rule.ruleId}
                      className="p-2 bg-ink-900 border border-ink-850 rounded flex items-center justify-between text-xs font-mono"
                    >
                      <div className="truncate pr-2">
                        <div className="text-[10px] font-extrabold text-readable truncate">
                          {rule.name}
                        </div>
                        <div className="text-[8px] text-accent truncate opacity-85">
                          Regex: {rule.pattern}
                        </div>
                      </div>
                      <button
                        onClick={() => deleteCustomRule(rule.ruleId)}
                        className="text-danger hover:underline font-bold text-[9px] shrink-0"
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 5: PLAYBOOKS STEP RUNNER */}
        {activeTab === 'playbooks' && (
          <div className="p-3.5 space-y-4">
            <div className="space-y-1">
              <div className="text-[10px] font-bold text-subtle tracking-wider uppercase">
                Guided SLA Playbooks
              </div>
              <div className="text-[9px] text-subtle leading-relaxed">
                Deterministic checklist workflows executing off-thread. Jump directly to verified
                log coordinates.
              </div>
            </div>

            {!activeInv?.playbooks || activeInv.playbooks.length === 0 ? (
              <div className="text-xs text-subtle italic p-4 text-center bg-ink-900/20 rounded">
                No operational SLA playbooks configured in active case.
              </div>
            ) : (
              <div className="space-y-4">
                {activeInv.playbooks.map((playbook) => {
                  let statusBg = 'bg-ink-850 text-subtle border-ink-800';
                  if (playbook.status === 'completed')
                    statusBg = 'bg-success text-readable border-success/40';
                  if (playbook.status === 'failed')
                    statusBg = 'bg-danger text-readable border-danger/40';
                  if (playbook.status === 'running')
                    statusBg = 'bg-accent text-ink-950 border-accent/40 animate-pulse';

                  return (
                    <div
                      key={playbook.id}
                      className="p-3 border border-ink-800 bg-ink-900/30 rounded-xl space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col min-w-0 pr-2">
                          <span className="text-[11px] font-bold text-readable truncate">
                            {playbook.name}
                          </span>
                          <span className="text-[8px] text-subtle uppercase">
                            {playbook.category} diagnostics
                          </span>
                        </div>
                        <span
                          className={`text-[8px] font-extrabold border px-2 py-0.5 rounded shrink-0 ${statusBg}`}
                        >
                          {playbook.status.toUpperCase()}
                        </span>
                      </div>

                      <div className="text-[10px] text-subtle leading-relaxed">
                        {playbook.description}
                      </div>

                      {/* Playbook checklist steps */}
                      <div className="space-y-2 bg-ink-950 p-2 border border-ink-850 rounded-lg">
                        {playbook.steps.map((step) => {
                          let stepBadge = 'bg-ink-900 text-subtle';
                          if (step.status === 'passed') stepBadge = 'bg-success text-readable';
                          if (step.status === 'failed') stepBadge = 'bg-danger text-readable';
                          if (step.status === 'running')
                            stepBadge = 'bg-accent text-ink-950 animate-pulse';

                          return (
                            <div
                              key={step.id}
                              className="p-2 border border-ink-900 rounded bg-ink-900/30 space-y-1.5 text-xs"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <span className="font-bold text-[10px] text-readable leading-tight">
                                  {step.title}
                                </span>
                                <span
                                  className={`text-[7px] font-extrabold px-1 rounded uppercase shrink-0 ${stepBadge}`}
                                >
                                  {step.status}
                                </span>
                              </div>
                              <div className="text-[9px] text-subtle leading-normal font-sans">
                                {step.description}
                              </div>

                              {step.matchedLineNumbers.length > 0 && (
                                <div className="space-y-1 pt-1">
                                  <span className="text-[8px] text-accent font-bold uppercase block">
                                    Verified Log Coordinates:
                                  </span>
                                  <div className="flex flex-wrap gap-1">
                                    {step.matchedLineNumbers.map((line, lIdx) => (
                                      <button
                                        key={lIdx}
                                        onClick={() => scrollToLineRowIndex(line - 1)}
                                        className="bg-ink-950 border border-ink-800 hover:border-accent text-accent font-bold text-[8px] px-1.5 py-0.2 rounded transition"
                                      >
                                        Line {line}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {step.evidenceSummary && (
                                <div className="text-[8px] text-success bg-ink-950 p-1 rounded font-mono">
                                  Proof: &quot;{step.evidenceSummary}&quot;
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      <button
                        onClick={() => handleRunPlaybook(playbook.id)}
                        disabled={playbook.status === 'running'}
                        className="w-full bg-accent hover:bg-accent-light text-ink-950 py-1.5 rounded text-xs font-bold transition flex items-center justify-center gap-1 disabled:opacity-50"
                      >
                        <span>▶️</span> Run Diagnostic Checklist
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 6: CROSS-LEARNING RECURRING PATTERNS */}
        {activeTab === 'crossLearning' && (
          <div className="p-3.5 space-y-4">
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-subtle tracking-wider uppercase">
                  Recurring Patterns Grid
                </span>
                <button
                  onClick={handleScanPatterns}
                  disabled={patternsScanning}
                  className="bg-accent/20 hover:bg-accent text-accent hover:text-ink-950 font-bold text-[9px] px-2.5 py-1 rounded transition border border-accent/30"
                >
                  {patternsScanning ? '⚙️ Scanning...' : '🔍 Scan Telemetry Patterns'}
                </button>
              </div>
              <div className="text-[9px] text-subtle leading-relaxed">
                Off-thread heuristic pattern suggestions. Operators must manually review and promote
                suggestions to formal SLA rules.
              </div>
            </div>

            {observedPatterns.length === 0 ? (
              <div className="text-xs text-subtle italic p-4 text-center bg-ink-900/20 rounded">
                No recurring telemetry patterns scanned or generated yet. Click above to analyze
                logs.
              </div>
            ) : (
              <div className="space-y-3">
                {observedPatterns.map((pattern) => {
                  return (
                    <div
                      key={pattern.id}
                      className="p-3 border border-ink-800 bg-ink-900/30 rounded-xl space-y-2.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-extrabold text-accent uppercase bg-accent-soft/10 border border-accent/20 px-1.5 rounded">
                          {pattern.occurrencesCount} occurrences
                        </span>
                        <span className="text-[9px] text-subtle font-bold uppercase">
                          {pattern.incidentCategory.replace('_', ' ')}
                        </span>
                      </div>

                      <div className="text-[10px] font-bold text-readable">
                        Suggest: &quot;{pattern.suggestedRuleName}&quot;
                      </div>

                      {/* Pattern promoter diff grid */}
                      <div className="grid grid-cols-2 gap-2 text-[9px] font-mono leading-normal">
                        <div className="p-2 bg-ink-950 border border-ink-850 rounded flex flex-col space-y-1">
                          <span className="text-[8px] font-extrabold text-subtle uppercase">
                            Suggested Pattern Regex
                          </span>
                          <span className="text-accent break-all font-bold select-text">
                            {pattern.pattern}
                          </span>
                        </div>
                        <div className="p-2 bg-ink-950 border border-ink-850 rounded flex flex-col space-y-1 min-w-0">
                          <span className="text-[8px] font-extrabold text-subtle uppercase">
                            Sample Match Log
                          </span>
                          <span
                            className="text-warning-soft break-words truncate"
                            title={pattern.sampleMessage}
                          >
                            {pattern.sampleMessage}
                          </span>
                        </div>
                      </div>

                      <div className="text-[9px] text-subtle font-sans">
                        <span className="font-bold text-readable">Behavior expectation:</span>{' '}
                        {pattern.suggestedExpectedBehavior}
                      </div>

                      {/* Explicit approval button to promote */}
                      <div className="pt-1.5 border-t border-ink-800/30 flex justify-between items-center">
                        <span className="text-[8px] text-subtle">
                          Strict Operator Action Required
                        </span>
                        {pattern.isApproved ? (
                          <span className="text-[9px] text-success font-extrabold bg-success-soft/10 px-2 py-0.5 rounded border border-success/30">
                            ✓ PROMOTED TO RULE
                          </span>
                        ) : (
                          <button
                            onClick={() => promotePatternToRule(pattern.id)}
                            className="bg-success/20 hover:bg-success text-success hover:text-readable font-bold text-[9px] px-3 py-1 rounded transition border border-success/30"
                          >
                            🚀 Promote Pattern to SLA Rule
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 7: GRAPH EXPLORER */}
        {activeTab === 'graph' && (
          <div className="p-3.5 space-y-4">
            <div className="space-y-1">
              <div className="text-[10px] font-bold text-subtle tracking-wider uppercase">
                Incident Knowledge Graph
              </div>
              <div className="text-[9px] text-subtle leading-relaxed">
                Explainable structural nodes mapping root anomalies, hardware triggers, and rule
                compliance.
              </div>
            </div>

            {!incidentGraph || incidentGraph.nodes.length === 0 ? (
              <div className="text-xs text-subtle italic p-4 text-center bg-ink-900/20 rounded">
                Analyze logs to compile the explainable incident relationship graph.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-[9px] font-bold text-accent uppercase tracking-wider">
                  Graph Node Explorer ({incidentGraph.nodes.length} structural elements)
                </div>

                <div className="space-y-2">
                  {incidentGraph.nodes.map((node) => {
                    const isExpanded = expandedGraphNodeId === node.id;
                    const connectedEdges =
                      incidentGraph.edges.filter(
                        (e) => e.sourceId === node.id || e.targetId === node.id,
                      ) || [];

                    let nodeIcon = '⏺️';
                    let badgeColor = 'bg-ink-800 text-subtle';

                    if (node.type === 'incident') {
                      nodeIcon = '⚠️';
                      badgeColor = 'bg-danger text-readable';
                    } else if (node.type === 'hardware') {
                      nodeIcon = '🔌';
                      badgeColor = 'bg-warning text-ink-950';
                    } else if (node.type === 'state') {
                      nodeIcon = '🔄';
                      badgeColor = 'bg-info text-readable';
                    } else if (node.type === 'rule') {
                      nodeIcon = '🛡️';
                      badgeColor = 'bg-success text-readable';
                    }

                    return (
                      <div
                        key={node.id}
                        className={`border rounded-lg transition overflow-hidden ${
                          isExpanded
                            ? 'border-accent/40 bg-ink-900/40'
                            : 'border-ink-800 bg-ink-900/20 hover:bg-ink-900/40'
                        }`}
                      >
                        <div
                          onClick={() => setExpandedGraphNodeId(isExpanded ? null : node.id)}
                          className="p-2.5 cursor-pointer flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="shrink-0">{nodeIcon}</span>
                            <span className="text-xs font-bold text-readable truncate">
                              {node.label}
                            </span>
                          </div>
                          <span
                            className={`text-[8px] font-bold px-1.5 py-0.2 rounded shrink-0 ${badgeColor}`}
                          >
                            {node.type.toUpperCase()}
                          </span>
                        </div>

                        {isExpanded && (
                          <div className="p-2.5 pt-0 border-t border-ink-800/40 bg-ink-950/40 space-y-2.5 text-[10px]">
                            {node.description && (
                              <div className="text-subtle italic border-l border-ink-700 pl-2 leading-relaxed font-sans">
                                {node.description}
                              </div>
                            )}

                            <div className="space-y-1.5">
                              <span className="text-[8px] font-bold text-accent uppercase tracking-wider">
                                Causal Relationships:
                              </span>
                              {connectedEdges.length === 0 ? (
                                <div className="text-[9px] text-subtle italic">
                                  No structural linkages declared.
                                </div>
                              ) : (
                                <div className="space-y-1">
                                  {connectedEdges.map((edge, edgeIdx) => {
                                    const isSource = edge.sourceId === node.id;
                                    const otherNodeId = isSource ? edge.targetId : edge.sourceId;
                                    const otherNode = incidentGraph.nodes.find(
                                      (n) => n.id === otherNodeId,
                                    );

                                    return (
                                      <div
                                        key={edgeIdx}
                                        className="flex items-center gap-1.5 p-1 bg-ink-900 border border-ink-850 rounded text-[9px]"
                                      >
                                        <span className="text-accent font-bold">
                                          {isSource ? 'Outflow ➔' : 'Inflow 👤'}
                                        </span>
                                        <span className="text-readable truncate font-extrabold max-w-[120px]">
                                          {otherNode?.label || otherNodeId}
                                        </span>
                                        <span className="text-subtle font-bold">
                                          ({edge.relationship.toUpperCase()} -{' '}
                                          {Math.round(edge.confidence * 100)}% conf)
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 8: CHRONOLOGICAL REPLAY PLAYER */}
        {activeTab === 'replay' && (
          <div className="p-3.5 space-y-4">
            <div className="text-[10px] font-bold text-subtle tracking-wider uppercase">
              Operational Replay Panel
            </div>

            {!stateSequence || stateSequence.transitions.length === 0 ? (
              <div className="text-xs text-subtle italic p-4 text-center bg-ink-900/20 rounded">
                Reconstruct a state transition sequence first to activate replay functions.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-3 bg-ink-900 border border-ink-800 rounded-xl space-y-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[9px] font-extrabold text-subtle uppercase">
                      Chronology Replay
                    </span>
                    <span className="text-[10px] font-bold text-accent bg-accent-soft/20 border border-accent/30 px-1.5 py-0.2 rounded uppercase animate-pulse">
                      State: {stateSequence.currentState}
                    </span>
                  </div>

                  <div className="flex items-center justify-center gap-3">
                    <button
                      onClick={() => setIsPlaying(!isPlaying)}
                      className={`w-14 py-1.5 rounded text-xs font-bold transition ${
                        isPlaying
                          ? 'bg-rose-500 hover:bg-rose-600 text-readable'
                          : 'bg-accent hover:bg-accent-light text-ink-950'
                      }`}
                    >
                      {isPlaying ? '⏸️ PAUSE' : '▶️ PLAY'}
                    </button>

                    <div className="flex items-center border border-ink-700 bg-ink-950 rounded overflow-hidden">
                      {([1, 2, 5, 10] as const).map((speed) => (
                        <button
                          key={speed}
                          onClick={() => setPlaybackSpeed(speed)}
                          className={`px-2 py-1 text-[10px] font-bold transition border-r border-ink-800 last:border-r-0 ${
                            playbackSpeed === speed
                              ? 'bg-accent text-ink-950'
                              : 'bg-transparent text-subtle hover:text-readable'
                          }`}
                        >
                          {speed}x
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[9px] text-subtle font-bold">
                      <span>
                        Index: {currentTransitionIdx + 1} / {stateSequence.transitions.length}
                      </span>
                      <span>
                        Line:{' '}
                        {currentTransitionIdx >= 0
                          ? stateSequence.transitions[currentTransitionIdx]?.lineNumber
                          : 'None'}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="-1"
                      max={stateSequence.transitions.length - 1}
                      value={currentTransitionIdx}
                      onChange={(e) => handleScrub(parseInt(e.target.value))}
                      className="w-full h-1.5 bg-ink-950 border border-ink-750 rounded-lg appearance-none cursor-pointer accent-accent"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="text-[9px] font-bold text-subtle uppercase tracking-wider block">
                    Replay Frame Sequence ({stateSequence.transitions.length} transitions)
                  </span>

                  <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                    {stateSequence.transitions.map((trans, idx) => {
                      const isActive = currentTransitionIdx === idx;
                      return (
                        <div
                          key={idx}
                          onClick={() => handleScrub(idx)}
                          className={`p-2 border rounded cursor-pointer transition select-none flex items-center justify-between gap-3 text-xs ${
                            isActive
                              ? 'border-accent bg-accent-soft/10 text-readable'
                              : 'border-ink-850 bg-ink-900/20 text-subtle hover:bg-ink-900/40 hover:text-readable'
                          }`}
                        >
                          <div className="truncate flex-1">
                            <span className="font-extrabold text-[10px] block">
                              {trans.fromState} ➔ {trans.toState}
                            </span>
                            <span className="text-[8px] truncate block opacity-75">
                              {trans.triggerMessage}
                            </span>
                          </div>
                          <span className="text-[9px] font-extrabold bg-ink-900 px-1 py-0.5 rounded border border-ink-800 shrink-0">
                            Line {trans.lineNumber}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 9:💼 CASES & COMPLIANCE AUDIT TIMELINE */}
        {activeTab === 'cases' && (
          <div className="p-3.5 space-y-4">
            <div className="text-[10px] font-bold text-subtle tracking-wider uppercase">
              Investigation Case Management
            </div>

            {/* Case Creator */}
            <div className="space-y-2 p-3 bg-ink-900 border border-ink-800 rounded-lg">
              <span className="text-[10px] font-bold text-accent">Initialize New Case</span>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newCaseTitleInput}
                  onChange={(e) => setNewCaseTitleInput(e.target.value)}
                  placeholder="Case title (e.g. SLA Audit #3)"
                  className="flex-1 bg-ink-950 border border-ink-800 rounded px-2.5 py-1 text-xs text-readable placeholder-subtle focus:outline-none focus:border-accent"
                />
                <button
                  onClick={handleCreateCase}
                  className="bg-accent hover:bg-accent-light text-ink-950 px-4 py-1 rounded text-xs font-bold transition shrink-0"
                >
                  Create
                </button>
              </div>
            </div>

            {/* Import / Export Controls */}
            <div className="flex gap-2.5">
              <button
                onClick={handleImportCaseClick}
                className="flex-1 bg-ink-900 hover:bg-ink-850 border border-ink-700 text-readable text-xs py-2 px-3 rounded font-bold transition text-center"
              >
                📥 Import Case Bundle
              </button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImportCaseFile}
                accept=".json"
                className="hidden"
              />
            </div>

            {/* Catalog List */}
            <div className="space-y-2">
              <span className="text-[9px] font-bold text-subtle uppercase tracking-wider">
                Active Cases ({investigationsList.length})
              </span>
              {investigationsList.length === 0 ? (
                <div className="text-xs text-subtle italic p-3 text-center bg-ink-900/10 rounded">
                  No cases listed.
                </div>
              ) : (
                <div className="space-y-2">
                  {investigationsList.map((id) => {
                    const caseObj = investigationsById[id];
                    if (!caseObj) return null;
                    const isActive = activeInvestigationId === id;

                    return (
                      <div
                        key={id}
                        className={`p-2.5 border rounded-lg transition flex flex-col gap-2 ${
                          isActive
                            ? 'border-accent bg-accent-soft/10'
                            : 'border-ink-800 bg-ink-900/40 hover:bg-ink-900'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <span className="text-xs font-extrabold text-readable truncate block">
                              {caseObj.title}
                            </span>
                            <span className="text-[8px] text-subtle font-bold block pt-0.5">
                              Created: {new Date(caseObj.createdAt).toLocaleDateString()} |{' '}
                              {caseObj.bookmarks.length} Bookmarks
                            </span>
                          </div>
                          {isActive && (
                            <span className="text-[8px] bg-accent text-ink-950 font-bold px-1.5 py-0.2 rounded shrink-0">
                              ACTIVE
                            </span>
                          )}
                        </div>

                        <div className="flex justify-end gap-2 pt-1 border-t border-ink-800/30">
                          {!isActive && (
                            <button
                              onClick={() => {
                                useInvestigationStore.getState().setActiveInvestigation(id);
                              }}
                              className="text-[9px] bg-ink-800 hover:bg-ink-700 text-readable font-bold px-2 py-0.5 rounded transition border border-ink-700"
                            >
                              Switch Case
                            </button>
                          )}
                          <button
                            onClick={() => handleExportCase(id, caseObj.title)}
                            className="text-[9px] bg-ink-850 hover:bg-ink-800 text-accent font-bold px-2 py-0.5 rounded transition border border-ink-750"
                          >
                            Export
                          </button>
                          <button
                            onClick={() => deleteInvestigationCase(id)}
                            className="text-[9px] text-danger hover:underline px-1 font-bold"
                          >
                            Purge
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Enterprise Compliance Audit Trail Viewer */}
            <div className="space-y-2.5 pt-3 border-t border-ink-800">
              <span className="text-[10px] font-bold text-accent uppercase tracking-wider block">
                Compliance Audit Trail
              </span>
              <div className="text-[8px] text-subtle leading-normal pb-1 font-sans">
                Chronological log capturing custom rules, promoted heuristics, case exports, and
                executed playbooks.
              </div>

              {auditLog.length === 0 ? (
                <div className="text-[10px] text-subtle italic p-3 text-center bg-ink-900/10 border border-ink-850 rounded">
                  No chronological audit entries recorded.
                </div>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1 select-text">
                  {auditLog.map((entry) => {
                    let actionIcon = '📜';
                    let badgeColor = 'bg-ink-850 text-subtle';

                    if (entry.action === 'rule_create') {
                      actionIcon = '🛡️';
                      badgeColor = 'bg-success text-readable';
                    } else if (entry.action === 'rule_delete') {
                      actionIcon = '🗑️';
                      badgeColor = 'bg-rose-950 text-rose-300';
                    } else if (entry.action === 'playbook_run') {
                      actionIcon = '📋';
                      badgeColor = 'bg-accent text-ink-950';
                    } else if (entry.action === 'pattern_promote') {
                      actionIcon = '🚀';
                      badgeColor = 'bg-emerald-950 text-emerald-300 border border-emerald-800/40';
                    } else if (entry.action === 'case_export') {
                      actionIcon = '📦';
                      badgeColor = 'bg-info text-readable';
                    }

                    return (
                      <div
                        key={entry.id}
                        className="p-2 border border-ink-850 bg-ink-900/20 rounded space-y-1.5 text-xs"
                      >
                        <div className="flex items-center justify-between text-[8px] font-bold text-subtle">
                          <div className="flex items-center gap-1">
                            <span>{actionIcon}</span>
                            <span className={`px-1.5 py-0.2 rounded uppercase ${badgeColor}`}>
                              {entry.action.replace('_', ' ')}
                            </span>
                          </div>
                          <span>{new Date(entry.timestamp).toLocaleTimeString()}</span>
                        </div>

                        <div className="text-[10px] text-readable leading-relaxed">
                          {entry.details}
                        </div>

                        {entry.evidenceLinks && entry.evidenceLinks.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-1">
                            {entry.evidenceLinks.map((link, lIdx) => (
                              <button
                                key={lIdx}
                                onClick={() => scrollToLineRowIndex(link.lineNumber - 1)}
                                className="bg-ink-950 border border-ink-800 hover:border-accent text-warning font-bold text-[8px] px-1.5 py-0.2 rounded transition"
                              >
                                Target Line {link.lineNumber}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
