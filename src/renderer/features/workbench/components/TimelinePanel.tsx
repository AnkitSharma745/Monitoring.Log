import { useEffect, useState, type JSX } from 'react';
import { useViewerStore } from '@renderer/stores/viewerStore';
import { getEngineWorkerClient } from '@renderer/services/workerClient';
import type { StructuredLogEntry } from '@shared/contracts/logs';

interface DetectedPattern {
  type: 'payment_retry' | 'heartbeat_failure' | 'kiosk_reset_chain' | 'api_storm';
  description: string;
  indicators: string[];
  affectedEntryCount: number;
  severity: 'error' | 'warn';
}

interface CorrelationSequence {
  id: string;
  field: 'correlationId' | 'paymentId' | 'sessionId' | 'hardwareId';
  value: string;
  entries: StructuredLogEntry[];
  startTime: string | null;
  endTime: string | null;
  durationMs: number | null;
  hasErrors: boolean;
}

export const TimelinePanel = (): JSX.Element => {
  const selectedFilePath = useViewerStore((state) => state.selectedFilePath);
  const [patterns, setPatterns] = useState<DetectedPattern[]>([]);
  const [searchField, setSearchField] = useState<
    'correlationId' | 'paymentId' | 'sessionId' | 'hardwareId'
  >('correlationId');
  const [searchValue, setSearchValue] = useState('');
  const [activeSequence, setActiveSequence] = useState<CorrelationSequence | null>(null);
  const [loading, setLoading] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  // Load patterns and scan whenever selected file changes
  useEffect(() => {
    if (!selectedFilePath) {
      setPatterns([]);
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
              onChange={(e) => setSearchField(e.target.value as any)}
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
        {activeSequence ? (
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

                  return (
                    <div key={entry.id} className="relative group">
                      {/* Chronology Dot Connector */}
                      <span
                        className={`absolute -left-[31px] top-1.5 w-4 h-4 rounded-full border border-ink-950 flex items-center justify-center ${dotColor}`}
                      >
                        <span className="w-1.5 h-1.5 bg-ink-950 rounded-full" />
                      </span>

                      <div
                        className={`p-3 border rounded-lg transition duration-150 hover:bg-ink-900 ${sevColor}`}
                      >
                        <div className="flex items-center justify-between text-[10px] text-subtle font-bold mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-readable bg-ink-800 px-1 rounded">
                              Line {entry.lineNumber}
                            </span>
                            <span>•</span>
                            <span>{entry.timestamp}</span>
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

                        {/* Preserved raw coordinates tooltip */}
                        <div className="mt-2 pt-1.5 border-t border-ink-800/20 flex items-center justify-between text-[9px] text-subtle opacity-70 group-hover:opacity-100 transition">
                          <span>
                            Raw range: byte {entry.byteStart} - {entry.byteEnd}
                          </span>
                          {entry.paymentIds.length > 0 && (
                            <span className="text-accent">Tx: {entry.paymentIds.join(', ')}</span>
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
