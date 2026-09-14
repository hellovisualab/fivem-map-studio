import { Crosshair, Grid3X3, Maximize, Minus, Plus } from 'lucide-react'
import { useEditor } from '@/store/useEditor'
import { canvasApi } from '@/lib/canvasApi'
import { canvasToWorld } from '@/lib/geometry'
import { cn, round } from '@/lib/utils'
import { getData } from '@/lib/data'

export function StatusBar() {
  const pointer = useEditor((s) => s.pointer)
  const scale = useEditor((s) => s.viewport.scale)
  const doc = useEditor((s) => s.doc)
  const selectedCount = useEditor((s) => s.selectedIds.length)
  const { updateDocument } = useEditor.getState()
  const world = pointer && doc ? canvasToWorld(pointer.x, pointer.y, doc) : null

  return (
    <footer className="flex h-9 shrink-0 items-center gap-3 border-t border-ink-800 bg-ink-900/80 px-3 text-[11px] text-ink-400 backdrop-blur">
      <span className="flex items-center gap-1.5 font-mono">
        <Crosshair className="h-3.5 w-3.5 text-ink-500" />
        {pointer ? (
          <>
            <span className="text-ink-300">
              {Math.round(pointer.x)}, {Math.round(pointer.y)}
            </span>
            <span className="hidden text-ink-600 sm:inline">px</span>
            {world && (
              <span className="hidden sm:inline">
                · <span className="text-brand-300">{round(world.x, 1)}</span>, <span className="text-brand-300">{round(world.y, 1)}</span> <span className="text-ink-600">gta</span>
              </span>
            )}
          </>
        ) : (
          <span className="text-ink-600">Move over the map</span>
        )}
      </span>

      <span className="hidden sm:inline">
        {doc?.elements.length ?? 0} elements{selectedCount ? ` · ${selectedCount} selected` : ''}
      </span>

      <span className="ml-auto hidden md:inline">{getData().mode === 'local' ? 'Local storage' : 'Supabase'}</span>

      <button
        onClick={() => doc && updateDocument({ grid: { ...doc.grid, enabled: !doc.grid.enabled } })}
        className={cn('flex items-center gap-1 rounded-md px-2 py-1 transition hover:bg-ink-800', doc?.grid.enabled ? 'text-brand-400' : 'text-ink-400')}
        title="Toggle grid (G)"
      >
        <Grid3X3 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Grid</span>
      </button>

      <div className="flex items-center gap-0.5 rounded-lg border border-ink-700 bg-ink-850 p-0.5">
        <button onClick={() => canvasApi.zoomBy(1 / 1.25)} className="rounded-md p-1 hover:bg-ink-700 hover:text-ink-100" title="Zoom out (-)">
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => canvasApi.zoomTo(1)} className="w-12 rounded-md py-1 text-center font-mono text-ink-200 hover:bg-ink-700" title="Reset to 100%">
          {Math.round(scale * 100)}%
        </button>
        <button onClick={() => canvasApi.zoomBy(1.25)} className="rounded-md p-1 hover:bg-ink-700 hover:text-ink-100" title="Zoom in (+)">
          <Plus className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => canvasApi.fit()} className="rounded-md p-1 hover:bg-ink-700 hover:text-ink-100" title="Fit to screen (Shift+1)">
          <Maximize className="h-3.5 w-3.5" />
        </button>
      </div>
    </footer>
  )
}
