/** Effect settings understood by the runtime (same shape as `OverlayFx`). */
export interface RadarFx {
  ids: readonly string[]
  intensity: number
  speed: number
  color: string
}

export interface RadarRect {
  x: number
  y: number
  w: number
  h: number
}

/** Map surfaces the overlay can play on. */
export type RadarSurface = 'radar' | 'bigmap' | 'pause'

/** Room kept around a surface for outer glows, in effect units. */
export const FX_BLEED_UNITS: number

/** Screen rectangle of the vanilla radar, in pixels. */
export function minimapRect(resX: number, resY: number, safeZone: number): RadarRect

/** Screen rectangle of the expanded radar (bigmap), in pixels. */
export function bigmapRect(resX: number, resY: number, safeZone: number): RadarRect

/** Screen rectangle of the full-screen pause menu map, in pixels. */
export function pauseMapRect(resX: number, resY: number, safeZone: number): RadarRect

/** Pixel size of one effect unit on a surface for a screen `resY` pixels tall. */
export function surfaceUnit(surface: RadarSurface, resY: number): number

/** Paints the selected effects over a map surface occupying `r` (canvas pixels). */
export function paintRadarFx(ctx: CanvasRenderingContext2D, fx: RadarFx, seconds: number, r: RadarRect, unit?: number): void
