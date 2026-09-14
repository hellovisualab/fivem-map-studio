import JSZip from 'jszip'
import { loadImage, readFileAsDataURL } from './utils'

export interface ImportResult {
  src: string
  width: number
  height: number
  tiles: number
  warnings: string[]
}

const IMAGE_RE = /\.(png|jpe?g|webp)$/i
const TILE_RE = /(\d+)[_-](\d+)\.(png|jpe?g|webp)$/i
const MAX_SIDE = 4096

interface NamedBlob {
  name: string
  blob: Blob
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
        if (IMAGE_RE.test(base)) {
          const blob = await entry.async('blob')
          const type = base.toLowerCase().endsWith('.png') ? 'image/png' : base.toLowerCase().endsWith('.webp') ? 'image/webp' : 'image/jpeg'
          images.push({ name: base, blob: new Blob([blob], { type }) })
        } else if (/\.ytd$/i.test(base)) {
          warnings.push(`${base}: .ytd textures cannot be decoded in the browser. Export them to PNG with OpenIV or Codewalker first.`)
        }
      }
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

/**
 * Turns dropped files into a single base-map image. Handles single frames,
 * `name_X_Y.png` tile sets and ZIP archives containing either.
 */
export async function importMinimapFiles(files: File[]): Promise<ImportResult> {
  const { images, warnings } = await collect(files)
  if (!images.length) {
    throw new Error(warnings[0] ?? 'No supported image files were found. Use PNG, JPG, WebP or a ZIP containing them.')
  }

  if (images.length === 1) {
    const src = await readFileAsDataURL(images[0].blob)
    const img = await loadImage(src)
    const s = fitScale(img.width, img.height)
    if (s < 1) {
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * s)
      c.height = Math.round(img.height * s)
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      warnings.push(`Image downscaled to ${c.width}×${c.height} for editing performance.`)
      return { src: c.toDataURL('image/jpeg', 0.92), width: c.width, height: c.height, tiles: 1, warnings }
    }
    return { src, width: img.width, height: img.height, tiles: 1, warnings }
  }

  // Multiple images: stitch by X_Y suffix. Files without coordinates are laid out in order.
  const placed = images.map((im, i) => {
    const m = TILE_RE.exec(im.name)
    return { ...im, col: m ? Number(m[1]) : i, row: m ? Number(m[2]) : 0 }
  })
  const cols = Math.max(...placed.map((p) => p.col)) + 1
  const rows = Math.max(...placed.map((p) => p.row)) + 1

  const loaded = await Promise.all(
    placed.map(async (p) => ({ ...p, img: await loadImage(await readFileAsDataURL(p.blob)) })),
  )
  const tileW = Math.max(...loaded.map((l) => l.img.width))
  const tileH = Math.max(...loaded.map((l) => l.img.height))
  const fullW = cols * tileW
  const fullH = rows * tileH
  const s = fitScale(fullW, fullH)

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(fullW * s)
  canvas.height = Math.round(fullH * s)
  const ctx = canvas.getContext('2d')!
  for (const l of loaded) {
    ctx.drawImage(l.img, l.col * tileW * s, l.row * tileH * s, tileW * s, tileH * s)
  }
  if (s < 1) warnings.push(`Stitched map downscaled to ${canvas.width}×${canvas.height} for editing performance.`)
  return {
    src: canvas.toDataURL('image/jpeg', 0.92),
    width: canvas.width,
    height: canvas.height,
    tiles: loaded.length,
    warnings,
  }
}
