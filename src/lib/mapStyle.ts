import type { BaseMap, BaseMapStyle, BlendMode, ElementEffects, MapElement } from '@/types'
import { rgba } from './utils'

export const DEFAULT_EFFECTS: ElementEffects = {
  blend: 'normal',
  shadowEnabled: false,
  shadowColor: '#000000',
  shadowBlur: 20,
  shadowOffsetX: 0,
  shadowOffsetY: 0,
  shadowOpacity: 0.8,
  clipToMap: false,
}

export const DEFAULT_STYLE: BaseMapStyle = {
  brightness: 1,
  contrast: 1,
  saturation: 1,
  hue: 0,
  grayscale: 0,
  invert: false,
  tint: '#ff8a1f',
  tintOpacity: 0,
  tintBlend: 'normal',
  gradient: { enabled: false, from: '#ec4899', to: '#7c3aed', angle: 160, opacity: 0.7, blend: 'overlay' },
  glow: { enabled: false, color: '#ff8a1f', size: 120, strength: 2, opacity: 0.9 },
  keyColor: null,
  keyTolerance: 0.12,
}

export const BLEND_MODES: { id: BlendMode; label: string }[] = [
  { id: 'normal', label: 'Normal' },
  { id: 'multiply', label: 'Multiply' },
  { id: 'screen', label: 'Screen' },
  { id: 'overlay', label: 'Overlay' },
  { id: 'soft-light', label: 'Soft light' },
  { id: 'hard-light', label: 'Hard light' },
  { id: 'darken', label: 'Darken' },
  { id: 'lighten', label: 'Lighten' },
  { id: 'color-dodge', label: 'Color dodge' },
  { id: 'color-burn', label: 'Color burn' },
  { id: 'difference', label: 'Difference' },
  { id: 'exclusion', label: 'Exclusion' },
  { id: 'hue', label: 'Hue' },
  { id: 'saturation', label: 'Saturation' },
  { id: 'color', label: 'Color' },
  { id: 'luminosity', label: 'Luminosity' },
]

export const effectsOf = (el: MapElement): ElementEffects => ({ ...DEFAULT_EFFECTS, ...el.effects })

export const styleOf = (bm: BaseMap): BaseMapStyle => ({
  ...DEFAULT_STYLE,
  ...bm,
  gradient: { ...DEFAULT_STYLE.gradient, ...bm.gradient },
  glow: { ...DEFAULT_STYLE.glow, ...bm.glow },
})

export const toComposite = (b: BlendMode): GlobalCompositeOperation => (b === 'normal' ? 'source-over' : b)

export const isClipped = (el: MapElement) => !!el.effects?.clipToMap

export function cssFilter(s: BaseMapStyle): string {
  const parts: string[] = []
  if (s.brightness !== 1) parts.push(`brightness(${s.brightness})`)
  if (s.contrast !== 1) parts.push(`contrast(${s.contrast})`)
  if (s.saturation !== 1) parts.push(`saturate(${s.saturation})`)
  if (s.hue !== 0) parts.push(`hue-rotate(${s.hue}deg)`)
  if (s.grayscale > 0) parts.push(`grayscale(${s.grayscale})`)
  if (s.invert) parts.push('invert(1)')
  return parts.length ? parts.join(' ') : 'none'
}

/** A stable string that changes whenever the styled texture must be re-rendered. */
export const styleKey = (s: BaseMapStyle) => JSON.stringify(s)

function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w))
  c.height = Math.max(1, Math.round(h))
  return c
}

function gradientFor(ctx: CanvasRenderingContext2D, w: number, h: number, angle: number, from: string, to: string, opacity: number) {
  const a = ((angle - 90) * Math.PI) / 180
  const cx = w / 2
  const cy = h / 2
  const len = Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a))
  const dx = (Math.cos(a) * len) / 2
  const dy = (Math.sin(a) * len) / 2
  const g = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy)
  g.addColorStop(0, rgba(from, opacity))
  g.addColorStop(1, rgba(to, opacity))
  return g
}

function applyColorKey(ctx: CanvasRenderingContext2D, w: number, h: number, key: string, tolerance: number) {
  const m = /^#?([0-9a-f]{6})$/i.exec(key.trim())
  if (!m) return
  const n = parseInt(m[1], 16)
  const kr = (n >> 16) & 255
  const kg = (n >> 8) & 255
  const kb = n & 255
  // Soft edge: fully transparent within `tol`, fades out to 1.5×tol.
  const tol = Math.max(1, tolerance * 441.7)
  const soft = tol * 0.5
  const data = ctx.getImageData(0, 0, w, h)
  const px = data.data
  for (let i = 0; i < px.length; i += 4) {
    const dr = px[i] - kr
    const dg = px[i + 1] - kg
    const db = px[i + 2] - kb
    const d = Math.sqrt(dr * dr + dg * dg + db * db)
    if (d <= tol) px[i + 3] = 0
    else if (d < tol + soft) px[i + 3] = Math.round(px[i + 3] * ((d - tol) / soft))
  }
  ctx.putImageData(data, 0, 0)
}

/** Samples the texture's corner pixel as a sea color suggestion. */
export function sampleCornerColor(img: CanvasImageSource, width: number, height: number): string {
  const c = makeCanvas(width, height)
  const ctx = c.getContext('2d')!
  ctx.drawImage(img, 0, 0, width, height)
  const p = ctx.getImageData(2, 2, 1, 1).data
  if (p[3] < 8) return 'transparent'
  return `#${[p[0], p[1], p[2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

export interface StyledBase {
  /** Graded island texture (filters, tint and gradient), same size as the document. */
  island: HTMLCanvasElement
  /** Alpha silhouette of the map, used as a clipping mask. */
  mask: HTMLCanvasElement
  /** Soft colored aura rendered behind the island, or null when disabled. */
  glow: HTMLCanvasElement | null
}

/**
 * Pre-composes the base texture with all style settings. Runs once per style
 * change and is shared by the editor (Konva) and the exporter (2D canvas).
 */
export function composeBaseMap(img: CanvasImageSource, width: number, height: number, s: BaseMapStyle): StyledBase {
  const mask = makeCanvas(width, height)
  const mctx = mask.getContext('2d')!
  mctx.drawImage(img, 0, 0, width, height)
  if (s.keyColor) applyColorKey(mctx, mask.width, mask.height, s.keyColor, s.keyTolerance)

  const island = makeCanvas(width, height)
  const ctx = island.getContext('2d')!
  ctx.filter = cssFilter(s)
  ctx.drawImage(img, 0, 0, width, height)
  ctx.filter = 'none'

  if (s.tintOpacity > 0) {
    ctx.globalCompositeOperation = toComposite(s.tintBlend)
    ctx.fillStyle = rgba(s.tint, s.tintOpacity)
    ctx.fillRect(0, 0, width, height)
  }
  if (s.gradient.enabled && s.gradient.opacity > 0) {
    ctx.globalCompositeOperation = toComposite(s.gradient.blend)
    ctx.fillStyle = gradientFor(ctx, width, height, s.gradient.angle, s.gradient.from, s.gradient.to, s.gradient.opacity)
    ctx.fillRect(0, 0, width, height)
  }
  // Blend modes paint over transparent sea too; cut everything back to the silhouette.
  ctx.globalCompositeOperation = 'destination-in'
  ctx.drawImage(mask, 0, 0)
  ctx.globalCompositeOperation = 'source-over'

  let glow: HTMLCanvasElement | null = null
  if (s.glow.enabled && s.glow.opacity > 0 && s.glow.size > 0) {
    // Blur cost scales with radius × area, so render the aura at reduced size.
    const scale = Math.min(1, 1024 / Math.max(width, height))
    const gw = Math.max(1, Math.round(width * scale))
    const gh = Math.max(1, Math.round(height * scale))
    const silhouette = makeCanvas(gw, gh)
    const sctx = silhouette.getContext('2d')!
    sctx.drawImage(mask, 0, 0, gw, gh)
    sctx.globalCompositeOperation = 'source-in'
    sctx.fillStyle = s.glow.color
    sctx.fillRect(0, 0, gw, gh)

    const small = makeCanvas(gw, gh)
    const gctx = small.getContext('2d')!
    gctx.shadowColor = rgba(s.glow.color, s.glow.opacity)
    // Glow size is specified for a 2048px-tall map so presets look alike on 1K tiles and 8K textures.
    gctx.shadowBlur = s.glow.size * (Math.max(width, height) / 2048) * scale
    const passes = Math.max(1, Math.min(3, Math.round(s.glow.strength)))
    for (let i = 0; i < passes; i++) gctx.drawImage(silhouette, 0, 0)

    glow = makeCanvas(width, height)
    const fctx = glow.getContext('2d')!
    fctx.imageSmoothingQuality = 'high'
    fctx.drawImage(small, 0, 0, width, height)
  }

  return { island, mask, glow }
}

/**
 * Draws the styled base plus the elements clipped to the map onto `ctx` in the
 * same order the editor uses: island → clipped elements → mask → glow → background.
 */
export function drawStyledBase(
  ctx: CanvasRenderingContext2D,
  styled: StyledBase,
  width: number,
  height: number,
  background: string,
  drawClipped: (ctx: CanvasRenderingContext2D) => void,
) {
  ctx.drawImage(styled.island, 0, 0, width, height)
  drawClipped(ctx)
  ctx.save()
  ctx.globalCompositeOperation = 'destination-in'
  ctx.drawImage(styled.mask, 0, 0, width, height)
  ctx.globalCompositeOperation = 'destination-over'
  if (styled.glow) ctx.drawImage(styled.glow, 0, 0, width, height)
  if (background !== 'transparent') {
    ctx.fillStyle = background
    ctx.fillRect(0, 0, width, height)
  }
  ctx.restore()
}
