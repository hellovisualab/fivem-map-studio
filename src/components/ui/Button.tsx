import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type Variant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'outline' | 'danger'
type Size = 'sm' | 'md' | 'lg' | 'icon'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
}

const variants: Record<Variant, string> = {
  primary:
    'bg-brand-500 text-white font-bold shadow-[0_0_12px_rgba(236,72,153,0.4)] hover:bg-brand-400 hover:-translate-y-px hover:shadow-[0_8px_24px_rgba(236,72,153,0.35)] active:translate-y-0 active:scale-[0.98]',
  accent:
    'bg-accent-500 text-ink-950 font-bold shadow-[0_0_12px_rgba(0,212,255,0.4)] hover:bg-accent-400 hover:-translate-y-px hover:shadow-[0_8px_24px_rgba(0,212,255,0.35)] active:translate-y-0 active:scale-[0.98]',
  secondary: 'bg-white/[0.06] text-ink-100 border border-white/10 backdrop-blur-md hover:bg-white/[0.1] hover:border-white/20',
  ghost: 'text-ink-300 hover:text-ink-100 hover:bg-white/[0.06]',
  outline: 'border border-white/15 text-ink-100 backdrop-blur-md hover:border-brand-500/60 hover:bg-brand-500/10 hover:text-brand-300',
  danger: 'bg-red-500/10 text-red-300 border border-red-500/30 hover:bg-red-500/20',
}

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs rounded-lg gap-1.5',
  md: 'h-10 px-4 text-sm rounded-xl gap-2',
  lg: 'h-12 px-6 text-base rounded-xl gap-2',
  icon: 'h-9 w-9 rounded-lg',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap font-medium transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : children}
    </button>
  ),
)
Button.displayName = 'Button'
