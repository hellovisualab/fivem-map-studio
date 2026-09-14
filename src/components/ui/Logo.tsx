import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

const base = import.meta.env.BASE_URL.replace(/\/$/, '')
export const LOGO_SRC = `${base}/brand/labseve7-logo.png`
export const MARK_SRC = `${base}/brand/labseve7-mark.png`

/** Square LABSEVE7 mark on a dark tile. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-ink-850 shadow-soft', className)}>
      <img src={MARK_SRC} alt="LABSEVE7" className="h-[62%] w-[62%] object-contain" draggable={false} />
    </div>
  )
}

/** LABSEVE7 wordmark with a "Map Studio" product tag. */
export function Logo({ to = '/', compact = false, className }: { to?: string; compact?: boolean; className?: string }) {
  return (
    <Link to={to} className={cn('group flex items-center gap-2.5', className)}>
      {compact ? (
        <LogoMark />
      ) : (
        <>
          <img src={LOGO_SRC} alt="LABSEVE7" className="h-7 w-auto select-none sm:h-8" draggable={false} />
          <span className="hidden rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.14em] text-ink-300 uppercase sm:inline-block">
            Map Studio
          </span>
        </>
      )}
    </Link>
  )
}
