import { useState } from 'react'
import { useRadarSource } from '@/lib/radarSource'
import { FX_SURFACES } from '@/lib/overlayFx'
import { cn } from '@/lib/utils'
import type { OverlayFx } from '@/types'
import type { RadarSurface } from '@/lib/overlayRuntime'
import { RadarFxPreview } from './RadarFxPreview'

/** In-game preview of the overlay on the minimap, the expanded radar or the pause map. */
export function OverlayFxPreviewCard({ fx, className }: { fx: OverlayFx; className?: string }) {
  const source = useRadarSource()
  const [surface, setSurface] = useState<RadarSurface>('radar')
  const off = fx.targets?.[surface] === false
  return (
    <div className={className}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="pointer-events-auto flex rounded-md border border-white/10 bg-ink-900/85 p-0.5 text-[10px] font-semibold backdrop-blur" role="tablist">
          {FX_SURFACES.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={surface === s.id}
              title={s.blurb}
              onClick={() => setSurface(s.id)}
              className={cn('rounded px-2 py-0.5 transition', surface === s.id ? 'bg-brand-500/25 text-brand-200' : 'text-ink-400 hover:text-ink-200')}
            >
              {s.short}
            </button>
          ))}
        </div>
        <span className={cn('font-mono text-[10px]', off ? 'text-amber-300' : 'text-ink-500')}>{off ? 'off in game' : '1080p'}</span>
      </div>
      <div className="overflow-hidden rounded-lg border border-white/15 shadow-[0_12px_40px_rgba(0,0,0,0.55)]">
        <RadarFxPreview
          fx={fx}
          source={source}
          variant="hud"
          surface={surface}
          className={cn('block w-full bg-ink-950', surface === 'pause' ? 'aspect-video' : 'aspect-[11/8]', off && 'opacity-60')}
        />
      </div>
    </div>
  )
}

/** Floating in-game preview over the editor canvas (desktop). */
export function OverlayFxPreview({ fx }: { fx: OverlayFx }) {
  if (!fx.ids.length) return null
  return <OverlayFxPreviewCard fx={fx} className="pointer-events-none absolute bottom-4 left-4 z-20 hidden w-[340px] md:block" />
}
