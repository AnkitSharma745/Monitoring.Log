import type { JSX, ReactNode } from 'react';

interface TooltipProps {
  label: string;
  shortcut?: string;
  children: ReactNode;
}

export const Tooltip = ({ label, shortcut, children }: TooltipProps): JSX.Element => {
  return (
    <span className="group/tooltip relative inline-flex">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-line bg-ink-950 px-2.5 py-1.5 text-[11px] text-readable shadow-panel group-hover/tooltip:block group-focus-within/tooltip:block"
      >
        {label}
        {shortcut && <span className="ml-2 text-subtle">{shortcut}</span>}
      </span>
    </span>
  );
};
