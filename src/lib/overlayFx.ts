import type { MapDocument, OverlayFx, OverlayFxId } from '@/types'

export type OverlayFxKind = 'wrap' | 'layer'

export interface OverlayFxDef {
  id: OverlayFxId
  label: string
  blurb: string
  kind: OverlayFxKind
  usesColor?: boolean
}

export const DEFAULT_OVERLAY_FX: OverlayFx = {
  ids: [],
  intensity: 0.7,
  speed: 1,
  color: '#ec4899',
}

export const OVERLAY_FX_BY_ID: Record<OverlayFxId, OverlayFxDef> = {
  pulse: { id: 'pulse', label: 'Pulse', blurb: 'Fades the overlay in and out', kind: 'wrap' },
  glow: { id: 'glow', label: 'Neon glow', blurb: 'Color aura around the radar', kind: 'wrap', usesColor: true },
  breathe: { id: 'breathe', label: 'Breathe', blurb: 'Slow scale in and out', kind: 'wrap' },
  scanlines: { id: 'scanlines', label: 'Scanlines', blurb: 'CRT scan overlay', kind: 'layer' },
  radar: { id: 'radar', label: 'Radar sweep', blurb: 'Rotating search beam', kind: 'layer', usesColor: true },
  flicker: { id: 'flicker', label: 'Flicker', blurb: 'Short strobe hits', kind: 'wrap' },
  heartbeat: { id: 'heartbeat', label: 'Heartbeat', blurb: 'Double-beat pulse', kind: 'wrap' },
  shimmer: { id: 'shimmer', label: 'Shimmer', blurb: 'Light sweep across the map', kind: 'layer', usesColor: true },
  ripple: { id: 'ripple', label: 'Ripple', blurb: 'Rings expanding from center', kind: 'layer', usesColor: true },
  hue: { id: 'hue', label: 'Hue shift', blurb: 'Cycles overlay colors', kind: 'wrap' },
  glitch: { id: 'glitch', label: 'Glitch', blurb: 'RGB jitter bursts', kind: 'wrap' },
  vignette: { id: 'vignette', label: 'Vignette', blurb: 'Breathing dark edges', kind: 'layer' },
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

export function wrapFxIds(ids: OverlayFxId[]) {
  return ids.filter((id) => OVERLAY_FX_BY_ID[id].kind === 'wrap')
}

export function layerFxIds(ids: OverlayFxId[]) {
  return ids.filter((id) => OVERLAY_FX_BY_ID[id].kind === 'layer')
}

export function overlayFxUsesColor(ids: OverlayFxId[]) {
  return ids.some((id) => OVERLAY_FX_BY_ID[id].usesColor)
}

export function overlayFxVars(fx: OverlayFx): Record<string, string> {
  return {
    '--fms-fx-speed': String(fx.speed),
    '--fms-fx-intensity': String(fx.intensity),
    '--fms-fx-color': sanitizeFxColor(fx.color),
  }
}

export function overlayIndexHtml(fx: OverlayFx) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="style.css" />
  </head>
  <body>
    <div id="overlay" class="hidden fms-fx"${overlayStyleAttr(fx)}>
      ${overlayInnerHtml(fx)}
    </div>
    <script src="script.js"></script>
  </body>
</html>
`
}

function overlayStyleAttr(fx: OverlayFx) {
  if (!fx.ids.length) return ''
  const vars = overlayFxVars(fx)
  return ` style="${Object.entries(vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(';')}"`
}

function overlayInnerHtml(fx: OverlayFx) {
  let inner = `<img id="overlay-img" src="overlay.png" alt="minimap overlay" />`
  for (const id of wrapFxIds(fx.ids)) {
    inner = `<div class="fms-fx-wrap fms-fx-${id}">${inner}</div>`
  }
  const layers = layerFxIds(fx.ids)
    .map((id) => `<div class="fms-fx-layer fms-fx-${id}"></div>`)
    .join('\n      ')
  return layers ? `${inner}\n      ${layers}` : inner
}

export const overlayFxDriverJs = `(function driveOverlayFx() {
  const root = document.getElementById("overlay");
  if (!root) return;
  root.classList.add("js-driven");
  const t0 = performance.now();
  const read = (name, fallback) => {
    const v = parseFloat(getComputedStyle(root).getPropertyValue(name));
    return Number.isFinite(v) ? v : fallback;
  };
  const tick = (now) => {
    const speed = Math.max(0.25, read("--fms-fx-speed", 1));
    const intensity = Math.min(1, Math.max(0, read("--fms-fx-intensity", 0.7)));
    const t = ((now - t0) / 1000) * speed;
    const sin = (period) => 0.5 + 0.5 * Math.sin((t / period) * Math.PI * 2);
    root.querySelectorAll(".fms-fx-wrap").forEach((el) => {
      const node = el;
      if (node.classList.contains("fms-fx-pulse")) node.style.opacity = String(1 - intensity * 0.5 * (1 - sin(1.6)));
      if (node.classList.contains("fms-fx-breathe")) node.style.transform = "scale(" + (1 + sin(2.6) * intensity * 0.07) + ")";
      if (node.classList.contains("fms-fx-glow")) {
        const k = 8 + sin(1.5) * 22 * intensity;
        node.style.filter = "drop-shadow(0 0 " + k + "px var(--fms-fx-color, #ec4899))";
      }
      if (node.classList.contains("fms-fx-heartbeat")) {
        const p = (t % 1.25) / 1.25;
        const beat = p < 0.14 ? p / 0.14 : p < 0.22 ? 1 - (p - 0.14) / 0.08 : p < 0.32 ? (p - 0.22) / 0.1 : p < 0.4 ? 1 - (p - 0.32) / 0.08 : 0;
        node.style.transform = "scale(" + (1 + beat * intensity * 0.08) + ")";
      }
      if (node.classList.contains("fms-fx-flicker")) {
        const step = Math.floor(t * 14);
        const flash = (step * 17) % 11 === 0 || (step * 13) % 19 === 0;
        node.style.opacity = flash ? String(1 - intensity * 0.75) : "1";
      }
      if (node.classList.contains("fms-fx-hue")) node.style.filter = "hue-rotate(" + ((t * 80) % 360) + "deg)";
      if (node.classList.contains("fms-fx-glitch")) {
        const p = t % 2.2;
        if (p > 1.85) {
          node.style.transform = "translate(" + Math.sin(t * 40) * 4 * intensity + "px, 0)";
          node.style.filter = "hue-rotate(18deg)";
        } else {
          node.style.transform = "translate(0)";
          node.style.filter = "none";
        }
      }
    });
    root.querySelectorAll(".fms-fx-layer").forEach((el) => {
      const node = el;
      if (node.classList.contains("fms-fx-radar")) node.style.transform = "rotate(" + ((t / 2.6) * 360) % 360 + "deg)";
      if (node.classList.contains("fms-fx-scanlines")) node.style.backgroundPosition = "0 " + ((t * 48) % 8) + "px";
      if (node.classList.contains("fms-fx-shimmer")) node.style.backgroundPosition = 130 - ((t / 2.1) % 1) * 260 + "% 0";
      if (node.classList.contains("fms-fx-ripple")) {
        const p = (t / 2) % 1;
        node.style.transform = "scale(" + (0.6 + p * 0.75) + ")";
        node.style.opacity = String((1 - p) * (0.4 + intensity * 0.6));
      }
      if (node.classList.contains("fms-fx-vignette")) node.style.opacity = String(0.3 + sin(2.2) * (0.3 + intensity * 0.4));
    });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();
`

function clamp(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, n))
}
