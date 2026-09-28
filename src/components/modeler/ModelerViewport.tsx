import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Billboard, OrbitControls, TransformControls } from '@react-three/drei'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl, TransformControls as TransformControlsImpl } from 'three-stdlib'
import { Check, Hand, Maximize, Search, X } from 'lucide-react'
import { buildGeometry, objectGeometry, objectMatrix, evaluateObject, modifierTargets } from '@/lib/modeler/build'
import { duplicateObject } from '@/lib/modeler/doc'
import {
  buildEdges,
  duplicateFaces,
  edgeKey,
  edgeLoop,
  edgeRing,
  edgeVerts,
  emptySelection,
  extrudeEdges,
  extrudeFaces,
  faceArea,
  faceCenter,
  faceNormal,
  flushSelection,
  insetFaces,
  loopCut,
  selectLinked,
  type OpResult,
} from '@/lib/modeler/mesh'
import { toggleEditMode, selectAllToggle, deleteObjects, joinSelected, hideSelected, revealAll, clearTransform, fill, separateSelection, recalcSelection, flipSelection, trisToQuadsSelection, growSelection, selectLinkedAll, setSelectMode } from '@/lib/modeler/ops'
import type { EditMesh, MeshSelection, ModelDoc, ModelObject, SelectMode, Vec3 } from '@/lib/modeler/types'
import { activeObject, useModeler, withObject } from '@/store/useModeler'
import { ROOT_INVERSE, ROOT_MATRIX, docToWorld, modelMaterials, objectWorldMatrix, viewport, worldToDoc, type ViewName, type ViewportApi } from '@/components/modeler/bridge'
import { PopupMenu, type MenuItem } from '@/components/modeler/PopupMenu'
import { addMenu, applyMenu, contextMenu, deleteMenu, mergeMenu, snapMenu } from '@/components/modeler/menus'
import { toast } from '@/components/ui/Toast'

type P = { x: number; y: number }
const st = () => useModeler.getState()

const SELECT_COLOR = new THREE.Color('#ff9d2e')
const WIRE_COLOR = new THREE.Color('#101014')
const XRAY_WIRE = new THREE.Color('#9aa0b4')

// solid view shows back faces like Blender; material view shows the in-game sidedness
const solidMaterial = new THREE.MeshStandardMaterial({ color: '#b9bcc5', roughness: 0.75, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })
const xrayMaterial = new THREE.MeshStandardMaterial({ color: '#b9bcc5', roughness: 0.8, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide })
const wireMaterial = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0, depthWrite: false })
const collisionMaterial = new THREE.MeshBasicMaterial({ color: '#33dfff', transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide })
const cageMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })

/* ---------------------------------------------------------------------------------------- */
/* Transform targets (shared by the G / R / S modal and the gizmo)                          */

type TransformTarget =
  | { type: 'verts'; objId: string; base: EditMesh; indices: number[]; world: THREE.Vector3[]; inv: THREE.Matrix4 }
  | { type: 'objects'; items: { id: string; pos: THREE.Vector3; quat: THREE.Quaternion; scale: THREE.Vector3 }[] }

function makeTarget(): TransformTarget | null {
  const s = st()
  if (s.mode === 'edit') {
    const obj = activeObject(s)
    if (!obj || !s.meshSel.verts.size) return null
    const m = objectMatrix(obj)
    const indices = [...s.meshSel.verts].filter((v) => v < obj.mesh.verts.length)
    if (!indices.length) return null
    const world = indices.map((v) => new THREE.Vector3(...obj.mesh.verts[v]).applyMatrix4(m))
    return { type: 'verts', objId: obj.id, base: obj.mesh, indices, world, inv: m.clone().invert() }
  }
  const items = s.doc.objects
    .filter((o) => s.selected.includes(o.id) && o.visible)
    .map((o) => ({
      id: o.id,
      pos: new THREE.Vector3(...o.position),
      quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(o.rotation[0], o.rotation[1], o.rotation[2], 'XYZ')),
      scale: new THREE.Vector3(...o.scale),
    }))
  return items.length ? { type: 'objects', items } : null
}

function targetPivot(t: TransformTarget) {
  const pts = t.type === 'verts' ? t.world : t.items.map((i) => i.pos)
  const c = new THREE.Vector3()
  for (const p of pts) c.add(p)
  return c.divideScalar(Math.max(1, pts.length))
}

/** x' = pivot + R (S ⊙ (x - pivot)) + T, in document space. */
function applyDelta(t: TransformTarget, pivot: THREE.Vector3, T: THREE.Vector3, R: THREE.Quaternion, S: THREE.Vector3) {
  const s = st()
  const tmp = new THREE.Vector3()
  if (t.type === 'verts') {
    const verts = t.base.verts.slice()
    t.indices.forEach((vi, k) => {
      tmp.copy(t.world[k]).sub(pivot).multiply(S).applyQuaternion(R).add(pivot).add(T).applyMatrix4(t.inv)
      verts[vi] = [tmp.x, tmp.y, tmp.z]
    })
    s.live({ doc: withObject(s.doc, t.objId, (o) => ({ ...o, mesh: { verts, faces: t.base.faces } })) })
    return
  }
  const items = new Map(t.items.map((i) => [i.id, i]))
  const e = new THREE.Euler()
  const uniform = S.x === S.y && S.y === S.z
  const doc: ModelDoc = {
    ...s.doc,
    objects: s.doc.objects.map((o) => {
      const it = items.get(o.id)
      if (!it) return o
      tmp.copy(it.pos).sub(pivot).multiply(S).applyQuaternion(R).add(pivot).add(T)
      const q = R.clone().multiply(it.quat)
      e.setFromQuaternion(q, 'XYZ')
      const scale: Vec3 = [it.scale.x, it.scale.y, it.scale.z]
      for (let i = 0; i < 3; i++) {
        let f = S.x
        if (!uniform) {
          // scale along global axes, expressed on the object's own axes
          const a = new THREE.Vector3(i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0).applyQuaternion(it.quat)
          f = a.x * a.x * S.x + a.y * a.y * S.y + a.z * a.z * S.z
        }
        scale[i] *= f
      }
      return { ...o, position: [tmp.x, tmp.y, tmp.z] as Vec3, rotation: [e.x, e.y, e.z] as Vec3, scale }
    }),
  }
  s.live({ doc })
}

/** Selection of `mode` from any selection (after ops that produce edge selections). */
function inMode(mesh: EditMesh, sel: MeshSelection, mode: SelectMode): MeshSelection {
  if (mode === 'vert') return flushSelection(mesh, { ...emptySelection(), verts: sel.verts }, 'vert')
  if (mode === 'edge') return flushSelection(mesh, { ...emptySelection(), edges: sel.edges }, 'edge')
  return flushSelection(mesh, { ...emptySelection(), faces: sel.faces }, 'face')
}

/* ---------------------------------------------------------------------------------------- */
/* Scene pieces                                                                              */

// objects are replaced (never mutated) on change, so their identity works as a version
const versions = new WeakMap<object, number>()
let nextVersion = 1
const versionOf = (o: object) => {
  let v = versions.get(o)
  if (!v) versions.set(o, (v = nextVersion++))
  return v
}

const helperMaterial = new THREE.MeshBasicMaterial({ color: '#9aa0b4', transparent: true, opacity: 0.06, depthWrite: false, side: THREE.DoubleSide })

function ObjectView({ obj, doc, selected, active, objectMode, shading, xray, registry }: { obj: ModelObject; doc: ModelDoc; selected: boolean; active: boolean; objectMode: boolean; shading: string; xray: boolean; registry: Map<string, THREE.Mesh> }) {
  const materials = doc.materials
  const usesBox = obj.materials.some((id) => materials.find((m) => m.id === id)?.uvMode !== 'mesh')
  // booleans read other objects: rebuild when they or this transform change
  const targets = modifierTargets(obj, doc)
  const boolKey = targets.length ? `${[obj.position, obj.rotation, obj.scale].join('|')}#${targets.map(versionOf).join(',')}` : ''
  const scaleKey = usesBox ? obj.scale.join(',') : ''
  const geo = useMemo(
    () => objectGeometry(obj, materials, doc),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [obj.mesh, obj.modifiers, obj.autoSmooth, obj.materials, materials, scaleKey, boolKey],
  )
  useEffect(() => () => geo.dispose(), [geo])
  const material = useMemo(() => {
    if (obj.role === 'collision') return collisionMaterial
    if (obj.role === 'helper') return helperMaterial
    if (shading === 'wireframe') return wireMaterial
    if (xray) return xrayMaterial
    if (shading === 'solid') return solidMaterial
    return modelMaterials.forObject(obj, materials)
  }, [obj, materials, shading, xray])
  const showEdges = (selected && objectMode) || shading === 'wireframe' || obj.role !== 'visual'
  const edges = useMemo(() => (showEdges ? new THREE.EdgesGeometry(geo, 25) : null), [geo, showEdges])
  useEffect(() => () => edges?.dispose(), [edges])
  const edgeColor = selected && objectMode ? (active ? '#ffc061' : '#e0781f') : obj.role === 'collision' ? '#33dfff' : obj.role === 'helper' ? '#b4bac9' : '#8f96ab'
  return (
    <group position={obj.position} rotation={[obj.rotation[0], obj.rotation[1], obj.rotation[2]]} scale={obj.scale} visible={obj.visible}>
      <mesh
        ref={(m) => {
          if (m) registry.set(obj.id, m)
          else registry.delete(obj.id)
        }}
        geometry={geo}
        material={material}
        userData={{ objectId: obj.id }}
        castShadow
        receiveShadow
      />
      {edges && (
        <lineSegments geometry={edges} renderOrder={2} raycast={() => null}>
          <lineBasicMaterial color={edgeColor} transparent opacity={selected && objectMode ? 1 : obj.role === 'helper' ? 0.55 : 0.8} depthTest={obj.role !== 'helper'} />
        </lineSegments>
      )}
    </group>
  )
}

function EditOverlay({ obj, sel, selectMode, xray, cage, loopPreview }: { obj: ModelObject; sel: MeshSelection; selectMode: SelectMode; xray: boolean; cage: RefObject<THREE.Mesh | null>; loopPreview: Float32Array | null }) {
  const cageGeo = useMemo(() => buildGeometry(obj.mesh, { autoSmooth: 180 }), [obj.mesh])
  useEffect(() => () => cageGeo.dispose(), [cageGeo])
  const edgeList = useMemo(() => [...buildEdges(obj.mesh).values()], [obj.mesh])
  const wire = xray ? XRAY_WIRE : WIRE_COLOR

  const edgeGeo = useMemo(() => {
    const pos = new Float32Array(edgeList.length * 6)
    const col = new Float32Array(edgeList.length * 6)
    edgeList.forEach((e, i) => {
      const a = obj.mesh.verts[e.a]
      const b = obj.mesh.verts[e.b]
      pos.set(a, i * 6)
      pos.set(b, i * 6 + 3)
      let ca = wire
      let cb = wire
      if (selectMode === 'vert') {
        if (sel.verts.has(e.a)) ca = SELECT_COLOR
        if (sel.verts.has(e.b)) cb = SELECT_COLOR
      } else if (sel.edges.has(edgeKey(e.a, e.b))) {
        ca = SELECT_COLOR
        cb = SELECT_COLOR
      }
      col.set([ca.r, ca.g, ca.b], i * 6)
      col.set([cb.r, cb.g, cb.b], i * 6 + 3)
    })
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    return g
  }, [edgeList, obj.mesh, sel, selectMode, wire])
  useEffect(() => () => edgeGeo.dispose(), [edgeGeo])

  const pointGeo = useMemo(() => {
    if (selectMode !== 'vert') return null
    const pos = new Float32Array(obj.mesh.verts.length * 3)
    const col = new Float32Array(obj.mesh.verts.length * 3)
    obj.mesh.verts.forEach((p, i) => {
      pos.set(p, i * 3)
      const c = sel.verts.has(i) ? SELECT_COLOR : wire
      col.set([c.r, c.g, c.b], i * 3)
    })
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    return g
  }, [obj.mesh, sel, selectMode, wire])
  useEffect(() => () => pointGeo?.dispose(), [pointGeo])

  const faceGeo = useMemo(() => {
    if (!sel.faces.size) return null
    const faces = obj.mesh.faces.filter((_, i) => sel.faces.has(i))
    return buildGeometry({ verts: obj.mesh.verts, faces }, { autoSmooth: 0 })
  }, [obj.mesh, sel])
  useEffect(() => () => faceGeo?.dispose(), [faceGeo])

  const centerGeo = useMemo(() => {
    if (selectMode !== 'face') return null
    const pos = new Float32Array(obj.mesh.faces.length * 3)
    const col = new Float32Array(obj.mesh.faces.length * 3)
    obj.mesh.faces.forEach((f, i) => {
      pos.set(faceCenter(obj.mesh, f), i * 3)
      const c = sel.faces.has(i) ? SELECT_COLOR : wire
      col.set([c.r, c.g, c.b], i * 3)
    })
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    return g
  }, [obj.mesh, sel, selectMode, wire])
  useEffect(() => () => centerGeo?.dispose(), [centerGeo])

  const previewGeo = useMemo(() => {
    if (!loopPreview) return null
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(loopPreview, 3))
    return g
  }, [loopPreview])
  useEffect(() => () => previewGeo?.dispose(), [previewGeo])

  return (
    <group position={obj.position} rotation={[obj.rotation[0], obj.rotation[1], obj.rotation[2]]} scale={obj.scale}>
      <mesh ref={cage} geometry={cageGeo} material={cageMaterial} visible={false} />
      {faceGeo && (
        <mesh geometry={faceGeo} renderOrder={1} raycast={() => null}>
          <meshBasicMaterial color="#ff9d2e" transparent opacity={0.25} depthTest={!xray} depthWrite={false} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
        </mesh>
      )}
      <lineSegments geometry={edgeGeo} renderOrder={2} raycast={() => null}>
        <lineBasicMaterial vertexColors depthTest={!xray} />
      </lineSegments>
      {pointGeo && (
        <points geometry={pointGeo} renderOrder={3} raycast={() => null}>
          <pointsMaterial vertexColors size={6} sizeAttenuation={false} depthTest={!xray} />
        </points>
      )}
      {centerGeo && (
        <points geometry={centerGeo} renderOrder={3} raycast={() => null}>
          <pointsMaterial vertexColors size={4} sizeAttenuation={false} depthTest={!xray} />
        </points>
      )}
      {previewGeo && (
        <lineSegments geometry={previewGeo} renderOrder={4} raycast={() => null}>
          <lineBasicMaterial color="#ffe14d" depthTest={false} />
        </lineSegments>
      )}
    </group>
  )
}

/** Ground grid in the document XY plane: 1 m lines out to 50 m, 10 cm lines near the origin, red X / green Y axes. */
function GroundGrid() {
  const geo = useMemo(() => {
    const pos: number[] = []
    const col: number[] = []
    // short segments: some GPUs (and software WebGL) drop long lines that pass behind the camera
    const line = (x0: number, y0: number, x1: number, y1: number, c: [number, number, number]) => {
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)))
      for (let k = 0; k < n; k++) {
        const a = k / n
        const b = (k + 1) / n
        pos.push(x0 + (x1 - x0) * a, y0 + (y1 - y0) * a, 0, x0 + (x1 - x0) * b, y0 + (y1 - y0) * b, 0)
        col.push(...c, ...c)
      }
    }
    // linear colour values (the renderer outputs sRGB)
    const minor: [number, number, number] = [0.016, 0.017, 0.022]
    const major: [number, number, number] = [0.04, 0.042, 0.052]
    for (let i = -50; i <= 50; i++) {
      if (i % 10 === 0) continue
      line(i / 10, -5, i / 10, 5, minor)
      line(-5, i / 10, 5, i / 10, minor)
    }
    for (let i = -50; i <= 50; i++) {
      if (i === 0) continue
      line(i, -50, i, 50, major)
      line(-50, i, 50, i, major)
    }
    line(-50, 0, 50, 0, [0.75, 0.04, 0.07])
    line(0, -50, 0, 50, [0.22, 0.55, 0.02])
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    return g
  }, [])
  useEffect(() => () => geo.dispose(), [geo])
  return (
    <lineSegments geometry={geo} raycast={() => null} renderOrder={-1}>
      <lineBasicMaterial vertexColors transparent opacity={0.95} depthWrite={false} />
    </lineSegments>
  )
}

function Cursor3D({ p }: { p: Vec3 }) {
  return (
    <group position={p}>
      <Billboard>
        <mesh raycast={() => null} renderOrder={5}>
          <ringGeometry args={[0.045, 0.06, 24]} />
          <meshBasicMaterial color="#ff4d6d" depthTest={false} transparent opacity={0.9} />
        </mesh>
        <mesh raycast={() => null} renderOrder={5}>
          <ringGeometry args={[0.03, 0.045, 24]} />
          <meshBasicMaterial color="#ffffff" depthTest={false} transparent opacity={0.9} />
        </mesh>
      </Billboard>
    </group>
  )
}

function PlayerReference() {
  // GTA ped: about 1.8 m, standing next to the model
  return (
    <group position={[-1.4, 0.8, 0.9]} rotation={[Math.PI / 2, 0, 0]}>
      <mesh raycast={() => null}>
        <capsuleGeometry args={[0.25, 1.3, 6, 16]} />
        <meshStandardMaterial color="#6b8cff" transparent opacity={0.28} depthWrite={false} />
      </mesh>
    </group>
  )
}

function GizmoTool({ gizmo }: { gizmo: RefObject<TransformControlsImpl | null> }) {
  const tool = useModeler((s) => s.tool)
  const doc = useModeler((s) => s.doc)
  const mode = useModeler((s) => s.mode)
  const selected = useModeler((s) => s.selected)
  const meshSel = useModeler((s) => s.meshSel)
  const active = useModeler((s) => s.active)
  const snap = useModeler((s) => s.snap)
  const status = useModeler((s) => s.status)
  const [proxy, setProxy] = useState<THREE.Group | null>(null)
  const drag = useRef<{ target: TransformTarget; pivot: THREE.Vector3 } | null>(null)

  const pivot = useMemo(() => {
    const s = { doc, mode, selected, meshSel, active }
    if (s.mode === 'edit') {
      const obj = s.doc.objects.find((o) => o.id === s.active)
      if (!obj || !s.meshSel.verts.size) return null
      const m = objectMatrix(obj)
      const c = new THREE.Vector3()
      let n = 0
      for (const v of s.meshSel.verts) {
        const p = obj.mesh.verts[v]
        if (!p) continue
        c.add(new THREE.Vector3(...p).applyMatrix4(m))
        n++
      }
      return n ? c.divideScalar(n) : null
    }
    const objs = s.doc.objects.filter((o) => s.selected.includes(o.id) && o.visible)
    if (!objs.length) return null
    const c = new THREE.Vector3()
    for (const o of objs) c.add(new THREE.Vector3(...o.position))
    return c.divideScalar(objs.length)
  }, [doc, mode, selected, meshSel, active])

  useEffect(() => {
    if (!proxy || drag.current || !pivot) return
    proxy.position.copy(pivot)
    proxy.quaternion.identity()
    proxy.scale.set(1, 1, 1)
  }, [pivot, proxy])

  const show = !!pivot && (tool === 'move' || tool === 'rotate' || tool === 'scale') && !status
  return (
    <>
      <group ref={setProxy} />
      {show && proxy && (
        <TransformControls
          ref={gizmo}
          object={proxy}
          mode={tool === 'move' ? 'translate' : tool === 'rotate' ? 'rotate' : 'scale'}
          space="local"
          size={0.9}
          translationSnap={snap ? 0.1 : null}
          rotationSnap={snap ? THREE.MathUtils.degToRad(5) : null}
          scaleSnap={snap ? 0.1 : null}
          onMouseDown={() => {
            const target = makeTarget()
            if (!target) return
            st().begin()
            drag.current = { target, pivot: targetPivot(target) }
          }}
          onObjectChange={() => {
            const d = drag.current
            const g = proxy
            if (!d || !g) return
            const T = g.position.clone().sub(d.pivot)
            applyDelta(d.target, d.pivot, T, g.quaternion.clone(), g.scale.clone())
          }}
          onMouseUp={() => {
            if (!drag.current) return
            drag.current = null
            st().end(true)
            const g = proxy
            if (g) {
              g.quaternion.identity()
              g.scale.set(1, 1, 1)
            }
          }}
        />
      )}
    </>
  )
}

/* ---------------------------------------------------------------------------------------- */
/* Interaction                                                                               */

type Modal =
  | {
      kind: 'transform'
      op: 'translate' | 'rotate' | 'scale'
      /** -1 free, 0..2 global axis, 3 custom (extrude normal). */
      axis: number
      plane: boolean
      custom: THREE.Vector3 | null
      numeric: string
      start: P
      pivot: THREE.Vector3
      pivotScreen: P
      angle: number
      lastAngle: number
      target: TransformTarget
    }
  | { kind: 'inset'; start: P; pivot: THREE.Vector3; pivotScreen: P; startDist: number; perPixel: number; faces: Set<number>; individual: boolean; base: EditMesh; objId: string; numeric: string; scale: number }
  | { kind: 'loopcut'; cuts: number; hover: string | null; result: OpResult | null; base: EditMesh; objId: string; last: P }

const AXIS_NAMES = ['X', 'Y', 'Z']
const unitAxis = (i: number) => new THREE.Vector3(i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0)
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
const roundTo = (v: number, step: number) => Math.round(v / step) * step
const fmt = (n: number, d = 3) => (Math.abs(n) < 1e-9 ? '0' : n.toFixed(d))

interface ControllerProps {
  registry: Map<string, THREE.Mesh>
  cage: RefObject<THREE.Mesh | null>
  gizmo: RefObject<TransformControlsImpl | null>
  container: RefObject<HTMLDivElement | null>
  mouse: RefObject<P>
  menuOpen: RefObject<boolean>
  onMenu: (kind: 'add' | 'delete' | 'merge' | 'context' | 'snap' | 'apply', at: P) => void
  onBox: (r: { x0: number; y0: number; x1: number; y1: number } | null) => void
  setLoopPreview: (a: Float32Array | null) => void
  cameraQuaternion: THREE.Quaternion
}

function Controller({ registry, cage, gizmo, container, mouse, menuOpen, onMenu, onBox, setLoopPreview, cameraQuaternion }: ControllerProps) {
  const get = useThree((s) => s.get)
  const modal = useRef<Modal | null>(null)

  useFrame(({ camera }) => {
    cameraQuaternion.copy(camera.quaternion)
  })

  useEffect(() => {
    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    const tmp = new THREE.Vector3()
    const three = () => get()
    const cam = () => three().camera as THREE.PerspectiveCamera
    const orbit = () => three().controls as unknown as OrbitControlsImpl | null
    const canvas = () => three().gl.domElement
    const rect = () => canvas().getBoundingClientRect()
    const local = (e: { clientX: number; clientY: number }): P => {
      const r = rect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const rayAt = (p: P) => {
      const r = rect()
      ndc.set((p.x / r.width) * 2 - 1, -(p.y / r.height) * 2 + 1)
      raycaster.near = 0
      raycaster.far = Infinity
      raycaster.setFromCamera(ndc, cam())
      return raycaster
    }
    const docRay = (p: P) => rayAt(p).ray.clone().applyMatrix4(ROOT_INVERSE)
    /** Screen position of a world point; `z` > 1 means behind the camera. */
    const project = (world: THREE.Vector3): P & { z: number } => {
      const r = rect()
      tmp.copy(world).project(cam())
      return { x: ((tmp.x + 1) / 2) * r.width, y: ((1 - tmp.y) / 2) * r.height, z: tmp.z }
    }
    const projectDoc = (p: THREE.Vector3) => project(docToWorld([p.x, p.y, p.z]))
    const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y)
    /** Metres per pixel at a document point. */
    const perPixel = (p: THREE.Vector3) => {
      const c = cam()
      const d = c.position.distanceTo(docToWorld([p.x, p.y, p.z]))
      return (2 * d * Math.tan(THREE.MathUtils.degToRad(c.fov) / 2)) / Math.max(1, rect().height)
    }
    /** Camera forward, in document space. */
    const viewDirDoc = () => {
      const w = new THREE.Vector3(0, 0, -1).applyQuaternion(cam().quaternion)
      return new THREE.Vector3(...worldToDoc(w))
    }
    const cameraDoc = () => new THREE.Vector3(...worldToDoc(cam().position))

    /* ---------------- picking ---------------- */

    const pickObject = (p: P) => {
      const s = st()
      const rc = rayAt(p)
      const meshes = [...registry.entries()].filter(([id]) => s.doc.objects.find((o) => o.id === id)?.visible).map(([, m]) => m)
      const hit = rc.intersectObjects(meshes, false)[0]
      return hit ? { id: hit.object.userData.objectId as string, point: hit.point } : null
    }

    const occluded = (world: THREE.Vector3) => {
      if (st().xray || !cage.current) return false
      const c = cam()
      const dir = world.clone().sub(c.position)
      const d = dir.length()
      raycaster.set(c.position, dir.normalize())
      raycaster.near = 0
      raycaster.far = d
      const hits = raycaster.intersectObject(cage.current, false)
      return hits.length > 0 && hits[0].distance < d - Math.max(1e-4, d * 2e-3)
    }

    const editCtx = () => {
      const s = st()
      const obj = activeObject(s)
      if (!obj || s.mode !== 'edit') return null
      const M = objectWorldMatrix(obj)
      const world = obj.mesh.verts.map((v) => new THREE.Vector3(...v).applyMatrix4(M))
      const screen = world.map((w) => project(w))
      return { s, obj, M, world, screen }
    }

    const pickVert = (ctx: NonNullable<ReturnType<typeof editCtx>>, p: P, radius = 14) => {
      const cands: { i: number; d: number }[] = []
      ctx.screen.forEach((sp, i) => {
        if (sp.z > 1) return
        const d = dist(sp, p)
        if (d <= radius) cands.push({ i, d })
      })
      cands.sort((a, b) => a.d - b.d)
      for (const c of cands.slice(0, 16)) if (!occluded(ctx.world[c.i])) return c.i
      return null
    }

    const pickEdge = (ctx: NonNullable<ReturnType<typeof editCtx>>, p: P, radius = 12) => {
      const cands: { k: string; d: number; t: number; a: number; b: number }[] = []
      for (const [k, e] of buildEdges(ctx.obj.mesh)) {
        const A = ctx.screen[e.a]
        const B = ctx.screen[e.b]
        if (A.z > 1 && B.z > 1) continue
        const dx = B.x - A.x
        const dy = B.y - A.y
        const l2 = dx * dx + dy * dy
        const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - A.x) * dx + (p.y - A.y) * dy) / l2)) : 0
        const d = Math.hypot(A.x + dx * t - p.x, A.y + dy * t - p.y)
        if (d <= radius) cands.push({ k, d, t, a: e.a, b: e.b })
      }
      cands.sort((a, b) => a.d - b.d)
      for (const c of cands.slice(0, 16)) {
        const w = ctx.world[c.a].clone().lerp(ctx.world[c.b], c.t)
        if (!occluded(w)) return c.k
      }
      return null
    }

    const pickFace = (p: P) => {
      if (!cage.current) return null
      const hit = rayAt(p).intersectObject(cage.current, false)[0]
      if (!hit || hit.faceIndex == null) return null
      const map = (cage.current.geometry.userData.faceOfTriangle as Int32Array | undefined) ?? null
      return map ? map[hit.faceIndex] : null
    }

    const commitSel = (obj: ModelObject, sel: MeshSelection, mode: SelectMode) => st().commit({ meshSel: flushSelection(obj.mesh, sel, mode) })

    const clickSelect = (p: P, extend: boolean) => {
      const s = st()
      if (s.mode === 'object') {
        const hit = pickObject(p)
        if (!hit) {
          if (!extend && s.selected.length) s.commit({ selected: [] })
          return
        }
        if (extend) {
          const has = s.selected.includes(hit.id)
          if (has && s.active === hit.id) s.commit({ selected: s.selected.filter((id) => id !== hit.id) })
          else s.commit({ selected: has ? s.selected : [...s.selected, hit.id], active: hit.id })
        } else s.commit({ selected: [hit.id], active: hit.id })
        return
      }
      const ctx = editCtx()
      if (!ctx) return
      const base = extend ? { verts: new Set(s.meshSel.verts), edges: new Set(s.meshSel.edges), faces: new Set(s.meshSel.faces) } : emptySelection()
      const toggle = <T,>(set: Set<T>, v: T) => (extend && set.has(v) ? set.delete(v) : set.add(v))
      if (s.selectMode === 'vert') {
        const v = pickVert(ctx, p)
        if (v === null) return !extend && commitSel(ctx.obj, emptySelection(), 'vert')
        toggle(base.verts, v)
        commitSel(ctx.obj, base, 'vert')
      } else if (s.selectMode === 'edge') {
        const k = pickEdge(ctx, p)
        if (k === null) return !extend && commitSel(ctx.obj, emptySelection(), 'edge')
        toggle(base.edges, k)
        commitSel(ctx.obj, base, 'edge')
      } else {
        const f = pickFace(p)
        if (f === null) return !extend && commitSel(ctx.obj, emptySelection(), 'face')
        toggle(base.faces, f)
        commitSel(ctx.obj, base, 'face')
      }
    }

    /** Alt+click: edge loop; Ctrl+Alt+click: edge ring. */
    const loopSelect = (p: P, ring: boolean, extend: boolean) => {
      const ctx = editCtx()
      if (!ctx) return
      const k = pickEdge(ctx, p, 16)
      if (!k) return
      const s = ctx.s
      const mesh = ctx.obj.mesh
      const sel = extend ? { verts: new Set(s.meshSel.verts), edges: new Set(s.meshSel.edges), faces: new Set(s.meshSel.faces) } : emptySelection()
      if (s.selectMode === 'face') {
        // face loop: the quads crossed by the ring through the edge
        const r = edgeRing(mesh, k)
        const edges = buildEdges(mesh)
        const count = new Map<number, number>()
        for (const rk of r.edges) for (const x of edges.get(rk)?.faces ?? []) count.set(x.f, (count.get(x.f) ?? 0) + 1)
        for (const [f, c] of count) if (c >= 2) sel.faces.add(f)
        commitSel(ctx.obj, sel, 'face')
        return
      }
      const list = ring ? edgeRing(mesh, k).edges : edgeLoop(mesh, k)
      for (const e of list) {
        sel.edges.add(e)
        const [a, b] = edgeVerts(e)
        sel.verts.add(a)
        sel.verts.add(b)
      }
      commitSel(ctx.obj, sel, s.selectMode)
    }

    const selectLinkedUnder = (p: P) => {
      const ctx = editCtx()
      if (!ctx) return
      const f = pickFace(p)
      if (f === null) return
      const linked = selectLinked(ctx.obj.mesh, ctx.obj.mesh.faces[f].v, ctx.s.selectMode)
      const s = ctx.s
      const merged = {
        verts: new Set([...s.meshSel.verts, ...linked.verts]),
        edges: new Set([...s.meshSel.edges, ...linked.edges]),
        faces: new Set([...s.meshSel.faces, ...linked.faces]),
      }
      commitSel(ctx.obj, merged, s.selectMode)
    }

    const boxSelect = (r: { x0: number; y0: number; x1: number; y1: number }, extend: boolean, subtract: boolean) => {
      const x0 = Math.min(r.x0, r.x1)
      const x1 = Math.max(r.x0, r.x1)
      const y0 = Math.min(r.y0, r.y1)
      const y1 = Math.max(r.y0, r.y1)
      const inside = (q: P & { z: number }) => q.z <= 1 && q.x >= x0 && q.x <= x1 && q.y >= y0 && q.y <= y1
      const s = st()
      if (s.mode === 'object') {
        const hits: string[] = []
        for (const o of s.doc.objects) {
          if (!o.visible) continue
          const M = objectWorldMatrix(o)
          const mesh = evaluateObject(o, s.doc)
          const step = Math.max(1, Math.floor(mesh.verts.length / 3000))
          for (let i = 0; i < mesh.verts.length; i += step) {
            if (inside(project(new THREE.Vector3(...mesh.verts[i]).applyMatrix4(M)))) {
              hits.push(o.id)
              break
            }
          }
        }
        const selected = subtract ? s.selected.filter((id) => !hits.includes(id)) : extend ? [...new Set([...s.selected, ...hits])] : hits
        s.commit({ selected, active: !subtract && hits.length ? hits[hits.length - 1] : s.active })
        return
      }
      const ctx = editCtx()
      if (!ctx) return
      const mesh = ctx.obj.mesh
      const inRect = ctx.screen.map(inside)
      const candidates = inRect.reduce((n, b) => n + (b ? 1 : 0), 0)
      // exact occlusion for moderate counts, facing test for huge selections
      let facing: Uint8Array | null = null
      if (candidates > 2500 && !s.xray) {
        facing = new Uint8Array(mesh.verts.length)
        const camDoc = cameraDoc()
        const inv = objectMatrix(ctx.obj).invert()
        const camLocal = camDoc.clone().applyMatrix4(inv)
        mesh.faces.forEach((f) => {
          const n = faceNormal(mesh, f)
          const c = faceCenter(mesh, f)
          if ((camLocal.x - c[0]) * n[0] + (camLocal.y - c[1]) * n[1] + (camLocal.z - c[2]) * n[2] > 0) for (const v of f.v) facing![v] = 1
        })
      }
      const vis = (i: number) => (facing ? facing[i] === 1 : !occluded(ctx.world[i]))
      const visible = new Map<number, boolean>()
      const vVisible = (i: number) => {
        let v = visible.get(i)
        if (v === undefined) {
          v = vis(i)
          visible.set(i, v)
        }
        return v
      }
      const picked = emptySelection()
      if (s.selectMode === 'vert') {
        inRect.forEach((b, i) => b && vVisible(i) && picked.verts.add(i))
      } else if (s.selectMode === 'edge') {
        for (const [k, e] of buildEdges(mesh)) if (inRect[e.a] && inRect[e.b] && vVisible(e.a) && vVisible(e.b)) picked.edges.add(k)
      } else {
        const M = ctx.M
        mesh.faces.forEach((f, fi) => {
          const c = new THREE.Vector3(...faceCenter(mesh, f)).applyMatrix4(M)
          if (!inside(project(c))) return
          if (s.xray || !occluded(c)) picked.faces.add(fi)
        })
      }
      const cur = s.meshSel
      const key = s.selectMode === 'vert' ? 'verts' : s.selectMode === 'edge' ? 'edges' : 'faces'
      const next = emptySelection()
      if (subtract) {
        for (const x of cur[key] as Set<number | string>) if (!(picked[key] as Set<number | string>).has(x)) (next[key] as Set<number | string>).add(x)
      } else {
        if (extend) for (const x of cur[key] as Set<number | string>) (next[key] as Set<number | string>).add(x)
        for (const x of picked[key] as Set<number | string>) (next[key] as Set<number | string>).add(x)
      }
      commitSel(ctx.obj, next, s.selectMode)
    }

    const placeCursor = (p: P) => {
      const hit = pickObject(p)
      let target: Vec3 | null = null
      if (hit) target = worldToDoc(hit.point)
      else {
        const ray = docRay(p)
        const hitPlane = ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), new THREE.Vector3())
        if (hitPlane) target = [hitPlane.x, hitPlane.y, 0]
      }
      if (target) st().patch({ doc: { ...st().doc, cursor: target } })
    }

    /* ---------------- modal operations ---------------- */

    const setStatus = (text: string | null) => st().setStatus(text)

    const screenAngle = (m: { pivotScreen: P }, p: P) => Math.atan2(-(p.y - m.pivotScreen.y), p.x - m.pivotScreen.x)

    const startTransform = (op: 'translate' | 'rotate' | 'scale', custom: THREE.Vector3 | null = null) => {
      const target = makeTarget()
      if (!target) {
        if (st().txn) st().end(false)
        return
      }
      if (!st().txn) st().begin()
      const pivot = targetPivot(target)
      const start = { ...mouse.current }
      const m: Modal = { kind: 'transform', op, axis: custom ? 3 : -1, plane: false, custom, numeric: '', start, pivot, pivotScreen: projectDoc(pivot), angle: 0, lastAngle: 0, target }
      m.lastAngle = screenAngle(m, start)
      modal.current = m
      updateModal(start, false, false)
    }

    const closestOnAxis = (p: P, origin: THREE.Vector3, d: THREE.Vector3) => {
      const ray = docRay(p)
      const w0 = origin.clone().sub(ray.origin)
      const b = d.dot(ray.direction)
      const denom = 1 - b * b
      if (denom < 1e-6) return null
      const dd = d.dot(w0)
      const e = ray.direction.dot(w0)
      return (b * e - dd) / denom
    }

    const updateTransform = (m: Extract<Modal, { kind: 'transform' }>, p: P, ctrl: boolean, shift: boolean) => {
      const snap = ctrl !== st().snap
      const T = new THREE.Vector3()
      const R = new THREE.Quaternion()
      const S = new THREE.Vector3(1, 1, 1)
      const num = m.numeric === '' || m.numeric === '-' || m.numeric === '.' ? NaN : Number(m.numeric)
      const axisDir = m.axis === 3 ? m.custom : m.axis >= 0 ? unitAxis(m.axis) : null
      const axisLabel = m.axis === 3 ? 'normal' : m.axis >= 0 ? `${m.plane ? 'plane ⊥ ' : ''}${AXIS_NAMES[m.axis]}` : 'free'
      let text = ''
      if (m.op === 'translate') {
        if (Number.isFinite(num)) {
          if (axisDir && !m.plane) T.copy(axisDir).multiplyScalar(num)
          else T.set(num, 0, 0)
        } else if (axisDir && !m.plane) {
          const t = closestOnAxis(p, m.pivot, axisDir)
          const t0 = closestOnAxis(m.start, m.pivot, axisDir)
          let d = t !== null && t0 !== null ? t - t0 : ((m.start.y - p.y) * perPixel(m.pivot))
          if (snap) d = roundTo(d, shift ? 0.01 : 0.1)
          T.copy(axisDir).multiplyScalar(d)
        } else {
          const n = m.plane && axisDir ? axisDir.clone() : viewDirDoc()
          const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, m.pivot)
          const a = docRay(m.start).intersectPlane(plane, new THREE.Vector3())
          const b = docRay(p).intersectPlane(plane, new THREE.Vector3())
          if (a && b) T.copy(b).sub(a)
          if (snap) T.set(roundTo(T.x, shift ? 0.01 : 0.1), roundTo(T.y, shift ? 0.01 : 0.1), roundTo(T.z, shift ? 0.01 : 0.1))
          if (m.plane && axisDir) T.addScaledVector(axisDir, -T.dot(axisDir))
        }
        text = `Move  ${fmt(T.x)}  ${fmt(T.y)}  ${fmt(T.z)} m  (${axisLabel})`
      } else if (m.op === 'rotate') {
        const a = screenAngle(m, p)
        m.angle += wrapAngle(a - m.lastAngle)
        m.lastAngle = a
        let angle = Number.isFinite(num) ? THREE.MathUtils.degToRad(num) : m.angle
        if (!Number.isFinite(num) && snap) angle = roundTo(angle, THREE.MathUtils.degToRad(shift ? 1 : 5))
        const toCam = cameraDoc().sub(m.pivot).normalize()
        let axis = axisDir ? axisDir.clone() : toCam
        if (axisDir && !Number.isFinite(num) && axisDir.dot(toCam) < 0) axis = axis.negate()
        R.setFromAxisAngle(axis, angle)
        text = `Rotate  ${fmt(THREE.MathUtils.radToDeg(angle), 1)}°  (${axisDir ? axisLabel : 'view'})`
      } else {
        let f = Number.isFinite(num) ? num : dist(p, m.pivotScreen) / Math.max(6, dist(m.start, m.pivotScreen))
        if (!Number.isFinite(num) && snap) f = roundTo(f, shift ? 0.01 : 0.1)
        if (m.axis >= 0 && m.axis < 3) {
          if (m.plane) S.set(f, f, f).setComponent(m.axis, 1)
          else S.setComponent(m.axis, f)
        } else S.set(f, f, f)
        text = `Scale  ${fmt(f)}  (${axisLabel})`
      }
      applyDelta(m.target, m.pivot, T, R, S)
      setStatus(`${text}${m.numeric ? `   [${m.numeric}]` : ''}   ·   X Y Z axis · Shift+axis plane · Ctrl snap · type a value · Enter / click confirm · Esc / right click cancel`)
    }

    const updateInset = (m: Extract<Modal, { kind: 'inset' }>, p: P) => {
      const num = m.numeric === '' || m.numeric === '.' ? NaN : Number(m.numeric)
      const thickness = Number.isFinite(num) ? num : Math.max(0, m.startDist - dist(p, m.pivotScreen)) * m.perPixel
      const local = thickness / m.scale
      const s = st()
      const res = insetFaces(m.base, m.faces, local, 0, m.individual, s.selectMode)
      s.live({ doc: withObject(s.doc, m.objId, (o) => ({ ...o, mesh: res.mesh })), meshSel: res.sel })
      setStatus(`Inset  ${fmt(thickness)} m${m.individual ? '  (individual)' : ''}${m.numeric ? `   [${m.numeric}]` : ''}   ·   move towards the faces · I individual · Enter / click confirm · Esc cancel`)
    }

    const updateLoopCut = (m: Extract<Modal, { kind: 'loopcut' }>, p: P, force = false) => {
      m.last = p
      const ctx = editCtx()
      if (!ctx) return
      // like Blender: the edge of the face under the mouse closest to it, else any edge nearby
      let k: string | null = null
      const f = pickFace(p)
      if (f !== null) {
        const fv = ctx.obj.mesh.faces[f].v
        let best = Infinity
        for (let i = 0; i < fv.length; i++) {
          const A = ctx.screen[fv[i]]
          const B = ctx.screen[fv[(i + 1) % fv.length]]
          const dx = B.x - A.x
          const dy = B.y - A.y
          const l2 = dx * dx + dy * dy
          const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - A.x) * dx + (p.y - A.y) * dy) / l2)) : 0
          const d = Math.hypot(A.x + dx * t - p.x, A.y + dy * t - p.y)
          if (d < best) {
            best = d
            k = edgeKey(fv[i], fv[(i + 1) % fv.length])
          }
        }
      }
      k ??= pickEdge(ctx, p, 40)
      if (k === m.hover && !force) return
      m.hover = k
      m.result = k ? loopCut(m.base, k, m.cuts, 0.5) : null
      if (m.result) {
        const res = m.result
        const pos: number[] = []
        for (const e of res.sel.edges) {
          const [a, b] = edgeVerts(e)
          pos.push(...res.mesh.verts[a], ...res.mesh.verts[b])
        }
        setLoopPreview(new Float32Array(pos))
      } else setLoopPreview(null)
      setStatus(`Loop cut  ${m.cuts} cut${m.cuts === 1 ? '' : 's'}   ·   hover an edge · wheel or + / − for more cuts · click to cut · Esc cancel`)
    }

    const updateModal = (p: P, ctrl: boolean, shift: boolean) => {
      const m = modal.current
      if (!m) return
      if (m.kind === 'transform') updateTransform(m, p, ctrl, shift)
      else if (m.kind === 'inset') updateInset(m, p)
      else updateLoopCut(m, p)
    }

    const finishModal = (keep: boolean) => {
      const m = modal.current
      if (!m) return
      modal.current = null
      setStatus(null)
      if (m.kind === 'loopcut') {
        setLoopPreview(null)
        const res = m.result
        if (keep && res) {
          const s = st()
          s.commit({ doc: withObject(s.doc, m.objId, (o) => ({ ...o, mesh: res.mesh })), meshSel: inMode(res.mesh, res.sel, s.selectMode) })
        }
        const o = orbit()
        if (o) o.enableZoom = true
        return
      }
      st().end(keep)
    }

    const startExtrude = () => {
      const s = st()
      const obj = activeObject(s)
      if (!obj || s.mode !== 'edit') return
      let res: (OpResult & { moved: number[] }) | null = null
      let normal: THREE.Vector3 | null = null
      if (s.meshSel.faces.size) {
        res = extrudeFaces(obj.mesh, s.meshSel.faces, s.selectMode)
        const n = new THREE.Vector3()
        for (const f of s.meshSel.faces) {
          const face = obj.mesh.faces[f]
          if (face) n.add(new THREE.Vector3(...faceNormal(obj.mesh, face)).multiplyScalar(faceArea(obj.mesh, face)))
        }
        const nm = new THREE.Matrix3().getNormalMatrix(objectMatrix(obj))
        n.applyMatrix3(nm)
        if (n.lengthSq() > 1e-12) normal = n.normalize()
      } else if (s.meshSel.edges.size) res = extrudeEdges(obj.mesh, s.meshSel.edges, s.selectMode)
      if (!res || !res.moved.length) {
        toast.info('Extrude', 'Select faces, or boundary edges, to extrude.')
        return
      }
      s.begin()
      s.live({ doc: withObject(s.doc, obj.id, (o) => ({ ...o, mesh: res.mesh })), meshSel: res.sel })
      startTransform('translate', normal)
    }

    const startInset = () => {
      const s = st()
      const obj = activeObject(s)
      if (!obj || s.mode !== 'edit') return
      if (!s.meshSel.faces.size) {
        toast.info('Inset', 'Select one or more faces first.')
        return
      }
      const M = objectMatrix(obj)
      const pivot = new THREE.Vector3()
      let n = 0
      for (const f of s.meshSel.faces) {
        const face = obj.mesh.faces[f]
        if (!face) continue
        pivot.add(new THREE.Vector3(...faceCenter(obj.mesh, face)).applyMatrix4(M))
        n++
      }
      pivot.divideScalar(Math.max(1, n))
      const pivotScreen = projectDoc(pivot)
      const start = { ...mouse.current }
      s.begin()
      const scale = (Math.abs(obj.scale[0]) + Math.abs(obj.scale[1]) + Math.abs(obj.scale[2])) / 3 || 1
      modal.current = { kind: 'inset', start, pivot, pivotScreen, startDist: Math.max(40, dist(start, pivotScreen)), perPixel: perPixel(pivot), faces: new Set(s.meshSel.faces), individual: false, base: obj.mesh, objId: obj.id, numeric: '', scale }
      updateModal(start, false, false)
    }

    const startLoopCut = () => {
      const s = st()
      const obj = activeObject(s)
      if (!obj || s.mode !== 'edit') return
      const o = orbit()
      if (o) o.enableZoom = false
      modal.current = { kind: 'loopcut', cuts: 1, hover: null, result: null, base: obj.mesh, objId: obj.id, last: { ...mouse.current } }
      updateLoopCut(modal.current, mouse.current, true)
    }

    const duplicateMove = () => {
      const s = st()
      if (s.mode === 'edit') {
        const obj = activeObject(s)
        if (!obj || !s.meshSel.faces.size) return
        const res = duplicateFaces(obj.mesh, s.meshSel.faces, s.selectMode)
        s.begin()
        s.live({ doc: withObject(s.doc, obj.id, (o) => ({ ...o, mesh: res.mesh })), meshSel: res.sel })
      } else {
        let doc = s.doc
        const ids: string[] = []
        for (const id of s.selected) {
          const o = doc.objects.find((x) => x.id === id)
          if (!o) continue
          const copy = duplicateObject(doc, o)
          doc = { ...doc, objects: [...doc.objects, copy] }
          ids.push(copy.id)
        }
        if (!ids.length) return
        s.begin()
        s.live({ doc, selected: ids, active: ids[ids.length - 1] })
      }
      startTransform('translate')
    }

    const handleModalKey = (e: KeyboardEvent) => {
      const m = modal.current!
      const k = e.key
      e.preventDefault()
      e.stopPropagation()
      if (k === 'Escape') return finishModal(false)
      if (k === 'Enter' || k === ' ') return finishModal(true)
      const p = m.kind === 'loopcut' ? m.last : mouse.current
      if (m.kind === 'loopcut') {
        if (k === '+' || k === '=' || k === 'PageUp') m.cuts = Math.min(32, m.cuts + 1)
        else if (k === '-' || k === 'PageDown') m.cuts = Math.max(1, m.cuts - 1)
        else return
        updateLoopCut(m, p, true)
        return
      }
      if (/^[0-9]$/.test(k) || k === '.' || (k === '-' && m.numeric === '')) m.numeric += k
      else if (k === '-' && m.numeric !== '') m.numeric = m.numeric.startsWith('-') ? m.numeric.slice(1) : `-${m.numeric}`
      else if (k === 'Backspace') m.numeric = m.numeric.slice(0, -1)
      else if (m.kind === 'inset' && k.toLowerCase() === 'i') m.individual = !m.individual
      else if (m.kind === 'transform') {
        const lower = k.toLowerCase()
        const axis = ['x', 'y', 'z'].indexOf(lower)
        if (axis >= 0) {
          if (m.axis === axis && m.plane === e.shiftKey) m.axis = -1
          else {
            m.axis = axis
            m.plane = e.shiftKey
          }
        } else if (lower === 'g' || lower === 'r' || lower === 's') {
          const op = lower === 'g' ? 'translate' : lower === 'r' ? 'rotate' : 'scale'
          if (op !== m.op) {
            // restart from the original positions with the new operation
            applyDelta(m.target, m.pivot, new THREE.Vector3(), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1))
            m.op = op
            m.numeric = ''
            m.angle = 0
            m.start = { ...mouse.current }
            m.lastAngle = screenAngle(m, m.start)
            if (m.axis === 3) m.axis = -1
          }
        } else return
      } else return
      updateModal(p, e.ctrlKey || e.metaKey, e.shiftKey)
    }

    /* ---------------- camera ---------------- */

    const setView = (view: ViewName) => {
      const o = orbit()
      const c = cam()
      if (!o) return
      const dirs: Record<ViewName, Vec3> = { front: [0, -1, 0], back: [0, 1, 0], right: [1, 0, 0], left: [-1, 0, 0], top: [0, 0, 1], bottom: [0, 0, -1] }
      const w = docToWorld(dirs[view])
      if (view === 'top' || view === 'bottom') w.z += 1e-3
      const d = c.position.distanceTo(o.target)
      c.position.copy(o.target).addScaledVector(w.normalize(), d)
      c.lookAt(o.target)
      o.update()
    }
    const orbitBy = (dx: number, dy: number) => {
      const o = orbit()
      const c = cam()
      if (!o) return
      const off = c.position.clone().sub(o.target)
      const sph = new THREE.Spherical().setFromVector3(off)
      sph.theta -= dx
      sph.phi = Math.max(1e-3, Math.min(Math.PI - 1e-3, sph.phi - dy))
      off.setFromSpherical(sph)
      c.position.copy(o.target).add(off)
      c.lookAt(o.target)
      o.update()
    }
    const panBy = (dx: number, dy: number) => {
      const o = orbit()
      const c = cam()
      if (!o) return
      const d = c.position.distanceTo(o.target)
      const k = (2 * d * Math.tan(THREE.MathUtils.degToRad(c.fov) / 2)) / Math.max(1, rect().height)
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(c.quaternion)
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(c.quaternion)
      const delta = right.multiplyScalar(-dx * k).add(up.multiplyScalar(dy * k))
      c.position.add(delta)
      o.target.add(delta)
      o.update()
    }
    const zoomBy = (f: number) => {
      const o = orbit()
      const c = cam()
      if (!o) return
      const off = c.position.clone().sub(o.target).multiplyScalar(f)
      if (off.length() < 0.05) off.setLength(0.05)
      c.position.copy(o.target).add(off)
      o.update()
    }
    const frameBox = (box: THREE.Box3) => {
      const o = orbit()
      const c = cam()
      if (!o || box.isEmpty()) return
      const center = box.getCenter(new THREE.Vector3())
      const radius = Math.max(0.15, box.getSize(new THREE.Vector3()).length() / 2)
      // fit the narrower of the vertical and horizontal fields of view (portrait phones)
      const vHalf = THREE.MathUtils.degToRad(c.fov) / 2
      const hHalf = Math.atan(Math.tan(vHalf) * c.aspect)
      const d = radius / Math.sin(Math.min(vHalf, hHalf))
      const dir = c.position.clone().sub(o.target).normalize()
      o.target.copy(center)
      c.position.copy(center).addScaledVector(dir, d * 1.1)
      c.near = Math.max(0.005, d / 1000)
      c.updateProjectionMatrix()
      o.update()
    }
    const worldBox = (filter: (o: ModelObject) => boolean) => {
      const box = new THREE.Box3()
      for (const o of st().doc.objects) {
        if (!o.visible || !filter(o)) continue
        const M = objectWorldMatrix(o)
        for (const p of evaluateObject(o, st().doc).verts) box.expandByPoint(tmp.set(p[0], p[1], p[2]).applyMatrix4(M))
      }
      return box
    }
    const frameAll = () => {
      const box = worldBox(() => true)
      if (box.isEmpty()) box.setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(1, 1, 1))
      frameBox(box)
    }
    const frameSelected = () => {
      const s = st()
      if (s.mode === 'edit') {
        const obj = activeObject(s)
        if (obj && s.meshSel.verts.size) {
          const M = objectWorldMatrix(obj)
          const box = new THREE.Box3()
          for (const v of s.meshSel.verts) if (obj.mesh.verts[v]) box.expandByPoint(tmp.set(...obj.mesh.verts[v]).applyMatrix4(M))
          frameBox(box)
          return
        }
      }
      const box = worldBox((o) => s.selected.includes(o.id))
      if (box.isEmpty()) frameAll()
      else frameBox(box)
    }

    const api: ViewportApi = {
      startTransform: (op) => {
        if (!modal.current) startTransform(op)
      },
      startExtrude: () => !modal.current && startExtrude(),
      startInset: () => !modal.current && startInset(),
      startLoopCut: () => !modal.current && startLoopCut(),
      duplicateMove: () => !modal.current && duplicateMove(),
      setView,
      orbitBy,
      panBy,
      zoomBy,
      frameSelected,
      frameAll,
      openMenu: (kind, at) => onMenu(kind, at ? local(at) : mouse.current),
      confirmModal: () => finishModal(true),
      cancelModal: () => finishModal(false),
      cameraQuaternion,
    }
    viewport.current = api

    /* ---------------- events ---------------- */

    let drag: { start: P; box: boolean; shift: boolean; ctrl: boolean; alt: boolean; touch: boolean } | null = null
    const root = container.current!
    // touch: one finger taps select (drag orbits), a long press opens the menu, two fingers zoom / pan
    const touches = new Set<number>()
    let longPress = 0
    let modalTouch = false
    const cancelLongPress = () => {
      if (longPress) window.clearTimeout(longPress)
      longPress = 0
    }

    /** Touch starts a modal drag where the finger lands. */
    const rebaseModal = (p: P) => {
      const m = modal.current
      if (!m) return
      if (m.kind === 'transform') {
        applyDelta(m.target, m.pivot, new THREE.Vector3(), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1))
        m.start = { ...p }
        m.angle = 0
        m.lastAngle = screenAngle(m, p)
      } else if (m.kind === 'inset') {
        m.start = { ...p }
        m.startDist = Math.max(40, dist(p, m.pivotScreen))
      }
      updateModal(p, false, false)
    }

    const onDown = (e: PointerEvent) => {
      if (e.target !== canvas()) return
      const p = local(e)
      mouse.current = p
      lastPointer = e.pointerType
      const touch = e.pointerType === 'touch'
      if (touch) touches.add(e.pointerId)
      if (modal.current) {
        e.preventDefault()
        e.stopPropagation()
        if (touch) {
          if (touches.size > 1) return
          modalTouch = true
          rebaseModal(p)
          return
        }
        if (e.button === 0) finishModal(true)
        else if (e.button === 2) finishModal(false)
        return
      }
      if (touch) {
        cancelLongPress()
        if (touches.size > 1) {
          drag = null
          return
        }
        drag = { start: p, box: false, shift: false, ctrl: false, alt: false, touch: true }
        longPress = window.setTimeout(() => {
          longPress = 0
          if (drag?.touch && touches.size === 1) {
            drag = null
            onMenu('context', { x: p.x + 12, y: p.y + 12 })
          }
        }, 550)
        return
      }
      if (e.button === 2) {
        e.stopPropagation()
        if (e.shiftKey) placeCursor(p)
        else onMenu('context', p)
        return
      }
      if (e.button !== 0) return
      const g = gizmo.current as unknown as { axis: string | null; dragging: boolean } | null
      if (g && (g.axis || g.dragging)) return
      if (e.altKey) {
        drag = { start: p, box: false, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, alt: true, touch: false }
        return
      }
      if (st().tool === 'cursor') {
        placeCursor(p)
        return
      }
      drag = { start: p, box: false, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, alt: false, touch: false }
    }
    const onMove = (e: PointerEvent) => {
      const p = local(e)
      if (e.pointerType === 'touch' && !touches.has(e.pointerId)) return
      mouse.current = p
      if (modal.current) {
        if (e.pointerType === 'touch' && !modalTouch) return
        updateModal(p, e.ctrlKey || e.metaKey, e.shiftKey)
        return
      }
      if (drag?.touch) {
        if (dist(p, drag.start) > 10) {
          cancelLongPress()
          drag = null
        }
        return
      }
      if (drag && !drag.alt) {
        if (!drag.box && dist(p, drag.start) > 4) drag.box = true
        if (drag.box) onBox({ x0: drag.start.x, y0: drag.start.y, x1: p.x, y1: p.y })
      }
    }
    const onUp = (e: PointerEvent) => {
      const touch = e.pointerType === 'touch'
      if (touch) {
        touches.delete(e.pointerId)
        cancelLongPress()
        if (modal.current && modalTouch) {
          // lifting the finger ends a touch drag of the operation (loop cut: the tap cuts)
          modalTouch = false
          finishModal(true)
          return
        }
      }
      const d = drag
      drag = null
      if (!d || (!touch && e.button !== 0)) return
      const p = local(e)
      if (d.touch) {
        if (dist(p, d.start) <= 10) {
          if (st().tool === 'cursor') placeCursor(p)
          else clickSelect(p, false)
        }
        return
      }
      if (d.alt) {
        if (dist(p, d.start) < 4 && st().mode === 'edit') loopSelect(p, d.ctrl, d.shift)
        return
      }
      if (d.box) {
        onBox(null)
        boxSelect({ x0: d.start.x, y0: d.start.y, x1: p.x, y1: p.y }, d.shift, d.ctrl)
        return
      }
      clickSelect(p, d.shift)
    }
    const onWheel = (e: WheelEvent) => {
      const m = modal.current
      if (m?.kind !== 'loopcut') return
      e.preventDefault()
      e.stopPropagation()
      m.cuts = Math.max(1, Math.min(32, m.cuts + (e.deltaY < 0 ? 1 : -1)))
      updateLoopCut(m, m.last, true)
    }
    // a touch long press arrives as the platform's contextmenu event: open the menu there
    let lastPointer = 'mouse'
    const onContext = (e: MouseEvent) => {
      e.preventDefault()
      if (lastPointer !== 'touch' || modal.current || e.target !== canvas()) return
      cancelLongPress()
      drag = null
      const p = local(e)
      onMenu('context', { x: p.x + 12, y: p.y + 12 })
    }

    const setAltOrbit = (on: boolean) => {
      const o = orbit()
      if (!o) return
      o.mouseButtons = { ...o.mouseButtons, LEFT: on ? THREE.MOUSE.ROTATE : (undefined as unknown as THREE.MOUSE) }
    }

    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      if (e.key === 'Alt') {
        setAltOrbit(true)
        e.preventDefault()
        return
      }
      if (menuOpen.current) return
      if (modal.current) {
        handleModalKey(e)
        return
      }
      const s = st()
      const k = e.key.toLowerCase()
      const ctrl = e.ctrlKey || e.metaKey
      const edit = s.mode === 'edit'
      const handled = () => {
        e.preventDefault()
        e.stopPropagation()
      }
      // view
      if (e.code.startsWith('Numpad') || e.code === 'Home') {
        const c = e.code
        if (c === 'Numpad1') setView(ctrl ? 'back' : 'front')
        else if (c === 'Numpad3') setView(ctrl ? 'left' : 'right')
        else if (c === 'Numpad7') setView(ctrl ? 'bottom' : 'top')
        else if (c === 'NumpadDecimal') frameSelected()
        else if (c === 'Home') frameAll()
        else if (c === 'Numpad4') orbitBy(-Math.PI / 12, 0)
        else if (c === 'Numpad6') orbitBy(Math.PI / 12, 0)
        else if (c === 'Numpad8') orbitBy(0, -Math.PI / 12)
        else if (c === 'Numpad2') orbitBy(0, Math.PI / 12)
        else if (c === 'NumpadAdd') {
          if (ctrl && edit) growSelection(true)
          else zoomBy(0.8)
        } else if (c === 'NumpadSubtract') {
          if (ctrl && edit) growSelection(false)
          else zoomBy(1.25)
        } else return
        return handled()
      }
      if (ctrl && k === 'z') {
        handled()
        return e.shiftKey ? s.redo() : s.undo()
      }
      if (ctrl && k === 'y') {
        handled()
        return s.redo()
      }
      if (e.key === 'Tab') {
        handled()
        return toggleEditMode()
      }
      if (edit && !ctrl && !e.altKey && !e.shiftKey && (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3')) {
        handled()
        return setSelectMode(e.code === 'Digit1' ? 'vert' : e.code === 'Digit2' ? 'edge' : 'face')
      }
      if (e.altKey && k === 'z') {
        handled()
        return s.setXray(!s.xray)
      }
      if (e.shiftKey && k === 'z') {
        handled()
        return s.setShading(s.shading === 'wireframe' ? 'material' : 'wireframe')
      }
      if (k === 'a' && !ctrl) {
        handled()
        if (e.shiftKey) return onMenu('add', mouse.current)
        return selectAllToggle(e.altKey ? 'deselect' : 'select')
      }
      if (ctrl && k === 'i') {
        handled()
        return selectAllToggle('invert')
      }
      if (!ctrl && !e.shiftKey && (k === 'g' || k === 'r' || k === 's')) {
        handled()
        if (e.altKey && !edit) return clearTransform(k === 'g' ? 'location' : k === 'r' ? 'rotation' : 'scale')
        if (e.altKey) return
        return startTransform(k === 'g' ? 'translate' : k === 'r' ? 'rotate' : 'scale')
      }
      if (e.shiftKey && k === 'd' && !ctrl) {
        handled()
        return duplicateMove()
      }
      if (e.shiftKey && k === 's' && !ctrl) {
        handled()
        return onMenu('snap', mouse.current)
      }
      if (k === 'delete' || (k === 'x' && !ctrl)) {
        handled()
        if (!edit) return k === 'delete' ? deleteObjects() : onMenu('delete', mouse.current)
        return onMenu('delete', mouse.current)
      }
      if (k === 'n' && !ctrl && !e.shiftKey && !e.altKey) {
        handled()
        return s.setSidebar(!s.sidebar)
      }
      if (k === 'h' && !ctrl && !edit) {
        handled()
        if (e.altKey) return revealAll()
        return hideSelected(e.shiftKey)
      }
      if (!edit) {
        if (ctrl && k === 'j') {
          handled()
          return joinSelected()
        }
        if (ctrl && k === 'a') {
          handled()
          return onMenu('apply', mouse.current)
        }
        return
      }
      // edit mode
      if (ctrl && k === 'r') {
        handled()
        return startLoopCut()
      }
      if (ctrl && (k === '+' || k === '=')) {
        handled()
        return growSelection(true)
      }
      if (ctrl && k === '-') {
        handled()
        return growSelection(false)
      }
      if (ctrl && k === 'l') {
        handled()
        return selectLinkedAll()
      }
      if (ctrl) return
      if (k === 'e') {
        handled()
        return startExtrude()
      }
      if (k === 'i') {
        handled()
        return startInset()
      }
      if (k === 'f') {
        handled()
        if (!fill()) toast.info('Fill', 'Select 3 or more vertices to make a face.')
        return
      }
      if (k === 'm') {
        handled()
        return onMenu('merge', mouse.current)
      }
      if (k === 'p') {
        handled()
        if (!separateSelection()) toast.info('Separate', 'Select the faces to move into a new object.')
        return
      }
      if (k === 'l') {
        handled()
        return selectLinkedUnder(mouse.current)
      }
      if (k === 'n' && e.shiftKey) {
        handled()
        return recalcSelection(false)
      }
      if (k === 'n' && e.altKey) {
        handled()
        return flipSelection()
      }
      if (k === 'j' && e.altKey) {
        handled()
        return trisToQuadsSelection()
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Alt') setAltOrbit(false)
    }
    const onBlur = () => setAltOrbit(false)

    const onCancel = (e: PointerEvent) => {
      touches.delete(e.pointerId)
      cancelLongPress()
      if (drag?.touch) drag = null
    }
    root.addEventListener('pointerdown', onDown, true)
    window.addEventListener('pointercancel', onCancel)
    root.addEventListener('wheel', onWheel, { capture: true, passive: false })
    root.addEventListener('contextmenu', onContext)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      if (modal.current) finishModal(false)
      root.removeEventListener('pointerdown', onDown, true)
      root.removeEventListener('wheel', onWheel, true)
      root.removeEventListener('contextmenu', onContext)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      cancelLongPress()
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      if (viewport.current === api) viewport.current = null
    }
  }, [get, registry, cage, gizmo, container, mouse, menuOpen, onMenu, onBox, setLoopPreview, cameraQuaternion])

  return null
}

function SceneContent(props: Omit<ControllerProps, 'registry' | 'cage' | 'gizmo' | 'setLoopPreview'>) {
  const doc = useModeler((s) => s.doc)
  const mode = useModeler((s) => s.mode)
  const selected = useModeler((s) => s.selected)
  const active = useModeler((s) => s.active)
  const meshSel = useModeler((s) => s.meshSel)
  const selectMode = useModeler((s) => s.selectMode)
  const xray = useModeler((s) => s.xray)
  const shading = useModeler((s) => s.shading)
  const showReference = useModeler((s) => s.showReference)
  const registry = useMemo(() => new Map<string, THREE.Mesh>(), [])
  const cage = useRef<THREE.Mesh | null>(null)
  const gizmo = useRef<TransformControlsImpl | null>(null)
  const [loopPreview, setLoopPreview] = useState<Float32Array | null>(null)
  const activeObj = doc.objects.find((o) => o.id === active) ?? null

  return (
    <>
      <color attach="background" args={['#15161c']} />
      <fog attach="fog" args={['#15161c', 30, 90]} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 9, 6]} intensity={1.25} />
      <directionalLight position={[-6, 4, -5]} intensity={0.35} />
      <hemisphereLight args={['#c9d6ff', '#202028', 0.35]} />
      <group matrixAutoUpdate={false} matrix={ROOT_MATRIX}>
        <GroundGrid />
        {doc.objects.map((o) => (
          <ObjectView
            key={o.id}
            obj={o}
            doc={doc}
            selected={selected.includes(o.id)}
            active={o.id === active}
            objectMode={mode === 'object'}
            shading={shading}
            xray={xray}
            registry={registry}
          />
        ))}
        {mode === 'edit' && activeObj && <EditOverlay obj={activeObj} sel={meshSel} selectMode={selectMode} xray={xray} cage={cage} loopPreview={loopPreview} />}
        <Cursor3D p={doc.cursor} />
        {showReference && <PlayerReference />}
        <GizmoTool gizmo={gizmo} />
      </group>
      <OrbitControls makeDefault enableDamping={false} mouseButtons={{ LEFT: undefined as unknown as THREE.MOUSE, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: undefined as unknown as THREE.MOUSE }} />
      <Controller {...props} registry={registry} cage={cage} gizmo={gizmo} setLoopPreview={setLoopPreview} />
    </>
  )
}

/* ---------------------------------------------------------------------------------------- */
/* Navigation gizmo (HTML)                                                                   */

const GIZMO_AXES: { dir: Vec3; label: string; color: string; view: ViewName }[] = [
  { dir: [1, 0, 0], label: 'X', color: '#ff3653', view: 'right' },
  { dir: [0, 1, 0], label: 'Y', color: '#8adb00', view: 'back' },
  { dir: [0, 0, 1], label: 'Z', color: '#2c8fff', view: 'top' },
  { dir: [-1, 0, 0], label: '', color: '#ff3653', view: 'left' },
  { dir: [0, -1, 0], label: '', color: '#8adb00', view: 'front' },
  { dir: [0, 0, -1], label: '', color: '#2c8fff', view: 'bottom' },
]

function NavGizmo() {
  const [items, setItems] = useState<{ x: number; y: number; z: number; i: number }[]>([])
  const last = useRef(new THREE.Quaternion(2, 0, 0, 0))
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  useEffect(() => {
    let raf = 0
    const inv = new THREE.Quaternion()
    const v = new THREE.Vector3()
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const q = viewport.current?.cameraQuaternion
      if (!q || q.equals(last.current)) return
      last.current.copy(q)
      inv.copy(q).invert()
      setItems(
        GIZMO_AXES.map((a, i) => {
          docToWorld(a.dir, v).applyQuaternion(inv)
          return { x: 44 + v.x * 32, y: 44 - v.y * 32, z: v.z, i }
        }).sort((a, b) => a.z - b.z),
      )
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <div
      className="group absolute top-2 right-2 z-20 h-[88px] w-[88px] cursor-grab rounded-full hover:bg-white/5"
      title="Drag to orbit · click an axis to align the view"
      onPointerDown={(e) => {
        ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
        drag.current = { x: e.clientX, y: e.clientY, moved: false }
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (!d) return
        const dx = e.clientX - d.x
        const dy = e.clientY - d.y
        if (Math.abs(dx) + Math.abs(dy) > 2) d.moved = true
        if (!d.moved) return
        viewport.current?.orbitBy(dx * 0.01, dy * 0.01)
        d.x = e.clientX
        d.y = e.clientY
      }}
      onPointerUp={() => {
        drag.current = null
      }}
    >
      <svg width={88} height={88} className="pointer-events-none">
        {items.map(({ x, y, i }) => {
          const a = GIZMO_AXES[i]
          return a.label ? <line key={`l${i}`} x1={44} y1={44} x2={x} y2={y} stroke={a.color} strokeWidth={2} /> : null
        })}
      </svg>
      {items.map(({ x, y, z, i }) => {
        const a = GIZMO_AXES[i]
        const size = a.label ? 18 : 14
        return (
          <button
            key={i}
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => viewport.current?.setView(a.view)}
            className="absolute flex items-center justify-center rounded-full text-[10px] font-bold text-black/80"
            style={{ left: x - size / 2, top: y - size / 2, width: size, height: size, background: a.label ? a.color : `${a.color}55`, border: a.label ? 'none' : `1.5px solid ${a.color}`, zIndex: Math.round((z + 2) * 10) }}
            title={`${a.view[0].toUpperCase()}${a.view.slice(1)} view`}
          >
            {a.label}
          </button>
        )
      })}
    </div>
  )
}

function NavButton({ title, onDrag, onClick, children }: { title: string; onDrag?: (dx: number, dy: number) => void; onClick?: () => void; children: React.ReactNode }) {
  const drag = useRef<{ x: number; y: number } | null>(null)
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      onPointerDown={(e) => {
        if (!onDrag) return
        ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
        drag.current = { x: e.clientX, y: e.clientY }
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (!d || !onDrag) return
        onDrag(e.clientX - d.x, e.clientY - d.y)
        d.x = e.clientX
        d.y = e.clientY
      }}
      onPointerUp={() => {
        drag.current = null
      }}
      className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-800/80 text-ink-300 hover:bg-ink-700 hover:text-white"
    >
      {children}
    </button>
  )
}

/* ---------------------------------------------------------------------------------------- */

export function ModelerViewport() {
  const container = useRef<HTMLDivElement>(null)
  const mouse = useRef<P>({ x: 200, y: 200 })
  const menuOpen = useRef(false)
  const cameraQuaternion = useMemo(() => new THREE.Quaternion(), [])
  const [menu, setMenu] = useState<{ x: number; y: number; title: string; items: MenuItem[] } | null>(null)
  const [box, setBox] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const status = useModeler((s) => s.status)
  const mode = useModeler((s) => s.mode)

  const onMenu = useMemo(
    () => (kind: 'add' | 'delete' | 'merge' | 'context' | 'snap' | 'apply', at: P) => {
      const s = st()
      const titles = { add: 'Add', delete: s.mode === 'edit' ? 'Delete' : 'Delete', merge: 'Merge', context: s.mode === 'edit' ? 'Mesh' : 'Object', snap: 'Snap', apply: 'Apply' }
      const items = kind === 'add' ? addMenu() : kind === 'delete' ? deleteMenu() : kind === 'merge' ? mergeMenu() : kind === 'snap' ? snapMenu() : kind === 'apply' ? applyMenu() : contextMenu()
      if (kind === 'merge' && s.mode !== 'edit') return
      menuOpen.current = true
      setMenu({ x: at.x, y: at.y, title: titles[kind], items })
    },
    [],
  )
  const closeMenu = useMemo(
    () => () => {
      menuOpen.current = false
      setMenu(null)
    },
    [],
  )

  return (
    <div ref={container} className="relative h-full w-full overflow-hidden select-none" onContextMenu={(e) => e.preventDefault()}>
      <Canvas
        camera={{ position: [3.2, 2.6, 4.2], fov: 42, near: 0.01, far: 2000 }}
        dpr={[1, 1.75]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        style={{ width: '100%', height: '100%', touchAction: 'none' }}
        onCreated={({ camera }) => camera.lookAt(0, 0.5, 0)}
      >
        <SceneContent container={container} mouse={mouse} menuOpen={menuOpen} onMenu={onMenu} onBox={setBox} cameraQuaternion={cameraQuaternion} />
      </Canvas>
      {box && (
        <div
          className="pointer-events-none absolute z-20 border border-dashed border-white/80 bg-white/5"
          style={{ left: Math.min(box.x0, box.x1), top: Math.min(box.y0, box.y1), width: Math.abs(box.x1 - box.x0), height: Math.abs(box.y1 - box.y0) }}
        />
      )}
      <NavGizmo />
      <div className="absolute top-[100px] right-[30px] z-20 flex flex-col gap-1.5">
        <NavButton title="Drag to zoom" onDrag={(_, dy) => viewport.current?.zoomBy(Math.exp(dy * 0.01))}>
          <Search className="h-4 w-4" />
        </NavButton>
        <NavButton title="Drag to pan" onDrag={(dx, dy) => viewport.current?.panBy(dx, dy)}>
          <Hand className="h-4 w-4" />
        </NavButton>
        <NavButton title="Frame all (Home)" onClick={() => viewport.current?.frameAll()}>
          <Maximize className="h-4 w-4" />
        </NavButton>
      </div>
      <div className="pointer-events-none absolute top-2 left-14 z-10 text-[11px] text-ink-400">
        <span className="rounded bg-black/40 px-1.5 py-0.5">{mode === 'edit' ? 'Edit Mode' : 'Object Mode'} · Perspective</span>
      </div>
      {status && (
        <>
          <div className="absolute bottom-11 left-1/2 z-30 flex -translate-x-1/2 gap-2">
            <button type="button" onClick={() => viewport.current?.cancelModal()} className="flex h-10 items-center gap-1.5 rounded-full border border-ink-600 bg-ink-900/95 px-4 text-[12px] font-medium text-ink-200 shadow-lg hover:bg-ink-800">
              <X className="h-4 w-4" /> Cancel
            </button>
            <button type="button" onClick={() => viewport.current?.confirmModal()} className="flex h-10 items-center gap-1.5 rounded-full bg-brand-500 px-4 text-[12px] font-semibold text-white shadow-lg hover:bg-brand-400">
              <Check className="h-4 w-4" /> Confirm
            </button>
          </div>
          <div className="pointer-events-none absolute right-2 bottom-2 left-2 z-20 rounded-md bg-black/70 px-3 py-1.5 font-mono text-[11px] text-ink-100 sm:truncate">{status}</div>
        </>
      )}
      {menu && <PopupMenu x={menu.x} y={menu.y} title={menu.title} items={menu.items} onClose={closeMenu} />}
    </div>
  )
}
