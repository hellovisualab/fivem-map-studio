import JSZip from 'jszip'
import type { BaseMapPreset, MapPresetId } from '@/types'
import { MAP_FOLDERS } from './constants'
import { isDds, isDdsBuffer } from './dds'
import { assembleImages, ddsBlobToFrame, type Frame } from './importer'

export const PRESET_SIZE = { width: 1536, height: 2048 }

type Pt = [number, number]

interface Style {
  sea: string
  seaDeep: string
  coastGlow: string | null
  land: string
  landAlt: string
  mountain: string
  lake: string
  highway: string
  highwayCasing: string
  road: string
  roadCasing: string | null
  cityBlock: string | null
  sand: string
  texture: 'none' | 'satellite' | 'paper'
  format: 'image/png' | 'image/jpeg'
}

const STYLES: Record<Exclude<BaseMapPreset, 'custom'>, Style> = {
  color: {
    sea: '#6fa6d6',
    seaDeep: '#4d86bd',
    coastGlow: 'rgba(255,255,255,0.35)',
    land: '#9dbd72',
    landAlt: '#b3cc86',
    mountain: '#7e9a5e',
    lake: '#6fa6d6',
    highway: '#f2a24d',
    highwayCasing: '#c47a2a',
    road: '#fbf7ee',
    roadCasing: '#d8cdb5',
    cityBlock: '#c9d6b0',
    sand: '#e2d5a6',
    texture: 'none',
    format: 'image/jpeg',
  },
  original: {
    sea: '#0a0a0c',
    seaDeep: '#0a0a0c',
    coastGlow: 'rgba(190,200,215,0.55)',
    land: '#151518',
    landAlt: '#1b1b1f',
    mountain: '#202026',
    lake: '#0e0e11',
    highway: '#e6e6ea',
    highwayCasing: '#8a8a94',
    road: '#b9b9c2',
    roadCasing: null,
    cityBlock: null,
    sand: '#1a1a1e',
    texture: 'none',
    format: 'image/png',
  },
  satellite: {
    sea: '#1d3d5c',
    seaDeep: '#122a44',
    coastGlow: 'rgba(120,170,200,0.25)',
    land: '#4a5a34',
    landAlt: '#65703c',
    mountain: '#7a6c4f',
    lake: '#2b5474',
    highway: '#c9c3b2',
    highwayCasing: '#7c7768',
    road: '#a8a396',
    roadCasing: null,
    cityBlock: '#8b8578',
    sand: '#a89a68',
    texture: 'satellite',
    format: 'image/jpeg',
  },
  realmap: {
    sea: '#cfe1ee',
    seaDeep: '#bcd4e6',
    coastGlow: 'rgba(90,130,160,0.3)',
    land: '#eeebe2',
    landAlt: '#e4e8d6',
    mountain: '#dcd5c3',
    lake: '#cfe1ee',
    highway: '#f4c37a',
    highwayCasing: '#d9a04a',
    road: '#ffffff',
    roadCasing: '#c9c4b8',
    cityBlock: '#e6e1d6',
    sand: '#f1e7c8',
    texture: 'paper',
    format: 'image/jpeg',
  },
  realmapdown: {
    sea: '#2a3441',
    seaDeep: '#1d2531',
    coastGlow: 'rgba(120,140,170,0.3)',
    land: '#3d4652',
    landAlt: '#46505e',
    mountain: '#525a66',
    lake: '#2a3441',
    highway: '#e3b56f',
    highwayCasing: '#b58a45',
    road: '#cfd4dc',
    roadCasing: '#8d939d',
    cityBlock: '#4c5563',
    sand: '#5b6270',
    texture: 'paper',
    format: 'image/jpeg',
  },
}

const ISLAND: Pt[] = [
  [0.42, 0.04], [0.5, 0.045], [0.58, 0.06], [0.66, 0.11], [0.72, 0.18], [0.77, 0.27], [0.8, 0.38],
  [0.78, 0.48], [0.75, 0.58], [0.73, 0.68], [0.68, 0.77], [0.62, 0.85], [0.54, 0.915], [0.46, 0.955],
  [0.38, 0.945], [0.31, 0.89], [0.26, 0.815], [0.215, 0.72], [0.22, 0.62], [0.185, 0.52], [0.2, 0.42],
  [0.235, 0.31], [0.275, 0.21], [0.33, 0.115],
]

const LAKE: Pt[] = [
  [0.40, 0.33], [0.46, 0.31], [0.54, 0.315], [0.61, 0.34], [0.63, 0.375], [0.58, 0.40], [0.50, 0.41], [0.43, 0.395], [0.385, 0.365],
]

const HIGHWAYS: Pt[][] = [
  [[0.34, 0.10], [0.29, 0.2], [0.25, 0.32], [0.23, 0.44], [0.25, 0.56], [0.27, 0.68], [0.3, 0.8], [0.36, 0.9]],
  [[0.56, 0.07], [0.64, 0.15], [0.7, 0.25], [0.73, 0.37], [0.71, 0.5], [0.69, 0.62], [0.64, 0.74], [0.58, 0.84]],
  [[0.46, 0.055], [0.47, 0.17], [0.44, 0.27], [0.50, 0.45], [0.49, 0.58], [0.47, 0.70], [0.46, 0.80]],
  [[0.23, 0.44], [0.36, 0.44], [0.50, 0.45], [0.62, 0.42], [0.73, 0.37]],
  [[0.27, 0.68], [0.36, 0.70], [0.47, 0.70], [0.58, 0.66], [0.69, 0.62]],
  [[0.30, 0.8], [0.36, 0.78], [0.46, 0.80], [0.54, 0.78], [0.64, 0.74]],
  [[0.32, 0.88], [0.40, 0.90], [0.50, 0.89], [0.58, 0.84]],
]

const CITY = { x0: 0.29, y0: 0.73, x1: 0.63, y1: 0.93, rot: -0.14 }

function seeded(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

function smoothPath(ctx: CanvasRenderingContext2D, pts: Pt[], w: number, h: number, closed: boolean, jitter = 0, rnd?: () => number) {
  const P = pts.map(([x, y]) => {
    const jx = jitter && rnd ? (rnd() - 0.5) * jitter : 0
    const jy = jitter && rnd ? (rnd() - 0.5) * jitter : 0
    return [x * w + jx, y * h + jy] as Pt
  })
  const n = P.length
  ctx.beginPath()
  ctx.moveTo(P[0][0], P[0][1])
  const last = closed ? n : n - 1
  for (let i = 0; i < last; i++) {
    const p0 = P[(i - 1 + n) % n]
    const p1 = P[i]
    const p2 = P[(i + 1) % n]
    const p3 = P[(i + 2) % n]
    const c1x = p1[0] + (p2[0] - p0[0]) / 6
    const c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6
    const c2y = p2[1] - (p3[1] - p1[1]) / 6
    if (!closed && (i === 0 || i === last - 1)) {
      ctx.quadraticCurveTo(i === 0 ? c2x : c1x, i === 0 ? c2y : c1y, p2[0], p2[1])
    } else {
      ctx.bezierCurveTo(c1x, c1y, c2x, c2y, p2[0], p2[1])
    }
  }
  if (closed) ctx.closePath()
}

function islandPath(ctx: CanvasRenderingContext2D, w: number, h: number) {
  smoothPath(ctx, ISLAND, w, h, true)
}

function drawTexture(ctx: CanvasRenderingContext2D, w: number, h: number, style: Style, rnd: () => number) {
  if (style.texture === 'none') return
  ctx.save()
  islandPath(ctx, w, h)
  ctx.clip()
  if (style.texture === 'satellite') {
    const colors = ['rgba(60,80,40,0.35)', 'rgba(110,100,60,0.3)', 'rgba(40,60,35,0.35)', 'rgba(130,120,80,0.25)', 'rgba(70,95,50,0.3)']
    for (let i = 0; i < 2600; i++) {
      const x = rnd() * w
      const y = rnd() * h
      const r = 6 + rnd() * 40
      ctx.fillStyle = colors[Math.floor(rnd() * colors.length)]
      ctx.beginPath()
      ctx.ellipse(x, y, r, r * (0.4 + rnd() * 0.8), rnd() * Math.PI, 0, Math.PI * 2)
      ctx.fill()
    }
  } else {
    ctx.globalAlpha = 0.5
    for (let i = 0; i < 900; i++) {
      const x = rnd() * w
      const y = rnd() * h
      const r = 20 + rnd() * 70
      ctx.fillStyle = rnd() > 0.5 ? 'rgba(210,215,195,0.35)' : 'rgba(240,236,225,0.5)'
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.restore()
}

function drawMountains(ctx: CanvasRenderingContext2D, w: number, h: number, style: Style, rnd: () => number) {
  const peaks: [number, number, number][] = [
    [0.42, 0.14, 0.13],
    [0.29, 0.44, 0.09],
    [0.6, 0.65, 0.1],
    [0.66, 0.2, 0.07],
    [0.5, 0.52, 0.06],
  ]
  ctx.save()
  islandPath(ctx, w, h)
  ctx.clip()
  for (const [px, py, pr] of peaks) {
    const cx = px * w
    const cy = py * h
    const r = pr * w
    const g = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r)
    g.addColorStop(0, style.mountain)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()
    // ridge lines
    ctx.strokeStyle = style.texture === 'none' && style.sea === '#0a0a0c' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)'
    ctx.lineWidth = 1.2
    for (let i = 0; i < 9; i++) {
      const a = rnd() * Math.PI * 2
      const len = r * (0.4 + rnd() * 0.5)
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(a) * r * 0.1, cy + Math.sin(a) * r * 0.1)
      ctx.quadraticCurveTo(
        cx + Math.cos(a + 0.3) * len * 0.6,
        cy + Math.sin(a + 0.3) * len * 0.6,
        cx + Math.cos(a) * len,
        cy + Math.sin(a) * len,
      )
      ctx.stroke()
    }
  }
  ctx.restore()
}

function drawRoads(ctx: CanvasRenderingContext2D, w: number, h: number, style: Style, rnd: () => number) {
  ctx.save()
  islandPath(ctx, w, h)
  ctx.clip()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  // Minor roads: wiggly connectors between highway nodes.
  const nodes: Pt[] = HIGHWAYS.flat()
  ctx.lineWidth = 2
  for (let i = 0; i < 70; i++) {
    const a = nodes[Math.floor(rnd() * nodes.length)]
    const b = nodes[Math.floor(rnd() * nodes.length)]
    if (a === b) continue
    const dist = Math.hypot(a[0] - b[0], a[1] - b[1])
    if (dist > 0.3 || dist < 0.05) continue
    const mid: Pt = [(a[0] + b[0]) / 2 + (rnd() - 0.5) * 0.08, (a[1] + b[1]) / 2 + (rnd() - 0.5) * 0.08]
    ctx.strokeStyle = style.roadCasing ?? style.road
    ctx.globalAlpha = style.roadCasing ? 1 : 0.6
    ctx.lineWidth = style.roadCasing ? 4 : 2
    smoothPath(ctx, [a, mid, b], w, h, false)
    ctx.stroke()
    if (style.roadCasing) {
      ctx.strokeStyle = style.road
      ctx.lineWidth = 2.2
      smoothPath(ctx, [a, mid, b], w, h, false)
      ctx.stroke()
    }
  }
  ctx.globalAlpha = 1

  // City grid
  ctx.save()
  const cx = ((CITY.x0 + CITY.x1) / 2) * w
  const cy = ((CITY.y0 + CITY.y1) / 2) * h
  ctx.translate(cx, cy)
  ctx.rotate(CITY.rot)
  const cw = (CITY.x1 - CITY.x0) * w
  const ch = (CITY.y1 - CITY.y0) * h
  const step = 0.026 * w
  if (style.cityBlock) {
    ctx.fillStyle = style.cityBlock
    ctx.globalAlpha = 0.6
    ctx.fillRect(-cw / 2, -ch / 2, cw, ch)
    ctx.globalAlpha = 1
  }
  ctx.strokeStyle = style.road
  ctx.lineWidth = 2.4
  for (let x = -cw / 2; x <= cw / 2; x += step) {
    ctx.beginPath()
    ctx.moveTo(x, -ch / 2)
    ctx.lineTo(x, ch / 2)
    ctx.stroke()
  }
  for (let y = -ch / 2; y <= ch / 2; y += step * 1.4) {
    ctx.beginPath()
    ctx.moveTo(-cw / 2, y)
    ctx.lineTo(cw / 2, y)
    ctx.stroke()
  }
  ctx.restore()

  // Highways
  for (const hw of HIGHWAYS) {
    ctx.strokeStyle = style.highwayCasing
    ctx.lineWidth = 11
    smoothPath(ctx, hw, w, h, false)
    ctx.stroke()
    ctx.strokeStyle = style.highway
    ctx.lineWidth = 6.5
    smoothPath(ctx, hw, w, h, false)
    ctx.stroke()
  }
  ctx.restore()
}

/**
 * @param transparentSea When true the sea is left as alpha (like real minimap
 *   textures), so glow / clipping effects can follow the island silhouette.
 */
function render(preset: Exclude<BaseMapPreset, 'custom'>, transparentSea: boolean): string {
  const { width: w, height: h } = PRESET_SIZE
  const style = STYLES[preset]
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  const rnd = seeded(1337)

  // Sea
  if (!transparentSea) {
    const seaGrad = ctx.createLinearGradient(0, 0, 0, h)
    seaGrad.addColorStop(0, style.sea)
    seaGrad.addColorStop(1, style.seaDeep)
    ctx.fillStyle = seaGrad
    ctx.fillRect(0, 0, w, h)
  }

  // Coast glow
  if (style.coastGlow) {
    ctx.save()
    ctx.shadowColor = style.coastGlow
    ctx.shadowBlur = preset === 'original' ? 90 : 40
    ctx.fillStyle = style.coastGlow
    islandPath(ctx, w, h)
    ctx.fill()
    ctx.restore()
    if (preset === 'original') {
      ctx.save()
      ctx.shadowColor = style.coastGlow
      ctx.shadowBlur = 30
      ctx.fillStyle = 'rgba(160,170,190,0.35)'
      islandPath(ctx, w, h)
      ctx.fill()
      ctx.restore()
    }
  }

  // Sand rim
  ctx.save()
  ctx.strokeStyle = style.sand
  ctx.lineWidth = 14
  islandPath(ctx, w, h)
  ctx.stroke()
  ctx.restore()

  // Land
  ctx.fillStyle = style.land
  islandPath(ctx, w, h)
  ctx.fill()

  // Land variation blobs
  ctx.save()
  islandPath(ctx, w, h)
  ctx.clip()
  for (let i = 0; i < 24; i++) {
    const x = rnd() * w
    const y = rnd() * h
    const r = 80 + rnd() * 220
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, style.landAlt)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()

  drawTexture(ctx, w, h, style, rnd)
  drawMountains(ctx, w, h, style, rnd)

  // Lake
  ctx.save()
  if (transparentSea) {
    ctx.globalCompositeOperation = 'destination-out'
    smoothPath(ctx, LAKE, w, h, true)
    ctx.fill()
    ctx.globalCompositeOperation = 'source-over'
  } else {
    ctx.fillStyle = style.lake
    smoothPath(ctx, LAKE, w, h, true)
    ctx.fill()
  }
  ctx.strokeStyle = style.sand
  ctx.lineWidth = 6
  smoothPath(ctx, LAKE, w, h, true)
  ctx.stroke()
  ctx.restore()

  drawRoads(ctx, w, h, style, rnd)

  // Vignette for satellite
  if (preset === 'satellite') {
    ctx.save()
    if (transparentSea) ctx.globalCompositeOperation = 'source-atop'
    const v = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.75)
    v.addColorStop(0, 'rgba(0,0,0,0)')
    v.addColorStop(1, 'rgba(0,0,0,0.45)')
    ctx.fillStyle = v
    ctx.fillRect(0, 0, w, h)
    ctx.restore()
  }

  return canvas.toDataURL(transparentSea ? 'image/png' : style.format, 0.9)
}

/** Sea color of each procedural preset; used as the document background so the look is unchanged. */
export const PRESET_SEA: Record<Exclude<BaseMapPreset, 'custom'>, string> = {
  color: STYLES.color.sea,
  original: STYLES.original.sea,
  satellite: STYLES.satellite.sea,
  realmap: STYLES.realmap.sea,
  realmapdown: STYLES.realmapdown.sea,
}

const cache = new Map<string, string>()

/** Document texture: island with a transparent sea, rendered on first use. */
export function getPresetMap(preset: Exclude<BaseMapPreset, 'custom'>): string {
  const key = `${preset}:alpha`
  const hit = cache.get(key)
  if (hit) return hit
  const url = render(preset, true)
  cache.set(key, url)
  return url
}

/** Card / backdrop preview with the sea painted in. */
export function getPresetPreview(preset: Exclude<BaseMapPreset, 'custom'>): string {
  const key = `${preset}:opaque`
  const hit = cache.get(key)
  if (hit) return hit
  const url = render(preset, false)
  cache.set(key, url)
  return url
}

export function getPresetMapAsync(preset: Exclude<BaseMapPreset, 'custom'>): Promise<string> {
  return new Promise((resolve) => {
    const hit = cache.get(`${preset}:opaque`)
    if (hit) return resolve(hit)
    // Defer so the UI can paint a loading state before the heavy render.
    setTimeout(() => resolve(getPresetPreview(preset)), 20)
  })
}

export interface PresetSource {
  /**
   * Session URL of the resolved texture (static file or object URL of stitched
   * tiles). Empty string = procedural fallback. Never persisted: documents store
   * only the preset id and resolve it again on load.
   */
  src: string
  width: number
  height: number
  /** True when a real texture was found under /maps/. */
  real: boolean
  /** Displayable URL (real texture or procedural data URL). */
  preview: string
  /** Number of tiles stitched (1 for a single image). */
  tiles: number
  /** Files the lookup considered (from the manifest or folder probing). */
  files: string[]
  /** Human-readable reasons why files were skipped; empty when everything decoded. */
  errors: string[]
}

interface LoadedItem {
  name: string
  img: Frame
}

const REAL_MAP_EXTENSIONS = ['jpg', 'png', 'webp', 'jpeg', 'dds']
const sourceCache = new Map<string, Promise<PresetSource>>()
const resolved = new Map<string, PresetSource>()

/**
 * Manifest written by `scripts/build-maps.mjs` at build time. Version 2
 * entries point at a pre-stitched, downsampled image (plus a preview) so the
 * browser never has to decode the raw DDS tiles. Entries without `full` list
 * the raw files (and the reason the build step could not use them) and are
 * loaded/stitched in the browser as a fallback.
 */
interface ManifestEntry {
  files: string[]
  errors?: string[]
  full?: string
  preview?: string
  width?: number
  height?: number
  tiles?: number
}
type MapsManifest = Record<string, ManifestEntry>
let manifestPromise: Promise<MapsManifest | null> | null = null

const baseUrl = () => import.meta.env.BASE_URL.replace(/\/$/, '')
const mapsUrl = (path: string) => `${baseUrl()}/maps/${path.split('/').map(encodeURIComponent).join('/')}`

function normalizeManifest(json: unknown): MapsManifest | null {
  if (!json || typeof json !== 'object') return null
  const obj = json as Record<string, unknown>
  if (obj.version === 2 && obj.presets && typeof obj.presets === 'object') {
    return obj.presets as MapsManifest
  }
  // Legacy v1: preset id → string[] of file paths.
  const out: MapsManifest = {}
  for (const [k, v] of Object.entries(obj)) if (Array.isArray(v)) out[k] = { files: v as string[] }
  return out
}

function loadManifest(): Promise<MapsManifest | null> {
  if (!manifestPromise) {
    manifestPromise = fetch(`${baseUrl()}/maps/manifest.json`, { cache: 'no-cache' })
      .then(async (r) => {
        if (!r.ok) return null
        // SPA hosts rewrite unknown paths to index.html; guard against HTML.
        const text = await r.text()
        try {
          return normalizeManifest(JSON.parse(text))
        } catch {
          return null
        }
      })
      .catch(() => null)
  }
  return manifestPromise
}

/** Whether a build-time manifest was served (null until the first lookup settles). */
export async function hasMapsManifest(): Promise<boolean> {
  return (await loadManifest()) !== null
}

function loadPlainImage(url: string): Promise<{ img: HTMLImageElement | null; error?: string }> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img.naturalWidth > 0 ? { img } : { img: null, error: 'empty image' })
    // index.html fallbacks fail to decode as an image and land here.
    img.onerror = () => resolve({ img: null, error: 'not found or not a decodable image' })
    img.src = url
  })
}

/** Extracts every image / DDS inside a ZIP served from /maps/. */
async function loadZip(url: string, errors: string[]): Promise<LoadedItem[]> {
  const res = await fetch(url)
  if (!res.ok) {
    errors.push(`${url}: HTTP ${res.status}`)
    return []
  }
  const zip = await JSZip.loadAsync(await res.arrayBuffer())
  const items: LoadedItem[] = []
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue
    const name = entry.name.split('/').pop() ?? entry.name
    try {
      if (isDds(name)) {
        items.push({ name, img: await ddsBlobToFrame(await entry.async('blob')) })
      } else if (/\.(png|jpe?g|webp)$/i.test(name)) {
        const blob = await entry.async('blob')
        const { img, error } = await loadPlainImage(URL.createObjectURL(blob))
        if (img) items.push({ name, img })
        else errors.push(`${name}: ${error}`)
      }
    } catch (e) {
      errors.push(`${name}: ${(e as Error).message}`)
    }
  }
  return items
}

/** Fetches and decodes a DDS URL into a downscaled canvas. Returns the failure reason instead of throwing. */
async function loadDdsFrame(url: string): Promise<{ img: Frame | null; error?: string }> {
  try {
    const res = await fetch(url)
    if (!res.ok) return { img: null, error: `HTTP ${res.status}` }
    if ((res.headers.get('content-type') ?? '').includes('text/html')) return { img: null, error: 'file not found (server returned the app page)' }
    const blob = await res.blob()
    if (!isDdsBuffer(await blob.slice(0, 4).arrayBuffer())) return { img: null, error: 'not a DDS file (missing "DDS " magic)' }
    return { img: await ddsBlobToFrame(blob) }
  } catch (e) {
    return { img: null, error: (e as Error).message }
  }
}

function probeImage(url: string): Promise<{ img: Frame | null; error?: string }> {
  if (isDds(url)) return loadDdsFrame(url)
  return loadPlainImage(url)
}

/** Without a manifest, look for the conventional file names inside the preset folder. */
async function probeFolder(preset: MapPresetId, errors: string[]): Promise<{ items: LoadedItem[]; files: string[] }> {
  const folder = MAP_FOLDERS[preset]
  const singles = [...REAL_MAP_EXTENSIONS.map((e) => `${preset}.${e}`), ...['full', 'minimap', 'map'].flatMap((n) => REAL_MAP_EXTENSIONS.map((e) => `${folder}/${n}.${e}`))]
  for (const path of singles) {
    const { img } = await probeImage(mapsUrl(path))
    if (img) return { items: [{ name: path, img }], files: [path] }
  }
  // Standard GTA V minimap grid: 3 columns × 4 rows.
  for (const prefix of ['minimap_sea_', 'minimap_', 'tile_']) {
    for (const ext of ['png', 'dds', 'jpg', 'webp']) {
      const firstPath = `${folder}/${prefix}0_0.${ext}`
      const first = await probeImage(mapsUrl(firstPath))
      if (!first.img) continue
      const items: LoadedItem[] = [{ name: `${prefix}0_0.${ext}`, img: first.img }]
      const files = [firstPath]
      const rest = await Promise.all(
        Array.from({ length: 12 }, (_, i) => [i % 3, Math.floor(i / 3)] as const)
          .filter(([c, r]) => !(c === 0 && r === 0))
          .map(async ([c, r]) => {
            const name = `${prefix}${c}_${r}.${ext}`
            return { name, ...(await probeImage(mapsUrl(`${folder}/${name}`))) }
          }),
      )
      for (const t of rest) {
        if (t.img) {
          items.push({ name: t.name, img: t.img })
          files.push(`${folder}/${t.name}`)
        } else if (t.error && !/not found/.test(t.error)) errors.push(`${t.name}: ${t.error}`)
      }
      return { items, files }
    }
  }
  return { items: [], files: [] }
}

async function loadFromManifest(preset: MapPresetId, manifest: MapsManifest, errors: string[]): Promise<{ items: LoadedItem[]; files: string[] }> {
  const entry = manifest[preset] ?? manifest[MAP_FOLDERS[preset]]
  const files = entry?.files ?? []
  errors.push(...(entry?.errors ?? []))
  const items: LoadedItem[] = []
  await Promise.all(
    files.map(async (f) => {
      const name = f.split('/').pop() ?? f
      if (/\.zip$/i.test(name)) {
        items.push(...(await loadZip(mapsUrl(f), errors)))
        return
      }
      const { img, error } = await probeImage(mapsUrl(f))
      if (img) items.push({ name, img })
      else errors.push(`${name}: ${error ?? 'could not load'}`)
    }),
  )
  return { items, files }
}

/**
 * Resolves the texture for a preset. Real GTA V maps placed under
 * `public/maps/<folder>/` (single image, `*_X_Y` tiles or a ZIP of either)
 * take priority over the procedural map, so server owners can ship their own
 * licensed assets without code changes.
 */
export function resolvePresetSource(preset: MapPresetId): Promise<PresetSource> {
  let p = sourceCache.get(preset)
  if (!p) {
    p = (async () => {
      const errors: string[] = []
      const manifest = await loadManifest()
      const built = manifest?.[preset] ?? manifest?.[MAP_FOLDERS[preset]]
      let source: PresetSource
      if (built?.full && built.width && built.height) {
        // Pre-stitched at build time: nothing to decode here.
        const src = mapsUrl(built.full)
        source = {
          src,
          width: built.width,
          height: built.height,
          real: true,
          preview: built.preview ? mapsUrl(built.preview) : src,
          tiles: built.tiles ?? 1,
          files: built.files ?? [],
          errors: built.errors ?? [],
        }
        resolved.set(preset, source)
        return source
      }
      const { items, files } = manifest ? await loadFromManifest(preset, manifest, errors) : await probeFolder(preset, errors)
      if (items.length === 1 && items[0].img instanceof HTMLImageElement) {
        const { img } = items[0]
        source = { src: img.src, width: img.naturalWidth, height: img.naturalHeight, real: true, preview: img.src, tiles: 1, files, errors }
      } else if (items.length >= 1) {
        const map = assembleImages(items)
        const blob = await new Promise<Blob | null>((res) => map.canvas.toBlob(res, 'image/png'))
        const url = blob ? URL.createObjectURL(blob) : map.canvas.toDataURL('image/png')
        source = { src: url, width: map.width, height: map.height, real: true, preview: url, tiles: map.tiles, files, errors }
      } else {
        const preview = await getPresetMapAsync(preset)
        source = { src: '', width: PRESET_SIZE.width, height: PRESET_SIZE.height, real: false, preview, tiles: 0, files, errors }
      }
      resolved.set(preset, source)
      return source
    })()
    sourceCache.set(preset, p)
  }
  return p
}

/** Synchronous view of an already-resolved preset (undefined until `resolvePresetSource` settles). */
export const getResolvedPreset = (preset: MapPresetId) => resolved.get(preset)
