import type { ButtonHTMLAttributes, JSX } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type ButtonSize = 'xs' | 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  overflowSafe?: boolean;
}

const getVariantClasses = (variant: ButtonVariant): string => {
  switch (variant) {
    case 'primary':
      return 'border-accent bg-accent text-ink-950 hover:bg-sky-300';
    case 'ghost':
      return 'border-transparent bg-transparent text-muted hover:bg-ink-800 hover:text-readable';
    case 'danger':
      return 'border-danger/60 bg-danger-soft text-danger hover:bg-danger/20';
    case 'success':
      return 'border-success/60 bg-success-soft text-success hover:bg-success/15';
    case 'secondary':
    default:
      return 'border-line bg-ink-800 text-readable hover:border-line-strong hover:bg-ink-700';
  }
};

const getSizeClasses = (size: ButtonSize): string => {
  switch (size) {
    case 'xs':
      return 'h-6 px-1.5 text-[11px]';
    case 'sm':
      return 'h-7 px-2 text-xs';
    case 'md':
    default:
      return 'h-8 px-3 text-sm';
  }
};

export const Button = ({
  className = '',
  variant = 'secondary',
  size = 'md',
  type = 'button',
  overflowSafe = true,
  ...props
}: ButtonProps): JSX.Element => {
  return (
    <button
      {...props}
      type={type}
      className={[
        'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border font-medium leading-none transition disabled:cursor-not-allowed disabled:opacity-50',
        overflowSafe ? 'min-w-0 max-w-full overflow-hidden whitespace-nowrap' : '',
        getVariantClasses(variant),
        getSizeClasses(size),
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    />
  );
};
