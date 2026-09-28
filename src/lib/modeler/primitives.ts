import { cloneMesh, edgeKey, normalize } from '@/lib/modeler/mesh'
import type { EditMesh, Face, Vec2, Vec3 } from '@/lib/modeler/types'

/* Primitives (Shift+A), Z up, centred on the origin, with UVs. */

export type PrimitiveKind = 'plane' | 'cube' | 'circle' | 'uvsphere' | 'icosphere' | 'cylinder' | 'cone' | 'torus' | 'grid' | 'stairs' | 'tube'

export interface PrimitiveInfo {
  kind: PrimitiveKind
  label: string
  hint: string
}

export const PRIMITIVES: PrimitiveInfo[] = [
  { kind: 'plane', label: 'Plane', hint: 'Flat square' },
  { kind: 'cube', label: 'Cube', hint: '1 m box' },
  { kind: 'circle', label: 'Circle', hint: 'Filled disc' },
  { kind: 'uvsphere', label: 'UV Sphere', hint: 'Segments and rings' },
  { kind: 'icosphere', label: 'Ico Sphere', hint: 'Even triangles' },
  { kind: 'cylinder', label: 'Cylinder', hint: 'Poles, cans' },
  { kind: 'cone', label: 'Cone', hint: 'Traffic cones, roofs' },
  { kind: 'torus', label: 'Torus', hint: 'Rings, tyres' },
  { kind: 'grid', label: 'Grid', hint: 'Subdivided plane' },
  { kind: 'tube', label: 'Tube', hint: 'Hollow pipe' },
  { kind: 'stairs', label: 'Stairs', hint: 'Steps' },
]

function face(v: number[], uv: Vec2[], mat = 0, smooth = false): Face {
  return { v, uv, mat, smooth }
}

export function makePlane(size = 1): EditMesh {
  const h = size / 2
  return {
    verts: [
      [-h, -h, 0],
      [h, -h, 0],
      [h, h, 0],
      [-h, h, 0],
    ],
    faces: [face([0, 1, 2, 3], [[0, 0], [1, 0], [1, 1], [0, 1]])],
  }
}

export function makeGrid(size = 1, xs = 10, ys = 10): EditMesh {
  const verts: Vec3[] = []
  const faces: Face[] = []
  for (let j = 0; j <= ys; j++) for (let i = 0; i <= xs; i++) verts.push([(i / xs - 0.5) * size, (j / ys - 0.5) * size, 0])
  const id = (i: number, j: number) => j * (xs + 1) + i
  for (let j = 0; j < ys; j++)
    for (let i = 0; i < xs; i++)
      faces.push(face([id(i, j), id(i + 1, j), id(i + 1, j + 1), id(i, j + 1)], [[i / xs, j / ys], [(i + 1) / xs, j / ys], [(i + 1) / xs, (j + 1) / ys], [i / xs, (j + 1) / ys]]))
  return { verts, faces }
}

export function makeCube(size = 1): EditMesh {
  const h = size / 2
  const verts: Vec3[] = [
    [-h, -h, -h],
    [h, -h, -h],
    [h, h, -h],
    [-h, h, -h],
    [-h, -h, h],
    [h, -h, h],
    [h, h, h],
    [-h, h, h],
  ]
  const uv: Vec2[] = [[0, 0], [1, 0], [1, 1], [0, 1]]
  const faces = [
    [0, 3, 2, 1], // bottom (-Z)
    [4, 5, 6, 7], // top (+Z)
    [0, 1, 5, 4], // front (-Y)
    [1, 2, 6, 5], // right (+X)
    [2, 3, 7, 6], // back (+Y)
    [3, 0, 4, 7], // left (-X)
  ].map((v) => face(v, uv.map((u) => [...u] as Vec2)))
  return { verts, faces }
}

export function makeCircle(segments = 32, radius = 0.5, fill = true): EditMesh {
  const verts: Vec3[] = []
  const uv: Vec2[] = []
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2
    verts.push([Math.cos(a) * radius, Math.sin(a) * radius, 0])
    uv.push([0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5])
  }
  if (!fill) return { verts, faces: [] }
  return { verts, faces: [face(verts.map((_, i) => i), uv)] }
}

export function makeUVSphere(segments = 24, rings = 12, radius = 0.5): EditMesh {
  const verts: Vec3[] = [[0, 0, -radius]]
  for (let r = 1; r < rings; r++) {
    const th = Math.PI - (r / rings) * Math.PI
    for (let s = 0; s < segments; s++) {
      const ph = (s / segments) * Math.PI * 2
      verts.push([Math.sin(th) * Math.cos(ph) * radius, Math.sin(th) * Math.sin(ph) * radius, Math.cos(th) * radius])
    }
  }
  verts.push([0, 0, radius])
  const top = verts.length - 1
  const id = (r: number, s: number) => 1 + (r - 1) * segments + (s % segments)
  const faces: Face[] = []
  const U = (s: number) => s / segments
  const V = (r: number) => r / rings
  for (let s = 0; s < segments; s++) faces.push(face([0, id(1, s + 1), id(1, s)], [[U(s + 0.5), 0], [U(s + 1), V(1)], [U(s), V(1)]], 0, true))
  for (let r = 1; r < rings - 1; r++)
    for (let s = 0; s < segments; s++)
      faces.push(face([id(r, s), id(r, s + 1), id(r + 1, s + 1), id(r + 1, s)], [[U(s), V(r)], [U(s + 1), V(r)], [U(s + 1), V(r + 1)], [U(s), V(r + 1)]], 0, true))
  for (let s = 0; s < segments; s++) faces.push(face([id(rings - 1, s), id(rings - 1, s + 1), top], [[U(s), V(rings - 1)], [U(s + 1), V(rings - 1)], [U(s + 0.5), 1]], 0, true))
  return { verts, faces }
}

export function makeIcoSphere(subdivisions = 2, radius = 0.5): EditMesh {
  const t = (1 + Math.sqrt(5)) / 2
  let verts: Vec3[] = [
    [-1, t, 0],
    [1, t, 0],
    [-1, -t, 0],
    [1, -t, 0],
    [0, -1, t],
    [0, 1, t],
    [0, -1, -t],
    [0, 1, -t],
    [t, 0, -1],
    [t, 0, 1],
    [-t, 0, -1],
    [-t, 0, 1],
  ].map((v) => normalize(v as Vec3))
  let tris: [number, number, number][] = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ]
  for (let s = 0; s < subdivisions; s++) {
    const mid = new Map<string, number>()
    const m = (a: number, b: number) => {
      const k = edgeKey(a, b)
      let i = mid.get(k)
      if (i === undefined) {
        i = verts.length
        verts.push(normalize([(verts[a][0] + verts[b][0]) / 2, (verts[a][1] + verts[b][1]) / 2, (verts[a][2] + verts[b][2]) / 2]))
        mid.set(k, i)
      }
      return i
    }
    const next: [number, number, number][] = []
    for (const [a, b, c] of tris) {
      const ab = m(a, b)
      const bc = m(b, c)
      const ca = m(c, a)
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca])
    }
    tris = next
  }
  verts = verts.map((v) => [v[0] * radius, v[1] * radius, v[2] * radius])
  const sph = (p: Vec3): Vec2 => [0.5 + Math.atan2(p[1], p[0]) / (2 * Math.PI), 0.5 + Math.asin(Math.max(-1, Math.min(1, p[2] / radius))) / Math.PI]
  return { verts, faces: tris.map((tv) => face([...tv], tv.map((i) => sph(verts[i])), 0, true)) }
}

export function makeCylinder(segments = 24, radius = 0.5, depth = 1, caps = true, radiusTop = radius): EditMesh {
  const verts: Vec3[] = []
  const faces: Face[] = []
  const h = depth / 2
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2
    verts.push([Math.cos(a) * radius, Math.sin(a) * radius, -h])
  }
  const topStart = verts.length
  const cone = radiusTop <= 1e-6
  if (cone) verts.push([0, 0, h])
  else
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2
      verts.push([Math.cos(a) * radiusTop, Math.sin(a) * radiusTop, h])
    }
  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % segments
    const u0 = i / segments
    const u1 = (i + 1) / segments
    if (cone) faces.push(face([i, j, topStart], [[u0, 0], [u1, 0], [(u0 + u1) / 2, 1]], 0, true))
    else faces.push(face([i, j, topStart + j, topStart + i], [[u0, 0], [u1, 0], [u1, 1], [u0, 1]], 0, true))
  }
  if (caps) {
    const cap = (start: number, flip: boolean) => {
      const v = Array.from({ length: segments }, (_, i) => start + i)
      const uv = v.map((_, i) => {
        const a = (i / segments) * Math.PI * 2
        return [0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5] as Vec2
      })
      if (flip) {
        v.reverse()
        uv.reverse()
      }
      faces.push(face(v, uv))
    }
    cap(0, true)
    if (!cone) cap(topStart, false)
  }
  return { verts, faces }
}

export function makeTorus(majorSegments = 32, minorSegments = 12, major = 0.5, minor = 0.15): EditMesh {
  const verts: Vec3[] = []
  const faces: Face[] = []
  for (let i = 0; i < majorSegments; i++) {
    const a = (i / majorSegments) * Math.PI * 2
    for (let j = 0; j < minorSegments; j++) {
      const b = (j / minorSegments) * Math.PI * 2
      const r = major + Math.cos(b) * minor
      verts.push([Math.cos(a) * r, Math.sin(a) * r, Math.sin(b) * minor])
    }
  }
  const id = (i: number, j: number) => (i % majorSegments) * minorSegments + (j % minorSegments)
  for (let i = 0; i < majorSegments; i++)
    for (let j = 0; j < minorSegments; j++) {
      const u0 = i / majorSegments
      const u1 = (i + 1) / majorSegments
      const v0 = j / minorSegments
      const v1 = (j + 1) / minorSegments
      faces.push(face([id(i, j), id(i + 1, j), id(i + 1, j + 1), id(i, j + 1)], [[u0, v0], [u1, v0], [u1, v1], [u0, v1]], 0, true))
    }
  return { verts, faces }
}

export function makeTube(segments = 24, outer = 0.5, inner = 0.4, depth = 1): EditMesh {
  const verts: Vec3[] = []
  const faces: Face[] = []
  const h = depth / 2
  const ring = (r: number, z: number) => {
    const start = verts.length
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2
      verts.push([Math.cos(a) * r, Math.sin(a) * r, z])
    }
    return start
  }
  const ob = ring(outer, -h)
  const ot = ring(outer, h)
  const ib = ring(inner, -h)
  const it = ring(inner, h)
  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % segments
    const u0 = i / segments
    const u1 = (i + 1) / segments
    faces.push(face([ob + i, ob + j, ot + j, ot + i], [[u0, 0], [u1, 0], [u1, 1], [u0, 1]], 0, true))
    faces.push(face([ib + j, ib + i, it + i, it + j], [[u1, 0], [u0, 0], [u0, 1], [u1, 1]], 0, true))
    faces.push(face([ot + i, ot + j, it + j, it + i], [[u0, 1], [u1, 1], [u1, 0.8], [u0, 0.8]]))
    faces.push(face([ob + j, ob + i, ib + i, ib + j], [[u1, 0], [u0, 0], [u0, 0.2], [u1, 0.2]]))
  }
  return { verts, faces }
}

export function makeStairs(steps = 5, width = 1, depth = 1.5, height = 1): EditMesh {
  // Side profile extruded along X.
  const profile: [number, number][] = [[0, 0]]
  const sd = depth / steps
  const sh = height / steps
  for (let i = 0; i < steps; i++) {
    profile.push([i * sd, (i + 1) * sh])
    profile.push([(i + 1) * sd, (i + 1) * sh])
  }
  profile.push([depth, 0])
  const n = profile.length
  const verts: Vec3[] = []
  const hw = width / 2
  for (const [y, z] of profile) verts.push([-hw, y - depth / 2, z])
  for (const [y, z] of profile) verts.push([hw, y - depth / 2, z])
  const faces: Face[] = []
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    faces.push(face([i, n + i, n + j, j], [[0, 0], [1, 0], [1, 1], [0, 1]]))
  }
  // side caps (the profile is not convex: fill as strips of quads per step)
  const left: number[] = []
  const right: number[] = []
  for (let i = 0; i < n; i++) {
    left.push(i)
    right.push(n + i)
  }
  // the profile runs clockwise seen from +X
  faces.push(face(left, left.map(() => [0, 0] as Vec2)))
  faces.push(face([...right].reverse(), right.map(() => [0, 0] as Vec2)))
  return { verts, faces }
}

export function makePrimitive(kind: PrimitiveKind): EditMesh {
  switch (kind) {
    case 'plane':
      return makePlane()
    case 'cube':
      return makeCube()
    case 'circle':
      return makeCircle()
    case 'uvsphere':
      return makeUVSphere()
    case 'icosphere':
      return makeIcoSphere()
    case 'cylinder':
      return makeCylinder()
    case 'cone':
      return makeCylinder(24, 0.5, 1, true, 0)
    case 'torus':
      return makeTorus()
    case 'grid':
      return makeGrid()
    case 'tube':
      return makeTube()
    case 'stairs':
      return makeStairs()
  }
}

/** Places the mesh so its lowest point sits at z = 0 (props stand on the ground). */
export function sitOnGround(mesh: EditMesh): EditMesh {
  const m = cloneMesh(mesh)
  let minZ = Infinity
  for (const v of m.verts) minZ = Math.min(minZ, v[2])
  if (Number.isFinite(minZ)) for (const v of m.verts) v[2] -= minZ
  return m
}

