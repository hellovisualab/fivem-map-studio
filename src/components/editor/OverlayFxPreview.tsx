import { OverlayFxCanvas } from './OverlayFxCanvas'
import type { OverlayFx } from '@/types'

export function OverlayFxPreview({
  fx,
  x,
  y,
  width,
  height,
  map,
}: {
  fx: OverlayFx
  x: number
  y: number
  width: number
  height: number
  map?: CanvasImageSource | null
}) {
  if (!fx.ids.length || width <= 0 || height <= 0) return null
  return (
    <>
      <OverlayFxCanvas
        fx={fx}
        pixelCap={1600}
        className="pointer-events-none absolute z-[6] rounded-[6px]"
        style={{ left: x, top: y, width, height }}
      />
      <div className="pointer-events-none absolute bottom-4 left-4 z-20 w-[168px]">
        <p className="mb-1 text-[10px] font-semibold tracking-wider text-ink-400 uppercase">NUI live preview</p>
        <div className="overflow-hidden rounded-md border border-white/15 shadow-[0_12px_40px_rgba(0,0,0,0.55)]">
          <OverlayFxCanvas fx={fx} backdrop={map ?? 'mini'} className="block aspect-[3/4] w-full bg-ink-950" />
        </div>
      </div>
    </>
  )
}
