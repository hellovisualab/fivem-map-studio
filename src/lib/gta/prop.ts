import * as THREE from 'three'
import { ConvexHull } from 'three/examples/jsm/math/ConvexHull.js'
import {
  BoundBoxBlock,
  BoundBvhBlock,
  BoundCompositeBlock,
  BoundGeometryBlock,
  BoundSphereBlock,
  type BoundBlock,
  type BoundCommon,
  type BoundMaterial,
} from '@/lib/gta/bounds'
import { boundsXmlWriter, drawableXml } from '@/lib/gta/cwxml'
import {
  LAYOUT_PNCT,
  LAYOUT_PNCTX,
  buildYdr,
  layoutStride,
  type DrawableDef,
  type GeometryDef,
  type ModelDef,
  type ShaderDef,
  type TextureDef,
} from '@/lib/gta/drawable'
import { encodeTexture } from '@/lib/gta/dxt'
import { ARCHETYPE_FLAG_DYNAMIC, ARCHETYPE_FLAG_STATIC, type ArchetypeDef } from '@/lib/gta/ytyp'
import type { Vec3, Vec4 } from '@/lib/gta/resource'

/*
 * Turns a three.js prop (editor space: Y up, metres) into a FiveM drawable: GTA space
 * (Z up), one geometry per material, embedded DXT textures, LOD models, and embedded
 * collision (primitives, convex hulls or a BVH mesh).
 */

export type PropCollisionKind = 'none' | 'mesh' | 'box' | 'sphere' | 'capsule' | 'convex'

export interface PropCompileInput {
  /** GTA model name (archetype, .ydr file). */
  name: string
  /** Visual meshes in editor space with the prop transform already applied. */
  visual: THREE.Object3D
  /** LOD meshes (same space), optional. */
  lods?: { med?: THREE.Object3D; low?: THREE.Object3D }
  /** Collision triangles in editor space (transform applied), or a primitive. */
  collision: { kind: PropCollisionKind; mesh?: THREE.BufferGeometry | null }
  collisionMaterial: number
  dynamic: boolean
  lodDist: number
  hdTextureDist: number
  textureMaxSize?: number
}

export interface CompiledProp {
  name: string
  ydr: Uint8Array
  ydrXml: string
  textures: TextureDef[]
  archetype: ArchetypeDef
  stats: { vertices: number; triangles: number; geometries: number; collisionTriangles: number; collisionType: string }
  warnings: string[]
}

/** Editor (three.js, Y up) to GTA (Z up). A rotation, so triangle winding is kept. */
export function toGta(x: number, y: number, z: number): Vec3 {
  // `+ 0` turns -0 into 0, so the binary and the XML agree bit for bit.
  return [x + 0, -z + 0, y + 0]
}

/* ---------------------------------------------------------------------------------------- */
/* Materials                                                                                 */

export const SHADER_PRESETS = {
  default: (tex: string): ShaderDef => ({
    name: 'default',
    fileName: 'default.sps',
    renderBucket: 0,
    params: [
      { name: 'DiffuseSampler', value: tex },
      { name: 'matMaterialColorScale', value: [1, 0, 0, 1] },
      { name: 'HardAlphaBlend', value: [1, 0, 0, 0] },
      { name: 'useTessellation', value: [0, 0, 0, 0] },
      { name: 'wetnessMultiplier', value: [1, 0, 0, 0] },
      { name: 'globalAnimUV1', value: [0, 1, 0, 0] },
      { name: 'globalAnimUV0', value: [1, 0, 0, 0] },
    ],
  }),
  normal: (tex: string, bump: string): ShaderDef => ({
    name: 'normal',
    fileName: 'normal.sps',
    renderBucket: 0,
    params: [
      { name: 'DiffuseSampler', value: tex },
      { name: 'BumpSampler', value: bump },
      { name: 'HardAlphaBlend', value: [1, 0, 0, 0] },
      { name: 'useTessellation', value: [0, 0, 0, 0] },
      { name: 'wetnessMultiplier', value: [1, 0, 0, 0] },
      { name: 'bumpiness', value: [1, 0, 0, 0] },
      { name: 'specularIntensityMult', value: [0.125, 0, 0, 0] },
      { name: 'specularFalloffMult', value: [100, 0, 0, 0] },
      { name: 'specularFresnel', value: [0.75, 0, 0, 0] },
      { name: 'globalAnimUV1', value: [0, 1, 0, 0] },
      { name: 'globalAnimUV0', value: [1, 0, 0, 0] },
    ],
  }),
  emissive: (tex: string, multiplier: number): ShaderDef => ({
    name: 'emissive',
    fileName: 'emissive.sps',
    renderBucket: 0,
    params: [
      { name: 'DiffuseSampler', value: tex },
      { name: 'matMaterialColorScale', value: [1, 0, 0, 1] },
      { name: 'HardAlphaBlend', value: [1, 0, 0, 0] },
      { name: 'useTessellation', value: [0, 0, 0, 0] },
      { name: 'emissiveMultiplier', value: [multiplier, 0, 0, 0] },
      { name: 'globalAnimUV1', value: [0, 1, 0, 0] },
      { name: 'globalAnimUV0', value: [1, 0, 0, 0] },
    ],
  }),
}

type AlphaMode = 'opaque' | 'cutout' | 'blend'

function withAlpha(s: ShaderDef, mode: AlphaMode): ShaderDef {
  if (mode === 'opaque') return s
  if (s.name === 'emissive') return { ...s, fileName: 'emissive_alpha.sps', renderBucket: 1 }
  const base = s.name === 'normal' ? 'normal_' : ''
  if (mode === 'cutout') return { ...s, fileName: `${base}cutout.sps`, renderBucket: 3 }
  return { ...s, fileName: `${base}alpha.sps`, renderBucket: 1 }
}

/** RGBA pixels of a texture image (top row first), resized to `w` x `h`. */
function imagePixels(tex: THREE.Texture, w: number, h: number): Uint8Array | null {
  const img = tex.image as (CanvasImageSource & { width?: number; height?: number; data?: ArrayLike<number> }) | undefined
  if (!img) return null
  const sw = img.width ?? 0
  const sh = img.height ?? 0
  if (!sw || !sh) return null
  if (img.data && !(typeof HTMLImageElement !== 'undefined' && img instanceof HTMLImageElement)) {
    // DataTexture: rows bottom-up when flipY is false in three's convention for data; sample nearest.
    const src = img.data
    const out = new Uint8Array(w * h * 4)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const sx = Math.min(sw - 1, Math.floor(((x + 0.5) * sw) / w))
        const sy = Math.min(sh - 1, Math.floor(((y + 0.5) * sh) / h))
        const s = (sy * sw + sx) * 4
        const d = (y * w + x) * 4
        out[d] = src[s]
        out[d + 1] = src[s + 1]
        out[d + 2] = src[s + 2]
        out[d + 3] = src[s + 3] ?? 255
      }
    }
    return out
  }
  if (typeof document === 'undefined') return null
  try {
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, w, h)
    return new Uint8Array(ctx.getImageData(0, 0, w, h).data.buffer)
  } catch {
    return null
  }
}

const pot = (n: number, max: number) => Math.min(max, Math.max(4, 2 ** Math.round(Math.log2(Math.max(1, n)))))

interface MaterialPlan {
  shader: ShaderDef
  textures: TextureDef[]
  normalMapped: boolean
  /** Flip V when the texture uses three's bottom-up convention. */
  flipV: boolean
  uvMatrix: THREE.Matrix3 | null
  doubleSided: boolean
}

function srgb(c: THREE.Color) {
  const t = { r: 0, g: 0, b: 0 }
  c.getRGB(t, THREE.SRGBColorSpace)
  return [Math.round(t.r * 255), Math.round(t.g * 255), Math.round(t.b * 255)]
}

function planMaterial(mat: THREE.Material, texName: string, maxSize: number, warnings: string[]): MaterialPlan {
  const std = mat as THREE.MeshStandardMaterial
  const color = std.color ? srgb(std.color) : [200, 200, 205]
  const opacity = mat.transparent ? mat.opacity : 1
  const map = std.map ?? null
  let pixels: Uint8Array | null = null
  let w = 16
  let h = 16
  if (map) {
    const iw = (map.image as { width?: number })?.width ?? 0
    const ih = (map.image as { height?: number })?.height ?? 0
    w = pot(iw || 256, maxSize)
    h = pot(ih || 256, maxSize)
    pixels = imagePixels(map, w, h)
    if (!pixels) warnings.push(`Texture of material "${mat.name || texName}" could not be read, using its colour instead.`)
  }
  if (!pixels) {
    w = 16
    h = 16
    pixels = new Uint8Array(w * h * 4)
    for (let i = 0; i < w * h; i++) {
      pixels[i * 4] = 255
      pixels[i * 4 + 1] = 255
      pixels[i * 4 + 2] = 255
      pixels[i * 4 + 3] = 255
    }
  }
  let hasAlpha = false
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = Math.round((pixels[i] * color[0]) / 255)
    pixels[i + 1] = Math.round((pixels[i + 1] * color[1]) / 255)
    pixels[i + 2] = Math.round((pixels[i + 2] * color[2]) / 255)
    pixels[i + 3] = Math.round(pixels[i + 3] * opacity)
    if (pixels[i + 3] < 250) hasAlpha = true
  }
  const textures: TextureDef[] = [encodeTexture(texName, pixels, w, h)]
  const alphaMode: AlphaMode = !hasAlpha ? 'opaque' : std.alphaTest > 0 || !mat.transparent ? 'cutout' : 'blend'

  let shader: ShaderDef
  let normalMapped = false
  const emissiveStrength = std.emissive ? Math.max(...srgb(std.emissive)) / 255 * (std.emissiveIntensity ?? 1) : 0
  if (emissiveStrength > 0.02) {
    shader = SHADER_PRESETS.emissive(texName, Math.max(1, emissiveStrength * 4))
  } else if (std.normalMap && map) {
    const nw = pot((std.normalMap.image as { width?: number })?.width ?? 256, maxSize)
    const nh = pot((std.normalMap.image as { height?: number })?.height ?? 256, maxSize)
    const np = imagePixels(std.normalMap, nw, nh)
    if (np) {
      for (let i = 3; i < np.length; i += 4) np[i] = 255
      textures.push(encodeTexture(`${texName}_n`, np, nw, nh, 'DXT1'))
      shader = SHADER_PRESETS.normal(texName, `${texName}_n`)
      normalMapped = true
    } else shader = SHADER_PRESETS.default(texName)
  } else shader = SHADER_PRESETS.default(texName)

  let uvMatrix: THREE.Matrix3 | null = null
  if (map) {
    map.updateMatrix()
    if (!map.matrix.equals(new THREE.Matrix3())) uvMatrix = map.matrix.clone()
  }
  return {
    shader: withAlpha(shader, alphaMode),
    textures,
    normalMapped,
    flipV: map ? map.flipY : true,
    uvMatrix,
    doubleSided: mat.side === THREE.DoubleSide,
  }
}

/* ---------------------------------------------------------------------------------------- */
/* Geometry                                                                                  */

interface Tri {
  p: [Vec3, Vec3, Vec3]
  n: [Vec3, Vec3, Vec3]
  uv: [[number, number], [number, number], [number, number]]
}

function flattenMaterials(m: THREE.Material | THREE.Material[]) {
  return Array.isArray(m) ? m : [m]
}

/** Every triangle of `root` in GTA space, grouped by material. */
function collectTriangles(root: THREE.Object3D) {
  root.updateMatrixWorld(true)
  const byMaterial = new Map<THREE.Material, Tri[]>()
  const order: THREE.Material[] = []
  const normalMatrix = new THREE.Matrix3()
  const v = new THREE.Vector3()
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry?.getAttribute('position') || !mesh.visible) return
    const geo = mesh.geometry
    const pos = geo.getAttribute('position')
    let nrm = geo.getAttribute('normal')
    if (!nrm) {
      const g = geo.clone()
      g.computeVertexNormals()
      nrm = g.getAttribute('normal')
    }
    const uv = geo.getAttribute('uv')
    const index = geo.getIndex()
    const mats = flattenMaterials(mesh.material)
    const groups = geo.groups.length ? geo.groups : [{ start: 0, count: index ? index.count : pos.count, materialIndex: 0 }]
    normalMatrix.getNormalMatrix(mesh.matrixWorld)
    const flip = mesh.matrixWorld.determinant() < 0
    const read = (i: number) => {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld)
      const p = toGta(v.x, v.y, v.z)
      v.fromBufferAttribute(nrm, i).applyMatrix3(normalMatrix).normalize()
      const n = toGta(v.x, v.y, v.z)
      const t: [number, number] = uv ? [uv.getX(i), uv.getY(i)] : [0, 0]
      return { p, n, t }
    }
    for (const g of groups) {
      const mat = mats[g.materialIndex ?? 0] ?? mats[0]
      if (!mat) continue
      let list = byMaterial.get(mat)
      if (!list) {
        list = []
        byMaterial.set(mat, list)
        order.push(mat)
      }
      const end = Math.min(g.start + g.count, index ? index.count : pos.count)
      for (let i = g.start; i + 2 < end; i += 3) {
        const ids = index ? [index.getX(i), index.getX(i + 1), index.getX(i + 2)] : [i, i + 1, i + 2]
        const [a, b, c] = ids.map(read)
        if (flip) list.push({ p: [a.p, c.p, b.p], n: [a.n, c.n, b.n], uv: [a.t, c.t, b.t] })
        else list.push({ p: [a.p, b.p, c.p], n: [a.n, b.n, c.n], uv: [a.t, b.t, c.t] })
      }
    }
  })
  return { byMaterial, order }
}

function tangentsFor(tris: Tri[]) {
  // Per-corner tangent with handedness in w (averaged per triangle; smoothed through the vertex dedupe).
  return tris.map((t) => {
    const [p0, p1, p2] = t.p
    const [u0, u1, u2] = t.uv
    const e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]]
    const e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]]
    const du1 = u1[0] - u0[0]
    const dv1 = u1[1] - u0[1]
    const du2 = u2[0] - u0[0]
    const dv2 = u2[1] - u0[1]
    const r = du1 * dv2 - du2 * dv1
    const f = Math.abs(r) < 1e-12 ? 0 : 1 / r
    const tx = f * (dv2 * e1[0] - dv1 * e2[0])
    const ty = f * (dv2 * e1[1] - dv1 * e2[1])
    const tz = f * (dv2 * e1[2] - dv1 * e2[2])
    const bx = f * (du1 * e2[0] - du2 * e1[0])
    const by = f * (du1 * e2[1] - du2 * e1[1])
    const bz = f * (du1 * e2[2] - du2 * e1[2])
    const out: Vec4[] = []
    for (let k = 0; k < 3; k++) {
      const n = t.n[k]
      // Gram-Schmidt against the corner normal
      const d = n[0] * tx + n[1] * ty + n[2] * tz
      let x = tx - n[0] * d
      let y = ty - n[1] * d
      let z = tz - n[2] * d
      let len = Math.hypot(x, y, z)
      if (len < 1e-8) {
        // any perpendicular
        const ax = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]
        x = ax[1] * n[2] - ax[2] * n[1]
        y = ax[2] * n[0] - ax[0] * n[2]
        z = ax[0] * n[1] - ax[1] * n[0]
        len = Math.hypot(x, y, z) || 1
      }
      const cx = n[1] * z - n[2] * y
      const cy = n[2] * x - n[0] * z
      const cz = n[0] * y - n[1] * x
      const w = cx * bx + cy * by + cz * bz < 0 ? -1 : 1
      out.push([x / len, y / len, z / len, w])
    }
    return out
  })
}

/** Packs triangles into geometries of at most 65535 vertices, deduplicating identical corners. */
function buildGeometries(tris: Tri[], shaderIndex: number, plan: MaterialPlan): GeometryDef[] {
  const layout = plan.normalMapped ? LAYOUT_PNCTX : LAYOUT_PNCT
  const stride = layoutStride(layout)
  const tangents = plan.normalMapped ? tangentsFor(tris) : null
  const out: GeometryDef[] = []
  let verts: number[][] = []
  let index = new Map<string, number>()
  let indices: number[] = []
  const flush = () => {
    if (!indices.length) return
    const bytes = new Uint8Array(verts.length * stride)
    const dv = new DataView(bytes.buffer)
    const min = [Infinity, Infinity, Infinity]
    const max = [-Infinity, -Infinity, -Infinity]
    verts.forEach((vv, i) => {
      const o = i * stride
      for (let k = 0; k < 3; k++) {
        dv.setFloat32(o + k * 4, vv[k], true)
        min[k] = Math.min(min[k], Math.fround(vv[k]))
        max[k] = Math.max(max[k], Math.fround(vv[k]))
      }
      for (let k = 0; k < 3; k++) dv.setFloat32(o + 12 + k * 4, vv[3 + k], true)
      bytes[o + 24] = 255
      bytes[o + 25] = 255
      bytes[o + 26] = 255
      bytes[o + 27] = 255
      dv.setFloat32(o + 28, vv[6], true)
      dv.setFloat32(o + 32, vv[7], true)
      if (layout === LAYOUT_PNCTX) for (let k = 0; k < 4; k++) dv.setFloat32(o + 36 + k * 4, vv[8 + k], true)
    })
    out.push({
      shaderIndex,
      layout,
      vertexCount: verts.length,
      vertices: bytes,
      indices: new Uint16Array(indices),
      bbMin: [min[0], min[1], min[2], min[0]],
      bbMax: [max[0], max[1], max[2], max[0]],
    })
    verts = []
    index = new Map()
    indices = []
  }
  const uvOf = (uv: [number, number]) => {
    let u = uv[0]
    let v = uv[1]
    if (plan.uvMatrix) {
      const e = plan.uvMatrix.elements
      const nu = e[0] * u + e[3] * v + e[6]
      const nv = e[1] * u + e[4] * v + e[7]
      u = nu
      v = nv
    }
    return [u, plan.flipV ? 1 - v : v]
  }
  const emit = (t: Tri, ti: number, back: boolean) => {
    if (verts.length > 65535 - 3) flush()
    const corners = back ? [0, 2, 1] : [0, 1, 2]
    for (const k of corners) {
      const p = t.p[k]
      const n = back ? ([-t.n[k][0], -t.n[k][1], -t.n[k][2]] as Vec3) : t.n[k]
      const [u, v] = uvOf(t.uv[k])
      const tg = tangents ? tangents[ti][k] : null
      const vals = [p[0], p[1], p[2], n[0], n[1], n[2], u, v, ...(tg ? [back ? -tg[0] : tg[0], back ? -tg[1] : tg[1], back ? -tg[2] : tg[2], tg[3]] : [])].map(
        (x) => Math.fround(x) + 0,
      )
      const key = vals.map((x) => Math.fround(x)).join(',')
      let i = index.get(key)
      if (i === undefined) {
        i = verts.length
        index.set(key, i)
        verts.push(vals)
      }
      indices.push(i)
    }
  }
  tris.forEach((t, i) => {
    emit(t, i, false)
    if (plan.doubleSided) emit(t, i, true)
  })
  flush()
  return out
}

/* ---------------------------------------------------------------------------------------- */
/* Collision                                                                                 */

interface IndexedMesh {
  vertices: Vec3[]
  triangles: [number, number, number][]
}

/** GTA-space indexed mesh with welded vertices and without degenerate triangles. */
function indexedGtaMesh(geo: THREE.BufferGeometry): IndexedMesh {
  const pos = geo.getAttribute('position')
  const index = geo.getIndex()
  const vertices: Vec3[] = []
  const weld = new Map<string, number>()
  const q = (x: number) => Math.round(x * 1e4)
  const vid = (i: number) => {
    const p = toGta(pos.getX(i), pos.getY(i), pos.getZ(i))
    const key = `${q(p[0])},${q(p[1])},${q(p[2])}`
    let id = weld.get(key)
    if (id === undefined) {
      id = vertices.length
      weld.set(key, id)
      vertices.push(p)
    }
    return id
  }
  const triangles: [number, number, number][] = []
  const count = index ? index.count : pos.count
  for (let i = 0; i + 2 < count; i += 3) {
    const a = vid(index ? index.getX(i) : i)
    const b = vid(index ? index.getX(i + 1) : i + 1)
    const c = vid(index ? index.getX(i + 2) : i + 2)
    if (a !== b && b !== c && a !== c) triangles.push([a, b, c])
  }
  return { vertices, triangles }
}

function hullOf(points: Vec3[]): IndexedMesh {
  const hull = new ConvexHull().setFromPoints(points.map((p) => new THREE.Vector3(...p)))
  const vertices: Vec3[] = []
  const ids = new Map<THREE.Vector3, number>()
  const id = (p: THREE.Vector3) => {
    let i = ids.get(p)
    if (i === undefined) {
      i = vertices.length
      ids.set(p, i)
      vertices.push([p.x, p.y, p.z])
    }
    return i
  }
  const triangles: [number, number, number][] = []
  for (const face of hull.faces) {
    const loop: number[] = []
    let e = face.edge
    do {
      loop.push(id(e.head().point))
      e = e.next
    } while (e !== face.edge)
    for (let k = 1; k + 1 < loop.length; k++) triangles.push([loop[0], loop[k], loop[k + 1]])
  }
  return { vertices, triangles }
}

function bboxOf(points: Vec3[]): [Vec3, Vec3] {
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (const p of points) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], p[k])
      max[k] = Math.max(max[k], p[k])
    }
  }
  return [min, max]
}

/** Ritter bounding ball (Sollumz get_centroid_of_mesh). */
function boundingBall(points: Vec3[]): [Vec3, number] {
  if (!points.length) return [[0, 0, 0], 0]
  const d2 = (a: Vec3, b: Vec3) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
  let i = 0
  points.forEach((p, k) => {
    if (d2(p, points[0]) > d2(points[i], points[0])) i = k
  })
  let j = 0
  points.forEach((p, k) => {
    if (d2(p, points[i]) > d2(points[j], points[i])) j = k
  })
  let c: Vec3 = [(points[i][0] + points[j][0]) / 2, (points[i][1] + points[j][1]) / 2, (points[i][2] + points[j][2]) / 2]
  let r2 = d2(points[i], c)
  for (const p of points) {
    const dd = d2(p, c)
    if (dd > r2) {
      const d = Math.sqrt(dd)
      const r = Math.sqrt(r2)
      const nr = (r + d) / 2
      const k = (nr - r) / d
      c = [c[0] + (p[0] - c[0]) * k, c[1] + (p[1] - c[1]) * k, c[2] + (p[2] - c[2]) * k]
      r2 = nr * nr
    }
  }
  return [c, Math.sqrt(r2)]
}

/** Volume, centre of gravity and per-unit-mass inertia of a closed mesh (Sollumz get_mass_properties_of_mesh). */
function massProperties(m: IndexedMesh): { volume: number; cg: Vec3; inertia: Vec3 } {
  let vol = 0
  const cgAcc = [0, 0, 0]
  const vols: number[] = []
  for (const [a, b, c] of m.triangles) {
    const v0 = m.vertices[a]
    const v1 = m.vertices[b]
    const v2 = m.vertices[c]
    const cr = [v1[1] * v2[2] - v1[2] * v2[1], v1[2] * v2[0] - v1[0] * v2[2], v1[0] * v2[1] - v1[1] * v2[0]]
    const tv = (v0[0] * cr[0] + v0[1] * cr[1] + v0[2] * cr[2]) / 6
    vols.push(tv)
    vol += tv
    for (let k = 0; k < 3; k++) cgAcc[k] += ((v0[k] + v1[k] + v2[k]) / 4) * tv
  }
  const volume = Math.abs(vol)
  if (volume < 1e-9) {
    const [min, max] = bboxOf(m.vertices)
    return { volume: 1, cg: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2], inertia: [1, 1, 1] }
  }
  const cg: Vec3 = [cgAcc[0] / vol, cgAcc[1] / vol, cgAcc[2] / vol]
  const isum = [0, 0, 0]
  m.triangles.forEach(([ia, ib, ic], t) => {
    for (let k = 0; k < 3; k++) {
      const a = m.vertices[ia][k] - cg[k]
      const b = m.vertices[ib][k] - cg[k]
      const c = m.vertices[ic][k] - cg[k]
      isum[k] += vols[t] * 0.1 * (a * a + b * b + c * c + a * b + a * c + b * c)
    }
  })
  const inertia: Vec3 = [(isum[1] + isum[2]) / vol, (isum[2] + isum[0]) / vol, (isum[0] + isum[1]) / vol].map(Math.abs) as Vec3
  return { volume, cg, inertia }
}

function geometryCommon(mesh: IndexedMesh, bvh: boolean, material: BoundMaterial): BoundCommon & { center: Vec3 } {
  const [centroid, radius] = boundingBall(mesh.vertices)
  const margin = bvh ? 0.04 : 0.025
  const [min, max] = bboxOf(mesh.vertices)
  const pad = 0.04
  const boxMin: Vec3 = [min[0] - pad, min[1] - pad, min[2] - pad]
  const boxMax: Vec3 = [max[0] + pad, max[1] + pad, max[2] + pad]
  const mp = massProperties(mesh)
  return {
    boxMin,
    boxMax,
    boxCenter: centroid,
    sphereCenter: mp.cg,
    sphereRadius: radius,
    margin,
    volume: bvh ? 1 : mp.volume,
    inertia: bvh ? [1, 1, 1] : mp.inertia,
    material,
    center: [(boxMin[0] + boxMax[0]) / 2, (boxMin[1] + boxMax[1]) / 2, (boxMin[2] + boxMax[2]) / 2],
  }
}

const MAX_BOUND_VERTS = 32000

function limitVertices(mesh: IndexedMesh): IndexedMesh {
  if (mesh.vertices.length <= MAX_BOUND_VERTS) return mesh
  // Keep the first triangles whose vertices fit (callers decimate before this).
  const map = new Map<number, number>()
  const vertices: Vec3[] = []
  const triangles: [number, number, number][] = []
  for (const t of mesh.triangles) {
    const need = t.filter((i) => !map.has(i)).length
    if (vertices.length + need > MAX_BOUND_VERTS) break
    triangles.push(
      t.map((i) => {
        let j = map.get(i)
        if (j === undefined) {
          j = vertices.length
          map.set(i, j)
          vertices.push(mesh.vertices[i])
        }
        return j
      }) as [number, number, number],
    )
  }
  return { vertices, triangles }
}

/** Collision child bound for a prop, in GTA space. */
function collisionBound(input: PropCompileInput, warnings: string[]): { bound: BoundBlock; triangles: number; type: string } | null {
  const { kind, mesh } = input.collision
  if (kind === 'none' || !mesh) return null
  const material: BoundMaterial = { type: input.collisionMaterial }
  const src = indexedGtaMesh(mesh)
  if (!src.vertices.length) return null
  const [min, max] = bboxOf(src.vertices)
  const size: Vec3 = [max[0] - min[0], max[1] - min[1], max[2] - min[2]]
  const center: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]

  if (kind === 'box') {
    // An axis-aligned box stays a true box; a rotated one becomes its convex hull.
    const hullVolume = massProperties(hullOf(src.vertices)).volume
    const boxVolume = size[0] * size[1] * size[2]
    if (boxVolume > 0 && Math.abs(hullVolume - boxVolume) / boxVolume < 0.02) {
      const [x, y, z] = size.map((s) => Math.max(s, 0.01))
      return {
        bound: new BoundBoxBlock({
          boxMin: min,
          boxMax: max,
          boxCenter: center,
          sphereCenter: center,
          sphereRadius: 0.5 * Math.hypot(x, y, z),
          margin: Math.min(0.04, Math.min(x, y, z) / 8),
          volume: x * y * z,
          inertia: [(y * y + z * z) / 12, (z * z + x * x) / 12, (x * x + y * y) / 12],
          material,
        }),
        triangles: 12,
        type: 'Box',
      }
    }
  }
  if (kind === 'sphere') {
    const r = Math.max(size[0], size[1], size[2]) / 2
    return {
      bound: new BoundSphereBlock({
        boxMin: [center[0] - r, center[1] - r, center[2] - r],
        boxMax: [center[0] + r, center[1] + r, center[2] + r],
        boxCenter: center,
        sphereCenter: center,
        sphereRadius: r,
        margin: r,
        volume: (4 / 3) * Math.PI * r ** 3,
        inertia: [(2 * r * r) / 5, (2 * r * r) / 5, (2 * r * r) / 5],
        material,
      }),
      triangles: 0,
      type: 'Sphere',
    }
  }
  const convex = input.dynamic || kind === 'convex' || kind === 'box'
  if (input.dynamic && kind === 'mesh') warnings.push('Dynamic props need convex collision: the mesh collision was exported as its convex hull.')
  if (convex) {
    const hull = hullOf(src.vertices)
    if (!input.dynamic) {
      const c = geometryCommon(hull, true, material)
      return { bound: new BoundBvhBlock({ ...c, vertices: hull.vertices, triangles: hull.triangles.map((v) => ({ v, material })) }), triangles: hull.triangles.length, type: 'BVH (convex)' }
    }
    const c = geometryCommon(hull, false, material)
    return { bound: new BoundGeometryBlock({ ...c, vertices: hull.vertices, triangles: hull.triangles.map((v) => ({ v, material })) }), triangles: hull.triangles.length, type: 'Geometry (convex)' }
  }
  const m = limitVertices(src)
  if (m !== src) warnings.push('Collision mesh was too dense and got trimmed; lower the collision detail.')
  const c = geometryCommon(m, true, material)
  return { bound: new BoundBvhBlock({ ...c, vertices: m.vertices, triangles: m.triangles.map((v) => ({ v, material })) }), triangles: m.triangles.length, type: 'BVH (mesh)' }
}

function compositeFor(child: BoundBlock): BoundCompositeBlock {
  const a = child.authored
  const radius = Math.hypot(a.boxMax[0] - a.boxCenter[0], a.boxMax[1] - a.boxCenter[1], a.boxMax[2] - a.boxCenter[2])
  return new BoundCompositeBlock(
    {
      boxMin: a.boxMin,
      boxMax: a.boxMax,
      boxCenter: a.boxCenter,
      sphereCenter: a.sphereCenter,
      sphereRadius: radius,
      margin: 0,
      volume: child.volume,
      inertia: child.inertia,
    },
    [child],
  )
}

/* ---------------------------------------------------------------------------------------- */

function modelsFor(root: THREE.Object3D, maxSize: number, warnings: string[], shaders: ShaderDef[], textures: TextureDef[], plans: Map<THREE.Material, { plan: MaterialPlan; shader: number }>, prefix: string) {
  const { byMaterial, order } = collectTriangles(root)
  const geometries: GeometryDef[] = []
  for (const mat of order) {
    const tris = byMaterial.get(mat)!
    if (!tris.length) continue
    let entry = plans.get(mat)
    if (!entry) {
      const plan = planMaterial(mat, `${prefix}_${plans.size}`, maxSize, warnings)
      entry = { plan, shader: shaders.length }
      shaders.push(plan.shader)
      textures.push(...plan.textures)
      plans.set(mat, entry)
    }
    geometries.push(...buildGeometries(tris, entry.shader, entry.plan))
  }
  const models: ModelDef[] = geometries.length ? [{ renderMask: 255, flags: 0, geometries }] : []
  return models
}

export function compileProp(input: PropCompileInput): CompiledProp {
  const warnings: string[] = []
  const maxSize = input.textureMaxSize ?? 1024
  const shaders: ShaderDef[] = []
  const textures: TextureDef[] = []
  const plans = new Map<THREE.Material, { plan: MaterialPlan; shader: number }>()
  const high = modelsFor(input.visual, maxSize, warnings, shaders, textures, plans, input.name)
  if (!high.length) throw new Error(`${input.name} has no visible geometry to export.`)
  const med = input.lods?.med ? modelsFor(input.lods.med, maxSize, warnings, shaders, textures, plans, input.name) : []
  const low = input.lods?.low ? modelsFor(input.lods.low, maxSize, warnings, shaders, textures, plans, input.name) : []

  const all = [...high, ...med, ...low].flatMap((m) => m.geometries)
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (const g of high[0].geometries) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], g.bbMin[k])
      max[k] = Math.max(max[k], g.bbMax[k])
    }
  }
  const col = collisionBound(input, warnings)
  const bound = col ? compositeFor(col.bound) : null
  if (col) {
    const a = bound!.authored
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], a.boxMin[k])
      max[k] = Math.max(max[k], a.boxMax[k])
    }
  }
  const centre: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]
  const radius = Math.hypot(max[0] - centre[0], max[1] - centre[1], max[2] - centre[2])
  const hasLods = med.length > 0 || low.length > 0
  const lodDist: [number, number, number, number] = hasLods
    ? [Math.max(10, input.lodDist * 0.3), low.length ? Math.max(20, input.lodDist * 0.6) : 9998, 9998, 9998]
    : [9998, 9998, 9998, 9998]
  const def: DrawableDef = {
    name: input.name,
    bsCenter: centre,
    bsRadius: radius,
    bbMin: min,
    bbMax: max,
    lodDist,
    models: { high, med: med.length ? med : undefined, low: low.length ? low : undefined },
    textures,
    shaders,
    bound,
  }
  const ydrXml = drawableXml(def, bound ? boundsXmlWriter(bound) : undefined)
  const ydr = buildYdr(def)
  const vertices = high[0].geometries.reduce((s, g) => s + g.vertexCount, 0)
  const triangles = high[0].geometries.reduce((s, g) => s + g.indices.length / 3, 0)
  return {
    name: input.name,
    ydr,
    ydrXml,
    textures,
    archetype: {
      name: input.name,
      lodDist: input.lodDist,
      flags: input.dynamic ? ARCHETYPE_FLAG_DYNAMIC : ARCHETYPE_FLAG_STATIC,
      bbMin: min,
      bbMax: max,
      bsCentre: centre,
      bsRadius: radius,
      hdTextureDist: input.hdTextureDist,
    },
    stats: {
      vertices,
      triangles,
      geometries: all.length,
      collisionTriangles: col?.triangles ?? 0,
      collisionType: col?.type ?? 'None',
    },
    warnings,
  }
}

