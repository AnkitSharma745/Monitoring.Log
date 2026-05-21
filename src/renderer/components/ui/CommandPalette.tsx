import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, Terminal } from 'lucide-react';
import { CommandService } from '@renderer/services/workbenchServices';
import { useOverlayStore } from '@renderer/stores/overlayStore';

export const CommandPalette = (): React.JSX.Element => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const closeCommandPalette = useOverlayStore((state) => state.closeCommandPalette);

  // Fetch all registered commands from the Command Service
  const commands = useMemo(() => CommandService.getCommands(), []);

  // Filter commands dynamically on character query
  const filteredCommands = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return commands;
    return commands.filter(
      (cmd) =>
        cmd.title.toLowerCase().includes(trimmed) || cmd.category.toLowerCase().includes(trimmed),
    );
  }, [query, commands]);

  // Keep index clamp-safe when query changes filtered count
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredCommands]);

  // Autofocus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Keyboard controls
  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredCommands.length));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelectedIndex(
        (prev) => (prev - 1 + filteredCommands.length) % Math.max(1, filteredCommands.length),
      );
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const selected = filteredCommands[selectedIndex];
      if (selected) {
        void CommandService.executeCommand(selected.id);
        closeCommandPalette();
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeCommandPalette();
    }
  };

  // Click outside listener
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeCommandPalette();
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [closeCommandPalette]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-[10vh] backdrop-blur-sm animate-fade-in">
      <div
        ref={containerRef}
        className="w-full max-w-xl overflow-hidden rounded-lg border border-line bg-ink-950/90 shadow-2xl backdrop-blur-md select-none font-sans"
      >
        {/* Search input bar */}
        <div className="flex h-12 items-center border-b border-line px-4">
          <Search size={16} className="text-subtle mr-3 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command to execute..."
            className="flex-1 h-full bg-transparent text-sm text-readable placeholder-muted outline-none border-none"
          />
          <Terminal size={14} className="text-muted shrink-0" />
        </div>

        {/* Commands Results List */}
        <div className="max-h-[320px] overflow-y-auto py-2 no-scrollbar">
          {filteredCommands.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted">
              No commands matching &quot;<strong className="text-subtle">{query}</strong>&quot;
              found.
            </div>
          ) : (
            filteredCommands.map((command, index) => {
              const isActive = index === selectedIndex;
              return (
                <div
                  key={command.id}
                  className={[
                    'flex h-10 items-center justify-between px-4 text-xs cursor-pointer transition-all duration-75 border-l-2',
                    isActive
                      ? 'bg-ink-800 text-readable border-l-accent'
                      : 'text-subtle border-l-transparent hover:bg-ink-900 hover:text-readable',
                  ].join(' ')}
                  onClick={() => {
                    void CommandService.executeCommand(command.id);
                    closeCommandPalette();
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  {/* Category + Title */}
                  <div className="flex items-center space-x-2 truncate">
                    <span className="text-muted text-[10px] uppercase font-mono font-bold tracking-wider">
                      {command.category}
                    </span>
                    <span className="text-muted/40 font-mono">/</span>
                    <span className="font-semibold truncate">{command.title}</span>
                  </div>

                  {/* Shortcut descriptor or command ID */}
                  <div className="shrink-0 flex items-center space-x-2">
                    {command.shortcut ? (
                      <kbd className="px-1.5 py-0.5 rounded bg-ink-900 border border-line text-[9px] font-mono text-muted uppercase font-bold shadow-inner">
                        {command.shortcut}
                      </kbd>
                    ) : (
                      <span className="text-[9px] font-mono text-muted/30 truncate select-none max-w-[120px]">
                        {command.id}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Keybindings Legend Footer */}
        <footer className="flex h-8 items-center justify-between border-t border-line bg-ink-900/60 px-4 text-[10px] text-muted font-mono select-none">
          <div className="flex space-x-4">
            <span>
              <kbd className="px-1 py-0.2 bg-ink-900 border border-line rounded">↑↓</kbd> Navigate
            </span>
            <span>
              <kbd className="px-1 py-0.2 bg-ink-900 border border-line rounded">Enter</kbd> Execute
            </span>
          </div>
          <span>
            <kbd className="px-1 py-0.2 bg-ink-900 border border-line rounded">Esc</kbd> Close
          </span>
        </footer>
      </div>
    </div>
  );
};
export default CommandPalette;
