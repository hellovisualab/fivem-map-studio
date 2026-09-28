import * as THREE from 'three'
import { boxUV, faceArea, faceNormal, triangulateFace } from '@/lib/modeler/mesh'
import { applyModifiers } from '@/lib/modeler/modifiers'
import type { EditMesh, ModelDoc, ModelMaterial, ModelObject, Vec2, Vec3 } from '@/lib/modeler/types'

/*
 * Modeler document -> three.js. The document is Z up (Blender / GTA); three.js scenes in
 * the app are Y up, so everything built for them sits under a -90° X rotation:
 * (x, y, z) Z up -> (x, z, -y) Y up.
 */

export const Z_UP_ROTATION = new THREE.Euler(-Math.PI / 2, 0, 0)

/** The mesh an object shows: its edit mesh with the modifier stack applied. */
export function evaluateObject(obj: ModelObject): EditMesh {
  return obj.modifiers.some((m) => m.enabled) ? applyModifiers(obj.mesh, obj.modifiers) : obj.mesh
}

/** Object -> document space matrix. */
export function objectMatrix(obj: Pick<ModelObject, 'position' | 'rotation' | 'scale'>, target = new THREE.Matrix4()) {
  return target.compose(
    new THREE.Vector3(...obj.position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(obj.rotation[0], obj.rotation[1], obj.rotation[2], 'XYZ')),
    new THREE.Vector3(...obj.scale),
  )
}

export interface GeometryOptions {
  /** Smoothing angle in degrees for faces marked smooth. */
  autoSmooth: number
  /** Box UV density (repeats per metre) for a material slot, or null to use the face UVs. */
  boxUV?: (slot: number) => number | null
  /** Object scale, so box UVs keep their size on scaled objects. */
  scale?: Vec3
}

/**
 * Triangulated, non-indexed geometry with one group per material slot. The index of the
 * polygon every triangle came from is kept in `userData.faceOfTriangle` for picking.
 */
export function buildGeometry(mesh: EditMesh, opts: GeometryOptions): THREE.BufferGeometry {
  const { verts, faces } = mesh
  const normals: Vec3[] = []
  const areas: number[] = []
  for (const f of faces) {
    normals.push(f.v.length >= 3 ? faceNormal(mesh, f) : [0, 0, 1])
    areas.push(f.v.length >= 3 ? Math.max(faceArea(mesh, f), 1e-12) : 0)
  }
  // faces around every vertex, for smooth normals
  const vFaces: number[][] = verts.map(() => [])
  faces.forEach((f, fi) => {
    if (f.smooth) for (const v of f.v) vFaces[v]?.push(fi)
  })
  const cosLimit = Math.cos((Math.min(180, Math.max(0, opts.autoSmooth)) * Math.PI) / 180) - 1e-6
  const s = opts.scale ?? [1, 1, 1]

  interface Tri {
    face: number
    mat: number
    corners: [number, number, number]
  }
  const tris: Tri[] = []
  faces.forEach((f, fi) => {
    if (f.v.length < 3) return
    for (const t of triangulateFace(mesh, f)) tris.push({ face: fi, mat: f.mat, corners: t })
  })
  tris.sort((a, b) => a.mat - b.mat || a.face - b.face)

  const count = tris.length * 3
  const pos = new Float32Array(count * 3)
  const nrm = new Float32Array(count * 3)
  const uvs = new Float32Array(count * 2)
  const faceOfTriangle = new Int32Array(tris.length)
  const geo = new THREE.BufferGeometry()
  let groupStart = 0
  let groupMat = tris.length ? tris[0].mat : 0
  const cornerNormal = (fi: number, v: number): Vec3 => {
    const fn = normals[fi]
    if (!faces[fi].smooth) return fn
    let x = 0
    let y = 0
    let z = 0
    for (const g of vFaces[v]) {
      const gn = normals[g]
      if (g !== fi && fn[0] * gn[0] + fn[1] * gn[1] + fn[2] * gn[2] < cosLimit) continue
      x += gn[0] * areas[g]
      y += gn[1] * areas[g]
      z += gn[2] * areas[g]
    }
    const l = Math.hypot(x, y, z)
    return l > 1e-12 ? [x / l, y / l, z / l] : fn
  }
  tris.forEach((t, ti) => {
    if (t.mat !== groupMat) {
      geo.addGroup(groupStart, ti * 3 - groupStart, groupMat)
      groupStart = ti * 3
      groupMat = t.mat
    }
    faceOfTriangle[ti] = t.face
    const f = faces[t.face]
    const perMetre = opts.boxUV?.(f.mat) ?? null
    for (let c = 0; c < 3; c++) {
      const corner = t.corners[c]
      const vi = f.v[corner]
      const p = verts[vi]
      const o = ti * 3 + c
      pos[o * 3] = p[0]
      pos[o * 3 + 1] = p[1]
      pos[o * 3 + 2] = p[2]
      const n = cornerNormal(t.face, vi)
      nrm[o * 3] = n[0]
      nrm[o * 3 + 1] = n[1]
      nrm[o * 3 + 2] = n[2]
      let uv: Vec2
      if (perMetre !== null) {
        const fn = normals[t.face]
        uv = boxUV([p[0] * s[0], p[1] * s[1], p[2] * s[2]], [fn[0] / (s[0] || 1), fn[1] / (s[1] || 1), fn[2] / (s[2] || 1)], perMetre)
      } else uv = f.uv[corner] ?? [0, 0]
      uvs[o * 2] = uv[0]
      uvs[o * 2 + 1] = uv[1]
    }
  })
  if (tris.length) geo.addGroup(groupStart, count - groupStart, groupMat)
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3))
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geo.userData.faceOfTriangle = faceOfTriangle
  geo.computeBoundingBox()
  geo.computeBoundingSphere()
  return geo
}

/** Geometry of an object as shown (modifiers applied), in its local space. */
export function objectGeometry(obj: ModelObject, materials: ModelMaterial[], mesh = evaluateObject(obj)) {
  const byId = new Map(materials.map((m) => [m.id, m]))
  return buildGeometry(mesh, {
    autoSmooth: obj.autoSmooth,
    scale: obj.scale,
    boxUV: (slot) => {
      const mat = byId.get(obj.materials[slot] ?? obj.materials[0])
      return !mat || mat.uvMode === 'box' ? (mat?.uvScale ?? 1) : null
    },
  })
}

/* ---------------------------------------------------------------------------------------- */
/* Materials                                                                                 */

/** Keeps one three.js material per document material, with textures loaded from data URLs. */
export class MaterialLibrary {
  private materials = new Map<string, THREE.MeshStandardMaterial>()
  private applied = new Map<string, string>()
  private textures = new Map<string, { texture: THREE.Texture; ready: Promise<void> }>()
  readonly fallback = new THREE.MeshStandardMaterial({ color: '#cccccc', roughness: 0.6, name: 'Material' })

  get(mat: ModelMaterial | undefined): THREE.MeshStandardMaterial {
    if (!mat) return this.fallback
    let m = this.materials.get(mat.id)
    if (!m) {
      m = new THREE.MeshStandardMaterial()
      this.materials.set(mat.id, m)
    }
    const key = JSON.stringify(mat)
    if (this.applied.get(mat.id) !== key) {
      this.applied.set(mat.id, key)
      this.apply(m, mat)
    }
    return m
  }

  private texture(url: string) {
    let entry = this.textures.get(url)
    if (!entry) {
      const texture = new THREE.Texture()
      texture.colorSpace = THREE.SRGBColorSpace
      texture.wrapS = THREE.RepeatWrapping
      texture.wrapT = THREE.RepeatWrapping
      texture.anisotropy = 4
      const ready = new Promise<void>((resolve) => {
        const img = new Image()
        img.onload = () => {
          texture.image = img
          texture.needsUpdate = true
          resolve()
        }
        img.onerror = () => resolve()
        img.src = url
      })
      entry = { texture, ready }
      this.textures.set(url, entry)
    }
    return entry
  }

  private apply(m: THREE.MeshStandardMaterial, mat: ModelMaterial) {
    m.name = mat.name
    m.color.set(mat.color)
    m.metalness = mat.metalness
    m.roughness = mat.roughness
    m.opacity = mat.opacity
    m.transparent = mat.opacity < 0.999
    m.depthWrite = !m.transparent
    m.side = mat.doubleSided ? THREE.DoubleSide : THREE.FrontSide
    // pushed back slightly so edit mode wires drawn on the surface stay visible
    m.polygonOffset = true
    m.polygonOffsetFactor = 1
    m.polygonOffsetUnits = 1
    const map = mat.texture ? this.texture(mat.texture).texture : null
    m.map = map
    if (mat.emissive > 0) {
      m.emissive.set(mat.color)
      m.emissiveIntensity = mat.emissive
      m.emissiveMap = map
    } else {
      m.emissive.set('#000000')
      m.emissiveIntensity = 1
      m.emissiveMap = null
    }
    m.needsUpdate = true
  }

  /** Resolves once every texture used by `mats` has loaded (or failed). */
  async ready(mats: ModelMaterial[]) {
    await Promise.all(mats.filter((m) => m.texture).map((m) => this.texture(m.texture!).ready))
  }

  forObject(obj: ModelObject, all: ModelMaterial[]): THREE.Material[] {
    const byId = new Map(all.map((m) => [m.id, m]))
    const list = obj.materials.length ? obj.materials : [all[0]?.id ?? '']
    return list.map((id) => this.get(byId.get(id)))
  }

  dispose() {
    for (const m of this.materials.values()) m.dispose()
    for (const t of this.textures.values()) t.texture.dispose()
    this.fallback.dispose()
    this.materials.clear()
    this.textures.clear()
    this.applied.clear()
  }
}

/** Materials shared by the modeler viewport and the props it produces. */
export const modelMaterials = new MaterialLibrary()

/* ---------------------------------------------------------------------------------------- */
/* Document -> scene                                                                         */

/**
 * The visual objects as a Y-up group (meshes keep their object transforms under a
 * Z-up -> Y-up root), ready for the prop pipeline.
 */
export function docToThree(doc: ModelDoc, library: MaterialLibrary): THREE.Group {
  const root = new THREE.Group()
  root.name = 'model'
  root.rotation.copy(Z_UP_ROTATION)
  for (const obj of doc.objects) {
    // hidden objects are hidden while modelling only; they are still part of the prop
    if (obj.role !== 'visual' || !obj.mesh.faces.length) continue
    const geo = objectGeometry(obj, doc.materials)
    if (!geo.attributes.position.count) {
      geo.dispose()
      continue
    }
    const mesh = new THREE.Mesh(geo, library.forObject(obj, doc.materials))
    mesh.name = obj.name
    mesh.position.set(...obj.position)
    mesh.rotation.set(obj.rotation[0], obj.rotation[1], obj.rotation[2], 'XYZ')
    mesh.scale.set(...obj.scale)
    mesh.castShadow = true
    mesh.receiveShadow = true
    root.add(mesh)
  }
  const wrapper = new THREE.Group()
  wrapper.add(root)
  wrapper.userData.fromModeler = true
  return wrapper
}

/** Collision objects as geometries in Y-up space (object transforms applied), one per object. */
export function collisionGeometries(doc: ModelDoc): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  const toYUp = new THREE.Matrix4().makeRotationFromEuler(Z_UP_ROTATION)
  for (const obj of doc.objects) {
    if (obj.role !== 'collision' || !obj.mesh.faces.length) continue
    const geo = buildGeometry(evaluateObject(obj), { autoSmooth: 0 })
    geo.clearGroups()
    geo.deleteAttribute('uv')
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(toYUp, objectMatrix(obj)))
    out.push(geo)
  }
  return out
}

/* ---------------------------------------------------------------------------------------- */
/* Import                                                                                    */

function imageDataUrl(tex: THREE.Texture | null | undefined): string | undefined {
  const img = tex?.image as (CanvasImageSource & { width?: number; height?: number }) | undefined
  if (!img || !img.width || !img.height || typeof document === 'undefined') return undefined
  try {
    const canvas = document.createElement('canvas')
    const max = 2048
    const k = Math.min(1, max / Math.max(img.width, img.height))
    canvas.width = Math.max(1, Math.round(img.width * k))
    canvas.height = Math.max(1, Math.round(img.height * k))
    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
  } catch {
    return undefined
  }
}

/**
 * Converts a Y-up three.js object into modeler objects (one per mesh, vertices welded by
 * position, UVs kept per corner). Materials are appended to `materials`.
 */
export function importObject3D(root: THREE.Object3D, newId: () => string): { objects: ModelObject[]; materials: ModelMaterial[] } {
  root.updateMatrixWorld(true)
  const toZUp = new THREE.Matrix4().makeRotationFromEuler(Z_UP_ROTATION).invert()
  const materials: ModelMaterial[] = []
  const matIds = new Map<THREE.Material, string>()
  const objects: ModelObject[] = []
  const v = new THREE.Vector3()
  const n = new THREE.Vector3()
  root.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry?.attributes.position) return
    const geo = mesh.geometry
    const posAttr = geo.attributes.position
    const nrmAttr = geo.attributes.normal
    const uvAttr = geo.attributes.uv
    const matrix = new THREE.Matrix4().multiplyMatrices(toZUp, mesh.matrixWorld)
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix)
    const flip = matrix.determinant() < 0
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const slotIds: string[] = []
    for (const m of mats) {
      let id = matIds.get(m)
      if (!id) {
        const std = m as THREE.MeshStandardMaterial
        id = newId()
        matIds.set(m, id)
        const texture = imageDataUrl(std.map)
        materials.push({
          id,
          name: m.name || `Material ${materials.length + 1}`,
          color: std.color ? `#${std.color.getHexString(THREE.SRGBColorSpace)}` : '#cccccc',
          texture,
          uvMode: 'mesh',
          uvScale: 1,
          metalness: std.metalness ?? 0,
          roughness: std.roughness ?? 0.6,
          emissive: std.emissive && std.emissive.getHex() !== 0 ? (std.emissiveIntensity ?? 1) : 0,
          opacity: m.transparent ? m.opacity : 1,
          doubleSided: m.side === THREE.DoubleSide,
        })
      }
      slotIds.push(id)
    }
    const flipV = mats.map((m) => {
      const map = (m as THREE.MeshStandardMaterial).map
      return map ? !map.flipY : false
    })
    // weld by position
    const verts: Vec3[] = []
    const weld = new Map<string, number>()
    const vertOf = (i: number) => {
      v.fromBufferAttribute(posAttr, i).applyMatrix4(matrix)
      const key = `${Math.round(v.x * 1e5)},${Math.round(v.y * 1e5)},${Math.round(v.z * 1e5)}`
      let idx = weld.get(key)
      if (idx === undefined) {
        idx = verts.length
        verts.push([v.x, v.y, v.z])
        weld.set(key, idx)
      }
      return idx
    }
    const index = geo.index
    const total = index ? index.count : posAttr.count
    const at = (k: number) => (index ? index.getX(k) : k)
    const groups = geo.groups.length ? geo.groups : [{ start: 0, count: total, materialIndex: 0 }]
    const faces: EditMesh['faces'] = []
    for (const g of groups) {
      const slot = Math.min(slotIds.length - 1, g.materialIndex ?? 0)
      const end = Math.min(g.start + g.count, total)
      for (let k = g.start; k + 2 < end; k += 3) {
        let ids = [at(k), at(k + 1), at(k + 2)]
        if (flip) ids = [ids[0], ids[2], ids[1]]
        const vv = ids.map(vertOf)
        if (vv[0] === vv[1] || vv[1] === vv[2] || vv[0] === vv[2]) continue
        const uv = ids.map((i) => (uvAttr ? ([uvAttr.getX(i), flipV[slot] ? 1 - uvAttr.getY(i) : uvAttr.getY(i)] as Vec2) : ([0, 0] as Vec2)))
        let smooth = false
        if (nrmAttr) {
          const a = verts[vv[0]]
          const b = verts[vv[1]]
          const c = verts[vv[2]]
          const fn = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).cross(new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2])).normalize()
          for (const i of ids) {
            n.fromBufferAttribute(nrmAttr, i).applyMatrix3(normalMatrix).normalize()
            if (n.dot(fn) < 0.9995) smooth = true
          }
        }
        faces.push({ v: vv, uv, mat: slot, smooth })
      }
    }
    if (!faces.length) return
    objects.push({
      id: newId(),
      name: mesh.name || `Mesh ${objects.length + 1}`,
      mesh: { verts, faces },
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      materials: slotIds,
      modifiers: [],
      visible: true,
      role: 'visual',
      autoSmooth: 60,
    })
  })
  return { objects, materials }
}
