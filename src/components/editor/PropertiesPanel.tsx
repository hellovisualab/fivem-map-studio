import { useRef, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Copy, Grid3X3, Trash2, Upload } from 'lucide-react'
import { useEditor } from '@/store/useEditor'
import { useAuth } from '@/store/useAuth'
import { FONTS, MARKER_ICONS, PALETTE, ZONE_TYPES } from '@/lib/constants'
import { canvasToWorld, worldToCanvas } from '@/lib/geometry'
import { getData } from '@/lib/data'
import { importMinimapFiles } from '@/lib/importer'
import { cn, round } from '@/lib/utils'
import { toast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import type { MapElement, MarkerIcon, ZoneType } from '@/types'
import { MarkerGlyph } from './Toolbar'

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block', className)}>
      <span className="label">{label}</span>
      {children}
    </label>
  )
}

function NumberInput({
  value,
  onChange,
  step = 1,
  min,
  max,
  suffix,
}: {
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
  max?: number
  suffix?: string
}) {
  return (
    <div className="relative">
      <input
        type="number"
        className="field-sm pr-7 font-mono"
        value={Number.isFinite(value) ? round(value, 2) : 0}
        step={step}
        min={min}
        max={max}
        onChange={(e) => {
          const v = parseFloat(e.target.value)
          if (!Number.isNaN(v)) onChange(v)
        }}
      />
      {suffix && <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[10px] text-ink-500">{suffix}</span>}
    </div>
  )
}

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#ffffff'} onChange={(e) => onChange(e.target.value)} />
        <input className="field-sm font-mono" value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
      <div className="flex flex-wrap gap-1">
        {PALETTE.map((c) => (
          <button key={c} onClick={() => onChange(c)} className={cn('h-4 w-4 rounded border border-white/10 transition hover:scale-110', value === c && 'ring-1 ring-brand-400')} style={{ background: c }} />
        ))}
      </div>
    </div>
  )
}

function Slider({ value, onChange, min, max, step = 0.01 }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number }) {
  return <input type="range" className="w-full" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-b border-ink-700/60 px-3 py-3 last:border-b-0">
      <p className="mb-2 text-[11px] font-semibold tracking-wider text-ink-500 uppercase">{title}</p>
      <div className="space-y-2.5">{children}</div>
    </div>
  )
}

export function PropertiesPanel() {
  const doc = useEditor((s) => s.doc)
  const selectedIds = useEditor((s) => s.selectedIds)
  const selected = doc ? doc.elements.filter((e) => selectedIds.includes(e.id)) : []

  if (!doc) return null
  if (selected.length === 0) return <MapSettings />
  if (selected.length > 1) return <MultiSettings elements={selected} />
  return <ElementSettings el={selected[0]} />
}

function MapSettings() {
  const doc = useEditor((s) => s.doc)!
  const { updateDocument, commit } = useEditor.getState()
  const fileRef = useRef<HTMLInputElement>(null)

  const set = (patch: Partial<typeof doc.baseMap>) => updateDocument({ baseMap: { ...doc.baseMap, ...patch } })

  return (
    <div className="scrollbar-thin h-full overflow-y-auto">
      <div className="px-3 pt-3 pb-1">
        <h3 className="text-sm font-semibold">Map settings</h3>
        <p className="text-[11px] text-ink-500">Select an element to edit its properties.</p>
      </div>
      <Section title="Base map">
        <div className="flex items-center justify-between text-xs">
          <span className="text-ink-400">Preset</span>
          <span className="rounded-md bg-ink-800 px-2 py-0.5 font-medium capitalize">{doc.baseMap.preset}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-ink-400">Size</span>
          <span className="font-mono text-ink-300">
            {doc.baseMap.width} × {doc.baseMap.height}
          </span>
        </div>
        <Field label={`Brightness · ${Math.round(doc.baseMap.brightness * 100)}%`}>
          <Slider value={doc.baseMap.brightness} min={0.2} max={1.8} onChange={(v) => set({ brightness: v })} />
        </Field>
        <Field label="Tint">
          <ColorInput value={doc.baseMap.tint} onChange={(v) => set({ tint: v })} />
        </Field>
        <Field label={`Tint strength · ${Math.round(doc.baseMap.tintOpacity * 100)}%`}>
          <Slider value={doc.baseMap.tintOpacity} min={0} max={0.9} onChange={(v) => set({ tintOpacity: v })} />
        </Field>
        <Field label="Background">
          <ColorInput value={doc.background} onChange={(v) => updateDocument({ background: v })} />
        </Field>
        <Button variant="outline" size="sm" className="w-full" onClick={() => fileRef.current?.click()}>
          <Upload className="h-3.5 w-3.5" /> Replace base map
        </Button>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".png,.jpg,.jpeg,.webp,.zip"
          className="hidden"
          onChange={async (e) => {
            const files = e.target.files ? Array.from(e.target.files) : []
            e.target.value = ''
            if (!files.length) return
            try {
              const res = await importMinimapFiles(files)
              commit((d) => {
                d.baseMap = { ...d.baseMap, preset: 'custom', src: res.src, width: res.width, height: res.height }
              })
              toast.success('Base map replaced', `${res.width} × ${res.height}px`)
            } catch (err) {
              toast.error('Import failed', (err as Error).message)
            }
          }}
        />
      </Section>
      <Section title="Grid">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-xs text-ink-300">
            <Grid3X3 className="h-3.5 w-3.5" /> Show grid
          </span>
          <button
            onClick={() => updateDocument({ grid: { ...doc.grid, enabled: !doc.grid.enabled } })}
            className={cn('relative h-5 w-9 rounded-full transition', doc.grid.enabled ? 'bg-brand-500' : 'bg-ink-600')}
          >
            <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white transition', doc.grid.enabled ? 'left-4.5' : 'left-0.5')} />
          </button>
        </div>
        <Field label="Grid size (px)">
          <NumberInput value={doc.grid.size} min={8} step={8} onChange={(v) => updateDocument({ grid: { ...doc.grid, size: Math.max(8, v) } })} />
        </Field>
      </Section>
      <Section title="World bounds (GTA coords)">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Min X">
            <NumberInput value={doc.world.minX} onChange={(v) => updateDocument({ world: { ...doc.world, minX: v } })} />
          </Field>
          <Field label="Max X">
            <NumberInput value={doc.world.maxX} onChange={(v) => updateDocument({ world: { ...doc.world, maxX: v } })} />
          </Field>
          <Field label="Min Y">
            <NumberInput value={doc.world.minY} onChange={(v) => updateDocument({ world: { ...doc.world, minY: v } })} />
          </Field>
          <Field label="Max Y">
            <NumberInput value={doc.world.maxY} onChange={(v) => updateDocument({ world: { ...doc.world, maxY: v } })} />
          </Field>
        </div>
        <p className="text-[11px] text-ink-500">Used to convert pixels into in-game coordinates for zones and blips.</p>
      </Section>
    </div>
  )
}

function MultiSettings({ elements }: { elements: MapElement[] }) {
  const { updateElements, deleteSelected, duplicateSelected } = useEditor.getState()
  const ids = elements.map((e) => e.id)
  const avgOpacity = elements.reduce((a, e) => a + e.opacity, 0) / elements.length
  return (
    <div className="scrollbar-thin h-full overflow-y-auto">
      <div className="px-3 pt-3 pb-1">
        <h3 className="text-sm font-semibold">{elements.length} elements</h3>
        <p className="text-[11px] text-ink-500">Shift-click to add or remove from the selection.</p>
      </div>
      <Section title="Common">
        <Field label={`Opacity · ${Math.round(avgOpacity * 100)}%`}>
          <Slider value={avgOpacity} min={0.05} max={1} onChange={(v) => updateElements(ids, { opacity: v })} />
        </Field>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" className="flex-1" onClick={duplicateSelected}>
            <Copy className="h-3.5 w-3.5" /> Duplicate
          </Button>
          <Button variant="danger" size="sm" className="flex-1" onClick={deleteSelected}>
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
        </div>
      </Section>
    </div>
  )
}

function ElementSettings({ el }: { el: MapElement }) {
  const doc = useEditor((s) => s.doc)!
  const { updateElement, deleteSelected, duplicateSelected } = useEditor.getState()
  const user = useAuth((s) => s.user)
  const iconRef = useRef<HTMLInputElement>(null)
  const set = (patch: Partial<MapElement>) => updateElement(el.id, patch)
  const world = canvasToWorld(el.x, el.y, doc)

  return (
    <div className="scrollbar-thin h-full overflow-y-auto">
      <div className="px-3 pt-3 pb-1">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold capitalize">{el.type}</h3>
          <span className="font-mono text-[10px] text-ink-500">#{el.id.slice(0, 6)}</span>
        </div>
      </div>

      <Section title="General">
        <Field label="Name">
          <input className="field-sm" value={el.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="X (px)">
            <NumberInput value={el.x} onChange={(v) => set({ x: v })} />
          </Field>
          <Field label="Y (px)">
            <NumberInput value={el.y} onChange={(v) => set({ y: v })} />
          </Field>
          <Field label="World X">
            <NumberInput
              value={world.x}
              onChange={(v) => {
                const p = worldToCanvas(v, world.y, doc)
                set({ x: p.x })
              }}
            />
          </Field>
          <Field label="World Y">
            <NumberInput
              value={world.y}
              onChange={(v) => {
                const p = worldToCanvas(world.x, v, doc)
                set({ y: p.y })
              }}
            />
          </Field>
          <Field label="Rotation">
            <NumberInput value={el.rotation} step={1} suffix="°" onChange={(v) => set({ rotation: v })} />
          </Field>
          <Field label={`Opacity`}>
            <NumberInput value={round(el.opacity * 100, 0)} min={0} max={100} suffix="%" onChange={(v) => set({ opacity: Math.max(0, Math.min(1, v / 100)) })} />
          </Field>
        </div>
      </Section>

      <AnimatePresence mode="wait">
        <motion.div key={el.type} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          {el.type === 'text' && (
            <Section title="Text">
              <Field label="Content">
                <textarea className="field-sm resize-none" rows={2} value={el.text} onChange={(e) => set({ text: e.target.value } as Partial<MapElement>)} />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Size">
                  <NumberInput value={el.fontSize} min={6} onChange={(v) => set({ fontSize: Math.max(6, v) } as Partial<MapElement>)} />
                </Field>
                <Field label="Style">
                  <select className="field-sm" value={el.fontStyle} onChange={(e) => set({ fontStyle: e.target.value } as Partial<MapElement>)}>
                    <option value="normal">Regular</option>
                    <option value="bold">Bold</option>
                    <option value="italic">Italic</option>
                    <option value="bold italic">Bold italic</option>
                  </select>
                </Field>
              </div>
              <Field label="Font">
                <select className="field-sm" value={el.fontFamily} onChange={(e) => set({ fontFamily: e.target.value } as Partial<MapElement>)} style={{ fontFamily: el.fontFamily }}>
                  {FONTS.map((f) => (
                    <option key={f} value={f} style={{ fontFamily: f }}>
                      {f}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Color">
                <ColorInput value={el.fill} onChange={(v) => set({ fill: v } as Partial<MapElement>)} />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Outline">
                  <input type="color" value={el.stroke ?? '#000000'} onChange={(e) => set({ stroke: e.target.value } as Partial<MapElement>)} />
                </Field>
                <Field label="Outline width">
                  <NumberInput value={el.strokeWidth ?? 0} min={0} step={0.5} onChange={(v) => set({ strokeWidth: Math.max(0, v) } as Partial<MapElement>)} />
                </Field>
              </div>
            </Section>
          )}

          {el.type === 'zone' && (
            <Section title="Zone">
              <Field label="Type">
                <div className="grid grid-cols-2 gap-1">
                  {(Object.keys(ZONE_TYPES) as ZoneType[]).map((z) => (
                    <button
                      key={z}
                      onClick={() => set({ zoneType: z, fill: ZONE_TYPES[z].color, stroke: ZONE_TYPES[z].color } as Partial<MapElement>)}
                      className={cn(
                        'flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition',
                        el.zoneType === z ? 'bg-ink-700 text-ink-100 ring-1 ring-brand-500/50' : 'text-ink-300 hover:bg-ink-700/60',
                      )}
                    >
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: ZONE_TYPES[z].color }} />
                      {ZONE_TYPES[z].label}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Description">
                <textarea className="field-sm resize-none" rows={2} placeholder={ZONE_TYPES[el.zoneType].description} value={el.description} onChange={(e) => set({ description: e.target.value } as Partial<MapElement>)} />
              </Field>
              <Field label="Fill color">
                <ColorInput value={el.fill} onChange={(v) => set({ fill: v } as Partial<MapElement>)} />
              </Field>
              <Field label={`Transparency · ${Math.round(el.fillOpacity * 100)}%`}>
                <Slider value={el.fillOpacity} min={0} max={1} onChange={(v) => set({ fillOpacity: v } as Partial<MapElement>)} />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Border color">
                  <input type="color" value={el.stroke} onChange={(e) => set({ stroke: e.target.value } as Partial<MapElement>)} />
                </Field>
                <Field label="Border width">
                  <NumberInput value={el.strokeWidth} min={0} step={0.5} onChange={(v) => set({ strokeWidth: Math.max(0, v) } as Partial<MapElement>)} />
                </Field>
              </div>
              <label className="flex items-center justify-between text-xs text-ink-300">
                Show name on map
                <input type="checkbox" checked={el.showLabel} onChange={(e) => set({ showLabel: e.target.checked } as Partial<MapElement>)} className="accent-brand-500" />
              </label>
              <p className="text-[11px] text-ink-500">{el.points.length / 2} vertices</p>
            </Section>
          )}

          {el.type === 'line' && (
            <Section title="Line">
              <Field label="Color">
                <ColorInput value={el.stroke} onChange={(v) => set({ stroke: v } as Partial<MapElement>)} />
              </Field>
              <Field label="Width">
                <NumberInput value={el.strokeWidth} min={1} step={0.5} onChange={(v) => set({ strokeWidth: Math.max(0.5, v) } as Partial<MapElement>)} />
              </Field>
              <label className="flex items-center justify-between text-xs text-ink-300">
                Dashed
                <input type="checkbox" checked={el.dash} onChange={(e) => set({ dash: e.target.checked } as Partial<MapElement>)} className="accent-brand-500" />
              </label>
              <label className="flex items-center justify-between text-xs text-ink-300">
                Arrow head
                <input type="checkbox" checked={el.arrow} onChange={(e) => set({ arrow: e.target.checked } as Partial<MapElement>)} className="accent-brand-500" />
              </label>
            </Section>
          )}

          {el.type === 'image' && (
            <Section title="Image">
              <div className="overflow-hidden rounded-lg border border-ink-700 bg-ink-900">
                <img src={el.src} alt="" className="max-h-28 w-full object-contain" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Width">
                  <NumberInput value={el.width} min={1} onChange={(v) => set({ width: Math.max(1, v) } as Partial<MapElement>)} />
                </Field>
                <Field label="Height">
                  <NumberInput value={el.height} min={1} onChange={(v) => set({ height: Math.max(1, v) } as Partial<MapElement>)} />
                </Field>
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="w-full"
                onClick={() => {
                  const ratio = el.width / el.height
                  set({ height: el.width / ratio } as Partial<MapElement>)
                }}
              >
                Reset proportions
              </Button>
            </Section>
          )}

          {el.type === 'marker' && (
            <Section title="Marker">
              <Field label="Icon">
                <div className="grid grid-cols-3 gap-1">
                  {(Object.keys(MARKER_ICONS) as MarkerIcon[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => set({ icon: m, color: MARKER_ICONS[m].color, blipSprite: MARKER_ICONS[m].blip, label: el.label === MARKER_ICONS[el.icon].label ? MARKER_ICONS[m].label : el.label } as Partial<MapElement>)}
                      className={cn(
                        'flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] transition',
                        el.icon === m ? 'bg-ink-700 text-ink-100 ring-1 ring-brand-500/50' : 'text-ink-400 hover:bg-ink-700/60',
                      )}
                    >
                      <span className="flex h-6 w-6 items-center justify-center rounded-full ring-2 ring-white/80" style={{ background: MARKER_ICONS[m].color }}>
                        <MarkerGlyph icon={m} />
                      </span>
                      {MARKER_ICONS[m].label}
                    </button>
                  ))}
                </div>
              </Field>
              {el.icon === 'custom' && (
                <>
                  <Button variant="outline" size="sm" className="w-full" onClick={() => iconRef.current?.click()}>
                    <Upload className="h-3.5 w-3.5" /> {el.customSrc ? 'Replace icon image' : 'Upload icon image'}
                  </Button>
                  <input
                    ref={iconRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0]
                      e.target.value = ''
                      if (!f) return
                      try {
                        const url = user ? await getData().uploadAsset(user.id, f, 'marker-icon') : ''
                        set({ customSrc: url } as Partial<MapElement>)
                      } catch (err) {
                        toast.error('Upload failed', (err as Error).message)
                      }
                    }}
                  />
                </>
              )}
              <Field label="Label">
                <input className="field-sm" value={el.label} onChange={(e) => set({ label: e.target.value } as Partial<MapElement>)} />
              </Field>
              <Field label="Color">
                <ColorInput value={el.color} onChange={(v) => set({ color: v } as Partial<MapElement>)} />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Size">
                  <NumberInput value={el.size} min={8} onChange={(v) => set({ size: Math.max(8, v) } as Partial<MapElement>)} />
                </Field>
                <Field label="Blip sprite">
                  <NumberInput value={el.blipSprite} min={1} onChange={(v) => set({ blipSprite: Math.max(1, Math.round(v)) } as Partial<MapElement>)} />
                </Field>
              </div>
              <p className="text-[11px] text-ink-500">
                Blip sprite IDs follow the FiveM docs. World position: {world.x}, {world.y}
              </p>
            </Section>
          )}
        </motion.div>
      </AnimatePresence>

      <Section title="Actions">
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" className="flex-1" onClick={duplicateSelected}>
            <Copy className="h-3.5 w-3.5" /> Duplicate
          </Button>
          <Button variant="danger" size="sm" className="flex-1" onClick={deleteSelected} disabled={el.locked}>
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
        </div>
      </Section>
    </div>
  )
}
