import { useEffect, useState, useRef, type JSX } from 'react';
import { useWorkbenchStore } from '@renderer/features/workbench/workbenchStore';
import { getEngineWorkerClient } from '@renderer/services/workerClient';
import { useAiStore } from '@renderer/stores/aiStore';
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
  | 'chains'
  | 'rules'
  | 'cases'
  | 'graph'
  | 'replay'
  | 'customRules';

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

  const isAiLoading = useAiStore((state) => state.loading);

  // Panel active tabs
  const [activeTab, setActiveTab] = useState<ActiveTab>('workspace');
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [stateSequence, setStateSequence] = useState<StateTransitionSequence | null>(null);
  const [failureChains, setFailureChains] = useState<FailureChainCandidate[]>([]);
  const [ruleResults, setRuleResults] = useState<DomainRuleResult[]>([]);

  // Phase 8 Off-Thread Calculated States
  const [degradation, setDegradation] = useState<OperationalDegradationResult | null>(null);
  const [incidentGraph, setIncidentGraph] = useState<IncidentKnowledgeGraph | null>(null);

  // Input states
  const [newFilterName, setNewFilterName] = useState('');
  const [newSnapshotTitle, setNewSnapshotTitle] = useState('');
  const [bookmarkNote, setBookmarkNote] = useState('');
  const [loading, setLoading] = useState(false);

  // Cases Tab local inputs
  const [newCaseTitleInput, setNewCaseTitleInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIncidents([]);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStateSequence(null);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFailureChains([]);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRuleResults([]);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDegradation(null);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIncidentGraph(null);
      return;
    }

    const runOffThreadAnalysis = async (): Promise<void> => {
      setLoading(true);
      try {
        const workerClient = getEngineWorkerClient();
        const now = Date.now();

        // Pass customRules associated with the active investigation
        const activeCustomRules = activeInv?.customRules || [];

        // 1. Detect Incidents
        const incidentRes = await workerClient.request({
          type: 'detectIncidents',
          requestId: `incidents:${selectedFilePath}:${now}`,
          sourceId: selectedFilePath,
          customRules: activeCustomRules,
        });
        let freshIncidents: Incident[] = [];
        if (incidentRes.type === 'detectIncidents:done') {
          setIncidents(incidentRes.incidents);
          freshIncidents = incidentRes.incidents;
        }

        // 2. Reconstruct State Machines
        const stateRes = await workerClient.request({
          type: 'reconstructStates',
          requestId: `states:${selectedFilePath}:${now}`,
          sourceId: selectedFilePath,
          customRules: activeCustomRules,
        });
        let freshSequence: StateTransitionSequence | null = null;
        if (stateRes.type === 'reconstructStates:done') {
          setStateSequence(stateRes.sequence);
          freshSequence = stateRes.sequence;
        }

        // 3. Detect Failure Chains
        if (freshIncidents.length > 0) {
          const chainRes = await workerClient.request({
            type: 'detectFailureChains',
            requestId: `chains:${selectedFilePath}:${now}`,
            sourceId: selectedFilePath,
            incidents: freshIncidents,
          });
          if (chainRes.type === 'detectFailureChains:done') {
            setFailureChains(chainRes.chains);
          }
        } else {
          setFailureChains([]);
        }

        // 4. Validate Domain Rules
        const ruleRes = await workerClient.request({
          type: 'validateDomainRules',
          requestId: `rules:${selectedFilePath}:${now}`,
          sourceId: selectedFilePath,
          customRules: activeCustomRules,
        });
        let freshRules: DomainRuleResult[] = [];
        if (ruleRes.type === 'validateDomainRules:done') {
          setRuleResults(ruleRes.results);
          freshRules = ruleRes.results;
        }

        // 5. Calculate Operational Degradation Score
        const degradationRes = await workerClient.request({
          type: 'calculateDegradationScore',
          requestId: `degradation:${selectedFilePath}:${now}`,
          sourceId: selectedFilePath,
          incidents: freshIncidents,
          ruleResults: freshRules,
        });
        if (degradationRes.type === 'calculateDegradationScore:done') {
          setDegradation(degradationRes.result);
        }

        // 6. Compile Incident Relationship Graph
        const graphRes = await workerClient.request({
          type: 'compileIncidentGraph',
          requestId: `graph:${selectedFilePath}:${now}`,
          sourceId: selectedFilePath,
          incidents: freshIncidents,
          sequence: freshSequence,
          ruleResults: freshRules,
        });
        if (graphRes.type === 'compileIncidentGraph:done') {
          setIncidentGraph(graphRes.graph);
        }
      } catch (err) {
        console.error('Failed to run operational correlation analysis:', err);
      } finally {
        setLoading(false);
      }
    };

    void runOffThreadAnalysis();

    // Poll for updates every 8 seconds if live Monitoring or tail mode is running
    const interval = setInterval(runOffThreadAnalysis, 8000);
    return () => clearInterval(interval);
  }, [selectedFilePath, activeInv?.customRules]);

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
        severityFilters:
          filter.severityFilters as unknown as ViewerPreferences['severityFilters'],
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
    // Reset file input
    event.target.value = '';
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
    healthLevel === 'critical'
      ? '#f43f5e'
      : healthLevel === 'degraded'
        ? '#f59e0b'
        : '#10b981';
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

  return (
    <div className="flex h-full w-full flex-col bg-ink-950 text-readable font-mono select-none overflow-hidden border-l border-ink-800">
      {/* Visual Telemetry Enterprise Header */}
      <div className="p-3.5 bg-ink-900 border-b border-ink-800 flex items-center justify-between gap-3 shrink-0">
        <div className="space-y-1.5 flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-extrabold text-accent tracking-widest uppercase">
              Investigation Platform v8
            </span>
            {loading && (
              <span className="flex h-1.5 w-1.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-accent" />
              </span>
            )}
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-readable font-bold truncate max-w-[150px]" title={activeInv?.title}>
              {activeInv?.title || 'Draft Case'}
            </span>
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
            <span className="text-[8px] font-bold text-subtle tracking-wider uppercase">Health</span>
            <span className="text-[10px] font-extrabold capitalize">{healthLevel}</span>
          </div>
        </div>
      </div>

      {/* Responsive Navigation Tabs Grid */}
      <div className="grid grid-cols-3 border-b border-ink-800 bg-ink-900/60 shrink-0 text-[10px] font-bold">
        {(
          [
            { id: 'workspace', label: 'RCA Core', icon: '🔬' },
            { id: 'incidents', label: `Incidents (${incidents.length})`, icon: '⚠️' },
            { id: 'states', label: 'States', icon: '🔄' },
            { id: 'chains', label: `Chains (${failureChains.length})`, icon: '🔗' },
            { id: 'rules', label: `SLA (${complianceRate}%)`, icon: '🛡️' },
            { id: 'cases', label: 'Cases', icon: '💼' },
            { id: 'graph', label: 'Graph Map', icon: '🕸️' },
            { id: 'replay', label: 'Replay', icon: '🔄' },
            { id: 'customRules', label: 'Rules Builder', icon: '🛡️' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center justify-center gap-1 py-2 transition border-b-2 font-bold ${
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

        {/* TAB 2: AUTOMATED INCIDENT GROUPS */}
        {activeTab === 'incidents' && (
          <div className="p-3.5 space-y-3">
            <div className="text-[10px] font-bold text-subtle tracking-wider uppercase">
              Detected Incidents ({incidents.length})
            </div>
            {incidents.length === 0 ? (
              <div className="text-xs text-subtle italic p-4 text-center bg-ink-900/20 rounded">
                No active operational anomalies or failure loops detected in current document logs.
              </div>
            ) : (
              <div className="space-y-2">
                {incidents.map((incident) => {
                  const cardColor =
                    incident.severity === 'error'
                      ? 'border-danger/30 bg-danger-soft/10 hover:border-danger/50'
                      : 'border-warning/30 bg-warning-soft/10 hover:border-warning/50';

                  return (
                    <div
                      key={incident.id}
                      className={`p-2.5 border rounded-lg transition select-none flex flex-col space-y-1.5 ${cardColor}`}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`text-[9px] font-bold px-1 py-0.5 rounded ${
                            incident.severity === 'error'
                              ? 'bg-danger text-readable'
                              : 'bg-warning text-ink-950'
                          }`}
                        >
                          {incident.category.replace('_', ' ').toUpperCase()}
                        </span>
                        <span className="text-[9px] text-subtle font-bold">
                          {(incident.confidence * 100).toFixed(0)}% Conf
                        </span>
                      </div>

                      <div className="text-[11px] font-bold text-readable leading-relaxed">
                        {incident.title}
                      </div>

                      <div className="text-[10px] text-subtle leading-relaxed">
                        {incident.description}
                      </div>

                      {incident.durationMs !== null && (
                        <div className="text-[9px] text-accent">
                          Incident Span:{' '}
                          <span className="font-bold">
                            {(incident.durationMs / 1000).toFixed(1)}s
                          </span>
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-1 border-t border-ink-800/30">
                        <span className="text-[8px] text-subtle">
                          {incident.entryIds.length} logs grouped
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
                              if (incident.entryIds[0]) {
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
                            Jump to Start
                          </button>
                        </div>
                      </div>
                      <div className="flex justify-end gap-2 pt-1 border-t border-ink-800/10">
                        <button
                          onClick={async () => {
                            const viewportEntries =
                              useViewerStore.getState().viewportEntriesByPath[
                                selectedFilePath || ''
                              ] || [];
                            const incidentEntries = viewportEntries.filter((entry) =>
                              incident.entryIds.includes(entry.id),
                            );
                            const prompt = `Analyze detected incident: ${incident.title}. Category: ${incident.category}. Description: ${incident.description}`;

                            const bottomPanelState = useWorkbenchStore.getState();
                            if (bottomPanelState.activeBottomPanel !== 'aiEvidence') {
                              bottomPanelState.setActiveBottomPanel('aiEvidence');
                            } else if (!bottomPanelState.isBottomPanelVisible) {
                              bottomPanelState.toggleBottomPanel();
                            }

                            await useAiStore
                              .getState()
                              .runAiReasoning(
                                activeInvestigationId || 'draft',
                                prompt,
                                incidentEntries,
                              );
                          }}
                          disabled={isAiLoading}
                          className="text-[9px] text-accent font-bold hover:underline flex items-center gap-0.5 disabled:opacity-50"
                        >
                          ✨ Analyze Incident
                        </button>
                        <button
                          onClick={async () => {
                            const bottomPanelState = useWorkbenchStore.getState();
                            if (bottomPanelState.activeBottomPanel !== 'aiEvidence') {
                              bottomPanelState.setActiveBottomPanel('aiEvidence');
                            } else if (!bottomPanelState.isBottomPanelVisible) {
                              bottomPanelState.toggleBottomPanel();
                            }

                            await useAiStore
                              .getState()
                              .findSimilarIncidents(selectedFilePath || '', incident.id);
                          }}
                          disabled={isAiLoading}
                          className="text-[9px] text-emerald-400 font-bold hover:underline flex items-center gap-0.5 disabled:opacity-50"
                        >
                          🔍 Find Similar
                        </button>
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

        {/* TAB 4: CASCADING FAILURE CHAINS */}
        {activeTab === 'chains' && (
          <div className="p-3.5 space-y-3">
            <div className="text-[10px] font-bold text-subtle tracking-wider uppercase">
              Detected Cascading Failures ({failureChains.length})
            </div>
            {failureChains.length === 0 ? (
              <div className="text-xs text-subtle italic p-4 text-center bg-ink-900/20 rounded">
                No propagation paths or cascading errors discovered. Terminal triggers appear
                isolated.
              </div>
            ) : (
              <div className="space-y-3">
                {failureChains.map((chain) => {
                  return (
                    <div
                      key={chain.id}
                      className="p-2.5 border border-ink-800 bg-ink-900/30 rounded-lg space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-readable">{chain.title}</span>
                        <span className="text-[9px] text-danger bg-danger-soft/20 px-1 rounded font-bold">
                          {Math.round(chain.probability * 100)}% Prob
                        </span>
                      </div>
                      <div className="text-[10px] text-subtle leading-relaxed">
                        {chain.description}
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 pt-1.5">
                        {chain.orderedIncidents.map((ci, idx) => (
                          <div key={ci.id} className="flex items-center gap-1.5">
                            {idx > 0 && <span className="text-accent text-[9px]">→</span>}
                            <span className="text-[8px] bg-ink-850 px-1 py-0.5 rounded text-readable border border-ink-800 max-w-[120px] truncate">
                              {ci.category.replace('_', ' ').toUpperCase()}
                            </span>
                          </div>
                        ))}
                      </div>

                      {chain.openQuestions.length > 0 && (
                        <div className="mt-2.5 p-2 bg-ink-950 border border-ink-850 rounded space-y-1">
                          <div className="text-[9px] font-bold text-warning uppercase">
                            Key Root Cause Questions:
                          </div>
                          <ul className="list-disc pl-3 text-[9px] text-subtle space-y-1 leading-relaxed">
                            {chain.openQuestions.map((q, idx) => (
                              <li key={idx}>{q}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 5: DOMAIN RULE ENGINE */}
        {activeTab === 'rules' && (
          <div className="p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-subtle tracking-wider uppercase">
                SLA Compliance Auditor
              </span>
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  complianceRate >= 90
                    ? 'bg-success text-readable'
                    : complianceRate >= 60
                      ? 'bg-warning text-ink-950'
                      : 'bg-danger text-readable'
                }`}
              >
                {complianceRate}% Compliant
              </span>
            </div>

            {ruleResults.length === 0 ? (
              <div className="text-xs text-subtle italic p-4 text-center bg-ink-900/20 rounded">
                No domain rules configured or checked.
              </div>
            ) : (
              <div className="space-y-2.5">
                {ruleResults.map((rule) => {
                  let statusColor = 'border-ink-800 bg-ink-900 text-subtle';
                  let statusBadge = 'UNKNOWN';
                  let statusBg = 'bg-ink-800 text-subtle';

                  if (rule.status === 'passed') {
                    statusColor = 'border-success/30 bg-success-soft/10';
                    statusBadge = 'COMPLIANT';
                    statusBg = 'bg-success text-readable';
                  } else if (rule.status === 'violation') {
                    statusColor = 'border-danger/30 bg-danger-soft/10';
                    statusBadge = 'VIOLATION';
                    statusBg = 'bg-danger text-readable';
                  }

                  return (
                    <div
                      key={rule.ruleId}
                      className={`p-2.5 border rounded-lg transition space-y-2 ${statusColor}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-readable truncate pr-2">
                          {rule.name}
                        </span>
                        <span className={`text-[8px] font-bold px-1 rounded shrink-0 ${statusBg}`}>
                          {statusBadge}
                        </span>
                      </div>

                      <div className="text-[9px] text-subtle bg-ink-950 p-1.5 rounded border border-ink-900 italic leading-relaxed">
                        Behavior: &quot;{rule.expectedBehavior}&quot;
                      </div>

                      {rule.notes && (
                        <div className="text-[10px] text-readable leading-relaxed">
                          {rule.notes}
                        </div>
                      )}

                      {/* Clickable Violation Coordinates */}
                      {rule.status === 'violation' && rule.evidenceEntryIds.length > 0 && (
                        <div className="space-y-1">
                          <div className="text-[8px] font-bold text-danger uppercase">
                            Anomalous Evidence Lines:
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {rule.evidenceEntryIds.map((id, idx) => (
                              <button
                                key={id}
                                onClick={async () => {
                                  try {
                                    const client = getEngineWorkerClient();
                                    const res = await client.request({
                                      type: 'getVisibleWindow',
                                      requestId: `rule-ev:${id}:${Date.now()}`,
                                      sourceId: selectedFilePath,
                                      startRow: 0,
                                      endRow: 1,
                                    });
                                    // Navigate to rule coordinates
                                    if (res.type === 'getVisibleWindow:done' && res.window) {
                                      scrollToLineRowIndex(res.window.startRow);
                                    }
                                  } catch (e) {
                                    console.warn(
                                      'Failed to request visible window for rule validation',
                                      e,
                                    );
                                  }
                                }}
                                className="bg-ink-900 border border-danger/25 text-danger font-bold text-[8px] px-1.5 py-0.5 rounded hover:border-danger transition"
                              >
                                Trigger #{idx + 1}
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
        )}

        {/* TAB 6:💼 CASES MANAGEMENT */}
        {activeTab === 'cases' && (
          <div className="p-3.5 space-y-4">
            <div className="text-[10px] font-bold text-subtle tracking-wider uppercase">
              Investigation Cases Directory
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
                Saved Case Bundles ({investigationsList.length})
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
                              Switch to Case
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
          </div>
        )}

        {/* TAB 7:🕸️ EXPLAINABLE RELATIONSHIP GRAPH */}
        {activeTab === 'graph' && (
          <div className="p-3.5 space-y-4">
            <div className="space-y-1">
              <div className="text-[10px] font-bold text-subtle tracking-wider uppercase">
                Incident Knowledge Graph
              </div>
              <div className="text-[9px] text-subtle leading-relaxed">
                Explainable structural nodes mapping root anomalies, hardware triggers, and rule compliance.
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
                        {/* Header Trigger */}
                        <div
                          onClick={() =>
                            setExpandedGraphNodeId(isExpanded ? null : node.id)
                          }
                          className="p-2.5 cursor-pointer flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="shrink-0">{nodeIcon}</span>
                            <span className="text-xs font-bold text-readable truncate">
                              {node.label}
                            </span>
                          </div>
                          <span className={`text-[8px] font-bold px-1.5 py-0.2 rounded shrink-0 ${badgeColor}`}>
                            {node.type.toUpperCase()}
                          </span>
                        </div>

                        {/* Expandable Accordion Causal Links */}
                        {isExpanded && (
                          <div className="p-2.5 pt-0 border-t border-ink-800/40 bg-ink-950/40 space-y-2.5 text-[10px]">
                            {node.description && (
                              <div className="text-subtle italic border-l border-ink-700 pl-2 leading-relaxed">
                                {node.description}
                              </div>
                            )}

                            {/* Node Connections */}
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
                                          ({edge.relationship.toUpperCase()} - {Math.round(edge.confidence * 100)}% conf)
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

        {/* TAB 8:🔄 CHRONOLOGICAL REPLAY PLAYER */}
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
                {/* Visual Player Board */}
                <div className="p-3 bg-ink-900 border border-ink-800 rounded-xl space-y-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[9px] font-extrabold text-subtle uppercase">
                      Chronology Replay
                    </span>
                    <span className="text-[10px] font-bold text-accent bg-accent-soft/20 border border-accent/30 px-1.5 py-0.2 rounded uppercase animate-pulse">
                      State: {stateSequence.currentState}
                    </span>
                  </div>

                  {/* Playback Controls Row */}
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

                    {/* Speed Selector */}
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

                  {/* Scrubbing Progress Timeline Bar */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[9px] text-subtle font-bold">
                      <span>Index: {currentTransitionIdx + 1} / {stateSequence.transitions.length}</span>
                      <span>Line: {currentTransitionIdx >= 0 ? stateSequence.transitions[currentTransitionIdx]?.lineNumber : 'None'}</span>
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

                {/* Chronology Step Viewport list */}
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

        {/* TAB 9:🛡️ CUSTOM REGEX RULE COMPILER */}
        {activeTab === 'customRules' && (
          <div className="p-3.5 space-y-4">
            <div className="text-[10px] font-bold text-subtle tracking-wider uppercase">
              Custom Operational SLA Builder
            </div>

            {/* Custom SLA Rule Creator Form */}
            <div className="p-3.5 bg-ink-900 border border-ink-800 rounded-xl space-y-3.5">
              <span className="text-[10px] font-bold text-accent block">Compile Telemetry Rule</span>

              {/* Form Input fields */}
              <div className="space-y-3 text-xs">
                {/* Rule Name */}
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-subtle uppercase block">
                    Rule Name
                  </label>
                  <input
                    type="text"
                    value={ruleName}
                    onChange={(e) => setRuleName(e.target.value)}
                    placeholder="Merchant API Timeout Check"
                    className="w-full bg-ink-950 border border-ink-800 rounded px-2 py-1 text-xs text-readable placeholder-subtle focus:outline-none focus:border-accent"
                  />
                </div>

                {/* Regex Pattern */}
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-subtle uppercase block">
                    Regex Pattern / String Match
                  </label>
                  <input
                    type="text"
                    value={rulePattern}
                    onChange={(e) => setRulePattern(e.target.value)}
                    placeholder="api_gateway.*timeout"
                    className="w-full bg-ink-950 border border-ink-800 rounded px-2 py-1 text-xs text-readable placeholder-subtle focus:outline-none focus:border-accent"
                  />
                </div>

                {/* Expected Behavior */}
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-subtle uppercase block">
                    Expected Behavior Description
                  </label>
                  <input
                    type="text"
                    value={ruleExpected}
                    onChange={(e) => setRuleExpected(e.target.value)}
                    placeholder="API authorization requests must return inside SLA bounds"
                    className="w-full bg-ink-950 border border-ink-800 rounded px-2 py-1 text-xs text-readable placeholder-subtle focus:outline-none focus:border-accent"
                  />
                </div>

                {/* Category & Severity Grid */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
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
                      className="w-full bg-ink-950 border border-ink-800 rounded px-2 py-1 text-xs text-readable focus:outline-none"
                    >
                      <option value="payment">payment</option>
                      <option value="hardware">hardware</option>
                      <option value="network">network</option>
                      <option value="system">system</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-subtle uppercase block">
                      Severity
                    </label>
                    <select
                      value={ruleSeverity}
                      onChange={(e) => setRuleSeverity(e.target.value as 'error' | 'warn')}
                      className="w-full bg-ink-950 border border-ink-800 rounded px-2 py-1 text-xs text-readable focus:outline-none"
                    >
                      <option value="error">error</option>
                      <option value="warn">warn</option>
                    </select>
                  </div>
                </div>

                {/* Add Rule trigger */}
                <button
                  onClick={handleCreateCustomRule}
                  className="w-full bg-accent hover:bg-accent-light text-ink-950 py-2 rounded text-xs font-bold transition"
                >
                  Save & Audit Custom SLA Rule
                </button>
              </div>
            </div>

            {/* Custom Rules List in active bundle */}
            <div className="space-y-2">
              <span className="text-[9px] font-bold text-subtle uppercase tracking-wider block">
                Active Custom Rules in Case Bundle
              </span>

              {(!activeInv?.customRules || activeInv.customRules.length === 0) ? (
                <div className="text-xs text-subtle italic p-3.5 text-center bg-ink-900/10 border border-dashed border-ink-800 rounded-lg">
                  No custom SLA rules loaded yet. Create one above to test!
                </div>
              ) : (
                <div className="space-y-2">
                  {activeInv.customRules.map((rule) => {
                    return (
                      <div
                        key={rule.ruleId}
                        className="p-2.5 bg-ink-900 border border-ink-800 rounded-lg flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="truncate flex-1">
                          <span className="font-extrabold text-readable truncate block">
                            {rule.name}
                          </span>
                          <span className="text-[9px] text-accent block opacity-75 font-mono">
                            Pattern: {rule.pattern}
                          </span>
                        </div>
                        <button
                          onClick={() => deleteCustomRule(rule.ruleId)}
                          className="text-danger hover:text-danger-light font-bold text-[10px] shrink-0"
                        >
                          Delete
                        </button>
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
