import * as THREE from 'three'
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { CollisionKind, PropMaterialInfo } from '@/lib/propTypes'

export function flattenMaterials(mat: THREE.Material | THREE.Material[]): THREE.Material[] {
  return Array.isArray(mat) ? mat : [mat]
}

export function disposeObject(root: THREE.Object3D) {
  root.traverse((c) => {
    const mesh = c as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.geometry?.dispose()
    for (const mat of flattenMaterials(mesh.material)) mat.dispose()
  })
}

export function deepCloneObject(src: THREE.Object3D): THREE.Object3D {
  const matMap = new Map<THREE.Material, THREE.Material>()
  const clone = src.clone(true)
  clone.traverse((c) => {
    const mesh = c as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.geometry = mesh.geometry.clone()
    const mats = flattenMaterials(mesh.material).map((mat) => {
      const existing = matMap.get(mat)
      if (existing) return existing
      const next = mat.clone()
      matMap.set(mat, next)
      return next
    })
    mesh.material = Array.isArray(mesh.material) ? mats : mats[0]
  })
  return clone
}

export function measureObject(root: THREE.Object3D) {
  root.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(root)
  const size = box.getSize(new THREE.Vector3())
  let vertexCount = 0
  let triangleCount = 0
  root.traverse((c) => {
    const mesh = c as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry) return
    const pos = mesh.geometry.getAttribute('position')
    if (!pos) return
    vertexCount += pos.count
    const idx = mesh.geometry.getIndex()
    triangleCount += idx ? idx.count / 3 : pos.count / 3
  })
  return {
    box,
    size: [size.x, size.y, size.z] as [number, number, number],
    min: [box.min.x, box.min.y, box.min.z] as [number, number, number],
    max: [box.max.x, box.max.y, box.max.z] as [number, number, number],
    vertexCount,
    triangleCount: Math.round(triangleCount),
  }
}

/** Scale huge/tiny imports into GTA metres and sit them on the ground, centered on XZ. */
export function fitTransform(root: THREE.Object3D): {
  position: [number, number, number]
  scale: [number, number, number]
} {
  const { box, size } = measureObject(root)
  if (box.isEmpty()) return { position: [0, 0, 0], scale: [1, 1, 1] }
  const maxDim = Math.max(size[0], size[1], size[2])
  let s = 1
  if (maxDim > 60) s = 0.01
  else if (maxDim > 10) s = 1.6 / maxDim
  else if (maxDim < 0.06) s = 0.5 / maxDim
  const center = box.getCenter(new THREE.Vector3())
  return {
    position: [-center.x * s, -box.min.y * s, -center.z * s],
    scale: [s, s, s],
  }
}

export function groundOffset(root: THREE.Object3D, position: [number, number, number], rotation: [number, number, number], scale: [number, number, number]) {
  const box = new THREE.Box3().setFromObject(root)
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion().setFromEuler(
    new THREE.Euler((rotation[0] * Math.PI) / 180, (rotation[1] * Math.PI) / 180, (rotation[2] * Math.PI) / 180),
  )
  m.compose(new THREE.Vector3(...position), q, new THREE.Vector3(...scale))
  box.applyMatrix4(m)
  return -box.min.y
}

function texturePreview(tex: THREE.Texture | null | undefined): string | undefined {
  if (!tex?.image) return undefined
  const img = tex.image as CanvasImageSource & { width?: number; height?: number }
  try {
    const w = img.width || 128
    const h = img.height || 128
    const canvas = document.createElement('canvas')
    const side = 96
    canvas.width = side
    canvas.height = side
    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined
    ctx.drawImage(img, 0, 0, w, h, 0, 0, side, side)
    return canvas.toDataURL('image/png')
  } catch {
    return undefined
  }
}

export function listMaterials(root: THREE.Object3D): PropMaterialInfo[] {
  const seen = new Set<string>()
  const out: PropMaterialInfo[] = []
  root.traverse((c) => {
    const mesh = c as THREE.Mesh
    if (!mesh.isMesh) return
    for (const mat of flattenMaterials(mesh.material)) {
      if (seen.has(mat.uuid)) continue
      seen.add(mat.uuid)
      const std = mat as THREE.MeshStandardMaterial
      out.push({
        uuid: mat.uuid,
        name: mat.name || 'Material',
        color: std.color ? `#${std.color.getHexString()}` : '#c4c4cc',
        metalness: typeof std.metalness === 'number' ? std.metalness : 0,
        roughness: typeof std.roughness === 'number' ? std.roughness : 0.7,
        hasMap: Boolean(std.map),
        previewUrl: texturePreview(std.map),
      })
    }
  })
  return out
}

export function findMaterial(root: THREE.Object3D, uuid: string): THREE.MeshStandardMaterial | null {
  let found: THREE.MeshStandardMaterial | null = null
  root.traverse((c) => {
    const mesh = c as THREE.Mesh
    if (!mesh.isMesh || found) return
    for (const mat of flattenMaterials(mesh.material)) {
      if (mat.uuid === uuid) found = mat as THREE.MeshStandardMaterial
    }
  })
  return found
}

export async function textureFromFile(file: File, flipY: boolean): Promise<THREE.Texture> {
  const url = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Could not read texture'))
      img.src = url
    })
    const tex = new THREE.Texture(image)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.flipY = flipY
    tex.needsUpdate = true
    tex.name = file.name.replace(/\.[^.]+$/, '')
    return tex
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function sampleLocalVertices(root: THREE.Object3D, max = 320): THREE.Vector3[] {
  root.updateMatrixWorld(true)
  const pts: THREE.Vector3[] = []
  const attrPts: THREE.Vector3[] = []
  root.traverse((c) => {
    const mesh = c as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry) return
    const pos = mesh.geometry.getAttribute('position')
    if (!pos) return
    const step = Math.max(1, Math.floor(pos.count / 80))
    for (let i = 0; i < pos.count; i += step) {
      attrPts.push(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(mesh.matrixWorld))
    }
  })
  if (attrPts.length <= max) return attrPts
  const stride = Math.ceil(attrPts.length / max)
  for (let i = 0; i < attrPts.length; i += stride) pts.push(attrPts[i])
  return pts
}

export function makeCollisionGeometry(kind: CollisionKind, min: THREE.Vector3, max: THREE.Vector3, root?: THREE.Object3D): THREE.BufferGeometry | null {
  if (kind === 'none' || kind === 'mesh') return null
  const size = new THREE.Vector3().subVectors(max, min)
  const center = new THREE.Vector3().addVectors(min, max).multiplyScalar(0.5)
  if (kind === 'box') {
    const geo = new THREE.BoxGeometry(Math.max(size.x, 0.02), Math.max(size.y, 0.02), Math.max(size.z, 0.02))
    geo.translate(center.x, center.y, center.z)
    return geo
  }
  if (kind === 'sphere') {
    const r = Math.max(size.x, size.y, size.z) / 2
    const geo = new THREE.SphereGeometry(Math.max(r, 0.02), 20, 14)
    geo.translate(center.x, center.y, center.z)
    return geo
  }
  if (kind === 'capsule') {
    const radius = Math.max(0.02, Math.max(size.x, size.z) / 2)
    const height = Math.max(0.02, size.y - radius * 2)
    const geo = new THREE.CapsuleGeometry(radius, height, 4, 12)
    geo.translate(center.x, center.y, center.z)
    return geo
  }
  const sampled = root ? sampleLocalVertices(root) : []
  const corners = [
    new THREE.Vector3(min.x, min.y, min.z),
    new THREE.Vector3(max.x, min.y, min.z),
    new THREE.Vector3(min.x, max.y, min.z),
    new THREE.Vector3(max.x, max.y, min.z),
    new THREE.Vector3(min.x, min.y, max.z),
    new THREE.Vector3(max.x, min.y, max.z),
    new THREE.Vector3(min.x, max.y, max.z),
    new THREE.Vector3(max.x, max.y, max.z),
  ]
  const pts = [...corners, ...sampled]
  try {
    if (pts.length >= 4) return new ConvexGeometry(pts)
  } catch {
    /* fall through */
  }
  const geo = new THREE.BoxGeometry(Math.max(size.x, 0.02), Math.max(size.y, 0.02), Math.max(size.z, 0.02))
  geo.translate(center.x, center.y, center.z)
  return geo
}

/** Flatten world-space meshes into a single group at the origin (editor Y-up). */
export function bakeWorldMeshes(root: THREE.Object3D): THREE.Group {
  const out = new THREE.Group()
  root.updateMatrixWorld(true)
  root.traverse((c) => {
    const mesh = c as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry) return
    const geo = mesh.geometry.clone()
    geo.applyMatrix4(mesh.matrixWorld)
    const mats = flattenMaterials(mesh.material).map((m) => m.clone())
    const baked = new THREE.Mesh(geo, Array.isArray(mesh.material) ? mats : mats[0])
    baked.name = mesh.name
    baked.castShadow = true
    baked.receiveShadow = true
    out.add(baked)
  })
  return out
}

export function applyPropWorldTransform(
  source: THREE.Object3D,
  position: [number, number, number],
  rotation: [number, number, number],
  scale: [number, number, number],
) {
  const wrapper = new THREE.Group()
  wrapper.add(source.clone(true))
  wrapper.position.set(...position)
  wrapper.rotation.set((rotation[0] * Math.PI) / 180, (rotation[1] * Math.PI) / 180, (rotation[2] * Math.PI) / 180)
  wrapper.scale.set(...scale)
  wrapper.updateMatrixWorld(true)
  return wrapper
}

/** GTA V is Z-up. Editor / glTF is Y-up. */
export function threeToGta(x: number, y: number, z: number) {
  return { x, y: -z, z: y }
}

export function gtaBounds(min: THREE.Vector3, max: THREE.Vector3) {
  const corners = [
    [min.x, min.y, min.z],
    [max.x, min.y, min.z],
    [min.x, max.y, min.z],
    [max.x, max.y, min.z],
    [min.x, min.y, max.z],
    [max.x, min.y, max.z],
    [min.x, max.y, max.z],
    [max.x, max.y, max.z],
  ].map(([x, y, z]) => threeToGta(x, y, z))
  const xs = corners.map((c) => c.x)
  const ys = corners.map((c) => c.y)
  const zs = corners.map((c) => c.z)
  const bbMin = { x: Math.min(...xs), y: Math.min(...ys), z: Math.min(...zs) }
  const bbMax = { x: Math.max(...xs), y: Math.max(...ys), z: Math.max(...zs) }
  const bsCentre = {
    x: (bbMin.x + bbMax.x) / 2,
    y: (bbMin.y + bbMax.y) / 2,
    z: (bbMin.z + bbMax.z) / 2,
  }
  const bsRadius = Math.hypot(bbMax.x - bsCentre.x, bbMax.y - bsCentre.y, bbMax.z - bsCentre.z)
  return { bbMin, bbMax, bsCentre, bsRadius }
}

export function simplifyGeometry(geometry: THREE.BufferGeometry, ratio: number): THREE.BufferGeometry {
  const src = geometry.index ? geometry.toNonIndexed() : geometry.clone()
  const pos = src.getAttribute('position')
  const keep = Math.max(0.04, Math.min(1, ratio))
  if (!pos || pos.count < 48 || keep >= 0.98) return src
  src.computeBoundingBox()
  const bb = src.boundingBox!
  const target = Math.max(32, Math.floor(pos.count * keep))
  const cells = Math.max(6, Math.min(80, Math.ceil(Math.cbrt(target * 2))))
  const dx = Math.max(1e-8, bb.max.x - bb.min.x)
  const dy = Math.max(1e-8, bb.max.y - bb.min.y)
  const dz = Math.max(1e-8, bb.max.z - bb.min.z)
  const clusters = new Map<string, { x: number; y: number; z: number; n: number; i: number }>()
  const remap: number[] = new Array(pos.count)
  const verts: number[] = []
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const cx = Math.min(cells - 1, Math.floor(((x - bb.min.x) / dx) * cells))
    const cy = Math.min(cells - 1, Math.floor(((y - bb.min.y) / dy) * cells))
    const cz = Math.min(cells - 1, Math.floor(((z - bb.min.z) / dz) * cells))
    const key = `${cx}:${cy}:${cz}`
    let cluster = clusters.get(key)
    if (!cluster) {
      cluster = { x: 0, y: 0, z: 0, n: 0, i: verts.length / 3 }
      clusters.set(key, cluster)
      verts.push(0, 0, 0)
    }
    cluster.x += x
    cluster.y += y
    cluster.z += z
    cluster.n += 1
    remap[i] = cluster.i
  }
  for (const c of clusters.values()) {
    verts[c.i * 3] = c.x / c.n
    verts[c.i * 3 + 1] = c.y / c.n
    verts[c.i * 3 + 2] = c.z / c.n
  }
  const indices: number[] = []
  for (let i = 0; i + 2 < pos.count; i += 3) {
    const a = remap[i]
    const b = remap[i + 1]
    const c = remap[i + 2]
    if (a !== b && b !== c && a !== c) indices.push(a, b, c)
  }
  if (indices.length < 9) return src
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  out.setIndex(indices)
  out.computeVertexNormals()
  return out
}

export function mergeObjectGeometry(root: THREE.Object3D): THREE.BufferGeometry | null {
  root.updateMatrixWorld(true)
  const geos: THREE.BufferGeometry[] = []
  root.traverse((c) => {
    const mesh = c as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry?.getAttribute('position')) return
    const cloned = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()
    cloned.applyMatrix4(mesh.matrixWorld)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', cloned.getAttribute('position').clone())
    cloned.dispose()
    geos.push(geo)
  })
  if (!geos.length) return null
  if (geos.length === 1) return geos[0]
  const merged = mergeGeometries(geos, false)
  if (merged) {
    for (const g of geos) g.dispose()
    return merged
  }
  for (let i = 1; i < geos.length; i++) geos[i].dispose()
  return geos[0]
}

export function triangleCountOf(geo: THREE.BufferGeometry) {
  const pos = geo.getAttribute('position')
  return Math.round(geo.index ? geo.index.count / 3 : (pos?.count ?? 0) / 3)
}

/** Visual-shaped collision mesh, optionally decimated with `ratio` (1 = full). */
export function meshCollisionGeometry(root: THREE.Object3D, ratio = 1): THREE.BufferGeometry | null {
  const merged = mergeObjectGeometry(root)
  if (!merged) return null
  if (ratio >= 0.98) {
    merged.computeVertexNormals()
    return merged
  }
  const simplified = simplifyGeometry(merged, ratio)
  if (simplified !== merged) merged.dispose()
  return simplified
}

export function simplifyObject(root: THREE.Object3D, ratio: number): THREE.Group {
  const baked = bakeWorldMeshes(root)
  baked.traverse((c) => {
    const mesh = c as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.geometry = simplifyGeometry(mesh.geometry, ratio)
  })
  return baked
}

export async function canvasPng(image: CanvasImageSource, w: number, h: number): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, w)
  canvas.height = Math.max(1, h)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not encode texture')
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encode failed'))), 'image/png')
  })
}

export async function extractMaterialTextures(root: THREE.Object3D): Promise<{ name: string; blob: Blob }[]> {
  const out: { name: string; blob: Blob }[] = []
  const seen = new Set<string>()
  const jobs: Promise<void>[] = []
  root.traverse((c) => {
    const mesh = c as THREE.Mesh
    if (!mesh.isMesh) return
    for (const mat of flattenMaterials(mesh.material)) {
      const std = mat as THREE.MeshStandardMaterial
      const map = std.map
      if (!map?.image || seen.has(map.uuid)) continue
      seen.add(map.uuid)
      const img = map.image as CanvasImageSource & { width?: number; height?: number }
      const w = img.width || 256
      const h = img.height || 256
      const name = (map.name || std.name || `tex_${out.length}`).replace(/[^\w.-]+/g, '_')
      jobs.push(
        canvasPng(img, w, h)
          .then((blob) => {
            out.push({ name: `${name}.png`, blob })
          })
          .catch(() => {
            /* skip unreadable GPU textures */
          }),
      )
    }
  })
  await Promise.all(jobs)
  return out
}
