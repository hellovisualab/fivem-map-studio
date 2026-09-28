import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMediaQuery } from '@/hooks/useMediaQuery'

export interface MenuItem {
  label: string
  hint?: string
  icon?: ReactNode
  disabled?: boolean
  checked?: boolean
  onSelect?: () => void
  items?: MenuItem[]
  /** Draws a divider above the item. */
  divider?: boolean
}

/** When the menu opened; a touch that opened it (long press) must not also pick an item. */
let openedAt = 0

function MenuList({ items, onClose, className, inline }: { items: MenuItem[]; onClose: () => void; className?: string; inline?: boolean }) {
  const [open, setOpen] = useState<number | null>(null)
  return (
    <div className={cn('min-w-[200px] rounded-lg border border-ink-700 bg-ink-900/98 py-1 text-[12px] shadow-2xl shadow-black/60 backdrop-blur', className)}>
      {items.map((item, i) => (
        <div key={`${item.label}-${i}`} className="relative" onMouseEnter={() => !inline && setOpen(item.items ? i : null)}>
          {item.divider && <div className="my-1 border-t border-ink-800" />}
          <button
            type="button"
            disabled={item.disabled}
            onClick={() => {
              if (performance.now() - openedAt < 400) return
              if (item.items) {
                setOpen(open === i && inline ? null : i)
                return
              }
              onClose()
              item.onSelect?.()
            }}
            className={cn(
              'flex w-full items-center gap-2 px-3 py-1.5 text-left pointer-coarse:py-2.5',
              item.disabled ? 'cursor-default text-ink-600' : 'text-ink-200 hover:bg-brand-500/20 hover:text-white',
              open === i && 'bg-brand-500/20 text-white',
            )}
          >
            <span className="flex w-4 shrink-0 justify-center text-ink-400">{item.checked ? '✓' : item.icon}</span>
            <span className="flex-1 whitespace-nowrap">{item.label}</span>
            {item.hint && !inline && <span className="ml-4 font-mono text-[10px] whitespace-nowrap text-ink-500">{item.hint}</span>}
            {item.items && <ChevronRight className={cn('h-3 w-3 text-ink-500 transition', inline && open === i && 'rotate-90')} />}
          </button>
          {item.items && open === i && inline && (
            <div className="border-y border-ink-800 bg-black/20 pl-3">
              <MenuList items={item.items} onClose={onClose} inline className="min-w-0 rounded-none border-0 bg-transparent py-0 shadow-none" />
            </div>
          )}
          {item.items && open === i && !inline && (
            <div className="absolute top-0 left-full z-10 -mt-1 pl-0.5">
              <MenuList items={item.items} onClose={onClose} />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/** A Blender-style popup menu at (x, y) inside its positioned parent. */
export function PopupMenu({ x, y, title, items, onClose }: { x: number; y: number; title?: string; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })
  // narrow screens: submenus open in place, the menu scrolls instead of overflowing
  const inline = useMediaQuery('(max-width: 639px), (pointer: coarse)')

  useLayoutEffect(() => {
    openedAt = performance.now()
  }, [])

  useLayoutEffect(() => {
    const el = ref.current
    const parent = el?.offsetParent as HTMLElement | null
    if (!el || !parent) return
    const w = el.offsetWidth
    const h = el.offsetHeight
    setPos({ x: Math.max(4, Math.min(x, parent.clientWidth - w - 4)), y: Math.max(4, Math.min(y, parent.clientHeight - h - 4)) })
  }, [x, y])

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      className={cn('absolute z-40', inline && 'scrollbar-thin max-h-[calc(100%-8px)] max-w-[calc(100%-8px)] overflow-y-auto rounded-lg')}
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {title && <div className="rounded-t-lg border border-b-0 border-ink-700 bg-ink-850 px-3 py-1 text-[11px] font-semibold text-ink-400">{title}</div>}
      <MenuList items={items} onClose={onClose} inline={inline} className={title ? 'rounded-t-none' : undefined} />
    </div>
  )
}
