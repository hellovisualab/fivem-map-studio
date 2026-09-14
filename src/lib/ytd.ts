import JSZip from 'jszip'
import { formatBytes } from '@/lib/utils'

export type OptimizePreset = 'quality' | 'balanced' | 'small'

export interface TextureItem {
  id: string
  name: string
  mime: string
  width: number
  height: number
  originalBytes: number
  blob: Blob
  previewUrl: string
  optimizedBlob?: Blob
  optimizedBytes?: number
}

const PRESET_QUALITY: Record<OptimizePreset, { maxSide: number; quality: number; type: string }> = {
  quality: { maxSide: 2048, quality: 0.92, type: 'image/webp' },
  balanced: { maxSide: 1024, quality: 0.8, type: 'image/webp' },
  small: { maxSide: 512, quality: 0.65, type: 'image/webp' },
}

export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024

const IMAGE_RE = /\.(png|jpe?g|webp|dds)$/i

export function isImageName(name: string) {
  return IMAGE_RE.test(name)
}

async function blobToBitmap(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob)
}

export async function loadTextureFromFile(file: File | Blob, name: string): Promise<TextureItem> {
  if (/\.dds$/i.test(name)) {
    // DDS kept as-is for listing; optimize step will skip with note unless decoded later.
    const url = URL.createObjectURL(file)
    return {
      id: `${name}-${file.size}`,
      name,
      mime: 'image/vnd-ms.dds',
      width: 0,
      height: 0,
      originalBytes: file.size,
      blob: file,
      previewUrl: url,
    }
  }
  const bitmap = await blobToBitmap(file instanceof Blob ? file : file)
  const width = bitmap.width
  const height = bitmap.height
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  const previewUrl = canvas.toDataURL('image/png')
  return {
    id: `${name}-${file.size}-${width}`,
    name,
    mime: file.type || 'image/png',
    width,
    height,
    originalBytes: file.size,
    blob: file,
    previewUrl,
  }
}

export async function collectTextures(files: File[]): Promise<{ items: TextureItem[]; warnings: string[] }> {
  const warnings: string[] = []
  const items: TextureItem[] = []
  let total = 0
  for (const file of files) {
    total += file.size
    if (total > MAX_UPLOAD_BYTES) throw new Error('Upload exceeds 500 MB limit')
    if (/\.ytd$/i.test(file.name)) {
      warnings.push(
        `${file.name}: native .ytd rewrite is not available in this browser build. Export textures from OpenIV as PNG/DDS (or ZIP them) and drop those here.`,
      )
      continue
    }
    if (/\.zip$/i.test(file.name)) {
      const zip = await JSZip.loadAsync(file)
      for (const [path, entry] of Object.entries(zip.files)) {
        if (entry.dir || !isImageName(path) || /(^|\/)__MACOSX\//.test(path)) continue
        const blob = await entry.async('blob')
        const name = path.split('/').pop() ?? path
        items.push(await loadTextureFromFile(blob, name))
      }
      continue
    }
    if (isImageName(file.name)) {
      items.push(await loadTextureFromFile(file, file.name))
    } else {
      warnings.push(`${file.name}: unsupported file type`)
    }
  }
  return { items, warnings }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), type, quality)
  })
}

export async function optimizeTexture(item: TextureItem, preset: OptimizePreset): Promise<TextureItem> {
  if (/\.dds$/i.test(item.name) || item.width === 0) {
    return { ...item, optimizedBlob: item.blob, optimizedBytes: item.originalBytes }
  }
  const cfg = PRESET_QUALITY[preset]
  const scale = Math.min(1, cfg.maxSide / Math.max(item.width, item.height))
  const w = Math.max(1, Math.round(item.width * scale))
  const h = Math.max(1, Math.round(item.height * scale))
  const bitmap = await createImageBitmap(item.blob)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  const optimizedBlob = await canvasToBlob(canvas, cfg.type, cfg.quality)
  const ext = cfg.type === 'image/webp' ? '.webp' : '.jpg'
  const base = item.name.replace(/\.[^.]+$/, '')
  return {
    ...item,
    name: `${base}${ext}`,
    width: w,
    height: h,
    optimizedBlob,
    optimizedBytes: optimizedBlob.size,
  }
}

export async function optimizeAll(items: TextureItem[], preset: OptimizePreset) {
  const out: TextureItem[] = []
  for (const item of items) out.push(await optimizeTexture(item, preset))
  return out
}

export function totals(items: TextureItem[]) {
  const original = items.reduce((s, i) => s + i.originalBytes, 0)
  const optimized = items.reduce((s, i) => s + (i.optimizedBytes ?? i.originalBytes), 0)
  return {
    original,
    optimized,
    saved: Math.max(0, original - optimized),
    label: `${formatBytes(original)} → ${formatBytes(optimized)}`,
  }
}

export async function exportOptimizedZip(items: TextureItem[], packName: string) {
  const zip = new JSZip()
  const root = zip.folder(packName)!
  for (const item of items) {
    const blob = item.optimizedBlob ?? item.blob
    root.file(item.name, blob)
  }
  root.file(
    'README.md',
    `# Optimized textures\n\nRe-import these into a .ytd with OpenIV / CodeWalker.\nNative .ytd write is planned; this pack keeps optimized PNG/WebP/DDS ready for that step.\n`,
  )
  return zip.generateAsync({ type: 'blob' })
}
