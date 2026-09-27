import { Layers, SlidersHorizontal } from 'lucide-react'
import { useEditor, type SideTab } from '@/store/useEditor'
import { cn } from '@/lib/utils'
import { LayersPanel } from './LayersPanel'
import { PropertiesPanel } from './PropertiesPanel'

const TABS: { id: SideTab; label: string; icon: typeof Layers }[] = [
  { id: 'design', label: 'Design', icon: SlidersHorizontal },
  { id: 'layers', label: 'Layers', icon: Layers },
]

/** Segmented Design / Layers switch; the Layers tab shows how many elements there are. */
export function SideTabs({ className }: { className?: string }) {
  const tab = useEditor((s) => s.sideTab)
  const count = useEditor((s) => s.doc?.elements.length ?? 0)
  const selected = useEditor((s) => s.selectedIds.length)
  const setSideTab = useEditor((s) => s.setSideTab)
  return (
    <div role="tablist" aria-label="Side panel" className={cn('flex gap-1 rounded-xl bg-ink-950/60 p-1', className)}>
      {TABS.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={tab === t.id}
          onClick={() => setSideTab(t.id)}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition',
            tab === t.id ? 'bg-ink-700 text-ink-100 shadow-sm' : 'text-ink-400 hover:text-ink-200',
          )}
        >
          <t.icon className="h-3.5 w-3.5" />
          {t.label}
          {t.id === 'layers' && count > 0 && (
            <span className={cn('rounded-full px-1.5 text-[10px] tabular-nums', tab === t.id ? 'bg-brand-500/25 text-brand-200' : 'bg-ink-700 text-ink-300')}>{count}</span>
          )}
          {t.id === 'design' && selected > 0 && <span className="h-1.5 w-1.5 rounded-full bg-brand-400" aria-label="selection" />}
        </button>
      ))}
    </div>
  )
}

/** Right-hand panel: one full-height card with Design (properties) and Layers tabs. */
export function SidePanel() {
  const tab = useEditor((s) => s.sideTab)
  return (
    <div className="panel flex h-full min-h-0 flex-col overflow-hidden">
      <SideTabs className="m-2 mb-0" />
      <div className="min-h-0 flex-1">{tab === 'design' ? <PropertiesPanel /> : <LayersPanel embedded />}</div>
    </div>
  )
}
