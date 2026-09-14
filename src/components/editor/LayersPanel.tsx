import { useMemo, useState } from 'react'
import { AnimatePresence, motion, Reorder } from 'framer-motion'
import { ChevronDown, ChevronUp, Eye, EyeOff, GripVertical, Hexagon, Image as ImageIcon, Lock, LockOpen, MapPin, Search, Slash, Type } from 'lucide-react'
import { useEditor } from '@/store/useEditor'
import { canvasApi } from '@/lib/canvasApi'
import { absolutePoints, polygonCentroid } from '@/lib/geometry'
import { cn } from '@/lib/utils'
import type { MapElement } from '@/types'

const typeIcon: Record<MapElement['type'], typeof Type> = {
  text: Type,
  image: ImageIcon,
  zone: Hexagon,
  line: Slash,
  marker: MapPin,
}

const swatch = (el: MapElement) => {
  switch (el.type) {
    case 'text':
      return el.fill
    case 'zone':
      return el.fill
    case 'line':
      return el.stroke
    case 'marker':
      return el.color
    default:
      return '#6b6b7d'
  }
}

export function LayersPanel() {
  const elements = useEditor((s) => s.doc?.elements ?? [])
  const selectedIds = useEditor((s) => s.selectedIds)
  const { select, toggleVisible, toggleLocked, moveLayer, commit } = useEditor.getState()
  const [query, setQuery] = useState('')

  // Display top-most first (last in array renders on top).
  const ordered = useMemo(() => [...elements].reverse(), [elements])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return ordered
    return ordered.filter((e) => e.name.toLowerCase().includes(q) || e.type.includes(q))
  }, [ordered, query])

  const onReorder = (next: MapElement[]) => {
    if (query) return
    commit((d) => {
      d.elements = [...next].reverse()
    })
  }

  const focus = (el: MapElement) => {
    const pts = absolutePoints(el)
    const c = polygonCentroid(pts)
    canvasApi.centerOn(c.x, c.y)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <h3 className="text-sm font-semibold">Layers</h3>
        <span className="text-[11px] text-ink-500">{elements.length}</span>
      </div>
      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-ink-500" />
          <input className="field-sm pl-8" placeholder="Search layers..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {filtered.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-ink-500">
            {elements.length === 0 ? 'Nothing placed yet - add text, images or zones.' : 'No layers match your search.'}
          </p>
        ) : (
          <Reorder.Group axis="y" values={filtered} onReorder={onReorder} className="space-y-0.5">
            <AnimatePresence initial={false}>
              {filtered.map((el) => {
                const Icon = typeIcon[el.type]
                const selected = selectedIds.includes(el.id)
                return (
                  <Reorder.Item
                    key={el.id}
                    value={el}
                    dragListener={!query}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 6 }}
                    className={cn(
                      'group flex items-center gap-1.5 rounded-lg px-1.5 py-1.5 text-xs transition',
                      selected ? 'bg-brand-500/12 text-ink-100 ring-1 ring-brand-500/40' : 'text-ink-300 hover:bg-ink-700/50',
                      !el.visible && 'opacity-50',
                    )}
                    onClick={(e) => select([el.id], e.shiftKey)}
                    onDoubleClick={() => focus(el)}
                  >
                    <GripVertical className={cn('h-3.5 w-3.5 shrink-0 cursor-grab text-ink-600', query && 'invisible')} />
                    <span className="h-2.5 w-2.5 shrink-0 rounded-sm ring-1 ring-white/10" style={{ background: swatch(el) }} />
                    <Icon className="h-3.5 w-3.5 shrink-0 text-ink-500" />
                    <span className="min-w-0 flex-1 truncate">{el.name}</span>
                    <div className="flex shrink-0 items-center opacity-0 transition group-hover:opacity-100 data-[force=true]:opacity-100" data-force={selected}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          moveLayer(el.id, 'up')
                        }}
                        className="rounded p-1 text-ink-500 hover:text-ink-100"
                        title="Bring forward"
                      >
                        <ChevronUp className="h-3 w-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          moveLayer(el.id, 'down')
                        }}
                        className="rounded p-1 text-ink-500 hover:text-ink-100"
                        title="Send backward"
                      >
                        <ChevronDown className="h-3 w-3" />
                      </button>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleLocked(el.id)
                      }}
                      className={cn('rounded p-1 hover:text-ink-100', el.locked ? 'text-brand-400' : 'text-ink-500 opacity-0 group-hover:opacity-100')}
                      title={el.locked ? 'Unlock' : 'Lock'}
                    >
                      {el.locked ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleVisible(el.id)
                      }}
                      className={cn('rounded p-1 hover:text-ink-100', el.visible ? 'text-ink-500' : 'text-brand-400')}
                      title={el.visible ? 'Hide' : 'Show'}
                    >
                      {el.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    </button>
                  </Reorder.Item>
                )
              })}
            </AnimatePresence>
          </Reorder.Group>
        )}
      </div>
      {selectedIds.length === 1 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-1 border-t border-ink-700/70 px-2 py-2">
          <button onClick={() => moveLayer(selectedIds[0], 'top')} className="flex-1 rounded-md bg-ink-800 px-2 py-1 text-[11px] text-ink-300 hover:bg-ink-700">
            To front
          </button>
          <button onClick={() => moveLayer(selectedIds[0], 'bottom')} className="flex-1 rounded-md bg-ink-800 px-2 py-1 text-[11px] text-ink-300 hover:bg-ink-700">
            To back
          </button>
        </motion.div>
      )}
    </div>
  )
}
