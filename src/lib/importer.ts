import JSZip from 'jszip'
import { detectOrientation, layoutTiles, parseTileIndex } from '../../scripts/lib/tiles.mjs'
import { ddsToCanvas, isDds } from './dds'
import { loadImage, readFileAsDataURL } from './utils'

export interface ImportResult {
  src: string
  width: number
  height: number
  tiles: number
  warnings: string[]
}

const IMAGE_RE = /\.(png|jpe?g|webp|dds)$/i
const MAX_SIDE = 4096
/** DDS tiles are decoded to canvases; cap them so a 6 × 4096² set stays within mobile canvas memory. */
const MAX_DDS_TILE_SIDE = 2048

/** Anything drawImage accepts that also reports its size. */
export type Frame = HTMLImageElement | HTMLCanvasElement

const frameW = (f: Frame) => ('naturalWidth' in f && f.naturalWidth) || f.width
const frameH = (f: Frame) => ('naturalHeight' in f && f.naturalHeight) || f.height

interface NamedBlob {
  name: string
  blob: Blob
}

interface NamedFrame {
  name: string
  img: Frame
}

/** Decodes a DDS blob straight to a (possibly downscaled) canvas, skipping the PNG round-trip. */
export async function ddsBlobToFrame(blob: Blob, maxSide = MAX_DDS_TILE_SIDE): Promise<HTMLCanvasElement> {
  const { canvas } = ddsToCanvas(await blob.arrayBuffer())
  const s = Math.min(1, maxSide / Math.max(canvas.width, canvas.height))
  if (s === 1) return canvas
  const small = document.createElement('canvas')
  small.width = Math.round(canvas.width * s)
  small.height = Math.round(canvas.height * s)
  const ctx = small.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(canvas, 0, 0, small.width, small.height)
  canvas.width = canvas.height = 0
  return small
}

async function pushDds(frames: NamedFrame[], warnings: string[], name: string, blob: Blob, multi: boolean) {
  try {
    frames.push({ name, img: await ddsBlobToFrame(blob, multi ? MAX_DDS_TILE_SIDE : MAX_SIDE) })
  } catch (e) {
    warnings.push(`${name}: ${(e as Error).message}`)
  }
}

async function collect(files: File[]): Promise<{ images: NamedBlob[]; frames: NamedFrame[]; warnings: string[] }> {
  const images: NamedBlob[] = []
  const frames: NamedFrame[] = []
  const warnings: string[] = []
  const multi = files.length > 1 || files.some((f) => /\.zip$/i.test(f.name))
  for (const f of files) {
    if (/\.zip$/i.test(f.name)) {
      const zip = await JSZip.loadAsync(f)
      for (const entry of Object.values(zip.files)) {
        if (entry.dir) continue
        const base = entry.name.split('/').pop() ?? entry.name
        if (isDds(base)) {
          await pushDds(frames, warnings, base, await entry.async('blob'), true)
        } else if (IMAGE_RE.test(base)) {
          const blob = await entry.async('blob')
          const type = base.toLowerCase().endsWith('.png') ? 'image/png' : base.toLowerCase().endsWith('.webp') ? 'image/webp' : 'image/jpeg'
          images.push({ name: base, blob: new Blob([blob], { type }) })
        } else if (/\.ytd$/i.test(base)) {
          warnings.push(`${base}: .ytd textures cannot be decoded in the browser. Export them to PNG with OpenIV or Codewalker first.`)
        }
      }
    } else if (isDds(f.name)) {
      await pushDds(frames, warnings, f.name, f, multi)
    } else if (IMAGE_RE.test(f.name)) {
      images.push({ name: f.name, blob: f })
    } else if (/\.ytd$/i.test(f.name)) {
      warnings.push(`${f.name}: .ytd textures cannot be decoded in the browser. Export them to PNG with OpenIV or Codewalker first.`)
    } else {
      warnings.push(`${f.name}: unsupported file type, skipped.`)
    }
  }
  return { images, frames, warnings }
}

function fitScale(w: number, h: number) {
  const longest = Math.max(w, h)
  return longest > MAX_SIDE ? MAX_SIDE / longest : 1
}

/** Coarse alpha probe so transparent-sea minimaps keep their alpha channel on re-encode. */
function hasAlpha(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d')!
  const step = Math.max(8, Math.floor(Math.max(canvas.width, canvas.height) / 96))
  for (let y = 0; y < canvas.height; y += step) {
    const row = ctx.getImageData(0, y, canvas.width, 1).data
    for (let x = 3; x < row.length; x += 4 * step) if (row[x] < 250) return true
  }
  return false
}

export const canvasToDataURL = (canvas: HTMLCanvasElement) => (hasAlpha(canvas) ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.92))

export interface AssembledMap {
  canvas: HTMLCanvasElement
  width: number
  height: number
  tiles: number
  warnings: string[]
}

/** Samples the four 1px edges of a frame (resampled to `n` pixels) for seam matching. */
function edgesOf(img: Frame, n = 256) {
  const w = frameW(img)
  const h = frameH(img)
  const strip = (sx: number, sy: number, sw: number, sh: number, dw: number, dh: number) => {
    const c = document.createElement('canvas')
    c.width = dw
    c.height = dh
    const ctx = c.getContext('2d')!
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh)
    return ctx.getImageData(0, 0, dw, dh).data
  }
  return {
    top: strip(0, 0, w, 1, n, 1),
    bottom: strip(0, h - 1, w, 1, n, 1),
    left: strip(0, 0, 1, h, 1, n),
    right: strip(w - 1, 0, 1, h, 1, n),
  }
}

/**
 * Lays decoded images out as one map. A single image is used as-is (downscaled
 * past MAX_SIDE); several are stitched by their `_a_b` suffix, or in order when
 * the names carry no coordinates. Whether `a` is the column or the row is
 * detected from the tile seams (GTA V's `minimap_sea_<row>_<col>` differs from
 * the `<col>_<row>` most slicers produce).
 */
export function assembleImages(items: NamedFrame[]): AssembledMap {
  const warnings: string[] = []
  const indexed = items.map((it) => ({ ...it, ...(items.length > 1 ? parseTileIndex(it.name) : null) }))
  const allIndexed = indexed.every((t) => t.a != null)
  const tiles = allIndexed
    ? (indexed as (NamedFrame & { a: number; b: number })[])
    : items.map((it, i) => ({ ...it, a: i, b: 0 }))
  const orientation = allIndexed && items.length > 1 ? detectOrientation(tiles, (t) => edgesOf(t.img)) : 'col_row'
  const { cols, rows, placed } = layoutTiles(tiles, orientation)

  const tileW = Math.max(...placed.map((l) => frameW(l.img)))
  const tileH = Math.max(...placed.map((l) => frameH(l.img)))
  const fullW = cols * tileW
  const fullH = rows * tileH
  const s = fitScale(fullW, fullH)

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(fullW * s)
  canvas.height = Math.round(fullH * s)
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  for (const l of placed) ctx.drawImage(l.img, l.col * tileW * s, l.row * tileH * s, tileW * s, tileH * s)
  if (s < 1) warnings.push(`${items.length > 1 ? 'Stitched map' : 'Image'} downscaled to ${canvas.width}×${canvas.height} for editing performance.`)
  return { canvas, width: canvas.width, height: canvas.height, tiles: items.length, warnings }
}

/**
 * Turns dropped files into a single base-map image. Handles single frames,
 * `name_X_Y.png` tile sets, DDS textures and ZIP archives containing any of them.
 */
export async function importMinimapFiles(files: File[]): Promise<ImportResult> {
  const { images, frames, warnings } = await collect(files)
  if (!images.length && !frames.length) {
    throw new Error(warnings[0] ?? 'No supported image files were found. Use PNG, JPG, WebP, DDS or a ZIP containing them.')
  }

  const loaded: NamedFrame[] = [
    ...(await Promise.all(images.map(async (im) => ({ name: im.name, img: await loadImage(await readFileAsDataURL(im.blob)) })))),
    ...frames,
  ]

  if (loaded.length === 1) {
    const { img } = loaded[0]
    if (img instanceof HTMLImageElement && fitScale(img.width, img.height) === 1) {
      // Keep the original bytes (and format) when no resize is needed.
      return { src: img.src, width: img.width, height: img.height, tiles: 1, warnings }
    }
  }

  const map = assembleImages(loaded)
  return { src: canvasToDataURL(map.canvas), width: map.width, height: map.height, tiles: map.tiles, warnings: [...warnings, ...map.warnings] }
}
