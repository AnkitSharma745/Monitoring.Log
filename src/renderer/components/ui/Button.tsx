import type { ButtonHTMLAttributes, JSX } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type ButtonSize = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'border-accent bg-accent text-ink-950 hover:bg-sky-300',
  secondary: 'border-line bg-ink-800 text-readable hover:border-line-strong hover:bg-ink-700',
  ghost: 'border-transparent bg-transparent text-muted hover:bg-ink-800 hover:text-readable',
  danger: 'border-danger/60 bg-danger-soft text-danger hover:bg-danger/20',
  success: 'border-success/60 bg-success-soft text-success hover:bg-success/15',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-7 px-2 text-xs',
  md: 'h-8 px-3 text-sm',
};

export const Button = ({
  className = '',
  variant = 'secondary',
  size = 'md',
  type = 'button',
  ...props
}: ButtonProps): JSX.Element => {
  return (
    <button
      {...props}
      type={type}
      className={[
        'inline-flex items-center justify-center gap-2 rounded-md border font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
        variantClasses[variant],
        sizeClasses[size],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    />
  );
};
