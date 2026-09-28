import { buildEdges, cross, dot, faceNormal, len, mergeByDistance, normalize, sub, triangulateFace } from '@/lib/modeler/mesh'
import type { BooleanOperation, EditMesh, Face, Vec2, Vec3 } from '@/lib/modeler/types'

/*
 * Constructive solid geometry with BSP trees, after Evan Wallace's csg.js (MIT). Solids are
 * lists of convex polygons; the result is welded back into a polygon mesh. Tree walks are
 * iterative so dense meshes do not overflow the call stack.
 */

const EPSILON = 1e-5
const COPLANAR = 0
const FRONT = 1
const BACK = 2
const SPANNING = 3

interface CVertex {
  pos: Vec3
  uv: Vec2
}

interface Shared {
  mat: number
  smooth: boolean
}

const cloneVertex = (v: CVertex): CVertex => ({ pos: [v.pos[0], v.pos[1], v.pos[2]], uv: [v.uv[0], v.uv[1]] })

function interpolate(a: CVertex, b: CVertex, t: number): CVertex {
  return {
    pos: [a.pos[0] + (b.pos[0] - a.pos[0]) * t, a.pos[1] + (b.pos[1] - a.pos[1]) * t, a.pos[2] + (b.pos[2] - a.pos[2]) * t],
    uv: [a.uv[0] + (b.uv[0] - a.uv[0]) * t, a.uv[1] + (b.uv[1] - a.uv[1]) * t],
  }
}

class Plane {
  normal: Vec3
  w: number
  constructor(normal: Vec3, w: number) {
    this.normal = normal
    this.w = w
  }
  clone() {
    return new Plane([this.normal[0], this.normal[1], this.normal[2]], this.w)
  }
  flip() {
    this.normal = [-this.normal[0], -this.normal[1], -this.normal[2]]
    this.w = -this.w
  }
  /** Sorts `polygon` into the lists, splitting it when it spans the plane. */
  split(polygon: Polygon, coplanarFront: Polygon[], coplanarBack: Polygon[], front: Polygon[], back: Polygon[]) {
    let type = 0
    const types: number[] = []
    for (const v of polygon.vertices) {
      const t = dot(this.normal, v.pos) - this.w
      const k = t < -EPSILON ? BACK : t > EPSILON ? FRONT : COPLANAR
      type |= k
      types.push(k)
    }
    if (type === COPLANAR) (dot(this.normal, polygon.plane.normal) > 0 ? coplanarFront : coplanarBack).push(polygon)
    else if (type === FRONT) front.push(polygon)
    else if (type === BACK) back.push(polygon)
    else {
      const f: CVertex[] = []
      const b: CVertex[] = []
      const n = polygon.vertices.length
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n
        const ti = types[i]
        const tj = types[j]
        const vi = polygon.vertices[i]
        const vj = polygon.vertices[j]
        if (ti !== BACK) f.push(vi)
        if (ti !== FRONT) b.push(ti !== BACK ? cloneVertex(vi) : vi)
        if ((ti | tj) === SPANNING) {
          const t = (this.w - dot(this.normal, vi.pos)) / dot(this.normal, sub(vj.pos, vi.pos))
          const v = interpolate(vi, vj, t)
          f.push(v)
          b.push(cloneVertex(v))
        }
      }
      if (f.length >= 3) front.push(new Polygon(f, polygon.shared, polygon.plane.clone()))
      if (b.length >= 3) back.push(new Polygon(b, polygon.shared, polygon.plane.clone()))
    }
  }
}

class Polygon {
  vertices: CVertex[]
  shared: Shared
  plane: Plane
  constructor(vertices: CVertex[], shared: Shared, plane: Plane) {
    this.vertices = vertices
    this.shared = shared
    this.plane = plane
  }
  clone() {
    return new Polygon(this.vertices.map(cloneVertex), this.shared, this.plane.clone())
  }
  flip() {
    this.vertices.reverse()
    this.plane.flip()
  }
}

class BspNode {
  plane: Plane | null = null
  front: BspNode | null = null
  back: BspNode | null = null
  polygons: Polygon[] = []

  nodes() {
    const out: BspNode[] = []
    const stack: BspNode[] = [this]
    while (stack.length) {
      const n = stack.pop()!
      out.push(n)
      if (n.front) stack.push(n.front)
      if (n.back) stack.push(n.back)
    }
    return out
  }

  invert() {
    for (const n of this.nodes()) {
      for (const p of n.polygons) p.flip()
      n.plane?.flip()
      const t = n.front
      n.front = n.back
      n.back = t
    }
  }

  /** The parts of `polygons` outside this solid. */
  clipPolygons(polygons: Polygon[]) {
    const result: Polygon[] = []
    const stack: [BspNode, Polygon[]][] = [[this, polygons]]
    while (stack.length) {
      const [node, polys] = stack.pop()!
      if (!node.plane) {
        result.push(...polys)
        continue
      }
      const front: Polygon[] = []
      const back: Polygon[] = []
      for (const p of polys) node.plane.split(p, front, back, front, back)
      if (node.front) stack.push([node.front, front])
      else result.push(...front)
      if (node.back) stack.push([node.back, back])
    }
    return result
  }

  clipTo(bsp: BspNode) {
    for (const n of this.nodes()) n.polygons = bsp.clipPolygons(n.polygons)
  }

  allPolygons() {
    return this.nodes().flatMap((n) => n.polygons)
  }

  build(polygons: Polygon[]) {
    const stack: [BspNode, Polygon[]][] = [[this, polygons]]
    while (stack.length) {
      const [node, polys] = stack.pop()!
      if (!polys.length) continue
      if (!node.plane) node.plane = polys[0].plane.clone()
      const front: Polygon[] = []
      const back: Polygon[] = []
      for (const p of polys) node.plane.split(p, node.polygons, node.polygons, front, back)
      if (front.length) stack.push([(node.front ??= new BspNode()), front])
      if (back.length) stack.push([(node.back ??= new BspNode()), back])
    }
  }
}

function isConvex(mesh: EditMesh, f: Face, n: Vec3) {
  const k = f.v.length
  for (let i = 0; i < k; i++) {
    const a = mesh.verts[f.v[i]]
    const b = mesh.verts[f.v[(i + 1) % k]]
    const c = mesh.verts[f.v[(i + 2) % k]]
    if (dot(cross(sub(b, a), sub(c, b)), n) < -1e-9) return false
  }
  return true
}

function toPolygons(mesh: EditMesh, mat?: number): Polygon[] {
  const out: Polygon[] = []
  for (const f of mesh.faces) {
    if (f.v.length < 3) continue
    const n = faceNormal(mesh, f)
    if (n[0] === 0 && n[1] === 0 && n[2] === 0) continue
    const shared: Shared = { mat: mat ?? f.mat, smooth: f.smooth }
    const vert = (i: number): CVertex => ({ pos: [...mesh.verts[f.v[i]]] as Vec3, uv: [f.uv[i]?.[0] ?? 0, f.uv[i]?.[1] ?? 0] })
    const loops: number[][] = isConvex(mesh, f, n) ? [f.v.map((_, i) => i)] : triangulateFace(mesh, f)
    for (const loop of loops) {
      const vs = loop.map(vert)
      const pn = normalize(cross(sub(vs[1].pos, vs[0].pos), sub(vs[2].pos, vs[0].pos)))
      const plane = loop.length === 3 && (pn[0] || pn[1] || pn[2]) ? new Plane(pn, dot(pn, vs[0].pos)) : new Plane(n, dot(n, vs[0].pos))
      out.push(new Polygon(vs, shared, plane))
    }
  }
  return out
}

/**
 * BSP splits leave T-junctions (a vertex of one polygon in the middle of a neighbour's
 * edge). Inserting those vertices into the long edges makes the result a closed mesh again.
 */
function fixTJunctions(mesh: EditMesh): EditMesh {
  const open: [number, number][] = []
  for (const e of buildEdges(mesh).values()) if (e.faces.length === 1) open.push([e.a, e.b])
  if (!open.length) return mesh
  const onBoundary = new Set<number>()
  for (const [a, b] of open) {
    onBoundary.add(a)
    onBoundary.add(b)
  }
  const cell = 0.05
  const grid = new Map<string, number[]>()
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`
  for (const v of onBoundary) {
    const p = mesh.verts[v]
    const k = key(Math.floor(p[0] / cell), Math.floor(p[1] / cell), Math.floor(p[2] / cell))
    let list = grid.get(k)
    if (!list) grid.set(k, (list = []))
    list.push(v)
  }
  const inner = (a: number, b: number) => {
    const A = mesh.verts[a]
    const B = mesh.verts[b]
    const d = sub(B, A)
    const l = len(d)
    if (l < 1e-9) return []
    const found: { v: number; t: number }[] = []
    const lo = [0, 1, 2].map((k) => Math.floor((Math.min(A[k], B[k]) - 1e-5) / cell))
    const hi = [0, 1, 2].map((k) => Math.floor((Math.max(A[k], B[k]) + 1e-5) / cell))
    if ((hi[0] - lo[0] + 1) * (hi[1] - lo[1] + 1) * (hi[2] - lo[2] + 1) > 20000) return []
    for (let x = lo[0]; x <= hi[0]; x++)
      for (let y = lo[1]; y <= hi[1]; y++)
        for (let z = lo[2]; z <= hi[2]; z++)
          for (const v of grid.get(key(x, y, z)) ?? []) {
            if (v === a || v === b) continue
            const P = sub(mesh.verts[v], A)
            const t = dot(P, d) / (l * l)
            if (t <= 1e-6 || t >= 1 - 1e-6) continue
            const off = sub(P, [d[0] * t, d[1] * t, d[2] * t])
            if (len(off) < 1e-5) found.push({ v, t })
          }
    return found.sort((p, q) => p.t - q.t)
  }
  const openSet = new Set(open.map(([a, b]) => (a < b ? `${a}:${b}` : `${b}:${a}`)))
  const faces = mesh.faces.map((f) => {
    const v: number[] = []
    const uv: Vec2[] = []
    const n = f.v.length
    for (let i = 0; i < n; i++) {
      const a = f.v[i]
      const b = f.v[(i + 1) % n]
      v.push(a)
      uv.push(f.uv[i])
      if (!openSet.has(a < b ? `${a}:${b}` : `${b}:${a}`)) continue
      const ua = f.uv[i]
      const ub = f.uv[(i + 1) % n]
      for (const x of inner(a, b)) {
        v.push(x.v)
        uv.push([ua[0] + (ub[0] - ua[0]) * x.t, ua[1] + (ub[1] - ua[1]) * x.t])
      }
    }
    return { ...f, v, uv }
  })
  return { verts: mesh.verts, faces }
}

function fromPolygons(polygons: Polygon[]): EditMesh {
  const mesh: EditMesh = { verts: [], faces: [] }
  for (const p of polygons) {
    const start = mesh.verts.length
    for (const v of p.vertices) mesh.verts.push(v.pos)
    mesh.faces.push({ v: p.vertices.map((_, i) => start + i), uv: p.vertices.map((v) => v.uv), mat: p.shared.mat, smooth: p.shared.smooth })
  }
  return fixTJunctions(mergeByDistance(mesh, null, 1e-5).mesh)
}

/** The material slot used by most faces (cut faces from the other operand take it). */
function mainMaterial(mesh: EditMesh) {
  const count = new Map<number, number>()
  for (const f of mesh.faces) count.set(f.mat, (count.get(f.mat) ?? 0) + 1)
  let best = 0
  let n = -1
  for (const [mat, c] of count) {
    if (c > n) {
      n = c
      best = mat
    }
  }
  return best
}

/** Boolean of two closed meshes in the same space. `a` keeps its materials. */
export function booleanMeshes(a: EditMesh, b: EditMesh, op: BooleanOperation): EditMesh {
  const A = new BspNode()
  const B = new BspNode()
  A.build(toPolygons(a))
  B.build(toPolygons(b, mainMaterial(a)))
  if (op === 'union') {
    A.clipTo(B)
    B.clipTo(A)
    B.invert()
    B.clipTo(A)
    B.invert()
    A.build(B.allPolygons())
  } else if (op === 'difference') {
    A.invert()
    A.clipTo(B)
    B.clipTo(A)
    B.invert()
    B.clipTo(A)
    B.invert()
    A.build(B.allPolygons())
    A.invert()
  } else {
    A.invert()
    B.clipTo(A)
    B.invert()
    A.clipTo(B)
    B.clipTo(A)
    A.build(B.allPolygons())
    A.invert()
  }
  return fromPolygons(A.allPolygons().map((p) => p.clone()))
}
