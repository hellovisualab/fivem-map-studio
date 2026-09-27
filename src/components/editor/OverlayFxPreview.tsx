import { useRadarSource } from '@/lib/radarSource'
import type { OverlayFx } from '@/types'
import { RadarFxPreview } from './RadarFxPreview'

/** Floating in-game preview of the radar overlay, where the radar sits on screen. */
export function OverlayFxPreview({ fx }: { fx: OverlayFx }) {
  const source = useRadarSource()
  if (!fx.ids.length) return null
  return (
    <div className="pointer-events-none absolute bottom-4 left-4 z-20 hidden w-[340px] md:block">
      <p className="mb-1 flex items-center justify-between text-[10px] font-semibold tracking-wider text-ink-400 uppercase">
        <span>In-game preview</span>
        <span className="font-mono tracking-normal text-ink-500 normal-case">1080p · /minimapoverlay</span>
      </p>
      <div className="overflow-hidden rounded-lg border border-white/15 shadow-[0_12px_40px_rgba(0,0,0,0.55)]">
        <RadarFxPreview fx={fx} source={source} variant="hud" className="block aspect-[11/8] w-full bg-ink-950" />
      </div>
    </div>
  )
}
