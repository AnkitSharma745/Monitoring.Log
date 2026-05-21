import React, { useMemo } from 'react';
import { useDiagnosticsStore } from '@renderer/stores/diagnosticsStore';
import { Trash2, ShieldAlert, Cpu, HardDrive, PlayCircle } from 'lucide-react';
import { Button } from '@renderer/components/ui/Button';

export const DiagnosticsPanel = (): React.JSX.Element => {
  const events = useDiagnosticsStore((state) => state.events);
  const clearEvents = useDiagnosticsStore((state) => state.clearEvents);

  const stats = useMemo(() => {
    const perfEvents = events.filter((e) => e.category === 'performance');
    const avgDuration = perfEvents.length
      ? Math.round(perfEvents.reduce((sum, e) => sum + (e.durationMs ?? 0), 0) / perfEvents.length)
      : 0;

    return {
      total: events.length,
      warnings: events.filter((e) => e.severity === 'warning').length,
      errors: events.filter((e) => e.severity === 'error').length,
      avgDuration,
    };
  }, [events]);

  return (
    <div className="flex h-full w-full flex-col bg-panel text-readable text-xs">
      {/* Telemetry Header */}
      <header className="flex h-9 items-center justify-between border-b border-line bg-ink-900 px-4">
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-2 text-subtle font-mono text-[11px]">
            <PlayCircle size={12} className="text-accent animate-pulse" />
            <span>Active Diagnostics Session</span>
          </div>
          <div className="h-4 w-[1px] bg-line" />
          <div className="flex space-x-4 font-mono text-[11px] text-muted">
            <span>
              Total Events: <strong className="text-readable">{stats.total}</strong>
            </span>
            <span>
              Avg Latency: <strong className="text-accent">{stats.avgDuration}ms</strong>
            </span>
            {stats.warnings > 0 && (
              <span className="text-amber-500">
                Warnings: <strong>{stats.warnings}</strong>
              </span>
            )}
            {stats.errors > 0 && (
              <span className="text-red-500">
                Errors: <strong>{stats.errors}</strong>
              </span>
            )}
          </div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 text-muted hover:text-red-400 font-mono text-[11px]"
          onClick={clearEvents}
        >
          <Trash2 size={12} className="mr-1.5" />
          Clear Log
        </Button>
      </header>

      {/* Main Console Layout */}
      <div className="flex-1 overflow-y-auto font-mono p-3 space-y-1.5 max-h-[calc(100%-2.25rem)] no-scrollbar">
        {events.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center text-muted">
            <Cpu size={24} className="mb-2 text-ink-700" />
            <span>No telemetry events recorded yet. Perform some actions in the workspace.</span>
          </div>
        ) : (
          events.map((event) => {
            const severityColor =
              event.severity === 'error'
                ? 'text-red-400'
                : event.severity === 'warning'
                  ? 'text-amber-400'
                  : 'text-subtle';

            const CategoryIcon =
              event.category === 'file-system'
                ? HardDrive
                : event.category === 'performance'
                  ? Cpu
                  : ShieldAlert;

            return (
              <div
                key={event.id}
                className="flex items-start space-x-3 py-1 px-2 rounded hover:bg-ink-900 border border-transparent hover:border-line transition-all duration-150"
              >
                {/* Timestamp */}
                <span className="text-muted shrink-0 text-[10px] pt-0.5">
                  {new Date(event.timestamp).toLocaleTimeString()}
                </span>

                {/* Category & Badge */}
                <div className="flex items-center space-x-1.5 text-[10px] px-1.5 py-0.5 bg-ink-950 border border-line rounded text-subtle font-mono shrink-0">
                  <CategoryIcon size={10} className="text-muted" />
                  <span className="uppercase">{event.category}</span>
                </div>

                {/* Message */}
                <div className="flex-1 min-w-0">
                  <span className="text-readable break-all">{event.message}</span>
                  {event.durationMs !== undefined && (
                    <span className="ml-2 px-1 py-0.2 bg-accent/10 border border-accent/20 text-accent rounded text-[10px] font-semibold">
                      {Math.round(event.durationMs)}ms
                    </span>
                  )}
                </div>

                {/* Severity Indicator */}
                <span className={`text-[10px] shrink-0 font-bold ${severityColor}`}>
                  [{event.severity.toUpperCase()}]
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
