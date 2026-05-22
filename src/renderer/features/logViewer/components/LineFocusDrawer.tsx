import {
  ChevronDown,
  ChevronRight,
  Copy,
  X,
  ArrowUpRight,
  Check,
  CornerDownRight,
} from 'lucide-react';
import React, { useState, useMemo } from 'react';
import { useSearchStore } from '@renderer/stores/searchStore';
import { useSettingsStore } from '@renderer/stores/settingsStore';
import { useViewerStore } from '@renderer/stores/viewerStore';

interface JsonTreeProps {
  data: any;
  label?: string;
  depth?: number;
}

export const JsonTree = ({ data, label, depth = 0 }: JsonTreeProps): React.JSX.Element => {
  const [isExpanded, setIsExpanded] = useState(depth < 2);

  const isObject = data !== null && typeof data === 'object';
  const indentClass = depth > 0 ? 'ml-3' : '';

  if (!isObject) {
    let valueStr = '';
    let valClass = '';

    if (typeof data === 'string') {
      valueStr = `"${data}"`;
      valClass = 'text-emerald-400';
    } else if (typeof data === 'number') {
      valueStr = String(data);
      valClass = 'text-cyan-400 font-bold';
    } else if (typeof data === 'boolean') {
      valueStr = String(data);
      valClass = 'text-amber-400 font-bold';
    } else if (data === null) {
      valueStr = 'null';
      valClass = 'text-rose-400 italic';
    } else {
      valueStr = String(data);
      valClass = 'text-subtle';
    }

    return (
      <div
        className={`flex items-start gap-1 py-0.5 text-[10px] font-mono leading-relaxed ${indentClass}`}
      >
        {label && (
          <span className="text-accent/90 font-semibold shrink-0 select-none">{label}:</span>
        )}
        <span className={`${valClass} break-all whitespace-pre-wrap`}>{valueStr}</span>
      </div>
    );
  }

  const isArray = Array.isArray(data);
  const keys = Object.keys(data);
  const size = keys.length;

  if (size === 0) {
    return (
      <div
        className={`flex items-center gap-1 py-0.5 text-[10px] font-mono leading-relaxed ${indentClass}`}
      >
        {label && (
          <span className="text-accent/90 font-semibold shrink-0 select-none">{label}:</span>
        )}
        <span className="text-subtle">{isArray ? '[]' : '{}'}</span>
      </div>
    );
  }

  return (
    <div className={`flex flex-col py-0.5 ${indentClass}`}>
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-1 cursor-pointer select-none hover:bg-ink-800/40 rounded px-1 -ml-1 text-[10px] font-mono leading-relaxed"
      >
        <span className="text-subtle shrink-0">
          {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        </span>
        {label && (
          <span className="text-accent/90 font-semibold shrink-0 select-none">{label}:</span>
        )}
        <span className="text-subtle">{isArray ? `Array(${size})` : `Object {${size} keys}`}</span>
      </div>

      {isExpanded && (
        <div className="pl-2 border-l border-line/30 ml-1.5 mt-0.5 space-y-0.5">
          {keys.map((key) => (
            <JsonTree key={key} data={data[key]} label={key} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
};

export const LineFocusDrawer = (): React.JSX.Element | null => {
  const selectedLineEntry = useViewerStore((state) => state.selectedLineEntry);
  const setSelectedLineEntry = useViewerStore((state) => state.setSelectedLineEntry);

  const setIncludeFilter = useSettingsStore((state) => state.setIncludeFilter);
  const setSearchQuery = useSearchStore((state) => state.setSearchQuery);

  const [copied, setCopied] = useState(false);
  const correlationId = selectedLineEntry?.correlationIds?.[0] || null;

  // Handle keyboard shortcut Esc to close drawer
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedLineEntry) {
        setSelectedLineEntry(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedLineEntry, setSelectedLineEntry]);

  const rawJson = useMemo(() => {
    if (!selectedLineEntry?.message) return null;
    try {
      // Find JSON block inside message or check if the whole message is JSON
      const text = selectedLineEntry.message.trim();
      if (
        (text.startsWith('{') && text.endsWith('}')) ||
        (text.startsWith('[') && text.endsWith(']'))
      ) {
        return JSON.parse(text);
      }
      // Try to search for a nested JSON block in curly braces
      const firstCurly = text.indexOf('{');
      const lastCurly = text.lastIndexOf('}');
      if (firstCurly !== -1 && lastCurly !== -1 && lastCurly > firstCurly) {
        const potentialJson = text.substring(firstCurly, lastCurly + 1);
        return JSON.parse(potentialJson);
      }
    } catch {
      // Not a valid JSON payload
    }
    return null;
  }, [selectedLineEntry]);

  if (!selectedLineEntry) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(selectedLineEntry.raw || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFilterByCorrelationId = (id: string) => {
    // Prefix filter with "+" to mean Include off-thread
    setIncludeFilter(id);
    setSearchQuery(id);
  };

  // Safe normalization of severity
  const severityStr = String(selectedLineEntry.severity || 'neutral').toLowerCase();
  const severityColor =
    severityStr === 'error'
      ? 'text-danger bg-danger-soft/20 border border-danger/35'
      : severityStr === 'warn'
        ? 'text-warning bg-warning-soft/20 border border-warning/35'
        : severityStr === 'info'
          ? 'text-info bg-info-soft/20 border border-info/35'
          : 'text-subtle bg-ink-900 border border-line';

  return (
    <div className="h-64 border-t border-line bg-ink-950 flex flex-col min-h-0 text-readable select-none animate-in slide-in-from-bottom duration-200">
      {/* Drawer Header */}
      <div className="h-8 shrink-0 flex items-center justify-between px-3 border-b border-line bg-ink-900/80">
        <div className="flex items-center gap-2">
          <CornerDownRight size={11} className="text-accent" />
          <span className="text-[10px] font-bold text-subtle tracking-wider uppercase font-mono">
            Focused Line Details (L{selectedLineEntry.lineNumber})
          </span>
          <span
            className={`text-[9px] font-mono px-1 rounded uppercase font-bold shrink-0 ${severityColor}`}
          >
            {selectedLineEntry.severity || 'neutral'}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={handleCopy}
            title="Copy Raw Entry"
            className="p-1 hover:bg-ink-850 rounded border border-transparent hover:border-line text-subtle hover:text-readable transition"
          >
            {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
          </button>
          <button
            onClick={() => setSelectedLineEntry(null)}
            title="Close Drawer (Esc)"
            className="p-1 hover:bg-ink-850 rounded border border-transparent hover:border-line text-subtle hover:text-readable transition"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Drawer Body - Split Left / Right */}
      <div className="flex-1 flex min-h-0 divide-x divide-line">
        {/* Left Column: Metadata & Raw Message */}
        <div className="flex-1 flex flex-col min-w-0 p-3 space-y-3 overflow-y-auto">
          {/* Metadata Grid */}
          <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
            <div className="flex items-center justify-between border-b border-line/40 pb-1">
              <span className="text-subtle">Timestamp:</span>
              <span
                className="text-readable text-right font-bold truncate max-w-[160px]"
                title={selectedLineEntry.timestamp || 'N/A'}
              >
                {selectedLineEntry.timestamp || 'N/A'}
              </span>
            </div>
            <div className="flex items-center justify-between border-b border-line/40 pb-1">
              <span className="text-subtle">Source / Class:</span>
              <span
                className="text-readable text-right font-bold truncate max-w-[160px]"
                title={selectedLineEntry.source || 'N/A'}
              >
                {selectedLineEntry.source || 'N/A'}
              </span>
            </div>

            {/* Correlation ID / Transaction ID */}
            {correlationId && (
              <div className="col-span-2 flex items-center justify-between bg-accent/5 border border-accent/20 p-1.5 rounded">
                <div className="flex items-center gap-1">
                  <span className="text-[9px] font-bold text-accent">CORRELATION ID:</span>
                  <span className="text-readable font-bold select-text font-mono text-[10px]">
                    {correlationId}
                  </span>
                </div>
                <button
                  onClick={() => handleFilterByCorrelationId(correlationId)}
                  className="flex items-center gap-1 text-[9px] font-bold bg-accent hover:bg-accent-light text-ink-950 px-2 py-0.5 rounded transition"
                  title="Isolate all transactions with this Correlation ID"
                >
                  Isolate Transaction <ArrowUpRight size={10} />
                </button>
              </div>
            )}
          </div>

          {/* Raw Log Message Text Area */}
          <div className="flex-1 flex flex-col min-h-0 space-y-1">
            <span className="text-[9px] font-bold text-subtle uppercase font-mono">
              Raw Log Message
            </span>
            <div className="flex-1 border border-line bg-ink-950 p-2 rounded text-[10px] font-mono text-readable select-text overflow-y-auto whitespace-pre-wrap break-all leading-normal select-all">
              {selectedLineEntry.message || selectedLineEntry.raw}
            </div>
          </div>
        </div>

        {/* Right Column: Structured Payload (JSON Tree) */}
        <div className="w-1/2 flex flex-col p-3 min-w-[260px] overflow-hidden bg-ink-950/40">
          <span className="text-[9px] font-bold text-subtle uppercase font-mono mb-2">
            Structured Log Context
          </span>
          <div className="flex-1 border border-line bg-ink-950 p-2.5 rounded overflow-y-auto min-h-0">
            {rawJson ? (
              <JsonTree data={rawJson} />
            ) : (
              <div className="h-full flex items-center justify-center text-[10px] text-subtle italic text-center px-4 font-mono">
                No nested JSON payload or key-value fields detected. Click a log containing
                structured telemetry to parse context.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LineFocusDrawer;
