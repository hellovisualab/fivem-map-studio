import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, ArrowLeft, Check, Cloud, Download, Layers, Loader2, Maximize2, Minimize2, PanelRight, Upload } from 'lucide-react'
import { useEditor } from '@/store/useEditor'
import { useAuth } from '@/store/useAuth'
import { Button } from '@/components/ui/Button'
import { LogoMark } from '@/components/ui/Logo'
import { PLANS } from '@/lib/constants'
import { cn, formatBytes } from '@/lib/utils'

function SaveIndicator() {
  const saveState = useEditor((s) => s.saveState)
  const map = {
    saved: { icon: Check, text: 'All changes saved', cls: 'text-emerald-400' },
    saving: { icon: Loader2, text: 'Saving…', cls: 'text-ink-400' },
    unsaved: { icon: Cloud, text: 'Unsaved changes', cls: 'text-ink-400' },
    error: { icon: AlertCircle, text: 'Save failed', cls: 'text-red-400' },
    idle: { icon: Cloud, text: '', cls: 'text-ink-500' },
  }[saveState]
  const Icon = map.icon
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', map.cls)}>
      <Icon className={cn('h-3.5 w-3.5', saveState === 'saving' && 'animate-spin')} /> <span className="hidden sm:inline">{map.text}</span>
    </span>
  )
}

export function TopBar({ onExport, onImport, docSize }: { onExport: () => void; onImport: () => void; docSize: number }) {
  const navigate = useNavigate()
  const project = useEditor((s) => s.project)
  const panels = useEditor((s) => s.panels)
  const { renameProject, togglePanel, save } = useEditor.getState()
  const user = useAuth((s) => s.user)
  const remaining = useAuth((s) => s.exportsRemaining())
  const [name, setName] = useState(project?.name ?? '')
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => setName(project?.name ?? ''), [project?.id, project?.name])

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const plan = user ? PLANS[user.plan] : PLANS.free
  const used = (user?.storageUsed ?? 0) + docSize

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-ink-800 bg-ink-900/80 px-2 backdrop-blur-xl sm:gap-3 sm:px-3">
      <button
        onClick={async () => {
          await save()
          navigate('/dashboard')
        }}
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-ink-300 transition hover:bg-ink-800 hover:text-ink-100"
        title="Back to dashboard"
      >
        <ArrowLeft className="h-4 w-4" />
        <LogoMark className="h-6 w-6 rounded-md shadow-none" />
      </button>

      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            const n = name.trim()
            if (n && n !== project?.name) renameProject(n)
            else setName(project?.name ?? '')
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          className="w-full min-w-[72px] max-w-[220px] truncate rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm font-semibold text-ink-100 outline-none transition hover:border-ink-700 focus:border-brand-500/60 focus:bg-ink-900"
        />
        <SaveIndicator />
      </div>

      <div className="hidden items-center gap-3 lg:flex">
        <span className="rounded-full border border-ink-700 bg-ink-850 px-2.5 py-1 text-[11px] font-medium text-ink-300">
          {remaining === null ? 'Unlimited exports' : `${remaining} export${remaining === 1 ? '' : 's'} left today`}
        </span>
        <div className="flex items-center gap-2 text-[11px] text-ink-400">
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-ink-700">
            <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, (used / plan.storageBytes) * 100)}%` }} />
          </div>
          <span className="font-mono">
            {formatBytes(used)} / {formatBytes(plan.storageBytes)}
          </span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <Button variant="ghost" size="icon" className="hidden md:inline-flex" onClick={() => togglePanel('layers')} title="Toggle layers panel">
          <Layers className={cn('h-4 w-4', panels.layers && 'text-brand-400')} />
        </Button>
        <Button variant="ghost" size="icon" className="hidden md:inline-flex" onClick={() => togglePanel('properties')} title="Toggle properties panel">
          <PanelRight className={cn('h-4 w-4', panels.properties && 'text-brand-400')} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="hidden sm:inline-flex"
          onClick={() => {
            if (document.fullscreenElement) void document.exitFullscreen()
            else void document.documentElement.requestFullscreen()
          }}
          title="Fullscreen"
        >
          {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </Button>
        <Button variant="secondary" size="sm" onClick={onImport}>
          <Upload className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Import tiles</span>
        </Button>
        <Button size="sm" onClick={onExport}>
          <Download className="h-3.5 w-3.5" /> Export
        </Button>
      </div>
    </header>
  )
}
