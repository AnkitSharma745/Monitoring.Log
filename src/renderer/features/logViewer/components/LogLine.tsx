import { Star } from 'lucide-react';
import { useInvestigationStore } from '@renderer/stores/investigationStore';
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
  sourceId?: string;
  isSelected?: boolean;
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
  sourceId,
  isSelected = false,
}: LogLineProps): JSX.Element => {
  const addBookmark = useInvestigationStore((state) => state.addBookmark);
  const removeBookmark = useInvestigationStore((state) => state.removeBookmark);

  const activeBookmarkId = useInvestigationStore((state) => {
    const activeId = state.activeInvestigationId;
    if (!activeId) return null;
    const bList = state.investigationsById[activeId]?.bookmarks;
    if (!bList) return null;
    const found = bList.find(
      (b) =>
        b.entryId === entry.id || (b.lineNumber === entry.lineNumber && b.sourceId === sourceId),
    );
    return found ? found.id : null;
  });
  const isBookmarked = activeBookmarkId !== null;

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

  const handleBookmarkToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isBookmarked && activeBookmarkId) {
      removeBookmark(activeBookmarkId);
    } else {
      addBookmark({
        entryId: entry.id || `line-${entry.lineNumber}-${Date.now()}`,
        lineNumber: entry.lineNumber || 1,
        timestamp: entry.timestamp || null,
        message: entry.message || entry.raw || '',
        sourceId: sourceId || '',
        note: '',
      });
    }
  };

  return (
    <div
      data-log-entry-id={entry.id}
      className={[
        'group grid min-h-6 border-l-2 border-transparent px-3 py-0.5 text-[12px] leading-6 hover:bg-ink-850/70 cursor-pointer select-none transition-colors duration-150',
        compactMode ? 'min-h-5 py-0 text-[11px] leading-5' : '',
        showLineNumbers
          ? 'grid-cols-[20px_48px_46px_110px_minmax(0,1fr)]'
          : 'grid-cols-[20px_46px_110px_minmax(0,1fr)]',
        severity === 'error' ? 'border-l-danger/80' : '',
        severity === 'warn' ? 'border-l-warning/80' : '',
        severity === 'info' ? 'border-l-info/50' : '',
        isActiveMatch ? 'bg-warning-soft/80 ring-1 ring-warning/40' : '',
        isSelected ? 'bg-accent/15 border-l-accent/90 ring-1 ring-accent/30' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* 1. Bookmark Margin Star Column */}
      <div className="flex items-center justify-center">
        <button
          onClick={handleBookmarkToggle}
          className={`transition-all duration-150 focus:outline-none ${
            isBookmarked
              ? 'text-yellow-400 opacity-100 scale-110'
              : 'text-subtle opacity-0 group-hover:opacity-100 hover:text-yellow-300'
          }`}
          title={isBookmarked ? 'Remove Bookmark' : 'Bookmark Evidence Line'}
        >
          <Star size={11} fill={isBookmarked ? 'currentColor' : 'none'} />
        </button>
      </div>

      {/* 2. Line Number Column */}
      {showLineNumbers && (
        <span className="select-none pr-4 text-right font-mono text-subtle">
          {entry.lineNumber ?? ''}
        </span>
      )}

      {/* 3. Severity Badge Column */}
      <span
        className={[
          'mt-0.5 inline-flex h-5 w-11 select-none items-center justify-center rounded border font-mono text-[10px] font-bold',
          severityClass,
        ].join(' ')}
      >
        {severityLabel}
      </span>

      {/* 4. Timestamp Column */}
      <span
        className="truncate pr-3 font-mono text-[11px] text-subtle"
        title={entry.timestamp ?? entry.source ?? undefined}
      >
        {isDuplicateTimestamp ? '' : (entry.timestamp ?? entry.source ?? '')}
      </span>

      {/* 5. Message Content Column */}
      <span
        className={[
          'min-w-0 font-mono text-readable select-text',
          lineWrap ? 'whitespace-pre-wrap break-words' : 'overflow-x-visible whitespace-pre',
        ].join(' ')}
      >
        {parts.map((part, index) => (
          <span
            key={`${entry.lineNumber ?? index}-${index}-${part.text}`}
            className={
              part.isMatch ? 'rounded bg-warning px-0.5 text-ink-950 font-bold' : undefined
            }
          >
            {part.text}
          </span>
        ))}
        {suffix}
      </span>
    </div>
  );
};
