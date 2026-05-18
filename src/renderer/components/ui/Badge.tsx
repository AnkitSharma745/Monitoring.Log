import type { HTMLAttributes, JSX } from 'react';

type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

const toneClasses: Record<BadgeTone, string> = {
  neutral: 'border-line bg-ink-800 text-muted',
  info: 'border-info/40 bg-info-soft text-info',
  success: 'border-success/40 bg-success-soft text-success',
  warning: 'border-warning/40 bg-warning-soft text-warning',
  danger: 'border-danger/40 bg-danger-soft text-danger',
};

export const Badge = ({ className = '', tone = 'neutral', ...props }: BadgeProps): JSX.Element => {
  return (
    <span
      {...props}
      className={[
        'inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[11px] font-semibold',
        toneClasses[tone],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    />
  );
};
