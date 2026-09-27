import { useState } from 'react'
import { Hexagon, Image as ImageIcon, MapPin, Square, Type, X } from 'lucide-react'
import { useEditor } from '@/store/useEditor'
import type { ToolId } from '@/types'

const ACTIONS: { tool: ToolId; label: string; hint: string; key: string; icon: typeof Square }[] = [
  { tool: 'zone', label: 'Zone', hint: 'Drag a rectangle', key: 'Z', icon: Square },
  { tool: 'polygon', label: 'Territory', hint: 'Click the corners', key: 'P', icon: Hexagon },
  { tool: 'marker', label: 'Marker', hint: 'Click a spot', key: 'M', icon: MapPin },
  { tool: 'text', label: 'Label', hint: 'Click to type', key: 'T', icon: Type },
  { tool: 'image', label: 'Image', hint: 'Logo, flag…', key: 'I', icon: ImageIcon },
]

/** Shown on an empty map: one-click entry points to the drawing tools plus navigation tips. */
export function QuickStart() {
  const [hidden, setHidden] = useState(false)
  const setTool = useEditor((s) => s.setTool)
  if (hidden) return null
  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-4 z-10 flex justify-center">
      <div data-testid="quick-start" className="panel pointer-events-auto relative w-full max-w-[560px] p-3 sm:p-4">
        <button onClick={() => setHidden(true)} className="absolute top-2 right-2 rounded-md p-1 text-ink-500 transition hover:bg-ink-700 hover:text-ink-200" aria-label="Dismiss">
          <X className="h-3.5 w-3.5" />
        </button>
        <p className="text-sm font-semibold text-ink-100">Start your map</p>
        <p className="mt-0.5 text-xs text-ink-400">Pick what to add, then click on the map.</p>
        <div className="mt-3 grid grid-cols-5 gap-1.5">
          {ACTIONS.map((a) => (
            <button
              key={a.tool}
              onClick={() => {
                if (a.tool === 'image') document.querySelector<HTMLInputElement>('input[type=file][accept^="image/png"]')?.click()
                else setTool(a.tool)
              }}
              className="group flex flex-col items-center gap-1 rounded-xl border border-ink-700 bg-ink-850/80 px-1 py-2.5 text-center transition hover:border-brand-500/50 hover:bg-brand-500/10"
            >
              <a.icon className="h-5 w-5 text-ink-300 transition group-hover:text-brand-300" />
              <span className="text-xs font-medium text-ink-100">{a.label}</span>
              <span className="hidden text-[10px] text-ink-500 sm:block">{a.hint}</span>
              <kbd className="hidden rounded bg-ink-700 px-1 font-sans text-[10px] text-ink-300 sm:block">{a.key}</kbd>
            </button>
          ))}
        </div>
        <p className="mt-3 hidden text-center text-[11px] text-ink-500 sm:block">
          Scroll to zoom · <span className="text-ink-300">Space</span> + drag to pan · right-click for actions · <span className="text-ink-300">?</span> for all shortcuts
        </p>
      </div>
    </div>
  )
}
