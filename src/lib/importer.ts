import JSZip from 'jszip'
import { ddsToPngBlob, isDds } from './dds'
import { loadImage, readFileAsDataURL } from './utils'

export interface ImportResult {
  src: string
  width: number
  height: number
  tiles: number
  warnings: string[]
}

const IMAGE_RE = /\.(png|jpe?g|webp|dds)$/i
const TILE_RE = /(\d+)[_-](\d+)\.(png|jpe?g|webp|dds)$/i
const MAX_SIDE = 4096

interface NamedBlob {
  name: string
  blob: Blob
}

async function pushDds(images: NamedBlob[], warnings: string[], name: string, blob: Blob) {
  try {
    images.push({ name: name.replace(/\.dds$/i, '.png'), blob: await ddsToPngBlob(blob) })
  } catch (e) {
    warnings.push(`${name}: ${(e as Error).message}`)
  }
}

async function collect(files: File[]): Promise<{ images: NamedBlob[]; warnings: string[] }> {
  const images: NamedBlob[] = []
  const warnings: string[] = []
  for (const f of files) {
    if (/\.zip$/i.test(f.name)) {
      const zip = await JSZip.loadAsync(f)
      for (const entry of Object.values(zip.files)) {
        if (entry.dir) continue
        const base = entry.name.split('/').pop() ?? entry.name
        if (isDds(base)) {
          await pushDds(images, warnings, base, await entry.async('blob'))
        } else if (IMAGE_RE.test(base)) {
          const blob = await entry.async('blob')
          const type = base.toLowerCase().endsWith('.png') ? 'image/png' : base.toLowerCase().endsWith('.webp') ? 'image/webp' : 'image/jpeg'
          images.push({ name: base, blob: new Blob([blob], { type }) })
        } else if (/\.ytd$/i.test(base)) {
          warnings.push(`${base}: .ytd textures cannot be decoded in the browser. Export them to PNG with OpenIV or Codewalker first.`)
        }
      }
    } else if (isDds(f.name)) {
      await pushDds(images, warnings, f.name, f)
    } else if (IMAGE_RE.test(f.name)) {
      images.push({ name: f.name, blob: f })
    } else if (/\.ytd$/i.test(f.name)) {
      warnings.push(`${f.name}: .ytd textures cannot be decoded in the browser. Export them to PNG with OpenIV or Codewalker first.`)
    } else {
      warnings.push(`${f.name}: unsupported file type, skipped.`)
    }
  }
  return { images, warnings }
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

/**
 * Lays decoded images out as one map. A single image is used as-is (downscaled
 * past MAX_SIDE); several are stitched by their `_X_Y` suffix, or in order when
 * the names carry no coordinates.
 */
export function assembleImages(items: { name: string; img: HTMLImageElement }[]): AssembledMap {
  const warnings: string[] = []
  const placed = items.map((it, i) => {
    const m = items.length > 1 ? TILE_RE.exec(it.name) : null
    return { ...it, col: m ? Number(m[1]) : i, row: m ? Number(m[2]) : 0 }
  })
  const cols = Math.max(...placed.map((p) => p.col)) + 1
  const rows = Math.max(...placed.map((p) => p.row)) + 1
  const tileW = Math.max(...placed.map((l) => l.img.naturalWidth || l.img.width))
  const tileH = Math.max(...placed.map((l) => l.img.naturalHeight || l.img.height))
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
 * `name_X_Y.png` tile sets and ZIP archives containing either.
 */
export async function importMinimapFiles(files: File[]): Promise<ImportResult> {
  const { images, warnings } = await collect(files)
  if (!images.length) {
    throw new Error(warnings[0] ?? 'No supported image files were found. Use PNG, JPG, WebP, DDS or a ZIP containing them.')
  }

  const loaded = await Promise.all(images.map(async (im) => ({ name: im.name, img: await loadImage(await readFileAsDataURL(im.blob)) })))

  if (loaded.length === 1) {
    const { img } = loaded[0]
    if (fitScale(img.width, img.height) === 1) {
      // Keep the original bytes (and format) when no resize is needed.
      return { src: img.src, width: img.width, height: img.height, tiles: 1, warnings }
    }
  }

  const map = assembleImages(loaded)
  return { src: canvasToDataURL(map.canvas), width: map.width, height: map.height, tiles: map.tiles, warnings: [...warnings, ...map.warnings] }
}
