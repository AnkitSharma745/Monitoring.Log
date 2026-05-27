import {
  Brain,
  Search,
  Terminal,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Play,
  RefreshCw,
  X,
  FileText,
  HelpCircle,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@renderer/components/ui/Button';
import { useAiStore } from '@renderer/stores/aiStore';
import { useInvestigationStore } from '@renderer/stores/investigationStore';
import { useSettingsStore } from '@renderer/stores/settingsStore';
import { useViewerStore } from '@renderer/stores/viewerStore';
import type { StructuredLogEntry } from '@shared/contracts/logs';
import type React from 'react';

const EMPTY_ARRAY: StructuredLogEntry[] = [];

export const AiEvidencePanel = (): React.JSX.Element => {
  const {
    activeResponse,
    activeEvidencePackId,
    evidencePacksById,
    semanticMatches,
    similarIncidents,
    loading,
    error,
    runSemanticSearchAssist,
    runAiReasoning,
    clearActiveResponse,
  } = useAiStore();

  const selectedFilePath = useViewerStore((state) => state.selectedFilePath);
  const viewportEntries = useViewerStore((state) =>
    selectedFilePath ? state.viewportEntriesByPath[selectedFilePath] || EMPTY_ARRAY : EMPTY_ARRAY,
  );
  const scrollToLineRowIndex = useViewerStore((state) => state.scrollToLineRowIndex);

  const preferences = useSettingsStore((state) => state.preferences);
  const activeInvestigationId = useInvestigationStore((state) => state.activeInvestigationId);
  const ensureActiveInvestigation = useInvestigationStore(
    (state) => state.ensureActiveInvestigation,
  );

  const [semanticQuery, setSemanticQuery] = useState('');
  const [reasoningPrompt] = useState('');
  const [isTraceExpanded, setIsTraceExpanded] = useState(false);

  const activeEvidencePack = activeEvidencePackId ? evidencePacksById[activeEvidencePackId] : null;

  const handleRunAnalysis = async (customPrompt?: string): Promise<void> => {
    const question =
      customPrompt ||
      reasoningPrompt ||
      'Analyze recent cycles for SLA violations or reboot indicators.';
    if (viewportEntries.length === 0) return;

    let currentId = activeInvestigationId;
    if (!currentId) {
      currentId = ensureActiveInvestigation();
    }

    await runAiReasoning(currentId || 'default-inv', question, viewportEntries);
  };

  const handleSemanticSearch = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!selectedFilePath || !semanticQuery.trim()) return;
    await runSemanticSearchAssist(selectedFilePath, semanticQuery);
  };

  const formatBoldText = (text: string) => {
    const parts = text.split('**');
    return parts.map((part, index) => {
      if (index % 2 === 1) {
        return (
          <strong key={index} className="font-semibold text-readable">
            {part}
          </strong>
        );
      }
      return part;
    });
  };

  const renderMarkdown = (text: string) => {
    const lines = text.split('\n');
    return lines.map((line, idx) => {
      const trimmed = line.trim();
      if (!trimmed) return <div key={idx} className="h-2" />;

      if (trimmed.startsWith('### ')) {
        return (
          <h3
            key={idx}
            className="text-xs font-bold uppercase tracking-wider text-readable mt-4 mb-2 pb-1 border-b border-line/40 flex items-center gap-1.5"
          >
            <Brain size={13} className="text-accent" />
            {trimmed.slice(4)}
          </h3>
        );
      }

      if (trimmed.startsWith('#### ')) {
        return (
          <h4 key={idx} className="text-xs font-semibold text-accent/90 mt-3 mb-1">
            {trimmed.slice(5)}
          </h4>
        );
      }

      if (trimmed.startsWith('> ')) {
        const content = trimmed.slice(2);
        return (
          <blockquote
            key={idx}
            className="my-3 border-l-2 border-accent bg-accent-soft/10 px-3 py-2 rounded text-muted text-xs leading-relaxed italic"
          >
            {formatBoldText(content)}
          </blockquote>
        );
      }

      if (trimmed.startsWith('- ')) {
        return (
          <div key={idx} className="flex items-start gap-2 my-1 pl-1">
            <span className="text-accent text-xs mt-1 shrink-0">•</span>
            <span className="text-readable text-xs leading-relaxed">
              {formatBoldText(trimmed.slice(2))}
            </span>
          </div>
        );
      }

      return (
        <p key={idx} className="text-readable text-xs leading-relaxed my-1">
          {formatBoldText(trimmed)}
        </p>
      );
    });
  };

  return (
    <div className="flex h-full w-full flex-col bg-panel text-readable text-xs min-h-0 select-none">
      {/* Top Header Panel */}
      <header className="flex h-9 items-center justify-between border-b border-line bg-ink-900 px-4 shrink-0">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2 font-mono text-[11px] text-subtle">
            <Brain size={14} className="text-accent animate-pulse" />
            <span className="font-semibold text-readable uppercase tracking-wider">
              Evidence-First Local Assistant
            </span>
          </div>
          <div className="h-4 w-[1px] bg-line" />
          <span className="text-[10px] text-muted font-normal">
            Assistive Reasoning Pipeline • Zero-Hallucination Sandbox
          </span>
        </div>

        {activeResponse && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-muted hover:text-readable font-mono text-[10px]"
            onClick={clearActiveResponse}
          >
            <X size={12} className="mr-1" />
            Clear Analysis
          </Button>
        )}
      </header>

      {/* Main Panel Content Area */}
      <div className="flex-1 flex min-h-0 divide-x divide-line">
        {/* LEFT COLUMN: Reasoning Findings or Entry screen */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col min-w-0">
          {loading && (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
              <RefreshCw size={24} className="animate-spin text-accent mb-3" />
              <h3 className="text-xs font-semibold text-readable mb-1">
                Synthesizing Chronological Evidence...
              </h3>
              <p className="text-[10px] text-muted max-w-sm">
                Parsing offline SLA rules, correlating telemetry with knowledge symptom indices, and
                packaging strict trace logs.
              </p>
            </div>
          )}

          {error && (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-danger border border-danger/10 bg-danger-soft/5 rounded-lg m-4">
              <AlertTriangle size={24} className="mb-2" />
              <h3 className="text-xs font-semibold mb-1">Reasoning Engine Exception</h3>
              <p className="text-[10px] opacity-80 max-w-md">{error}</p>
            </div>
          )}

          {!loading && !error && !activeResponse && (
            <div className="flex-1 flex flex-col gap-6 justify-center">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                {/* Introduction Card */}
                <div className="space-y-4 pr-2">
                  <div className="space-y-2">
                    <h3 className="text-sm font-bold text-readable flex items-center gap-2">
                      <Brain className="text-accent" size={16} />
                      Assistive Incident Reasoning
                    </h3>
                    <p className="text-xs text-muted leading-relaxed font-normal">
                      This assistant evaluates log sequence patterns, verifies local SLA rules,
                      matches symptom patterns, and builds clickable trace citations. No data is
                      transmitted externally.
                    </p>
                  </div>

                  {viewportEntries.length > 0 ? (
                    <div className="space-y-3 p-3 bg-ink-900/60 border border-line rounded-lg">
                      <div className="text-[10px] font-mono text-muted uppercase tracking-wider">
                        Selected Target Context
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-readable truncate pr-4 font-mono font-medium max-w-[180px]">
                          {selectedFilePath ? selectedFilePath.split(/[/\\]/).pop() : 'Active Log'}
                        </span>
                        <span className="text-muted shrink-0">
                          {viewportEntries.length} parsed lines loaded
                        </span>
                      </div>

                      <div className="flex gap-2 mt-2">
                        <Button
                          size="sm"
                          className="bg-accent text-accent-readable hover:bg-accent/90 text-xs py-1 h-8 flex-1"
                          onClick={() => handleRunAnalysis()}
                        >
                          <Play size={11} className="mr-1.5" />✨ Analyze Incident
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 border border-line/60 bg-ink-950/40 rounded-lg text-center text-muted">
                      <FileText size={20} className="mx-auto mb-2 text-ink-700" />
                      <span className="text-[11px] block">
                        Please open a log file in the workbench to analyze.
                      </span>
                    </div>
                  )}
                </div>

                {/* Semantic Search Helper */}
                <div className="border border-line bg-panel p-4 rounded-lg space-y-3">
                  <div className="flex items-center space-x-1.5 text-xs font-semibold text-readable">
                    <Search size={14} className="text-accent" />
                    <span>Interactive Semantic Search</span>
                  </div>
                  <p className="text-[11px] text-muted leading-normal">
                    Find log events containing relevant troubleshooting concepts, even with slight
                    text variations.
                  </p>

                  <form onSubmit={handleSemanticSearch} className="flex gap-2">
                    <input
                      value={semanticQuery}
                      onChange={(e) => setSemanticQuery(e.target.value)}
                      placeholder="e.g. payment failure gateway loop"
                      disabled={!selectedFilePath}
                      className="flex-1 h-8 bg-ink-900 border border-line rounded px-2 text-xs text-readable placeholder:text-subtle focus:border-accent outline-none"
                    />
                    <Button
                      type="submit"
                      size="sm"
                      disabled={!selectedFilePath || !semanticQuery.trim()}
                      className="h-8 text-xs shrink-0"
                    >
                      Find
                    </Button>
                  </form>

                  {/* Semantic search match highlights */}
                  {semanticMatches.length > 0 && (
                    <div className="mt-3 space-y-1 max-h-32 overflow-y-auto pr-1">
                      <div className="text-[9px] uppercase tracking-wider font-semibold text-muted mb-1">
                        Semantic Matches:
                      </div>
                      {semanticMatches.map((match) => (
                        <button
                          key={match.id}
                          onClick={() => scrollToLineRowIndex(match.lineNumber - 1)}
                          className="w-full text-left font-mono text-[10px] p-1.5 bg-ink-900/40 border border-line hover:border-accent/40 rounded flex justify-between items-center transition cursor-pointer text-muted hover:text-readable"
                        >
                          <span className="truncate mr-4">{match.message || match.raw}</span>
                          <span className="text-[9px] font-semibold text-accent/80 shrink-0">
                            Row {match.lineNumber}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Similar Incidents Section when no activeResponse */}
              {similarIncidents && similarIncidents.length > 0 && (
                <div className="border border-line bg-panel p-4 rounded-lg space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
                  <div className="text-xs font-semibold text-readable flex items-center gap-1.5 border-b border-line/40 pb-2">
                    <Search size={14} className="text-accent animate-pulse" />
                    <span>Similar Historical Incidents Found ({similarIncidents.length})</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-48 overflow-y-auto pr-1">
                    {similarIncidents.map((inc) => (
                      <div
                        key={inc.id}
                        className="p-2.5 rounded border border-line bg-ink-900/30 text-[11px] leading-relaxed flex flex-col gap-1 hover:border-accent/30 transition-colors"
                      >
                        <div className="flex items-center justify-between font-mono text-[9px]">
                          <span className="font-semibold text-readable truncate mr-2">
                            {inc.title}
                          </span>
                          <span className="text-[9px] px-1 bg-accent-soft text-accent rounded border border-accent/25 shrink-0">
                            {(inc.confidence * 100).toFixed(0)}% Match
                          </span>
                        </div>
                        <p className="text-[10px] text-muted mt-0.5 font-normal">
                          {inc.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {!loading && !error && activeResponse && (
            <div className="space-y-4">
              {/* Confidence Badge & Executive Summary Tag */}
              <div className="flex items-center justify-between border-b border-line pb-2.5">
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold text-readable">
                    Incident Diagnosis Summary
                  </span>
                  <span
                    className={[
                      'px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border',
                      activeResponse.evidenceStrength === 'high'
                        ? 'bg-success-soft text-success border-success/30'
                        : activeResponse.evidenceStrength === 'medium'
                          ? 'bg-accent-soft text-accent border-accent/30'
                          : 'bg-danger-soft text-danger border-danger/30',
                    ].join(' ')}
                  >
                    {activeResponse.evidenceStrength} confidence
                  </span>
                </div>

                <div className="text-[10px] text-muted font-mono">
                  {new Date(activeResponse.createdAt).toLocaleTimeString()}
                </div>
              </div>

              {/* Formatted Summary Content */}
              <div className="prose-xs max-w-none text-readable font-sans">
                {renderMarkdown(activeResponse.summary)}
              </div>

              {/* Observed Facts */}
              {activeResponse.observedFacts.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted flex items-center gap-1.5 mt-2">
                    <CheckCircle2 size={11} className="text-success" />
                    Observed Telemetry Facts
                  </h4>
                  <div className="grid grid-cols-1 gap-1.5">
                    {activeResponse.observedFacts.map((fact, idx) => (
                      <div
                        key={idx}
                        className="p-2 border border-line bg-ink-900/30 rounded text-xs text-readable flex items-start gap-2"
                      >
                        <span className="text-success font-semibold shrink-0">✓</span>
                        <span>{fact}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Possible Correlations */}
              {activeResponse.possibleCorrelations.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted flex items-center gap-1.5 mt-2">
                    <HelpCircle size={11} className="text-accent" />
                    Possible Operational Correlations
                  </h4>
                  <div className="grid grid-cols-1 gap-1.5">
                    {activeResponse.possibleCorrelations.map((corr, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 border border-accent/25 bg-accent-soft/10 rounded text-xs text-readable flex items-start gap-2.5"
                      >
                        <span className="text-accent font-semibold shrink-0">✨</span>
                        <span>{corr}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Validation safety boundary warning if low evidence strength */}
              {activeResponse.evidenceStrength === 'low' && (
                <div className="p-3 border border-amber-500/20 bg-amber-500/5 rounded-lg flex items-start gap-2.5 text-amber-500 text-xs">
                  <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold block">
                      Safety Advisory: High Uncertainty Correlation
                    </span>
                    <span className="opacity-90 block mt-0.5">
                      No matching SLA rule violations or symptom profiles were found. Please verify
                      using raw logs.
                    </span>
                  </div>
                </div>
              )}

              {/* Chronological Ingestion & Orchestration Trace (Expandable) */}
              {preferences.showIngestionTrace && activeResponse.orchestrationTrace && (
                <div className="mt-4 border border-line/60 rounded overflow-hidden">
                  <button
                    onClick={() => setIsTraceExpanded(!isTraceExpanded)}
                    className="w-full flex items-center justify-between p-2.5 bg-ink-900 hover:bg-ink-900/80 text-[10px] font-mono font-semibold uppercase text-muted tracking-wider text-left outline-none cursor-pointer"
                  >
                    <span className="flex items-center gap-1.5">
                      <Terminal size={11} className="text-accent" />
                      Ingestion & Orchestration Trace Log (
                      {activeResponse.orchestrationTrace.length} entries)
                    </span>
                    {isTraceExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  </button>
                  {isTraceExpanded && (
                    <div className="p-3 bg-ink-950 font-mono text-[10px] text-muted space-y-1 border-t border-line/40 max-h-40 overflow-y-auto no-scrollbar">
                      {activeResponse.orchestrationTrace.map((tr, idx) => (
                        <div
                          key={idx}
                          className="leading-relaxed hover:text-readable transition-colors duration-100"
                        >
                          {tr}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Citations, Validation Grid, Metrics, Similar Incidents */}
        {activeResponse && (
          <div className="w-64 overflow-y-auto p-4 shrink-0 space-y-5 bg-ink-950/20 flex flex-col">
            {/* Validation Metrics Grid */}
            <div className="space-y-2">
              <span className="block text-[9px] font-bold uppercase tracking-wider text-muted">
                Validation Telemetry Metrics
              </span>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 border border-line bg-panel/40 rounded flex flex-col">
                  <span className="text-[10px] text-muted font-normal">Matched Logs</span>
                  <span className="text-xs font-bold text-readable font-mono">
                    {activeResponse.sourcesCount.logs}
                  </span>
                </div>
                <div className="p-2 border border-line bg-panel/40 rounded flex flex-col">
                  <span className="text-[10px] text-muted font-normal">SLA Violations</span>
                  <span className="text-xs font-bold text-accent font-mono">
                    {activeResponse.sourcesCount.rules}
                  </span>
                </div>
                <div className="p-2 border border-line bg-panel/40 rounded flex flex-col col-span-2">
                  <span className="text-[10px] text-muted font-normal">
                    Symptom Ingestion Matches
                  </span>
                  <span className="text-xs font-bold text-readable font-mono">
                    {activeResponse.sourcesCount.symptoms}
                  </span>
                </div>
              </div>
            </div>

            {/* Clickable Citations Coordinates */}
            {activeResponse.citations && activeResponse.citations.length > 0 && (
              <div className="space-y-2 flex-1 flex flex-col">
                <span className="block text-[9px] font-bold uppercase tracking-wider text-muted shrink-0">
                  Evidence Grounding Coordinates
                </span>
                <div className="space-y-1.5 overflow-y-auto flex-1 pr-0.5 max-h-56">
                  {activeResponse.citations.map((cite, index) => {
                    const logEntry = activeEvidencePack?.entries.find((e) => e.id === cite.id);
                    const hasCoords = !!logEntry;

                    return (
                      <div
                        key={index}
                        className={[
                          'p-2 rounded border border-line transition text-[11px] leading-relaxed flex flex-col gap-1',
                          hasCoords
                            ? 'bg-panel hover:border-accent/40 hover:bg-ink-900/30 font-normal'
                            : 'bg-ink-950/40 text-muted opacity-80 font-normal',
                        ].join(' ')}
                      >
                        <div className="flex items-center justify-between font-mono text-[10px]">
                          <span className="font-semibold text-readable truncate mr-2">
                            {cite.label}
                          </span>
                          <span className="uppercase text-[9px] px-1 bg-ink-900 rounded border border-line shrink-0">
                            {cite.kind}
                          </span>
                        </div>
                        {hasCoords && logEntry && (
                          <button
                            onClick={() => scrollToLineRowIndex(logEntry.lineNumber - 1)}
                            className="w-full text-left font-mono text-[9px] text-accent hover:text-accent-hover font-semibold mt-1 flex items-center gap-1 cursor-pointer outline-none"
                          >
                            <Terminal size={10} />
                            Jump to Row {logEntry.lineNumber}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Similar Incidents Section in Right Rail */}
            {similarIncidents && similarIncidents.length > 0 && (
              <div className="space-y-2 shrink-0 border-t border-line/40 pt-4">
                <span className="block text-[9px] font-bold uppercase tracking-wider text-muted">
                  🔍 Similar Incidents Found ({similarIncidents.length})
                </span>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-0.5">
                  {similarIncidents.map((inc) => (
                    <div
                      key={inc.id}
                      className="p-2 rounded border border-line bg-panel/30 text-[11px] leading-relaxed flex flex-col gap-1"
                    >
                      <div className="flex items-center justify-between font-mono text-[9px]">
                        <span className="font-semibold text-readable truncate mr-2">
                          {inc.title}
                        </span>
                        <span className="text-[9px] px-1 bg-accent-soft text-accent rounded border border-accent/25 shrink-0">
                          {(inc.confidence * 100).toFixed(0)}% Match
                        </span>
                      </div>
                      <p className="text-[10px] text-muted line-clamp-2 mt-0.5 font-normal">
                        {inc.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
