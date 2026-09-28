import { useMemo, useRef, useState, type ReactNode } from 'react'
import * as THREE from 'three'
import { ArrowDown, ArrowUp, Box, Check, Eye, EyeOff, ImagePlus, Palette, Plus, Shield, SlidersHorizontal, Trash2, Triangle, Wrench, X } from 'lucide-react'
import { evaluateObject, objectMatrix } from '@/lib/modeler/build'
import { MODIFIER_LABELS, docBounds, docStats } from '@/lib/modeler/doc'
import { meshBounds, meshStats } from '@/lib/modeler/mesh'
import {
  addCollisionBox,
  addMaterialSlot,
  addModifier,
  applyModifierById,
  applyTransforms,
  assignMaterial,
  cubeProjectSelection,
  dropToGround,
  mergeVerts,
  moveModifier,
  newMaterialForSlot,
  recalcSelection,
  flipSelection,
  removeMaterialSlot,
  removeModifier,
  renameObject,
  selectBySlot,
  setOriginSelected,
  setRole,
  setSlotMaterial,
  shadeObjects,
  shadeSelection,
  updateMaterial,
  updateModifier,
  updateObject,
} from '@/lib/modeler/ops'
import type { ModelMaterial, ModelObject, Modifier, Vec3 } from '@/lib/modeler/types'
import { activeObject, useModeler, withObject } from '@/store/useModeler'
import { toast } from '@/components/ui/Toast'
import { cn, readFileAsDataURL, loadImage } from '@/lib/utils'

const st = () => useModeler.getState()
const RAD = 180 / Math.PI

/* ---------------------------------------------------------------------------------------- */
/* Inputs                                                                                    */

/** Evaluates + - * / and parentheses; NaN when the text is not a valid expression. */
function evalArithmetic(text: string): number {
  const src = text.replace(/\s+/g, '')
  let i = 0
  const num = (): number => {
    if (src[i] === '(') {
      i++
      const v = sum()
      if (src[i] !== ')') return NaN
      i++
      return v
    }
    if (src[i] === '-' || src[i] === '+') {
      const sign = src[i] === '-' ? -1 : 1
      i++
      return sign * num()
    }
    const m = /^(\d+\.?\d*|\.\d+)(e[-+]?\d+)?/i.exec(src.slice(i))
    if (!m) return NaN
    i += m[0].length
    return Number(m[0])
  }
  const product = (): number => {
    let v = num()
    while (src[i] === '*' || src[i] === '/') {
      const op = src[i++]
      const r = num()
      v = op === '*' ? v * r : v / r
    }
    return v
  }
  const sum = (): number => {
    let v = product()
    while (src[i] === '+' || src[i] === '-') {
      const op = src[i++]
      const r = product()
      v = op === '+' ? v + r : v - r
    }
    return v
  }
  const v = sum()
  return i === src.length ? v : NaN
}

/**
 * Number field: type a value, or drag the label sideways to scrub it (like Blender).
 * Scrubbing is one undo step.
 */
export function NumInput({
  label,
  value,
  onChange,
  step = 0.01,
  precision = 3,
  min,
  max,
  suffix,
  className,
}: {
  label?: string
  value: number
  onChange: (v: number, final: boolean) => void
  step?: number
  precision?: number
  min?: number
  max?: number
  suffix?: string
  className?: string
}) {
  const [text, setText] = useState<string | null>(null)
  const drag = useRef<{ x: number; v: number; moved: boolean } | null>(null)
  const clampV = (v: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v))
  const shown = text ?? (Number.isFinite(value) ? Number(value.toFixed(precision)).toString() : '0')
  const commitText = () => {
    if (text === null) return
    const expr = text.trim().replace(',', '.')
    setText(null)
    // simple arithmetic like Blender fields accept ("1.5*2", "0.3+0.1")
    const n = evalArithmetic(expr)
    if (Number.isFinite(n)) onChange(clampV(n), true)
  }
  return (
    <label className={cn('flex h-7 min-w-0 items-center overflow-hidden rounded-md border border-ink-700 bg-ink-900 text-[11px] focus-within:border-brand-500/70', className)}>
      {label && (
        <span
          className="flex h-full cursor-ew-resize items-center px-1.5 font-medium text-ink-400 select-none hover:bg-ink-800 hover:text-ink-200"
          onPointerDown={(e) => {
            e.preventDefault()
            ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
            drag.current = { x: e.clientX, v: value, moved: false }
          }}
          onPointerMove={(e) => {
            const d = drag.current
            if (!d) return
            const dx = e.clientX - d.x
            if (!d.moved && Math.abs(dx) < 2) return
            if (!d.moved) st().begin()
            d.moved = true
            const k = e.shiftKey ? 0.1 : e.ctrlKey ? 10 : 1
            onChange(clampV(d.v + dx * step * k), false)
          }}
          onPointerUp={() => {
            const d = drag.current
            drag.current = null
            if (d?.moved) st().end(true)
          }}
        >
          {label}
        </span>
      )}
      <input
        className="h-full w-full min-w-0 bg-transparent px-1.5 text-right font-mono text-ink-100 outline-none"
        value={shown}
        inputMode="decimal"
        onFocus={(e) => {
          setText(shown)
          requestAnimationFrame(() => e.target.select())
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={commitText}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') {
            setText(null)
            ;(e.target as HTMLInputElement).blur()
          }
          e.stopPropagation()
        }}
      />
      {suffix && <span className="pr-1.5 text-ink-500">{suffix}</span>}
    </label>
  )
}

function Vec3Fields({ label, value, onChange, step, precision = 3, suffix, min }: { label: string; value: Vec3; onChange: (v: Vec3, final: boolean) => void; step?: number; precision?: number; suffix?: string; min?: number }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-semibold tracking-wider text-ink-500 uppercase">{label}</p>
      <div className="grid grid-cols-3 gap-1">
        {(['X', 'Y', 'Z'] as const).map((axis, i) => (
          <NumInput
            key={axis}
            label={axis}
            value={value[i]}
            step={step}
            precision={precision}
            suffix={suffix}
            min={min}
            onChange={(v, final) => {
              const next: Vec3 = [...value]
              next[i] = v
              onChange(next, final)
            }}
          />
        ))}
      </div>
    </div>
  )
}

function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="rounded-lg border border-ink-800 bg-ink-900/50">
      <div className="flex items-center justify-between border-b border-ink-800 px-2.5 py-1.5">
        <span className="text-[11px] font-semibold text-ink-300">{title}</span>
        {right}
      </div>
      <div className="space-y-2 p-2.5">{children}</div>
    </div>
  )
}

function SmallButton({ children, onClick, active, title, danger, className }: { children: ReactNode; onClick: () => void; active?: boolean; title?: string; danger?: boolean; className?: string }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        'inline-flex h-7 items-center justify-center gap-1 rounded-md border px-2 text-[11px] transition',
        active ? 'border-brand-500/60 bg-brand-500/15 text-brand-200' : danger ? 'border-red-500/30 text-red-300 hover:bg-red-500/10' : 'border-ink-700 bg-ink-900 text-ink-300 hover:border-ink-500 hover:text-white',
        className,
      )}
    >
      {children}
    </button>
  )
}

/* ---------------------------------------------------------------------------------------- */
/* Outliner                                                                                  */

function Outliner() {
  const objects = useModeler((s) => s.doc.objects)
  const selected = useModeler((s) => s.selected)
  const active = useModeler((s) => s.active)
  const mode = useModeler((s) => s.mode)
  const [renaming, setRenaming] = useState<string | null>(null)
  return (
    <div className="max-h-[210px] min-h-[92px] overflow-auto rounded-lg border border-ink-800 bg-ink-900/50 py-1">
      {!objects.length && <p className="px-3 py-4 text-center text-[11px] text-ink-500">Empty scene · Shift+A to add</p>}
      {objects.map((o) => (
        <div
          key={o.id}
          onClick={(e) => {
            const s = st()
            if (s.mode === 'edit' && o.id !== s.active) s.commit({ mode: 'object' })
            if (e.shiftKey) s.commit({ selected: s.selected.includes(o.id) ? s.selected.filter((x) => x !== o.id) : [...s.selected, o.id], active: o.id })
            else s.commit({ selected: [o.id], active: o.id })
          }}
          onDoubleClick={() => setRenaming(o.id)}
          className={cn(
            'flex cursor-default items-center gap-2 px-2 py-1 text-[12px]',
            o.id === active ? 'bg-brand-500/15 text-white' : selected.includes(o.id) ? 'bg-white/5 text-ink-100' : 'text-ink-300 hover:bg-white/5',
          )}
        >
          {o.role === 'collision' ? <Shield className="h-3.5 w-3.5 shrink-0 text-accent-400" /> : <Triangle className="h-3.5 w-3.5 shrink-0 text-orange-300" />}
          {renaming === o.id ? (
            <input
              autoFocus
              defaultValue={o.name}
              className="field field-sm h-6 py-0"
              onClick={(e) => e.stopPropagation()}
              onBlur={(e) => {
                renameObject(o.id, e.target.value)
                setRenaming(null)
              }}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                if (e.key === 'Escape') setRenaming(null)
              }}
            />
          ) : (
            <span className="min-w-0 flex-1 truncate">
              {o.name}
              {mode === 'edit' && o.id === active && <span className="ml-1.5 text-[10px] text-orange-300">editing</span>}
            </span>
          )}
          <button
            type="button"
            title={o.visible ? 'Hide (H)' : 'Show'}
            className="text-ink-500 hover:text-white"
            onClick={(e) => {
              e.stopPropagation()
              updateObject(o.id, { visible: !o.visible })
            }}
          >
            {o.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </button>
        </div>
      ))}
    </div>
  )
}

/* ---------------------------------------------------------------------------------------- */
/* Tabs                                                                                      */

function ObjectTab({ obj }: { obj: ModelObject }) {
  const mode = useModeler((s) => s.mode)
  const meshSel = useModeler((s) => s.meshSel)
  const set = (patch: Partial<ModelObject>, final: boolean) => updateObject(obj.id, patch, final && !st().txn)
  const localSize = useMemo(() => {
    const { min, max } = meshBounds(evaluateObject(obj))
    return [max[0] - min[0], max[1] - min[1], max[2] - min[2]] as Vec3
  }, [obj])
  const dims: Vec3 = [localSize[0] * Math.abs(obj.scale[0]), localSize[1] * Math.abs(obj.scale[1]), localSize[2] * Math.abs(obj.scale[2])]

  const median = useMemo(() => {
    if (mode !== 'edit' || !meshSel.verts.size) return null
    const m = objectMatrix(obj)
    const c = new THREE.Vector3()
    let n = 0
    for (const v of meshSel.verts) {
      const p = obj.mesh.verts[v]
      if (!p) continue
      c.add(new THREE.Vector3(...p).applyMatrix4(m))
      n++
    }
    return n ? ([c.x / n, c.y / n, c.z / n] as Vec3) : null
  }, [mode, meshSel, obj])

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="text-[10px] font-semibold tracking-wider text-ink-500 uppercase">Name</span>
        <input key={obj.id + obj.name} className="field field-sm mt-1" defaultValue={obj.name} onBlur={(e) => renameObject(obj.id, e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
      </label>
      <div className="grid grid-cols-2 gap-1">
        <SmallButton active={obj.role === 'visual'} onClick={() => setRole(obj.id, 'visual')} title="Rendered in game">
          <Triangle className="h-3 w-3" /> Visual
        </SmallButton>
        <SmallButton active={obj.role === 'collision'} onClick={() => setRole(obj.id, 'collision')} title="Invisible, becomes the collision in game">
          <Shield className="h-3 w-3" /> Collision
        </SmallButton>
      </div>
      {median && (
        <Vec3Fields
          label="Median (selected vertices)"
          value={median}
          step={0.01}
          suffix="m"
          onChange={(v, final) => {
            const s = st()
            const o = activeObject(s)
            if (!o) return
            const inv = objectMatrix(o).invert()
            const d = new THREE.Vector3(...v).applyMatrix4(inv).sub(new THREE.Vector3(...median).applyMatrix4(inv))
            const verts = o.mesh.verts.slice()
            for (const i of s.meshSel.verts) if (verts[i]) verts[i] = [verts[i][0] + d.x, verts[i][1] + d.y, verts[i][2] + d.z]
            const doc = withObject(s.doc, o.id, (x) => ({ ...x, mesh: { verts, faces: x.mesh.faces } }))
            if (final && !s.txn) s.commit({ doc })
            else s.live({ doc })
          }}
        />
      )}
      <Vec3Fields label="Location" value={obj.position} step={0.01} suffix="m" onChange={(position, f) => set({ position }, f)} />
      <Vec3Fields
        label="Rotation"
        value={obj.rotation.map((r) => r * RAD) as Vec3}
        step={1}
        precision={2}
        suffix="°"
        onChange={(deg, f) => set({ rotation: deg.map((d) => d / RAD) as Vec3 }, f)}
      />
      <Vec3Fields label="Scale" value={obj.scale} step={0.01} onChange={(scale, f) => set({ scale: scale.map((x) => (Math.abs(x) < 1e-4 ? 1e-4 : x)) as Vec3 }, f)} />
      <Vec3Fields
        label="Dimensions"
        value={dims}
        step={0.01}
        suffix="m"
        min={0.0001}
        onChange={(d, f) => set({ scale: obj.scale.map((s, i) => (localSize[i] > 1e-9 ? (Math.sign(s) || 1) * (d[i] / localSize[i]) : s)) as Vec3 }, f)}
      />
      <div className="grid grid-cols-2 gap-1">
        <SmallButton onClick={() => applyTransforms({ rotation: true, scale: true })} title="Bake rotation and scale into the mesh (Ctrl+A)">
          Apply rot + scale
        </SmallButton>
        <SmallButton onClick={() => setOriginSelected('bottom')} title="Origin at the bottom centre of the object">
          Origin to bottom
        </SmallButton>
      </div>
    </div>
  )
}

function ModifierCard({ mod, index, count }: { mod: Modifier; index: number; count: number }) {
  const up = (patch: Partial<Modifier>, final = true) => {
    const obj = activeObject(st())
    if (!obj) return
    if (final && !st().txn) updateModifier(mod.id, patch)
    else st().live({ doc: withObject(st().doc, obj.id, (o) => ({ ...o, modifiers: o.modifiers.map((m) => (m.id === mod.id ? ({ ...m, ...patch } as Modifier) : m)) })) })
  }
  return (
    <Section
      title={MODIFIER_LABELS[mod.kind]}
      right={
        <div className="flex items-center gap-0.5">
          <button type="button" title={mod.enabled ? 'Disable' : 'Enable'} className={cn('rounded p-1', mod.enabled ? 'text-brand-300' : 'text-ink-600')} onClick={() => updateModifier(mod.id, { enabled: !mod.enabled })}>
            <Eye className="h-3.5 w-3.5" />
          </button>
          <button type="button" title="Move up" disabled={index === 0} className="rounded p-1 text-ink-400 hover:text-white disabled:opacity-30" onClick={() => moveModifier(mod.id, -1)}>
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button type="button" title="Move down" disabled={index === count - 1} className="rounded p-1 text-ink-400 hover:text-white disabled:opacity-30" onClick={() => moveModifier(mod.id, 1)}>
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
          <button type="button" title="Remove" className="rounded p-1 text-ink-400 hover:text-red-300" onClick={() => removeModifier(mod.id)}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      }
    >
      {mod.kind === 'mirror' && (
        <>
          <div className="grid grid-cols-3 gap-1">
            {(['X', 'Y', 'Z'] as const).map((a, i) => (
              <SmallButton
                key={a}
                active={mod.axes[i]}
                onClick={() => {
                  const axes = [...mod.axes] as [boolean, boolean, boolean]
                  axes[i] = !axes[i]
                  up({ axes })
                }}
              >
                {a}
              </SmallButton>
            ))}
          </div>
          <NumInput label="Merge" value={mod.mergeDistance} step={0.0005} precision={4} min={0} suffix="m" onChange={(v, f) => up({ mergeDistance: v }, f)} />
          <p className="text-[10px] text-ink-500">Mirrors across the object origin. Model one half; vertices on the centre line are welded.</p>
        </>
      )}
      {mod.kind === 'array' && (
        <>
          <NumInput label="Count" value={mod.count} step={0.1} precision={0} min={1} max={64} onChange={(v, f) => up({ count: Math.round(v) }, f)} />
          <Vec3Fields label="Relative offset (× size)" value={mod.relative} step={0.01} onChange={(relative, f) => up({ relative }, f)} />
          <Vec3Fields label="Constant offset" value={mod.constant} step={0.01} suffix="m" onChange={(constant, f) => up({ constant }, f)} />
        </>
      )}
      {mod.kind === 'subsurf' && (
        <>
          <div className="grid grid-cols-4 gap-1">
            {[0, 1, 2, 3].map((l) => (
              <SmallButton key={l} active={mod.levels === l} onClick={() => up({ levels: l })}>
                {l}
              </SmallButton>
            ))}
          </div>
          <p className="text-[10px] text-ink-500">Each level multiplies the faces by 4 — keep props light (level 1–2).</p>
        </>
      )}
      {mod.kind === 'solidify' && <NumInput label="Thickness" value={mod.thickness} step={0.002} precision={4} suffix="m" onChange={(v, f) => up({ thickness: v }, f)} />}
      <SmallButton className="w-full" onClick={() => applyModifierById(mod.id)} title="Bake this modifier (and the ones above) into the mesh">
        <Check className="h-3 w-3" /> Apply
      </SmallButton>
    </Section>
  )
}

function ModifiersTab({ obj }: { obj: ModelObject }) {
  return (
    <div className="space-y-2">
      <select
        className="field field-sm"
        value=""
        onChange={(e) => {
          if (e.target.value) addModifier(e.target.value as Modifier['kind'])
        }}
      >
        <option value="">Add modifier…</option>
        <option value="mirror">Mirror</option>
        <option value="array">Array</option>
        <option value="subsurf">Subdivision Surface</option>
        <option value="solidify">Solidify</option>
      </select>
      {!obj.modifiers.length && <p className="px-1 py-3 text-center text-[11px] text-ink-500">No modifiers. They are applied when the prop is exported.</p>}
      {obj.modifiers.map((m, i) => (
        <ModifierCard key={m.id} mod={m} index={i} count={obj.modifiers.length} />
      ))}
    </div>
  )
}

async function textureDataUrl(file: File) {
  const url = await readFileAsDataURL(file)
  const img = await loadImage(url)
  const max = 2048
  if (img.width <= max && img.height <= max) return url
  const k = max / Math.max(img.width, img.height)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * k)
  canvas.height = Math.round(img.height * k)
  canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL(file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png', 0.92)
}

function MaterialEditor({ mat }: { mat: ModelMaterial }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const up = (patch: Partial<ModelMaterial>, final = true) => updateMaterial(mat.id, patch, final && !st().txn)
  return (
    <div className="space-y-2">
      <input key={mat.id + mat.name} className="field field-sm" defaultValue={mat.name} onBlur={(e) => e.target.value.trim() && up({ name: e.target.value.trim() })} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={mat.color}
          onFocus={() => st().begin()}
          onInput={(e) => up({ color: (e.target as HTMLInputElement).value }, false)}
          onBlur={() => st().txn && st().end(true)}
        />
        <div className="min-w-0 flex-1">
          {mat.texture ? (
            <div className="flex items-center gap-2">
              <img src={mat.texture} alt="" className="h-9 w-9 rounded border border-ink-700 object-cover" />
              <SmallButton onClick={() => fileRef.current?.click()}>Replace</SmallButton>
              <SmallButton danger onClick={() => up({ texture: undefined })}>
                <Trash2 className="h-3 w-3" />
              </SmallButton>
            </div>
          ) : (
            <SmallButton className="w-full" onClick={() => fileRef.current?.click()}>
              <ImagePlus className="h-3.5 w-3.5" /> Add texture
            </SmallButton>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            textureDataUrl(file)
              .then((texture) => up({ texture }))
              .catch(() => toast.error('Texture', 'Could not read that image.'))
          }}
        />
      </div>
      <div className="grid grid-cols-2 gap-1">
        <SmallButton active={mat.uvMode === 'box'} onClick={() => up({ uvMode: 'box' })} title="Texture keeps its real size on every face">
          Box projection
        </SmallButton>
        <SmallButton active={mat.uvMode === 'mesh'} onClick={() => up({ uvMode: 'mesh' })} title="Use the faces' UV coordinates">
          Mesh UVs
        </SmallButton>
      </div>
      {mat.uvMode === 'box' && <NumInput label="Tiles / m" value={mat.uvScale} step={0.01} precision={3} min={0.01} onChange={(v, f) => up({ uvScale: v }, f)} />}
      <NumInput label="Metallic" value={mat.metalness} step={0.01} precision={2} min={0} max={1} onChange={(v, f) => up({ metalness: v }, f)} />
      <NumInput label="Roughness" value={mat.roughness} step={0.01} precision={2} min={0} max={1} onChange={(v, f) => up({ roughness: v }, f)} />
      <NumInput label="Glow" value={mat.emissive} step={0.02} precision={2} min={0} max={10} onChange={(v, f) => up({ emissive: v }, f)} />
      <NumInput label="Opacity" value={mat.opacity} step={0.01} precision={2} min={0} max={1} onChange={(v, f) => up({ opacity: v }, f)} />
      <label className="flex items-center gap-2 text-[11px] text-ink-300">
        <input type="checkbox" checked={mat.doubleSided} onChange={(e) => up({ doubleSided: e.target.checked })} />
        Double sided (leaves, fences, signs)
      </label>
      <p className="text-[10px] leading-relaxed text-ink-500">In game the colour is baked into the texture (DXT). Glow uses the emissive shader; opacity below 1 uses the alpha shader.</p>
    </div>
  )
}

function MaterialTab({ obj }: { obj: ModelObject }) {
  const materials = useModeler((s) => s.doc.materials)
  const mode = useModeler((s) => s.mode)
  const [slot, setSlot] = useState(0)
  const current = Math.min(slot, obj.materials.length - 1)
  const mat = materials.find((m) => m.id === obj.materials[current])
  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-ink-800 bg-ink-900/50 py-1">
        {obj.materials.map((id, i) => {
          const m = materials.find((x) => x.id === id)
          return (
            <button key={`${id}-${i}`} type="button" onClick={() => setSlot(i)} className={cn('flex w-full items-center gap-2 px-2 py-1 text-left text-[12px]', i === current ? 'bg-brand-500/15 text-white' : 'text-ink-300 hover:bg-white/5')}>
              {m?.texture ? <img src={m.texture} alt="" className="h-4 w-4 rounded-sm object-cover" /> : <span className="h-4 w-4 rounded-sm border border-white/10" style={{ background: m?.color ?? '#888' }} />}
              <span className="flex-1 truncate">{m?.name ?? 'Missing'}</span>
              <span className="text-[10px] text-ink-500">slot {i + 1}</span>
            </button>
          )
        })}
      </div>
      <div className="flex gap-1">
        <SmallButton onClick={addMaterialSlot} title="New slot with a new material">
          <Plus className="h-3 w-3" /> Slot
        </SmallButton>
        <SmallButton onClick={() => removeMaterialSlot(current)} title="Remove slot (faces go to slot 1)">
          <Trash2 className="h-3 w-3" />
        </SmallButton>
        <select className="field field-sm h-7 flex-1 py-0" value={obj.materials[current]} onChange={(e) => setSlotMaterial(current, e.target.value)}>
          {materials.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <SmallButton onClick={() => newMaterialForSlot(current)} title="New material in this slot">
          New
        </SmallButton>
      </div>
      {mode === 'edit' && (
        <div className="grid grid-cols-3 gap-1">
          <SmallButton onClick={() => assignMaterial(current)} title="Selected faces use this slot">
            Assign
          </SmallButton>
          <SmallButton onClick={() => selectBySlot(current, true)}>Select</SmallButton>
          <SmallButton onClick={() => selectBySlot(current, false)}>Deselect</SmallButton>
        </div>
      )}
      {mat && <MaterialEditor mat={mat} />}
    </div>
  )
}

function MeshTab({ obj }: { obj: ModelObject }) {
  const mode = useModeler((s) => s.mode)
  const [tiles, setTiles] = useState(1)
  const base = useMemo(() => meshStats(obj.mesh), [obj.mesh])
  const evaluated = useMemo(() => (obj.modifiers.some((m) => m.enabled) ? meshStats(evaluateObject(obj)) : null), [obj])
  const edit = mode === 'edit'
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-1 text-center text-[10px] text-ink-400">
        {(
          [
            ['Verts', base.verts],
            ['Edges', base.edges],
            ['Faces', base.faces],
            ['Tris', base.tris],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="rounded-md border border-ink-800 bg-ink-900/50 py-1.5">
            <p className="font-mono text-[12px] text-ink-100">{v.toLocaleString()}</p>
            {k}
          </div>
        ))}
      </div>
      {evaluated && <p className="text-[10px] text-ink-500">With modifiers: {evaluated.tris.toLocaleString()} tris</p>}
      <Section title="Shading">
        <div className="grid grid-cols-2 gap-1">
          <SmallButton onClick={() => (edit ? shadeSelection(true) : shadeObjects(true))}>Smooth</SmallButton>
          <SmallButton onClick={() => (edit ? shadeSelection(false) : shadeObjects(false))}>Flat</SmallButton>
        </div>
        <NumInput label="Auto smooth" value={obj.autoSmooth} step={0.5} precision={1} min={0} max={180} suffix="°" onChange={(v, f) => updateObject(obj.id, { autoSmooth: v }, f && !st().txn)} />
        <p className="text-[10px] text-ink-500">Smooth faces stay sharp where they meet at more than this angle.</p>
      </Section>
      <Section title="Normals">
        <div className="grid grid-cols-2 gap-1">
          <SmallButton onClick={() => recalcSelection(false, !edit)}>Recalculate</SmallButton>
          <SmallButton onClick={() => flipSelection(!edit)}>Flip</SmallButton>
        </div>
      </Section>
      <Section title="UV">
        <NumInput label="Tiles / m" value={tiles} step={0.01} min={0.01} onChange={(v) => setTiles(v)} />
        <SmallButton className="w-full" onClick={() => cubeProjectSelection(tiles, !edit)}>
          Cube projection {edit ? '(selected faces)' : '(whole mesh)'}
        </SmallButton>
        <p className="text-[10px] text-ink-500">Used by materials set to “Mesh UVs”.</p>
      </Section>
      <SmallButton
        className="w-full"
        onClick={() => {
          const n = mergeVerts('distance', !edit)
          toast.info('Merge by distance', `Removed ${n} vertex${n === 1 ? '' : 'es'}`)
        }}
      >
        Merge by distance
      </SmallButton>
    </div>
  )
}

function GtaTab() {
  const doc = useModeler((s) => s.doc)
  const active = useModeler((s) => s.active)
  const stats = useMemo(() => docStats(doc), [doc])
  const bounds = useMemo(() => docBounds(doc, (o) => o.role === 'visual'), [doc])
  const size = bounds.isEmpty() ? new THREE.Vector3() : bounds.getSize(new THREE.Vector3())
  const collisions = doc.objects.filter((o) => o.role === 'collision')
  const obj = doc.objects.find((o) => o.id === active)
  const warnings: string[] = []
  if (stats.tris > 30000) warnings.push('Over 30k triangles: heavy for a prop. Lower subdivision or simplify.')
  if (!bounds.isEmpty() && bounds.min.z < -0.05) warnings.push('Part of the model is below the ground (z < 0). The prop origin is the ground point.')
  if (!bounds.isEmpty() && Math.max(size.x, size.y, size.z) > 60) warnings.push('Very large prop: consider splitting it or using a map (ymap) instead.')
  return (
    <div className="space-y-3">
      <Section title="In game">
        <p className="text-[11px] text-ink-300">
          {stats.tris.toLocaleString()} tris · {size.x.toFixed(2)} × {size.y.toFixed(2)} × {size.z.toFixed(2)} m
        </p>
        <p className="text-[10px] leading-relaxed text-ink-500">Blender axes: Z up, Y forward. The world origin is the prop origin (placed on the ground when spawned). Modifiers are applied on export.</p>
        <SmallButton className="w-full" onClick={dropToGround}>
          Drop model to ground
        </SmallButton>
      </Section>
      <Section title={`Collision · ${collisions.length ? `${collisions.length} object${collisions.length === 1 ? '' : 's'}` : 'automatic'}`}>
        <p className="text-[10px] leading-relaxed text-ink-500">
          Objects marked <b className="text-accent-300">Collision</b> are invisible in game and become the collision embedded in the .ydr. Without them the prop uses the collision type chosen in the pack (box, convex, mesh…).
        </p>
        <div className="grid grid-cols-2 gap-1">
          <SmallButton onClick={addCollisionBox} title="Box that fits the active object">
            <Shield className="h-3 w-3" /> Add box
          </SmallButton>
          {obj && (
            <SmallButton onClick={() => setRole(obj.id, obj.role === 'collision' ? 'visual' : 'collision')}>
              {obj.role === 'collision' ? 'Make visual' : 'Make collision'}
            </SmallButton>
          )}
        </div>
      </Section>
      {!!warnings.length && (
        <div className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-[10px] text-amber-200">
          {warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </div>
      )}
    </div>
  )
}

type Tab = 'object' | 'modifiers' | 'material' | 'mesh' | 'gta'
const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: 'object', label: 'Object', icon: <SlidersHorizontal className="h-3.5 w-3.5" /> },
  { id: 'modifiers', label: 'Modifiers', icon: <Wrench className="h-3.5 w-3.5" /> },
  { id: 'material', label: 'Material', icon: <Palette className="h-3.5 w-3.5" /> },
  { id: 'mesh', label: 'Mesh', icon: <Box className="h-3.5 w-3.5" /> },
  { id: 'gta', label: 'FiveM', icon: <Shield className="h-3.5 w-3.5" /> },
]

export function ModelerPanels() {
  const obj = useModeler((s) => activeObject(s))
  const [tab, setTab] = useState<Tab>('object')
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2">
      <Outliner />
      <div className="flex gap-0.5 rounded-lg border border-ink-800 bg-ink-900/60 p-0.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            title={t.label}
            onClick={() => setTab(t.id)}
            className={cn('flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 text-[10px]', tab === t.id ? 'bg-brand-500/20 text-brand-200' : 'text-ink-400 hover:text-ink-100')}
          >
            {t.icon}
            <span className="hidden xl:inline">{t.label}</span>
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto pr-0.5">
        {tab === 'gta' ? (
          <GtaTab />
        ) : !obj ? (
          <p className="px-2 py-6 text-center text-[11px] text-ink-500">Select an object</p>
        ) : tab === 'object' ? (
          <ObjectTab obj={obj} />
        ) : tab === 'modifiers' ? (
          <ModifiersTab obj={obj} />
        ) : tab === 'material' ? (
          <MaterialTab obj={obj} />
        ) : (
          <MeshTab obj={obj} />
        )}
      </div>
    </div>
  )
}
