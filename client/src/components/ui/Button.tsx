import { ButtonHTMLAttributes, forwardRef } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

const variantClasses: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-hover shadow-sm',
  secondary: 'bg-surface text-text border border-border hover:bg-surface-hover shadow-sm',
  danger: 'bg-danger text-white hover:bg-danger-hover shadow-sm',
  ghost: 'text-text-secondary hover:bg-surface-hover hover:text-text',
};

const sizeClasses: Record<Size, string> = {
  sm: 'px-2.5 py-1 text-xs',
  md: 'px-3.5 py-1.5 text-sm',
  lg: 'px-5 py-2 text-base',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'primary', size = 'md', disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors
          focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary
          disabled:opacity-50 disabled:pointer-events-none
          ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
        disabled={disabled}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';
