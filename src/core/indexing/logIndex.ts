import type { StructuredLogEntry, VisibleLogWindow } from '@shared/contracts/logs';
import type { SearchMatch, SearchQuery, SearchResult } from '@shared/contracts/search';

export interface LogIndexSnapshot {
  sourceId: string;
  entryCount: number;
  indexedAt: string;
}

export interface CorrelationSequence {
  id: string;
  field: 'correlationId' | 'paymentId' | 'sessionId' | 'hardwareId';
  value: string;
  entries: StructuredLogEntry[];
  startTime: string | null;
  endTime: string | null;
  durationMs: number | null;
  hasErrors: boolean;
}

export class InMemoryLogIndex {
  private readonly entriesBySource = new Map<string, StructuredLogEntry[]>();

  // High-performance indices
  private readonly severityIndices = new Map<string, Map<string, number[]>>(); // sourceId -> severity -> global indices
  private readonly sourceIndices = new Map<string, Map<string, number[]>>(); // sourceId -> moduleName -> global indices
  private readonly timestampIndices = new Map<string, number[]>(); // sourceId -> timestampEpochMs array

  // Core Operational Correlation indices
  private readonly correlationIndices = new Map<string, Map<string, number[]>>(); // sourceId -> correlationId -> global indices
  private readonly paymentIndices = new Map<string, Map<string, number[]>>(); // sourceId -> paymentId -> global indices
  private readonly sessionIndices = new Map<string, Map<string, number[]>>(); // sourceId -> sessionId -> global indices
  private readonly hardwareIndices = new Map<string, Map<string, number[]>>(); // sourceId -> hardwareId -> global indices

  // Search Caches to avoid duplicate full-scans during interactive queries
  private readonly searchCache = new Map<
    string,
    {
      queryText: string;
      sourceIds: string[];
      severityFilters: Record<string, boolean>;
      matches: SearchMatch[];
      timestamp: number;
    }
  >();

  public indexEntries(sourceId: string, entries: StructuredLogEntry[]): LogIndexSnapshot {
    const currentEntries = this.entriesBySource.get(sourceId) ?? [];
    const startIndex = currentEntries.length;

    // Append raw entry store
    this.entriesBySource.set(sourceId, [...currentEntries, ...entries]);

    // Ensure index maps exist for this source
    if (!this.severityIndices.has(sourceId)) this.severityIndices.set(sourceId, new Map());
    if (!this.sourceIndices.has(sourceId)) this.sourceIndices.set(sourceId, new Map());
    if (!this.correlationIndices.has(sourceId)) this.correlationIndices.set(sourceId, new Map());
    if (!this.paymentIndices.has(sourceId)) this.paymentIndices.set(sourceId, new Map());
    if (!this.sessionIndices.has(sourceId)) this.sessionIndices.set(sourceId, new Map());
    if (!this.hardwareIndices.has(sourceId)) this.hardwareIndices.set(sourceId, new Map());
    if (!this.timestampIndices.has(sourceId)) this.timestampIndices.set(sourceId, []);

    const sevMap = this.severityIndices.get(sourceId)!;
    const srcMap = this.sourceIndices.get(sourceId)!;
    const corrMap = this.correlationIndices.get(sourceId)!;
    const payMap = this.paymentIndices.get(sourceId)!;
    const sessMap = this.sessionIndices.get(sourceId)!;
    const hwMap = this.hardwareIndices.get(sourceId)!;
    const tsArray = this.timestampIndices.get(sourceId)!;

    // Add entries to all indexed lookups
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (!entry) continue;
      const index = startIndex + i;

      // Index by Severity
      const sev = entry.severity;
      if (!sevMap.has(sev)) sevMap.set(sev, []);
      sevMap.get(sev)!.push(index);

      // Index by Module Source
      const src = entry.source || 'unknown';
      if (!srcMap.has(src)) srcMap.set(src, []);
      srcMap.get(src)!.push(index);

      // Index by Correlation IDs
      for (const id of entry.correlationIds) {
        if (!corrMap.has(id)) corrMap.set(id, []);
        corrMap.get(id)!.push(index);
      }

      // Index by Payment IDs
      for (const id of entry.paymentIds) {
        if (!payMap.has(id)) payMap.set(id, []);
        payMap.get(id)!.push(index);
      }

      // Index by Session IDs
      for (const id of entry.sessionIds) {
        if (!sessMap.has(id)) sessMap.set(id, []);
        sessMap.get(id)!.push(index);
      }

      // Index by Hardware IDs
      for (const id of entry.hardwareIds) {
        if (!hwMap.has(id)) hwMap.set(id, []);
        hwMap.get(id)!.push(index);
      }

      // Parallel Timestamp Array
      tsArray.push(entry.timestampEpochMs ?? Number.NEGATIVE_INFINITY);
    }

    // Invalidate cached search queries relating to this source
    for (const [key, cache] of this.searchCache.entries()) {
      if (cache.sourceIds.includes(sourceId)) {
        this.searchCache.delete(key);
      }
    }

    return {
      sourceId,
      entryCount: currentEntries.length + entries.length,
      indexedAt: new Date().toISOString(),
    };
  }

  public getEntries(sourceId: string): StructuredLogEntry[] {
    return this.entriesBySource.get(sourceId) ?? [];
  }

  public getVisibleWindow(
    sourceId: string,
    startRow: number,
    endRow: number,
    severityFilters?: Record<string, boolean>,
    searchQuery?: string,
    filterToMatches?: boolean,
  ): VisibleLogWindow {
    const entries = this.entriesBySource.get(sourceId) ?? [];

    const filteredEntries = entries.filter((entry) => {
      if (severityFilters && !severityFilters[entry.severity]) {
        return false;
      }
      if (searchQuery && filterToMatches) {
        const query = searchQuery.trim().toLowerCase();
        if (query && !entry.raw.toLowerCase().includes(query)) {
          return false;
        }
      }
      return true;
    });

    const slice = filteredEntries.slice(startRow, endRow + 1);
    const query = searchQuery?.trim().toLowerCase();
    const matchedIndices: number[] = [];
    if (query) {
      filteredEntries.forEach((entry, idx) => {
        if (entry.raw.toLowerCase().includes(query)) {
          matchedIndices.push(idx);
        }
      });
    }

    const finalEntries = slice.map((entry) => {
      const matchesSearch = query ? entry.raw.toLowerCase().includes(query) : false;
      return {
        ...entry,
        matchesSearch,
      };
    });

    const sevMap = this.severityIndices.get(sourceId);
    const severityStats = {
      error: sevMap?.get('error')?.length ?? 0,
      warn: sevMap?.get('warn')?.length ?? 0,
      info: sevMap?.get('info')?.length ?? 0,
      debug: sevMap?.get('debug')?.length ?? 0,
      neutral: sevMap?.get('neutral')?.length ?? 0,
      total: entries.length,
    };

    return {
      sourceId,
      startRow,
      endRow,
      totalRows: filteredEntries.length,
      entries: finalEntries,
      matchedCount: query ? matchedIndices.length : 0,
      matchedIndices,
      severityStats,
    };
  }

  public search(query: SearchQuery): SearchResult {
    const normalizedText = query.text.trim().toLocaleLowerCase();

    // Check search cache
    const cacheKey = `${query.sourceIds.join(',')}:${normalizedText}:${JSON.stringify(query.severityFilters)}:${query.timeRange.start || ''}-${query.timeRange.end || ''}`;
    const cached = this.searchCache.get(cacheKey);
    if (cached) {
      return {
        queryId: query.id,
        sourceIds: query.sourceIds,
        totalMatches: cached.matches.length,
        matches: cached.matches.slice(0, query.limit),
        completedAt: new Date().toISOString(),
      };
    }

    const matches: SearchMatch[] = [];

    for (const sourceId of query.sourceIds) {
      const entries = this.entriesBySource.get(sourceId) ?? [];

      for (const entry of entries) {
        if (!query.severityFilters[entry.severity]) {
          continue;
        }

        if (!isInsideTimeRange(entry.timestampEpochMs, query.timeRange)) {
          continue;
        }

        const normalizedRaw = entry.raw.toLocaleLowerCase();
        const matchIndex = normalizedText ? normalizedRaw.indexOf(normalizedText) : 0;

        if (matchIndex === -1) {
          continue;
        }

        matches.push({
          entryId: entry.id,
          sourceId: entry.sourceId,
          lineNumber: entry.lineNumber,
          byteStart: entry.byteStart,
          byteEnd: entry.byteEnd,
          matchRanges: normalizedText
            ? [{ startColumn: matchIndex, endColumn: matchIndex + normalizedText.length }]
            : [],
        });

        // Limit results check (but still cache all matches up to 5000 for scroll virtualization performance)
        if (matches.length >= 5000) {
          break;
        }
      }
    }

    // Cache the search results
    this.searchCache.set(cacheKey, {
      queryText: normalizedText,
      sourceIds: query.sourceIds,
      severityFilters: { ...query.severityFilters },
      matches,
      timestamp: Date.now(),
    });

    return createSearchResult(query, matches.slice(0, query.limit));
  }

  /**
   * Reconstruct and extract chronological event sequences for a specific correlation indicator.
   * This underpins the operational investigation pipeline for payments, hardware ports, or resets.
   */
  public getCorrelationSequence(
    sourceId: string,
    field: 'correlationId' | 'paymentId' | 'sessionId' | 'hardwareId',
    value: string,
  ): CorrelationSequence | null {
    const entries = this.entriesBySource.get(sourceId) ?? [];
    let indices: number[] = [];

    if (field === 'correlationId') {
      indices = this.correlationIndices.get(sourceId)?.get(value) ?? [];
    } else if (field === 'paymentId') {
      indices = this.paymentIndices.get(sourceId)?.get(value) ?? [];
    } else if (field === 'sessionId') {
      indices = this.sessionIndices.get(sourceId)?.get(value) ?? [];
    } else if (field === 'hardwareId') {
      indices = this.hardwareIndices.get(sourceId)?.get(value) ?? [];
    }

    if (indices.length === 0) {
      return null;
    }

    // Map global indices back to structured entry records
    const sequenceEntries = indices
      .map((idx) => entries[idx])
      .filter((e): e is StructuredLogEntry => !!e)
      .sort((a, b) => (a.timestampEpochMs ?? 0) - (b.timestampEpochMs ?? 0));

    if (sequenceEntries.length === 0) {
      return null;
    }

    const firstEntry = sequenceEntries[0];
    const lastEntry = sequenceEntries[sequenceEntries.length - 1];
    if (!firstEntry || !lastEntry) {
      return null;
    }

    let durationMs: number | null = null;
    if (firstEntry.timestampEpochMs !== null && lastEntry.timestampEpochMs !== null) {
      durationMs = lastEntry.timestampEpochMs - firstEntry.timestampEpochMs;
    }

    const hasErrors = sequenceEntries.some((e) => e && e.severity === 'error');

    return {
      id: crypto.randomUUID(),
      field,
      value,
      entries: sequenceEntries,
      startTime: firstEntry.timestamp,
      endTime: lastEntry.timestamp,
      durationMs,
      hasErrors,
    };
  }

  /**
   * Find repeated operational failure loops or retry storms based on correlation indicators.
   */
  public detectOperationalPatterns(sourceId: string): Array<{
    type: 'payment_retry' | 'heartbeat_failure' | 'kiosk_reset_chain' | 'api_storm';
    description: string;
    indicators: string[];
    affectedEntryCount: number;
    severity: 'error' | 'warn';
  }> {
    const patterns: Array<{
      type: 'payment_retry' | 'heartbeat_failure' | 'kiosk_reset_chain' | 'api_storm';
      description: string;
      indicators: string[];
      affectedEntryCount: number;
      severity: 'error' | 'warn';
    }> = [];

    const payMap = this.paymentIndices.get(sourceId);

    // 1. Detect Payment Retries / Failures
    if (payMap) {
      for (const [payId, indices] of payMap.entries()) {
        if (indices.length >= 3) {
          const entries = this.entriesBySource.get(sourceId) ?? [];
          const hasError = indices.some((idx) => entries[idx]?.severity === 'error');
          const isRetryLoop = indices.some((idx) =>
            /retry|fail|attempt/i.test(entries[idx]?.message || ''),
          );

          if (hasError || isRetryLoop) {
            patterns.push({
              type: 'payment_retry',
              description: `Payment sequence '${payId}' experienced repeated attempts or failures across ${indices.length} log events.`,
              indicators: [payId],
              affectedEntryCount: indices.length,
              severity: hasError ? 'error' : 'warn',
            });
          }
        }
      }
    }

    // 2. Detect Heartbeat Failures
    const entries = this.entriesBySource.get(sourceId) ?? [];
    const heartbeatFailures: number[] = [];
    entries.forEach((e, idx) => {
      if (/heartbeat|ping/i.test(e.message) && e.severity === 'error') {
        heartbeatFailures.push(idx);
      }
    });

    if (heartbeatFailures.length >= 3) {
      patterns.push({
        type: 'heartbeat_failure',
        description: `Detected offline heartbeat loop pattern with ${heartbeatFailures.length} terminal connection drop-offs.`,
        indicators: ['heartbeat', 'ping'],
        affectedEntryCount: heartbeatFailures.length,
        severity: 'error',
      });
    }

    // 3. Detect Kiosk Reset Chains
    const resets: number[] = [];
    entries.forEach((e, idx) => {
      if (/reboot|reset|shutdown|kiosk_start|system_restart/i.test(e.message)) {
        resets.push(idx);
      }
    });

    if (resets.length >= 2) {
      patterns.push({
        type: 'kiosk_reset_chain',
        description: `Terminal observed restart/reboot chain containing ${resets.length} cycles, indicating severe instability.`,
        indicators: ['reboot', 'restart'],
        affectedEntryCount: resets.length,
        severity: 'error',
      });
    }

    return patterns;
  }
}

const isInsideTimeRange = (
  timestampEpochMs: number | null,
  timeRange: SearchQuery['timeRange'],
): boolean => {
  if (!timeRange.start && !timeRange.end) {
    return true;
  }

  if (timestampEpochMs === null) {
    return false;
  }

  const start = timeRange.start ? Date.parse(timeRange.start) : Number.NEGATIVE_INFINITY;
  const end = timeRange.end ? Date.parse(timeRange.end) : Number.POSITIVE_INFINITY;

  return timestampEpochMs >= start && timestampEpochMs <= end;
};

const createSearchResult = (query: SearchQuery, matches: SearchMatch[]): SearchResult => {
  return {
    queryId: query.id,
    sourceIds: query.sourceIds,
    totalMatches: matches.length,
    matches,
    completedAt: new Date().toISOString(),
  };
};
