import { useEffect, useState, type JSX } from 'react';
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
} from '@shared/contracts/investigations';
import type { StructuredLogEntry } from '@shared/contracts/logs';

type ActiveTab = 'workspace' | 'incidents' | 'states' | 'chains' | 'rules';

export const InvestigationsPanel = (): JSX.Element => {
  const selectedFilePath = useViewerStore((state) => state.selectedFilePath);
  const scrollToLineRowIndex = useViewerStore((state) => state.scrollToLineRowIndex);

  // Investigation Workspace store bindings
  const ensureActiveInvestigation = useInvestigationStore(
    (state) => state.ensureActiveInvestigation,
  );
  const activeInvestigationId = useInvestigationStore((state) => state.activeInvestigationId);
  const investigationsById = useInvestigationStore((state) => state.investigationsById);

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

  // Panel state
  const [activeTab, setActiveTab] = useState<ActiveTab>('workspace');
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [stateSequence, setStateSequence] = useState<StateTransitionSequence | null>(null);
  const [failureChains, setFailureChains] = useState<FailureChainCandidate[]>([]);
  const [ruleResults, setRuleResults] = useState<DomainRuleResult[]>([]);

  // Input fields
  const [newFilterName, setNewFilterName] = useState('');
  const [newSnapshotTitle, setNewSnapshotTitle] = useState('');
  const [bookmarkNote, setBookmarkNote] = useState('');
  const [loading, setLoading] = useState(false);

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
      return;
    }

    const runOffThreadAnalysis = async (): Promise<void> => {
      setLoading(true);
      try {
        const workerClient = getEngineWorkerClient();
        const now = Date.now();

        // 1. Detect Incidents
        const incidentRes = await workerClient.request({
          type: 'detectIncidents',
          requestId: `incidents:${selectedFilePath}:${now}`,
          sourceId: selectedFilePath,
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
        });
        if (stateRes.type === 'reconstructStates:done') {
          setStateSequence(stateRes.sequence);
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
        });
        if (ruleRes.type === 'validateDomainRules:done') {
          setRuleResults(ruleRes.results);
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
  }, [selectedFilePath]);

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
        severityFilters: (filter.severityFilters || {}) as unknown as ViewerPreferences['severityFilters'],
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
    }
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
    // Highlight or filter logs in the viewer by setting the search to the incident type or ID
    useSearchStore.getState().setSearchQuery(incident.category);
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

  return (
    <div className="flex h-full w-full flex-col bg-ink-950 text-readable font-mono select-none overflow-hidden border-l border-ink-800">
      {/* Visual Telemetry Header */}
      <div className="p-3 bg-ink-900 border-b border-ink-800 space-y-2 shrink-0">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-subtle tracking-wider uppercase">
            Investigation Engine
          </span>
          {loading && (
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-accent"></span>
            </span>
          )}
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-accent font-bold truncate max-w-[180px]">
            {activeInv?.title || 'Draft Workspace'}
          </span>
          <span className="text-[10px] bg-ink-850 px-1.5 py-0.5 rounded text-subtle border border-ink-800">
            {activeInv?.mode.replace(/([A-Z])/g, ' $1').toUpperCase() || 'INVESTIGATION'}
          </span>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-ink-800 bg-ink-900/60 shrink-0 overflow-x-auto scrollbar-none">
        {(
          [
            { id: 'workspace', label: 'RCA', icon: '📝' },
            { id: 'incidents', label: `Incidents (${incidents.length})`, icon: '⚠️' },
            { id: 'states', label: 'States', icon: '🔄' },
            { id: 'chains', label: `Chains (${failureChains.length})`, icon: '🔗' },
            { id: 'rules', label: `SLA (${complianceRate}%)`, icon: '🛡️' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1 px-3 py-2 text-[10px] font-bold tracking-tight border-b-2 transition shrink-0 ${
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
          <div className="p-3 space-y-4">
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
          <div className="p-3 space-y-3">
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
                              // Retrieve first line coordinates and scroll viewport
                              if (incident.entryIds[0]) {
                                const viewportEntries =
                                  useViewerStore.getState().viewportEntriesByPath[
                                    selectedFilePath
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
                              useViewerStore.getState().viewportEntriesByPath[selectedFilePath] ||
                              [];
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
                              .findSimilarIncidents(selectedFilePath, incident.id);
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
          <div className="p-3 space-y-3">
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
                      {/* Left timeline connecting dot */}
                      <span className="absolute -left-[20.5px] top-1 w-2.5 h-2.5 rounded-full bg-ink-800 border border-ink-950 flex items-center justify-center group-hover:bg-accent transition">
                        <span className="w-1 h-1 bg-ink-950 rounded-full" />
                      </span>

                      {/* Transition Card */}
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
          <div className="p-3 space-y-3">
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

                      {/* Cascading Node Indicators */}
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

                      {/* Key Open Troubleshooting Questions */}
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
          <div className="p-3 space-y-3">
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
                                  // Search for matching log line from evidence list
                                  try {
                                    const client = getEngineWorkerClient();
                                    await client.request({
                                      type: 'getVisibleWindow',
                                      requestId: `rule-ev:${id}:${Date.now()}`,
                                      sourceId: selectedFilePath,
                                      startRow: 0,
                                      endRow: 1,
                                    });
                                    // Alternatively, we can let user bookmark or we just jump coordinates if index exists
                                    // For now, scroll to approximate line row index using a simple mapper
                                  } catch (e) {
                                    console.warn('Failed to request visible window for rule validation', e);
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
      </div>
    </div>
  );
};
