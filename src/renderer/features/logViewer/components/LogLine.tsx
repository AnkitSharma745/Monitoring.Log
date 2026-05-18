import { getHighlightedParts, type LogSeverity, type ParsedLogLine } from '../logParsing';

import type { JSX } from 'react';

interface LogLineProps {
  line: ParsedLogLine;
  searchQuery: string;
  showLineNumbers: boolean;
  lineWrap: boolean;
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
  line,
  searchQuery,
  showLineNumbers,
  lineWrap,
}: LogLineProps): JSX.Element => {
  const parts = getHighlightedParts(line.text, searchQuery);

  return (
    <div
      className={[
        'grid min-h-6 border-l-2 border-transparent px-3 py-0.5 text-[12px] leading-6 hover:bg-ink-850/70',
        showLineNumbers ? 'grid-cols-[64px_62px_minmax(0,1fr)]' : 'grid-cols-[62px_minmax(0,1fr)]',
        line.severity === 'error' ? 'border-l-danger/80' : '',
        line.severity === 'warn' ? 'border-l-warning/80' : '',
        line.severity === 'info' ? 'border-l-info/50' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {showLineNumbers && (
        <span className="select-none pr-4 text-right font-mono text-subtle">{line.lineNumber}</span>
      )}

      <span
        className={[
          'mt-0.5 inline-flex h-5 w-11 select-none items-center justify-center rounded border font-mono text-[10px] font-bold',
          severityClasses[line.severity],
        ].join(' ')}
      >
        {severityLabels[line.severity]}
      </span>

      <span
        className={[
          'min-w-0 font-mono text-readable',
          lineWrap ? 'whitespace-pre-wrap break-words' : 'overflow-x-visible whitespace-pre',
        ].join(' ')}
      >
        {parts.map((part, index) => (
          <span
            key={`${line.lineNumber}-${index}-${part.text}`}
            className={part.isMatch ? 'rounded bg-warning px-0.5 text-ink-950' : undefined}
          >
            {part.text}
          </span>
        ))}
      </span>
    </div>
  );
};
