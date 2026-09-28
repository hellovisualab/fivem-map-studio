import * as THREE from 'three'
import { evaluateObject, modifierContext, objectMatrix } from '@/lib/modeler/build'
import { cloneMesh, flipFaces, joinMeshes, meshBounds, meshStats } from '@/lib/modeler/mesh'
import { applyModifiers } from '@/lib/modeler/modifiers'
import { makePrimitive, type PrimitiveKind } from '@/lib/modeler/primitives'
import type { EditMesh, ModelDoc, ModelMaterial, ModelObject, Modifier, Vec3 } from '@/lib/modeler/types'
import { uid } from '@/lib/utils'

/* Document level operations (object mode). All return new objects; inputs are not mutated. */

export const MATERIAL_SWATCHES = ['#c8ccd6', '#8b5a2b', '#3b3f47', '#b8322a', '#2f6fd6', '#2e9d57', '#e0b429', '#f2f2f2', '#1b1b1f', '#7a4fd1']

export function newMaterial(name: string, color: string): ModelMaterial {
  return {
    id: uid(8),
    name,
    color,
    uvMode: 'box',
    uvScale: 1,
    metalness: 0,
    roughness: 0.6,
    emissive: 0,
    opacity: 1,
    doubleSided: false,
  }
}

const PRIMITIVE_NAMES: Record<PrimitiveKind, string> = {
  plane: 'Plane',
  cube: 'Cube',
  circle: 'Circle',
  uvsphere: 'Sphere',
  icosphere: 'Icosphere',
  cylinder: 'Cylinder',
  cone: 'Cone',
  torus: 'Torus',
  grid: 'Grid',
  tube: 'Tube',
  stairs: 'Stairs',
}

export function uniqueObjectName(doc: ModelDoc, base: string) {
  const used = new Set(doc.objects.map((o) => o.name))
  if (!used.has(base)) return base
  for (let i = 1; ; i++) {
    const name = `${base}.${String(i).padStart(3, '0')}`
    if (!used.has(name)) return name
  }
}

export function makeObject(doc: ModelDoc, mesh: EditMesh, name: string, position: Vec3, materialId?: string): ModelObject {
  return {
    id: uid(8),
    name: uniqueObjectName(doc, name),
    mesh,
    position,
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    materials: [materialId ?? doc.materials[0]?.id ?? ''],
    modifiers: [],
    visible: true,
    role: 'visual',
    autoSmooth: 30,
  }
}

/** A primitive at the 3D cursor. On the ground plane it is lifted to stand on it. */
export function primitiveObject(doc: ModelDoc, kind: PrimitiveKind): ModelObject {
  const mesh = makePrimitive(kind)
  const pos: Vec3 = [...doc.cursor]
  if (Math.abs(doc.cursor[2]) < 1e-6 && !['plane', 'grid', 'circle'].includes(kind)) pos[2] -= meshBounds(mesh).min[2]
  return makeObject(doc, mesh, PRIMITIVE_NAMES[kind], pos)
}

export function newDoc(): ModelDoc {
  const doc: ModelDoc = { objects: [], materials: [newMaterial('Material', MATERIAL_SWATCHES[0])], cursor: [0, 0, 0] }
  doc.objects.push(primitiveObject(doc, 'cube'))
  return doc
}

export function cloneObject(obj: ModelObject): ModelObject {
  return {
    ...obj,
    mesh: cloneMesh(obj.mesh),
    position: [...obj.position],
    rotation: [...obj.rotation],
    scale: [...obj.scale],
    materials: [...obj.materials],
    modifiers: obj.modifiers.map((m) => structuredClone(m)),
  }
}

export function duplicateObject(doc: ModelDoc, obj: ModelObject): ModelObject {
  return { ...cloneObject(obj), id: uid(8), name: uniqueObjectName(doc, obj.name.replace(/\.\d{3}$/, '')) }
}

function matrixOf(obj: ModelObject) {
  return objectMatrix(obj)
}

/** Transforms the mesh by `m` (fixing the winding for mirroring matrices). */
export function transformMesh(mesh: EditMesh, m: THREE.Matrix4): EditMesh {
  const v = new THREE.Vector3()
  const out = cloneMesh(mesh)
  for (const p of out.verts) {
    v.set(p[0], p[1], p[2]).applyMatrix4(m)
    p[0] = v.x
    p[1] = v.y
    p[2] = v.z
  }
  return m.determinant() < 0 ? flipFaces(out, out.faces.map((_, i) => i)) : out
}

/** Ctrl+A: bakes location / rotation / scale into the mesh. */
export function applyTransform(obj: ModelObject, what: { location?: boolean; rotation?: boolean; scale?: boolean }): ModelObject {
  const pos = new THREE.Vector3(...obj.position)
  const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(...obj.rotation, 'XYZ'))
  const scl = new THREE.Vector3(...obj.scale)
  // The object keeps the parts that are not applied; the mesh absorbs the rest so the
  // world result is unchanged: mesh' = keep^-1 * full * mesh.
  const keepPos = what.location ? new THREE.Vector3() : pos
  const keepQuat = what.rotation ? new THREE.Quaternion() : quat
  const keepScale = what.scale ? new THREE.Vector3(1, 1, 1) : scl
  const keep = new THREE.Matrix4().compose(keepPos, keepQuat, keepScale)
  const m = new THREE.Matrix4().copy(keep).invert().multiply(matrixOf(obj))
  const e = new THREE.Euler().setFromQuaternion(keepQuat, 'XYZ')
  return {
    ...obj,
    mesh: transformMesh(obj.mesh, m),
    position: [keepPos.x, keepPos.y, keepPos.z],
    rotation: [e.x, e.y, e.z],
    scale: [keepScale.x, keepScale.y, keepScale.z],
  }
}

export type OriginMode = 'geometry' | 'bottom' | 'cursor' | 'world'

/** Moves the object origin without moving the geometry (Set Origin). */
export function setOrigin(obj: ModelObject, mode: OriginMode, cursor: Vec3): ModelObject {
  const full = matrixOf(obj)
  let target: THREE.Vector3
  if (mode === 'cursor') target = new THREE.Vector3(...cursor)
  else if (mode === 'world') target = new THREE.Vector3()
  else {
    const { min, max } = meshBounds(obj.mesh)
    const local = new THREE.Vector3((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, mode === 'bottom' ? min[2] : (min[2] + max[2]) / 2)
    target = local.applyMatrix4(full)
  }
  const moved = { ...obj, position: [target.x, target.y, target.z] as Vec3 }
  // mesh' = newMatrix^-1 * oldMatrix * mesh
  const m = new THREE.Matrix4().copy(matrixOf(moved)).invert().multiply(full)
  return { ...moved, mesh: transformMesh(obj.mesh, m) }
}

/** Ctrl+J: joins `others` into `target` (meshes moved into its local space, slots merged). */
export function joinObjects(target: ModelObject, others: ModelObject[]): ModelObject {
  let mesh = cloneMesh(target.mesh)
  const materials = [...target.materials]
  const inv = matrixOf(target).invert()
  for (const o of others) {
    const m = new THREE.Matrix4().copy(inv).multiply(matrixOf(o))
    const local = transformMesh(o.mesh, m)
    const slotMap = o.materials.map((id) => {
      let i = materials.indexOf(id)
      if (i < 0) {
        materials.push(id)
        i = materials.length - 1
      }
      return i
    })
    mesh = joinMeshes(mesh, local, (s) => slotMap[s] ?? 0)
  }
  return { ...target, mesh, materials }
}

/** Bakes one modifier (or the whole stack up to it) into the mesh (Apply). */
export function applyModifier(obj: ModelObject, id: string, doc?: ModelDoc): ModelObject {
  const idx = obj.modifiers.findIndex((m) => m.id === id)
  if (idx < 0) return obj
  const stack = obj.modifiers.slice(0, idx + 1)
  return { ...obj, mesh: applyModifiers(obj.mesh, stack, doc ? modifierContext(obj, doc) : undefined), modifiers: obj.modifiers.slice(idx + 1) }
}

export function newModifier(kind: Modifier['kind']): Modifier {
  const id = uid(6)
  const enabled = true
  switch (kind) {
    case 'mirror':
      return { id, kind, enabled, axes: [true, false, false], mergeDistance: 0.001 }
    case 'array':
      return { id, kind, enabled, count: 2, relative: [1, 0, 0], constant: [0, 0, 0] }
    case 'radial':
      return { id, kind, enabled, count: 6, angle: 360, axis: 2 }
    case 'subsurf':
      return { id, kind, enabled, levels: 1 }
    case 'solidify':
      return { id, kind, enabled, thickness: 0.05 }
    case 'bevel':
      return { id, kind, enabled, width: 0.02, angle: 30 }
    case 'boolean':
      return { id, kind, enabled, operation: 'difference', target: null }
    case 'decimate':
      return { id, kind, enabled, mode: 'collapse', ratio: 0.5, angle: 5 }
    case 'triangulate':
      return { id, kind, enabled }
    case 'weld':
      return { id, kind, enabled, distance: 0.001 }
    case 'wireframe':
      return { id, kind, enabled, thickness: 0.02 }
    case 'smooth':
      return { id, kind, enabled, factor: 0.5, repeat: 1 }
    case 'displace':
      return { id, kind, enabled, strength: 0.05, size: 0.3, seed: 1 }
    case 'deform':
      return { id, kind, enabled, mode: 'twist', factor: 45, axis: 2 }
    case 'cast':
      return { id, kind, enabled, shape: 'sphere', factor: 0.5 }
  }
}

export const MODIFIER_LABELS: Record<Modifier['kind'], string> = {
  mirror: 'Mirror',
  array: 'Array',
  radial: 'Radial Array',
  subsurf: 'Subdivision Surface',
  solidify: 'Solidify',
  bevel: 'Bevel',
  boolean: 'Boolean',
  decimate: 'Decimate',
  triangulate: 'Triangulate',
  weld: 'Weld',
  wireframe: 'Wireframe',
  smooth: 'Smooth',
  displace: 'Displace',
  deform: 'Simple Deform',
  cast: 'Cast',
}

/** Add-modifier menu, grouped like Blender's. */
export const MODIFIER_GROUPS: { label: string; items: { kind: Modifier['kind']; hint: string }[] }[] = [
  {
    label: 'Generate',
    items: [
      { kind: 'array', hint: 'Copies in a row' },
      { kind: 'radial', hint: 'Copies around a circle' },
      { kind: 'bevel', hint: 'Chamfer sharp edges' },
      { kind: 'boolean', hint: 'Cut, join or intersect with an object' },
      { kind: 'decimate', hint: 'Fewer polygons' },
      { kind: 'mirror', hint: 'Model one half' },
      { kind: 'solidify', hint: 'Give surfaces a thickness' },
      { kind: 'subsurf', hint: 'Smooth, rounder shapes' },
      { kind: 'triangulate', hint: 'All faces to triangles' },
      { kind: 'weld', hint: 'Merge vertices by distance' },
      { kind: 'wireframe', hint: 'Edges become beams' },
    ],
  },
  {
    label: 'Deform',
    items: [
      { kind: 'cast', hint: 'Towards a sphere or cylinder' },
      { kind: 'displace', hint: 'Noise bumps (rocks, dents)' },
      { kind: 'deform', hint: 'Twist, bend, taper, stretch' },
      { kind: 'smooth', hint: 'Relax the shape' },
    ],
  },
]

/** Document space bounds of the objects (modifiers applied). */
export function docBounds(doc: ModelDoc, filter?: (o: ModelObject) => boolean) {
  const box = new THREE.Box3()
  const v = new THREE.Vector3()
  for (const o of doc.objects) {
    if (filter && !filter(o)) continue
    const m = matrixOf(o)
    for (const p of evaluateObject(o, doc).verts) box.expandByPoint(v.set(p[0], p[1], p[2]).applyMatrix4(m))
  }
  return box
}

export function docStats(doc: ModelDoc) {
  let verts = 0
  let faces = 0
  let tris = 0
  for (const o of doc.objects) {
    if (o.role !== 'visual') continue
    const mesh = evaluateObject(o, doc)
    const s = meshStats(mesh)
    verts += s.verts
    faces += s.faces
    tris += s.tris
  }
  return { verts, faces, tris }
}

/* ---------------------------------------------------------------------------------------- */
/* Files                                                                                     */

export const MODEL_FILE_EXT = '.l7model.json'

export function serializeDoc(doc: ModelDoc, name: string) {
  return JSON.stringify({ format: 'labseve7-model', version: 1, name, doc })
}

export function parseDoc(text: string): { doc: ModelDoc; name: string } {
  const data = JSON.parse(text) as { format?: string; version?: number; name?: string; doc?: ModelDoc }
  if (data.format !== 'labseve7-model' || !data.doc || !Array.isArray(data.doc.objects)) throw new Error('Not a LABSEVE7 model file.')
  const doc = data.doc
  if (!Array.isArray(doc.materials) || !doc.materials.length) doc.materials = [newMaterial('Material', MATERIAL_SWATCHES[0])]
  if (!Array.isArray(doc.cursor)) doc.cursor = [0, 0, 0]
  for (const o of doc.objects) {
    o.modifiers ??= []
    o.materials = o.materials?.length ? o.materials : [doc.materials[0].id]
    o.role ??= 'visual'
    o.visible ??= true
    o.autoSmooth ??= 30
    for (const f of o.mesh.faces) {
      f.uv ??= f.v.map(() => [0, 0])
      f.mat ??= 0
      f.smooth ??= false
    }
  }
  return { doc, name: data.name ?? 'model' }
}
