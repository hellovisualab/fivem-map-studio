import * as THREE from 'three'
import JSZip from 'jszip'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { slugify } from '@/lib/utils'

const MODEL_RE = /\.(glb|gltf|obj|fbx|stl)$/i
const IMAGE_RE = /\.(png|jpe?g|webp|dds|tga|bmp)$/i

export interface LoadedPropFile {
  name: string
  file: File
  object: THREE.Group
  sidecarUrls: string[]
  warnings: string[]
}

let draco: DRACOLoader | null = null
function getDraco() {
  if (!draco) {
    draco = new DRACOLoader()
    draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/')
  }
  return draco
}

/** Lowercase letters, digits and underscores: what archetype and file names allow. */
export function cleanModelName(raw: string) {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24)
}

export function gtaModelName(raw: string, used: Set<string>) {
  let base = slugify(raw)
  if (!base.startsWith('prop_') && !base.startsWith('hash_')) base = `prop_${base}`
  base = base.slice(0, 24)
  if (base.length < 6) base = `prop_${base}`.slice(0, 24)
  return uniqueName(base, used)
}

/** `name`, or `name_2`, `name_3`… so no two props share a model name. */
export function uniqueName(base: string, used: Set<string>) {
  let name = base
  let i = 2
  while (used.has(name)) {
    const suffix = `_${i}`
    name = `${base.slice(0, 24 - suffix.length)}${suffix}`
    i += 1
  }
  used.add(name)
  return name
}

/** A valid, unused model name for an edited name (empty falls back to the label). */
export function fixModelName(raw: string, label: string, used: Set<string>) {
  const clean = cleanModelName(raw)
  return clean ? uniqueName(clean, used) : gtaModelName(label || 'prop', used)
}

/**
 * OBJ / FBX loaders create Phong or Lambert materials. Converting them to
 * MeshStandardMaterial makes the metalness / roughness controls work and the
 * exported GLB a proper PBR material.
 */
function standardMaterial(mat: THREE.Material): THREE.Material {
  if ((mat as THREE.MeshStandardMaterial).isMeshStandardMaterial) return mat
  const old = mat as THREE.MeshPhongMaterial
  const shininess = typeof old.shininess === 'number' ? old.shininess : 30
  const next = new THREE.MeshStandardMaterial({
    name: mat.name,
    color: old.color ? old.color.clone() : new THREE.Color('#c4c4cc'),
    map: old.map ?? null,
    normalMap: old.normalMap ?? null,
    bumpMap: old.bumpMap ?? null,
    alphaMap: old.alphaMap ?? null,
    emissive: old.emissive ? old.emissive.clone() : new THREE.Color(0),
    emissiveMap: old.emissiveMap ?? null,
    metalness: 0,
    roughness: Math.min(0.95, Math.max(0.3, 1 - shininess / 100)),
    transparent: mat.transparent,
    opacity: mat.opacity,
    alphaTest: mat.alphaTest,
    side: mat.side,
    vertexColors: mat.vertexColors,
  })
  if (old.bumpScale !== undefined) next.bumpScale = old.bumpScale
  mat.dispose()
  return next
}

function standardize(root: THREE.Object3D) {
  const done = new Map<THREE.Material, THREE.Material>()
  root.traverse((c) => {
    const mesh = c as THREE.Mesh
    if (!mesh.isMesh || !mesh.material) return
    const convert = (m: THREE.Material) => {
      let next = done.get(m)
      if (!next) {
        next = standardMaterial(m)
        done.set(m, next)
      }
      return next
    }
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(convert) : convert(mesh.material)
  })
}

function basename(path: string) {
  return path.split(/[/\\]/).pop() ?? path
}

async function expandZips(input: File[]): Promise<File[]> {
  const out: File[] = []
  for (const file of input) {
    if (!/\.zip$/i.test(file.name)) {
      out.push(file)
      continue
    }
    const zip = await JSZip.loadAsync(file)
    for (const [path, entry] of Object.entries(zip.files)) {
      if (entry.dir || /(^|\/)__MACOSX\//.test(path) || /\/\./.test(path)) continue
      const blob = await entry.async('blob')
      out.push(new File([blob], basename(path), { type: blob.type }))
    }
  }
  return out
}

function sidecarManager(files: File[]) {
  const urls = new Map<string, string>()
  const created: string[] = []
  for (const f of files) {
    const url = URL.createObjectURL(f)
    created.push(url)
    urls.set(basename(f.name).toLowerCase(), url)
  }
  const manager = new THREE.LoadingManager()
  manager.setURLModifier((url) => {
    const clean = decodeURIComponent(url.split('?')[0].split('#')[0])
    const key = basename(clean).toLowerCase()
    return urls.get(key) ?? url
  })
  return { manager, urls: created }
}

async function loadGltf(file: File, files: File[], warnings: string[]): Promise<{ object: THREE.Group; sidecarUrls: string[] }> {
  const { manager, urls } = sidecarManager(files)
  const loader = new GLTFLoader(manager)
  loader.setDRACOLoader(getDraco())
  const buf = await file.arrayBuffer()
  const gltf = await new Promise<THREE.Group>((resolve, reject) => {
    loader.parse(
      buf,
      '',
      (res) => resolve(res.scene),
      (err) => reject(err),
    )
  })
  gltf.traverse((c) => {
    const mesh = c as THREE.Mesh
    if (mesh.isMesh) {
      mesh.castShadow = true
      mesh.receiveShadow = true
    }
  })
  if (/\.gltf$/i.test(file.name) && !files.some((f) => /\.bin$/i.test(f.name) || IMAGE_RE.test(f.name))) {
    warnings.push('GLTF sidecar files (.bin / textures) were not included — drop the whole folder or a ZIP.')
  }
  return { object: gltf, sidecarUrls: urls }
}

async function loadObj(file: File, files: File[]): Promise<{ object: THREE.Group; sidecarUrls: string[] }> {
  const { manager, urls } = sidecarManager(files)
  const text = await file.text()
  const stem = file.name.replace(/\.[^.]+$/, '').toLowerCase()
  const mtlFile = files.find((f) => f.name.toLowerCase() === `${stem}.mtl`)
  const objLoader = new OBJLoader(manager)
  if (mtlFile) {
    const mtl = await mtlFile.text()
    const materials = new MTLLoader(manager).parse(mtl, '')
    materials.preload()
    objLoader.setMaterials(materials)
  }
  const group = objLoader.parse(text)
  group.traverse((c) => {
    const mesh = c as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.castShadow = true
    mesh.receiveShadow = true
    if (!mesh.material) {
      mesh.material = new THREE.MeshStandardMaterial({ color: '#c4c4cc', metalness: 0.1, roughness: 0.7 })
    }
  })
  return { object: group, sidecarUrls: urls }
}

async function loadFbx(file: File, files: File[]): Promise<{ object: THREE.Group; sidecarUrls: string[] }> {
  const { manager, urls } = sidecarManager(files)
  const buf = await file.arrayBuffer()
  const group = new FBXLoader(manager).parse(buf, '')
  group.traverse((c) => {
    const mesh = c as THREE.Mesh
    if (mesh.isMesh) {
      mesh.castShadow = true
      mesh.receiveShadow = true
    }
  })
  return { object: group, sidecarUrls: urls }
}

async function loadStl(file: File): Promise<{ object: THREE.Group; sidecarUrls: string[] }> {
  const buf = await file.arrayBuffer()
  const geo = new STLLoader().parse(buf)
  // STL files are Z-up (Blender, CAD); the editor and glTF are Y-up.
  geo.rotateX(-Math.PI / 2)
  geo.computeVertexNormals()
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#c4c4cc', metalness: 0.05, roughness: 0.8 }))
  mesh.castShadow = true
  const group = new THREE.Group()
  group.add(mesh)
  return { object: group, sidecarUrls: [] }
}

export async function ingestPropFiles(list: File[] | FileList): Promise<LoadedPropFile[]> {
  const expanded = await expandZips(Array.from(list))
  const models = expanded.filter((f) => MODEL_RE.test(f.name))
  if (!models.length) throw new Error('Drop a GLB, GLTF, OBJ, FBX, STL or a ZIP of those files.')
  const loaded: LoadedPropFile[] = []
  for (const file of models) {
    const warnings: string[] = []
    const lower = file.name.toLowerCase()
    let result: { object: THREE.Group; sidecarUrls: string[] }
    if (lower.endsWith('.glb') || lower.endsWith('.gltf')) result = await loadGltf(file, expanded, warnings)
    else if (lower.endsWith('.obj')) result = await loadObj(file, expanded)
    else if (lower.endsWith('.fbx')) result = await loadFbx(file, expanded)
    else result = await loadStl(file)
    standardize(result.object)
    loaded.push({
      name: file.name.replace(/\.[^.]+$/, ''),
      file,
      object: result.object,
      sidecarUrls: result.sidecarUrls,
      warnings,
    })
  }
  return loaded
}

export const PROP_ACCEPT = '.glb,.gltf,.obj,.fbx,.stl,.zip,model/gltf-binary,model/gltf+json'
