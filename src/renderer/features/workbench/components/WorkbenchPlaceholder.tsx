import type { JSX } from 'react';

interface WorkbenchPlaceholderProps {
  title: string;
}

export const WorkbenchPlaceholder = ({ title }: WorkbenchPlaceholderProps): JSX.Element => {
  return (
    <div className="flex h-full min-h-0 items-center justify-center bg-ink-950 text-center">
      <div>
        <div className="text-sm font-semibold text-readable">{title}</div>
        <div className="mt-1 text-xs text-muted">Under Development</div>
      </div>
    </div>
  );
};
