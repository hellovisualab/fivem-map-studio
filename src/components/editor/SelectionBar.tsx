import { forwardRef, type ReactNode } from 'react'
import { ArrowDownToLine, ArrowUpToLine, Copy, CopyPlus, Lock, LockOpen, PenTool, Trash2 } from 'lucide-react'
import { useEditor } from '@/store/useEditor'
import { arrangeSelection, copySelection, toggleLockSelection } from '@/lib/editorActions'
import { cn } from '@/lib/utils'

function BarButton({ label, shortcut, onClick, active, danger, children }: { label: string; shortcut?: string; onClick: () => void; active?: boolean; danger?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={shortcut ? `${label} (${shortcut})` : label}
      className={cn(
        'flex h-8 w-8 items-center justify-center rounded-lg transition',
        active ? 'bg-brand-500/20 text-brand-300' : danger ? 'text-ink-300 hover:bg-red-500/15 hover:text-red-300' : 'text-ink-300 hover:bg-ink-700 hover:text-ink-100',
      )}
    >
      {children}
    </button>
  )
}

/**
 * Quick actions floating above the selection. MapCanvas positions it (imperatively,
 * through the forwarded ref) and hides it while dragging.
 */
export const SelectionBar = forwardRef<HTMLDivElement>(function SelectionBar(_, ref) {
  const elements = useEditor((s) => s.doc?.elements)
  const selectedIds = useEditor((s) => s.selectedIds)
  const selected = elements?.filter((e) => selectedIds.includes(e.id)) ?? []
  const pointEditId = useEditor((s) => s.pointEditId)
  const { duplicateSelected, deleteSelected, setPointEdit } = useEditor.getState()
  if (!selected.length) return null
  const single = selected.length === 1 ? selected[0] : null
  const shape = single && (single.type === 'zone' || single.type === 'line') ? single : null
  const locked = selected.every((e) => e.locked)
  const I = 'h-4 w-4'
  return (
    <div
      ref={ref}
      data-testid="selection-bar"
      className="pointer-events-auto absolute z-20 flex items-center gap-0.5 rounded-xl border border-white/10 bg-ink-900/90 p-1 shadow-soft backdrop-blur-xl"
      style={{ left: 0, top: 0, visibility: 'hidden' }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {selected.length > 1 && <span className="px-2 text-[11px] font-medium text-ink-300 tabular-nums">{selected.length} selected</span>}
      {shape && !shape.locked && (
        <BarButton label={pointEditId === shape.id ? 'Done editing points' : 'Edit points'} shortcut="Enter" active={pointEditId === shape.id} onClick={() => setPointEdit(pointEditId === shape.id ? null : shape.id)}>
          <PenTool className={I} />
        </BarButton>
      )}
      <BarButton label="Duplicate" shortcut="Ctrl+D" onClick={duplicateSelected}>
        <CopyPlus className={I} />
      </BarButton>
      <BarButton label="Copy" shortcut="Ctrl+C" onClick={copySelection}>
        <Copy className={I} />
      </BarButton>
      <span className="mx-0.5 h-5 w-px bg-ink-700" />
      <BarButton label="Bring to front" shortcut="Shift+]" onClick={() => arrangeSelection('top')}>
        <ArrowUpToLine className={I} />
      </BarButton>
      <BarButton label="Send to back" shortcut="Shift+[" onClick={() => arrangeSelection('bottom')}>
        <ArrowDownToLine className={I} />
      </BarButton>
      <BarButton label={locked ? 'Unlock' : 'Lock'} active={locked} onClick={toggleLockSelection}>
        {locked ? <Lock className={I} /> : <LockOpen className={I} />}
      </BarButton>
      <span className="mx-0.5 h-5 w-px bg-ink-700" />
      <BarButton label="Delete" shortcut="Del" danger onClick={deleteSelected}>
        <Trash2 className={I} />
      </BarButton>
    </div>
  )
})
