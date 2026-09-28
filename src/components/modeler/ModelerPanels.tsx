import { useMemo, useRef, useState, type ReactNode } from 'react'
import * as THREE from 'three'
import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronRight, Copy, Eye, EyeOff, ImagePlus, PencilRuler, Plus, Shield, Trash2, Triangle, Wrench, X } from 'lucide-react'
import { evaluateObject, objectMatrix } from '@/lib/modeler/build'
import { MODIFIER_GROUPS, MODIFIER_LABELS, docBounds, docStats } from '@/lib/modeler/doc'
import { meshBounds, meshStats } from '@/lib/modeler/mesh'
import {
  addCollisionBox,
  addMaterialSlot,
  addModifier,
  applyModifierById,
  applyTransforms,
  assignMaterial,
  duplicateModifier,
  setBooleanTarget,
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
import { PANEL_TABS, type PanelTab } from '@/components/modeler/panelTabs'
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
    <label className={cn('flex h-7 min-w-0 items-center overflow-hidden rounded-md border border-ink-700 bg-ink-900 text-[11px] focus-within:border-brand-500/70 pointer-coarse:h-9', className)}>
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
        className="h-full w-full min-w-0 bg-transparent px-1.5 text-right font-mono text-ink-100 outline-none pointer-coarse:text-[16px]"
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
        'inline-flex h-7 items-center justify-center gap-1 rounded-md border px-2 text-[11px] transition pointer-coarse:h-9',
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

function Outliner({ tall }: { tall?: boolean }) {
  const objects = useModeler((s) => s.doc.objects)
  const selected = useModeler((s) => s.selected)
  const active = useModeler((s) => s.active)
  const mode = useModeler((s) => s.mode)
  const [renaming, setRenaming] = useState<string | null>(null)
  return (
    <div className={cn('overflow-auto rounded-lg border border-ink-800 bg-ink-900/50 py-1', tall ? 'min-h-[120px]' : 'max-h-[210px] min-h-[92px]')}>
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
            'flex cursor-default items-center gap-2 px-2 py-1 text-[12px] pointer-coarse:py-2.5',
            o.id === active ? 'bg-brand-500/15 text-white' : selected.includes(o.id) ? 'bg-white/5 text-ink-100' : 'text-ink-300 hover:bg-white/5',
          )}
        >
          {o.role === 'collision' ? <Shield className="h-3.5 w-3.5 shrink-0 text-accent-400" /> : o.role === 'helper' ? <PencilRuler className="h-3.5 w-3.5 shrink-0 text-ink-400" /> : <Triangle className="h-3.5 w-3.5 shrink-0 text-orange-300" />}
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
            className="flex h-6 w-6 items-center justify-center text-ink-500 hover:text-white"
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
  const doc = useModeler((s) => s.doc)
  const set = (patch: Partial<ModelObject>, final: boolean) => updateObject(obj.id, patch, final && !st().txn)
  const localSize = useMemo(() => {
    const { min, max } = meshBounds(evaluateObject(obj, doc))
    return [max[0] - min[0], max[1] - min[1], max[2] - min[2]] as Vec3
  }, [obj, doc])
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
      <div className="grid grid-cols-3 gap-1">
        <SmallButton active={obj.role === 'visual'} onClick={() => setRole(obj.id, 'visual')} title="Rendered in game" className="px-1">
          <Triangle className="h-3 w-3" /> Visual
        </SmallButton>
        <SmallButton active={obj.role === 'collision'} onClick={() => setRole(obj.id, 'collision')} title="Invisible, becomes the collision in game" className="px-1">
          <Shield className="h-3 w-3" /> Collision
        </SmallButton>
        <SmallButton active={obj.role === 'helper'} onClick={() => setRole(obj.id, 'helper')} title="Modelling aid (boolean cutter): drawn as wire, not exported" className="px-1">
          <PencilRuler className="h-3 w-3" /> Helper
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

function Choice<T extends string | number>({ value, options, onChange }: { value: T; options: { id: T; label: string; title?: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <SmallButton key={String(o.id)} active={value === o.id} title={o.title} onClick={() => onChange(o.id)} className="px-1">
          {o.label}
        </SmallButton>
      ))}
    </div>
  )
}

const AXES = [
  { id: 0 as const, label: 'X' },
  { id: 1 as const, label: 'Y' },
  { id: 2 as const, label: 'Z' },
]

function Hint({ children }: { children: ReactNode }) {
  return <p className="text-[10px] leading-relaxed text-ink-500">{children}</p>
}

function BooleanTarget({ mod }: { mod: Extract<Modifier, { kind: 'boolean' }> }) {
  const objects = useModeler((s) => s.doc.objects)
  const active = useModeler((s) => s.active)
  const target = objects.find((o) => o.id === mod.target)
  const others = objects.filter((o) => o.id !== active)
  return (
    <>
      <label className="block text-[10px] text-ink-500">
        Object (cutter)
        <select className="field field-sm mt-0.5" value={mod.target ?? ''} onChange={(e) => setBooleanTarget(mod.id, e.target.value || null, true)}>
          <option value="">Pick an object…</option>
          {others.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
              {o.role === 'helper' ? ' (helper)' : ''}
            </option>
          ))}
        </select>
      </label>
      {!others.length && <Hint>Add another object (Shift+A) to cut with, e.g. a cylinder for a hole.</Hint>}
      {target && target.role !== 'helper' && (
        <SmallButton className="w-full" onClick={() => setRole(target.id, 'helper')} title="Show the cutter as wire and leave it out of the export">
          Make “{target.name}” a helper
        </SmallButton>
      )}
      {target?.role === 'helper' && <Hint>“{target.name}” is a helper: drawn as wire and not exported. Move it to move the cut.</Hint>}
    </>
  )
}

function ModifierBody({ mod, up }: { mod: Modifier; up: (patch: Partial<Modifier>, final?: boolean) => void }) {
  switch (mod.kind) {
    case 'mirror':
      return (
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
          <Hint>Mirrors across the object origin. Model one half; vertices on the centre line are welded.</Hint>
        </>
      )
    case 'array':
      return (
        <>
          <NumInput label="Count" value={mod.count} step={0.1} precision={0} min={1} max={64} onChange={(v, f) => up({ count: Math.round(v) }, f)} />
          <Vec3Fields label="Relative offset (× size)" value={mod.relative} step={0.01} onChange={(relative, f) => up({ relative }, f)} />
          <Vec3Fields label="Constant offset" value={mod.constant} step={0.01} suffix="m" onChange={(constant, f) => up({ constant }, f)} />
        </>
      )
    case 'radial':
      return (
        <>
          <NumInput label="Count" value={mod.count} step={0.1} precision={0} min={1} max={128} onChange={(v, f) => up({ count: Math.round(v) }, f)} />
          <NumInput label="Angle" value={mod.angle} step={1} precision={1} min={-360} max={360} suffix="°" onChange={(v, f) => up({ angle: v }, f)} />
          <Choice value={mod.axis} options={AXES} onChange={(axis) => up({ axis })} />
          <Hint>Copies turn around the object origin. Move the mesh away from the origin in edit mode to make a ring (wheel spokes, chairs around a table).</Hint>
        </>
      )
    case 'subsurf':
      return (
        <>
          <Choice value={mod.levels} options={[0, 1, 2, 3].map((l) => ({ id: l, label: String(l) }))} onChange={(levels) => up({ levels })} />
          <Hint>Each level multiplies the faces by 4 — keep props light (level 1–2). Use Shade Smooth for round results.</Hint>
        </>
      )
    case 'solidify':
      return <NumInput label="Thickness" value={mod.thickness} step={0.002} precision={4} suffix="m" onChange={(v, f) => up({ thickness: v }, f)} />
    case 'bevel':
      return (
        <>
          <NumInput label="Width" value={mod.width} step={0.001} precision={4} min={0} suffix="m" onChange={(v, f) => up({ width: v }, f)} />
          <NumInput label="Angle" value={mod.angle} step={0.5} precision={1} min={0} max={180} suffix="°" onChange={(v, f) => up({ angle: v }, f)} />
          <Hint>Chamfers edges sharper than the angle. Add a Subdivision Surface after it for rounded corners.</Hint>
        </>
      )
    case 'boolean':
      return (
        <>
          <Choice
            value={mod.operation}
            options={[
              { id: 'difference', label: 'Difference', title: 'Cut the object away (holes, windows)' },
              { id: 'union', label: 'Union', title: 'Merge both into one shell' },
              { id: 'intersect', label: 'Intersect', title: 'Keep only the overlap' },
            ]}
            onChange={(operation) => up({ operation })}
          />
          <BooleanTarget mod={mod} />
        </>
      )
    case 'decimate':
      return (
        <>
          <Choice
            value={mod.mode}
            options={[
              { id: 'collapse', label: 'Collapse', title: 'Keep a ratio of the vertices' },
              { id: 'planar', label: 'Planar', title: 'Merge flat areas into n-gons' },
            ]}
            onChange={(mode) => up({ mode })}
          />
          {mod.mode === 'collapse' ? (
            <NumInput label="Ratio" value={mod.ratio} step={0.005} precision={3} min={0.01} max={1} onChange={(v, f) => up({ ratio: v }, f)} />
          ) : (
            <NumInput label="Angle" value={mod.angle} step={0.2} precision={1} min={0} max={90} suffix="°" onChange={(v, f) => up({ angle: v }, f)} />
          )}
          <Hint>Fewer polygons for lighter props and LODs. Planar keeps the shape exactly; Collapse approximates it.</Hint>
        </>
      )
    case 'triangulate':
      return <Hint>Splits every face into triangles (what the game draws). Useful before Decimate or to check the real triangle count.</Hint>
    case 'weld':
      return <NumInput label="Distance" value={mod.distance} step={0.0005} precision={4} min={0} suffix="m" onChange={(v, f) => up({ distance: v }, f)} />
    case 'wireframe':
      return (
        <>
          <NumInput label="Thickness" value={mod.thickness} step={0.001} precision={4} min={0.001} suffix="m" onChange={(v, f) => up({ thickness: v }, f)} />
          <Hint>Every edge becomes a square beam: fences, grilles, cages, scaffolding.</Hint>
        </>
      )
    case 'smooth':
      return (
        <>
          <NumInput label="Factor" value={mod.factor} step={0.01} precision={2} min={-2} max={2} onChange={(v, f) => up({ factor: v }, f)} />
          <NumInput label="Repeat" value={mod.repeat} step={0.1} precision={0} min={1} max={50} onChange={(v, f) => up({ repeat: Math.round(v) }, f)} />
        </>
      )
    case 'displace':
      return (
        <>
          <NumInput label="Strength" value={mod.strength} step={0.002} precision={3} suffix="m" onChange={(v, f) => up({ strength: v }, f)} />
          <NumInput label="Size" value={mod.size} step={0.005} precision={3} min={0.001} suffix="m" onChange={(v, f) => up({ size: v }, f)} />
          <NumInput label="Seed" value={mod.seed} step={0.1} precision={0} min={0} onChange={(v, f) => up({ seed: Math.round(v) }, f)} />
          <Hint>Noise bumps along the normals: rocks, dents, worn stone. Needs enough vertices (subdivide first).</Hint>
        </>
      )
    case 'deform':
      return (
        <>
          <Choice
            value={mod.mode}
            options={[
              { id: 'twist', label: 'Twist' },
              { id: 'bend', label: 'Bend' },
              { id: 'taper', label: 'Taper' },
              { id: 'stretch', label: 'Stretch' },
            ]}
            onChange={(mode) => up({ mode, factor: mode === 'twist' || mode === 'bend' ? 45 : 0.5 })}
          />
          <NumInput
            label={mod.mode === 'twist' || mod.mode === 'bend' ? 'Angle' : 'Factor'}
            value={mod.factor}
            step={mod.mode === 'twist' || mod.mode === 'bend' ? 1 : 0.01}
            precision={mod.mode === 'twist' || mod.mode === 'bend' ? 1 : 3}
            suffix={mod.mode === 'twist' || mod.mode === 'bend' ? '°' : undefined}
            onChange={(v, f) => up({ factor: v }, f)}
          />
          <Choice value={mod.axis} options={AXES} onChange={(axis) => up({ axis })} />
          <Hint>Works from the bottom of the mesh along the axis. Needs loop cuts along that axis to bend smoothly.</Hint>
        </>
      )
    case 'cast':
      return (
        <>
          <Choice
            value={mod.shape}
            options={[
              { id: 'sphere', label: 'Sphere' },
              { id: 'cylinder', label: 'Cylinder' },
            ]}
            onChange={(shape) => up({ shape })}
          />
          <NumInput label="Factor" value={mod.factor} step={0.01} precision={2} min={-2} max={2} onChange={(v, f) => up({ factor: v }, f)} />
        </>
      )
  }
}

function ModifierCard({ mod, index, count }: { mod: Modifier; index: number; count: number }) {
  const [open, setOpen] = useState(true)
  const up = (patch: Partial<Modifier>, final = true) => {
    const obj = activeObject(st())
    if (!obj) return
    if (final && !st().txn) updateModifier(mod.id, patch)
    else st().live({ doc: withObject(st().doc, obj.id, (o) => ({ ...o, modifiers: o.modifiers.map((m) => (m.id === mod.id ? ({ ...m, ...patch } as Modifier) : m)) })) })
  }
  const iconBtn = 'flex h-7 w-7 items-center justify-center rounded text-ink-400 hover:bg-white/5 hover:text-white disabled:opacity-30'
  return (
    <div className={cn('rounded-lg border bg-ink-900/50', mod.enabled ? 'border-ink-800' : 'border-ink-800/60 opacity-70')}>
      <div className="flex items-center gap-0.5 px-1 py-0.5">
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-1 text-left" aria-expanded={open}>
          <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 text-ink-500 transition', open && 'rotate-90')} />
          <Wrench className="h-3 w-3 shrink-0 text-accent-400" />
          <span className="truncate text-[11px] font-semibold text-ink-200">{MODIFIER_LABELS[mod.kind]}</span>
        </button>
        <button type="button" title={mod.enabled ? 'Hide in viewport and export' : 'Enable'} className={cn(iconBtn, mod.enabled && 'text-brand-300')} onClick={() => updateModifier(mod.id, { enabled: !mod.enabled })}>
          {mod.enabled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        </button>
        <button type="button" title="Move up" disabled={index === 0} className={iconBtn} onClick={() => moveModifier(mod.id, -1)}>
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
        <button type="button" title="Move down" disabled={index === count - 1} className={iconBtn} onClick={() => moveModifier(mod.id, 1)}>
          <ArrowDown className="h-3.5 w-3.5" />
        </button>
        <button type="button" title="Duplicate" className={iconBtn} onClick={() => duplicateModifier(mod.id)}>
          <Copy className="h-3.5 w-3.5" />
        </button>
        <button type="button" title="Remove" className={cn(iconBtn, 'hover:text-red-300')} onClick={() => removeModifier(mod.id)}>
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {open && (
        <div className="space-y-2 border-t border-ink-800 p-2.5">
          <ModifierBody mod={mod} up={up} />
          <SmallButton className="w-full" onClick={() => applyModifierById(mod.id)} title="Bake this modifier (and the ones above) into the mesh">
            <Check className="h-3 w-3" /> Apply
          </SmallButton>
        </div>
      )}
    </div>
  )
}

function AddModifierMenu({ onDone }: { onDone: () => void }) {
  return (
    <div className="space-y-2 rounded-lg border border-ink-700 bg-ink-900 p-2">
      {MODIFIER_GROUPS.map((g) => (
        <div key={g.label}>
          <p className="mb-1 px-1 text-[10px] font-semibold tracking-wider text-ink-500 uppercase">{g.label}</p>
          <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-2 md:grid-cols-1">
            {g.items.map((it) => (
              <button
                key={it.kind}
                type="button"
                onClick={() => {
                  addModifier(it.kind)
                  onDone()
                }}
                className="flex min-h-9 flex-col items-start justify-center rounded-md px-2 py-1 text-left hover:bg-brand-500/15"
              >
                <span className="text-[12px] text-ink-100">{MODIFIER_LABELS[it.kind]}</span>
                <span className="text-[10px] text-ink-500">{it.hint}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function ModifiersTab({ obj }: { obj: ModelObject }) {
  const [adding, setAdding] = useState(false)
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setAdding((v) => !v)}
        className={cn('flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border text-[12px] font-medium', adding ? 'border-brand-500/60 bg-brand-500/15 text-brand-100' : 'border-ink-700 bg-ink-900 text-ink-200 hover:border-ink-500')}
      >
        <Plus className="h-3.5 w-3.5" /> Add Modifier
        <ChevronDown className={cn('h-3.5 w-3.5 transition', adding && 'rotate-180')} />
      </button>
      {adding && <AddModifierMenu onDone={() => setAdding(false)} />}
      {!obj.modifiers.length && !adding && <p className="px-1 py-3 text-center text-[11px] text-ink-500">No modifiers yet. They stay editable and are applied when the prop is exported.</p>}
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
  const doc = useModeler((s) => s.doc)
  const evaluated = useMemo(() => (obj.modifiers.some((m) => m.enabled) ? meshStats(evaluateObject(obj, doc)) : null), [obj, doc])
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

/** The contents of one properties tab. */
export function PanelContent({ tab }: { tab: PanelTab }) {
  const obj = useModeler((s) => activeObject(s))
  if (tab === 'outliner') return <Outliner tall />
  if (tab === 'gta') return <GtaTab />
  if (!obj) return <p className="px-2 py-6 text-center text-[11px] text-ink-500">Select an object (click it in the viewport or in Scene)</p>
  if (tab === 'object') return <ObjectTab obj={obj} />
  if (tab === 'modifiers') return <ModifiersTab obj={obj} />
  if (tab === 'material') return <MaterialTab obj={obj} />
  return <MeshTab obj={obj} />
}

/** Tab buttons: icon over a short label, large enough to tap. */
export function PanelTabBar({ tabs, current, onTab, className }: { tabs: PanelTab[]; current: PanelTab | null; onTab: (t: PanelTab) => void; className?: string }) {
  return (
    <div className={cn('flex gap-0.5', className)} role="tablist">
      {PANEL_TABS.filter((t) => tabs.includes(t.id)).map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={current === t.id}
          title={t.label}
          onClick={() => onTab(t.id)}
          className={cn(
            'flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-md py-1 text-[9px] leading-none font-medium pointer-coarse:py-1.5',
            current === t.id ? 'bg-brand-500/20 text-brand-200' : 'text-ink-400 hover:bg-white/5 hover:text-ink-100',
          )}
        >
          {t.icon}
          <span className="max-w-full truncate">{t.label}</span>
        </button>
      ))}
    </div>
  )
}

/** Desktop and tablet sidebar: the outliner on top, property tabs below. */
export function ModelerPanels({ tab, onTab }: { tab: PanelTab; onTab: (t: PanelTab) => void }) {
  const current = tab === 'outliner' ? 'object' : tab
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2">
      <Outliner />
      <PanelTabBar tabs={['object', 'modifiers', 'material', 'mesh', 'gta']} current={current} onTab={onTab} className="rounded-lg border border-ink-800 bg-ink-900/60 p-0.5" />
      <div className="scrollbar-thin min-h-0 flex-1 overflow-auto pr-0.5 pb-2">
        <PanelContent tab={current} />
      </div>
    </div>
  )
}
