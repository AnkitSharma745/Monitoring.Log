export type LogSeverity = 'error' | 'warn' | 'info' | 'debug' | 'neutral';

export interface LogEntry {
  id: string;
  timestamp: string | null;
  severity: LogSeverity;
  source: string | null;
  message: string;
  raw: string;
  filePath: string;
  lineNumber: number;
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

const timestampPatterns = [
  /^\s*(?<timestamp>\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)/,
  /^\s*\[(?<timestamp>\d{4}-\d{2}-\d{2}[^\]]+)\]/,
  /^\s*(?<timestamp>\d{2}:\d{2}:\d{2}(?:\.\d+)?)/,
];

const sourcePatterns = [
  /\[(?<source>[A-Za-z][A-Za-z0-9_.:-]{1,48})\]/,
  /\bsource=(?<source>[A-Za-z0-9_.:-]+)/i,
  /\bmodule=(?<source>[A-Za-z0-9_.:-]+)/i,
];

export const buildLogEntries = (
  content: string,
  searchQuery: string,
  filePath: string,
): LogEntry[] => {
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const hasSearchQuery = normalizedQuery.length > 0;
  const rawLines = content.length > 0 ? content.split(/\r?\n/) : [];

  return rawLines.map((raw, index) => {
    const lineNumber = index + 1;
    const severity = detectSeverity(raw);
    const timestamp = extractTimestamp(raw);
    const source = extractSource(raw, severity);
    const message = extractMessage(raw, timestamp);
    const matchesSearch = hasSearchQuery && raw.toLocaleLowerCase().includes(normalizedQuery);

    return {
      id: `${filePath}:${lineNumber}:${hashLine(raw)}`,
      timestamp,
      severity,
      source,
      message,
      raw,
      filePath,
      lineNumber,
      matchesSearch,
    };
  });
};

export const filterLogEntries = (
  entries: LogEntry[],
  searchQuery: string,
  filterToMatches: boolean,
  severityFilters: Record<LogSeverity, boolean>,
): LogEntry[] => {
  const hasSearchQuery = searchQuery.trim().length > 0;

  return entries.filter((entry) => {
    if (!severityFilters[entry.severity]) {
      return false;
    }

    return !filterToMatches || !hasSearchQuery || entry.matchesSearch;
  });
};

export const getVisibleLogText = (entries: LogEntry[]): string => {
  return entries.map((entry) => entry.raw).join('\n');
};

export const getLogSeverityStats = (
  allEntries: LogEntry[],
  visibleEntries: LogEntry[],
): LogSeverityStats => {
  const stats: LogSeverityStats = {
    total: allEntries.length,
    visible: visibleEntries.length,
    matched: allEntries.filter((entry) => entry.matchesSearch).length,
    error: 0,
    warn: 0,
    info: 0,
    debug: 0,
    neutral: 0,
  };

  for (const entry of allEntries) {
    stats[entry.severity] += 1;
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

const extractTimestamp = (line: string): string | null => {
  for (const pattern of timestampPatterns) {
    const match = pattern.exec(line);
    const timestamp = match?.groups?.['timestamp'];

    if (timestamp) {
      return timestamp;
    }
  }

  return null;
};

const extractSource = (line: string, severity: LogSeverity): string | null => {
  for (const pattern of sourcePatterns) {
    const match = pattern.exec(line);
    const source = match?.groups?.['source'];

    if (source && source.toLocaleLowerCase() !== severity) {
      return source;
    }
  }

  return null;
};

const extractMessage = (line: string, timestamp: string | null): string => {
  if (!timestamp) {
    return line.trim();
  }

  return line
    .replace(timestamp, '')
    .replace(/^\s*[\][\-:|]+/, '')
    .trim();
};

const hashLine = (line: string): string => {
  let hash = 0;

  for (let index = 0; index < line.length; index += 1) {
    hash = (hash * 31 + line.charCodeAt(index)) >>> 0;
  }

  return hash.toString(36);
};
