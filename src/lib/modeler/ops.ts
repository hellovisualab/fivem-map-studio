import * as THREE from 'three'
import { objectMatrix } from '@/lib/modeler/build'
import {
  applyModifier,
  applyTransform,
  duplicateObject,
  joinObjects,
  makeObject,
  newMaterial,
  newModifier,
  primitiveObject,
  setOrigin,
  MATERIAL_SWATCHES,
  type OriginMode,
} from '@/lib/modeler/doc'
import {
  deleteEdges,
  deleteFaces,
  deleteVerts,
  dissolveEdges,
  dissolveFaces,
  dissolveVerts,
  emptySelection,
  fillFace,
  flipFaces,
  flushSelection,
  invertSelection,
  mergeAtCenter,
  mergeByDistance,
  projectBoxUVs,
  recalcNormals,
  selectAll,
  selectLess,
  selectLinked,
  selectMore,
  separate,
  setMaterial,
  setSmooth,
  smoothVerts,
  subdivide,
  triangulateFaces,
  trisToQuads,
  avg,
} from '@/lib/modeler/mesh'
import type { PrimitiveKind } from '@/lib/modeler/primitives'
import type { EditMesh, MeshSelection, ModelDoc, ModelObject, Modifier, SelectMode, Vec3 } from '@/lib/modeler/types'
import { activeObject, useModeler, withObject } from '@/store/useModeler'

/* User level operations on the modeler store (menus, shortcuts, panels). */

const st = () => useModeler.getState()

export function hasFaces(sel: MeshSelection) {
  return sel.faces.size > 0
}

/* ---------------------------------------------------------------------------------------- */
/* Modes and selection                                                                       */

export function toggleEditMode() {
  const s = st()
  if (s.mode === 'edit') {
    s.commit({ mode: 'object' })
    return
  }
  const obj = activeObject(s)
  if (!obj) return
  s.commit({ mode: 'edit', selected: s.selected.includes(obj.id) ? s.selected : [...s.selected, obj.id], meshSel: flushSelection(obj.mesh, emptySelection(), s.selectMode) })
}

export function setSelectMode(mode: SelectMode) {
  const s = st()
  const obj = activeObject(s)
  if (!obj) {
    s.patch({ selectMode: mode })
    return
  }
  // converting keeps what is fully selected, like Blender
  const from = s.selectMode
  let sel = s.meshSel
  if (from === 'vert' && mode !== 'vert') sel = flushSelection(obj.mesh, sel, 'vert')
  sel = flushSelection(obj.mesh, mode === 'vert' ? { ...emptySelection(), verts: sel.verts } : mode === 'edge' ? { ...emptySelection(), edges: sel.edges } : { ...emptySelection(), faces: sel.faces }, mode)
  s.patch({ selectMode: mode, meshSel: sel })
}

export function selectAllToggle(action: 'select' | 'deselect' | 'invert') {
  const s = st()
  if (s.mode === 'edit') {
    const obj = activeObject(s)
    if (!obj) return
    const sel = action === 'select' ? selectAll(obj.mesh, s.selectMode) : action === 'deselect' ? emptySelection() : invertSelection(obj.mesh, s.meshSel, s.selectMode)
    s.commit({ meshSel: sel })
    return
  }
  const visible = s.doc.objects.filter((o) => o.visible).map((o) => o.id)
  const selected = action === 'select' ? visible : action === 'deselect' ? [] : visible.filter((id) => !s.selected.includes(id))
  s.commit({ selected, active: action === 'deselect' ? s.active : (selected.includes(s.active ?? '') ? s.active : (selected[selected.length - 1] ?? s.active)) })
}

export function selectLinkedAll() {
  const s = st()
  const obj = activeObject(s)
  if (!obj || s.mode !== 'edit') return
  s.commit({ meshSel: selectLinked(obj.mesh, s.meshSel.verts, s.selectMode) })
}

export function growSelection(more: boolean) {
  const s = st()
  const obj = activeObject(s)
  if (!obj || s.mode !== 'edit') return
  s.commit({ meshSel: more ? selectMore(obj.mesh, s.meshSel, s.selectMode) : selectLess(obj.mesh, s.meshSel, s.selectMode) })
}

/* ---------------------------------------------------------------------------------------- */
/* Object mode                                                                               */

export function addPrimitive(kind: PrimitiveKind) {
  const s = st()
  const obj = primitiveObject(s.doc, kind)
  const doc = { ...s.doc, objects: [...s.doc.objects, obj] }
  // Blender adds in object mode when not editing; in edit mode it joins the mesh
  if (s.mode === 'edit') {
    const target = activeObject(s)
    if (target) {
      const joined = joinObjects(target, [obj])
      const offset = target.mesh.verts.length
      const sel = emptySelection()
      for (let i = offset; i < joined.mesh.verts.length; i++) sel.verts.add(i)
      s.commit({ doc: withObject(s.doc, target.id, () => joined), meshSel: flushSelection(joined.mesh, sel, 'vert') })
      if (s.selectMode !== 'vert') setSelectMode(s.selectMode)
      return
    }
  }
  s.commit({ doc, selected: [obj.id], active: obj.id, mode: 'object' })
}

export function addCollisionBox() {
  const s = st()
  const target = activeObject(s)
  const obj = primitiveObject(s.doc, 'cube')
  obj.name = 'Collision'
  obj.role = 'collision'
  if (target) {
    // fit the object's bounds
    const box = new THREE.Box3()
    const m = objectMatrix(target)
    const v = new THREE.Vector3()
    for (const p of target.mesh.verts) box.expandByPoint(v.set(p[0], p[1], p[2]).applyMatrix4(m))
    if (!box.isEmpty()) {
      const c = box.getCenter(new THREE.Vector3())
      const size = box.getSize(new THREE.Vector3())
      obj.position = [c.x, c.y, c.z]
      obj.scale = [Math.max(size.x, 0.02), Math.max(size.y, 0.02), Math.max(size.z, 0.02)]
      obj.name = `${target.name}_col`
    }
  }
  const doc = { ...s.doc, objects: [...s.doc.objects, obj] }
  s.commit({ doc, selected: [obj.id], active: obj.id, mode: 'object' })
}

export function deleteObjects() {
  const s = st()
  if (!s.selected.length) return
  const objects = s.doc.objects.filter((o) => !s.selected.includes(o.id))
  s.commit({ doc: { ...s.doc, objects }, selected: [], active: objects[objects.length - 1]?.id ?? null, mode: 'object' })
}

export function duplicateObjects(): string[] {
  const s = st()
  let doc = s.doc
  const ids: string[] = []
  for (const id of s.selected) {
    const o = doc.objects.find((x) => x.id === id)
    if (!o) continue
    const copy = duplicateObject(doc, o)
    doc = { ...doc, objects: [...doc.objects, copy] }
    ids.push(copy.id)
  }
  if (!ids.length) return []
  s.commit({ doc, selected: ids, active: ids[ids.length - 1] })
  return ids
}

export function joinSelected() {
  const s = st()
  const target = activeObject(s)
  if (!target) return
  const others = s.doc.objects.filter((o) => s.selected.includes(o.id) && o.id !== target.id)
  if (!others.length) return
  const joined = joinObjects(target, others)
  const drop = new Set(others.map((o) => o.id))
  s.commit({ doc: { ...s.doc, objects: s.doc.objects.filter((o) => !drop.has(o.id)).map((o) => (o.id === target.id ? joined : o)) }, selected: [target.id] })
}

function mapSelected(fn: (o: ModelObject) => ModelObject) {
  const s = st()
  const ids = new Set(s.selected.length ? s.selected : s.active ? [s.active] : [])
  if (!ids.size) return
  s.commit({ doc: { ...s.doc, objects: s.doc.objects.map((o) => (ids.has(o.id) ? fn(o) : o)) } })
}

export const applyTransforms = (what: { location?: boolean; rotation?: boolean; scale?: boolean }) => mapSelected((o) => applyTransform(o, what))
export const setOriginSelected = (mode: OriginMode) => mapSelected((o) => setOrigin(o, mode, st().doc.cursor))
export const clearTransform = (what: 'location' | 'rotation' | 'scale') =>
  mapSelected((o) => ({ ...o, ...(what === 'location' ? { position: [0, 0, 0] } : what === 'rotation' ? { rotation: [0, 0, 0] } : { scale: [1, 1, 1] }) }) as ModelObject)

export function shadeObjects(smooth: boolean) {
  mapSelected((o) => ({ ...o, mesh: setSmooth(o.mesh, o.mesh.faces.map((_, i) => i), smooth) }))
}

export function hideSelected(unselected = false) {
  const s = st()
  const sel = new Set(s.selected)
  const doc = { ...s.doc, objects: s.doc.objects.map((o) => ((unselected ? !sel.has(o.id) : sel.has(o.id)) ? { ...o, visible: false } : o)) }
  s.commit({ doc, selected: unselected ? s.selected : [] })
}

export function revealAll() {
  const s = st()
  const hidden = s.doc.objects.filter((o) => !o.visible).map((o) => o.id)
  if (!hidden.length) return
  s.commit({ doc: { ...s.doc, objects: s.doc.objects.map((o) => ({ ...o, visible: true })) }, selected: hidden })
}

export function setRole(id: string, role: ModelObject['role']) {
  const s = st()
  s.commit({ doc: withObject(s.doc, id, (o) => ({ ...o, role })) })
}

export function updateObject(id: string, patch: Partial<ModelObject>, record = true) {
  const s = st()
  const doc = withObject(s.doc, id, (o) => ({ ...o, ...patch }))
  if (record) s.commit({ doc })
  else s.live({ doc })
}

export function renameObject(id: string, name: string) {
  const clean = name.trim()
  if (clean) updateObject(id, { name: clean })
}

/* Modifiers */

export function addModifier(kind: Modifier['kind']) {
  const obj = activeObject(st())
  if (obj) updateObject(obj.id, { modifiers: [...obj.modifiers, newModifier(kind)] })
}

export function updateModifier(id: string, patch: Partial<Modifier>) {
  const obj = activeObject(st())
  if (obj) updateObject(obj.id, { modifiers: obj.modifiers.map((m) => (m.id === id ? ({ ...m, ...patch } as Modifier) : m)) })
}

export function removeModifier(id: string) {
  const obj = activeObject(st())
  if (obj) updateObject(obj.id, { modifiers: obj.modifiers.filter((m) => m.id !== id) })
}

export function moveModifier(id: string, dir: -1 | 1) {
  const obj = activeObject(st())
  if (!obj) return
  const i = obj.modifiers.findIndex((m) => m.id === id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= obj.modifiers.length) return
  const list = [...obj.modifiers]
  ;[list[i], list[j]] = [list[j], list[i]]
  updateObject(obj.id, { modifiers: list })
}

export function applyModifierById(id: string) {
  const s = st()
  const obj = activeObject(s)
  if (!obj) return
  s.commit({ doc: withObject(s.doc, obj.id, (o) => applyModifier(o, id)), meshSel: emptySelection() })
}

/* Materials */

export function addMaterialSlot() {
  const s = st()
  const obj = activeObject(s)
  if (!obj) return
  const mat = newMaterial(`Material.${String(s.doc.materials.length).padStart(3, '0')}`, MATERIAL_SWATCHES[s.doc.materials.length % MATERIAL_SWATCHES.length])
  const doc: ModelDoc = { ...s.doc, materials: [...s.doc.materials, mat] }
  s.commit({ doc: withObject(doc, obj.id, (o) => ({ ...o, materials: [...o.materials, mat.id] })) })
}

export function removeMaterialSlot(slot: number) {
  const s = st()
  const obj = activeObject(s)
  if (!obj || obj.materials.length <= 1) return
  const materials = obj.materials.filter((_, i) => i !== slot)
  const mesh: EditMesh = { verts: obj.mesh.verts, faces: obj.mesh.faces.map((f) => ({ ...f, mat: f.mat === slot ? 0 : f.mat > slot ? f.mat - 1 : f.mat })) }
  s.commit({ doc: withObject(s.doc, obj.id, (o) => ({ ...o, materials, mesh })) })
}

export function setSlotMaterial(slot: number, materialId: string) {
  const obj = activeObject(st())
  if (obj) updateObject(obj.id, { materials: obj.materials.map((id, i) => (i === slot ? materialId : id)) })
}

export function updateMaterial(id: string, patch: Partial<ModelDoc['materials'][number]>, record = true) {
  const s = st()
  const doc = { ...s.doc, materials: s.doc.materials.map((m) => (m.id === id ? { ...m, ...patch } : m)) }
  if (record) s.commit({ doc })
  else s.live({ doc })
}

export function newMaterialForSlot(slot: number) {
  const s = st()
  const obj = activeObject(s)
  if (!obj) return
  const mat = newMaterial(`Material.${String(s.doc.materials.length).padStart(3, '0')}`, MATERIAL_SWATCHES[s.doc.materials.length % MATERIAL_SWATCHES.length])
  const doc: ModelDoc = { ...s.doc, materials: [...s.doc.materials, mat] }
  s.commit({ doc: withObject(doc, obj.id, (o) => ({ ...o, materials: o.materials.map((id, i) => (i === slot ? mat.id : id)) })) })
}

/* ---------------------------------------------------------------------------------------- */
/* Edit mode                                                                                 */

/**
 * Runs a mesh operation on the active object: on the edit mode selection, or on the whole
 * mesh when `all` is set (buttons that also work in object mode).
 */
export function editMesh(fn: (mesh: EditMesh, sel: MeshSelection, mode: SelectMode) => { mesh: EditMesh; sel?: MeshSelection } | null, all = false) {
  const s = st()
  const obj = activeObject(s)
  if (!obj || (!all && s.mode !== 'edit')) return false
  const res = fn(obj.mesh, all ? selectAll(obj.mesh, 'face') : s.meshSel, all ? 'face' : s.selectMode)
  if (!res) return false
  const doc = withObject(s.doc, obj.id, (o) => ({ ...o, mesh: res.mesh }))
  if (all && s.mode !== 'edit') s.commit({ doc })
  else s.commit({ doc, meshSel: all ? flushSelection(res.mesh, emptySelection(), s.selectMode) : (res.sel ?? emptySelection()) })
  return true
}

export type DeleteKind = 'verts' | 'edges' | 'faces' | 'only-faces' | 'dissolve-verts' | 'dissolve-edges' | 'dissolve-faces'

export function deleteElements(kind: DeleteKind) {
  editMesh((mesh, sel) => {
    switch (kind) {
      case 'verts':
        return { mesh: deleteVerts(mesh, sel.verts) }
      case 'edges':
        return { mesh: deleteEdges(mesh, sel.edges) }
      case 'faces':
        return { mesh: deleteFaces(mesh, sel.faces) }
      case 'only-faces':
        return { mesh: deleteFaces(mesh, sel.faces, true) }
      case 'dissolve-verts':
        return { mesh: dissolveVerts(mesh, sel.verts) }
      case 'dissolve-edges':
        return { mesh: dissolveEdges(mesh, sel.edges) }
      case 'dissolve-faces':
        return { mesh: dissolveFaces(mesh, sel.faces) }
    }
  })
}

export type MergeKind = 'center' | 'cursor' | 'distance'

/** Returns how many vertices a merge by distance removed. */
export function mergeVerts(kind: MergeKind, all = false): number {
  let removed = 0
  const s = st()
  const obj = activeObject(s)
  editMesh((mesh, sel, mode) => {
    if (kind === 'distance') {
      const r = mergeByDistance(mesh, sel.verts.size ? sel.verts : null, 0.0001)
      removed = r.removed
      return { mesh: r.mesh }
    }
    if (all) return null
    const r = mergeAtCenter(mesh, sel.verts, mode)
    if (kind === 'cursor' && obj) {
      const inv = objectMatrix(obj).invert()
      const c = new THREE.Vector3(...s.doc.cursor).applyMatrix4(inv)
      const v = [...r.sel.verts][0]
      if (v !== undefined) r.mesh.verts[v] = [c.x, c.y, c.z]
    }
    return r
  }, all)
  return removed
}

export function fill() {
  return editMesh((mesh, sel, mode) => fillFace(mesh, sel.verts, 0, mode))
}

export function subdivideSelection() {
  editMesh((mesh, sel, mode) => (sel.faces.size ? subdivide(mesh, sel.faces, mode) : null))
}

export function flipSelection(all = false) {
  editMesh((mesh, sel) => ({ mesh: flipFaces(mesh, sel.faces), sel }), all)
}

export function recalcSelection(inside = false, all = false) {
  editMesh((mesh, sel) => {
    const faces = sel.faces.size ? sel.faces : new Set(mesh.faces.map((_, i) => i))
    let m = recalcNormals(mesh, faces)
    if (inside) m = flipFaces(m, faces)
    return { mesh: m, sel }
  }, all)
}

export function shadeSelection(smooth: boolean) {
  editMesh((mesh, sel) => ({ mesh: setSmooth(mesh, sel.faces.size ? sel.faces : mesh.faces.map((_, i) => i), smooth), sel }))
}

export function triangulateSelection() {
  editMesh((mesh, sel, mode) => {
    const m = triangulateFaces(mesh, sel.faces)
    return { mesh: m, sel: reselect(m, sel.verts, mode) }
  })
}

export function trisToQuadsSelection() {
  editMesh((mesh, sel, mode) => {
    const m = trisToQuads(mesh, sel.faces)
    return { mesh: m, sel: reselect(m, sel.verts, mode) }
  })
}

/** Selection from vertices for ops that keep vertex indices but change faces. */
function reselect(mesh: EditMesh, verts: Set<number>, mode: SelectMode) {
  const base = flushSelection(mesh, { ...emptySelection(), verts }, 'vert')
  if (mode === 'vert') return base
  return flushSelection(mesh, mode === 'edge' ? { ...emptySelection(), edges: base.edges } : { ...emptySelection(), faces: base.faces }, mode)
}

export function smoothSelection() {
  editMesh((mesh, sel) => ({ mesh: smoothVerts(mesh, sel.verts, 0.5, 1), sel }))
}

export function separateSelection() {
  const s = st()
  const obj = activeObject(s)
  if (!obj || s.mode !== 'edit' || !s.meshSel.faces.size) return false
  const { rest, part } = separate(obj.mesh, s.meshSel.faces)
  const piece = { ...makeObject(s.doc, part, obj.name, [...obj.position]), rotation: [...obj.rotation] as Vec3, scale: [...obj.scale] as Vec3, materials: [...obj.materials], autoSmooth: obj.autoSmooth, role: obj.role }
  const doc = { ...s.doc, objects: [...s.doc.objects.map((o) => (o.id === obj.id ? { ...o, mesh: rest } : o)), piece] }
  s.commit({ doc, meshSel: emptySelection() })
  return true
}

export function assignMaterial(slot: number) {
  editMesh((mesh, sel) => ({ mesh: setMaterial(mesh, sel.faces, slot), sel }))
}

export function selectBySlot(slot: number, select: boolean) {
  const s = st()
  const obj = activeObject(s)
  if (!obj || s.mode !== 'edit') return
  const faces = new Set(s.meshSel.faces)
  obj.mesh.faces.forEach((f, i) => {
    if (f.mat !== slot) return
    if (select) faces.add(i)
    else faces.delete(i)
  })
  const base = flushSelection(obj.mesh, { ...emptySelection(), faces }, 'face')
  s.commit({ meshSel: s.selectMode === 'face' ? base : flushSelection(obj.mesh, s.selectMode === 'edge' ? { ...emptySelection(), edges: base.edges } : { ...emptySelection(), verts: base.verts }, s.selectMode) })
}

export function cubeProjectSelection(perMetre = 1, all = false) {
  editMesh((mesh, sel) => ({ mesh: projectBoxUVs(mesh, sel.faces.size ? sel.faces : mesh.faces.map((_, i) => i), perMetre), sel }), all)
}

/* ---------------------------------------------------------------------------------------- */
/* Cursor and snapping (Shift+S)                                                             */

/** Document space centre of the selection (objects or elements). */
export function selectionCenter(): Vec3 | null {
  const s = st()
  if (s.mode === 'edit') {
    const obj = activeObject(s)
    if (!obj || !s.meshSel.verts.size) return null
    const m = objectMatrix(obj)
    const c = avg([...s.meshSel.verts].map((v) => obj.mesh.verts[v]).filter(Boolean))
    const p = new THREE.Vector3(...c).applyMatrix4(m)
    return [p.x, p.y, p.z]
  }
  const objs = s.doc.objects.filter((o) => s.selected.includes(o.id))
  if (!objs.length) return null
  return avg(objs.map((o) => o.position))
}

export function cursorToSelected() {
  const c = selectionCenter()
  if (c) st().patch({ doc: { ...st().doc, cursor: c } })
}

export function cursorToOrigin() {
  st().patch({ doc: { ...st().doc, cursor: [0, 0, 0] } })
}

export function selectionToCursor() {
  const s = st()
  const cursor = s.doc.cursor
  if (s.mode === 'edit') {
    const obj = activeObject(s)
    const c = selectionCenter()
    if (!obj || !c) return
    const inv = objectMatrix(obj).invert()
    const d = new THREE.Vector3(...cursor).applyMatrix4(inv).sub(new THREE.Vector3(...c).applyMatrix4(inv))
    editMesh((mesh, sel) => {
      const verts = mesh.verts.slice()
      for (const v of sel.verts) verts[v] = [verts[v][0] + d.x, verts[v][1] + d.y, verts[v][2] + d.z]
      return { mesh: { verts, faces: mesh.faces }, sel }
    })
    return
  }
  mapSelected((o) => ({ ...o, position: [...cursor] }))
}

/** Puts the model on the ground: lowest point of the visible objects at z = 0. */
export function dropToGround() {
  const s = st()
  let minZ = Infinity
  const v = new THREE.Vector3()
  for (const o of s.doc.objects) {
    if (!o.visible) continue
    const m = objectMatrix(o)
    for (const p of o.mesh.verts) minZ = Math.min(minZ, v.set(p[0], p[1], p[2]).applyMatrix4(m).z)
  }
  if (!Number.isFinite(minZ) || Math.abs(minZ) < 1e-9) return
  s.commit({ doc: { ...s.doc, objects: s.doc.objects.map((o) => ({ ...o, position: [o.position[0], o.position[1], o.position[2] - minZ] as Vec3 })) } })
}
