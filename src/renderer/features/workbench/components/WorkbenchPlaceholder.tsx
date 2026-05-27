import type { JSX } from 'react';

interface WorkbenchPlaceholderProps {
  title: string;
}

export const WorkbenchPlaceholder = ({ title }: WorkbenchPlaceholderProps): JSX.Element => {
  return (
    <div className="flex h-full min-h-0 items-center justify-center bg-ink-950 p-4 text-center">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-readable">{title}</div>
        <div className="mt-1 text-xs text-muted">Under Development</div>
        <div className="mt-2 max-w-52 text-[11px] leading-5 text-subtle">
          This investigation surface is not available yet.
        </div>
      </div>
    </div>
  );
};
