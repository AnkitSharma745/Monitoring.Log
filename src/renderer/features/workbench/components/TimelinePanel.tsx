import { useEffect, useState, type JSX } from 'react';
import { getEngineWorkerClient } from '@renderer/services/workerClient';
import { useInvestigationStore } from '@renderer/stores/investigationStore';
import { useViewerStore } from '@renderer/stores/viewerStore';
import type {
  Incident,
  StateTransition,
  StateTransitionSequence,
} from '@shared/contracts/investigations';
import type { CorrelationSequence } from '@shared/contracts/logs';

interface DetectedPattern {
  type: 'payment_retry' | 'heartbeat_failure' | 'kiosk_reset_chain' | 'api_storm';
  description: string;
  indicators: string[];
  affectedEntryCount: number;
  severity: 'error' | 'warn';
}

const EMPTY_ARRAY: never[] = [];

interface AlignedTransition {
  state: string;
  primary: StateTransition | undefined;
  split: StateTransition | undefined;
  pElapsedMs: number | null;
  sElapsedMs: number | null;
  deltaMs: number | null;
}

const alignTransitions = (
  primary: StateTransitionSequence | null,
  split: StateTransitionSequence | null,
): AlignedTransition[] => {
  if (!primary && !split) return [];

  const aligned: AlignedTransition[] = [];
  const pTrans = primary?.transitions || [];
  const sTrans = split?.transitions || [];

  const pStart = pTrans[0] ? Date.parse(pTrans[0].timestamp || '') : NaN;
  const sStart = sTrans[0] ? Date.parse(sTrans[0].timestamp || '') : NaN;

  const visitedSplitIndices = new Set<number>();

  pTrans.forEach((pt) => {
    const sIdx = sTrans.findIndex(
      (st, idx) => st.toState === pt.toState && !visitedSplitIndices.has(idx),
    );

    let st: StateTransition | undefined;
    if (sIdx !== -1) {
      st = sTrans[sIdx];
      visitedSplitIndices.add(sIdx);
    }

    const pTime = Date.parse(pt.timestamp || '');
    const sTime = st ? Date.parse(st.timestamp || '') : NaN;

    const pElapsed = !isNaN(pTime) && !isNaN(pStart) ? pTime - pStart : null;
    const sElapsed = st && !isNaN(sTime) && !isNaN(sStart) ? sTime - sStart : null;
    const delta = pElapsed !== null && sElapsed !== null ? sElapsed - pElapsed : null;

    aligned.push({
      state: pt.toState,
      primary: pt,
      split: st,
      pElapsedMs: pElapsed,
      sElapsedMs: sElapsed,
      deltaMs: delta,
    });
  });

  sTrans.forEach((st, idx) => {
    if (!visitedSplitIndices.has(idx)) {
      const sTime = Date.parse(st.timestamp || '');
      const sElapsed = !isNaN(sTime) && !isNaN(sStart) ? sTime - sStart : null;

      aligned.push({
        state: st.toState,
        primary: undefined,
        split: st,
        pElapsedMs: null,
        sElapsedMs: sElapsed,
        deltaMs: null,
      });
    }
  });

  return aligned;
};

export const TimelinePanel = (): JSX.Element => {
  const selectedFilePath = useViewerStore((state) => state.selectedFilePath);
  const bookmarks = useInvestigationStore((state) => {
    const activeId = state.activeInvestigationId;
    if (!activeId) return EMPTY_ARRAY;
    return state.investigationsById[activeId]?.bookmarks || EMPTY_ARRAY;
  });
  const [patterns, setPatterns] = useState<DetectedPattern[]>([]);
  const [searchField, setSearchField] = useState<
    'correlationId' | 'paymentId' | 'sessionId' | 'hardwareId'
  >('correlationId');
  const [searchValue, setSearchValue] = useState('');
  const [activeSequence, setActiveSequence] = useState<CorrelationSequence | null>(null);
  const [loading, setLoading] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  const isSplitActive = useViewerStore((state) => state.isSplitActive);
  const splitFilePath = useViewerStore((state) => state.splitFilePath);
  const viewportSeverityStatsByPath = useViewerStore((state) => state.viewportSeverityStatsByPath);

  const [activeTab, setActiveTab] = useState<'correlation' | 'diff'>('correlation');
  const [primaryStateSeq, setPrimaryStateSeq] = useState<StateTransitionSequence | null>(null);
  const [splitStateSeq, setSplitStateSeq] = useState<StateTransitionSequence | null>(null);
  const [primaryIncidents, setPrimaryIncidents] = useState<Incident[]>([]);
  const [splitIncidents, setSplitIncidents] = useState<Incident[]>([]);
  const [diffLoading, setDiffLoading] = useState(false);

  const activeCustomRules = useInvestigationStore((state) => {
    const activeId = state.activeInvestigationId;
    if (!activeId) return EMPTY_ARRAY;
    return state.investigationsById[activeId]?.customRules || EMPTY_ARRAY;
  });

  const getBasename = (filePath: string | null): string => {
    if (!filePath) return '';
    const parts = filePath.split(/[\\/]/);
    return parts[parts.length - 1] || filePath;
  };

  const getBootDelayMs = (sequence: StateTransitionSequence | null): number | null => {
    if (!sequence) return null;
    const booting = sequence.transitions.find((t) => t.toState === 'BOOTING');
    const ready = sequence.transitions.find((t) => t.toState === 'READY');
    if (booting?.timestamp && ready?.timestamp) {
      const bTime = Date.parse(booting.timestamp);
      const rTime = Date.parse(ready.timestamp);
      if (!isNaN(bTime) && !isNaN(rTime)) {
        return rTime - bTime;
      }
    }
    if (ready?.timestamp && sequence.transitions[0]?.timestamp) {
      const start = Date.parse(sequence.transitions[0].timestamp);
      const rTime = Date.parse(ready.timestamp);
      if (!isNaN(start) && !isNaN(rTime)) {
        return rTime - start;
      }
    }
    return null;
  };

  const formatDelay = (ms: number | null): string => {
    if (ms === null) return 'N/A';
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const handleLineClick = (lineNumber: number, filePath: string): void => {
    useViewerStore.getState().scrollToLineRowIndex(lineNumber - 1, filePath);
  };

  // Synchronized state & incident data loading
  useEffect(() => {
    if (!isSplitActive || !selectedFilePath || !splitFilePath) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPrimaryStateSeq(null);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSplitStateSeq(null);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPrimaryIncidents([]);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSplitIncidents([]);
      return;
    }

    const loadComparisonData = async (): Promise<void> => {
      setDiffLoading(true);
      try {
        const workerClient = getEngineWorkerClient();
        const now = Date.now();

        // 1. Reconstruct States for both documents
        const pStateRes = await workerClient.request({
          type: 'reconstructStates',
          requestId: `states-primary:${selectedFilePath}:${now}`,
          sourceId: selectedFilePath,
          customRules: activeCustomRules,
        });

        const sStateRes = await workerClient.request({
          type: 'reconstructStates',
          requestId: `states-split:${splitFilePath}:${now}`,
          sourceId: splitFilePath,
          customRules: activeCustomRules,
        });

        if (pStateRes.type === 'reconstructStates:done') {
          setPrimaryStateSeq(pStateRes.sequence);
        }
        if (sStateRes.type === 'reconstructStates:done') {
          setSplitStateSeq(sStateRes.sequence);
        }

        // 2. Detect Incidents for comparative failure analysis
        const pIncRes = await workerClient.request({
          type: 'detectIncidents',
          requestId: `incidents-primary:${selectedFilePath}:${now}`,
          sourceId: selectedFilePath,
          customRules: activeCustomRules,
        });

        const sIncRes = await workerClient.request({
          type: 'detectIncidents',
          requestId: `incidents-split:${splitFilePath}:${now}`,
          sourceId: splitFilePath,
          customRules: activeCustomRules,
        });

        if (pIncRes.type === 'detectIncidents:done') {
          setPrimaryIncidents(pIncRes.incidents);
        }
        if (sIncRes.type === 'detectIncidents:done') {
          setSplitIncidents(sIncRes.incidents);
        }
      } catch (err) {
        console.error('Failed to load synchronized comparison state diff:', err);
      } finally {
        setDiffLoading(false);
      }
    };

    void loadComparisonData();
  }, [isSplitActive, selectedFilePath, splitFilePath, activeCustomRules]);

  // Automatically select target tab based on split status
  useEffect(() => {
    if (isSplitActive && splitFilePath) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveTab('diff');
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveTab('correlation');
    }
  }, [isSplitActive, splitFilePath]);

  // Load patterns and scan whenever selected file changes
  useEffect(() => {
    if (!selectedFilePath) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPatterns([]);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveSequence(null);
      return;
    }

    const scanPatterns = async (): Promise<void> => {
      try {
        const workerClient = getEngineWorkerClient();
        const res = await workerClient.request({
          type: 'detectPatterns',
          requestId: `detect-patterns:${selectedFilePath}:${Date.now()}`,
          sourceId: selectedFilePath,
        });

        if (res.type === 'detectPatterns:done') {
          setPatterns(res.patterns);
        }
      } catch (err) {
        console.error('Failed to detect patterns:', err);
      }
    };

    void scanPatterns();
    const interval = setInterval(scanPatterns, 5000); // Poll/update periodically for live logs
    return () => clearInterval(interval);
  }, [selectedFilePath]);

  const handleQuerySequence = async (
    field: 'correlationId' | 'paymentId' | 'sessionId' | 'hardwareId',
    value: string,
  ): Promise<void> => {
    if (!selectedFilePath || !value.trim()) return;

    setLoading(true);
    try {
      const workerClient = getEngineWorkerClient();
      const res = await workerClient.request({
        type: 'getCorrelationSequence',
        requestId: `seq:${selectedFilePath}:${field}:${value}:${Date.now()}`,
        sourceId: selectedFilePath,
        field,
        value: value.trim(),
      });

      if (res.type === 'getCorrelationSequence:done') {
        setActiveSequence(res.sequence);
      }
    } catch (err) {
      console.error('Failed to query sequence:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleExportEvidence = async (): Promise<void> => {
    if (!activeSequence) return;

    const header =
      `========================================================\n` +
      `OFFICIAL INVESTIGATION EVIDENCE PACK\n` +
      `Generated At: ${new Date().toISOString()}\n` +
      `Source File: ${selectedFilePath}\n` +
      `Correlation Key: ${activeSequence.field} = ${activeSequence.value}\n` +
      `Time Range: ${activeSequence.startTime ?? 'N/A'} -> ${activeSequence.endTime ?? 'N/A'}\n` +
      `Duration: ${activeSequence.durationMs ? (activeSequence.durationMs / 1000).toFixed(3) + 's' : 'unknown'}\n` +
      `Contains Errors: ${activeSequence.hasErrors ? 'YES' : 'NO'}\n` +
      `========================================================\n\n`;

    const body = activeSequence.entries
      .map(
        (entry) =>
          `[LINE ${entry.lineNumber}] [${entry.timestamp ?? 'NO_TIMESTAMP'}] [${entry.severity.toUpperCase()}] [${entry.source ?? 'MODULE'}] ${entry.raw}`,
      )
      .join('\n');

    const fullPack = header + body;

    try {
      await navigator.clipboard.writeText(fullPack);
      setExportStatus('Copied to Clipboard!');
      setTimeout(() => setExportStatus(null), 3000);
    } catch (err) {
      setExportStatus('Failed to copy');
      setTimeout(() => setExportStatus(null), 3000);
    }
  };

  if (!selectedFilePath) {
    return (
      <div className="flex h-full w-full items-center justify-center p-6 text-sm text-subtle bg-ink-950 font-mono">
        Select a log document to begin correlation timelines.
      </div>
    );
  }

  return (
    <div className="flex h-full w-full overflow-hidden bg-ink-950 text-readable font-mono divide-x divide-ink-800">
      {/* Left panel: Incident grouping & manual query tools */}
      <div className="flex w-96 flex-col p-4 space-y-4 overflow-y-auto shrink-0 bg-ink-900/40">
        <div className="text-xs font-bold text-subtle tracking-wider uppercase">
          Incident Correlation Core
        </div>

        {/* Custom Correlation Query form */}
        <div className="p-3 bg-ink-900 border border-ink-800 rounded-lg shadow-sm">
          <div className="text-xs font-bold text-accent mb-2">Query Correlation Key</div>
          <div className="space-y-2">
            <select
              value={searchField}
              onChange={(e) => setSearchField(e.target.value as 'correlationId' | 'paymentId' | 'sessionId' | 'hardwareId')}
              className="w-full bg-ink-950 border border-ink-800 rounded px-2 py-1 text-xs text-readable focus:outline-none focus:border-accent"
            >
              <option value="correlationId">Correlation ID</option>
              <option value="paymentId">Payment ID (Tx/Order)</option>
              <option value="sessionId">Session ID</option>
              <option value="hardwareId">Hardware ID (COM/USB)</option>
            </select>

            <div className="flex gap-2">
              <input
                type="text"
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                placeholder="e.g. tx_9a3c8f2b"
                className="flex-1 bg-ink-950 border border-ink-800 rounded px-2 py-1 text-xs text-readable placeholder-subtle focus:outline-none focus:border-accent"
                onKeyDown={(e) =>
                  e.key === 'Enter' && handleQuerySequence(searchField, searchValue)
                }
              />
              <button
                onClick={() => handleQuerySequence(searchField, searchValue)}
                disabled={loading}
                className="bg-accent hover:bg-accent-light text-ink-950 font-bold px-3 py-1 rounded text-xs transition"
              >
                {loading ? '...' : 'Go'}
              </button>
            </div>
          </div>
        </div>

        {/* Automated patterns list */}
        <div className="flex-1 space-y-3">
          <div className="text-xs font-bold text-subtle tracking-wider uppercase">
            Detected Failure Loops ({patterns.length})
          </div>

          {patterns.length === 0 ? (
            <div className="text-xs text-subtle italic p-2 bg-ink-900/20 rounded">
              Scanning for repeat retry loops, heartbeat crashes or hardware reset storms...
            </div>
          ) : (
            <div className="space-y-2">
              {patterns.map((p, idx) => (
                <div
                  key={`${p.type}-${idx}`}
                  onClick={() => {
                    if (p.indicators[0]) {
                      const fieldMap: Record<string, typeof searchField> = {
                        payment_retry: 'paymentId',
                        heartbeat_failure: 'correlationId',
                        kiosk_reset_chain: 'correlationId',
                        api_storm: 'correlationId',
                      };
                      setSearchField(fieldMap[p.type] || 'correlationId');
                      setSearchValue(p.indicators[0]);
                      void handleQuerySequence(
                        fieldMap[p.type] || 'correlationId',
                        p.indicators[0],
                      );
                    }
                  }}
                  className={`p-3 border rounded-lg cursor-pointer transition select-none hover:bg-ink-850 ${
                    p.severity === 'error'
                      ? 'border-danger/30 bg-danger-soft/20 hover:border-danger/50'
                      : 'border-warning/30 bg-warning-soft/20 hover:border-warning/50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        p.severity === 'error'
                          ? 'bg-danger text-readable'
                          : 'bg-warning text-ink-950'
                      }`}
                    >
                      {p.type.replace('_', ' ').toUpperCase()}
                    </span>
                    <span className="text-[10px] text-subtle font-bold">
                      {p.affectedEntryCount} events
                    </span>
                  </div>
                  <div className="text-xs text-readable leading-relaxed">{p.description}</div>
                  {p.indicators[0] && (
                    <div className="mt-2 text-[10px] text-accent/80 underline font-mono truncate">
                      Track: {p.indicators[0]}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right panel: Timeline sequence viewer */}
      <div className="flex flex-1 flex-col overflow-hidden bg-ink-950">
        {/* Header Tabs (rendered only when split is active) */}
        {isSplitActive && splitFilePath && (
          <div className="flex items-center justify-between px-4 py-2 bg-ink-900 border-b border-ink-800 shrink-0">
            <div className="flex space-x-1">
              <button
                onClick={() => setActiveTab('correlation')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono transition duration-150 ${
                  activeTab === 'correlation'
                    ? 'bg-accent text-ink-950 shadow-sm'
                    : 'text-subtle hover:text-readable hover:bg-ink-850'
                }`}
              >
                🔍 Correlation Flow
              </button>
              <button
                onClick={() => setActiveTab('diff')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono transition duration-150 flex items-center gap-1.5 ${
                  activeTab === 'diff'
                    ? 'bg-accent text-ink-950 shadow-sm'
                    : 'text-subtle hover:text-readable hover:bg-ink-850'
                }`}
              >
                🔄 State Machine Diff
                <span className="bg-danger/25 text-danger border border-danger/45 px-1 rounded text-[8px] font-black uppercase tracking-wider">
                  Enterprise
                </span>
              </button>
            </div>
            <div className="text-[10px] text-accent/80 font-bold select-none uppercase tracking-wide">
              Dual-Document Sync Active
            </div>
          </div>
        )}

        {/* Tab contents conditional routing */}
        {activeTab === 'diff' ? (
          diffLoading ? (
            <div className="flex flex-col items-center justify-center flex-1 space-y-4 bg-ink-950 p-6">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
              <div className="text-xs text-subtle font-mono animate-pulse">
                Comparing machine states & failure propagation timelines...
              </div>
            </div>
          ) : (
            <div className="flex flex-col h-full overflow-hidden bg-ink-950 select-none">
              {/* Diff Header Panel */}
              <div className="p-4 border-b border-ink-800 bg-ink-900/30 flex flex-col space-y-3 shrink-0">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-readable tracking-wide uppercase">
                    Synchronized State Machine Comparison
                  </div>
                  <div className="text-[10px] text-subtle">
                    Comparing Relative Latencies from initial BOOT
                  </div>
                </div>

                {/* Dashboard Metrics Grid */}
                <div className="grid grid-cols-3 gap-3">
                  {/* Primary Doc details */}
                  <div className="p-3 bg-ink-900/60 border border-ink-800 rounded-lg flex flex-col space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-subtle font-bold truncate max-w-[150px]">
                        {getBasename(selectedFilePath)}
                      </span>
                      <span className="text-[9px] bg-accent/15 border border-accent/30 text-accent font-black px-1.5 py-0.5 rounded tracking-wide">
                        REFERENCE (A)
                      </span>
                    </div>
                    <div className="text-xs font-bold text-readable mt-1">
                      Boot Delay:{' '}
                      <span className="text-accent font-black">
                        {formatDelay(getBootDelayMs(primaryStateSeq))}
                      </span>
                    </div>
                    <div className="text-[10px] text-subtle">
                      Errors:{' '}
                      <span className="text-readable font-bold">
                        {viewportSeverityStatsByPath[selectedFilePath || '']?.error || 0}
                      </span>{' '}
                      | Incidents:{' '}
                      <span className="text-readable font-bold">{primaryIncidents.length}</span>
                    </div>
                  </div>

                  {/* Comparison Summary Card */}
                  <div className="p-3 bg-ink-900/40 border border-ink-800/80 rounded-lg flex flex-col items-center justify-center text-center space-y-1">
                    <div className="text-[9px] text-subtle font-bold uppercase tracking-wider">
                      Divergence Analytics
                    </div>
                    {(() => {
                      const pDelay = getBootDelayMs(primaryStateSeq);
                      const sDelay = getBootDelayMs(splitStateSeq);
                      const pErrors = viewportSeverityStatsByPath[selectedFilePath || '']?.error || 0;
                      const sErrors = viewportSeverityStatsByPath[splitFilePath || '']?.error || 0;

                      const delayDelta = pDelay !== null && sDelay !== null ? sDelay - pDelay : null;
                      const errorDelta = sErrors - pErrors;

                      return (
                        <>
                          <div className="text-[10px] font-black">
                            {delayDelta !== null ? (
                              delayDelta > 0 ? (
                                <span className="text-danger">
                                  +{formatDelay(delayDelta)} Boot Delay
                                </span>
                              ) : (
                                <span className="text-success">
                                  -{formatDelay(Math.abs(delayDelta))} Boot Delay
                                </span>
                              )
                            ) : (
                              <span className="text-subtle">No aligned boot sequence</span>
                            )}
                          </div>
                          <div className="text-[9px] font-bold">
                            {errorDelta > 0 ? (
                              <span className="text-danger">+{errorDelta} Unique Outage Errors</span>
                            ) : errorDelta < 0 ? (
                              <span className="text-success">{errorDelta} Errors</span>
                            ) : (
                              <span className="text-subtle">Zero net error delta</span>
                            )}
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  {/* Split Doc details */}
                  <div className="p-3 bg-ink-900/60 border border-ink-800 rounded-lg flex flex-col space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-subtle font-bold truncate max-w-[150px]">
                        {getBasename(splitFilePath)}
                      </span>
                      <span className="text-[9px] bg-danger/15 border border-danger/30 text-danger font-black px-1.5 py-0.5 rounded tracking-wide animate-pulse">
                        OUTAGE RUN (B)
                      </span>
                    </div>
                    <div className="text-xs font-bold text-readable mt-1">
                      Boot Delay:{' '}
                      <span className="text-danger font-black">
                        {formatDelay(getBootDelayMs(splitStateSeq))}
                      </span>
                    </div>
                    <div className="text-[10px] text-subtle">
                      Errors:{' '}
                      <span className="text-readable font-bold">
                        {viewportSeverityStatsByPath[splitFilePath || '']?.error || 0}
                      </span>{' '}
                      | Incidents:{' '}
                      <span className="text-readable font-bold">{splitIncidents.length}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Grid of Aligned Transitions */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                <div className="text-xs font-bold text-subtle tracking-wider uppercase mb-2">
                  Chronological State Alignment
                </div>
                {(() => {
                  const aligned = alignTransitions(primaryStateSeq, splitStateSeq);
                  if (aligned.length === 0) {
                    return (
                      <div className="text-xs text-subtle italic p-4 text-center">
                        No kiosk state transitions detected in either document log buffer.
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-2">
                      {aligned.map((item, idx) => {
                        const hasDiverged = !item.primary || !item.split;

                        return (
                          <div
                            key={`${item.state}-${idx}`}
                            className={`p-3 border rounded-lg bg-ink-900/30 flex items-center gap-4 transition hover:bg-ink-900/60 ${
                              item.state === 'FAILURE'
                                ? 'border-danger/30 bg-danger-soft/10'
                                : hasDiverged
                                ? 'border-warning/30 bg-warning-soft/10'
                                : 'border-ink-800'
                            }`}
                          >
                            {/* Primary Document Side */}
                            <div className="flex-1 min-w-0">
                              {item.primary ? (
                                <div
                                  onClick={() => handleLineClick(item.primary!.lineNumber, selectedFilePath!)}
                                  className="cursor-pointer hover:bg-ink-850 p-2 rounded border border-ink-800/60 text-left space-y-1 transition group"
                                >
                                  <div className="flex items-center justify-between text-[9px] text-subtle font-mono font-bold">
                                    <span className="text-accent underline group-hover:text-accent-light">
                                      Line {item.primary.lineNumber}
                                    </span>
                                    <span>
                                      Elapsed:{' '}
                                      <span className="text-readable">
                                        {formatDelay(item.pElapsedMs)}
                                      </span>
                                    </span>
                                  </div>
                                  <div className="text-xs text-readable truncate font-mono">
                                    {item.primary.triggerMessage}
                                  </div>
                                </div>
                              ) : (
                                <div className="text-[10px] text-subtle italic text-center p-2 bg-ink-900/10 border border-dashed border-ink-800/40 rounded">
                                  State Not Reached
                                </div>
                              )}
                            </div>

                            {/* Middle State Flag */}
                            <div className="w-40 shrink-0 flex flex-col items-center justify-center text-center">
                              <span
                                className={`text-[10px] font-black px-2 py-0.5 rounded border uppercase tracking-wider ${
                                  item.state === 'FAILURE'
                                    ? 'bg-danger/20 border-danger/55 text-danger'
                                    : item.state === 'RECOVERY'
                                    ? 'bg-success/20 border-success/55 text-success'
                                    : hasDiverged
                                    ? 'bg-warning/20 border-warning/55 text-warning'
                                    : 'bg-info/20 border-info/55 text-info'
                                }`}
                              >
                                {item.state}
                              </span>
                              {item.deltaMs !== null && item.deltaMs !== 0 && (
                                <span
                                  className={`text-[9px] font-bold mt-1 px-1 rounded ${
                                    item.deltaMs > 0
                                      ? 'bg-danger/10 text-danger'
                                      : 'bg-success/10 text-success'
                                  }`}
                                >
                                  {item.deltaMs > 0 ? '+' : ''}
                                  {(item.deltaMs / 1000).toFixed(3)}s
                                </span>
                              )}
                            </div>

                            {/* Split Document Side */}
                            <div className="flex-1 min-w-0">
                              {item.split ? (
                                <div
                                  onClick={() => handleLineClick(item.split!.lineNumber, splitFilePath!)}
                                  className="cursor-pointer hover:bg-ink-850 p-2 rounded border border-ink-800/60 text-left space-y-1 transition group"
                                >
                                  <div className="flex items-center justify-between text-[9px] text-subtle font-mono font-bold">
                                    <span className="text-accent underline group-hover:text-accent-light">
                                      Line {item.split.lineNumber}
                                    </span>
                                    <span>
                                      Elapsed:{' '}
                                      <span className="text-readable">
                                        {formatDelay(item.sElapsedMs)}
                                      </span>
                                    </span>
                                  </div>
                                  <div className="text-xs text-readable truncate font-mono">
                                    {item.split.triggerMessage}
                                  </div>
                                </div>
                              ) : (
                                <div className="text-[10px] text-subtle italic text-center p-2 bg-ink-900/10 border border-dashed border-ink-800/40 rounded">
                                  State Not Reached
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {/* Aligned / Comparative Diagnostics - Divergent Incidents */}
              <div className="p-4 border-t border-ink-800 bg-ink-900/20 shrink-0">
                <div className="text-xs font-bold text-accent tracking-wider uppercase mb-3">
                  Comparative Diagnostics: Divergent Incidents
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {/* Left unique */}
                  <div className="space-y-2">
                    <div className="text-[10px] text-subtle font-bold uppercase">
                      Unique to Reference (A)
                    </div>
                    {(() => {
                      const unique = primaryIncidents.filter(
                        (pi) =>
                          !splitIncidents.some(
                            (si) => si.category === pi.category && si.title === pi.title,
                          ),
                      );

                      if (unique.length === 0) {
                        return (
                          <div className="text-[10px] text-subtle italic p-2 bg-ink-900/10 rounded">
                            No unique reference incidents.
                          </div>
                        );
                      }

                      return (
                        <div className="space-y-1.5 max-h-32 overflow-y-auto">
                          {unique.map((inc) => (
                            <div
                              key={inc.id}
                              className="p-2 border border-ink-800 bg-ink-900/50 rounded flex flex-col space-y-1"
                            >
                              <div className="flex items-center justify-between text-[9px]">
                                <span className="font-bold text-accent">{inc.category}</span>
                                <span className="text-subtle font-mono">{inc.timestampStart}</span>
                              </div>
                              <div className="text-[11px] font-bold text-readable">
                                {inc.title}
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Right unique */}
                  <div className="space-y-2">
                    <div className="text-[10px] text-subtle font-bold uppercase flex items-center justify-between">
                      <span>Unique to Outage (B)</span>
                      <span className="text-[8px] bg-danger/25 border border-danger/45 text-danger px-1 rounded font-black animate-pulse">
                        OUTAGE SIGNAL
                      </span>
                    </div>
                    {(() => {
                      const unique = splitIncidents.filter(
                        (si) =>
                          !primaryIncidents.some(
                            (pi) => pi.category === si.category && pi.title === si.title,
                          ),
                      );

                      if (unique.length === 0) {
                        return (
                          <div className="text-[10px] text-subtle italic p-2 bg-ink-900/10 rounded">
                            No unique outage incidents detected.
                          </div>
                        );
                      }

                      return (
                        <div className="space-y-1.5 max-h-32 overflow-y-auto">
                          {unique.map((inc) => (
                            <div
                              key={inc.id}
                              className="p-2 border border-danger/20 bg-danger-soft/10 rounded flex flex-col space-y-1"
                            >
                              <div className="flex items-center justify-between text-[9px]">
                                <span className="font-bold text-danger">{inc.category}</span>
                                <span className="text-subtle font-mono">{inc.timestampStart}</span>
                              </div>
                              <div className="text-[11px] font-bold text-readable">
                                {inc.title}
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>
          )
        ) : activeSequence ? (
          <div className="flex flex-col h-full overflow-hidden">
            {/* Header metadata summary */}
            <div className="flex items-center justify-between p-4 border-b border-ink-800 bg-ink-900/30">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-subtle font-bold uppercase">
                    Timeline Sequence Flow:
                  </span>
                  <span className="text-xs text-accent font-bold">
                    {activeSequence.field} = {activeSequence.value}
                  </span>
                </div>
                <div className="text-[10px] text-subtle">
                  Span:{' '}
                  <span className="text-readable">{activeSequence.startTime ?? 'unknown'}</span> to{' '}
                  <span className="text-readable">{activeSequence.endTime ?? 'unknown'}</span>
                  {activeSequence.durationMs !== null && (
                    <>
                      {' '}
                      | Duration:{' '}
                      <span className="text-accent font-bold">
                        {(activeSequence.durationMs / 1000).toFixed(3)}s
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportEvidence}
                  className="bg-ink-800 hover:bg-ink-700 text-readable border border-ink-700 font-bold px-3 py-1.5 rounded text-xs transition flex items-center gap-1.5"
                >
                  <span>📦</span>
                  <span>{exportStatus || 'Extract Evidence Pack'}</span>
                </button>
              </div>
            </div>

            {/* Event Chronology nodes */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="relative pl-6 border-l-2 border-ink-800 ml-3 space-y-6">
                {activeSequence.entries.map((entry) => {
                  let sevColor = 'border-ink-800 bg-ink-900 text-subtle';
                  let dotColor = 'bg-ink-700';

                  if (entry.severity === 'error') {
                    sevColor = 'border-danger/40 bg-danger-soft/40 text-danger';
                    dotColor = 'bg-danger';
                  } else if (entry.severity === 'warn') {
                    sevColor = 'border-warning/40 bg-warning-soft/40 text-warning';
                    dotColor = 'bg-warning';
                  } else if (entry.severity === 'info') {
                    sevColor = 'border-info/40 bg-info-soft/40 text-info';
                    dotColor = 'bg-info';
                  }

                  const activeBookmark = bookmarks.find(
                    (b) =>
                      b.entryId === entry.id ||
                      (b.lineNumber === entry.lineNumber && b.sourceId === selectedFilePath),
                  );
                  const isBookmarked = !!activeBookmark;

                  return (
                    <div key={entry.id} className="relative group">
                      {/* Chronology Dot Connector with High-visibility Overlays/Pulses */}
                      <span
                        className={`absolute -left-[31px] top-1.5 w-4 h-4 rounded-full border border-ink-950 flex items-center justify-center transition-all ${
                          isBookmarked
                            ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]'
                            : dotColor
                        }`}
                      >
                        {isBookmarked ? (
                          <span className="text-[8px] text-ink-950 font-black">★</span>
                        ) : (
                          <span className="w-1.5 h-1.5 bg-ink-950 rounded-full" />
                        )}
                        {(entry.severity === 'error' || isBookmarked) && (
                          <span
                            className={`absolute -inset-0.5 rounded-full animate-ping opacity-45 ${
                              isBookmarked ? 'bg-amber-400' : 'bg-danger'
                            }`}
                          />
                        )}
                      </span>

                      <div
                        onClick={() => handleLineClick(entry.lineNumber, selectedFilePath!)}
                        className={`p-3 border rounded-lg cursor-pointer transition duration-150 hover:bg-ink-900 ${
                          isBookmarked
                            ? 'border-amber-400/40 bg-amber-400/[0.04] text-amber-300'
                            : sevColor
                        }`}
                      >
                        <div className="flex items-center justify-between text-[10px] text-subtle font-bold mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-readable bg-ink-800 px-1 rounded">
                              Line {entry.lineNumber}
                            </span>
                            <span>•</span>
                            <span>{entry.timestamp}</span>

                            {/* Dense Professional Telemetry Markers */}
                            {entry.severity === 'error' && (
                              <span className="bg-danger/25 text-danger border border-danger/45 px-1 rounded text-[8px] font-black uppercase tracking-wider">
                                🛑 CRITICAL ERROR
                              </span>
                            )}
                            {entry.severity === 'warn' && (
                              <span className="bg-warning/25 text-warning border border-warning/45 px-1 rounded text-[8px] font-black uppercase tracking-wider">
                                ⚠️ WARNING
                              </span>
                            )}
                            {isBookmarked && (
                              <span className="bg-amber-400/25 text-amber-400 border border-amber-400/45 px-1 rounded text-[8px] font-black uppercase tracking-wider">
                                ★ BOOKMARKED EVIDENCE
                              </span>
                            )}
                          </div>
                          {entry.source && (
                            <span className="bg-ink-800/80 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wide">
                              {entry.source}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-readable whitespace-pre-wrap font-mono leading-relaxed selection:bg-warning selection:text-ink-950">
                          {entry.message}
                        </div>

                        {/* Visual bookmark custom annotation notes */}
                        {activeBookmark?.note && (
                          <div className="mt-2 p-2 bg-amber-400/10 border border-amber-400/30 rounded text-[9px] text-amber-300 italic font-sans flex items-start gap-1.5">
                            <span className="text-amber-400 shrink-0 font-bold">
                              ★ Analysis Note:
                            </span>
                            <span className="leading-normal">{activeBookmark.note}</span>
                          </div>
                        )}

                        {/* Preserved raw coordinates tooltip */}
                        <div className="mt-2 pt-1.5 border-t border-ink-800/20 flex items-center justify-between text-[9px] text-subtle opacity-70 group-hover:opacity-100 transition">
                          <span>
                            Raw range: byte {entry.byteStart} - {entry.byteEnd}
                          </span>
                          {entry.paymentIds.length > 0 && (
                            <span className="text-accent font-bold">
                              Tx: {entry.paymentIds.join(', ')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center space-y-4">
            <div className="text-3xl">🕵️‍♂️</div>
            <div className="space-y-1">
              <div className="text-sm font-bold text-readable">
                No Active Chronology timeline selected
              </div>
              <div className="text-xs text-subtle max-w-sm">
                Select one of the detected incident failure loops on the left panel or search for
                custom transaction, hardware or session identifiers.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
