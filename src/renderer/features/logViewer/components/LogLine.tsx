import { getHighlightedParts, type LogEntry, type LogSeverity } from '../logParsing';

import type { ReactNode } from 'react';
import type { JSX } from 'react';

interface LogLineProps {
  entry: LogEntry;
  searchQuery: string;
  showLineNumbers: boolean;
  lineWrap: boolean;
  isActiveMatch: boolean;
  compactMode?: boolean;
  isDuplicateTimestamp?: boolean;
  suffix?: ReactNode;
}

const severityClasses: Record<LogSeverity, string> = {
  error: 'border-danger/50 bg-danger-soft text-danger',
  warn: 'border-warning/50 bg-warning-soft text-warning',
  info: 'border-info/50 bg-info-soft text-info',
  debug: 'border-line bg-ink-800 text-subtle',
  neutral: 'border-transparent bg-transparent text-subtle',
};

const severityLabels: Record<LogSeverity, string> = {
  error: 'ERR',
  warn: 'WARN',
  info: 'INFO',
  debug: 'DBG',
  neutral: '',
};

export const LogLine = ({
  entry,
  searchQuery,
  showLineNumbers,
  lineWrap,
  isActiveMatch,
  compactMode = false,
  isDuplicateTimestamp = false,
  suffix,
}: LogLineProps): JSX.Element => {
  if (!entry) {
    return (
      <div
        className={[
          'grid min-h-6 border-l-2 border-transparent px-3 py-0.5 text-[12px] leading-6',
          compactMode ? 'min-h-5 py-0 text-[11px] leading-5' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      />
    );
  }

  const parts = getHighlightedParts(entry.raw ?? '', searchQuery);

  // Safe normalization of severity
  const severityStr = String(entry.severity || 'neutral').toLowerCase();
  const severity: LogSeverity = (
    ['error', 'warn', 'info', 'debug', 'neutral'].includes(severityStr) ? severityStr : 'neutral'
  ) as LogSeverity;

  const severityClass = severityClasses[severity] ?? severityClasses.neutral;
  const severityLabel = severityLabels[severity] ?? '';

  return (
    <div
      data-log-entry-id={entry.id}
      className={[
        'grid min-h-6 border-l-2 border-transparent px-3 py-0.5 text-[12px] leading-6 hover:bg-ink-850/70',
        compactMode ? 'min-h-5 py-0 text-[11px] leading-5' : '',
        showLineNumbers
          ? 'grid-cols-[48px_46px_110px_minmax(0,1fr)]'
          : 'grid-cols-[46px_110px_minmax(0,1fr)]',
        severity === 'error' ? 'border-l-danger/80' : '',
        severity === 'warn' ? 'border-l-warning/80' : '',
        severity === 'info' ? 'border-l-info/50' : '',
        isActiveMatch ? 'bg-warning-soft/80 ring-1 ring-warning/40' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {showLineNumbers && (
        <span className="select-none pr-4 text-right font-mono text-subtle">
          {entry.lineNumber ?? ''}
        </span>
      )}

      <span
        className={[
          'mt-0.5 inline-flex h-5 w-11 select-none items-center justify-center rounded border font-mono text-[10px] font-bold',
          severityClass,
        ].join(' ')}
      >
        {severityLabel}
      </span>

      <span
        className="truncate pr-3 font-mono text-[11px] text-subtle"
        title={entry.timestamp ?? entry.source ?? undefined}
      >
        {isDuplicateTimestamp ? '' : (entry.timestamp ?? entry.source ?? '')}
      </span>

      <span
        className={[
          'min-w-0 font-mono text-readable',
          lineWrap ? 'whitespace-pre-wrap break-words' : 'overflow-x-visible whitespace-pre',
        ].join(' ')}
      >
        {parts.map((part, index) => (
          <span
            key={`${entry.lineNumber ?? index}-${index}-${part.text}`}
            className={part.isMatch ? 'rounded bg-warning px-0.5 text-ink-950' : undefined}
          >
            {part.text}
          </span>
        ))}
        {suffix}
      </span>
    </div>
  );
};
