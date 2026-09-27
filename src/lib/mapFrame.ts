import type { MapDocument, WorldBounds } from '@/types'
import { presetStyle, type PresetStyle } from './basemaps'
import { CAYO_PERICO, drawCayoPerico } from './cayo'

/**
 * Longest side of the textures the editor keeps for the base map. Some GPUs cap
 * canvas textures at 4096px and draw nothing above that.
 */
export const MAX_EDITOR_TEXTURE = 4096

export interface PixelRect {
  x: number
  y: number
  width: number
  height: number
}

export interface MapFrame {
  /** Canvas size in document pixels: the base texture plus any enabled island. */
  width: number
  height: number
  /** GTA world bounds of the whole canvas. */
  world: WorldBounds
  /** Where the base texture sits on the canvas (always at the origin). */
  texture: PixelRect
  /** The Cayo Perico area in document pixels, or null when the island is off. */
  cayo: PixelRect | null
}

/**
 * Canvas layout of a document. Cayo Perico lies south-east of the vanilla grid, so
 * enabling it grows the canvas to the right and downwards only: the texture keeps
 * the top-left origin and the pixel scale, so element positions and the
 * pixel ↔ world conversion stay exactly the same.
 */
export function mapFrame(doc: MapDocument): MapFrame {
  const { width, height } = doc.baseMap
  const w = doc.world
  const texture = { x: 0, y: 0, width, height }
  const plain: MapFrame = { width, height, world: w, texture, cayo: null }
  if (!doc.cayoPerico || !(w.maxX > w.minX) || !(w.maxY > w.minY)) return plain
  const sx = width / (w.maxX - w.minX)
  const sy = height / (w.maxY - w.minY)
  const b = CAYO_PERICO.bounds
  const frameW = Math.round((Math.max(w.maxX, b.maxX) - w.minX) * sx)
  const frameH = Math.round((w.maxY - Math.min(w.minY, b.minY)) * sy)
  return {
    width: Math.max(width, frameW),
    height: Math.max(height, frameH),
    world: { minX: w.minX, maxX: w.minX + Math.max(width, frameW) / sx, minY: w.maxY - Math.max(height, frameH) / sy, maxY: w.maxY },
    texture,
    cayo: { x: (b.minX - w.minX) * sx, y: (w.maxY - b.maxY) * sy, width: (b.maxX - b.minX) * sx, height: (b.maxY - b.minY) * sy },
  }
}

/** Scale that fits `frame` inside `maxSide` pixels (1 when it already fits). */
export const frameScale = (frame: { width: number; height: number }, maxSide = Infinity) => Math.min(1, maxSide / Math.max(frame.width, frame.height))

/** Average color of the opaque pixels near the middle of a texture (its land). */
function landColor(img: CanvasImageSource, width: number, height: number): [number, number, number] | null {
  try {
    return sampleLand(img, width, height)
  } catch {
    // Cross-origin textures without CORS cannot be read back.
    return null
  }
}

function sampleLand(img: CanvasImageSource, width: number, height: number): [number, number, number] | null {
  const c = document.createElement('canvas')
  c.width = 48
  c.height = 72
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, width * 0.2, height * 0.2, width * 0.6, height * 0.6, 0, 0, c.width, c.height)
  const px = ctx.getImageData(0, 0, c.width, c.height).data
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 200) continue
    r += px[i]
    g += px[i + 1]
    b += px[i + 2]
    n++
  }
  return n ? [r / n, g / n, b / n] : null
}

const hex = ([r, g, b]: [number, number, number]) => `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`
const mix = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

/** Colors for the island: the preset's palette, or one derived from an uploaded texture. */
function islandStyle(doc: MapDocument, img: CanvasImageSource): PresetStyle {
  if (doc.baseMap.preset !== 'custom') return presetStyle(doc.baseMap.preset)
  const land = landColor(img, doc.baseMap.width, doc.baseMap.height)
  if (!land) return presetStyle('color')
  const dark = (0.2126 * land[0] + 0.7152 * land[1] + 0.0722 * land[2]) / 255 < 0.35
  const base = presetStyle(dark ? 'original' : 'color')
  return {
    ...base,
    land: hex(land),
    landAlt: hex(mix(land, [255, 255, 255], 0.08)),
    mountain: hex(mix(land, [0, 0, 0], 0.12)),
    sand: hex(mix(land, dark ? [40, 40, 46] : [226, 213, 166], 0.55)),
    cityBlock: dark ? null : hex(mix(land, [255, 255, 255], 0.3)),
  }
}

const composites = new WeakMap<object, Map<string, HTMLCanvasElement>>()

/**
 * The base picture for a document: the texture alone, or the texture plus the
 * stylized islands the document enables, rendered at `frame × frameScale(maxSide)`.
 * Cached per texture and layout, so style tweaks do not redraw the island.
 */
export function frameSource(img: CanvasImageSource, doc: MapDocument, maxSide = Infinity): CanvasImageSource {
  const frame = mapFrame(doc)
  if (!frame.cayo) return img
  const k = frameScale(frame, maxSide)
  const key = JSON.stringify([frame.width, frame.height, doc.world, doc.baseMap.preset, k])
  let byKey = composites.get(img as object)
  const hit = byKey?.get(key)
  if (hit) return hit

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(frame.width * k))
  canvas.height = Math.max(1, Math.round(frame.height * k))
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0, frame.texture.width * k, frame.texture.height * k)
  const w = doc.world
  const sx = (doc.baseMap.width / (w.maxX - w.minX)) * k
  const sy = (doc.baseMap.height / (w.maxY - w.minY)) * k
  drawCayoPerico(ctx, (x, y) => [(x - w.minX) * sx, (w.maxY - y) * sy], Math.sqrt(sx * sy), islandStyle(doc, img))

  if (!byKey) {
    byKey = new Map()
    composites.set(img as object, byKey)
  }
  // Editor, thumbnail and export sizes alternate; keep a few, drop the oldest.
  if (byKey.size >= 3) byKey.delete(byKey.keys().next().value!)
  byKey.set(key, canvas)
  return canvas
}
