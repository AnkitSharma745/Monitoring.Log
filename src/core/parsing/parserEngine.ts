import { defaultParserRules, type ParserRuleSet } from './parserRules';

import type { LogChunk, LogSeverity, StructuredLogEntry } from '@shared/contracts/logs';

export interface ParseChunkRequest {
  chunk: LogChunk;
  text: string;
  startingLineNumber: number;
  rules?: ParserRuleSet;
}

export interface ParseChunkResult {
  chunk: LogChunk;
  entries: StructuredLogEntry[];
}

export const parseChunk = ({
  chunk,
  text,
  startingLineNumber,
  rules = defaultParserRules,
}: ParseChunkRequest): ParseChunkResult => {
  const lines = text.length > 0 ? text.split(/\r?\n/) : [];
  let byteCursor = chunk.byteStart;

  const entries = lines.map((raw, index) => {
    const lineNumber = startingLineNumber + index;
    const byteLength = new TextEncoder().encode(raw).length;
    const byteStart = byteCursor;
    const byteEnd = byteStart + byteLength;
    byteCursor = byteEnd + 1;

    try {
      const timestamp = extractTimestamp(raw, rules);

      return {
        id: `${chunk.sourceId}:${lineNumber}:${hashLine(raw)}`,
        sourceId: chunk.sourceId,
        filePath: chunk.filePath,
        chunkId: chunk.id,
        lineNumber,
        byteStart,
        byteEnd,
        timestamp,
        timestampEpochMs: timestamp ? normalizeTimestamp(timestamp) : null,
        severity: detectSeverity(raw, rules),
        source: extractSource(raw, rules),
        eventKind: null,
        correlationIds: extractMatches(raw, rules.correlationIdPatterns),
        hardwareIds: extractMatches(raw, rules.hardwareIdPatterns),
        paymentIds: extractMatches(raw, rules.paymentIdPatterns),
        sessionIds: extractMatches(raw, rules.sessionIdPatterns),
        message: extractMessage(raw, timestamp),
        raw,
        parseConfidence: 0.85,
      } satisfies StructuredLogEntry;
    } catch (error) {
      console.error(`Failed parsing log entry at line ${lineNumber}:`, error);
      return {
        id: `${chunk.sourceId}:${lineNumber}:${hashLine(raw)}`,
        sourceId: chunk.sourceId,
        filePath: chunk.filePath,
        chunkId: chunk.id,
        lineNumber,
        byteStart,
        byteEnd,
        timestamp: null,
        timestampEpochMs: null,
        severity: 'neutral',
        source: 'PARSER_ERROR',
        eventKind: null,
        correlationIds: [],
        hardwareIds: [],
        paymentIds: [],
        sessionIds: [],
        message: raw.trim(),
        raw,
        parseConfidence: 0.0,
      } satisfies StructuredLogEntry;
    }
  });

  return {
    chunk: {
      ...chunk,
      lineStart: startingLineNumber,
      lineEnd: entries.at(-1)?.lineNumber ?? startingLineNumber,
      parsedEntryCount: entries.length,
    },
    entries,
  };
};

const detectSeverity = (line: string, rules: ParserRuleSet): LogSeverity => {
  for (const { severity, pattern } of rules.severityPatterns) {
    if (pattern.test(line)) {
      return severity;
    }
  }

  return 'neutral';
};

const extractTimestamp = (line: string, rules: ParserRuleSet): string | null => {
  for (const pattern of rules.timestampPatterns) {
    const match = pattern.exec(line);
    const timestamp = match?.groups?.['timestamp'];

    if (timestamp) {
      return timestamp;
    }
  }

  return null;
};

const extractSource = (line: string, rules: ParserRuleSet): string | null => {
  for (const pattern of rules.sourcePatterns) {
    const match = pattern.exec(line);
    const source = match?.groups?.['source'];

    if (source) {
      return source;
    }
  }

  return null;
};

const extractMatches = (line: string, patterns: RegExp[]): string[] => {
  const matches = new Set<string>();
  for (const pattern of patterns) {
    // Reset regex lastIndex
    pattern.lastIndex = 0;

    if (pattern.global) {
      let match;
      while ((match = pattern.exec(line)) !== null) {
        const val = match.groups?.['id'] || match[0];
        if (val) {
          matches.add(val.trim());
        }
      }
    } else {
      const match = pattern.exec(line);
      const val = match?.groups?.['id'] || match?.[0];
      if (val) {
        matches.add(val.trim());
      }
    }
  }
  return Array.from(matches);
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

const normalizeTimestamp = (timestamp: string): number | null => {
  const parsedTimestamp = Date.parse(timestamp);

  return Number.isNaN(parsedTimestamp) ? null : parsedTimestamp;
};

const hashLine = (line: string): string => {
  let hash = 0;

  for (let index = 0; index < line.length; index += 1) {
    hash = (hash * 31 + line.charCodeAt(index)) >>> 0;
  }

  return hash.toString(36);
};
