import type { LogEntry } from '@renderer/features/logViewer/logParsing';

export type LogInsightTone = 'danger' | 'warning' | 'info';

export interface LogInsight {
  id: string;
  title: string;
  detail: string;
  tone: LogInsightTone;
  count: number;
}

const CRASH_PATTERN = /\b(crash|fatal|panic|uncaught|segmentation|stack trace)\b/i;
const CONNECTION_PATTERN =
  /\b(econnrefused|econnreset|timeout|connection refused|network error|socket hang up)\b/i;
const AUTH_PATTERN = /\b(401|403|unauthorized|forbidden|auth failed|invalid token)\b/i;
const API_FAILURE_PATTERN = /\b(5\d{2}|http 5\d{2}|api failed|request failed|bad gateway)\b/i;

export const buildLogInsights = (entries: LogEntry[]): LogInsight[] => {
  const insights: LogInsight[] = [];
  const errorEntries = entries.filter((entry) => entry.severity === 'error');
  const warnEntries = entries.filter((entry) => entry.severity === 'warn');

  const repeatedError = getMostRepeatedError(errorEntries);

  if (repeatedError && repeatedError.count >= 5) {
    insights.push({
      id: 'repeated-errors',
      title: `${repeatedError.count} repeated errors`,
      detail: repeatedError.message,
      tone: 'danger',
      count: repeatedError.count,
    });
  }

  if (warnEntries.length >= 10 && warnEntries.length / Math.max(entries.length, 1) >= 0.2) {
    insights.push({
      id: 'warning-spike',
      title: 'Warning spike detected',
      detail: `${warnEntries.length} warning lines are present in the active view.`,
      tone: 'warning',
      count: warnEntries.length,
    });
  }

  appendPatternInsight(insights, entries, CRASH_PATTERN, {
    id: 'crash-indicators',
    title: 'Crash indicators found',
    detail: 'Fatal, panic, uncaught, or stack trace terms are present.',
    tone: 'danger',
  });
  appendPatternInsight(insights, entries, CONNECTION_PATTERN, {
    id: 'connection-failures',
    title: 'Connection failures detected',
    detail: 'Network timeout, reset, or connection refusal patterns are present.',
    tone: 'warning',
  });
  appendPatternInsight(insights, entries, AUTH_PATTERN, {
    id: 'auth-failures',
    title: 'Authentication failures detected',
    detail: 'Unauthorized, forbidden, token, or credential failure patterns are present.',
    tone: 'warning',
  });
  appendPatternInsight(insights, entries, API_FAILURE_PATTERN, {
    id: 'api-failures',
    title: 'API failure burst detected',
    detail: 'HTTP 5xx or request failure patterns are present.',
    tone: 'warning',
  });

  return insights.slice(0, 4);
};

interface PatternInsightTemplate {
  id: string;
  title: string;
  detail: string;
  tone: LogInsightTone;
}

const appendPatternInsight = (
  insights: LogInsight[],
  entries: LogEntry[],
  pattern: RegExp,
  template: PatternInsightTemplate,
): void => {
  const count = entries.filter((entry) => pattern.test(entry.raw)).length;

  if (count === 0) {
    return;
  }

  insights.push({
    ...template,
    count,
    title: `${template.title} (${count})`,
  });
};

const getMostRepeatedError = (entries: LogEntry[]): { message: string; count: number } | null => {
  const counts = new Map<string, { message: string; count: number }>();

  for (const entry of entries) {
    const key = normalizeErrorMessage(entry.message);
    const current = counts.get(key);

    counts.set(key, {
      message: entry.message,
      count: current ? current.count + 1 : 1,
    });
  }

  return Array.from(counts.values()).sort((left, right) => right.count - left.count)[0] ?? null;
};

const normalizeErrorMessage = (message: string): string => {
  return message
    .replace(/\b\d+\b/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase();
};
