import { add, avg, buildEdges, cloneMesh, edgeKey, faceArea, faceNormal, flipFaces, lerp2, meshBounds, normalize, scale, sub } from '@/lib/modeler/mesh'
import type { EditMesh, Face, Modifier, Vec2, Vec3 } from '@/lib/modeler/types'

/* Non-destructive modifiers, evaluated top to bottom like Blender's stack. */

export function applyModifiers(mesh: EditMesh, modifiers: Modifier[]): EditMesh {
  let m = mesh
  for (const mod of modifiers) {
    if (!mod.enabled) continue
    if (mod.kind === 'mirror') m = mirrorModifier(m, mod.axes, mod.mergeDistance)
    else if (mod.kind === 'array') m = arrayModifier(m, mod.count, mod.relative, mod.constant)
    else if (mod.kind === 'subsurf') for (let i = 0; i < Math.min(3, mod.levels); i++) m = catmullClark(m)
    else if (mod.kind === 'solidify') m = solidify(m, mod.thickness)
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
