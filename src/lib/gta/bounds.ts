import { Block, DataBlock, FileBaseBlock, StructWriter, buildResource, type ResourceWriter, type Vec3 } from '@/lib/gta/resource'

/*
 * Collision ("bounds") writer, ported from CodeWalker's Bounds.cs. It reproduces what
 * CodeWalker computes when it imports a .ybn.xml (material list, quantization, edge
 * adjacency, triangle areas, shrunk vertices, octants and BVH trees), with float32 maths
 * so the output matches CodeWalker's bit for bit.
 */

export const YBN_VERSION = 43

export const BoundType = {
  Sphere: 0,
  Capsule: 1,
  Box: 3,
  Geometry: 4,
  GeometryBVH: 8,
  Composite: 10,
} as const

/** Composite child flags (CodeWalker EBoundCompositeFlags). */
export const CollisionFlag = {
  UNKNOWN: 1 << 0,
  MAP_WEAPON: 1 << 1,
  MAP_DYNAMIC: 1 << 2,
  MAP_ANIMAL: 1 << 3,
  MAP_COVER: 1 << 4,
  MAP_VEHICLE: 1 << 5,
  VEHICLE_NOT_BVH: 1 << 6,
  VEHICLE_BVH: 1 << 7,
  VEHICLE_BOX: 1 << 8,
  PED: 1 << 9,
  RAGDOLL: 1 << 10,
  ANIMAL: 1 << 11,
  ANIMAL_RAGDOLL: 1 << 12,
  OBJECT: 1 << 13,
  OBJECT_ENV_CLOTH: 1 << 14,
  PLANT: 1 << 15,
  PROJECTILE: 1 << 16,
  EXPLOSION: 1 << 17,
  PICKUP: 1 << 18,
  FOLIAGE: 1 << 19,
  FORKLIFT_FORKS: 1 << 20,
  TEST_WEAPON: 1 << 21,
  TEST_CAMERA: 1 << 22,
  TEST_AI: 1 << 23,
  TEST_SCRIPT: 1 << 24,
  TEST_VEHICLE_WHEEL: 1 << 25,
  GLASS: 1 << 26,
  MAP_RIVER: 1 << 27,
  SMOKE: 1 << 28,
  UNSMASHED: 1 << 29,
  MAP_STAIRS: 1 << 30,
  MAP_DEEP_SURFACE: 2 ** 31,
} as const

const F = CollisionFlag
/** Sollumz "General (Default)" flag preset: solid to everything. */
export const DEFAULT_COLLISION_TYPE_FLAGS = (F.MAP_WEAPON | F.MAP_DYNAMIC | F.MAP_ANIMAL | F.MAP_COVER | F.MAP_VEHICLE) >>> 0
export const DEFAULT_COLLISION_INCLUDE_FLAGS =
  (F.VEHICLE_NOT_BVH |
    F.VEHICLE_BVH |
    F.PED |
    F.RAGDOLL |
    F.ANIMAL |
    F.ANIMAL_RAGDOLL |
    F.OBJECT |
    F.PLANT |
    F.PROJECTILE |
    F.EXPLOSION |
    F.FORKLIFT_FORKS |
    F.TEST_WEAPON |
    F.TEST_CAMERA |
    F.TEST_AI |
    F.TEST_SCRIPT |
    F.TEST_VEHICLE_WHEEL |
    F.GLASS) >>>
  0

export const COLLISION_FLAG_NAMES = Object.keys(CollisionFlag) as (keyof typeof CollisionFlag)[]

export function collisionFlagsText(flags: number) {
  const names = COLLISION_FLAG_NAMES.filter((n) => (flags >>> 0) & CollisionFlag[n])
  return names.length ? names.join(', ') : 'NONE'
}

export interface BoundMaterial {
  /** Index in GTA's materials.dat (0 DEFAULT, 1 CONCRETE, 70 WOOD_SOLID_MEDIUM…). */
  type: number
  proceduralId?: number
  roomId?: number
  pedDensity?: number
  /** EBoundMaterialFlags */
  flags?: number
  colourIndex?: number
}

export function packMaterial(m: BoundMaterial): [number, number] {
  const flags = (m.flags ?? 0) & 0xffff
  const d1 = ((m.type & 0xff) | ((m.proceduralId ?? 0) & 0xff) << 8 | ((m.roomId ?? 0) & 0x1f) << 16 | ((m.pedDensity ?? 0) & 0x7) << 21 | (flags & 0xff) << 24) >>> 0
  const d2 = (((flags >> 8) & 0xff) | ((m.colourIndex ?? 0) & 0xff) << 8) >>> 0
  return [d1, d2]
}

/* ---------------------------------------------------------------------------------------- */
/* float32 vector maths (SharpDX semantics)                                                  */

const f = Math.fround
type V3 = [number, number, number]
const v3 = (x: number, y: number, z: number): V3 => [f(x), f(y), f(z)]
const add = (a: V3, b: V3): V3 => [f(a[0] + b[0]), f(a[1] + b[1]), f(a[2] + b[2])]
const sub = (a: V3, b: V3): V3 => [f(a[0] - b[0]), f(a[1] - b[1]), f(a[2] - b[2])]
const mul = (a: V3, s: number): V3 => [f(a[0] * s), f(a[1] * s), f(a[2] * s)]
const vmin = (a: V3, b: V3): V3 => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])]
const vmax = (a: V3, b: V3): V3 => [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])]
const dot = (a: V3, b: V3) => f(f(f(a[0] * b[0]) + f(a[1] * b[1])) + f(a[2] * b[2]))
const cross = (a: V3, b: V3): V3 => [
  f(f(a[1] * b[2]) - f(a[2] * b[1])),
  f(f(a[2] * b[0]) - f(a[0] * b[2])),
  f(f(a[0] * b[1]) - f(a[1] * b[0])),
]
const lengthSq = (a: V3) => dot(a, a)
const length = (a: V3) => f(Math.sqrt(dot(a, a)))
const ZERO_TOLERANCE = f(1e-6)
const isZero = (x: number) => Math.abs(x) < ZERO_TOLERANCE
function normalize(a: V3): V3 {
  const len = length(a)
  if (isZero(len)) return [a[0], a[1], a[2]]
  const inv = f(1 / len)
  return mul(a, inv)
}
/** (short) cast of a clamped float, as BoundVertex_s does. */
const toShort = (x: number) => Math.trunc(Math.min(Math.max(x, -32767), 32767))

/** Ray / triangle test (SharpDX Collision.RayIntersectsTriangle, float32). */
function rayTriangle(pos: V3, dir: V3, a: V3, b: V3, c: V3): number | null {
  const e1 = sub(b, a)
  const e2 = sub(c, a)
  const dce2 = cross(dir, e2)
  const det = f(f(f(e1[0] * dce2[0]) + f(e1[1] * dce2[1])) + f(e1[2] * dce2[2]))
  if (isZero(det)) return null
  const inv = f(1 / det)
  const dv = sub(pos, a)
  let u = f(f(f(dv[0] * dce2[0]) + f(dv[1] * dce2[1])) + f(dv[2] * dce2[2]))
  u = f(u * inv)
  if (u < 0 || u > 1) return null
  const dce1 = cross(dv, e1)
  let v = f(f(f(dir[0] * dce1[0]) + f(dir[1] * dce1[1])) + f(dir[2] * dce1[2]))
  v = f(v * inv)
  if (v < 0 || f(u + v) > 1) return null
  let t = f(f(f(e2[0] * dce1[0]) + f(e2[1] * dce1[1])) + f(e2[2] * dce1[2]))
  t = f(t * inv)
  if (t < 0) return null
  return t
}

/** CodeWalker TriangleMath.Area. */
function triangleArea(v1: V3, v2: V3, v3: V3) {
  const part = (p1: V3, p2: V3, p3: V3): [number, number] => {
    const va = sub(p2, p1)
    const vb = sub(p3, p1)
    const na = normalize(va)
    const nb = normalize(vb)
    const a = length(va)
    const b = length(vb)
    const c = Math.acos(dot(na, nb))
    return [f(0.5 * a * b * Math.sin(c)), f(Math.abs(c))]
  }
  const [a1, t1] = part(v1, v2, v3)
  const [a2, t2] = part(v2, v3, v1)
  const [a3, t3] = part(v3, v1, v2)
  const fp = f(Math.PI)
  const d1 = Math.min(t1, Math.abs(f(t1 - fp)))
  const d2 = Math.min(t2, Math.abs(f(t2 - fp)))
  const d3 = Math.min(t3, Math.abs(f(t3 - fp)))
  if (d1 >= d2 && a1 !== 0) return d1 >= d3 || a3 === 0 ? a1 : a3
  return d2 >= d3 || a3 === 0 ? a2 : a3
}

/* ---------------------------------------------------------------------------------------- */
/* Bounds blocks                                                                             */

export interface BoundCommon {
  boxMin: Vec3
  boxMax: Vec3
  boxCenter: Vec3
  sphereCenter: Vec3
  sphereRadius: number
  margin: number
  volume: number
  inertia: Vec3
  material?: BoundMaterial
  /** Composite child flags (what this child is / what it collides with). */
  typeFlags?: number
  includeFlags?: number
}

export abstract class BoundBlock extends FileBaseBlock {
  abstract readonly type: number
  boxMin: V3
  boxMax: V3
  boxCenter: V3
  sphereCenter: V3
  sphereRadius: number
  margin: number
  volume: number
  inertia: V3
  material: BoundMaterial
  typeFlags: number
  includeFlags: number
  /** The values as authored (what the .ybn.xml holds), before BVH fitting. */
  readonly authored: { boxMin: V3; boxMax: V3; boxCenter: V3; sphereCenter: V3; sphereRadius: number }
  constructor(c: BoundCommon) {
    super()
    this.boxMin = v3(...c.boxMin)
    this.boxMax = v3(...c.boxMax)
    this.boxCenter = v3(...c.boxCenter)
    this.sphereCenter = v3(...c.sphereCenter)
    this.sphereRadius = f(c.sphereRadius)
    this.margin = f(c.margin)
    this.volume = f(c.volume)
    this.inertia = v3(...c.inertia)
    this.material = c.material ?? { type: 0 }
    this.typeFlags = c.typeFlags ?? DEFAULT_COLLISION_TYPE_FLAGS
    this.includeFlags = c.includeFlags ?? DEFAULT_COLLISION_INCLUDE_FLAGS
    this.authored = {
      boxMin: this.boxMin,
      boxMax: this.boxMax,
      boxCenter: this.boxCenter,
      sphereCenter: this.sphereCenter,
      sphereRadius: this.sphereRadius,
    }
  }
  /** Primitive bounds carry their material in the header; geometry keeps a material list. */
  protected get headerMaterial(): BoundMaterial {
    return this.material
  }
  writeBase(w: ResourceWriter) {
    this.writeFileBase(w)
    const m = this.headerMaterial
    const flags = (m.flags ?? 0) & 0xffff
    w.u8(this.type)
    w.u8(0)
    w.u16(0)
    w.f32(this.sphereRadius)
    w.u32(0)
    w.u32(0)
    w.vec3(this.boxMax)
    w.f32(this.margin)
    w.vec3(this.boxMin)
    w.u32(1) // Unknown_3Ch ("UnkType")
    w.vec3(this.boxCenter)
    w.u8(m.type & 0xff)
    w.u8((m.proceduralId ?? 0) & 0xff)
    w.u8(((m.roomId ?? 0) & 0x1f) | (((m.pedDensity ?? 0) & 0x7) << 5))
    w.u8(flags & 0xff) // UnkFlags
    w.vec3(this.sphereCenter)
    w.u8((flags >> 8) & 0xff) // PolyFlags
    w.u8((m.colourIndex ?? 0) & 0xff)
    w.u16(0)
    w.vec3(this.inertia)
    w.f32(this.volume)
  }
}

export class BoundBoxBlock extends BoundBlock {
  readonly type = BoundType.Box
  constructor(c: BoundCommon) {
    super(c)
    this.fileVFT = 1080221016
  }
  get length() {
    return 112
  }
  write(w: ResourceWriter) {
    this.writeBase(w)
  }
}

export class BoundSphereBlock extends BoundBlock {
  readonly type = BoundType.Sphere
  constructor(c: BoundCommon) {
    super(c)
    this.fileVFT = 1080221960
  }
  get length() {
    return 112
  }
  write(w: ResourceWriter) {
    this.writeBase(w)
  }
}

interface Triangle {
  v: [number, number, number]
  material: BoundMaterial
  materialKey: string
  /** Stored edge indices (0xFFFF = none). */
  e: [number, number, number]
  area: number
  index: number
}

export interface BoundGeometryDef extends BoundCommon {
  /** Geometry centre; vertices are stored relative to it. */
  center: Vec3
  /** Absolute vertex positions (bound space). */
  vertices: Vec3[]
  /** Triangles as vertex indices, each with a material. */
  triangles: { v: [number, number, number]; material: BoundMaterial }[]
}

/* BVH ----------------------------------------------------------------------------------- */

interface BvhItem {
  min: V3
  max: V3
  index: number
  tri?: Triangle
}

class BvhNode {
  children: BvhNode[] | null = null
  items: BvhItem[] | null = null
  min: V3 = [0, 0, 0]
  max: V3 = [0, 0, 0]
  index = 0
  get totalNodes(): number {
    let c = 1
    for (const ch of this.children ?? []) c += ch.totalNodes
    return c
  }
  get totalItems(): number {
    let c = this.items?.length ?? 0
    for (const ch of this.children ?? []) c += ch.totalItems
    return c
  }
  updateMinMax() {
    let min: V3 = [f(3.4028234663852886e38), f(3.4028234663852886e38), f(3.4028234663852886e38)]
    let max: V3 = [f(-3.4028234663852886e38), f(-3.4028234663852886e38), f(-3.4028234663852886e38)]
    for (const it of this.items ?? []) {
      min = vmin(min, it.min)
      max = vmax(max, it.max)
    }
    for (const ch of this.children ?? []) {
      ch.updateMinMax()
      min = vmin(min, ch.min)
      max = vmax(max, ch.max)
    }
    this.min = min
    this.max = max
  }
  build(threshold: number) {
    this.updateMinMax()
    if (!this.items || this.items.length <= threshold) return
    let avgsum: V3 = [0, 0, 0]
    for (const it of this.items) {
      avgsum = add(avgsum, it.min)
      avgsum = add(avgsum, it.max)
    }
    const avg = mul(avgsum, f(0.5 / this.items.length))
    let cx = 0
    let cy = 0
    let cz = 0
    for (const it of this.items) {
      const c = mul(add(it.min, it.max), 0.5)
      if (c[0] < avg[0]) cx++
      if (c[1] < avg[1]) cy++
      if (c[2] < avg[2]) cz++
    }
    const target = f(this.items.length / 2)
    const dx = Math.abs(f(target - cx))
    const dy = Math.abs(f(target - cy))
    const dz = Math.abs(f(target - cz))
    const axis = dx <= dy && dx <= dz ? 0 : dy <= dz ? 1 : 2
    let l1: BvhItem[] = []
    let l2: BvhItem[] = []
    for (const it of this.items) {
      const c = mul(add(it.min, it.max), 0.5)
      if (c[axis] > avg[axis]) l1.push(it)
      else l2.push(it)
    }
    if (!l1.length || !l2.length) {
      const l3 = [...l1, ...l2]
      if (!l3.length) return
      const cmpV = (a: V3, b: V3) => (a[0] !== b[0] ? a[0] - b[0] : a[1] !== b[1] ? a[1] - b[1] : a[2] - b[2])
      l3.sort((a, b) => cmpV(a.min, b.min) || cmpV(a.max, b.max))
      const h = Math.floor(l3.length / 2)
      l1 = l3.slice(0, h)
      l2 = l3.slice(h)
    }
    this.items = null
    const n1 = new BvhNode()
    n1.items = l1
    n1.build(threshold)
    const n2 = new BvhNode()
    n2.items = l2
    n2.build(threshold)
    // List<T>.Sort of two elements: swap only when the second has more items.
    this.children = n2.totalItems > n1.totalItems ? [n2, n1] : [n1, n2]
  }
  gatherNodes(nodes: BvhNode[]) {
    this.index = nodes.length
    nodes.push(this)
    for (const ch of this.children ?? []) ch.gatherNodes(nodes)
  }
  gatherTrees(trees: BvhNode[]) {
    if (this.totalNodes > 127 && (this.children?.length ?? 0) > 0) {
      for (const ch of this.children!) ch.gatherTrees(trees)
    } else trees.push(this)
  }
}

export class BvhBlock extends Block {
  boxMin: V3 = [0, 0, 0]
  boxMax: V3 = [0, 0, 0]
  center: V3 = [0, 0, 0]
  quantum: V3 = [0, 0, 0]
  quantumInverse: V3 = [0, 0, 0]
  nodeCount = 0
  private nodesData: DataBlock | null = null
  private treesData: DataBlock | null = null
  private nodesHeader!: Block
  private treesHeader!: Block

  /** BVHBuilder.Build. Reorders `items` (for geometries) and returns the tree. */
  static build(items: (BvhItem | null)[], threshold: number) {
    const bvh = new BvhBlock()
    const iteml = items.filter((i): i is BvhItem => i !== null)
    let min: V3 = [f(3.4028234663852886e38), f(3.4028234663852886e38), f(3.4028234663852886e38)]
    let max: V3 = [f(-3.4028234663852886e38), f(-3.4028234663852886e38), f(-3.4028234663852886e38)]
    for (const it of iteml) {
      min = vmin(min, it.min)
      max = vmax(max, it.max)
    }
    const cen = mul(add(min, max), 0.5)
    bvh.boxMin = min
    bvh.boxMax = max
    bvh.center = cen
    const qa = vmax(sub(min, cen).map(Math.abs) as V3, sub(max, cen).map(Math.abs) as V3)
    bvh.quantum = [f(qa[0] / 32767), f(qa[1] / 32767), f(qa[2] / 32767)]
    bvh.quantumInverse = [f(1 / bvh.quantum[0]), f(1 / bvh.quantum[1]), f(1 / bvh.quantum[2])]

    const root = new BvhNode()
    root.items = [...iteml]
    root.build(threshold)
    const nodes: BvhNode[] = []
    const trees: BvhNode[] = []
    root.gatherNodes(nodes)
    root.gatherTrees(trees)

    if (threshold > 1) {
      items.length = 0
      for (const node of nodes) {
        for (const it of node.items ?? []) {
          it.index = items.length
          items.push(it)
        }
      }
    }

    const qi = bvh.quantumInverse
    const c = bvh.center
    const q = (v: V3) => mul3(sub(v, c), qi).map((x) => Math.trunc(x))
    const nodeData: number[][] = []
    for (const node of nodes) {
      const id = (node.items?.length ?? 0) > 0 ? node.items![0].index : 0
      const tn = node.totalNodes
      nodeData.push([...q(node.min), ...q(node.max), tn <= 1 ? id : tn, tn <= 1 ? node.totalItems : 0])
    }
    const treeData = trees.map((t) => [...q(t.min), ...q(t.max), t.index, t.index + t.totalNodes])
    bvh.nodeCount = nodeData.length
    if (threshold <= 1) {
      const capacity = items.length * 2 + 1
      while (nodeData.length < capacity) nodeData.push([0, 0, 0, 0, 0, 0, 1, 0])
    }
    const pack = (rows: number[][]) => {
      if (!rows.length) return null
      const s = new StructWriter(rows.length * 16)
      for (const r of rows) for (const v of r) s.i16(v)
      return new DataBlock(s.bytes, rows.length)
    }
    bvh.nodesData = pack(nodeData)
    bvh.treesData = pack(treeData)
    const nodesData = bvh.nodesData
    const treesData = bvh.treesData
    const count = bvh.nodeCount
    bvh.nodesHeader = new (class extends Block {
      get length() {
        return 16
      }
      write(w: ResourceWriter) {
        w.u64(nodesData ? nodesData.filePosition : 0)
        w.u32(count)
        w.u32(nodesData ? nodesData.itemCount : 0)
      }
      references() {
        return nodesData ? [nodesData] : []
      }
    })()
    bvh.treesHeader = new (class extends Block {
      get length() {
        return 16
      }
      write(w: ResourceWriter) {
        w.u64(treesData ? treesData.filePosition : 0)
        w.u16(treesData ? treesData.itemCount : 0)
        w.u16(treesData ? treesData.itemCount : 0)
        w.u32(0)
      }
      references() {
        return treesData ? [treesData] : []
      }
    })()
    return bvh
  }
  get length() {
    return 128
  }
  write(w: ResourceWriter) {
    // .NET's float.NaN is the negative quiet NaN (0xFFC00000).
    const vecNaN = (v: V3) => {
      w.vec3(v)
      w.u32(0xffc00000)
    }
    w.block(this.nodesHeader)
    w.zeros(16)
    vecNaN(this.boxMin)
    vecNaN(this.boxMax)
    vecNaN(this.center)
    vecNaN(this.quantumInverse)
    vecNaN(this.quantum)
    w.block(this.treesHeader)
  }
  parts(): [number, Block][] {
    return [
      [0, this.nodesHeader],
      [0x70, this.treesHeader],
    ]
  }
}

const mul3 = (a: V3, b: V3): V3 => [f(a[0] * b[0]), f(a[1] * b[1]), f(a[2] * b[2])]

/* Geometry ------------------------------------------------------------------------------ */

function materialKey(m: BoundMaterial) {
  return packMaterial(m).join(':')
}

export class BoundGeometryBlock extends BoundBlock {
  type: number = BoundType.Geometry
  center: V3
  /** Vertices relative to `center`, as stored in the XML. */
  vertices: V3[]
  triangles: Triangle[]
  materials: BoundMaterial[] = []
  polyMaterialIndices: number[] = []
  quantum: V3 = [0, 0, 0]
  /** Triangles in authored order (the BVH reorders `triangles`). */
  readonly authoredTriangles: { v: [number, number, number]; material: BoundMaterial }[]
  verticesShrunk: V3[] | null = null
  octants: number[][] | null = null

  private blocks: {
    shrunk: DataBlock | null
    polys: DataBlock | null
    verts: DataBlock | null
    octants: OctantsBlock | null
    materials: DataBlock | null
    polyMaterials: DataBlock | null
  } | null = null

  constructor(def: BoundGeometryDef, bvh = false) {
    super(def)
    if (bvh) this.type = BoundType.GeometryBVH
    this.fileVFT = bvh ? 1080228536 : 1080226408
    this.center = v3(...def.center)
    this.vertices = def.vertices.map((v) => sub(v3(...v), this.center))
    this.authoredTriangles = def.triangles.map((t) => ({ v: [...t.v] as [number, number, number], material: t.material }))
    this.triangles = def.triangles.map((t, i) => ({
      v: t.v,
      material: t.material,
      materialKey: materialKey(t.material),
      e: [0, 0, 0],
      area: 0,
      index: i,
    }))
    // BoundGeometry.ReadXml
    this.buildMaterials()
    this.calculateQuantum()
    this.updateEdgeIndices()
    this.updateTriangleAreas()
    this.calculateVertsShrunk()
    this.calculateOctants()
  }

  protected get headerMaterial(): BoundMaterial {
    return { type: 0 }
  }

  vertexPos(i: number): V3 {
    const v = this.vertices[i] ?? [0, 0, 0]
    return add(v, this.center)
  }

  buildMaterials() {
    const index = new Map<string, number>()
    this.materials = []
    this.polyMaterialIndices = this.triangles.map((t) => {
      let i = index.get(t.materialKey)
      if (i === undefined) {
        i = this.materials.length
        index.set(t.materialKey, i)
        this.materials.push(t.material)
      }
      return i
    })
  }

  calculateQuantum() {
    const d = sub(this.boxMax, this.boxMin)
    this.quantum = [f(f(d[0] * 0.5) / 32767), f(f(d[1] * 0.5) / 32767), f(f(d[2] * 0.5) / 32767)]
  }

  updateEdgeIndices() {
    this.triangles.forEach((t, i) => (t.index = i))
    const edges = new Map<string, { t1: Triangle; e1: number; t2: Triangle | null; e2: number }>()
    for (const t of this.triangles) {
      for (let k = 0; k < 3; k++) {
        const a = t.v[k]
        const b = t.v[(k + 1) % 3]
        const key = `${Math.min(a, b)}:${Math.max(a, b)}`
        const edge = edges.get(key)
        if (edge) {
          if (edge.t2) t.e[k] = packEdge(edge.t1.index)
          else {
            edge.t2 = t
            edge.e2 = k
          }
        } else edges.set(key, { t1: t, e1: k, t2: null, e2: 0 })
      }
    }
    for (const edge of edges.values()) {
      if (!edge.t2) edge.t1.e[edge.e1] = 0xffff
      else {
        edge.t1.e[edge.e1] = packEdge(edge.t2.index)
        edge.t2.e[edge.e2] = packEdge(edge.t1.index)
      }
    }
  }

  updateTriangleAreas() {
    for (const t of this.triangles) t.area = triangleArea(this.vertexPos(t.v[0]), this.vertexPos(t.v[1]), this.vertexPos(t.v[2]))
  }

  /* shrunk vertices & octants (only for BoundGeometry, used by the convex solver) */

  calculateVertsShrunk() {
    this.verticesShrunk = null
    if (this.type !== BoundType.Geometry) return
    const size = mul(sub(this.boxMax, this.boxMin).map(Math.abs) as V3, 0.5)
    let margin = Math.min(Math.min(Math.min(this.margin, size[0]), size[1]), size[2])
    while (margin > f(1e-6)) {
      const verts = this.shrinkPolysByMargin(margin)
      if (this.checkShrunkPolys(verts)) {
        this.verticesShrunk = verts
        break
      }
      margin = f(margin * 0.5)
    }
    if (!this.verticesShrunk) {
      this.calculateVertsShrunkByNormals()
      return
    }
    margin = Math.max(margin, f(0.025))
    const shrunkMin = sub(add(this.boxMin, [margin, margin, margin]), this.center)
    const shrunkMax = sub(sub(this.boxMax, [margin, margin, margin]), this.center)
    this.verticesShrunk = this.verticesShrunk.map((v) => vmax(vmin(v, shrunkMax), shrunkMin))
  }

  private shrinkPolysByMargin(margin: number): V3[] {
    const verts = this.vertices.map((v) => [...v] as V3)
    const vc = verts.length
    const polyNormals: V3[] = this.triangles.map((t) => {
      const [i1, i2, i3] = t.v
      if (i1 >= vc || i2 >= vc || i3 >= vc) return [0, 0, 0]
      const a = this.vertices[i1]
      const b = this.vertices[i2]
      const c = this.vertices[i3]
      return normalize(cross(sub(c, b), sub(a, b)))
    })
    const normals: V3[] = new Array(64).fill(null).map(() => [0, 0, 0] as V3)
    const processed = new Uint32Array(2048)
    const negMargin = f(-margin)
    const edgeOf = (t: Triangle, i: number) => (t.e[i] === 0xffff ? -1 : t.e[i])
    for (let polyIndex = 0; polyIndex < this.triangles.length; polyIndex++) {
      const tri = this.triangles[polyIndex]
      for (let pvi = 0; pvi < 3; pvi++) {
        const vertexIndex = tri.v[pvi]
        const bucket = vertexIndex >> 5
        const mask = (1 << (vertexIndex & 0x1f)) >>> 0
        if ((processed[bucket] & mask) !== 0) continue
        processed[bucket] |= mask
        const vertex = verts[vertexIndex]
        const normal = polyNormals[polyIndex]
        normals[0] = normal
        let averageNormal = normal
        let prevNeighbour = polyIndex
        let normalCount = 1
        let neighbourCount = 0
        let pni = (pvi + 2) % 3
        let neighbour = edgeOf(tri, pni)
        if (neighbour < 0) {
          neighbour = edgeOf(tri, pvi)
          pni = pvi
        }
        while (neighbour >= 0) {
          const np = this.triangles[neighbour]
          const nn = polyNormals[neighbour]
          averageNormal = add(averageNormal, nn)
          normals[neighbourCount + 1] = nn
          normalCount++
          neighbourCount++
          let newNeighbour = -1
          if (np) {
            for (let j = 0; j < 3; j++) {
              const next = (j + 1) % 3
              if (np.v[next] === vertexIndex) {
                newNeighbour = edgeOf(np, j)
                if (newNeighbour === prevNeighbour) newNeighbour = edgeOf(np, next)
                prevNeighbour = neighbour
                neighbour = newNeighbour
                break
              }
            }
          }
          if (newNeighbour === polyIndex) break
          if (neighbourCount >= 63) break
        }
        averageNormal = normalize(averageNormal)
        if (normalCount === 1) {
          verts[vertexIndex] = add(vertex, mul(normal, negMargin))
        } else if (normalCount === 2) {
          const cr = cross(normal, normals[1])
          const crossMagSq = lengthSq(cr)
          if (crossMagSq < f(0.1)) {
            verts[vertexIndex] = add(vertex, mul(normal, negMargin))
            continue
          }
          const lengthInv = f(1 / f(Math.sqrt(crossMagSq)))
          normals[2] = mul(cr, lengthInv)
          normalCount = 3
        }
        if (normalCount < 3) continue
        const nnc = normalCount - 1
        let shrunk = add(vertex, mul(averageNormal, negMargin))
        for (let i = 0; i < nnc - 1; i++) {
          for (let j = 0; j < nnc - i - 1; j++) {
            for (let k = 0; k < nnc - j - i - 1; k++) {
              const n1 = normals[i]
              const n2 = normals[i + j + 1]
              const n3 = normals[i + j + k + 2]
              const c23 = cross(n2, n3)
              const d = dot(n1, c23)
              if (Math.abs(d) > f(0.25)) {
                const dinv = f(1 / d)
                const c31 = cross(n3, n1)
                const c12 = cross(n1, n2)
                const nn = mul(add(add(c23, c31), c12), dinv)
                const ns = add(vertex, mul(nn, negMargin))
                if (lengthSq(sub(ns, vertex)) > lengthSq(sub(shrunk, vertex))) shrunk = ns
              }
            }
          }
        }
        verts[vertexIndex] = shrunk
      }
    }
    return verts
  }

  private checkShrunkPolys(verts: V3[]) {
    const vc = verts.length
    if (vc !== this.vertices.length) return false
    for (let i = 0; i < vc; i++) {
      const vertex = this.vertices[i]
      const sv = verts[i]
      let dir = sub(vertex, sv)
      const len = length(dir)
      if (len === 0) continue
      dir = mul(dir, f(1 / len))
      for (const t of this.triangles) {
        const [i1, i2, i3] = t.v
        if (i1 >= vc || i2 >= vc || i3 >= vc) return false
        if (i1 === i || i2 === i || i3 === i) continue
        const hit1 = rayTriangle(sv, dir, this.vertices[i1], this.vertices[i2], this.vertices[i3])
        if (hit1 !== null && hit1 <= len) return false
        const hit2 = rayTriangle(sv, dir, verts[i1], verts[i2], verts[i3])
        if (hit2 !== null && hit2 <= len) return false
      }
    }
    return true
  }

  private calculateVertsShrunkByNormals() {
    const normals: V3[] = this.vertices.map(() => [0, 0, 0])
    for (const t of this.triangles) {
      const p1 = this.vertexPos(t.v[0])
      const p2 = this.vertexPos(t.v[1])
      const p3 = this.vertexPos(t.v[2])
      const n = normalize(cross(sub(p1, p2), sub(p3, p2)))
      for (const vi of t.v) normals[vi] = add(normals[vi], n)
    }
    const negM = f(-this.margin)
    this.verticesShrunk = this.vertices.map((v, i) => {
      const n = normals[i]
      const nn = n[0] === 0 && n[1] === 0 && n[2] === 0 ? n : normalize(n)
      return add(v, mul(nn, negM))
    })
  }

  calculateOctants() {
    if (this.type !== BoundType.Geometry || !this.verticesShrunk) {
      this.octants = null
      return
    }
    const flips: V3[] = [
      [1, 1, 1],
      [-1, 1, 1],
      [1, -1, 1],
      [-1, -1, 1],
      [1, 1, -1],
      [-1, 1, -1],
      [1, -1, -1],
      [-1, -1, -1],
    ]
    const vs = this.verticesShrunk
    const shadowed = (a: V3, b: V3, o: number) => {
      const d = mul3(sub(b, a), flips[o])
      return d[0] >= 0 && d[1] >= 0 && d[2] >= 0
    }
    this.octants = flips.map((_, o) => {
      let list: number[] = []
      for (let i1 = 0; i1 < vs.length; i1++) {
        const vertex = vs[i1]
        let shouldAdd = true
        let list2: number[] = []
        for (const i2 of list) {
          const vertex2 = vs[i2]
          if (shadowed(vertex, vertex2, o)) {
            shouldAdd = false
            list2 = list
            break
          }
          if (!shadowed(vertex2, vertex, o)) list2.push(i2)
        }
        if (shouldAdd) list2.push(i1)
        list = list2
      }
      return list
    })
  }

  /** BoundBVH.BuildBVH: sorts polygons into BVH order and fits the box to them. */
  buildBvh(): BvhBlock | null {
    if (!this.triangles.length) return null
    const items: (BvhItem | null)[] = this.triangles.map((t, i) => {
      const a = this.vertexPos(t.v[0])
      const b = this.vertexPos(t.v[1])
      const c = this.vertexPos(t.v[2])
      return { min: vmin(vmin(a, b), c), max: vmax(vmax(a, b), c), index: i, tri: t }
    })
    const bvh = BvhBlock.build(items, 4)
    const lookup = new Array<number>(items.length).fill(0)
    items.forEach((it, i) => {
      if (it?.tri && it.tri.index < lookup.length) lookup[it.tri.index] = i
    })
    const newTris: Triangle[] = []
    items.forEach((it, i) => {
      const t = it!.tri!
      newTris[i] = t
      t.index = i
      t.e = t.e.map((e) => (e >= 0 && e < lookup.length ? lookup[e] : 0xffff)) as [number, number, number]
    })
    this.triangles = newTris
    this.boxMin = bvh.boxMin
    this.boxMax = bvh.boxMax
    this.boxCenter = bvh.center
    this.sphereCenter = bvh.center
    this.sphereRadius = length(sub(this.boxMax, this.boxCenter))
    return bvh
  }

  protected finalizeBlocks() {
    // BoundGeometry.GetReferences
    this.buildMaterials()
    this.calculateQuantum()
    this.updateEdgeIndices()
    this.updateTriangleAreas()
    const q = this.quantum
    const quantize = (list: V3[]) => {
      const s = new StructWriter(list.length * 6)
      for (const v of list) {
        s.i16(toShort(f(v[0] / q[0])))
        s.i16(toShort(f(v[1] / q[1])))
        s.i16(toShort(f(v[2] / q[2])))
      }
      return new DataBlock(s.bytes, list.length)
    }
    const polys = new StructWriter(this.triangles.length * 16)
    for (const t of this.triangles) {
      const start = polys.offset
      polys.f32(t.area)
      polys.bytes[start] &= 0xf8 // polygon type 0 (triangle) in the low bits
      polys.u16(t.v[0] & 0x7fff)
      polys.u16(t.v[1] & 0x7fff)
      polys.u16(t.v[2] & 0x7fff)
      polys.u16(t.e[0])
      polys.u16(t.e[1])
      polys.u16(t.e[2])
    }
    const mats = this.materials.length < 4 ? [...this.materials, ...Array(4 - this.materials.length).fill(null)] : this.materials
    const ms = new StructWriter(mats.length * 8)
    for (const m of mats) {
      const [d1, d2] = m ? packMaterial(m) : [0, 0]
      ms.u32(d1)
      ms.u32(d2)
    }
    this.blocks = {
      shrunk: this.verticesShrunk ? quantize(this.verticesShrunk) : null,
      polys: this.triangles.length ? new DataBlock(polys.bytes, this.triangles.length) : null,
      verts: this.vertices.length ? quantize(this.vertices) : null,
      octants: this.octants ? new OctantsBlock(this.octants) : null,
      materials: new DataBlock(ms.bytes, mats.length),
      polyMaterials: new DataBlock(new Uint8Array(this.polyMaterialIndices), this.polyMaterialIndices.length),
    }
  }

  references(): Block[] {
    if (!this.blocks) this.finalizeBlocks()
    const b = this.blocks!
    const refs = super.references()
    for (const x of [b.shrunk, b.polys, b.verts, b.octants, b.materials, b.polyMaterials]) if (x) refs.push(x)
    return refs
  }

  get length() {
    return 304
  }

  writeGeometry(w: ResourceWriter) {
    const b = this.blocks!
    this.writeBase(w)
    const vcount = b.verts ? b.verts.itemCount : 0
    w.u32(0)
    w.u32(0)
    w.u64(b.shrunk ? b.shrunk.filePosition : 0)
    w.u16(0)
    w.u16(0)
    w.u32(vcount)
    w.u64(b.polys ? b.polys.filePosition : 0)
    w.vec3(this.quantum)
    w.f32(0)
    w.vec3(this.center)
    w.f32(0)
    w.u64(b.verts ? b.verts.filePosition : 0)
    w.u64(0) // vertex colours
    w.u64(b.octants ? b.octants.filePosition : 0)
    w.u64(b.octants ? b.octants.filePosition + 32 : 0)
    w.u32(vcount)
    w.u32(this.triangles.length)
    w.zeros(24)
    w.u64(b.materials ? b.materials.filePosition : 0)
    w.u64(0) // material colours
    w.zeros(24)
    w.u64(b.polyMaterials ? b.polyMaterials.filePosition : 0)
    w.u8(this.materials.length)
    w.u8(0)
    w.u16(0)
    w.zeros(12)
  }

  write(w: ResourceWriter) {
    this.writeGeometry(w)
  }
}

function packEdge(i: number) {
  return i < 0 || i > 0xffff ? 0xffff : i
}

class OctantsBlock extends Block {
  items: number[][]
  constructor(items: number[][]) {
    super()
    this.items = items
  }
  get length() {
    return 128 + this.items.reduce((s, l) => s + l.length * 4, 0)
  }
  write(w: ResourceWriter) {
    let ptr = w.position + 96
    for (const l of this.items) w.u32(l.length)
    for (const l of this.items) {
      w.u64(ptr)
      ptr += l.length * 4
    }
    for (const l of this.items) for (const v of l) w.u32(v)
    w.zeros(32)
  }
}

export class BoundBvhBlock extends BoundGeometryBlock {
  bvh: BvhBlock | null = null
  constructor(def: BoundGeometryDef) {
    super(def, true)
  }
  references(): Block[] {
    // BoundBVH.GetReferences: BuildBVH, then the geometry references.
    if (!this.bvhBuilt) {
      this.bvh = this.buildBvh()
      this.bvhBuilt = true
    }
    const refs = super.references()
    if (this.bvh) refs.push(this.bvh)
    return refs
  }
  private bvhBuilt = false
  get length() {
    return 336
  }
  write(w: ResourceWriter) {
    this.writeGeometry(w)
    w.u64(this.bvh ? this.bvh.filePosition : 0)
    w.u32(0)
    w.u32(0)
    w.u16(0xffff)
    w.u16(0)
    w.u32(0)
    w.u32(0)
    w.u32(0)
  }
}

/* Composite ------------------------------------------------------------------------------ */

export class BoundCompositeBlock extends BoundBlock {
  readonly type = BoundType.Composite
  readonly children: BoundBlock[]
  private built: {
    array: Block
    transforms: DataBlock
    boxes: DataBlock
    flags1: DataBlock
    flags2: DataBlock
    bvh: BvhBlock | null
  } | null = null
  constructor(c: BoundCommon, children: BoundBlock[]) {
    super(c)
    this.fileVFT = 1080212136
    this.children = children
  }
  get length() {
    return 176
  }
  private build() {
    // BoundComposite.GetReferences: BuildBVH, UpdateChildrenFlags, UpdateChildrenBounds, UpdateChildrenTransformations
    let bvh: BvhBlock | null = null
    if (this.children.length > 5) {
      // CodeWalker's BoundingBox.Transform (identity child transforms) goes through centre / extent.
      const items = this.children.map((c, i) => {
        const center = mul(add(c.boxMax, c.boxMin), 0.5)
        const extent = mul(sub(c.boxMax, c.boxMin), 0.5).map(Math.abs) as V3
        return { min: sub(center, extent), max: add(center, extent), index: i } as BvhItem
      })
      bvh = BvhBlock.build(items, 1)
    }
    const flags = new StructWriter(this.children.length * 8)
    for (const c of this.children) {
      flags.u32(c.typeFlags)
      flags.u32(c.includeFlags)
    }
    const boxes = new StructWriter(this.children.length * 32)
    for (const c of this.children) {
      boxes.vec3(c.boxMin)
      boxes.u32(1) // float.Epsilon
      boxes.vec3(c.boxMax)
      boxes.f32(c.margin)
    }
    const transforms = new StructWriter(this.children.length * 64)
    for (let i = 0; i < this.children.length; i++) {
      transforms.vec3([1, 0, 0])
      transforms.u32(0)
      transforms.vec3([0, 1, 0])
      transforms.u32(1)
      transforms.vec3([0, 0, 1])
      transforms.u32(1)
      transforms.vec3([0, 0, 0])
      transforms.u32(0)
    }
    const n = this.children.length
    this.built = {
      array: new ChildArray(this.children),
      transforms: new DataBlock(transforms.bytes, n),
      boxes: new DataBlock(boxes.bytes, n),
      flags1: new DataBlock(flags.bytes, n),
      flags2: new DataBlock(flags.bytes.slice(), n),
      bvh,
    }
  }
  references(): Block[] {
    if (!this.built) this.build()
    const b = this.built!
    const refs = super.references()
    refs.push(b.array, b.transforms, b.boxes, b.flags1, b.flags2)
    if (b.bvh) refs.push(b.bvh)
    return refs
  }
  write(w: ResourceWriter) {
    const b = this.built!
    this.writeBase(w)
    w.u64(b.array.filePosition)
    w.u64(b.transforms.filePosition)
    w.u64(b.transforms.filePosition)
    w.u64(b.boxes.filePosition)
    w.u64(b.flags1.filePosition)
    w.u64(b.flags2.filePosition)
    w.u16(this.children.length)
    w.u16(this.children.length)
    w.u32(0)
    w.u64(b.bvh ? b.bvh.filePosition : 0)
  }
  protected get headerMaterial(): BoundMaterial {
    return { type: 0 }
  }
}

class ChildArray extends Block {
  items: Block[]
  constructor(items: Block[]) {
    super()
    this.items = items
  }
  get length() {
    return this.items.length * 8
  }
  write(w: ResourceWriter) {
    for (const it of this.items) w.u64(it.filePosition >>> 0)
  }
  references() {
    return this.items
  }
}

/** Builds a standalone .ybn file around a bounds root. */
export function buildYbn(root: BoundBlock): Uint8Array {
  return buildResource(root, YBN_VERSION)
}
