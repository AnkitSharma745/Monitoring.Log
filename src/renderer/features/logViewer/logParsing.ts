export type LogSeverity = 'error' | 'warn' | 'info' | 'debug' | 'neutral';

export interface ParsedLogLine {
  lineNumber: number;
  text: string;
  severity: LogSeverity;
  matchesSearch: boolean;
}

export interface HighlightPart {
  text: string;
  isMatch: boolean;
}

export interface LogSeverityStats {
  total: number;
  visible: number;
  matched: number;
  error: number;
  warn: number;
  info: number;
  debug: number;
  neutral: number;
}

const severityPatterns: Array<{ severity: LogSeverity; pattern: RegExp }> = [
  { severity: 'error', pattern: /(^|\s|\[)(error|err|fatal|exception|panic)(\]|\s|:|-|$)/i },
  { severity: 'warn', pattern: /(^|\s|\[)(warn|warning)(\]|\s|:|-|$)/i },
  { severity: 'info', pattern: /(^|\s|\[)(info|notice)(\]|\s|:|-|$)/i },
  { severity: 'debug', pattern: /(^|\s|\[)(debug|trace|verbose)(\]|\s|:|-|$)/i },
];

export const buildParsedLogLines = (content: string, searchQuery: string): ParsedLogLine[] => {
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const hasSearchQuery = normalizedQuery.length > 0;
  const rawLines = content.length > 0 ? content.split(/\r?\n/) : [];

  return rawLines.map((text, index) => {
    const matchesSearch = hasSearchQuery && text.toLocaleLowerCase().includes(normalizedQuery);

    return {
      lineNumber: index + 1,
      text,
      severity: detectSeverity(text),
      matchesSearch,
    };
  });
};

export const filterLogLines = (
  lines: ParsedLogLine[],
  searchQuery: string,
  filterToMatches: boolean,
  severityFilters: Record<LogSeverity, boolean>,
): ParsedLogLine[] => {
  const hasSearchQuery = searchQuery.trim().length > 0;

  return lines.filter((line) => {
    if (!severityFilters[line.severity]) {
      return false;
    }

    return !filterToMatches || !hasSearchQuery || line.matchesSearch;
  });
};

export const getVisibleLogText = (lines: ParsedLogLine[]): string => {
  return lines.map((line) => line.text).join('\n');
};

export const getLogSeverityStats = (
  allLines: ParsedLogLine[],
  visibleLines: ParsedLogLine[],
): LogSeverityStats => {
  const stats: LogSeverityStats = {
    total: allLines.length,
    visible: visibleLines.length,
    matched: allLines.filter((line) => line.matchesSearch).length,
    error: 0,
    warn: 0,
    info: 0,
    debug: 0,
    neutral: 0,
  };

  for (const line of allLines) {
    stats[line.severity] += 1;
  }

  return stats;
};

export const getHighlightedParts = (text: string, searchQuery: string): HighlightPart[] => {
  const query = searchQuery.trim();

  if (query.length === 0) {
    return [{ text, isMatch: false }];
  }

  const lowerText = text.toLocaleLowerCase();
  const lowerQuery = query.toLocaleLowerCase();
  const parts: HighlightPart[] = [];
  let cursor = 0;
  let matchIndex = lowerText.indexOf(lowerQuery);

  while (matchIndex !== -1) {
    if (matchIndex > cursor) {
      parts.push({ text: text.slice(cursor, matchIndex), isMatch: false });
    }

    const matchEnd = matchIndex + query.length;
    parts.push({ text: text.slice(matchIndex, matchEnd), isMatch: true });
    cursor = matchEnd;
    matchIndex = lowerText.indexOf(lowerQuery, cursor);
  }

  if (cursor < text.length) {
    parts.push({ text: text.slice(cursor), isMatch: false });
  }

  return parts.length > 0 ? parts : [{ text, isMatch: false }];
};

const detectSeverity = (line: string): LogSeverity => {
  for (const { severity, pattern } of severityPatterns) {
    if (pattern.test(line)) {
      return severity;
    }
  }

  return 'neutral';
};
