import { booleanMeshes } from '@/lib/modeler/csg'
import {
  add,
  avg,
  buildEdges,
  cloneMesh,
  cross,
  dissolveEdges,
  dot,
  edgeKey,
  faceArea,
  faceNormal,
  flipFaces,
  len,
  lerp,
  lerp2,
  mergeByDistance,
  meshBounds,
  normalize,
  scale,
  smoothVerts,
  sub,
  triangulateFace,
  triangulateFaces,
} from '@/lib/modeler/mesh'
import type { DeformMode, EditMesh, Face, Modifier, Vec2, Vec3 } from '@/lib/modeler/types'

/* Non-destructive modifiers, evaluated top to bottom like Blender's stack. */

export interface ModifierContext {
  /** Another object's evaluated mesh in the modified object's local space (boolean targets). */
  resolve: (id: string) => EditMesh | null
}

/** Keeps a runaway stack (huge arrays of subdivided meshes) from freezing the page. */
const MAX_FACES = 400000

export function applyModifiers(mesh: EditMesh, modifiers: Modifier[], ctx?: ModifierContext): EditMesh {
  let m = mesh
  for (const mod of modifiers) {
    if (!mod.enabled) continue
    if (m.faces.length > MAX_FACES) break
    switch (mod.kind) {
      case 'mirror':
        m = mirrorModifier(m, mod.axes, mod.mergeDistance)
        break
      case 'array':
        m = arrayModifier(m, mod.count, mod.relative, mod.constant)
        break
      case 'radial':
        m = radialArray(m, mod.count, mod.angle, mod.axis)
        break
      case 'subsurf':
        for (let i = 0; i < Math.min(3, mod.levels) && m.faces.length * 4 <= MAX_FACES; i++) m = catmullClark(m)
        break
      case 'solidify':
        m = solidify(m, mod.thickness)
        break
      case 'bevel':
        m = bevel(m, mod.width, mod.angle)
        break
      case 'boolean': {
        const other = mod.target && ctx ? ctx.resolve(mod.target) : null
        if (other && other.faces.length && m.faces.length) {
          try {
            m = booleanMeshes(m, other, mod.operation)
          } catch {
            /* degenerate input: leave the mesh as it is */
          }
        }
        break
      }
      case 'decimate':
        m = mod.mode === 'planar' ? planarDecimate(m, mod.angle) : collapseDecimate(m, mod.ratio)
        break
      case 'triangulate':
        m = triangulateFaces(m, new Set(m.faces.map((_, i) => i)))
        break
      case 'weld':
        m = mergeByDistance(m, null, Math.max(1e-6, mod.distance)).mesh
        break
      case 'wireframe':
        m = wireframe(m, mod.thickness)
        break
      case 'smooth':
        m = smoothVerts(m, new Set(m.verts.map((_, i) => i)), mod.factor, Math.max(1, Math.min(50, Math.round(mod.repeat))))
        break
      case 'displace':
        m = displace(m, mod.strength, mod.size, mod.seed)
        break
      case 'deform':
        m = simpleDeform(m, mod.mode, mod.factor, mod.axis)
        break
      case 'cast':
        m = cast(m, mod.shape, mod.factor)
        break
    }
  }
  return m
}

export function mirrorModifier(mesh: EditMesh, axes: [boolean, boolean, boolean], mergeDistance: number): EditMesh {
  let m = mesh
  for (let axis = 0 as 0 | 1 | 2; axis < 3; axis = (axis + 1) as 0 | 1 | 2) {
    if (!axes[axis]) continue
    const src = cloneMesh(m)
    const count = src.verts.length
    // vertices on the mirror plane are shared by both halves
    const copy: number[] = []
    for (let i = 0; i < count; i++) {
      const v = src.verts[i]
      if (Math.abs(v[axis]) <= mergeDistance) {
        v[axis] = 0
        copy[i] = i
      } else {
        copy[i] = src.verts.length
        const p: Vec3 = [v[0], v[1], v[2]]
        p[axis] = -p[axis]
        src.verts.push(p)
      }
    }
    for (const f of m.faces) {
      // a face lying on the plane would only be doubled
      if (f.v.every((i) => copy[i] === i)) continue
      src.faces.push({ ...f, v: f.v.map((i) => copy[i]).reverse(), uv: f.uv.map((u) => [u[0], u[1]] as Vec2).reverse() })
    }
    m = src
  }
  return m
}

export function arrayModifier(mesh: EditMesh, count: number, relative: Vec3, constant: Vec3): EditMesh {
  const n = Math.max(1, Math.min(64, Math.round(count)))
  if (n === 1) return mesh
  const { min, max } = meshBounds(mesh)
  const size = sub(max, min)
  const step: Vec3 = [relative[0] * size[0] + constant[0], relative[1] * size[1] + constant[1], relative[2] * size[2] + constant[2]]
  const out: EditMesh = { verts: [], faces: [] }
  for (let c = 0; c < n; c++) {
    const off = out.verts.length
    const d = scale(step, c)
    for (const v of mesh.verts) out.verts.push(add(v, d))
    for (const f of mesh.faces) out.faces.push({ ...f, v: f.v.map((i) => i + off), uv: f.uv.map((u) => [u[0], u[1]] as Vec2) })
  }
  return out
}

/** One level of Catmull-Clark subdivision; boundaries follow the usual crease rules. */
export function catmullClark(mesh: EditMesh): EditMesh {
  const edges = buildEdges(mesh)
  const fp = mesh.faces.map((f) => avg(f.v.map((i) => mesh.verts[i])))
  const verts: Vec3[] = []
  // edge points
  const edgeIndex = new Map<string, number>()
  const boundaryVert = new Uint8Array(mesh.verts.length)
  for (const [k, e] of edges) {
    const a = mesh.verts[e.a]
    const b = mesh.verts[e.b]
    let p: Vec3
    if (e.faces.length === 2) p = scale(add(add(a, b), add(fp[e.faces[0].f], fp[e.faces[1].f])), 0.25)
    else {
      p = scale(add(a, b), 0.5)
      boundaryVert[e.a] = 1
      boundaryVert[e.b] = 1
    }
    edgeIndex.set(k, 0)
    verts.push(p)
    edgeIndex.set(k, verts.length - 1)
  }
  // vertex points
  const vFaces: number[][] = mesh.verts.map(() => [])
  mesh.faces.forEach((f, fi) => f.v.forEach((v) => vFaces[v].push(fi)))
  const vEdges: string[][] = mesh.verts.map(() => [])
  for (const [k, e] of edges) {
    vEdges[e.a].push(k)
    vEdges[e.b].push(k)
  }
  const vertIndex: number[] = []
  mesh.verts.forEach((p, i) => {
    let np: Vec3
    const ek = vEdges[i]
    if (boundaryVert[i]) {
      const be = ek.filter((k) => edges.get(k)!.faces.length !== 2)
      if (be.length === 2) {
        const others = be.map((k) => {
          const e = edges.get(k)!
          return mesh.verts[e.a === i ? e.b : e.a]
        })
        np = add(scale(p, 0.75), scale(add(others[0], others[1]), 0.125))
      } else np = p
    } else if (vFaces[i].length >= 3) {
      const n = vFaces[i].length
      const F = avg(vFaces[i].map((f) => fp[f]))
      const R = avg(
        ek.map((k) => {
          const e = edges.get(k)!
          return scale(add(mesh.verts[e.a], mesh.verts[e.b]), 0.5)
        }),
      )
      np = scale(add(add(F, scale(R, 2)), scale(p, n - 3)), 1 / n)
    } else np = p
    vertIndex[i] = verts.length
    verts.push(np)
  })
  const faceIndex = fp.map((p) => {
    verts.push(p)
    return verts.length - 1
  })
  const faces: Face[] = []
  mesh.faces.forEach((f, fi) => {
    const n = f.v.length
    const cuv: Vec2 = [f.uv.reduce((s, u) => s + u[0], 0) / n, f.uv.reduce((s, u) => s + u[1], 0) / n]
    for (let i = 0; i < n; i++) {
      const prev = (i + n - 1) % n
      const next = (i + 1) % n
      const eNext = edgeIndex.get(edgeKey(f.v[i], f.v[next]))!
      const ePrev = edgeIndex.get(edgeKey(f.v[prev], f.v[i]))!
      faces.push({
        v: [vertIndex[f.v[i]], eNext, faceIndex[fi], ePrev],
        uv: [f.uv[i], lerp2(f.uv[i], f.uv[next], 0.5), cuv, lerp2(f.uv[prev], f.uv[i], 0.5)],
        mat: f.mat,
        smooth: f.smooth,
      })
    }
  })
  return { verts, faces }
}

/** Gives surfaces a thickness: an inward offset copy plus rim faces on open edges. */
export function solidify(mesh: EditMesh, thickness: number): EditMesh {
  if (Math.abs(thickness) < 1e-6) return mesh
  const m = cloneMesh(mesh)
  const normals: Vec3[] = m.verts.map(() => [0, 0, 0])
  for (const f of m.faces) {
    const n = scale(faceNormal(m, f), faceArea(m, f))
    for (const v of f.v) normals[v] = add(normals[v], n)
  }
  const n0 = m.verts.length
  for (let i = 0; i < n0; i++) m.verts.push(sub(m.verts[i], scale(normalize(normals[i]), thickness)))
  const inner = flipFaces({ verts: m.verts, faces: m.faces.map((f) => ({ ...f, v: f.v.map((v) => v + n0) })) }, m.faces.map((_, i) => i)).faces
  const edges = buildEdges(m)
  const rims: Face[] = []
  for (const e of edges.values()) {
    if (e.faces.length !== 1) continue
    const { f, i } = e.faces[0]
    const face = m.faces[f]
    const a = face.v[i]
    const b = face.v[(i + 1) % face.v.length]
    const ua = face.uv[i]
    const ub = face.uv[(i + 1) % face.v.length]
    rims.push({ v: [b, a, a + n0, b + n0], uv: [ub, ua, ua, ub].map((u) => [u[0], u[1]] as Vec2), mat: face.mat, smooth: false })
  }
  m.faces = [...m.faces, ...inner, ...rims]
  return m
}

/** Copies rotated around an axis through the origin. */
export function radialArray(mesh: EditMesh, count: number, angleDeg: number, axis: 0 | 1 | 2): EditMesh {
  const n = Math.max(1, Math.min(128, Math.round(count)))
  if (n === 1) return mesh
  const full = Math.abs(Math.abs(angleDeg) - 360) < 1e-6
  const step = ((angleDeg * Math.PI) / 180) / (full ? n : n - 1)
  const [i0, i1] = axis === 0 ? [1, 2] : axis === 1 ? [2, 0] : [0, 1]
  const out: EditMesh = { verts: [], faces: [] }
  for (let c = 0; c < n; c++) {
    const off = out.verts.length
    const cos = Math.cos(step * c)
    const sin = Math.sin(step * c)
    for (const v of mesh.verts) {
      const p: Vec3 = [v[0], v[1], v[2]]
      p[i0] = v[i0] * cos - v[i1] * sin
      p[i1] = v[i0] * sin + v[i1] * cos
      out.verts.push(p)
    }
    for (const f of mesh.faces) out.faces.push({ ...f, v: f.v.map((i) => i + off), uv: f.uv.map((u) => [u[0], u[1]] as Vec2) })
  }
  return out
}

/**
 * One-segment bevel (chamfer) of the edges whose faces meet at more than `angleDeg`.
 * Faces shrink away from beveled edges, each beveled edge becomes a strip, and corners
 * where three or more strips meet get a cap polygon.
 */
export function bevel(mesh: EditMesh, width: number, angleDeg: number): EditMesh {
  if (!(width > 0) || !mesh.faces.length) return mesh
  const { verts, faces } = mesh
  const normals = faces.map((f) => faceNormal(mesh, f))
  const edges = buildEdges(mesh)
  const cosLimit = Math.cos((Math.max(0, Math.min(180, angleDeg)) * Math.PI) / 180)
  const beveled = new Set<string>()
  for (const [k, e] of edges) {
    if (e.faces.length !== 2) continue
    const [x, y] = e.faces
    if (x.f === y.f || faces[x.f].v[x.i] === faces[y.f].v[y.i]) continue
    if (dot(normals[x.f], normals[y.f]) < cosLimit - 1e-9) beveled.add(k)
  }
  if (!beveled.size) return mesh
  // no wider than just under half the shortest edge next to a bevel (no overlaps)
  const touched = new Set<number>()
  for (const k of beveled) {
    const e = edges.get(k)!
    touched.add(e.a)
    touched.add(e.b)
  }
  let shortest = Infinity
  for (const e of edges.values()) if (touched.has(e.a) || touched.has(e.b)) shortest = Math.min(shortest, len(sub(verts[e.a], verts[e.b])))
  const w = Math.min(width, shortest * 0.45)
  if (!(w > 1e-7)) return mesh

  // one slot per face corner, moved away from the beveled edges of that face
  const slotOf: number[][] = []
  const slots: Vec3[] = []
  faces.forEach((f, fi) => {
    const n = f.v.length
    const nrm = normals[fi]
    slotOf.push(
      f.v.map((v, i) => {
        const u = f.v[(i + n - 1) % n]
        const nx = f.v[(i + 1) % n]
        const P = verts[v]
        const d1 = normalize(sub(verts[u], P))
        const d2 = normalize(sub(verts[nx], P))
        const n1 = normalize(cross(nrm, scale(d1, -1)))
        const n2 = normalize(cross(nrm, d2))
        const o1 = beveled.has(edgeKey(u, v)) ? w : 0
        const o2 = beveled.has(edgeKey(v, nx)) ? w : 0
        const s1 = dot(d2, n1)
        const s2 = dot(d1, n2)
        const y = o1 && Math.abs(s1) > 1e-6 ? o1 / s1 : 0
        const x = o2 && Math.abs(s2) > 1e-6 ? o2 / s2 : 0
        slots.push(add(P, add(scale(d1, x), scale(d2, y))))
        return slots.length - 1
      }),
    )
  })
  // corners of neighbouring faces across a sharp-free edge stay one vertex
  const parent = slots.map((_, i) => i)
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]]
      i = parent[i]
    }
    return i
  }
  const union = (a: number, b: number) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[ra] = rb
  }
  const directed = new Map<string, { f: number; i: number }>()
  faces.forEach((f, fi) => f.v.forEach((v, i) => directed.set(`${v}>${f.v[(i + 1) % f.v.length]}`, { f: fi, i })))
  faces.forEach((f, fi) => {
    const n = f.v.length
    for (let i = 0; i < n; i++) {
      const a = f.v[i]
      const b = f.v[(i + 1) % n]
      if (beveled.has(edgeKey(a, b))) continue
      const o = directed.get(`${b}>${a}`)
      if (!o) continue
      const m = faces[o.f].v.length
      union(slotOf[fi][i], slotOf[o.f][(o.i + 1) % m])
      union(slotOf[fi][(i + 1) % n], slotOf[o.f][o.i])
    }
  })
  const index = new Map<number, number>()
  const sum: Vec3[] = []
  const count: number[] = []
  const vid = (slot: number) => {
    const r = find(slot)
    let i = index.get(r)
    if (i === undefined) {
      i = sum.length
      index.set(r, i)
      sum.push([0, 0, 0])
      count.push(0)
    }
    return i
  }
  slots.forEach((p, s) => {
    const i = vid(s)
    sum[i] = add(sum[i], p)
    count[i]++
  })
  const out: EditMesh = { verts: sum.map((p, i) => scale(p, 1 / count[i])), faces: [] }
  faces.forEach((f, fi) => out.faces.push({ ...f, v: slotOf[fi].map(vid), uv: f.uv.map((u) => [u[0], u[1]] as Vec2) }))
  // strips along beveled edges
  for (const k of beveled) {
    const [x, y] = edges.get(k)!.faces
    const F = faces[x.f]
    const G = faces[y.f]
    const fa = slotOf[x.f][x.i]
    const fb = slotOf[x.f][(x.i + 1) % F.v.length]
    const gb = slotOf[y.f][y.i]
    const ga = slotOf[y.f][(y.i + 1) % G.v.length]
    out.faces.push({
      v: [vid(fb), vid(fa), vid(ga), vid(gb)],
      uv: [F.uv[(x.i + 1) % F.v.length], F.uv[x.i], G.uv[(y.i + 1) % G.v.length], G.uv[y.i]].map((u) => [u?.[0] ?? 0, u?.[1] ?? 0] as Vec2),
      mat: F.mat,
      smooth: F.smooth && G.smooth,
    })
  }
  // corner caps: walk the faces around each vertex
  const corners: { f: number; i: number }[][] = verts.map(() => [])
  faces.forEach((f, fi) => f.v.forEach((v, i) => corners[v].push({ f: fi, i })))
  verts.forEach((_, v) => {
    const list = corners[v]
    if (list.length < 3) return
    let hasBevel = false
    for (const c of list) {
      const f = faces[c.f]
      if (beveled.has(edgeKey(v, f.v[(c.i + 1) % f.v.length]))) hasBevel = true
    }
    if (!hasBevel) return
    const ring: { f: number; i: number }[] = []
    let cur = list[0]
    for (let guard = 0; guard <= list.length; guard++) {
      ring.push(cur)
      const f = faces[cur.f]
      const next = f.v[(cur.i + 1) % f.v.length]
      const o = directed.get(`${next}>${v}`)
      if (!o) return // open fan: nothing to cap
      const g = faces[o.f]
      cur = { f: o.f, i: (o.i + 1) % g.v.length }
      if (cur.f === ring[0].f && cur.i === ring[0].i) break
    }
    if (cur.f !== ring[0].f || cur.i !== ring[0].i) return
    const ids: number[] = []
    const uvs: Vec2[] = []
    for (const c of ring) {
      const id = vid(slotOf[c.f][c.i])
      if (ids.length && ids[ids.length - 1] === id) continue
      ids.push(id)
      const u = faces[c.f].uv[c.i]
      uvs.push([u?.[0] ?? 0, u?.[1] ?? 0])
    }
    while (ids.length > 1 && ids[0] === ids[ids.length - 1]) {
      ids.pop()
      uvs.pop()
    }
    if (ids.length < 3) return
    const cap: Face = { v: ids, uv: uvs, mat: faces[ring[0].f].mat, smooth: false }
    let vn: Vec3 = [0, 0, 0]
    for (const c of ring) vn = add(vn, normals[c.f])
    if (dot(faceNormal(out, cap), vn) < 0) {
      cap.v.reverse()
      cap.uv.reverse()
    }
    out.faces.push(cap)
  })
  return out
}

/** Vertex clustering down to about `ratio` of the vertices (Decimate > Collapse). */
export function collapseDecimate(mesh: EditMesh, ratio: number): EditMesh {
  const r = Math.max(0.01, Math.min(1, ratio))
  if (r >= 0.999 || mesh.verts.length < 8) return mesh
  const target = Math.max(4, Math.round(mesh.verts.length * r))
  const { min, max } = meshBounds(mesh)
  const diag = Math.max(1e-6, len(sub(max, min)))
  const clusterOf = (cell: number) => {
    const ids = new Map<string, number>()
    const map = mesh.verts.map((p) => {
      const key = `${Math.floor((p[0] - min[0]) / cell)},${Math.floor((p[1] - min[1]) / cell)},${Math.floor((p[2] - min[2]) / cell)}`
      let id = ids.get(key)
      if (id === undefined) {
        id = ids.size
        ids.set(key, id)
      }
      return id
    })
    return { map, count: ids.size }
  }
  // binary search the cell size that gives about `target` clusters
  let lo = diag / 2000
  let hi = diag
  let best = clusterOf(hi)
  for (let it = 0; it < 18; it++) {
    const mid = Math.sqrt(lo * hi)
    const c = clusterOf(mid)
    if (c.count > target) lo = mid
    else {
      hi = mid
      best = c
    }
  }
  const sum: Vec3[] = Array.from({ length: best.count }, () => [0, 0, 0] as Vec3)
  const n = new Array(best.count).fill(0)
  mesh.verts.forEach((p, i) => {
    const c = best.map[i]
    sum[c] = add(sum[c], p)
    n[c]++
  })
  const out: EditMesh = { verts: sum.map((p, i) => scale(p, 1 / Math.max(1, n[i]))), faces: [] }
  const seen = new Set<string>()
  for (const f of mesh.faces) {
    for (const [a, b, c] of triangulateFace(mesh, f)) {
      const t = [best.map[f.v[a]], best.map[f.v[b]], best.map[f.v[c]]]
      if (t[0] === t[1] || t[1] === t[2] || t[0] === t[2]) continue
      const key = [...t].sort((x, y) => x - y).join(',')
      if (seen.has(key)) continue
      seen.add(key)
      out.faces.push({ v: t, uv: [f.uv[a], f.uv[b], f.uv[c]].map((u) => [u?.[0] ?? 0, u?.[1] ?? 0] as Vec2), mat: f.mat, smooth: f.smooth })
    }
  }
  return out
}

/** Merges neighbouring faces that are flatter than `angleDeg` into n-gons (Decimate > Planar). */
export function planarDecimate(mesh: EditMesh, angleDeg: number): EditMesh {
  const normals = mesh.faces.map((f) => faceNormal(mesh, f))
  const limit = Math.cos((Math.max(0, Math.min(90, angleDeg)) * Math.PI) / 180)
  const flat = new Set<string>()
  for (const [k, e] of buildEdges(mesh)) {
    if (e.faces.length !== 2) continue
    const [x, y] = e.faces
    if (mesh.faces[x.f].mat !== mesh.faces[y.f].mat) continue
    if (dot(normals[x.f], normals[y.f]) >= limit - 1e-9) flat.add(k)
  }
  return flat.size ? dissolveEdges(mesh, flat) : mesh
}

/** Replaces every edge with a square beam of `thickness` (fences, grilles, cages). */
export function wireframe(mesh: EditMesh, thickness: number): EditMesh {
  const t = Math.max(0.001, thickness)
  const h = t / 2
  const normals = mesh.faces.map((f) => faceNormal(mesh, f))
  const out: EditMesh = { verts: [], faces: [] }
  for (const e of buildEdges(mesh).values()) {
    const a = mesh.verts[e.a]
    const b = mesh.verts[e.b]
    const d = normalize(sub(b, a))
    if (!d[0] && !d[1] && !d[2]) continue
    let up: Vec3 = [0, 0, 0]
    for (const x of e.faces) up = add(up, normals[x.f])
    up = sub(up, scale(d, dot(up, d)))
    if (len(up) < 1e-6) up = Math.abs(d[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]
    up = normalize(sub(up, scale(d, dot(up, d))))
    const side = normalize(cross(d, up))
    const A = sub(a, scale(d, h))
    const B = add(b, scale(d, h))
    const ring = (p: Vec3) => [add(add(p, scale(side, h)), scale(up, h)), add(sub(p, scale(side, h)), scale(up, h)), sub(sub(p, scale(side, h)), scale(up, h)), sub(add(p, scale(side, h)), scale(up, h))]
    const o = out.verts.length
    out.verts.push(...ring(A), ...ring(B))
    const mat = mesh.faces[e.faces[0]?.f ?? 0]?.mat ?? 0
    const quad = (v: number[]): Face => ({ v: v.map((i) => i + o), uv: [[0, 0], [1, 0], [1, 1], [0, 1]], mat, smooth: false })
    const box = [quad([3, 2, 1, 0]), quad([4, 5, 6, 7])]
    for (let k = 0; k < 4; k++) {
      const k1 = (k + 1) % 4
      box.push(quad([k, k1, 4 + k1, 4 + k]))
    }
    // consistent winding; flip the whole beam when it points inwards
    let vol = 0
    for (const f of box) {
      const [p0, p1, p2, p3] = f.v.map((i) => sub(out.verts[i], A))
      vol += dot(p0, cross(p1, p2)) + dot(p0, cross(p2, p3))
    }
    if (vol < 0) for (const f of box) f.v.reverse()
    out.faces.push(...box)
  }
  return out
}

function vertexNormals(mesh: EditMesh): Vec3[] {
  const n: Vec3[] = mesh.verts.map(() => [0, 0, 0])
  for (const f of mesh.faces) {
    const fn = scale(faceNormal(mesh, f), faceArea(mesh, f))
    for (const v of f.v) n[v] = add(n[v], fn)
  }
  return n.map(normalize)
}

function hash3(x: number, y: number, z: number, seed: number) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647 + seed * 144269504) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/** Smooth 3D value noise in [0, 1]. */
function noise3(x: number, y: number, z: number, seed: number) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const zi = Math.floor(z)
  const s = (t: number) => t * t * (3 - 2 * t)
  const u = s(x - xi)
  const v = s(y - yi)
  const w = s(z - zi)
  const l = (a: number, b: number, t: number) => a + (b - a) * t
  const c = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz, seed)
  return l(l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v), l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v), w)
}

/** Pushes vertices along their normals by noise (rocks, dents, worn surfaces). */
export function displace(mesh: EditMesh, strength: number, size: number, seed: number): EditMesh {
  if (!strength) return mesh
  const k = 1 / Math.max(0.001, size)
  const normals = vertexNormals(mesh)
  return {
    verts: mesh.verts.map((p, i) => {
      const n = (noise3(p[0] * k, p[1] * k, p[2] * k, seed) * 0.7 + noise3(p[0] * k * 2.1, p[1] * k * 2.1, p[2] * k * 2.1, seed + 7) * 0.3) * 2 - 1
      return add(p, scale(normals[i], n * strength))
    }),
    faces: mesh.faces,
  }
}

/** Twist, bend, taper or stretch along an axis (Simple Deform), from the bottom of the mesh. */
export function simpleDeform(mesh: EditMesh, mode: DeformMode, factor: number, axis: 0 | 1 | 2): EditMesh {
  if (!factor || !mesh.verts.length) return mesh
  const { min, max } = meshBounds(mesh)
  const L = max[axis] - min[axis]
  if (L < 1e-9) return mesh
  const [i0, i1] = axis === 0 ? [1, 2] : axis === 1 ? [2, 0] : [0, 1]
  const rad = (factor * Math.PI) / 180
  const verts = mesh.verts.map((p) => {
    const t = (p[axis] - min[axis]) / L
    const q: Vec3 = [p[0], p[1], p[2]]
    if (mode === 'twist') {
      const a = rad * t
      q[i0] = p[i0] * Math.cos(a) - p[i1] * Math.sin(a)
      q[i1] = p[i0] * Math.sin(a) + p[i1] * Math.cos(a)
    } else if (mode === 'bend') {
      // the axis curls into an arc towards +i0
      const R = L / rad
      const a = rad * t
      const r = R - p[i0]
      q[i0] = R - r * Math.cos(a)
      q[axis] = min[axis] + r * Math.sin(a)
    } else if (mode === 'taper') {
      const s = Math.max(0, 1 + factor * t)
      q[i0] = p[i0] * s
      q[i1] = p[i1] * s
    } else {
      const s = Math.max(0.01, 1 + factor)
      const side = 1 / Math.sqrt(s)
      q[axis] = min[axis] + (p[axis] - min[axis]) * s
      q[i0] = p[i0] * side
      q[i1] = p[i1] * side
    }
    return q
  })
  return { verts, faces: mesh.faces }
}

/** Blends the mesh towards a sphere or a cylinder around its centre. */
export function cast(mesh: EditMesh, shape: 'sphere' | 'cylinder', factor: number): EditMesh {
  if (!factor || !mesh.verts.length) return mesh
  const { min, max } = meshBounds(mesh)
  const c: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]
  const offs = mesh.verts.map((p) => {
    const d = sub(p, c)
    if (shape === 'cylinder') d[2] = 0
    return d
  })
  const radius = offs.reduce((s, d) => s + len(d), 0) / offs.length
  const verts = mesh.verts.map((p, i) => {
    const d = offs[i]
    const l = len(d)
    if (l < 1e-9) return p
    const target = add(sub(p, d), scale(d, radius / l))
    return lerp(p, target, factor)
  })
  return { verts, faces: mesh.faces }
}
