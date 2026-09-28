import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { ContactShadows, GizmoHelper, GizmoViewport, Grid, OrbitControls, TransformControls } from '@react-three/drei'
import * as THREE from 'three'
import { Box, Copy, Maximize2, Move, Pencil, RotateCcw, Scaling, Shapes, Trash2, Upload } from 'lucide-react'
import { ToolShell } from '@/components/tools/ToolShell'
import { Button } from '@/components/ui/Button'
import { toast } from '@/components/ui/Toast'
import { ModelerWorkspace } from '@/components/modeler/ModelerWorkspace'
import { collisionGeometries, docToThree, importObject3D, modelMaterials } from '@/lib/modeler/build'
import { MODEL_FILE_EXT, MATERIAL_SWATCHES, newDoc, newMaterial, parseDoc, serializeDoc } from '@/lib/modeler/doc'
import type { ModelDoc } from '@/lib/modeler/types'
import { exportPropResource, surfaceOf } from '@/lib/propExport'
import { useModeler } from '@/store/useModeler'
import {
  applyPropWorldTransform,
  deepCloneObject,
  disposeObject,
  findMaterial,
  fitTransform,
  groundOffset,
  listMaterials,
  makeCollisionGeometry,
  measureObject,
  meshCollisionGeometry,
  textureFromFile,
} from '@/lib/propGeometry'
import { PROP_ACCEPT, cleanModelName, fixModelName, gtaModelName, ingestPropFiles } from '@/lib/propLoad'
import { canExportTool, recordToolExport } from '@/lib/toolExport'
import { COLLISION_OPTIONS, COLLISION_QUALITY, CUSTOM_COLLISION, SURFACES, type GizmoMode, type PropAsset, type RefKind } from '@/lib/propTypes'
import { cn, downloadBlob, uid } from '@/lib/utils'

class CanvasErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    if (this.state.failed) {
      return (
        <div className="flex h-full items-center justify-center px-6 text-center text-sm text-ink-400">
          3D view failed to start (WebGL). Refresh the page to recover.
        </div>
      )
    }
    return this.props.children
  }
}

function PropModel({ object }: { object: THREE.Object3D }) {
  const clone = useMemo(() => object.clone(true), [object])
  return <primitive object={clone} />
}

function MeshCollisionOverlay({ object, ratio }: { object: THREE.Object3D; ratio: number }) {
  const [live, setLive] = useState(ratio)
  useEffect(() => {
    const t = window.setTimeout(() => setLive(ratio), 140)
    return () => window.clearTimeout(t)
  }, [ratio])
  const geo = useMemo(() => meshCollisionGeometry(object, live), [object, live])
  useEffect(() => () => geo?.dispose(), [geo])
  if (!geo) return null
  return (
    <mesh geometry={geo} raycast={() => {}}>
      <meshBasicMaterial color="#33dfff" wireframe transparent opacity={0.9} depthTest polygonOffset polygonOffsetFactor={-1} />
    </mesh>
  )
}

function PrimitiveCollisionOverlay({ prop }: { prop: PropAsset }) {
  const geo = useMemo(() => {
    const min = new THREE.Vector3(...prop.localMin)
    const max = new THREE.Vector3(...prop.localMax)
    return makeCollisionGeometry(prop.collision, min, max, prop.object)
  }, [prop.collision, prop.localMin, prop.localMax, prop.object])
  useEffect(() => () => geo?.dispose(), [geo])
  if (!geo) return null
  return (
    <mesh geometry={geo} raycast={() => {}}>
      <meshBasicMaterial color="#33dfff" wireframe transparent opacity={0.75} depthTest={false} />
    </mesh>
  )
}

function ModeledCollisionOverlay({ model }: { model: ModelDoc }) {
  const geos = useMemo(() => collisionGeometries(model), [model])
  useEffect(() => () => geos.forEach((g) => g.dispose()), [geos])
  return (
    <>
      {geos.map((geo, i) => (
        <mesh key={i} geometry={geo} raycast={() => {}}>
          <meshBasicMaterial color="#33dfff" wireframe transparent opacity={0.8} depthTest={false} />
        </mesh>
      ))}
    </>
  )
}

function CollisionOverlay({ prop }: { prop: PropAsset }) {
  if (prop.collision === 'none') return null
  if (prop.collision === 'custom') return prop.model ? <ModeledCollisionOverlay model={prop.model} /> : null
  if (prop.collision === 'mesh') return <MeshCollisionOverlay object={prop.object} ratio={prop.collisionRatio ?? 0.25} />
  return <PrimitiveCollisionOverlay prop={prop} />
}

function Reference({ kind }: { kind: RefKind }) {
  if (kind === 'player') {
    return (
      <group position={[1.6, 0, 0]}>
        <mesh position={[0, 0.9, 0]}>
          <capsuleGeometry args={[0.28, 1.1, 6, 12]} />
          <meshStandardMaterial color="#6b8cff" transparent opacity={0.5} />
        </mesh>
      </group>
    )
  }
  if (kind === 'sofa') {
    return (
      <group position={[-2.1, 0.35, 0]}>
        <mesh>
          <boxGeometry args={[1.8, 0.7, 0.8]} />
          <meshStandardMaterial color="#8b7355" transparent opacity={0.5} />
        </mesh>
      </group>
    )
  }
  if (kind === 'car') {
    return (
      <group position={[0, 0.4, -2.6]}>
        <mesh>
          <boxGeometry args={[2.2, 0.7, 4.2]} />
          <meshStandardMaterial color="#d4d4d8" transparent opacity={0.4} />
        </mesh>
      </group>
    )
  }
  return null
}

function CameraFitter({ tick, prop }: { tick: number; prop: PropAsset | null }) {
  const { camera, controls } = useThree()
  const propRef = useRef(prop)
  useEffect(() => {
    propRef.current = prop
  }, [prop])
  useEffect(() => {
    const current = propRef.current
    if (!tick || !current) return
    const ctrl = controls as { target: THREE.Vector3; update: () => void } | null
    if (!ctrl) return
    const sx = Math.max(current.size[0] * Math.abs(current.scale[0]), 0.4)
    const sy = Math.max(current.size[1] * Math.abs(current.scale[1]), 0.4)
    const sz = Math.max(current.size[2] * Math.abs(current.scale[2]), 0.4)
    const span = Math.max(sx, sy, sz, 0.8)
    const [x, y, z] = current.position
    camera.position.set(x + span * 1.4, y + span * 1.1, z + span * 1.4)
    ctrl.target.set(x, y + sy / 2, z)
    ctrl.update()
  }, [tick, camera, controls])
  return null
}

function PropWithGizmo({
  prop,
  selected,
  mode,
  showCollision,
  onSelect,
  onChange,
}: {
  prop: PropAsset
  selected: boolean
  mode: GizmoMode
  showCollision: boolean
  onSelect: () => void
  onChange: (patch: Partial<PropAsset>) => void
}) {
  const group = useRef<THREE.Group>(null)
  const [gizmoObject, setGizmoObject] = useState<THREE.Object3D | null>(null)
  const { controls } = useThree()
  const rot = prop.rotation.map((d) => (d * Math.PI) / 180) as [number, number, number]

  useEffect(() => {
    setGizmoObject(selected ? group.current : null)
  }, [prop.id, selected])

  return (
    <>
      <group
        ref={group}
        position={prop.position}
        rotation={rot}
        scale={prop.scale}
        onClick={(e) => {
          e.stopPropagation()
          onSelect()
        }}
      >
        <PropModel object={prop.object} />
        {showCollision && <CollisionOverlay prop={prop} />}
      </group>
      {selected && gizmoObject && (
        <TransformControls
          object={gizmoObject}
          mode={mode}
          onMouseDown={() => {
            const c = controls as { enabled?: boolean } | null
            if (c) c.enabled = false
          }}
          onMouseUp={() => {
            const c = controls as { enabled?: boolean } | null
            if (c) c.enabled = true
            const g = group.current
            if (!g) return
            onChange({
              position: [g.position.x, g.position.y, g.position.z],
              rotation: [(g.rotation.x * 180) / Math.PI, (g.rotation.y * 180) / Math.PI, (g.rotation.z * 180) / Math.PI],
              scale: [g.scale.x, g.scale.y, g.scale.z],
            })
          }}
        />
      )}
    </>
  )
}

function Scene({
  props,
  selectedId,
  mode,
  refKind,
  showCollision,
  focusTick,
  onSelect,
  onChange,
}: {
  props: PropAsset[]
  selectedId: string | null
  mode: GizmoMode
  refKind: RefKind
  showCollision: boolean
  focusTick: number
  onSelect: (id: string | null) => void
  onChange: (id: string, patch: Partial<PropAsset>) => void
}) {
  const selected = props.find((p) => p.id === selectedId) ?? null
  return (
    <>
      <color attach="background" args={['#0a0a0e']} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[6, 10, 4]} intensity={1.15} />
      <hemisphereLight args={['#b9d0ff', '#1a1a22', 0.35]} />
      <Grid infiniteGrid fadeDistance={40} sectionColor="#2a2a35" cellColor="#1a1a22" />
      <ContactShadows opacity={0.35} scale={30} blur={2.5} far={12} />
      <Reference kind={refKind} />
      {props.map((prop) => (
        <PropWithGizmo
          key={prop.id}
          prop={prop}
          selected={prop.id === selectedId}
          mode={mode}
          showCollision={showCollision}
          onSelect={() => onSelect(prop.id)}
          onChange={(patch) => onChange(prop.id, patch)}
        />
      ))}
      <CameraFitter tick={focusTick} prop={selected ?? props[0] ?? null} />
      <OrbitControls makeDefault />
      <GizmoHelper alignment="bottom-right" margin={[64, 64]}>
        <GizmoViewport />
      </GizmoHelper>
    </>
  )
}

function AxisFields({
  label,
  values,
  step,
  linked,
  onLinked,
  onChange,
  valid,
}: {
  label: string
  values: [number, number, number]
  step: number
  linked?: boolean
  onLinked?: () => void
  onChange: (next: [number, number, number]) => void
  /** Rejects values such as a zero scale. */
  valid?: (n: number) => boolean
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] font-medium text-ink-400 capitalize">{label}</span>
        {onLinked && (
          <button type="button" className="text-[10px] text-brand-400" onClick={onLinked}>
            {linked ? 'Linked' : 'Unlinked'}
          </button>
        )}
      </div>
      <div className="grid grid-cols-3 gap-1">
        {([0, 1, 2] as const).map((i) => (
          <input
            key={i}
            className="field field-sm"
            type="number"
            step={step}
            value={Number(values[i].toFixed(3))}
            onChange={(e) => {
              // Ignore half-typed input ("", "-", "1e") instead of writing NaN into the prop.
              if (e.target.value.trim() === '') return
              const n = Number(e.target.value)
              if (!Number.isFinite(n) || (valid && !valid(n))) return
              if (linked) onChange([n, n, n])
              else {
                const arr: [number, number, number] = [...values]
                arr[i] = n
                onChange(arr)
              }
            }}
          />
        ))}
      </div>
    </div>
  )
}

export function PropCreator() {
  const [props, setProps] = useState<PropAsset[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mode, setMode] = useState<GizmoMode>('translate')
  const [refKind, setRefKind] = useState<RefKind>('player')
  const [projectName, setProjectName] = useState('prop_pack')
  const [busy, setBusy] = useState(false)
  const [linkScale, setLinkScale] = useState(true)
  const [showCollision, setShowCollision] = useState(true)
  const [focusTick, setFocusTick] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const [workspace, setWorkspace] = useState<'pack' | 'model'>('pack')
  const [modelPropId, setModelPropId] = useState<string | null>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const loadedModel = useRef<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const texRef = useRef<HTMLInputElement>(null)
  const texTarget = useRef<string | null>(null)
  const selected = props.find((p) => p.id === selectedId) ?? null

  const propsRef = useRef(props)
  useEffect(() => {
    propsRef.current = props
  }, [props])

  const release = (prop: PropAsset) => {
    disposeObject(prop.object)
    for (const url of prop.sidecarUrls) URL.revokeObjectURL(url)
  }

  useEffect(() => {
    return () => {
      for (const p of propsRef.current) release(p)
    }
  }, [])

  const patchProp = (id: string, patch: Partial<PropAsset>) => {
    setProps((list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  }

  /** Rebuilds the three.js object of a modeled prop from its document. */
  const modeledPatch = (prop: Pick<PropAsset, 'name' | 'collision'>, doc: ModelDoc): Partial<PropAsset> => {
    const object = docToThree(doc, modelMaterials)
    const stats = measureObject(object)
    const hasCollision = doc.objects.some((o) => o.role === 'collision' && o.mesh.faces.length > 0)
    return {
      model: doc,
      object,
      file: new File([serializeDoc(doc, prop.name)], `${prop.name}${MODEL_FILE_EXT}`, { type: 'application/json' }),
      vertexCount: stats.vertexCount,
      triangleCount: stats.triangleCount,
      size: stats.size,
      localMin: stats.min,
      localMax: stats.max,
      materials: [],
      collision: hasCollision ? 'custom' : prop.collision === 'custom' ? 'box' : prop.collision,
    }
  }

  const openModeler = (id: string, doc: ModelDoc) => {
    if (loadedModel.current !== id) {
      useModeler.getState().load(doc)
      loadedModel.current = id
    }
    setModelPropId(id)
    setSelectedId(id)
    setWorkspace('model')
  }

  const createModelProp = (doc: ModelDoc, label: string, open: boolean) => {
    const used = new Set(propsRef.current.map((p) => p.name))
    const name = gtaModelName(label, used)
    const base: PropAsset = {
      id: uid(8),
      name,
      label,
      file: new File([], `${name}${MODEL_FILE_EXT}`),
      object: new THREE.Group(),
      sidecarUrls: [],
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      collision: 'box',
      collisionRatio: 0.25,
      lodDist: 60,
      hdTextureDist: 40,
      generateLods: false,
      dynamic: false,
      vertexCount: 0,
      triangleCount: 0,
      size: [0, 0, 0],
      localMin: [0, 0, 0],
      localMax: [0, 0, 0],
      materials: [],
      warnings: [],
    }
    const prop = { ...base, ...modeledPatch(base, doc) }
    propsRef.current = [...propsRef.current, prop]
    setProps((list) => [...list, prop])
    setSelectedId(prop.id)
    if (open) openModeler(prop.id, doc)
    else setFocusTick((n) => n + 1)
    return prop
  }

  /** Writes the modeler document back into its prop; returns the up to date prop list. */
  const syncModel = (): PropAsset[] => {
    const list = propsRef.current
    const id = modelPropId
    const prop = id ? list.find((p) => p.id === id) : null
    const doc = useModeler.getState().doc
    if (!prop || prop.model === doc) return list
    const patch = modeledPatch(prop, doc)
    prop.object.traverse((c) => (c as THREE.Mesh).geometry?.dispose())
    const next = list.map((p) => (p.id === prop.id ? { ...p, ...patch } : p))
    propsRef.current = next
    setProps(next)
    return next
  }

  const closeModeler = () => {
    syncModel()
    setWorkspace('pack')
    setFocusTick((n) => n + 1)
  }

  const enterModeler = () => {
    const target = (selected?.model ? selected : null) ?? props.find((p) => p.id === modelPropId && p.model) ?? null
    if (target?.model) openModeler(target.id, target.model)
    else createModelProp(newDoc(), 'model', true)
  }

  /** Turns an imported prop into an editable modeler document (transform baked in). */
  const convertToModel = (prop: PropAsset) => {
    const wrapped = applyPropWorldTransform(prop.object, prop.position, prop.rotation, prop.scale)
    const { objects, materials } = importObject3D(wrapped, () => uid(8))
    if (!objects.length) {
      toast.error('Nothing to convert', 'This prop has no meshes.')
      return
    }
    const doc: ModelDoc = { objects, materials: materials.length ? materials : [newMaterial('Material', MATERIAL_SWATCHES[0])], cursor: [0, 0, 0] }
    const patch = { ...modeledPatch(prop, doc), position: [0, 0, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [1, 1, 1] as [number, number, number] }
    release(prop)
    const next = propsRef.current.map((p) => (p.id === prop.id ? { ...p, ...patch, sidecarUrls: [] } : p))
    propsRef.current = next
    setProps(next)
    loadedModel.current = null
    openModeler(prop.id, doc)
    if (prop.triangleCount > 60000) toast.info('Heavy mesh', 'Over 60k triangles: editing may be slow. Consider decimating it first.')
  }

  const addPrimitive = (kind: 'box' | 'sphere' | 'cylinder') => {
    const mat = new THREE.MeshStandardMaterial({ color: '#cfd2dc', metalness: 0.12, roughness: 0.68, name: 'Material' })
    const geo =
      kind === 'box' ? new THREE.BoxGeometry(1, 1, 1) : kind === 'sphere' ? new THREE.SphereGeometry(0.5, 32, 24) : new THREE.CylinderGeometry(0.35, 0.35, 1.1, 28)
    const mesh = new THREE.Mesh(geo, mat)
    mesh.castShadow = true
    mesh.receiveShadow = true
    const object = new THREE.Group()
    object.add(mesh)
    const stats = measureObject(object)
    const fit = fitTransform(object)
    const id = uid(8)
    setProps((current) => {
      const used = new Set(current.map((p) => p.name))
      return [
        ...current,
        {
          id,
          name: gtaModelName(`prop_${kind}`, used),
          label: kind[0].toUpperCase() + kind.slice(1),
          file: new File([kind], `${kind}.obj`, { type: 'text/plain' }),
          object,
          sidecarUrls: [],
          position: fit.position,
          rotation: [0, 0, 0],
          scale: fit.scale,
          collision: 'box',
          collisionRatio: 0.25,
          lodDist: 60,
          hdTextureDist: 40,
          generateLods: false,
          dynamic: false,
          vertexCount: stats.vertexCount,
          triangleCount: stats.triangleCount,
          size: stats.size,
          localMin: stats.min,
          localMax: stats.max,
          materials: listMaterials(object),
          warnings: [],
        },
      ]
    })
    setSelectedId(id)
    setFocusTick((n) => n + 1)
  }

  const addFiles = useCallback(async (list: FileList | File[]) => {
    const all = Array.from(list)
    const models = all.filter((f) => f.name.toLowerCase().endsWith('.json'))
    const files = all.filter((f) => !f.name.toLowerCase().endsWith('.json'))
    for (const f of models) {
      try {
        const { doc, name } = parseDoc(await f.text())
        createModelProp(doc, name, false)
        toast.success('Model opened', f.name)
      } catch (e) {
        toast.error('Could not open model', (e as Error).message)
      }
    }
    if (!files.length) return
    setBusy(true)
    try {
      const loaded = await ingestPropFiles(files)
      const ids = loaded.map(() => uid(8))
      setProps((current) => {
        if (ids[0] && current.some((p) => p.id === ids[0])) return current
        const used = new Set(current.map((p) => p.name))
        const created = loaded.map((item, i) => {
          const stats = measureObject(item.object)
          const fit = fitTransform(item.object)
          return {
            id: ids[i],
            name: gtaModelName(item.name, used),
            label: item.name,
            file: item.file,
            object: item.object,
            sidecarUrls: item.sidecarUrls,
            position: fit.position,
            rotation: [0, 0, 0] as [number, number, number],
            scale: fit.scale,
            collision: 'box' as const,
            collisionRatio: 0.25,
            lodDist: 60,
            hdTextureDist: 40,
            generateLods: stats.triangleCount > 400,
            dynamic: false,
            vertexCount: stats.vertexCount,
            triangleCount: stats.triangleCount,
            size: stats.size,
            localMin: stats.min,
            localMax: stats.max,
            materials: listMaterials(item.object),
            warnings: item.warnings,
          }
        })
        return [...current, ...created]
      })
      if (ids[0]) setSelectedId(ids[0])
      setFocusTick((n) => n + 1)
      const heavy = loaded.filter((_, i) => {
        const s = measureObject(loaded[i].object)
        return s.triangleCount > 40000
      })
      toast.success(`Added ${loaded.length} prop${loaded.length === 1 ? '' : 's'}`)
      for (const item of loaded) for (const w of item.warnings) toast.info(item.name, w)
      if (heavy.length) toast.info('Heavy mesh', 'Over 40k triangles — enable LODs before export.')
    } catch (e) {
      toast.error('Could not load model', (e as Error).message)
    } finally {
      setBusy(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const removeSelected = () => {
    if (!selected) return
    release(selected)
    setProps((list) => list.filter((p) => p.id !== selected.id))
    setSelectedId(null)
  }

  const duplicateSelected = () => {
    if (!selected) return
    const used = new Set(props.map((p) => p.name))
    const object = deepCloneObject(selected.object)
    const copy: PropAsset = {
      ...selected,
      id: uid(8),
      name: gtaModelName(selected.name, used),
      label: `${selected.label} copy`,
      object,
      sidecarUrls: [],
      materials: listMaterials(object),
      position: [selected.position[0] + 0.6, selected.position[1], selected.position[2]],
    }
    setProps((list) => [...list, copy])
    setSelectedId(copy.id)
  }

  const doExport = async () => {
    if (!props.length) {
      toast.error('No props', 'Drop a 3D model first.')
      return
    }
    if (!canExportTool()) return
    const list = workspace === 'model' ? syncModel() : props
    setBusy(true)
    try {
      const { blob, fileName, renamed, warnings } = await exportPropResource(list, projectName, setProgress)
      downloadBlob(blob, fileName)
      await recordToolExport('Prop Creator')
      toast.success('FiveM resource ready', `${fileName}: .ydr + .ytyp + fxmanifest, collision and textures included.`)
      if (renamed) toast.info('Model names fixed', `${renamed} prop${renamed === 1 ? ' had an empty or duplicate name' : 's had empty or duplicate names'} and got a unique one in the export.`)
      for (const w of warnings.slice(0, 4)) toast.info('Export note', w)
    } catch (e) {
      toast.error('Export failed', (e as Error).message)
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  useEffect(() => {
    if (workspace === 'model') return
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'w' || e.key === 'W') setMode('translate')
      if (e.key === 'e' || e.key === 'E') setMode('rotate')
      if (e.key === 'r' || e.key === 'R') setMode('scale')
      if (e.key === 'f' || e.key === 'F') setFocusTick((n) => n + 1)
      if (e.key === 'c' || e.key === 'C') setShowCollision((v) => !v)
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        setProps((list) => {
          const sel = list.find((p) => p.id === selectedId)
          if (!sel) return list
          release(sel)
          return list.filter((p) => p.id !== selectedId)
        })
        setSelectedId(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId, workspace])

  const refreshMaterials = (prop: PropAsset) => {
    patchProp(prop.id, { materials: listMaterials(prop.object) })
  }

  const tris = props.reduce((s, p) => s + p.triangleCount, 0)

  const modelProp = props.find((p) => p.id === modelPropId) ?? null

  return (
    <ToolShell
      title={projectName || 'Prop Creator'}
      subtitle={progress ?? (workspace === 'model' && modelProp ? `Modeler · ${modelProp.name}` : `${props.length} prop${props.length === 1 ? '' : 's'} · ${tris.toLocaleString()} tris`)}
      onExport={() => void doExport()}
      exportLabel="Export for FiveM"
      exportLoading={busy}
      exportDisabled={!props.length || busy}
    >
      <div className="flex h-full min-h-[calc(100vh-52px)] flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-ink-800 bg-ink-950 px-3 py-1.5">
        {(
          [
            ['pack', 'Pack & export', Box],
            ['model', 'Modeler', Shapes],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => (id === 'model' ? workspace !== 'model' && enterModeler() : workspace !== 'pack' && closeModeler())}
            className={cn('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition', workspace === id ? 'bg-brand-500/15 text-brand-200' : 'text-ink-400 hover:bg-white/5 hover:text-ink-100')}
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
        <span className="ml-2 hidden truncate text-[11px] text-ink-500 md:inline">
          {workspace === 'model' ? 'Blender-style modelling · Tab edit mode · right click for tools · Done returns to the pack' : 'Import or model props, set collision and LODs, then export native .ydr / .ytyp for FiveM'}
        </span>
      </div>
      {workspace === 'model' ? (
        <div className="h-[calc(100vh-52px-41px)] min-h-[560px]">
          <ModelerWorkspace name={modelProp?.name ?? 'model'} onDone={closeModeler} />
        </div>
      ) : (
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[240px_1fr_300px]">
        <aside className="flex flex-col border-b border-ink-800 lg:border-r lg:border-b-0">
          <div className="border-b border-ink-800 px-3 py-3">
            <p className="text-xs font-semibold tracking-wider text-ink-500 uppercase">Resource</p>
            <input className="field field-sm mt-2" value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Resource name" />
          </div>
          <div className="flex-1 space-y-1 overflow-auto p-2">
            {!props.length && <p className="px-2 py-6 text-center text-xs text-ink-500">No props yet — drop a model below.</p>}
            {props.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedId(p.id)}
                className={cn('flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm', selectedId === p.id ? 'bg-brand-500/15 text-brand-300' : 'text-ink-300 hover:bg-ink-850')}
              >
                <Box className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{p.name}</span>
                  <span className="block text-[10px] text-ink-500">{p.triangleCount.toLocaleString()} tris</span>
                </span>
              </button>
            ))}
          </div>
          <div className="space-y-2 border-t border-ink-800 p-3">
            <Button size="sm" className="w-full" onClick={() => createModelProp(newDoc(), 'model', true)}>
              <Shapes className="h-4 w-4" /> New model (Blender-style)
            </Button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                void addFiles(e.dataTransfer.files)
              }}
              className="flex w-full flex-col items-center rounded-xl border border-dashed border-ink-600 px-3 py-6 text-center text-xs text-ink-400 hover:border-brand-500/50 hover:text-brand-300"
            >
              <Upload className="mb-2 h-5 w-5" />
              Add prop · GLB GLTF OBJ FBX STL · model .json
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept={`${PROP_ACCEPT},.json,application/json`}
              className="hidden"
              onChange={(e) => {
                if (e.target.files) void addFiles(e.target.files)
                e.target.value = ''
              }}
            />
            <div className="grid grid-cols-3 gap-1">
              {(['box', 'sphere', 'cylinder'] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => addPrimitive(kind)}
                  className="rounded-lg border border-ink-700 bg-ink-900 px-1 py-1.5 text-[10px] text-ink-400 capitalize hover:border-brand-500/40 hover:text-ink-200"
                >
                  {kind}
                </button>
              ))}
            </div>
          </div>
        </aside>

        <div
          className="relative min-h-[360px] bg-[#0a0a0e]"
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            void addFiles(e.dataTransfer.files)
          }}
        >
          <div className="absolute top-3 left-3 z-10 flex gap-1 rounded-xl border border-ink-700 bg-ink-900/90 p-1 backdrop-blur">
            {(
              [
                ['translate', Move],
                ['rotate', RotateCcw],
                ['scale', Scaling],
              ] as const
            ).map(([m, Icon]) => (
              <button key={m} type="button" onClick={() => setMode(m)} className={cn('rounded-lg p-2', mode === m ? 'bg-brand-500/20 text-brand-300' : 'text-ink-400 hover:text-ink-200')} title={`${m} (${m === 'translate' ? 'W' : m === 'rotate' ? 'E' : 'R'})`}>
                <Icon className="h-4 w-4" />
              </button>
            ))}
            <button type="button" onClick={() => setFocusTick((n) => n + 1)} className="rounded-lg p-2 text-ink-400 hover:text-ink-200" title="Focus (F)">
              <Maximize2 className="h-4 w-4" />
            </button>
          </div>
          <div className="absolute top-3 right-3 z-10 flex gap-1">
            <button
              type="button"
              onClick={() => setShowCollision((v) => !v)}
              className={cn('rounded-lg border px-2 py-1 text-[11px]', showCollision ? 'border-accent-500/50 bg-accent-500/15 text-accent-300' : 'border-ink-700 bg-ink-900/80 text-ink-400')}
            >
              Collision
            </button>
          </div>
          <div className="absolute bottom-3 left-3 z-10 flex gap-1">
            {(
              [
                ['none', 'None'],
                ['player', 'Player'],
                ['sofa', 'Sofa'],
                ['car', 'SultanRS'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setRefKind(id)}
                className={cn('rounded-lg border px-2 py-1 text-[11px]', refKind === id ? 'border-brand-500/50 bg-brand-500/15 text-brand-300' : 'border-ink-700 bg-ink-900/80 text-ink-400')}
              >
                {label}
              </button>
            ))}
          </div>
          {!props.length && <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center text-sm text-ink-500">Drop a GLB, OBJ, FBX or STL — or click “New model” to build one Blender-style.</div>}
          {dragOver && <div className="pointer-events-none absolute inset-0 z-20 border-2 border-dashed border-brand-500 bg-brand-500/10" />}
          <CanvasErrorBoundary>
            <Canvas camera={{ position: [4, 3, 6], fov: 45 }} dpr={[1, 1.5]} gl={{ antialias: true, powerPreference: 'high-performance' }} style={{ width: '100%', height: '100%' }} onPointerMissed={() => setSelectedId(null)}>
            <Scene
              props={props}
              selectedId={selectedId}
              mode={mode}
              refKind={refKind}
              showCollision={showCollision}
              focusTick={focusTick}
              onSelect={setSelectedId}
              onChange={patchProp}
            />
            </Canvas>
          </CanvasErrorBoundary>
        </div>

        <aside className="space-y-4 overflow-auto border-t border-ink-800 p-3 lg:border-t-0 lg:border-l">
          <div>
            <p className="text-[11px] font-semibold tracking-wider text-ink-500 uppercase">Prop</p>
            {!selected ? (
              <p className="mt-2 text-xs text-ink-500">Select a prop</p>
            ) : (
              <div className="mt-2 space-y-2">
                <label className="block">
                  <span className="text-[10px] text-ink-500">Model name</span>
                  <input
                    className="field field-sm mt-0.5 font-mono"
                    value={selected.name}
                    maxLength={24}
                    onChange={(e) => patchProp(selected.id, { name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
                    onBlur={() => {
                      const used = new Set(props.filter((p) => p.id !== selected.id).map((p) => p.name))
                      const name = fixModelName(selected.name, selected.label, used)
                      if (name !== selected.name) {
                        patchProp(selected.id, { name })
                        if (cleanModelName(selected.name)) toast.info('Model name taken', `Renamed to ${name}: every prop needs its own model name.`)
                      }
                    }}
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] text-ink-500">Label</span>
                  <input className="field field-sm mt-0.5" value={selected.label} onChange={(e) => patchProp(selected.id, { label: e.target.value })} />
                </label>
                <p className="text-[10px] text-ink-500">
                  {selected.vertexCount.toLocaleString()} verts · {selected.triangleCount.toLocaleString()} tris · {selected.size.map((n, i) => (n * Math.abs(selected.scale[i])).toFixed(2)).join(' × ')} m
                </p>
                {selected.model ? (
                  <Button size="sm" className="w-full" onClick={() => openModeler(selected.id, selected.model!)}>
                    <Pencil className="h-3.5 w-3.5" /> Edit in modeler
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" className="w-full" onClick={() => convertToModel(selected)} title="Edit this mesh in the Blender-style modeler">
                    <Shapes className="h-3.5 w-3.5" /> Convert to editable mesh
                  </Button>
                )}
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" className="flex-1" onClick={duplicateSelected}>
                    <Copy className="h-3.5 w-3.5" /> Duplicate
                  </Button>
                  <Button variant="danger" size="sm" className="flex-1" onClick={removeSelected}>
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div>
            <p className="text-[11px] font-semibold tracking-wider text-ink-500 uppercase">Transform</p>
            {!selected ? (
              <p className="mt-2 text-xs text-ink-500">Select a prop</p>
            ) : (
              <div className="mt-2 space-y-3">
                <AxisFields label="position" values={selected.position} step={0.01} onChange={(position) => patchProp(selected.id, { position })} />
                <AxisFields label="rotation" values={selected.rotation} step={1} onChange={(rotation) => patchProp(selected.id, { rotation })} />
                <AxisFields
                  label="scale"
                  values={selected.scale}
                  step={0.01}
                  linked={linkScale}
                  onLinked={() => setLinkScale((v) => !v)}
                  valid={(n) => Math.abs(n) >= 0.0001}
                  onChange={(scale) => patchProp(selected.id, { scale })}
                />
                <div className="grid grid-cols-2 gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const dy = groundOffset(selected.object, selected.position, selected.rotation, selected.scale)
                      patchProp(selected.id, { position: [selected.position[0], selected.position[1] + dy, selected.position[2]] })
                    }}
                  >
                    Ground
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => patchProp(selected.id, { ...fitTransform(selected.object), rotation: [0, 0, 0] })}>
                    Auto-fit
                  </Button>
                </div>
                <Button variant="outline" size="sm" className="w-full" onClick={() => patchProp(selected.id, { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] })}>
                  Reset transform
                </Button>
              </div>
            )}
          </div>

          <div>
            <p className="text-[11px] font-semibold tracking-wider text-ink-500 uppercase">Materials</p>
            {!selected ? (
              <p className="mt-2 text-xs text-ink-500">No materials — add a prop first.</p>
            ) : selected.model ? (
              <p className="mt-2 text-xs text-ink-500">Modeled prop: edit its materials and textures in the modeler (Material tab).</p>
            ) : !selected.materials.length ? (
              <p className="mt-2 text-xs text-ink-500">This mesh has no editable materials.</p>
            ) : (
              <div className="mt-2 space-y-3">
                {selected.materials.map((mat) => (
                  <div key={mat.uuid} className="rounded-lg border border-ink-700 bg-ink-900/60 p-2">
                    <div className="mb-2 flex items-center gap-2">
                      {mat.previewUrl ? <img src={mat.previewUrl} alt="" className="h-8 w-8 rounded border border-ink-700 object-cover" /> : <span className="h-8 w-8 rounded border border-ink-700" style={{ background: mat.color }} />}
                      <span className="truncate text-xs text-ink-200">{mat.name}</span>
                    </div>
                    <div className="grid grid-cols-[auto_1fr] items-center gap-1.5">
                      <input
                        type="color"
                        value={mat.color}
                        onChange={(e) => {
                          const color = e.target.value
                          const live = findMaterial(selected.object, mat.uuid)
                          live?.color?.set(color)
                          patchProp(selected.id, {
                            materials: selected.materials.map((m) => (m.uuid === mat.uuid ? { ...m, color } : m)),
                          })
                        }}
                      />
                      <button
                        type="button"
                        className="field field-sm text-left"
                        onClick={() => {
                          texTarget.current = mat.uuid
                          texRef.current?.click()
                        }}
                      >
                        {mat.hasMap ? 'Replace texture' : 'Add texture'}
                      </button>
                    </div>
                    <label className="mt-1.5 block text-[10px] text-ink-500">
                      Metalness {mat.metalness.toFixed(2)}
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        className="mt-0.5 w-full"
                        value={mat.metalness}
                        onChange={(e) => {
                          const metalness = Number(e.target.value)
                          const live = findMaterial(selected.object, mat.uuid)
                          if (live) live.metalness = metalness
                          patchProp(selected.id, {
                            materials: selected.materials.map((m) => (m.uuid === mat.uuid ? { ...m, metalness } : m)),
                          })
                        }}
                      />
                    </label>
                    <label className="block text-[10px] text-ink-500">
                      Roughness {mat.roughness.toFixed(2)}
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        className="mt-0.5 w-full"
                        value={mat.roughness}
                        onChange={(e) => {
                          const roughness = Number(e.target.value)
                          const live = findMaterial(selected.object, mat.uuid)
                          if (live) live.roughness = roughness
                          patchProp(selected.id, {
                            materials: selected.materials.map((m) => (m.uuid === mat.uuid ? { ...m, roughness } : m)),
                          })
                        }}
                      />
                    </label>
                  </div>
                ))}
                <input
                  ref={texRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    const uuid = texTarget.current
                    e.target.value = ''
                    if (!file || !uuid || !selected) return
                    void (async () => {
                      try {
                        const live = findMaterial(selected.object, uuid)
                        if (!live) return
                        // glTF UVs expect unflipped textures; OBJ / FBX / STL and primitives use three's default.
                        const gltf = /\.(glb|gltf)$/i.test(selected.file.name)
                        const tex = await textureFromFile(file, live.map ? live.map.flipY : !gltf)
                        live.map?.dispose()
                        live.map = tex
                        live.needsUpdate = true
                        refreshMaterials(selected)
                        toast.success('Texture applied', file.name)
                      } catch (err) {
                        toast.error('Texture failed', (err as Error).message)
                      }
                    })()
                  }}
                />
              </div>
            )}
          </div>

          <div>
            <p className="text-[11px] font-semibold tracking-wider text-ink-500 uppercase">Collision</p>
            {!selected ? (
              <p className="mt-2 text-xs text-ink-500">Select a prop</p>
            ) : (
              <div className="mt-2 grid grid-cols-2 gap-1">
                {[...(selected.model?.objects.some((o) => o.role === 'collision') ? [CUSTOM_COLLISION] : []), ...COLLISION_OPTIONS].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    title={opt.hint}
                    onClick={() => patchProp(selected.id, { collision: opt.id })}
                    className={cn(
                      'rounded-lg border px-2 py-1.5 text-left text-[11px]',
                      selected.collision === opt.id ? 'border-accent-500/50 bg-accent-500/15 text-accent-300' : 'border-ink-700 bg-ink-900 text-ink-400',
                    )}
                  >
                    <span className="block font-medium">{opt.label}</span>
                    <span className="block text-[10px] text-ink-500">{opt.hint}</span>
                  </button>
                ))}
              </div>
            )}
            {selected?.collision === 'mesh' && (
              <div className="mt-3 space-y-2">
                <p className="text-[10px] font-medium text-ink-400">Optimize mesh</p>
                <div className="flex flex-wrap gap-1">
                  {COLLISION_QUALITY.map((q) => (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => patchProp(selected.id, { collisionRatio: q.ratio })}
                      className={cn(
                        'rounded-md border px-2 py-1 text-[10px]',
                        Math.abs((selected.collisionRatio ?? 0.25) - q.ratio) < 0.02
                          ? 'border-accent-500/50 bg-accent-500/15 text-accent-300'
                          : 'border-ink-700 bg-ink-900 text-ink-400',
                      )}
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
                <label className="block text-[10px] text-ink-500">
                  Detail {Math.round((selected.collisionRatio ?? 0.25) * 100)}% · ~
                  {Math.max(12, Math.round(selected.triangleCount * (selected.collisionRatio ?? 0.25))).toLocaleString()} tris
                  <input
                    type="range"
                    min={5}
                    max={100}
                    step={1}
                    className="mt-0.5 w-full"
                    value={Math.round((selected.collisionRatio ?? 0.25) * 100)}
                    onChange={(e) => patchProp(selected.id, { collisionRatio: Number(e.target.value) / 100 })}
                  />
                </label>
              </div>
            )}
          </div>

          {selected && selected.collision !== 'none' && (
            <label className="block text-[10px] text-ink-500">
              Collision surface (sounds, bullet impacts, weight)
              <select className="field field-sm mt-0.5" value={selected.surface ?? ''} onChange={(e) => patchProp(selected.id, { surface: e.target.value === '' ? undefined : Number(e.target.value) })}>
                <option value="">Auto · {SURFACES.find((x) => x.id === surfaceOf(selected))?.label}</option>
                {SURFACES.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div>
            <p className="text-[11px] font-semibold tracking-wider text-ink-500 uppercase">LODs & spawn</p>
            {!selected ? (
              <p className="mt-2 text-xs text-ink-500">Select a prop</p>
            ) : (
              <div className="mt-2 space-y-2">
                <label className="block text-[10px] text-ink-500">
                  Draw distance {selected.lodDist}m
                  <input
                    type="range"
                    min={15}
                    max={250}
                    step={5}
                    className="mt-0.5 w-full"
                    value={selected.lodDist}
                    onChange={(e) => patchProp(selected.id, { lodDist: Number(e.target.value) })}
                  />
                </label>
                <label className="block text-[10px] text-ink-500">
                  HD textures {selected.hdTextureDist}m
                  <input
                    type="range"
                    min={8}
                    max={120}
                    step={2}
                    className="mt-0.5 w-full"
                    value={selected.hdTextureDist}
                    onChange={(e) => patchProp(selected.id, { hdTextureDist: Number(e.target.value) })}
                  />
                </label>
                <label className="block text-[10px] text-ink-500">
                  Max texture size
                  <select className="field field-sm mt-0.5" value={selected.textureSize ?? 1024} onChange={(e) => patchProp(selected.id, { textureSize: Number(e.target.value) })}>
                    {[256, 512, 1024, 2048].map((n) => (
                      <option key={n} value={n}>
                        {n} px{n === 1024 ? ' (recommended)' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2 text-xs text-ink-300">
                  <input type="checkbox" checked={selected.generateLods} onChange={(e) => patchProp(selected.id, { generateLods: e.target.checked })} />
                  Generate LOD1 / LOD2 meshes
                </label>
                <label className="flex items-center gap-2 text-xs text-ink-300">
                  <input type="checkbox" checked={selected.dynamic} onChange={(e) => patchProp(selected.id, { dynamic: e.target.checked })} />
                  Dynamic (can be moved / unfrozen)
                </label>
              </div>
            )}
          </div>
        </aside>
      </div>
      )}
      </div>
    </ToolShell>
  )
}
