import { useEffect, useMemo, useRef, type JSX } from 'react';

import { Badge } from '@renderer/components/ui/Badge';
import { formatBytes, formatDateTime } from '@renderer/features/files/fileFormatting';
import { useFileMonitorStore } from '@renderer/stores/fileMonitorStore';
import {
  buildParsedLogLines,
  filterLogLines,
  getLogSeverityStats,
  getVisibleLogText,
} from '../logParsing';
import { LogLine } from './LogLine';
import { LogToolbar } from './LogToolbar';

export const LogViewer = (): JSX.Element => {
  const selectedFilePath = useFileMonitorStore((state) => state.selectedFilePath);
  const filesByPath = useFileMonitorStore((state) => state.filesByPath);
  const documentsByPath = useFileMonitorStore((state) => state.documentsByPath);
  const watchingFiles = useFileMonitorStore((state) => state.watchingFiles);
  const searchQuery = useFileMonitorStore((state) => state.searchQuery);
  const preferences = useFileMonitorStore((state) => state.preferences);
  const isBusy = useFileMonitorStore((state) => state.pendingOperations > 0);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const selectedFile = selectedFilePath ? filesByPath[selectedFilePath] : null;
  const document = selectedFilePath ? documentsByPath[selectedFilePath] : null;
  const isWatching = selectedFilePath ? Boolean(watchingFiles[selectedFilePath]) : false;
  const parsedLines = useMemo(
    () => buildParsedLogLines(document?.content ?? '', searchQuery),
    [document?.content, searchQuery],
  );
  const displayLines = useMemo(
    () =>
      filterLogLines(
        parsedLines,
        searchQuery,
        preferences.filterToMatches,
        preferences.severityFilters,
      ),
    [parsedLines, preferences.filterToMatches, preferences.severityFilters, searchQuery],
  );
  const stats = useMemo(
    () => getLogSeverityStats(parsedLines, displayLines),
    [displayLines, parsedLines],
  );
  const visibleText = useMemo(() => getVisibleLogText(displayLines), [displayLines]);

  useEffect(() => {
    if (!preferences.autoScroll || !contentRef.current) {
      return;
    }

    contentRef.current.scrollTo({
      top: contentRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [displayLines.length, document?.content, preferences.autoScroll]);

  if (!selectedFile) {
    return (
      <section className="flex min-h-0 flex-1 items-center justify-center bg-ink-950">
        <div className="max-w-sm text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-ink-900 text-xl text-accent">
            ML
          </div>
          <h1 className="text-lg font-semibold text-readable">No log file selected</h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            Select or drop a .log or .txt source to start viewing content.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-ink-950">
      <header className="flex min-h-[86px] items-center justify-between gap-4 border-b border-line bg-panel px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-lg font-semibold text-readable">{selectedFile.name}</h1>
            {isWatching && <Badge tone="success">Live</Badge>}
            {document?.truncatedHead && <Badge tone="warning">Tail</Badge>}
            {document?.trimmedInRenderer && <Badge tone="warning">Trimmed</Badge>}
          </div>
          <div className="mt-1 truncate text-xs text-muted" title={selectedFile.path}>
            {selectedFile.path}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 text-xs text-muted">
          <Badge>{formatBytes(selectedFile.sizeBytes)}</Badge>
          <Badge>Modified {formatDateTime(selectedFile.modifiedAt)}</Badge>
        </div>
      </header>

      <div className="grid grid-cols-5 gap-2 border-b border-line bg-panel-soft px-4 py-3">
        <StatCard label="Visible" value={stats.visible} tone="neutral" />
        <StatCard label="Errors" value={stats.error} tone="danger" />
        <StatCard label="Warnings" value={stats.warn} tone="warning" />
        <StatCard label="Info" value={stats.info} tone="info" />
        <StatCard label="Matches" value={stats.matched} tone="success" />
      </div>

      <LogToolbar
        visibleText={visibleText}
        isBusy={isBusy}
        activeFilePath={selectedFile.path}
        stats={stats}
      />

      <div ref={contentRef} className="min-h-0 flex-1 overflow-auto bg-ink-950 py-2">
        {displayLines.length > 0 ? (
          displayLines.map((line) => (
            <LogLine
              key={`${selectedFile.path}-${line.lineNumber}-${line.text}`}
              line={line}
              searchQuery={searchQuery}
              showLineNumbers={preferences.showLineNumbers}
              lineWrap={preferences.lineWrap}
            />
          ))
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted">
            {document?.content ? 'No lines match the current filter.' : 'No content loaded.'}
          </div>
        )}
      </div>
    </section>
  );
};

interface StatCardProps {
  label: string;
  value: number;
  tone: 'neutral' | 'danger' | 'warning' | 'info' | 'success';
}

const statToneClasses: Record<StatCardProps['tone'], string> = {
  neutral: 'text-readable',
  danger: 'text-danger',
  warning: 'text-warning',
  info: 'text-info',
  success: 'text-success',
};

const StatCard = ({ label, value, tone }: StatCardProps): JSX.Element => {
  return (
    <div className="rounded-lg border border-line bg-ink-900 px-3 py-2">
      <div className={`text-lg font-semibold ${statToneClasses[tone]}`}>{value}</div>
      <div className="text-[11px] uppercase text-subtle">{label}</div>
    </div>
  );
};
