import type { LogSeverity } from '@shared/contracts/logs';

export interface ParserRuleSet {
  severityPatterns: Array<{
    severity: LogSeverity;
    pattern: RegExp;
  }>;
  timestampPatterns: RegExp[];
  sourcePatterns: RegExp[];
  correlationIdPatterns: RegExp[];
  paymentIdPatterns: RegExp[];
  sessionIdPatterns: RegExp[];
  hardwareIdPatterns: RegExp[];
}

export const defaultParserRules: ParserRuleSet = {
  severityPatterns: [
    { severity: 'error', pattern: /(^|\s|\[)(error|err|fatal|exception|panic)(\]|\s|:|-|$)/i },
    { severity: 'warn', pattern: /(^|\s|\[)(warn|warning)(\]|\s|:|-|$)/i },
    { severity: 'info', pattern: /(^|\s|\[)(info|notice)(\]|\s|:|-|$)/i },
    { severity: 'debug', pattern: /(^|\s|\[)(debug|trace|verbose)(\]|\s|:|-|$)/i },
  ],
  timestampPatterns: [
    /^\s*(?<timestamp>\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)/,
    /^\s*\[(?<timestamp>\d{4}-\d{2}-\d{2}[^\]]+)\]/,
    /^\s*(?<timestamp>\d{2}:\d{2}:\d{2}(?:\.\d+)?)/,
  ],
  sourcePatterns: [
    /\[(?<source>[A-Za-z][A-Za-z0-9_.:-]{1,48})\]/,
    /\bsource=(?<source>[A-Za-z0-9_.:-]+)/i,
    /\bmodule=(?<source>[A-Za-z0-9_.:-]+)/i,
  ],
  correlationIdPatterns: [
    /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g,
    /\b(?:correlation_?id|corr_?id|req_?id|request_?id|trace_?id|span_?id)[:=]\s*(?<id>[a-zA-Z0-9_-]+)/gi,
  ],
  paymentIdPatterns: [
    /\b(?:transaction_?id|tx_?id|order_?id|payment_?id|txn_?id)[:=]\s*(?<id>[a-zA-Z0-9_-]+)/gi,
    /\b(?:tx|txn|order|pay)_[a-zA-Z0-9_-]{6,}\b/gi,
  ],
  sessionIdPatterns: [
    /\b(?:session_?id|kiosk_?session|sess_?id)[:=]\s*(?<id>[a-zA-Z0-9_-]+)/gi,
    /\b(?:session|sess)_[a-zA-Z0-9_-]{8,}\b/gi,
  ],
  hardwareIdPatterns: [
    /\bCOM\d+\b/gi,
    /\b(?:USB\d+|PrinterPort|LPT\d+)\b/gi,
    /\b(?:pinpad|card_?reader|bill_?acceptor|coin_?acceptor|cash_?drawer|receipt_?printer|scanner|barcode_?reader)\b/gi,
  ],
};
