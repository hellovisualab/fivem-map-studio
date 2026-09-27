import type { MapDocument, OverlayFx, OverlayFxId } from '@/types'

export interface OverlayFxDef {
  id: OverlayFxId
  label: string
  blurb: string
  usesColor?: boolean
}

export const DEFAULT_OVERLAY_FX: OverlayFx = {
  ids: [],
  intensity: 0.7,
  speed: 1,
  color: '#ec4899',
}

/** Effects painted over the in-game radar by the exported NUI page (see overlayRuntime.js). */
export const OVERLAY_FX_BY_ID: Record<OverlayFxId, OverlayFxDef> = {
  glow: { id: 'glow', label: 'Neon glow', blurb: 'Neon tube around the radar', usesColor: true },
  radar: { id: 'radar', label: 'Radar sweep', blurb: 'Beam that lights up contacts', usesColor: true },
  ripple: { id: 'ripple', label: 'Sonar ping', blurb: 'Rings from the player arrow', usesColor: true },
  scanlines: { id: 'scanlines', label: 'Scanlines', blurb: 'CRT lines and rolling band' },
  pulse: { id: 'pulse', label: 'Pulse', blurb: 'Frame and tint pulse together', usesColor: true },
  heartbeat: { id: 'heartbeat', label: 'Heartbeat', blurb: 'Double beat with ECG trace', usesColor: true },
  breathe: { id: 'breathe', label: 'Breathe', blurb: 'Aura that grows and shrinks', usesColor: true },
  shimmer: { id: 'shimmer', label: 'Glass shine', blurb: 'Light sweep over the glass' },
  vignette: { id: 'vignette', label: 'Vignette', blurb: 'Dark, breathing edges' },
  hue: { id: 'hue', label: 'Hue cycle', blurb: 'Cycles tint and effect colors', usesColor: true },
  flicker: { id: 'flicker', label: 'Flicker', blurb: 'Signal drops and strobes' },
  glitch: { id: 'glitch', label: 'Glitch', blurb: 'RGB split interference bursts' },
}

export const OVERLAY_FX: OverlayFxDef[] = Object.values(OVERLAY_FX_BY_ID)

const FX_IDS = new Set<string>(OVERLAY_FX.map((f) => f.id))

export function isOverlayFxId(id: string): id is OverlayFxId {
  return FX_IDS.has(id)
}

export function sanitizeFxColor(color: string) {
  return /^#[0-9a-f]{6}$/i.test(color) ? color : DEFAULT_OVERLAY_FX.color
}

export function overlayFxOf(doc: Pick<MapDocument, 'overlayFx'> | null | undefined): OverlayFx {
  const raw = doc?.overlayFx
  const ids = (raw?.ids ?? []).filter(isOverlayFxId)
  const ordered = OVERLAY_FX.map((f) => f.id).filter((id) => ids.includes(id))
  return {
    ids: ordered,
    intensity: clamp(raw?.intensity ?? DEFAULT_OVERLAY_FX.intensity, 0, 1),
    speed: clamp(raw?.speed ?? DEFAULT_OVERLAY_FX.speed, 0.25, 3),
    color: sanitizeFxColor(raw?.color ?? DEFAULT_OVERLAY_FX.color),
  }
}

export function toggleOverlayFx(ids: OverlayFxId[], id: OverlayFxId): OverlayFxId[] {
  const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]
  return OVERLAY_FX.map((f) => f.id).filter((x) => next.includes(x))
}

export function overlayFxUsesColor(ids: OverlayFxId[]) {
  return ids.some((id) => OVERLAY_FX_BY_ID[id].usesColor)
}

function clamp(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, n))
}
