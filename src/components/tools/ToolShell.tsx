import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Download } from 'lucide-react'
import { Logo } from '@/components/ui/Logo'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/store/useAuth'
import { PLANS } from '@/lib/constants'
import { cn } from '@/lib/utils'

interface ToolShellProps {
  title: string
  subtitle?: string
  onExport?: () => void
  exportLabel?: string
  exportLoading?: boolean
  exportDisabled?: boolean
  children: ReactNode
  className?: string
}

export function ToolShell({
  title,
  subtitle,
  onExport,
  exportLabel = 'Export',
  exportLoading,
  exportDisabled,
  children,
  className,
}: ToolShellProps) {
  const user = useAuth((s) => s.user)
  const remaining = useAuth((s) => s.exportsRemaining())
  const plan = user ? PLANS[user.plan] : PLANS.free

  return (
    <div className={cn('flex h-full min-h-0 flex-col bg-ink-950', className)}>
      <header className="flex shrink-0 items-center gap-3 border-b border-ink-800/80 bg-ink-950/90 px-3 py-2.5 backdrop-blur sm:px-4">
        <Logo to="/tools" compact />
        <Link to="/tools" className="hidden items-center gap-1 text-xs text-ink-500 transition hover:text-ink-200 sm:inline-flex">
          <ArrowLeft className="h-3.5 w-3.5" /> Tools
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink-100">{title}</p>
          {subtitle && <p className="truncate text-[11px] text-ink-500">{subtitle}</p>}
        </div>
        <div className="hidden items-center gap-2 text-[11px] text-ink-400 md:flex">
          <span className="rounded-md border border-brand-500/30 bg-brand-500/10 px-2 py-1 font-semibold text-brand-300">
            {user?.plan === 'supporter' ? 'Unlimited' : `${remaining ?? 0} export left`}
          </span>
          <span className="text-ink-600">{plan.name}</span>
        </div>
        {onExport && (
          <Button size="sm" onClick={onExport} loading={exportLoading} disabled={exportDisabled}>
            <Download className="h-4 w-4" /> {exportLabel}
          </Button>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  )
}
