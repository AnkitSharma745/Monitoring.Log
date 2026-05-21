import type { LogEntry } from './logParsing';

export type TimelineRow = TimeGroupRow | EntryTimelineRow | RepeatedTimelineRow;

export interface TimeGroupRow {
  type: 'time-group';
  id: string;
  label: string;
}

export interface EntryTimelineRow {
  type: 'entry';
  id: string;
  entry: LogEntry;
}

export interface RepeatedTimelineRow {
  type: 'repeated';
  id: string;
  entry: LogEntry;
  count: number;
  lineNumbers: number[];
  entryIds: string[];
}

export interface TimelineGroupingOptions {
  compactMode: boolean;
  collapseRepeatedLogs: boolean;
}

export const buildTimelineRows = (
  entries: LogEntry[],
  options: TimelineGroupingOptions,
): TimelineRow[] => {
  const rows: TimelineRow[] = [];
  let previousBucket: string | null = null;

  for (const entry of entries) {
    const bucketLabel = getTimeBucketLabel(entry);

    if (bucketLabel !== previousBucket) {
      rows.push({
        type: 'time-group',
        id: `${entry.filePath}:time:${bucketLabel}:${entry.lineNumber}`,
        label: bucketLabel,
      });
      previousBucket = bucketLabel;
    }

    if (options.collapseRepeatedLogs && appendToRepeatedRow(rows, entry)) {
      continue;
    }

    rows.push({
      type: 'entry',
      id: entry.id,
      entry,
    });
  }

  if (!options.compactMode) {
    return rows;
  }

  return rows.filter((row, index) => {
    if (row.type !== 'time-group') {
      return true;
    }

    return index === 0 || rows[index - 1]?.type !== 'time-group';
  });
};

const appendToRepeatedRow = (rows: TimelineRow[], entry: LogEntry): boolean => {
  const previousRow = rows.at(-1);

  if (!previousRow || previousRow.type === 'time-group') {
    return false;
  }

  const previousEntry = previousRow.type === 'entry' ? previousRow.entry : previousRow.entry;

  if (!isSameRepeatedMessage(previousEntry, entry)) {
    return false;
  }

  if (previousRow.type === 'repeated') {
    previousRow.count += 1;
    previousRow.lineNumbers.push(entry.lineNumber);
    previousRow.entryIds.push(entry.id);
    return true;
  }

  rows[rows.length - 1] = {
    type: 'repeated',
    id: `${previousRow.entry.id}:repeat`,
    entry: previousRow.entry,
    count: 2,
    lineNumbers: [previousRow.entry.lineNumber, entry.lineNumber],
    entryIds: [previousRow.entry.id, entry.id],
  };

  return true;
};

const isSameRepeatedMessage = (left: LogEntry, right: LogEntry): boolean => {
  return (
    left.severity === right.severity &&
    left.source === right.source &&
    normalizeRepeatedMessage(left.message) === normalizeRepeatedMessage(right.message)
  );
};

const normalizeRepeatedMessage = (message: string): string => {
  return message
    .replace(/\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g, '')
    .replace(/\b\d{2}:\d{2}:\d{2}(?:\.\d+)?\b/g, '')
    .replace(/\b\d+\b/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase();
};

const getTimeBucketLabel = (entry: LogEntry): string => {
  if (!entry.timestamp) {
    return 'No timestamp';
  }

  const parsedTimestamp = Date.parse(entry.timestamp);

  if (!Number.isNaN(parsedTimestamp)) {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(parsedTimestamp));
  }

  const timeOnlyMatch = /^\d{2}:\d{2}/.exec(entry.timestamp);

  if (timeOnlyMatch) {
    return `Time ${timeOnlyMatch[0]}`;
  }

  return entry.timestamp.slice(0, 18);
};
