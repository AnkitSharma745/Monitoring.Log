import { useEffect, useState, useRef, type JSX, type ChangeEvent } from 'react';
import {
  BookOpen,
  Search,
  Plus,
  AlertTriangle,
  HelpCircle,
  FileText,
  Loader2,
  FileCode,
  CheckSquare,
  Square,
} from 'lucide-react';
import { useKnowledgeStore } from '@renderer/stores/knowledgeStore';
import { useViewerStore } from '@renderer/stores/viewerStore';
import { Button } from '@renderer/components/ui/Button';

type ActiveTab = 'troubleshooter' | 'rules' | 'library' | 'search';

export const KnowledgePanel = (): JSX.Element => {
  const selectedFilePath = useViewerStore((state) => state.selectedFilePath);
  const scrollToLineRowIndex = useViewerStore((state) => state.scrollToLineRowIndex);

  // Store bindings
  const ingestedDocuments = useKnowledgeStore((state) => state.ingestedDocuments);
  const troubleshooterMatches = useKnowledgeStore((state) => state.troubleshooterMatches);
  const queryResults = useKnowledgeStore((state) => state.queryResults);
  const loading = useKnowledgeStore((state) => state.loading);
  const activeSymptomMatch = useKnowledgeStore((state) => state.activeSymptomMatch);

  const ingestDocument = useKnowledgeStore((state) => state.ingestDocument);
  const queryKnowledge = useKnowledgeStore((state) => state.queryKnowledge);
  const fetchTroubleshooterMatches = useKnowledgeStore((state) => state.fetchTroubleshooterMatches);
  const setActiveSymptomMatch = useKnowledgeStore((state) => state.setActiveSymptomMatch);
  const clearSearch = useKnowledgeStore((state) => state.clearSearch);

  // Local state
  const [activeTab, setActiveTab] = useState<ActiveTab>('troubleshooter');
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importName, setImportName] = useState('');
  const [importContent, setImportContent] = useState('');
  const [quickSearchInput, setQuickSearchInput] = useState('');
  const [checkedChecklistItems, setCheckedChecklistItems] = useState<Record<string, boolean>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Poll troubleshooter matches when selected file changes
  useEffect(() => {
    if (selectedFilePath) {
      void fetchTroubleshooterMatches(selectedFilePath);
    }
  }, [selectedFilePath, ingestedDocuments, fetchTroubleshooterMatches]);

  const handleFileUpload = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      await ingestDocument(file.name, text, (file as any).path || file.name);
      setIsImportOpen(false);
      // Trigger a refresh of matches and queries
      if (selectedFilePath) {
        void fetchTroubleshooterMatches(selectedFilePath);
      }
    };
    reader.readAsText(file);
  };

  const handleManualIngest = async (): Promise<void> => {
    if (!importName.trim() || !importContent.trim()) return;
    await ingestDocument(importName.trim(), importContent.trim());
    setImportName('');
    setImportContent('');
    setIsImportOpen(false);
    if (selectedFilePath) {
      void fetchTroubleshooterMatches(selectedFilePath);
    }
  };

  const handleSearchChange = (val: string): void => {
    setQuickSearchInput(val);
    void queryKnowledge(val);
  };

  const toggleChecklistItem = (symptomId: string, itemIndex: number): void => {
    const key = `${symptomId}-${itemIndex}`;
    setCheckedChecklistItems((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  return (
    <div className="flex flex-col h-full bg-ink-950 text-subtle overflow-hidden">
      {/* Search and Navigation Tabs */}
      <div className="p-3 border-b border-line shrink-0 space-y-2.5">
        <div className="relative">
          <input
            type="text"
            placeholder="Search operational manual..."
            value={quickSearchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full text-[11px] bg-ink-900 border border-line rounded px-2.5 py-1.5 pl-8 text-readable placeholder:text-subtle focus:outline-none focus:border-accent"
          />
          <Search size={12} className="absolute left-2.5 top-2 text-subtle" />
          {quickSearchInput && (
            <button
              onClick={() => {
                setQuickSearchInput('');
                clearSearch();
              }}
              className="absolute right-2.5 top-1.5 text-[10px] text-subtle hover:text-readable"
            >
              Clear
            </button>
          )}
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-line">
          <button
            onClick={() => setActiveTab('troubleshooter')}
            className={`flex-1 text-center py-1.5 text-[10px] font-bold border-b-2 transition ${
              activeTab === 'troubleshooter'
                ? 'border-accent text-accent'
                : 'border-transparent text-subtle hover:text-readable'
            }`}
          >
            Troubleshoot
          </button>
          <button
            onClick={() => setActiveTab('rules')}
            className={`flex-1 text-center py-1.5 text-[10px] font-bold border-b-2 transition ${
              activeTab === 'rules'
                ? 'border-accent text-accent'
                : 'border-transparent text-subtle hover:text-readable'
            }`}
          >
            SLA & Rules
          </button>
          <button
            onClick={() => setActiveTab('library')}
            className={`flex-1 text-center py-1.5 text-[10px] font-bold border-b-2 transition ${
              activeTab === 'library'
                ? 'border-accent text-accent'
                : 'border-transparent text-subtle hover:text-readable'
            }`}
          >
            Library
          </button>
        </div>
      </div>

      {/* Main Panel Content Area */}
      <div className="flex-1 min-h-0 overflow-y-auto relative">
        {loading && (
          <div className="absolute inset-0 bg-ink-950/60 flex items-center justify-center z-30 backdrop-blur-sm">
            <Loader2 className="animate-spin text-accent" size={24} />
          </div>
        )}

        {/* DETERMINISTIC RAG SEARCH RESULTS OVERLAY */}
        {quickSearchInput.trim() !== '' && (
          <div className="p-3 space-y-3">
            <div className="text-[10px] font-bold text-subtle uppercase tracking-wider">
              Search Results ({queryResults.length})
            </div>
            {queryResults.length === 0 ? (
              <div className="text-xs text-subtle italic text-center py-8">
                No matching reference manual sections found for "{quickSearchInput}".
              </div>
            ) : (
              <div className="space-y-2">
                {queryResults.map((res, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 border border-line bg-ink-900/50 rounded-lg space-y-1.5 hover:border-accent/45 transition"
                  >
                    <div className="flex items-center justify-between text-[9px] text-subtle">
                      <span className="font-bold text-accent">{res.documentName}</span>
                      <span>Score: {res.score.toFixed(0)}</span>
                    </div>
                    <div className="text-[11px] font-bold text-readable">
                      {res.chunk.sectionTitle}
                    </div>
                    <div className="text-[10px] leading-relaxed text-subtle/85 whitespace-pre-wrap line-clamp-3">
                      {res.chunk.content}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 1: OPERATIONAL TROUBLESHOOTER */}
        {quickSearchInput.trim() === '' && activeTab === 'troubleshooter' && (
          <div className="p-3 space-y-4">
            <div className="text-[10px] font-bold text-subtle uppercase tracking-wider">
              Diagnostic Troubleshooter
            </div>

            {!selectedFilePath ? (
              <div className="text-xs text-subtle italic p-4 text-center bg-ink-900/30 rounded border border-line">
                Select a log file in the explorer to run active troubleshooter.
              </div>
            ) : troubleshooterMatches.length === 0 ? (
              <div className="text-xs text-subtle italic p-5 text-center bg-ink-900/30 rounded border border-line space-y-2">
                <HelpCircle size={20} className="mx-auto text-subtle" />
                <p>No documentation symptom matches detected in logs.</p>
                <p className="text-[10px]">Import a manual in the "Library" tab to add custom symptom signatures.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Symptom Cards */}
                <div className="space-y-2">
                  {troubleshooterMatches.map((match) => {
                    const isActive = activeSymptomMatch?.symptom.id === match.symptom.id;
                    return (
                      <div
                        key={match.symptom.id}
                        onClick={() => setActiveSymptomMatch(match)}
                        className={`p-2.5 border rounded-lg transition cursor-pointer select-none space-y-1.5 ${
                          isActive
                            ? 'border-accent bg-accent/5'
                            : 'border-line bg-ink-900/20 hover:border-line-hover'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-warning text-ink-950 flex items-center gap-1">
                            <AlertTriangle size={10} />
                            {(match.confidence * 100).toFixed(0)}% Match
                          </span>
                          <span className="text-[9px] text-subtle font-bold">
                            {match.matchedEntriesCount} lines matched
                          </span>
                        </div>
                        <div className="text-[11px] font-bold text-readable">
                          {match.symptom.name}
                        </div>
                        <div className="text-[10px] text-subtle leading-relaxed line-clamp-2">
                          {match.symptom.description}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Selected Symptom Details & Actionable Checklist */}
                {activeSymptomMatch && (
                  <div className="mt-4 p-3 bg-ink-900/40 border border-accent/20 rounded-lg space-y-3.5">
                    <div>
                      <div className="text-[10px] text-accent font-bold uppercase tracking-wider mb-1">
                        Selected Diagnostic Focus
                      </div>
                      <h4 className="text-xs font-bold text-readable">
                        {activeSymptomMatch.symptom.name}
                      </h4>
                      <p className="text-[10px] text-subtle leading-relaxed mt-1">
                        {activeSymptomMatch.symptom.description}
                      </p>
                    </div>

                    {/* Explainer */}
                    <div className="text-[9px] bg-ink-950 p-2 rounded border border-line text-subtle space-y-1">
                      <span className="font-bold text-readable">Symptom signature criteria:</span>
                      <p>Requires all keywords: [{activeSymptomMatch.symptom.symptomPatterns.map(p => `"${p}"`).join(', ')}]</p>
                    </div>

                    {/* Checklist */}
                    {activeSymptomMatch.symptom.checklist && activeSymptomMatch.symptom.checklist.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-[9px] font-bold text-readable flex items-center gap-1.5">
                          <CheckSquare size={12} className="text-accent" />
                          Investigation Verification Checklist
                        </div>
                        <div className="space-y-1">
                          {activeSymptomMatch.symptom.checklist.map((item, idx) => {
                            const isChecked = !!checkedChecklistItems[`${activeSymptomMatch.symptom.id}-${idx}`];
                            return (
                              <div
                                key={idx}
                                onClick={() => toggleChecklistItem(activeSymptomMatch.symptom.id, idx)}
                                className="flex items-start gap-2 p-1.5 bg-ink-950/40 rounded hover:bg-ink-950 transition cursor-pointer select-none text-[10px]"
                              >
                                {isChecked ? (
                                  <CheckSquare size={12} className="text-accent shrink-0 mt-0.5" />
                                ) : (
                                  <Square size={12} className="text-subtle shrink-0 mt-0.5" />
                                )}
                                <span className={isChecked ? 'text-subtle/40 line-through' : 'text-readable'}>
                                  {item}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Resolution */}
                    <div>
                      <div className="text-[9px] font-bold text-accent uppercase tracking-wider mb-1">
                        Known Manual Resolution
                      </div>
                      <div className="text-[10px] leading-relaxed text-readable bg-ink-950/60 p-2 rounded border border-line">
                        {activeSymptomMatch.symptom.knownResolution}
                      </div>
                    </div>

                    {/* Evidence Coordinates */}
                    <div className="space-y-1.5">
                      <div className="text-[9px] font-bold text-subtle uppercase tracking-wider">
                        Offending Evidence Coordinates (Click to Jump)
                      </div>
                      <div className="max-h-36 overflow-y-auto space-y-1 bg-ink-950 p-1.5 rounded border border-line">
                        {activeSymptomMatch.evidenceLinks.map((link, idx) => (
                          <div
                            key={idx}
                            onClick={() => scrollToLineRowIndex(link.lineNumber - 1)}
                            className="p-1.5 bg-ink-900/30 hover:bg-accent/10 border border-line rounded flex items-center justify-between cursor-pointer transition text-[9px]"
                          >
                            <span className="font-bold text-accent">Row {link.lineNumber}</span>
                            <span className="text-subtle text-right truncate pl-4 max-w-40">
                              {link.message}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: AUDIT & RULES COMPLIANCE */}
        {quickSearchInput.trim() === '' && activeTab === 'rules' && (
          <div className="p-3 space-y-4">
            <div className="text-[10px] font-bold text-subtle uppercase tracking-wider">
              Operational Compliance Rule Engine
            </div>

            {!selectedFilePath ? (
              <div className="text-xs text-subtle italic p-4 text-center bg-ink-900/30 rounded border border-line">
                Select a log file to audit rule compliance.
              </div>
            ) : troubleshooterMatches.length === 0 && ingestedDocuments.flatMap(d => d.rules).length === 0 ? (
              <div className="space-y-3">
                <div className="text-[10px] text-accent font-bold uppercase tracking-wider">
                  Baseline Rules ({4})
                </div>
                <div className="text-xs text-subtle italic p-4 bg-ink-900/20 rounded border border-line">
                  Baseline rule validation is updated inside the primary 'Investigations' panel under the 'Rules' tab. Custom rules declared in manuals will be active here once manuals are imported.
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-[10px] text-accent font-bold uppercase tracking-wider">
                  Ingested Knowledge Rules ({ingestedDocuments.flatMap(d => d.rules).length})
                </div>
                
                <div className="space-y-2">
                  {ingestedDocuments.flatMap(d => d.rules).map((rule, idx) => {
                    // Gather matches of the custom rules
                    // Standard matching in front-end for quick display status
                    const allLogs = useViewerStore.getState().viewportEntriesByPath[selectedFilePath] || [];
                    const matches = allLogs.filter(e => {
                      const msg = (e.message || e.raw || '').toLowerCase();
                      return msg.includes(rule.pattern.toLowerCase());
                    });
                    const violations = matches.filter(e => e.severity === 'error' || /fail|error|timeout|crash/i.test(e.message || ''));
                    const status = matches.length === 0 ? 'unknown' : violations.length > 0 ? 'violation' : 'passed';

                    const statusBadge =
                      status === 'passed' ? (
                        <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-emerald-500/25 text-emerald-400 border border-emerald-500/30">PASS</span>
                      ) : status === 'violation' ? (
                        <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-rose-500/25 text-rose-400 border border-rose-500/30">VIOLATION</span>
                      ) : (
                        <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-ink-800 text-subtle border border-line">NEUTRAL</span>
                      );

                    return (
                      <div
                        key={idx}
                        className={`p-2.5 border rounded-lg bg-ink-900/20 space-y-1.5 transition ${
                          status === 'violation' ? 'border-rose-500/20 bg-rose-950/5' : 'border-line'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-bold text-accent uppercase">{rule.category}</span>
                          {statusBadge}
                        </div>
                        <div className="text-[11px] font-bold text-readable">{rule.name}</div>
                        <div className="text-[10px] text-subtle leading-relaxed bg-ink-950 p-2 rounded border border-line">
                          <span className="font-bold text-readable">Expected: </span>
                          {rule.expectedBehavior}
                        </div>

                        {status !== 'unknown' && (
                          <div className="text-[9px] text-subtle space-y-1">
                            <p>Matches: {matches.length} lines. Pattern: "{rule.pattern}"</p>
                            {status === 'violation' && (
                              <div className="mt-1 space-y-1">
                                <span className="font-bold text-rose-400">Offending log lines:</span>
                                <div className="max-h-24 overflow-y-auto space-y-1">
                                  {violations.slice(0, 5).map((e, vIdx) => (
                                    <div
                                      key={vIdx}
                                      onClick={() => scrollToLineRowIndex(e.lineNumber - 1)}
                                      className="p-1 bg-rose-950/20 hover:bg-rose-950/40 border border-rose-500/20 rounded cursor-pointer text-[8px] text-readable flex items-center justify-between"
                                    >
                                      <span>Row {e.lineNumber}</span>
                                      <span className="truncate pl-3 max-w-44">{e.message}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: REFERENCE LIBRARY & INGESTION */}
        {quickSearchInput.trim() === '' && activeTab === 'library' && (
          <div className="p-3 space-y-4">
            {/* Action Bar */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-subtle uppercase tracking-wider">
                Reference Manual Library
              </span>
              <Button
                size="sm"
                onClick={() => setIsImportOpen(!isImportOpen)}
                className="h-6 px-2 text-[10px]"
              >
                <Plus size={10} className="mr-1" />
                Ingest manual
              </Button>
            </div>

            {/* Ingestion Panel Modal/Form */}
            {isImportOpen && (
              <div className="p-3 bg-ink-900 border border-accent/30 rounded-lg space-y-3 shadow-lg">
                <h4 className="text-xs font-bold text-readable">Import New Document</h4>
                
                <div className="space-y-2">
                  {/* Select file */}
                  <div>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="w-full h-8 text-[11px]"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <FileText size={12} className="mr-1.5 text-accent" />
                      Select Markdown / TXT / JSON File...
                    </Button>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      accept=".md,.txt,.json"
                      className="hidden"
                    />
                  </div>

                  <div className="text-center text-[9px] text-subtle font-bold py-1">OR ENTER MANUALLY</div>

                  {/* Manual Title */}
                  <input
                    type="text"
                    placeholder="Document Name (e.g. printer_guide.md)"
                    value={importName}
                    onChange={(e) => setImportName(e.target.value)}
                    className="w-full text-[11px] bg-ink-950 border border-line rounded px-2.5 py-1.5 text-readable focus:outline-none focus:border-accent"
                  />

                  {/* Manual Content */}
                  <textarea
                    placeholder="Paste markdown content here... (e.g. troubleshooting checklist, dynamic rules etc.)"
                    rows={6}
                    value={importContent}
                    onChange={(e) => setImportContent(e.target.value)}
                    className="w-full text-[10px] bg-ink-950 border border-line rounded px-2.5 py-1.5 text-readable font-mono focus:outline-none focus:border-accent"
                  />

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="flex-1 h-8 text-[11px]"
                      onClick={() => setIsImportOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 h-8 text-[11px]"
                      onClick={handleManualIngest}
                      disabled={!importName.trim() || !importContent.trim()}
                    >
                      Ingest Document
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Document Library List */}
            {ingestedDocuments.length === 0 ? (
              <div className="text-xs text-subtle italic p-5 text-center bg-ink-900/30 rounded border border-line space-y-2">
                <BookOpen size={20} className="mx-auto text-subtle" />
                <p>No operational manuals imported.</p>
                <p className="text-[9px]">Import guides or rule configurations to unlock the automated diagnostics engine.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {ingestedDocuments.map((doc) => (
                  <div
                    key={doc.id}
                    className="p-3 border border-line bg-ink-900/25 rounded-lg space-y-2 hover:border-line-hover transition"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <FileCode size={14} className="text-accent shrink-0" />
                        <span className="text-xs font-bold text-readable truncate">{doc.name}</span>
                      </div>
                      <span className="text-[8px] font-bold text-subtle px-1 rounded bg-ink-900 border border-line shrink-0">
                        {doc.fileType.toUpperCase()}
                      </span>
                    </div>

                    {/* Metadata tags */}
                    <div className="flex flex-wrap gap-1 text-[8px]">
                      <span className="px-1.5 py-0.5 rounded bg-ink-900 border border-line">
                        {doc.chunks.length} Section Chunks
                      </span>
                      {doc.rules.length > 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                          {doc.rules.length} Dynamic Rules
                        </span>
                      )}
                      {doc.symptoms.length > 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-warning/10 text-warning border border-warning/20">
                          {doc.symptoms.length} Symptoms
                        </span>
                      )}
                    </div>

                    {/* Key terms extracted */}
                    {doc.extractedKeywords.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-[8px] font-bold text-subtle uppercase">Extracted Entities & Keywords</div>
                        <div className="flex flex-wrap gap-1">
                          {doc.extractedKeywords.slice(0, 6).map((kw, kwIdx) => (
                            <span key={kwIdx} className="text-[8px] px-1 bg-ink-950/80 rounded border border-line text-subtle/80">
                              {kw}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
