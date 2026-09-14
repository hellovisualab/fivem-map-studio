import type { MapDocument, MapElement, TextElement } from '@/types'
import { getPresetMap, getResolvedPreset, resolvePresetSource } from './basemaps'
import { MARKER_PATHS } from './icons'
import { loadDocumentFonts } from './fonts'
import { composeBaseMap, drawStyledBase, effectsOf, isClipped, styleOf, toComposite } from './mapStyle'
import { loadImage, rgba } from './utils'

/**
 * Base texture URL for a document. Presets resolve to the real texture under
 * /maps/ once `ensureBaseSrc` has run, otherwise to the procedural map.
 */
export function resolveBaseSrc(doc: MapDocument): string {
  if (doc.baseMap.preset !== 'custom' && !doc.baseMap.src) {
    const real = getResolvedPreset(doc.baseMap.preset)
    return real?.real ? real.src : getPresetMap(doc.baseMap.preset)
  }
  return doc.baseMap.src
}

/** Waits for the preset lookup (manifest / folder probe) so `resolveBaseSrc` returns the final URL. */
export async function ensureBaseSrc(doc: MapDocument): Promise<string> {
  if (doc.baseMap.preset !== 'custom' && !doc.baseMap.src) await resolvePresetSource(doc.baseMap.preset)
  return resolveBaseSrc(doc)
}

const imageCache = new Map<string, Promise<HTMLImageElement>>()
const cachedImage = (src: string) => {
  let p = imageCache.get(src)
  if (!p) {
    p = loadImage(src)
    imageCache.set(src, p)
  }
  return p
}

const textContent = (el: TextElement) => (el.uppercase ? el.text.toUpperCase() : el.text)

/** Konva draws multi-line text line by line from the top; mirror that here. */
function drawTextLines(ctx: CanvasRenderingContext2D, el: TextElement) {
  const lines = textContent(el).split('\n')
  const lineHeight = el.fontSize
  ctx.font = `${el.fontStyle} ${el.fontSize}px "${el.fontFamily}", Inter, sans-serif`
  ctx.textBaseline = 'top'
  if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${el.letterSpacing ?? 0}px`
  lines.forEach((line, i) => {
    const y = i * lineHeight
    if (el.stroke && el.strokeWidth) {
      ctx.lineJoin = 'round'
      ctx.strokeStyle = el.stroke
      ctx.lineWidth = el.strokeWidth * 2
      ctx.strokeText(line, 0, y)
    }
    ctx.fillStyle = el.fill
    ctx.fillText(line, 0, y)
  })
}

function drawElement(ctx: CanvasRenderingContext2D, el: MapElement, images: Map<string, HTMLImageElement>, pixelScale = 1) {
  if (!el.visible) return
  const fx = effectsOf(el)
  ctx.save()
  ctx.globalAlpha = el.opacity
  ctx.globalCompositeOperation = toComposite(fx.blend)
  if (fx.shadowEnabled) {
    // Shadow attributes ignore the CTM, so scale them by hand to match the editor.
    ctx.shadowColor = rgba(fx.shadowColor, fx.shadowOpacity)
    ctx.shadowBlur = fx.shadowBlur * pixelScale
    ctx.shadowOffsetX = fx.shadowOffsetX * pixelScale
    ctx.shadowOffsetY = fx.shadowOffsetY * pixelScale
  }
  ctx.translate(el.x, el.y)
  ctx.rotate((el.rotation * Math.PI) / 180)

  switch (el.type) {
    case 'text': {
      drawTextLines(ctx, el)
      break
    }
    case 'image': {
      const img = images.get(el.src)
      if (img) ctx.drawImage(img, 0, 0, el.width, el.height)
      break
    }
    case 'zone': {
      ctx.beginPath()
      for (let i = 0; i < el.points.length; i += 2) {
        if (i === 0) ctx.moveTo(el.points[i], el.points[i + 1])
        else ctx.lineTo(el.points[i], el.points[i + 1])
      }
      ctx.closePath()
      ctx.fillStyle = rgba(el.fill, el.fillOpacity)
      ctx.fill()
      if (el.strokeWidth > 0) {
        ctx.strokeStyle = el.stroke
        ctx.lineWidth = el.strokeWidth
        ctx.lineJoin = 'round'
        ctx.stroke()
      }
      if (el.showLabel && el.name) {
        let cx = 0
        let cy = 0
        const n = el.points.length / 2
        for (let i = 0; i < el.points.length; i += 2) {
          cx += el.points[i]
          cy += el.points[i + 1]
        }
        cx /= n
        cy /= n
        ctx.font = 'bold 22px Inter, sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.lineWidth = 4
        ctx.strokeStyle = 'rgba(0,0,0,0.7)'
        ctx.strokeText(el.name, cx, cy)
        ctx.fillStyle = '#ffffff'
        ctx.fillText(el.name, cx, cy)
      }
      break
    }
    case 'line': {
      ctx.beginPath()
      for (let i = 0; i < el.points.length; i += 2) {
        if (i === 0) ctx.moveTo(el.points[i], el.points[i + 1])
        else ctx.lineTo(el.points[i], el.points[i + 1])
      }
      ctx.strokeStyle = el.stroke
      ctx.lineWidth = el.strokeWidth
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      if (el.dash) ctx.setLineDash([el.strokeWidth * 3, el.strokeWidth * 2])
      ctx.stroke()
      if (el.arrow && el.points.length >= 4) {
        ctx.setLineDash([])
        const n = el.points.length
        const x1 = el.points[n - 4]
        const y1 = el.points[n - 3]
        const x2 = el.points[n - 2]
        const y2 = el.points[n - 1]
        const a = Math.atan2(y2 - y1, x2 - x1)
        const len = el.strokeWidth * 4
        ctx.fillStyle = el.stroke
        ctx.beginPath()
        ctx.moveTo(x2, y2)
        ctx.lineTo(x2 - len * Math.cos(a - 0.45), y2 - len * Math.sin(a - 0.45))
        ctx.lineTo(x2 - len * Math.cos(a + 0.45), y2 - len * Math.sin(a + 0.45))
        ctx.closePath()
        ctx.fill()
      }
      break
    }
    case 'marker': {
      const r = el.size / 2
      ctx.beginPath()
      ctx.arc(0, 0, r, 0, Math.PI * 2)
      ctx.fillStyle = el.color
      ctx.fill()
      ctx.lineWidth = Math.max(1.5, el.size * 0.07)
      ctx.strokeStyle = '#ffffff'
      ctx.stroke()
      if (el.icon === 'custom' && el.customSrc) {
        const img = images.get(el.customSrc)
        if (img) {
          const s = r * 1.2
          ctx.save()
          ctx.beginPath()
          ctx.arc(0, 0, r * 0.82, 0, Math.PI * 2)
          ctx.clip()
          ctx.drawImage(img, -s / 2, -s / 2, s, s)
          ctx.restore()
        }
      } else {
        const scale = (el.size * 0.6) / 24
        ctx.save()
        ctx.scale(scale, scale)
        ctx.translate(-12, -12)
        ctx.fillStyle = '#ffffff'
        ctx.fill(new Path2D(MARKER_PATHS[el.icon]))
        ctx.restore()
      }
      if (el.label) {
        ctx.font = `bold ${Math.max(12, el.size * 0.42)}px Inter, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.lineWidth = 4
        ctx.strokeStyle = 'rgba(0,0,0,0.75)'
        ctx.strokeText(el.label, 0, r + 4)
        ctx.fillStyle = '#ffffff'
        ctx.fillText(el.label, 0, r + 4)
      }
      break
    }
  }
  ctx.restore()
}

export interface RenderOptions {
  /** Output scale relative to the document's native size. */
  scale?: number
  /** Skip the base map (renders only elements on a transparent canvas). */
  overlayOnly?: boolean
  /** Explicit max width; overrides scale. */
  maxWidth?: number
}

/** Rasterizes the whole document with the 2D canvas API. */
export async function renderDocument(doc: MapDocument, opts: RenderOptions = {}): Promise<HTMLCanvasElement> {
  const { width, height } = doc.baseMap
  let scale = opts.scale ?? 1
  if (opts.maxWidth) scale = Math.min(1, opts.maxWidth / width)

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const ctx = canvas.getContext('2d')!
  ctx.scale(scale, scale)

  const srcs = new Set<string>()
  for (const el of doc.elements) {
    if (el.type === 'image') srcs.add(el.src)
    if (el.type === 'marker' && el.customSrc) srcs.add(el.customSrc)
  }
  const images = new Map<string, HTMLImageElement>()
  await Promise.all(
    [...srcs].map(async (s) => {
      try {
        images.set(s, await cachedImage(s))
      } catch {
        /* skip broken image */
      }
    }),
  )

  await loadDocumentFonts(doc)

  const clipped = doc.elements.filter(isClipped)
  const free = doc.elements.filter((e) => !isClipped(e))

  if (!opts.overlayOnly) {
    let base: HTMLImageElement | null = null
    const baseSrc = await ensureBaseSrc(doc)
    if (baseSrc) {
      try {
        base = await cachedImage(baseSrc)
      } catch {
        /* keep background */
      }
    }
    if (base) {
      const styled = composeBaseMap(base, width, height, styleOf(doc.baseMap))
      drawStyledBase(ctx, styled, width, height, doc.background, (c) => {
        for (const el of clipped) drawElement(c, el, images, scale)
      })
    } else if (doc.background !== 'transparent') {
      ctx.fillStyle = doc.background
      ctx.fillRect(0, 0, width, height)
    }
  } else {
    // Without the base texture there is nothing to clip against; draw them plainly.
    for (const el of clipped) drawElement(ctx, el, images, scale)
  }

  for (const el of free) drawElement(ctx, el, images, scale)
  return canvas
}

export const canvasToBlob = (canvas: HTMLCanvasElement, type = 'image/png', quality?: number) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), type, quality)
  })
