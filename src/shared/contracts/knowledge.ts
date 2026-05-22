export interface DocumentChunk {
  id: string;
  documentId: string;
  sectionTitle: string;
  content: string;
  keywords: string[];
}

export interface ExtractedRule {
  ruleId: string;
  name: string;
  category: 'payment' | 'hardware' | 'network' | 'system';
  pattern: string; // keyword or regex to identify relevant log lines
  expectedBehavior: string;
  severity: 'error' | 'warn';
  customValidatorCode?: string; // in case we want to support dynamic evaluations
}

export interface TroubleshootingSymptom {
  id: string;
  name: string;
  description: string;
  symptomPatterns: string[]; // List of strings/keywords to search in logs
  checklist: string[];
  knownResolution: string;
  documentationLink?: string;
  matchedLogsCount?: number;
  matchedLogEntryIds?: string[]; // IDs of logs matching the symptom
  matchedLogLines?: number[]; // line numbers of logs matching the symptom
}

export interface IngestedDocument {
  id: string;
  name: string;
  filePath?: string;
  content: string;
  fileType: 'markdown' | 'text' | 'json';
  ingestedAt: string;
  chunks: DocumentChunk[];
  extractedKeywords: string[];
  extractedEntities: Array<{ name: string; type: string }>;
  rules: ExtractedRule[];
  symptoms: TroubleshootingSymptom[];
}

export interface TroubleshooterMatch {
  symptom: TroubleshootingSymptom;
  confidence: number; // 0 to 1
  matchedEntriesCount: number;
  evidenceLinks: Array<{ entryId: string; lineNumber: number; message: string }>;
}

export interface KnowledgeQueryResult {
  chunk: DocumentChunk;
  documentName: string;
  score: number;
}
