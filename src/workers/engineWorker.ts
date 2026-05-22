import { buildEvidencePack } from '@core/ai/evidencePackBuilder';
import { InMemoryLogIndex } from '@core/indexing/logIndex';
import { OperationalCorrelationEngine } from '@core/investigation/correlationEngine';
import { parseChunk } from '@core/parsing/parserEngine';
import type { EngineWorkerRequest, EngineWorkerResponse } from './workerProtocol';

const logIndex = new InMemoryLogIndex();

export const handleEngineWorkerRequest = (request: EngineWorkerRequest): EngineWorkerResponse => {
  try {
    if (request.type === 'parseChunk') {
      const result = parseChunk({
        chunk: request.chunk,
        text: request.text,
        startingLineNumber: request.startingLineNumber,
      });

      return {
        type: 'parseChunk:done',
        requestId: request.requestId,
        chunk: result.chunk,
        entries: result.entries,
      };
    }

    if (request.type === 'indexEntries') {
      const result = logIndex.indexEntries(request.sourceId, request.entries);

      return {
        type: 'indexEntries:done',
        requestId: request.requestId,
        sourceId: result.sourceId,
        indexedCount: result.entryCount,
      };
    }

    if (request.type === 'search') {
      return {
        type: 'search:done',
        requestId: request.requestId,
        result: logIndex.search(request.query),
      };
    }

    if (request.type === 'getVisibleWindow') {
      return {
        type: 'getVisibleWindow:done',
        requestId: request.requestId,
        window: logIndex.getVisibleWindow(
          request.sourceId,
          request.startRow,
          request.endRow,
          request.severityFilters,
          request.searchQuery,
          request.filterToMatches,
          request.isRegex,
          request.isCaseSensitive,
          request.isWholeWord,
          request.includeFilter,
          request.excludeFilter,
        ),
      };
    }

    if (request.type === 'getCorrelationSequence') {
      return {
        type: 'getCorrelationSequence:done',
        requestId: request.requestId,
        sequence: logIndex.getCorrelationSequence(request.sourceId, request.field, request.value),
      };
    }

    if (request.type === 'detectPatterns') {
      return {
        type: 'detectPatterns:done',
        requestId: request.requestId,
        patterns: logIndex.detectOperationalPatterns(request.sourceId),
      };
    }

    // Phase 4 Correlation & Operational Engines Routing
    if (request.type === 'detectIncidents') {
      const entries = logIndex.getEntries(request.sourceId);
      return {
        type: 'detectIncidents:done',
        requestId: request.requestId,
        incidents: OperationalCorrelationEngine.detectIncidents(request.sourceId, entries),
      };
    }

    if (request.type === 'reconstructStates') {
      const entries = logIndex.getEntries(request.sourceId);
      return {
        type: 'reconstructStates:done',
        requestId: request.requestId,
        sequence: OperationalCorrelationEngine.reconstructStates(request.sourceId, entries),
      };
    }

    if (request.type === 'detectFailureChains') {
      return {
        type: 'detectFailureChains:done',
        requestId: request.requestId,
        chains: OperationalCorrelationEngine.detectFailureChains(
          request.sourceId,
          request.incidents,
        ),
      };
    }

    if (request.type === 'validateDomainRules') {
      const entries = logIndex.getEntries(request.sourceId);
      return {
        type: 'validateDomainRules:done',
        requestId: request.requestId,
        results: OperationalCorrelationEngine.validateDomainRules(request.sourceId, entries),
      };
    }

    if (request.type === 'buildEvidencePack') {
      return {
        type: 'buildEvidencePack:done',
        requestId: request.requestId,
        evidencePack: buildEvidencePack({
          investigationId: request.investigationId,
          question: request.question,
          entries: request.entries,
        }),
      };
    }

    return {
      type: 'error',
      requestId: (request as any).requestId,
      message: 'Unknown request action.',
    };
  } catch (error) {
    return {
      type: 'error',
      requestId: (request as any).requestId,
      message: error instanceof Error ? error.message : 'Unknown engine worker error.',
    };
  }
};

self.addEventListener('message', (event: MessageEvent<EngineWorkerRequest>) => {
  const response = handleEngineWorkerRequest(event.data);
  self.postMessage(response);
});
