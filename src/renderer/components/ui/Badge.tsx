import type { HTMLAttributes, JSX } from 'react';

type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  maxWidthClassName?: string;
}

const getToneClasses = (tone: BadgeTone): string => {
  switch (tone) {
    case 'info':
      return 'border-info/40 bg-info-soft text-info';
    case 'success':
      return 'border-success/40 bg-success-soft text-success';
    case 'warning':
      return 'border-warning/40 bg-warning-soft text-warning';
    case 'danger':
      return 'border-danger/40 bg-danger-soft text-danger';
    case 'neutral':
    default:
      return 'border-line bg-ink-800 text-muted';
  }
};

export const Badge = ({
  className = '',
  tone = 'neutral',
  maxWidthClassName = 'max-w-36',
  ...props
}: BadgeProps): JSX.Element => {
  return (
    <span
      {...props}
      className={[
        'inline-flex h-5 min-w-0 shrink-0 items-center gap-1 truncate rounded border px-1.5 text-[10px] font-semibold leading-none',
        maxWidthClassName,
        getToneClasses(tone),
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    />
  );
};
