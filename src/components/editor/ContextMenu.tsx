import { useEffect, useRef, type ReactNode } from 'react'
import { ArrowDownToLine, ArrowUpToLine, ClipboardPaste, Copy, CopyPlus, EyeOff, Grid3X3, Lock, LockOpen, Magnet, Maximize, MousePointerSquareDashed, PenTool, Scissors, Trash2 } from 'lucide-react'
import { useEditor } from '@/store/useEditor'
import { canvasApi } from '@/lib/canvasApi'
import { hasClipboard } from '@/lib/clipboard'
import { arrangeSelection, copySelection, cutSelection, hideSelection, pasteClipboard, toggleLockSelection } from '@/lib/editorActions'
import { cn } from '@/lib/utils'

interface Item {
  label: string
  icon: typeof Copy
  shortcut?: string
  run: () => void
  disabled?: boolean
  danger?: boolean
}

/** Right-click menu for the canvas: element actions on a selection, map actions on empty space. */
export function ContextMenu({ x, y, onClose }: { x: number; y: number; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const s = useEditor.getState()
  const selected = s.doc?.elements.filter((e) => s.selectedIds.includes(e.id)) ?? []
  const single = selected.length === 1 ? selected[0] : null
  const shape = single && (single.type === 'zone' || single.type === 'line') && !single.locked ? single : null
  const locked = selected.length > 0 && selected.every((e) => e.locked)

  useEffect(() => {
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return
      if (e.type === 'pointerdown' && ref.current?.contains(e.target as Node)) return
      onClose()
    }
    window.addEventListener('pointerdown', close, true)
    window.addEventListener('keydown', close, true)
    window.addEventListener('wheel', close, true)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('pointerdown', close, true)
      window.removeEventListener('keydown', close, true)
      window.removeEventListener('wheel', close, true)
      window.removeEventListener('blur', close)
    }
  }, [onClose])

  const groups: Item[][] = selected.length
    ? [
        shape ? [{ label: s.pointEditId === shape.id ? 'Done editing points' : 'Edit points', icon: PenTool, shortcut: 'Enter', run: () => s.setPointEdit(s.pointEditId === shape.id ? null : shape.id) }] : [],
        [
          { label: 'Cut', icon: Scissors, shortcut: 'Ctrl+X', run: cutSelection, disabled: locked },
          { label: 'Copy', icon: Copy, shortcut: 'Ctrl+C', run: copySelection },
          { label: 'Paste', icon: ClipboardPaste, shortcut: 'Ctrl+V', run: pasteClipboard, disabled: !hasClipboard() },
          { label: 'Duplicate', icon: CopyPlus, shortcut: 'Ctrl+D', run: s.duplicateSelected },
        ],
        [
          { label: 'Bring to front', icon: ArrowUpToLine, shortcut: 'Shift+]', run: () => arrangeSelection('top') },
          { label: 'Send to back', icon: ArrowDownToLine, shortcut: 'Shift+[', run: () => arrangeSelection('bottom') },
        ],
        [
          { label: locked ? 'Unlock' : 'Lock', icon: locked ? LockOpen : Lock, run: toggleLockSelection },
          { label: 'Hide', icon: EyeOff, run: hideSelection },
          { label: 'Delete', icon: Trash2, shortcut: 'Del', run: s.deleteSelected, danger: true, disabled: locked },
        ],
      ]
    : [
        [{ label: 'Paste', icon: ClipboardPaste, shortcut: 'Ctrl+V', run: pasteClipboard, disabled: !hasClipboard() }],
        [
          { label: 'Select all', icon: MousePointerSquareDashed, shortcut: 'Ctrl+A', run: () => s.select(s.doc?.elements.filter((e) => e.visible && !e.locked).map((e) => e.id) ?? []) },
          { label: 'Zoom to fit', icon: Maximize, shortcut: 'Shift+1', run: () => canvasApi.fit() },
        ],
        [
          { label: s.doc?.grid.enabled ? 'Hide grid' : 'Show grid', icon: Grid3X3, shortcut: 'G', run: () => s.doc && s.updateDocument({ grid: { ...s.doc.grid, enabled: !s.doc.grid.enabled } }) },
          { label: s.snap ? 'Turn snapping off' : 'Turn snapping on', icon: Magnet, run: () => s.setSnap(!s.snap) },
        ],
      ]

  // Keep the menu on screen.
  const W = 220
  const left = Math.min(x, window.innerWidth - W - 8)
  const top = Math.min(y, window.innerHeight - 340)
  const visible = groups.filter((g) => g.length)
  return (
    <div
      ref={ref}
      role="menu"
      className="fixed z-50 w-[220px] overflow-hidden rounded-xl border border-white/10 bg-ink-900/95 p-1 text-xs shadow-soft backdrop-blur-xl"
      style={{ left, top: Math.max(8, top) }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {visible.map((group, gi) => (
        <div key={gi} className={cn(gi > 0 && 'mt-1 border-t border-ink-700/70 pt-1')}>
          {group.map((item): ReactNode => (
            <button
              key={item.label}
              role="menuitem"
              type="button"
              disabled={item.disabled}
              onClick={() => {
                onClose()
                item.run()
              }}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition disabled:pointer-events-none disabled:opacity-40',
                item.danger ? 'text-red-300 hover:bg-red-500/15' : 'text-ink-200 hover:bg-ink-700',
              )}
            >
              <item.icon className="h-3.5 w-3.5 shrink-0 text-ink-400" />
              <span className="flex-1">{item.label}</span>
              {item.shortcut && <kbd className="font-sans text-[10px] text-ink-500">{item.shortcut}</kbd>}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}
