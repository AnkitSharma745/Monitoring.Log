import { buildEvidencePack } from '@core/ai/evidencePackBuilder';
import { InvestigationAssistantEngine } from '@core/ai/investigationAssistantEngine';

import { InMemoryLogIndex } from '@core/indexing/logIndex';
import { OperationalCorrelationEngine } from '@core/investigation/correlationEngine';
import { DocumentEngine } from '@core/knowledge/documentEngine';
import { parseChunk } from '@core/parsing/parserEngine';
import type { EngineWorkerRequest, EngineWorkerResponse } from './workerProtocol';
import type { IngestedDocument } from '@shared/contracts/knowledge';

const logIndex = new InMemoryLogIndex();
const ingestedDocuments: IngestedDocument[] = [];

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
        incidents: OperationalCorrelationEngine.detectIncidents(request.sourceId, entries, request.customRules),
      };
    }

    if (request.type === 'reconstructStates') {
      const entries = logIndex.getEntries(request.sourceId);
      return {
        type: 'reconstructStates:done',
        requestId: request.requestId,
        sequence: OperationalCorrelationEngine.reconstructStates(request.sourceId, entries, request.customRules),
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
      const docRules = ingestedDocuments.flatMap((d) => d.rules);
      const customRules = [...(request.customRules || []), ...docRules];
      return {
        type: 'validateDomainRules:done',
        requestId: request.requestId,
        results: OperationalCorrelationEngine.validateDomainRules(
          request.sourceId,
          entries,
          customRules,
        ),
      };
    }

    // Phase 8 Enterprise Off-Thread Core Processing Engines Routing
    if (request.type === 'compileIncidentGraph') {
      return {
        type: 'compileIncidentGraph:done',
        requestId: request.requestId,
        graph: OperationalCorrelationEngine.compileIncidentGraph(
          request.incidents,
          request.sequence,
          request.ruleResults,
        ),
      };
    }

    if (request.type === 'calculateDegradationScore') {
      return {
        type: 'calculateDegradationScore:done',
        requestId: request.requestId,
        result: OperationalCorrelationEngine.calculateDegradationScore(
          request.incidents,
          request.ruleResults,
        ),
      };
    }

    if (request.type === 'ingestDocument') {
      const doc = DocumentEngine.ingestDocument(request.name, request.content, request.filePath);
      // Avoid duplicate documents by name/filepath if imported again
      const existingIdx = ingestedDocuments.findIndex((d) => d.name === request.name);
      if (existingIdx !== -1) {
        ingestedDocuments[existingIdx] = doc;
      } else {
        ingestedDocuments.push(doc);
      }
      return {
        type: 'ingestDocument:done',
        requestId: request.requestId,
        document: doc,
      };
    }

    if (request.type === 'queryKnowledgeBase') {
      const results = DocumentEngine.searchKnowledgeBase(ingestedDocuments, request.query);
      return {
        type: 'queryKnowledgeBase:done',
        requestId: request.requestId,
        results,
      };
    }

    if (request.type === 'getTroubleshooterMatches') {
      const entries = logIndex.getEntries(request.sourceId);
      const symptoms = ingestedDocuments.flatMap((d) => d.symptoms);
      const matches = DocumentEngine.matchTroubleshootingSymptoms(entries, symptoms);
      return {
        type: 'getTroubleshooterMatches:done',
        requestId: request.requestId,
        matches,
      };
    }

    if (request.type === 'searchSemanticAssist') {
      const results = logIndex.searchSemanticAssist(request.sourceId, request.query);
      return {
        type: 'searchSemanticAssist:done',
        requestId: request.requestId,
        results,
      };
    }

    if (request.type === 'findSimilarIncidents') {
      const entries = logIndex.getEntries(request.sourceId);
      const incidents = OperationalCorrelationEngine.detectIncidents(request.sourceId, entries);
      const similar = logIndex.findSimilarIncidents(
        request.sourceId,
        request.incidentId,
        incidents,
      );
      return {
        type: 'findSimilarIncidents:done',
        requestId: request.requestId,
        incidents: similar,
      };
    }

    if (request.type === 'runInvestigationAssist') {
      const sourceId = request.evidencePack.entries[0]?.sourceId || '';
      const entries = logIndex.getEntries(sourceId);
      const activeIncidents = OperationalCorrelationEngine.detectIncidents(sourceId, entries);
      const validatedRules = OperationalCorrelationEngine.validateDomainRules(
        sourceId,
        entries,
        ingestedDocuments.flatMap((d) => d.rules),
      );

      const response = InvestigationAssistantEngine.analyzeEvidence({
        evidencePack: request.evidencePack,
        ingestedDocuments,
        activeIncidents,
        validatedRules,
      });

      return {
        type: 'runInvestigationAssist:done',
        requestId: request.requestId,
        response,
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

    const req = request as unknown as { requestId: string };
    return {
      type: 'error',
      requestId: req.requestId,
      message: 'Unknown request action.',
    };
  } catch (error) {
    const req = request as unknown as { requestId: string };
    return {
      type: 'error',
      requestId: req.requestId,
      message: error instanceof Error ? error.message : 'Unknown engine worker error.',
    };
  }
};

self.addEventListener('message', (event: MessageEvent<EngineWorkerRequest>) => {
  const response = handleEngineWorkerRequest(event.data);
  self.postMessage(response);
});
