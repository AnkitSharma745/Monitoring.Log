import type {
  IngestedDocument,
  DocumentChunk,
  ExtractedRule,
  TroubleshootingSymptom,
  KnowledgeQueryResult,
  TroubleshooterMatch,
} from '@shared/contracts/knowledge';
import type { StructuredLogEntry } from '@shared/contracts/logs';

export class DocumentEngine {
  /**
   * Parse a raw document (Markdown, plain text, or JSON) into structured chunks,
   * extracting metadata, keywords, rules, and troubleshooting symptoms.
   */
  public static ingestDocument(name: string, content: string, filePath?: string): IngestedDocument {
    const id = `doc-${crypto.randomUUID()}`;
    const fileType = this.detectFileType(name, content);
    const ingestedAt = new Date().toISOString();

    const chunks: DocumentChunk[] = [];
    const rules: ExtractedRule[] = [];
    const symptoms: TroubleshootingSymptom[] = [];

    if (fileType === 'json') {
      try {
        const parsed = JSON.parse(content);
        // Handle structured JSON input
        if (parsed.rules && Array.isArray(parsed.rules)) {
          rules.push(...parsed.rules);
        }
        if (parsed.symptoms && Array.isArray(parsed.symptoms)) {
          symptoms.push(...parsed.symptoms);
        }
        if (parsed.chunks && Array.isArray(parsed.chunks)) {
          chunks.push(
            ...parsed.chunks.map((c: { sectionTitle?: string; content?: string }, index: number) => ({
              id: `${id}-chunk-${index}`,
              documentId: id,
              sectionTitle: c.sectionTitle || 'Section',
              content: c.content || '',
              keywords: this.extractKeywords(c.content || ''),
            })),
          );
        } else {
          // Chunk the JSON content itself
          chunks.push({
            id: `${id}-chunk-0`,
            documentId: id,
            sectionTitle: 'Structured JSON Document',
            content: typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2),
            keywords: this.extractKeywords(content),
          });
        }
      } catch {
        // Fallback to text chunking if JSON is invalid
        this.chunkTextContent(id, content, chunks);
      }
    } else {
      // Markdown / Text parsing
      this.parseMarkdownAndText(id, content, chunks, rules, symptoms);
    }

    // Extract global keywords and entities
    const allText = chunks.map((c) => c.content).join(' ');
    const extractedKeywords = this.extractKeywords(allText).slice(0, 30);
    const extractedEntities = this.extractEntities(allText);

    const doc: IngestedDocument = {
      id,
      name,
      content,
      fileType,
      ingestedAt,
      chunks,
      extractedKeywords,
      extractedEntities,
      rules,
      symptoms,
    };

    if (filePath !== undefined) {
      doc.filePath = filePath;
    }

    return doc;
  }

  /**
   * Helper to detect file type based on extension or signature
   */
  private static detectFileType(name: string, content: string): 'markdown' | 'text' | 'json' {
    const lowerName = name.toLowerCase();
    if (
      lowerName.endsWith('.json') ||
      (content.trim().startsWith('{') && content.trim().endsWith('}'))
    ) {
      return 'json';
    }
    if (lowerName.endsWith('.md') || content.includes('# ') || content.includes('## ')) {
      return 'markdown';
    }
    return 'text';
  }

  /**
   * Chunk text/markdown documents and extract embedded rules/symptoms
   */
  private static parseMarkdownAndText(
    documentId: string,
    content: string,
    chunks: DocumentChunk[],
    rules: ExtractedRule[],
    symptoms: TroubleshootingSymptom[],
  ): void {
    // 1. First, search for JSON blocks embedded in markdown that define rules/symptoms
    const jsonCodeBlockRegex = /```json\s*([\s\S]*?)\s*```/g;
    let match;
    while ((match = jsonCodeBlockRegex.exec(content)) !== null) {
      try {
        const rawJson = match[1]?.trim();
        if (rawJson) {
          const parsed = JSON.parse(rawJson);
          if (parsed.type === 'rule' || parsed.ruleId) {
            rules.push({
              ruleId: parsed.ruleId || `dynamic-rule-${crypto.randomUUID()}`,
              name: parsed.name || 'Custom Dynamic Rule',
              category: parsed.category || 'system',
              pattern: parsed.pattern || '',
              expectedBehavior: parsed.expectedBehavior || '',
              severity: parsed.severity || 'warn',
              customValidatorCode: parsed.customValidatorCode,
            });
          } else if (parsed.type === 'symptom' || parsed.symptomPatterns) {
            symptoms.push({
              id: parsed.id || `dynamic-symptom-${crypto.randomUUID()}`,
              name: parsed.name || 'Custom Dynamic Symptom',
              description: parsed.description || '',
              symptomPatterns: Array.isArray(parsed.symptomPatterns)
                ? parsed.symptomPatterns
                : [parsed.symptomPatterns || ''],
              checklist: Array.isArray(parsed.checklist) ? parsed.checklist : [],
              knownResolution: parsed.knownResolution || '',
              documentationLink: parsed.documentationLink,
            });
          }
        }
      } catch {
        // Skip malformed code block JSONs
      }
    }

    // 2. Also support inline block annotations like [RULE: ...] or [SYMPTOM: ...]
    const ruleAnnotationRegex =
      /\[RULE:\s*id="([^"]+)"\s*name="([^"]+)"\s*category="([^"]+)"\s*pattern="([^"]+)"\s*expected="([^"]+)"(?:\s*severity="([^"]+)")?\]/g;
    while ((match = ruleAnnotationRegex.exec(content)) !== null) {
      rules.push({
        ruleId: match[1]!,
        name: match[2]!,
        category: (match[3] || 'system') as 'payment' | 'hardware' | 'network' | 'system',
        pattern: match[4]!,
        expectedBehavior: match[5]!,
        severity: (match[6] || 'warn') as 'error' | 'warn',
      });
    }

    const symptomAnnotationRegex =
      /\[SYMPTOM:\s*id="([^"]+)"\s*name="([^"]+)"\s*pattern="([^"]+)"\s*resolution="([^"]+)"\s*checklist="([^"]+)"\]/g;
    while ((match = symptomAnnotationRegex.exec(content)) !== null) {
      symptoms.push({
        id: match[1]!,
        name: match[2]!,
        description: match[2]!,
        symptomPatterns: match[3]!.split('|'),
        knownResolution: match[4]!,
        checklist: match[5]!.split(','),
      });
    }

    // 3. Perform Section Chunking based on Markdown Headers (#, ##, ###)
    const lines = content.split('\n');
    let currentHeader = 'Introduction';
    let currentChunkLines: string[] = [];
    let chunkCount = 0;

    for (const line of lines) {
      const headerMatch = line.match(/^(#{1,6})\s+(.*)$/);
      if (headerMatch) {
        // Save previous chunk if not empty
        if (currentChunkLines.length > 0) {
          const chunkText = currentChunkLines.join('\n').trim();
          if (chunkText) {
            chunks.push({
              id: `${documentId}-chunk-${chunkCount++}`,
              documentId,
              sectionTitle: currentHeader,
              content: chunkText,
              keywords: this.extractKeywords(chunkText),
            });
          }
          currentChunkLines = [];
        }
        currentHeader = headerMatch[2]!.trim();
      } else {
        currentChunkLines.push(line);
      }
    }

    // Save final chunk
    if (currentChunkLines.length > 0) {
      const chunkText = currentChunkLines.join('\n').trim();
      if (chunkText) {
        chunks.push({
          id: `${documentId}-chunk-${chunkCount++}`,
          documentId,
          sectionTitle: currentHeader,
          content: chunkText,
          keywords: this.extractKeywords(chunkText),
        });
      }
    }

    // If no header chunks were created, fallback to normal line-based chunking
    if (chunks.length === 0) {
      this.chunkTextContent(documentId, content, chunks);
    }
  }

  /**
   * Split plain text into sizing chunks (e.g. 800 chars) with 150 char overlaps
   */
  private static chunkTextContent(
    documentId: string,
    content: string,
    chunks: DocumentChunk[],
  ): void {
    const chunkSize = 800;
    const overlap = 150;
    let index = 0;
    let chunkCount = 0;

    while (index < content.length) {
      const chunkText = content.substring(index, index + chunkSize).trim();
      if (chunkText) {
        chunks.push({
          id: `${documentId}-chunk-${chunkCount++}`,
          documentId,
          sectionTitle: `Section ${chunkCount}`,
          content: chunkText,
          keywords: this.extractKeywords(chunkText),
        });
      }
      index += chunkSize - overlap;
    }
  }

  /**
   * Extract keywords from text based on frequency and word filters
   */
  public static extractKeywords(text: string): string[] {
    const cleanText = text
      .toLowerCase()
      .replace(/[^\w\s-]/g, ' ')
      .replace(/\s+/g, ' ');

    const words = cleanText.split(' ');
    const stopWords = new Set([
      'the',
      'a',
      'an',
      'and',
      'or',
      'but',
      'is',
      'are',
      'was',
      'were',
      'to',
      'of',
      'in',
      'on',
      'at',
      'by',
      'for',
      'with',
      'about',
      'against',
      'between',
      'into',
      'through',
      'during',
      'before',
      'after',
      'above',
      'below',
      'from',
      'up',
      'down',
      'out',
      'off',
      'over',
      'under',
      'again',
      'further',
      'then',
      'once',
      'here',
      'there',
      'when',
      'where',
      'why',
      'how',
      'all',
      'any',
      'both',
      'each',
      'few',
      'more',
      'most',
      'other',
      'some',
      'such',
      'no',
      'nor',
      'not',
      'only',
      'own',
      'same',
      'so',
      'than',
      'too',
      'very',
      's',
      't',
      'can',
      'will',
      'just',
      'should',
      'now',
      'we',
      'they',
      'our',
      'this',
      'that',
      'these',
      'those',
      'it',
      'its',
      'you',
      'your',
      'he',
      'she',
      'his',
      'her',
      'them',
      'their',
    ]);

    const wordCounts: Record<string, number> = {};
    for (const w of words) {
      const word = w.trim();
      if (word.length > 2 && !stopWords.has(word) && !/^\d+$/.test(word)) {
        wordCounts[word] = (wordCounts[word] || 0) + 1;
      }
    }

    return Object.entries(wordCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([word]) => word);
  }

  /**
   * Simple entity extractor identifying standard operational elements like
   * Peripheral names, Kiosk IDs, payment gateways, and error patterns
   */
  public static extractEntities(text: string): Array<{ name: string; type: string }> {
    const entities: Array<{ name: string; type: string }> = [];
    const lowercase = text.toLowerCase();

    // Peripherals
    const peripherals = [
      'printer',
      'scanner',
      'bill acceptor',
      'card reader',
      'cashless terminal',
      'usb device',
      'serial port',
      'com port',
    ];
    for (const p of peripherals) {
      if (lowercase.includes(p)) {
        entities.push({ name: p.charAt(0).toUpperCase() + p.slice(1), type: 'peripheral' });
      }
    }

    // Payment systems
    const paymentEntities = [
      'merchant gateway',
      'stripe',
      'cashless',
      'pos terminal',
      'checkout flow',
      'credit card',
      'emv reader',
    ];
    for (const p of paymentEntities) {
      if (lowercase.includes(p)) {
        entities.push({ name: p.toUpperCase(), type: 'payment_system' });
      }
    }

    // State machine concepts
    const lifecycle = [
      'watchdog',
      'heartbeat',
      'boot',
      'ready state',
      'reset sequence',
      'power cycle',
    ];
    for (const l of lifecycle) {
      if (lowercase.includes(l)) {
        entities.push({
          name: l.charAt(0).toUpperCase() + l.slice(1),
          type: 'operational_lifecycle',
        });
      }
    }

    // De-duplicate
    const seen = new Set<string>();
    return entities.filter((e) => {
      const key = `${e.name}:${e.type}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Perform TF-IDF style keyword search across ingested documents chunks
   */
  public static searchKnowledgeBase(
    documents: IngestedDocument[],
    query: string,
  ): KnowledgeQueryResult[] {
    const queryKeywords = this.extractKeywords(query);
    if (queryKeywords.length === 0) {
      // Fallback: match simple substring of the query
      queryKeywords.push(
        ...query
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > 1),
      );
    }

    const results: KnowledgeQueryResult[] = [];

    for (const doc of documents) {
      for (const chunk of doc.chunks) {
        let score = 0;
        const chunkLower = chunk.content.toLowerCase();

        // 1. Keyword overlap scoring
        for (const word of queryKeywords) {
          const occurrences = (chunkLower.match(new RegExp(this.escapeRegExp(word), 'g')) || [])
            .length;
          if (occurrences > 0) {
            // Give higher weight if the word is in the section title
            const titleBoost = chunk.sectionTitle.toLowerCase().includes(word) ? 3 : 1;
            score += occurrences * titleBoost;
          }
        }

        // 2. Substring match bonus
        if (chunkLower.includes(query.toLowerCase())) {
          score += 15;
        }

        if (score > 0) {
          results.push({
            chunk,
            documentName: doc.name,
            score,
          });
        }
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, 10);
  }

  /**
   * Correlate log entries with loaded troubleshooting symptoms, extracting
   * matches, checklists, and coordinates of raw evidence
   */
  public static matchTroubleshootingSymptoms(
    entries: StructuredLogEntry[],
    symptoms: TroubleshootingSymptom[],
  ): TroubleshooterMatch[] {
    const matches: TroubleshooterMatch[] = [];

    for (const symptom of symptoms) {
      const evidenceLinks: Array<{ entryId: string; lineNumber: number; message: string }> = [];

      // Filter entries matching ANY of the symptom patterns
      for (const entry of entries) {
        const msg = (entry.message || entry.raw || '').toLowerCase();

        const isMatch = symptom.symptomPatterns.every((pattern) => {
          // If pattern starts with regex symbols or slash, handle it, or standard substring
          const cleanPattern = pattern.trim().toLowerCase();
          return msg.includes(cleanPattern);
        });

        if (isMatch && symptom.symptomPatterns.length > 0) {
          evidenceLinks.push({
            entryId: entry.id,
            lineNumber: entry.lineNumber,
            message: entry.message || entry.raw || 'Symptom Indicator',
          });
        }
      }

      if (evidenceLinks.length > 0) {
        // Calculate matching confidence based on number of matches and patterns matching
        const confidence = Math.min(0.5 + evidenceLinks.length * 0.05, 0.98);

        matches.push({
          symptom: {
            ...symptom,
            matchedLogsCount: evidenceLinks.length,
            matchedLogEntryIds: evidenceLinks.map((e) => e.entryId),
            matchedLogLines: evidenceLinks.map((e) => e.lineNumber),
          },
          confidence,
          matchedEntriesCount: evidenceLinks.length,
          evidenceLinks: evidenceLinks.slice(0, 15), // Cap matching evidence links
        });
      }
    }

    return matches.sort((a, b) => b.confidence - a.confidence);
  }

  private static escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
