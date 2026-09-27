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

/** Room kept around the radar for outer glows, as a fraction of the radar height. */
export const FX_BLEED: number

/** Screen rectangle of the vanilla radar, in pixels. */
export function minimapRect(resX: number, resY: number, safeZone: number): RadarRect

/** Paints the selected effects over a radar occupying `r` (canvas pixels). */
export function paintRadarFx(ctx: CanvasRenderingContext2D, fx: RadarFx, seconds: number, r: RadarRect): void
