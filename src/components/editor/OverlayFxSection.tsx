import type { ReactNode } from 'react'
import { Sparkles } from 'lucide-react'
import { useEditor } from '@/store/useEditor'
import { FX_SURFACES, OVERLAY_FX, overlayFxOf, overlayFxUsesColor, toggleOverlayFx } from '@/lib/overlayFx'
import { cn } from '@/lib/utils'
import { useRadarSource } from '@/lib/radarSource'
import type { OverlayFx } from '@/types'
import { RadarFxPreview } from './RadarFxPreview'
import { OverlayFxPreviewCard } from './OverlayFxPreview'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  )
}

function Slider({ value, onChange, min, max, step = 0.01 }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number }) {
  return <input type="range" className="w-full" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
}

export function OverlayFxSection() {
  const doc = useEditor((s) => s.doc)!
  const { updateDocument } = useEditor.getState()
  const fx = overlayFxOf(doc)
  const setFx = (patch: Partial<OverlayFx>) => updateDocument({ overlayFx: { ...fx, ...patch } })
  const colorActive = overlayFxUsesColor(fx.ids)
  const preview = fx.ids.length ? fx : { ...fx, intensity: 0.8, speed: 1.15 }
  const source = useRadarSource()

  return (
    <div className="border-b border-ink-700/60 px-3 py-3 last:border-b-0">
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-ink-500 uppercase">
          <Sparkles className="h-3 w-3" /> Overlay effects
        </p>
        {fx.ids.length > 0 && (
          <button type="button" className="text-[11px] text-ink-400 hover:text-ink-200" onClick={() => setFx({ ids: [] })}>
            Clear
          </button>
        )}
      </div>
      <div className="space-y-2.5">
        <p className="text-[11px] text-ink-500">
          Animated effects the exported NUI page draws over the in-game minimap, the expanded radar and the pause menu map (players toggle them with{' '}
          <span className="font-mono text-ink-400">/minimapoverlay</span>). The previews show your map around the selected element.
        </p>
        {fx.ids.length > 0 && <OverlayFxPreviewCard fx={fx} className="md:hidden" />}
        <div className="grid grid-cols-2 gap-1.5">
          {OVERLAY_FX.map((item) => {
            const on = fx.ids.includes(item.id)
            return (
              <button
                key={item.id}
                type="button"
                title={item.blurb}
                aria-pressed={on}
                onClick={() => setFx({ ids: toggleOverlayFx(fx.ids, item.id) })}
                className={cn(
                  'rounded-xl border p-2 text-left transition',
                  on ? 'border-brand-500/50 bg-brand-500/10' : 'border-ink-700 bg-ink-900/40 hover:border-ink-500',
                )}
              >
                <div className="mb-1.5 overflow-hidden rounded-md bg-ink-950">
                  <RadarFxPreview fx={preview} ids={[item.id]} source={source} fps={30} className="block h-16 w-full" />
                </div>
                <span className="block text-[11px] font-medium text-ink-100">{item.label}</span>
                <span className="block text-[10px] leading-snug text-ink-500">{item.blurb}</span>
              </button>
            )
          })}
        </div>
        {fx.ids.length > 0 && (
          <>
            <div>
              <span className="label">Plays on</span>
              <div className="grid grid-cols-3 gap-1.5">
                {FX_SURFACES.map((s) => {
                  const on = fx.targets?.[s.id] !== false
                  return (
                    <button
                      key={s.id}
                      type="button"
                      role="switch"
                      aria-checked={on}
                      onClick={() => setFx({ targets: { radar: true, bigmap: true, pause: true, ...fx.targets, [s.id]: !on } })}
                      className={cn(
                        'rounded-lg border px-1.5 py-1.5 text-left transition',
                        on ? 'border-brand-500/50 bg-brand-500/10 text-ink-100' : 'border-ink-700 text-ink-500 hover:border-ink-500',
                      )}
                    >
                      <span className="block text-[10px] font-semibold">{s.label}</span>
                      <span className="block text-[9px] leading-snug text-ink-500">{s.blurb}</span>
                    </button>
                  )
                })}
              </div>
            </div>
            <Field label={`Intensity · ${Math.round(fx.intensity * 100)}%`}>
              <Slider value={fx.intensity} min={0.15} max={1} onChange={(v) => setFx({ intensity: v })} />
            </Field>
            <Field label={`Speed · ${fx.speed.toFixed(2)}×`}>
              <Slider value={fx.speed} min={0.25} max={3} step={0.05} onChange={(v) => setFx({ speed: v })} />
            </Field>
            <Field label={colorActive ? 'Effect color' : 'Effect color (glow, radar, shimmer, ripple)'}>
              <div className={cn('flex items-center gap-2', !colorActive && 'opacity-50')}>
                <input type="color" value={fx.color} onChange={(e) => setFx({ color: e.target.value })} disabled={!colorActive} />
                <input className="field-sm font-mono" value={fx.color} onChange={(e) => setFx({ color: e.target.value })} disabled={!colorActive} />
              </div>
            </Field>
          </>
        )}
      </div>
    </div>
  )
}
