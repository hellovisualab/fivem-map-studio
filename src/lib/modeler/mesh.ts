import type { EditMesh, Face, MeshSelection, SelectMode, Vec2, Vec3 } from '@/lib/modeler/types'

/*
 * Polygon mesh editing (Blender edit mode operations) on a faces-only mesh. Operations
 * are pure: they take a mesh and return a new one plus the resulting selection.
 */

/* ---------------------------------------------------------------------------------------- */
/* Vector helpers                                                                            */

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
export const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2])
export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
export const lerp2 = (a: Vec2, b: Vec2, t: number): Vec2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
export function normalize(a: Vec3): Vec3 {
  const l = len(a)
  return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0]
}
export const avg = (pts: Vec3[]): Vec3 => {
  const s: Vec3 = [0, 0, 0]
  for (const p of pts) {
    s[0] += p[0]
    s[1] += p[1]
    s[2] += p[2]
  }
  const n = Math.max(1, pts.length)
  return [s[0] / n, s[1] / n, s[2] / n]
}
const avg2 = (pts: Vec2[]): Vec2 => {
  let u = 0
  let v = 0
  for (const p of pts) {
    u += p[0]
    v += p[1]
  }
  const n = Math.max(1, pts.length)
  return [u / n, v / n]
}

/* ---------------------------------------------------------------------------------------- */
/* Topology                                                                                  */

export const edgeKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`)
export const edgeVerts = (key: string): [number, number] => {
  const i = key.indexOf(':')
  return [Number(key.slice(0, i)), Number(key.slice(i + 1))]
}

export interface EdgeInfo {
  a: number
  b: number
  /** Faces using the edge, with the corner index where the edge starts in that face. */
  faces: { f: number; i: number }[]
}

export function buildEdges(mesh: EditMesh) {
  const edges = new Map<string, EdgeInfo>()
  mesh.faces.forEach((face, f) => {
    const n = face.v.length
    for (let i = 0; i < n; i++) {
      const a = face.v[i]
      const b = face.v[(i + 1) % n]
      const key = edgeKey(a, b)
      let e = edges.get(key)
      if (!e) {
        e = { a: Math.min(a, b), b: Math.max(a, b), faces: [] }
        edges.set(key, e)
      }
      e.faces.push({ f, i })
    }
  })
  return edges
}

export function vertexFaces(mesh: EditMesh) {
  const out: number[][] = mesh.verts.map(() => [])
  mesh.faces.forEach((face, f) => {
    for (const v of face.v) out[v]?.push(f)
  })
  return out
}

/** Newell normal (works for any planar or slightly non-planar polygon). */
export function faceNormal(mesh: EditMesh, face: Face): Vec3 {
  let x = 0
  let y = 0
  let z = 0
  const n = face.v.length
  for (let i = 0; i < n; i++) {
    const a = mesh.verts[face.v[i]]
    const b = mesh.verts[face.v[(i + 1) % n]]
    x += (a[1] - b[1]) * (a[2] + b[2])
    y += (a[2] - b[2]) * (a[0] + b[0])
    z += (a[0] - b[0]) * (a[1] + b[1])
  }
  return normalize([x, y, z])
}

export function faceCenter(mesh: EditMesh, face: Face): Vec3 {
  return avg(face.v.map((i) => mesh.verts[i]))
}

export function faceArea(mesh: EditMesh, face: Face) {
  const n = face.v.length
  let s: Vec3 = [0, 0, 0]
  const p0 = mesh.verts[face.v[0]]
  for (let i = 1; i + 1 < n; i++) s = add(s, cross(sub(mesh.verts[face.v[i]], p0), sub(mesh.verts[face.v[i + 1]], p0)))
  return len(s) / 2
}

export function cloneMesh(mesh: EditMesh): EditMesh {
  return {
    verts: mesh.verts.map((v) => [v[0], v[1], v[2]] as Vec3),
    faces: mesh.faces.map((f) => ({ v: [...f.v], uv: f.uv.map((u) => [u[0], u[1]] as Vec2), mat: f.mat, smooth: f.smooth })),
  }
}

/** Removes unused vertices. Returns the old -> new index map (-1 for removed). */
export function compact(mesh: EditMesh): { mesh: EditMesh; remap: number[] } {
  const used = new Uint8Array(mesh.verts.length)
  for (const f of mesh.faces) for (const v of f.v) used[v] = 1
  const remap: number[] = []
  const verts: Vec3[] = []
  mesh.verts.forEach((v, i) => {
    if (used[i]) {
      remap[i] = verts.length
      verts.push(v)
    } else remap[i] = -1
  })
  return { mesh: { verts, faces: mesh.faces.map((f) => ({ ...f, v: f.v.map((i) => remap[i]) })) }, remap }
}

/**
 * Triangulates a face into corner-index triples. Convex faces use a fan; concave ones
 * are ear-clipped in the face plane.
 */
export function triangulateFace(mesh: EditMesh, face: Face): [number, number, number][] {
  const n = face.v.length
  if (n < 3) return []
  if (n === 3) return [[0, 1, 2]]
  const normal = faceNormal(mesh, face)
  // projection axes
  const ax = Math.abs(normal[0])
  const ay = Math.abs(normal[1])
  const az = Math.abs(normal[2])
  const [i0, i1] = az >= ax && az >= ay ? [0, 1] : ax >= ay ? [1, 2] : [2, 0]
  const sign = (az >= ax && az >= ay ? normal[2] : ax >= ay ? normal[0] : normal[1]) < 0 ? -1 : 1
  const pts = face.v.map((v) => [mesh.verts[v][i0], mesh.verts[v][i1] * sign] as Vec2)
  const areaSign = (a: Vec2, b: Vec2, c: Vec2) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
  let convex = true
  for (let i = 0; i < n && convex; i++) {
    if (areaSign(pts[i], pts[(i + 1) % n], pts[(i + 2) % n]) < -1e-12) convex = false
  }
  if (convex) {
    const out: [number, number, number][] = []
    for (let i = 1; i + 1 < n; i++) out.push([0, i, i + 1])
    return out
  }
  const idx = pts.map((_, i) => i)
  const out: [number, number, number][] = []
  const inside = (p: Vec2, a: Vec2, b: Vec2, c: Vec2) =>
    areaSign(a, b, p) >= 0 && areaSign(b, c, p) >= 0 && areaSign(c, a, p) >= 0
  let guard = 0
  while (idx.length > 3 && guard++ < n * n) {
    let clipped = false
    for (let k = 0; k < idx.length; k++) {
      const a = idx[(k + idx.length - 1) % idx.length]
      const b = idx[k]
      const c = idx[(k + 1) % idx.length]
      if (areaSign(pts[a], pts[b], pts[c]) <= 1e-12) continue
      let ear = true
      for (const o of idx) {
        if (o === a || o === b || o === c) continue
        if (inside(pts[o], pts[a], pts[b], pts[c])) {
          ear = false
          break
        }
      }
      if (!ear) continue
      out.push([a, b, c])
      idx.splice(k, 1)
      clipped = true
      break
    }
    if (!clipped) break
  }
  if (idx.length === 3) out.push([idx[0], idx[1], idx[2]])
  else for (let i = 1; i + 1 < idx.length; i++) out.push([idx[0], idx[i], idx[i + 1]])
  return out
}

/* ---------------------------------------------------------------------------------------- */
/* Selection                                                                                 */

export function emptySelection(): MeshSelection {
  return { verts: new Set(), edges: new Set(), faces: new Set() }
}

/** Derives the other element types from the primary one of `mode`, like Blender's select flush. */
export function flushSelection(mesh: EditMesh, sel: MeshSelection, mode: SelectMode): MeshSelection {
  const out: MeshSelection = { verts: new Set(), edges: new Set(), faces: new Set() }
  if (mode === 'vert') {
    for (const v of sel.verts) if (v < mesh.verts.length) out.verts.add(v)
    mesh.faces.forEach((f, fi) => {
      let all = true
      for (let i = 0; i < f.v.length; i++) {
        const a = f.v[i]
        const b = f.v[(i + 1) % f.v.length]
        if (out.verts.has(a) && out.verts.has(b)) out.edges.add(edgeKey(a, b))
        if (!out.verts.has(a)) all = false
      }
      if (all) out.faces.add(fi)
    })
  } else if (mode === 'edge') {
    const edges = buildEdges(mesh)
    for (const k of sel.edges) {
      const e = edges.get(k)
      if (!e) continue
      out.edges.add(k)
      out.verts.add(e.a)
      out.verts.add(e.b)
    }
    mesh.faces.forEach((f, fi) => {
      let all = true
      for (let i = 0; i < f.v.length && all; i++) if (!out.edges.has(edgeKey(f.v[i], f.v[(i + 1) % f.v.length]))) all = false
      if (all) out.faces.add(fi)
    })
  } else {
    for (const fi of sel.faces) {
      const f = mesh.faces[fi]
      if (!f) continue
      out.faces.add(fi)
      for (let i = 0; i < f.v.length; i++) {
        out.verts.add(f.v[i])
        out.edges.add(edgeKey(f.v[i], f.v[(i + 1) % f.v.length]))
      }
    }
  }
  return out
}

export function selectAll(mesh: EditMesh, mode: SelectMode): MeshSelection {
  const sel = emptySelection()
  mesh.verts.forEach((_, i) => sel.verts.add(i))
  for (const k of buildEdges(mesh).keys()) sel.edges.add(k)
  mesh.faces.forEach((_, i) => sel.faces.add(i))
  return flushSelection(mesh, sel, mode)
}

export function invertSelection(mesh: EditMesh, sel: MeshSelection, mode: SelectMode): MeshSelection {
  const out = emptySelection()
  if (mode === 'vert') {
    for (let i = 0; i < mesh.verts.length; i++) if (!sel.verts.has(i)) out.verts.add(i)
  } else if (mode === 'edge') {
    for (const k of buildEdges(mesh).keys()) if (!sel.edges.has(k)) out.edges.add(k)
  } else {
    for (let i = 0; i < mesh.faces.length; i++) if (!sel.faces.has(i)) out.faces.add(i)
  }
  return flushSelection(mesh, out, mode)
}

/** Every element connected to the selected vertices (L / Ctrl+L). */
export function selectLinked(mesh: EditMesh, seeds: Iterable<number>, mode: SelectMode): MeshSelection {
  const vf = vertexFaces(mesh)
  const seen = new Set<number>()
  const stack = [...seeds]
  const faces = new Set<number>()
  while (stack.length) {
    const v = stack.pop()!
    if (seen.has(v)) continue
    seen.add(v)
    for (const f of vf[v] ?? []) {
      if (faces.has(f)) continue
      faces.add(f)
      for (const w of mesh.faces[f].v) if (!seen.has(w)) stack.push(w)
    }
  }
  const sel = emptySelection()
  for (const v of seen) sel.verts.add(v)
  for (const f of faces) sel.faces.add(f)
  if (mode === 'edge') {
    const edges = buildEdges(mesh)
    for (const [k, e] of edges) if (seen.has(e.a) && seen.has(e.b)) sel.edges.add(k)
  }
  return flushSelection(mesh, sel, mode === 'face' ? 'face' : mode)
}

export function selectMore(mesh: EditMesh, sel: MeshSelection, mode: SelectMode): MeshSelection {
  const out = emptySelection()
  const vf = vertexFaces(mesh)
  const faces = new Set<number>()
  for (const v of sel.verts) for (const f of vf[v] ?? []) faces.add(f)
  for (const f of faces) {
    out.faces.add(f)
    for (const v of mesh.faces[f].v) out.verts.add(v)
  }
  for (const v of sel.verts) out.verts.add(v)
  if (mode === 'edge') {
    for (const f of faces) {
      const fv = mesh.faces[f].v
      for (let i = 0; i < fv.length; i++) out.edges.add(edgeKey(fv[i], fv[(i + 1) % fv.length]))
    }
  }
  return flushSelection(mesh, out, mode)
}

export function selectLess(mesh: EditMesh, sel: MeshSelection, mode: SelectMode): MeshSelection {
  const vf = vertexFaces(mesh)
  const keep = new Set<number>()
  for (const v of sel.verts) {
    let interior = true
    for (const f of vf[v] ?? []) for (const w of mesh.faces[f].v) if (!sel.verts.has(w)) interior = false
    if (interior) keep.add(v)
  }
  const out = emptySelection()
  for (const v of keep) out.verts.add(v)
  if (mode === 'face') {
    for (const f of sel.faces) if (mesh.faces[f].v.every((v) => keep.has(v))) out.faces.add(f)
  }
  if (mode === 'edge') for (const k of sel.edges) {
    const [a, b] = edgeVerts(k)
    if (keep.has(a) && keep.has(b)) out.edges.add(k)
  }
  return flushSelection(mesh, out, mode)
}

/** Edge ring through quads starting at `key` (Ctrl+R preview, Ctrl+Alt+click). */
export function edgeRing(mesh: EditMesh, key: string): { edges: string[]; closed: boolean } {
  const edges = buildEdges(mesh)
  const start = edges.get(key)
  if (!start) return { edges: [], closed: false }
  const ring: string[] = [key]
  const seen = new Set([key])
  let closed = false
  const walk = (fromKey: string, fromFace: number) => {
    const out: string[] = []
    let curKey = fromKey
    let face = fromFace
    for (let guard = 0; guard < 100000; guard++) {
      const f = mesh.faces[face]
      if (!f || f.v.length !== 4) break
      const [a, b] = edgeVerts(curKey)
      const i = f.v.findIndex((v, k) => edgeKey(v, f.v[(k + 1) % 4]) === edgeKey(a, b))
      if (i < 0) break
      const opp = edgeKey(f.v[(i + 2) % 4], f.v[(i + 3) % 4])
      if (seen.has(opp)) {
        if (opp === key) closed = true
        break
      }
      seen.add(opp)
      out.push(opp)
      const next = edges.get(opp)!.faces.find((x) => x.f !== face)
      if (!next) break
      curKey = opp
      face = next.f
    }
    return out
  }
  const [f0, f1] = start.faces
  if (f0) ring.push(...walk(key, f0.f))
  if (!closed && f1) ring.unshift(...walk(key, f1.f).reverse())
  return { edges: ring, closed }
}

/** Edge loop through 4-valent vertices (Alt+click). */
export function edgeLoop(mesh: EditMesh, key: string): string[] {
  const edges = buildEdges(mesh)
  const vf = vertexFaces(mesh)
  const start = edges.get(key)
  if (!start) return []
  const loop = new Set([key])
  const step = (from: number, prevKey: string) => {
    let v = from
    let pk = prevKey
    for (let guard = 0; guard < 100000; guard++) {
      const faces = vf[v]
      if (!faces || faces.length !== 4) return
      // edges around v
      const around = new Set<string>()
      for (const f of faces) {
        const fv = mesh.faces[f].v
        const i = fv.indexOf(v)
        around.add(edgeKey(v, fv[(i + 1) % fv.length]))
        around.add(edgeKey(v, fv[(i + fv.length - 1) % fv.length]))
      }
      if (around.size !== 4) return
      // the opposite edge shares no face with the previous edge
      const prevFaces = new Set(edges.get(pk)!.faces.map((x) => x.f))
      let next: string | null = null
      for (const k of around) {
        if (k === pk) continue
        if (!edges.get(k)!.faces.some((x) => prevFaces.has(x.f))) next = k
      }
      if (!next || loop.has(next)) return
      loop.add(next)
      const [a, b] = edgeVerts(next)
      v = a === v ? b : a
      pk = next
    }
  }
  step(start.a, key)
  step(start.b, key)
  return [...loop]
}

/* ---------------------------------------------------------------------------------------- */
/* UVs                                                                                       */

/** Box projection UV of a point on a face with `normal`, at `perMetre` repeats per metre. */
export function boxUV(p: Vec3, normal: Vec3, perMetre: number): Vec2 {
  const ax = Math.abs(normal[0])
  const ay = Math.abs(normal[1])
  const az = Math.abs(normal[2])
  let u: number
  let v: number
  if (ax >= ay && ax >= az) {
    u = normal[0] > 0 ? p[1] : -p[1]
    v = p[2]
  } else if (ay >= az) {
    u = normal[1] > 0 ? -p[0] : p[0]
    v = p[2]
  } else {
    u = p[0]
    v = normal[2] > 0 ? p[1] : -p[1]
  }
  return [u * perMetre, v * perMetre]
}

/** Rewrites the stored UVs of `faces` with a box projection (UV > Cube Projection). */
export function projectBoxUVs(mesh: EditMesh, faces: Iterable<number>, perMetre = 1): EditMesh {
  const out = cloneMesh(mesh)
  for (const fi of faces) {
    const f = out.faces[fi]
    if (!f) continue
    const n = faceNormal(out, f)
    f.uv = f.v.map((v) => boxUV(out.verts[v], n, perMetre))
  }
  return out
}

/* ---------------------------------------------------------------------------------------- */
/* Operations                                                                                */

export interface OpResult {
  mesh: EditMesh
  sel: MeshSelection
}

function selectFaces(mesh: EditMesh, faces: Iterable<number>, mode: SelectMode) {
  const sel = emptySelection()
  for (const f of faces) sel.faces.add(f)
  const flushed = flushSelection(mesh, sel, 'face')
  return mode === 'face' ? flushed : flushSelection(mesh, mode === 'edge' ? { ...emptySelection(), edges: flushed.edges } : { ...emptySelection(), verts: flushed.verts }, mode)
}

/** Region extrude of the selected faces (E). New geometry starts where the old one was. */
export function extrudeFaces(mesh: EditMesh, faceSel: Set<number>, mode: SelectMode): OpResult & { moved: number[] } {
  const m = cloneMesh(mesh)
  const region = [...faceSel].filter((f) => m.faces[f])
  if (!region.length) return { mesh: m, sel: emptySelection(), moved: [] }
  const inRegion = new Set(region)
  const edges = buildEdges(m)
  const boundary: { a: number; b: number; f: number; i: number }[] = []
  for (const e of edges.values()) {
    const rf = e.faces.filter((x) => inRegion.has(x.f))
    if (rf.length === 1) {
      const { f, i } = rf[0]
      const fv = m.faces[f].v
      boundary.push({ a: fv[i], b: fv[(i + 1) % fv.length], f, i })
    }
  }
  // vertices shared with faces outside the region must be duplicated
  const vf = vertexFaces(m)
  const dup = new Map<number, number>()
  const regionVerts = new Set<number>()
  for (const f of region) for (const v of m.faces[f].v) regionVerts.add(v)
  for (const v of regionVerts) {
    const shared = vf[v].some((f) => !inRegion.has(f))
    const onBoundary = boundary.some((b) => b.a === v || b.b === v)
    if (shared || onBoundary) {
      dup.set(v, m.verts.length)
      m.verts.push([...m.verts[v]] as Vec3)
    }
  }
  const sides: Face[] = []
  for (const bd of boundary) {
    const face = m.faces[bd.f]
    const a2 = dup.get(bd.a) ?? bd.a
    const b2 = dup.get(bd.b) ?? bd.b
    const uvA = face.uv[bd.i]
    const uvB = face.uv[(bd.i + 1) % face.v.length]
    sides.push({ v: [bd.a, bd.b, b2, a2], uv: [uvA, uvB, uvB, uvA].map((u) => [u[0], u[1]] as Vec2), mat: face.mat, smooth: face.smooth })
  }
  for (const f of region) m.faces[f].v = m.faces[f].v.map((v) => dup.get(v) ?? v)
  m.faces.push(...sides)
  const moved = new Set<number>()
  for (const f of region) for (const v of m.faces[f].v) moved.add(v)
  return { mesh: m, sel: selectFaces(m, region, mode), moved: [...moved] }
}

/** Extrudes boundary edges into new quads (E in edge mode). */
export function extrudeEdges(mesh: EditMesh, edgeSel: Set<string>, mode: SelectMode): OpResult & { moved: number[] } {
  const m = cloneMesh(mesh)
  const edges = buildEdges(m)
  const dup = new Map<number, number>()
  const newFaces: Face[] = []
  const newEdges: string[] = []
  const vdup = (v: number) => {
    let d = dup.get(v)
    if (d === undefined) {
      d = m.verts.length
      m.verts.push([...m.verts[v]] as Vec3)
      dup.set(v, d)
    }
    return d
  }
  for (const k of edgeSel) {
    const e = edges.get(k)
    if (!e || e.faces.length !== 1) continue
    const { f, i } = e.faces[0]
    const face = m.faces[f]
    const a = face.v[i]
    const b = face.v[(i + 1) % face.v.length]
    const a2 = vdup(a)
    const b2 = vdup(b)
    const uvA = face.uv[i]
    const uvB = face.uv[(i + 1) % face.v.length]
    newFaces.push({ v: [b, a, a2, b2], uv: [uvB, uvA, uvA, uvB].map((u) => [u[0], u[1]] as Vec2), mat: face.mat, smooth: face.smooth })
    newEdges.push(edgeKey(a2, b2))
  }
  m.faces.push(...newFaces)
  const sel = emptySelection()
  for (const k of newEdges) sel.edges.add(k)
  const flushed = flushSelection(m, sel, 'edge')
  return { mesh: m, sel: mode === 'edge' ? flushed : flushSelection(m, { ...emptySelection(), verts: flushed.verts }, mode), moved: [...dup.values()] }
}

/**
 * Inset faces (I). `thickness` in metres; `depth` pushes the inner faces along their normal.
 * `individual` insets every face on its own instead of the selected region as a whole.
 */
export function insetFaces(mesh: EditMesh, faceSel: Set<number>, thickness: number, depth: number, individual: boolean, mode: SelectMode): OpResult {
  let m = cloneMesh(mesh)
  const groups = individual ? [...faceSel].map((f) => [f]) : [[...faceSel]]
  for (const group of groups) m = insetRegion(m, group.filter((f) => m.faces[f]), thickness, depth)
  return { mesh: m, sel: selectFaces(m, faceSel, mode) }
}

function insetRegion(m: EditMesh, region: number[], thickness: number, depth: number): EditMesh {
  if (!region.length) return m
  const inRegion = new Set(region)
  const edges = buildEdges(m)
  // boundary edges of the region, oriented as in their region face
  const next = new Map<number, { b: number; f: number; i: number }[]>()
  const boundary: { a: number; b: number; f: number; i: number }[] = []
  for (const e of edges.values()) {
    const rf = e.faces.filter((x) => inRegion.has(x.f))
    if (rf.length !== 1) continue
    const { f, i } = rf[0]
    const fv = m.faces[f].v
    const a = fv[i]
    const b = fv[(i + 1) % fv.length]
    boundary.push({ a, b, f, i })
    if (!next.has(a)) next.set(a, [])
    next.get(a)!.push({ b, f, i })
  }
  if (!boundary.length) return m
  const prev = new Map<number, { a: number; f: number }[]>()
  for (const bd of boundary) {
    if (!prev.has(bd.b)) prev.set(bd.b, [])
    prev.get(bd.b)!.push({ a: bd.a, f: bd.f })
  }
  const inner = new Map<number, number>()
  const normals = new Map<number, Vec3>()
  for (const f of region) normals.set(f, faceNormal(m, m.faces[f]))
  let regionNormal: Vec3 = [0, 0, 0]
  for (const f of region) regionNormal = add(regionNormal, scale(normals.get(f)!, faceArea(m, m.faces[f])))
  regionNormal = normalize(regionNormal)
  for (const v of new Set(boundary.map((b) => b.a))) {
    const out = next.get(v)?.[0]
    const inc = prev.get(v)?.[0]
    const p = m.verts[v]
    let dir: Vec3 = [0, 0, 0]
    const perp = (from: Vec3, to: Vec3, n: Vec3) => normalize(cross(n, sub(to, from)))
    if (out && inc) {
      const n1 = normals.get(inc.f)!
      const n2 = normals.get(out.f)!
      const d1 = perp(m.verts[inc.a], p, n1)
      const d2 = perp(p, m.verts[out.b], n2)
      dir = normalize(add(d1, d2))
      const c = dot(dir, d1)
      dir = scale(dir, 1 / Math.max(0.25, c))
    } else if (out) dir = perp(p, m.verts[out.b], normals.get(out.f)!)
    else if (inc) dir = perp(m.verts[inc.a], p, normals.get(inc.f)!)
    const np = add(add(p, scale(dir, thickness)), scale(regionNormal, depth))
    inner.set(v, m.verts.length)
    m.verts.push(np)
  }
  // interior region vertices only move with depth
  const regionVerts = new Set<number>()
  for (const f of region) for (const v of m.faces[f].v) regionVerts.add(v)
  if (depth !== 0) for (const v of regionVerts) if (!inner.has(v)) m.verts[v] = add(m.verts[v], scale(regionNormal, depth))
  const ring: Face[] = []
  for (const bd of boundary) {
    const face = m.faces[bd.f]
    const a2 = inner.get(bd.a)!
    const b2 = inner.get(bd.b) ?? bd.b
    const uvA = face.uv[bd.i]
    const uvB = face.uv[(bd.i + 1) % face.v.length]
    ring.push({ v: [bd.a, bd.b, b2, a2], uv: [uvA, uvB, uvB, uvA].map((u) => [u[0], u[1]] as Vec2), mat: face.mat, smooth: face.smooth })
  }
  for (const f of region) m.faces[f].v = m.faces[f].v.map((v) => inner.get(v) ?? v)
  m.faces.push(...ring)
  return m
}

/** Duplicates the selected faces (Shift+D). */
export function duplicateFaces(mesh: EditMesh, faceSel: Set<number>, mode: SelectMode): OpResult & { moved: number[] } {
  const m = cloneMesh(mesh)
  const map = new Map<number, number>()
  const created: number[] = []
  for (const fi of faceSel) {
    const f = m.faces[fi]
    if (!f) continue
    const v = f.v.map((i) => {
      let j = map.get(i)
      if (j === undefined) {
        j = m.verts.length
        map.set(i, j)
        m.verts.push([...m.verts[i]] as Vec3)
      }
      return j
    })
    created.push(m.faces.length)
    m.faces.push({ v, uv: f.uv.map((u) => [u[0], u[1]] as Vec2), mat: f.mat, smooth: f.smooth })
  }
  return { mesh: m, sel: selectFaces(m, created, mode), moved: [...map.values()] }
}

/** Removes faces that use any of `verts`, then unused vertices (X > Vertices). */
export function deleteVerts(mesh: EditMesh, verts: Set<number>): EditMesh {
  const m = cloneMesh(mesh)
  m.faces = m.faces.filter((f) => !f.v.some((v) => verts.has(v)))
  const kept = new Set<number>()
  for (const f of m.faces) for (const v of f.v) kept.add(v)
  // keep untouched loose vertices, drop the deleted ones
  const verts2: Vec3[] = []
  const remap: number[] = []
  m.verts.forEach((p, i) => {
    if (verts.has(i) && !kept.has(i)) remap[i] = -1
    else {
      remap[i] = verts2.length
      verts2.push(p)
    }
  })
  return { verts: verts2, faces: m.faces.map((f) => ({ ...f, v: f.v.map((v) => remap[v]) })) }
}

export function deleteEdges(mesh: EditMesh, edgeSel: Set<string>): EditMesh {
  const m = cloneMesh(mesh)
  m.faces = m.faces.filter((f) => {
    for (let i = 0; i < f.v.length; i++) if (edgeSel.has(edgeKey(f.v[i], f.v[(i + 1) % f.v.length]))) return false
    return true
  })
  return compact(m).mesh
}

export function deleteFaces(mesh: EditMesh, faceSel: Set<number>, keepVerts = false): EditMesh {
  const m = cloneMesh(mesh)
  m.faces = m.faces.filter((_, i) => !faceSel.has(i))
  return keepVerts ? m : compact(m).mesh
}

/** Welds vertex pairs and removes collapsed faces. `target[i]` is the vertex i becomes. */
function weld(mesh: EditMesh, target: number[]): EditMesh {
  const m = cloneMesh(mesh)
  const faces: Face[] = []
  for (const f of m.faces) {
    const v: number[] = []
    const uv: Vec2[] = []
    f.v.forEach((i, k) => {
      const t = target[i] ?? i
      if (v.length && v[v.length - 1] === t) return
      v.push(t)
      uv.push(f.uv[k])
    })
    while (v.length > 1 && v[0] === v[v.length - 1]) {
      v.pop()
      uv.pop()
    }
    if (new Set(v).size >= 3 && v.length >= 3) faces.push({ ...f, v, uv })
  }
  m.faces = faces
  return compact(m).mesh
}

/** Merge at centre (M > At Center). */
export function mergeAtCenter(mesh: EditMesh, verts: Set<number>, mode: SelectMode): OpResult {
  const list = [...verts]
  if (list.length < 2) return { mesh, sel: emptySelection() }
  const m = cloneMesh(mesh)
  const c = avg(list.map((v) => m.verts[v]))
  const keep = list[0]
  m.verts[keep] = c
  const target = m.verts.map((_, i) => (verts.has(i) ? keep : i))
  const res = weld(m, target)
  // find the merged vertex in the compacted mesh
  let idx = -1
  let best = Infinity
  res.verts.forEach((p, i) => {
    const d = len(sub(p, c))
    if (d < best) {
      best = d
      idx = i
    }
  })
  const sel = emptySelection()
  if (idx >= 0) sel.verts.add(idx)
  return { mesh: res, sel: flushSelection(res, sel, mode === 'vert' ? 'vert' : 'vert') }
}

/** Merge by distance / remove doubles. Returns how many vertices were removed. */
export function mergeByDistance(mesh: EditMesh, verts: Set<number> | null, distance: number): { mesh: EditMesh; removed: number } {
  const target = mesh.verts.map((_, i) => i)
  const cell = Math.max(distance, 1e-6)
  const grid = new Map<string, number[]>()
  const key = (p: Vec3) => `${Math.floor(p[0] / cell)},${Math.floor(p[1] / cell)},${Math.floor(p[2] / cell)}`
  mesh.verts.forEach((p, i) => {
    if (verts && !verts.has(i)) return
    const [cx, cy, cz] = [Math.floor(p[0] / cell), Math.floor(p[1] / cell), Math.floor(p[2] / cell)]
    let found = -1
    for (let dx = -1; dx <= 1 && found < 0; dx++)
      for (let dy = -1; dy <= 1 && found < 0; dy++)
        for (let dz = -1; dz <= 1 && found < 0; dz++) {
          for (const j of grid.get(`${cx + dx},${cy + dy},${cz + dz}`) ?? []) {
            if (len(sub(mesh.verts[j], p)) <= distance) {
              found = j
              break
            }
          }
        }
    if (found >= 0) target[i] = found
    else {
      const k = key(p)
      if (!grid.has(k)) grid.set(k, [])
      grid.get(k)!.push(i)
    }
  })
  const res = weld(mesh, target)
  return { mesh: res, removed: mesh.verts.length - res.verts.length }
}

/** Makes a face from the selected vertices (F). Boundary loops keep a consistent winding. */
export function fillFace(mesh: EditMesh, verts: Set<number>, mat: number, mode: SelectMode): OpResult | null {
  const list = [...verts]
  if (list.length < 3) return null
  const m = cloneMesh(mesh)
  const pts = list.map((v) => m.verts[v])
  const c = avg(pts)
  // best-fit normal from the selection's covariance-free Newell sum of the centroid fan
  let n: Vec3 = [0, 0, 0]
  const sorted0 = [...list]
  for (let i = 0; i < pts.length; i++) n = add(n, cross(sub(pts[i], c), sub(pts[(i + 1) % pts.length], c)))
  if (len(n) < 1e-9) n = [0, 0, 1]
  n = normalize(n)
  const ref = normalize(sub(pts[0], c))
  const ref2 = cross(n, ref)
  const angle = (v: number) => {
    const d = sub(m.verts[v], c)
    return Math.atan2(dot(d, ref2), dot(d, ref))
  }
  const ordered = sorted0.sort((a, b) => angle(a) - angle(b))
  // orientation: if an ordered pair is a boundary edge, the new face must run against it
  const edges = buildEdges(m)
  let flip = false
  for (let i = 0; i < ordered.length; i++) {
    const a = ordered[i]
    const b = ordered[(i + 1) % ordered.length]
    const e = edges.get(edgeKey(a, b))
    if (e && e.faces.length === 1) {
      const f = m.faces[e.faces[0].f]
      const s = f.v[e.faces[0].i]
      flip = s === a
      break
    }
  }
  if (flip) ordered.reverse()
  const face: Face = { v: ordered, uv: ordered.map(() => [0, 0] as Vec2), mat, smooth: false }
  m.faces.push(face)
  const nrm = faceNormal(m, face)
  face.uv = face.v.map((v) => boxUV(m.verts[v], nrm, 1))
  return { mesh: m, sel: selectFaces(m, [m.faces.length - 1], mode) }
}

/** Flips the winding of the selected faces (Mesh > Normals > Flip). */
export function flipFaces(mesh: EditMesh, faceSel: Iterable<number>): EditMesh {
  const m = cloneMesh(mesh)
  for (const fi of faceSel) {
    const f = m.faces[fi]
    if (!f) continue
    f.v.reverse()
    f.uv.reverse()
  }
  return m
}

/**
 * Recalculate outside (Shift+N): makes the winding of each connected piece consistent,
 * then orients it so closed volumes face outwards.
 */
export function recalcNormals(mesh: EditMesh, faceSel?: Set<number>): EditMesh {
  const m = cloneMesh(mesh)
  const edges = buildEdges(m)
  const visited = new Uint8Array(m.faces.length)
  const allowed = (f: number) => !faceSel || faceSel.has(f)
  for (let start = 0; start < m.faces.length; start++) {
    if (visited[start] || !allowed(start)) continue
    const comp: number[] = []
    const queue = [start]
    visited[start] = 1
    while (queue.length) {
      const f = queue.shift()!
      comp.push(f)
      const fv = m.faces[f].v
      for (let i = 0; i < fv.length; i++) {
        const a = fv[i]
        const b = fv[(i + 1) % fv.length]
        const e = edges.get(edgeKey(a, b))!
        for (const o of e.faces) {
          if (o.f === f || visited[o.f] || !allowed(o.f)) continue
          const ov = m.faces[o.f].v
          const oa = ov[o.i]
          // consistent neighbours traverse the shared edge in opposite directions
          if (oa === a) {
            m.faces[o.f].v.reverse()
            m.faces[o.f].uv.reverse()
          }
          visited[o.f] = 1
          queue.push(o.f)
        }
      }
      // the edge map indices refer to the original winding; rebuild after flips
    }
    // signed volume relative to the component centroid
    const c = avg(comp.flatMap((f) => m.faces[f].v.map((v) => m.verts[v])))
    let vol = 0
    for (const f of comp) {
      for (const [i, j, k] of triangulateFace(m, m.faces[f])) {
        const fv = m.faces[f].v
        const a = sub(m.verts[fv[i]], c)
        const b = sub(m.verts[fv[j]], c)
        const d = sub(m.verts[fv[k]], c)
        vol += dot(a, cross(b, d))
      }
    }
    if (vol < 0) for (const f of comp) {
      m.faces[f].v.reverse()
      m.faces[f].uv.reverse()
    }
  }
  return m
}

/** Sets smooth shading on faces. */
export function setSmooth(mesh: EditMesh, faces: Iterable<number>, smooth: boolean): EditMesh {
  const m = cloneMesh(mesh)
  for (const f of faces) if (m.faces[f]) m.faces[f].smooth = smooth
  return m
}

export function setMaterial(mesh: EditMesh, faces: Iterable<number>, mat: number): EditMesh {
  const m = cloneMesh(mesh)
  for (const f of faces) if (m.faces[f]) m.faces[f].mat = mat
  return m
}

/** Subdivide (one cut): splits edges at their midpoints and faces around a centre point. */
export function subdivide(mesh: EditMesh, faceSel: Set<number>, mode: SelectMode): OpResult {
  const m = cloneMesh(mesh)
  const mid = new Map<string, number>()
  const midpoint = (a: number, b: number) => {
    const k = edgeKey(a, b)
    let i = mid.get(k)
    if (i === undefined) {
      i = m.verts.length
      m.verts.push(lerp(m.verts[a], m.verts[b], 0.5))
      mid.set(k, i)
    }
    return i
  }
  const faces: Face[] = []
  const created: number[] = []
  m.faces.forEach((f, fi) => {
    if (!faceSel.has(fi)) return
    const n = f.v.length
    const mids = f.v.map((v, i) => midpoint(v, f.v[(i + 1) % n]))
    const muv = f.uv.map((u, i) => lerp2(u, f.uv[(i + 1) % n], 0.5))
    if (n === 3) {
      const [a, b, c] = f.v
      const [ab, bc, ca] = mids
      const [ua, ub, uc] = f.uv
      const [uab, ubc, uca] = muv
      faces.push({ ...f, v: [a, ab, ca], uv: [ua, uab, uca] })
      faces.push({ ...f, v: [ab, b, bc], uv: [uab, ub, ubc] })
      faces.push({ ...f, v: [ca, bc, c], uv: [uca, ubc, uc] })
      faces.push({ ...f, v: [ab, bc, ca], uv: [uab, ubc, uca] })
    } else {
      const center = m.verts.length
      m.verts.push(faceCenter(m, f))
      const cuv = avg2(f.uv)
      for (let i = 0; i < n; i++) {
        const prev = (i + n - 1) % n
        faces.push({ ...f, v: [f.v[i], mids[i], center, mids[prev]], uv: [f.uv[i], muv[i], cuv, muv[prev]] })
      }
    }
  })
  // unselected faces sharing a split edge get the midpoint inserted (no cracks)
  const kept: Face[] = []
  m.faces.forEach((f, fi) => {
    if (faceSel.has(fi)) return
    const v: number[] = []
    const uv: Vec2[] = []
    const n = f.v.length
    for (let i = 0; i < n; i++) {
      v.push(f.v[i])
      uv.push(f.uv[i])
      const k = edgeKey(f.v[i], f.v[(i + 1) % n])
      const mv = mid.get(k)
      if (mv !== undefined) {
        v.push(mv)
        uv.push(lerp2(f.uv[i], f.uv[(i + 1) % n], 0.5))
      }
    }
    kept.push({ ...f, v, uv })
  })
  const start = kept.length
  m.faces = [...kept, ...faces]
  for (let i = start; i < m.faces.length; i++) created.push(i)
  return { mesh: m, sel: selectFaces(m, created, mode) }
}

/** Loop cut (Ctrl+R) through the edge ring of `key`, with `cuts` evenly spaced cuts. */
export function loopCut(mesh: EditMesh, key: string, cuts = 1, factor = 0.5): OpResult | null {
  const { edges: ring } = edgeRing(mesh, key)
  if (!ring.length) return null
  const m = cloneMesh(mesh)
  const edges = buildEdges(m)
  // consistent direction along the ring: walk the quads and orient each ring edge
  const dir = new Map<string, [number, number]>()
  const [s0, s1] = edgeVerts(ring[0])
  dir.set(ring[0], [s0, s1])
  for (let r = 1; r < ring.length; r++) {
    const prevKey = ring[r - 1]
    const [pa, pb] = dir.get(prevKey)!
    const curKey = ring[r]
    // find a quad containing both edges
    const pf = edges.get(prevKey)!.faces.map((x) => x.f)
    const quad = pf.find((f) => {
      const fv = m.faces[f].v
      return fv.length === 4 && fv.some((v, i) => edgeKey(v, fv[(i + 1) % 4]) === curKey)
    })
    const [ca, cb] = edgeVerts(curKey)
    if (quad === undefined) {
      dir.set(curKey, [ca, cb])
      continue
    }
    const fv = m.faces[quad].v
    // pa and its neighbour on the current edge are adjacent in the quad
    const ia = fv.indexOf(pa)
    const na = fv[(ia + 1) % 4] === pb ? fv[(ia + 3) % 4] : fv[(ia + 1) % 4]
    dir.set(curKey, na === ca ? [ca, cb] : [cb, ca])
  }
  const ringSet = new Set(ring)
  // new vertices on every ring edge, from its first to its second vertex
  const cutVerts = new Map<string, number[]>()
  const fracs = Array.from({ length: cuts }, (_, i) => (cuts === 1 ? factor : (i + 1) / (cuts + 1)))
  for (const k of ring) {
    const [a, b] = dir.get(k)!
    cutVerts.set(
      k,
      fracs.map((t) => {
        m.verts.push(lerp(m.verts[a], m.verts[b], t))
        return m.verts.length - 1
      }),
    )
  }
  const alongEdge = (a: number, b: number) => {
    // new vertices on edge a->b in that order
    const k = edgeKey(a, b)
    const list = cutVerts.get(k)
    if (!list) return null
    const [da] = dir.get(k)!
    return da === a ? { verts: list, ts: fracs } : { verts: [...list].reverse(), ts: [...fracs].reverse().map((t) => 1 - t) }
  }
  const faces: Face[] = []
  const newEdgeKeys: string[] = []
  m.faces.forEach((f) => {
    const n = f.v.length
    const ringEdges: number[] = []
    for (let i = 0; i < n; i++) if (ringSet.has(edgeKey(f.v[i], f.v[(i + 1) % n]))) ringEdges.push(i)
    if (n === 4 && ringEdges.length === 2 && ringEdges[1] - ringEdges[0] === 2) {
      // split the quad into strips between its two ring edges
      const i = ringEdges[0]
      const a = f.v[i]
      const b = f.v[(i + 1) % 4]
      const c = f.v[(i + 2) % 4]
      const d = f.v[(i + 3) % 4]
      const ab = alongEdge(a, b)!
      const dc = alongEdge(d, c)!
      const ua = f.uv[i]
      const ub = f.uv[(i + 1) % 4]
      const uc = f.uv[(i + 2) % 4]
      const ud = f.uv[(i + 3) % 4]
      const left = [a, ...ab.verts, b]
      const right = [d, ...dc.verts, c]
      const luv = [ua, ...ab.ts.map((t) => lerp2(ua, ub, t)), ub]
      const ruv = [ud, ...dc.ts.map((t) => lerp2(ud, uc, t)), uc]
      for (let s = 0; s + 1 < left.length; s++) {
        faces.push({ ...f, v: [left[s], left[s + 1], right[s + 1], right[s]], uv: [luv[s], luv[s + 1], ruv[s + 1], ruv[s]] })
      }
      for (let s = 1; s + 1 < left.length; s++) newEdgeKeys.push(edgeKey(left[s], right[s]))
      return
    }
    if (!ringEdges.length) {
      faces.push(f)
      return
    }
    // other faces on a cut edge get the new vertices inserted
    const v: number[] = []
    const uv: Vec2[] = []
    for (let i = 0; i < n; i++) {
      v.push(f.v[i])
      uv.push(f.uv[i])
      const along = alongEdge(f.v[i], f.v[(i + 1) % n])
      if (along) {
        along.verts.forEach((nv, j) => {
          v.push(nv)
          uv.push(lerp2(f.uv[i], f.uv[(i + 1) % n], along.ts[j]))
        })
      }
    }
    faces.push({ ...f, v, uv })
  })
  m.faces = faces
  const sel = emptySelection()
  for (const k of newEdgeKeys) sel.edges.add(k)
  return { mesh: m, sel: flushSelection(m, sel, 'edge') }
}

/**
 * Merges faces joined by `inside` edges into one n-gon per connected region. Regions
 * whose outline is not a single loop (holes, bow ties) are left as they are.
 */
function dissolveRegions(mesh: EditMesh, seeds: Iterable<number>, inside: (key: string, e: EdgeInfo) => boolean): { mesh: EditMesh; remap: number[] } {
  const m = cloneMesh(mesh)
  const edges = buildEdges(m)
  const regionOf = new Map<number, number>()
  const regions: number[][] = []
  for (const seed of seeds) {
    if (!m.faces[seed] || regionOf.has(seed)) continue
    const region: number[] = []
    const stack = [seed]
    regionOf.set(seed, regions.length)
    while (stack.length) {
      const f = stack.pop()!
      region.push(f)
      const fv = m.faces[f].v
      for (let i = 0; i < fv.length; i++) {
        const k = edgeKey(fv[i], fv[(i + 1) % fv.length])
        const e = edges.get(k)!
        if (e.faces.length !== 2 || !inside(k, e)) continue
        for (const o of e.faces) {
          if (regionOf.has(o.f)) continue
          regionOf.set(o.f, regions.length)
          stack.push(o.f)
        }
      }
    }
    regions.push(region)
  }
  const removed = new Set<number>()
  const created: Face[] = []
  for (const region of regions) {
    if (region.length < 2) continue
    const inRegion = new Set(region)
    const next = new Map<number, { b: number; uv: Vec2 }>()
    let ok = true
    for (const f of region) {
      const face = m.faces[f]
      const n = face.v.length
      for (let i = 0; i < n && ok; i++) {
        const a = face.v[i]
        const b = face.v[(i + 1) % n]
        const k = edgeKey(a, b)
        const e = edges.get(k)!
        if (e.faces.length === 2 && e.faces.every((x) => inRegion.has(x.f)) && inside(k, e)) continue
        if (next.has(a)) ok = false
        next.set(a, { b, uv: face.uv[i] })
      }
    }
    if (!ok || next.size < 3) continue
    const start = next.keys().next().value as number
    const v: number[] = []
    const uv: Vec2[] = []
    let cur = start
    do {
      const step = next.get(cur)
      if (!step) {
        ok = false
        break
      }
      v.push(cur)
      uv.push(step.uv)
      cur = step.b
    } while (cur !== start && v.length <= next.size)
    if (!ok || cur !== start || v.length !== next.size) continue
    const first = m.faces[region[0]]
    created.push({ v, uv, mat: first.mat, smooth: first.smooth })
    for (const f of region) removed.add(f)
  }
  m.faces = [...m.faces.filter((_, i) => !removed.has(i)), ...created]
  return compact(m)
}

/** Drops the given vertices where they only join two edges (they add nothing to the shape). */
function removeValence2(mesh: EditMesh, verts: Iterable<number>): EditMesh {
  const degree = new Map<number, number>()
  for (const e of buildEdges(mesh).values()) {
    degree.set(e.a, (degree.get(e.a) ?? 0) + 1)
    degree.set(e.b, (degree.get(e.b) ?? 0) + 1)
  }
  const drop = new Set<number>()
  for (const v of verts) if (v >= 0 && degree.get(v) === 2) drop.add(v)
  if (!drop.size) return mesh
  const m = cloneMesh(mesh)
  for (const f of m.faces) {
    const keep = f.v.map((_, i) => i).filter((i) => !drop.has(f.v[i]))
    if (keep.length === f.v.length || keep.length < 3) continue
    f.uv = keep.map((i) => f.uv[i])
    f.v = keep.map((i) => f.v[i])
  }
  return compact(m).mesh
}

/** Merges the faces on each side of the selected edges (X > Dissolve Edges). */
export function dissolveEdges(mesh: EditMesh, edgeSel: Set<string>): EditMesh {
  const edges = buildEdges(mesh)
  const seeds: number[] = []
  const ends = new Set<number>()
  for (const k of edgeSel) {
    const e = edges.get(k)
    if (!e) continue
    for (const x of e.faces) seeds.push(x.f)
    ends.add(e.a)
    ends.add(e.b)
  }
  const res = dissolveRegions(mesh, seeds, (k) => edgeSel.has(k))
  return removeValence2(res.mesh, [...ends].map((v) => res.remap[v]))
}

/** Dissolves the selected faces into one n-gon per connected region with a single outline. */
export function dissolveFaces(mesh: EditMesh, faceSel: Set<number>): EditMesh {
  return dissolveRegions(mesh, faceSel, (_, e) => e.faces.every((x) => faceSel.has(x.f))).mesh
}

/** Removes vertices and merges the faces around each into one (X > Dissolve Vertices). */
export function dissolveVerts(mesh: EditMesh, verts: Set<number>): EditMesh {
  const edges = buildEdges(mesh)
  const seeds: number[] = []
  const inner = new Set<string>()
  for (const [k, e] of edges) {
    if (!verts.has(e.a) && !verts.has(e.b)) continue
    inner.add(k)
    for (const x of e.faces) seeds.push(x.f)
  }
  const res = dissolveRegions(mesh, seeds, (k) => inner.has(k))
  return removeValence2(res.mesh, [...verts].map((v) => res.remap[v]))
}

/** Separates `faces` into a new mesh (P > Selection). */
export function separate(mesh: EditMesh, faceSel: Set<number>): { rest: EditMesh; part: EditMesh } {
  const part = compact({ verts: mesh.verts, faces: mesh.faces.filter((_, i) => faceSel.has(i)) }).mesh
  const rest = compact({ verts: mesh.verts, faces: mesh.faces.filter((_, i) => !faceSel.has(i)) }).mesh
  return { rest: cloneMesh(rest), part: cloneMesh(part) }
}

/** Appends `b` to `a` (Ctrl+J), with b's material slots shifted by `matOffset`. */
export function joinMeshes(a: EditMesh, b: EditMesh, matMap: (slot: number) => number): EditMesh {
  const m = cloneMesh(a)
  const off = m.verts.length
  for (const v of b.verts) m.verts.push([...v] as Vec3)
  for (const f of b.faces) m.faces.push({ v: f.v.map((i) => i + off), uv: f.uv.map((u) => [u[0], u[1]] as Vec2), mat: matMap(f.mat), smooth: f.smooth })
  return m
}

/** Applies `fn` to the given vertices. */
export function transformVerts(mesh: EditMesh, verts: Iterable<number>, fn: (p: Vec3) => Vec3): EditMesh {
  const m = { verts: mesh.verts.slice(), faces: mesh.faces }
  for (const v of verts) if (m.verts[v]) m.verts[v] = fn(m.verts[v])
  return m
}

/** Mirrors the whole mesh on an axis and fixes the winding. */
export function mirrorMesh(mesh: EditMesh, axis: 0 | 1 | 2): EditMesh {
  const m = cloneMesh(mesh)
  for (const v of m.verts) v[axis] = -v[axis]
  return flipFaces(m, m.faces.map((_, i) => i))
}

/** Axis-aligned bounds of a mesh. */
export function meshBounds(mesh: EditMesh): { min: Vec3; max: Vec3 } {
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (const p of mesh.verts) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], p[k])
      max[k] = Math.max(max[k], p[k])
    }
  }
  if (!mesh.verts.length) return { min: [0, 0, 0], max: [0, 0, 0] }
  return { min, max }
}

export function meshStats(mesh: EditMesh) {
  let tris = 0
  for (const f of mesh.faces) tris += Math.max(0, f.v.length - 2)
  return { verts: mesh.verts.length, faces: mesh.faces.length, tris, edges: buildEdges(mesh).size }
}

/** Selected vertices for the current mode (what G/R/S move). */
export function selectedVerts(sel: MeshSelection): number[] {
  return [...sel.verts]
}

/** Splits the selected faces into triangles (Ctrl+T). */
export function triangulateFaces(mesh: EditMesh, faceSel: Set<number>): EditMesh {
  const m = cloneMesh(mesh)
  const faces: Face[] = []
  m.faces.forEach((f, fi) => {
    if (!faceSel.has(fi) || f.v.length <= 3) {
      faces.push(f)
      return
    }
    for (const [a, b, c] of triangulateFace(m, f)) faces.push({ ...f, v: [f.v[a], f.v[b], f.v[c]], uv: [f.uv[a], f.uv[b], f.uv[c]] })
  })
  m.faces = faces
  return m
}

/** Joins pairs of selected triangles into quads where they are nearly flat (Alt+J). */
export function trisToQuads(mesh: EditMesh, faceSel: Set<number>, maxAngle = 40): EditMesh {
  const m = cloneMesh(mesh)
  const edges = buildEdges(m)
  const limit = Math.cos((maxAngle * Math.PI) / 180)
  const candidates: { k: string; x: { f: number; i: number }; y: { f: number; i: number }; score: number }[] = []
  for (const [k, e] of edges) {
    if (e.faces.length !== 2) continue
    const [x, y] = e.faces
    if (x.f === y.f || !faceSel.has(x.f) || !faceSel.has(y.f)) continue
    const fa = m.faces[x.f]
    const fb = m.faces[y.f]
    if (fa.v.length !== 3 || fb.v.length !== 3 || fa.mat !== fb.mat) continue
    const c = dot(faceNormal(m, fa), faceNormal(m, fb))
    if (c < limit) continue
    // prefer long shared edges (the diagonal of the future quad)
    const [a, b] = edgeVerts(k)
    candidates.push({ k, x, y, score: c + len(sub(m.verts[a], m.verts[b])) * 1e-3 })
  }
  candidates.sort((p, q) => q.score - p.score)
  const used = new Set<number>()
  const merged: Face[] = []
  for (const c of candidates) {
    if (used.has(c.x.f) || used.has(c.y.f)) continue
    const fa = m.faces[c.x.f]
    const fb = m.faces[c.y.f]
    // fa = a b p (edge a->b at x.i), fb has b->a; quad: a, q, b, p  (q = fb's third vertex)
    const a = fa.v[c.x.i]
    const b = fa.v[(c.x.i + 1) % 3]
    const p = fa.v[(c.x.i + 2) % 3]
    const jq = fb.v.findIndex((v) => v !== a && v !== b)
    const q = fb.v[jq]
    const uvOf = (f: Face, v: number) => f.uv[f.v.indexOf(v)]
    const quad: Face = { ...fa, v: [a, q, b, p], uv: [uvOf(fa, a), uvOf(fb, q), uvOf(fa, b), uvOf(fa, p)] }
    // convexity check in the quad's plane
    const n = faceNormal(m, quad)
    let convex = true
    for (let i = 0; i < 4 && convex; i++) {
      const p0 = m.verts[quad.v[i]]
      const p1 = m.verts[quad.v[(i + 1) % 4]]
      const p2 = m.verts[quad.v[(i + 2) % 4]]
      if (dot(cross(sub(p1, p0), sub(p2, p1)), n) <= 1e-12) convex = false
    }
    if (!convex) continue
    used.add(c.x.f)
    used.add(c.y.f)
    merged.push(quad)
  }
  m.faces = [...m.faces.filter((_, i) => !used.has(i)), ...merged]
  return m
}

/** Moves the vertices towards the average of their neighbours (Smooth Vertices). */
export function smoothVerts(mesh: EditMesh, verts: Set<number>, factor = 0.5, repeat = 1): EditMesh {
  let m = cloneMesh(mesh)
  const edges = buildEdges(m)
  const nb: number[][] = m.verts.map(() => [])
  const boundaryNb: number[][] = m.verts.map(() => [])
  for (const e of edges.values()) {
    nb[e.a].push(e.b)
    nb[e.b].push(e.a)
    if (e.faces.length === 1) {
      boundaryNb[e.a].push(e.b)
      boundaryNb[e.b].push(e.a)
    }
  }
  for (let r = 0; r < repeat; r++) {
    const next = m.verts.map((p) => [...p] as Vec3)
    for (const v of verts) {
      const list = boundaryNb[v].length ? boundaryNb[v] : nb[v]
      if (!list.length) continue
      const c = avg(list.map((i) => m.verts[i]))
      next[v] = lerp(m.verts[v], c, factor)
    }
    m = { verts: next, faces: m.faces }
  }
  return m
}
