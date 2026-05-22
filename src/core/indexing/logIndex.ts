import type { Incident } from '@shared/contracts/investigations';
import type { StructuredLogEntry, VisibleLogWindow, CorrelationSequence } from '@shared/contracts/logs';
import type { SearchMatch, SearchQuery, SearchResult } from '@shared/contracts/search';

export interface LogIndexSnapshot {
  sourceId: string;
  entryCount: number;
  indexedAt: string;
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
    isRegex?: boolean,
    isCaseSensitive?: boolean,
    isWholeWord?: boolean,
    includeFilter?: string,
    excludeFilter?: string,
  ): VisibleLogWindow {
    const entries = this.entriesBySource.get(sourceId) ?? [];
    const matcher = searchQuery
      ? buildMatcher(searchQuery, isRegex, isCaseSensitive, isWholeWord)
      : null;

    const filteredEntries = entries.filter((entry) => {
      if (severityFilters && !severityFilters[entry.severity]) {
        return false;
      }
      if (includeFilter && !checkIncludeFilter(entry.raw, includeFilter)) {
        return false;
      }
      if (excludeFilter && !checkExcludeFilter(entry.raw, excludeFilter)) {
        return false;
      }
      if (matcher && filterToMatches) {
        if (!matcher(entry.raw)) {
          return false;
        }
      }
      return true;
    });

    const slice = filteredEntries.slice(startRow, endRow + 1);
    const matchedIndices: number[] = [];
    if (matcher) {
      filteredEntries.forEach((entry, idx) => {
        if (matcher(entry.raw)) {
          matchedIndices.push(idx);
        }
      });
    }

    const finalEntries = slice.map((entry) => {
      const matchesSearch = matcher ? matcher(entry.raw) : false;
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
      matchedCount: matcher ? matchedIndices.length : 0,
      matchedIndices,
      severityStats,
    };
  }

  public search(query: SearchQuery): SearchResult {
    const text = query.text || '';
    const isRegex = query.isRegex ?? false;
    const isCaseSensitive = query.isCaseSensitive ?? false;
    const isWholeWord = query.isWholeWord ?? false;

    // Check search cache (includes toggles)
    const cacheKey = `${query.sourceIds.join(',')}:${text}:${isRegex}:${isCaseSensitive}:${isWholeWord}:${JSON.stringify(query.severityFilters)}:${query.timeRange.start || ''}-${query.timeRange.end || ''}`;
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

    // Compile regex if searching
    let regex: RegExp | null = null;
    if (text) {
      try {
        let pattern = text;
        if (!isRegex) {
          pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }
        if (isWholeWord) {
          pattern = `\\b${pattern}\\b`;
        }
        // Always make it global so we can find multiple match columns on the line
        const flags = isCaseSensitive ? 'g' : 'gi';
        regex = new RegExp(pattern, flags);
      } catch (err) {
        console.error('Regex compilation error in search:', err);
      }
    }

    for (const sourceId of query.sourceIds) {
      const entries = this.entriesBySource.get(sourceId) ?? [];

      for (const entry of entries) {
        if (!query.severityFilters[entry.severity]) {
          continue;
        }

        if (!isInsideTimeRange(entry.timestampEpochMs, query.timeRange)) {
          continue;
        }

        const raw = entry.raw;
        const matchRanges: Array<{ startColumn: number; endColumn: number }> = [];

        if (text) {
          if (regex) {
            regex.lastIndex = 0;
            let match;
            while ((match = regex.exec(raw)) !== null) {
              matchRanges.push({
                startColumn: match.index,
                endColumn: match.index + match[0].length,
              });
              if (!regex.global) break;
              if (match[0].length === 0) regex.lastIndex++;
            }
          } else {
            // Fallback substring search
            const lowerRaw = raw.toLowerCase();
            const lowerText = text.toLowerCase();
            let idx = lowerRaw.indexOf(lowerText);
            while (idx !== -1) {
              matchRanges.push({
                startColumn: idx,
                endColumn: idx + lowerText.length,
              });
              idx = lowerRaw.indexOf(lowerText, idx + lowerText.length);
            }
          }

          if (matchRanges.length === 0) {
            continue;
          }
        }

        matches.push({
          entryId: entry.id,
          sourceId: entry.sourceId,
          lineNumber: entry.lineNumber,
          byteStart: entry.byteStart,
          byteEnd: entry.byteEnd,
          matchRanges,
          raw: entry.raw,
        });

        // Limit results check (but still cache all matches up to 5000 for scroll virtualization performance)
        if (matches.length >= 5000) {
          break;
        }
      }
    }

    // Cache the search results
    this.searchCache.set(cacheKey, {
      queryText: text,
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

  public searchSemanticAssist(sourceId: string, query: string): StructuredLogEntry[] {
    const entries = this.entriesBySource.get(sourceId) ?? [];
    const queryTokens = query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2);
    if (queryTokens.length === 0) return [];

    const scored = entries.map((entry) => {
      let score = 0;
      const msg = (entry.message || entry.raw || '').toLowerCase();

      // 1. Substring bonus
      if (msg.includes(query.toLowerCase())) {
        score += 100;
      }

      // 2. Keyword intersections
      for (const token of queryTokens) {
        if (msg.includes(token)) {
          score += 15;
        }
      }

      // 3. Severity boosts
      if (score > 0) {
        if (entry.severity === 'error') score += 30;
        if (entry.severity === 'warn') score += 15;
      }

      return { entry, score };
    });

    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map((s) => s.entry);
  }

  public findSimilarIncidents(_sourceId: string, incidentId: string, incidents: Incident[]): Incident[] {
    const active = incidents.find((inc) => inc.id === incidentId);
    if (!active) return [];

    const activeTokens = (active.description || '')
      .toLowerCase()
      .split(/\s+/)
      .filter((w: string) => w.length > 2);

    const scored = incidents
      .filter((inc) => inc.id !== incidentId)
      .map((inc) => {
        let score = 0;

        // 1. Category match bonus
        if (inc.category === active.category) {
          score += 60;
        }

        // 2. Severity match bonus
        if (inc.severity === active.severity) {
          score += 20;
        }

        // 3. Description tokens match
        const incDesc = (inc.description || '').toLowerCase();
        for (const token of activeTokens) {
          if (incDesc.includes(token)) {
            score += 15;
          }
        }

        return { incident: inc, score };
      });

    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((s) => s.incident);
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

const buildMatcher = (
  text: string,
  isRegex = false,
  isCaseSensitive = false,
  isWholeWord = false,
): ((raw: string) => boolean) | null => {
  if (!text) return null;
  try {
    let pattern = text;
    if (!isRegex) {
      pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    if (isWholeWord) {
      pattern = `\\b${pattern}\\b`;
    }
    const flags = isCaseSensitive ? '' : 'i';
    const regex = new RegExp(pattern, flags);
    return (raw: string) => regex.test(raw);
  } catch (err) {
    console.error('Regex compilation error:', err);
    const lowerText = text.toLowerCase();
    return (raw: string) => raw.toLowerCase().includes(lowerText);
  }
};

const checkIncludeFilter = (raw: string, includeStr: string): boolean => {
  if (!includeStr) return true;
  const parts = includeStr
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return parts.every((part) => raw.toLowerCase().includes(part));
};

const checkExcludeFilter = (raw: string, excludeStr: string): boolean => {
  if (!excludeStr) return true;
  const parts = excludeStr
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return !parts.some((part) => raw.toLowerCase().includes(part));
};
