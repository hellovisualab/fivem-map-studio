import type { BaseMapPreset, BaseMapStyle, FontFamily, MapPresetId, MarkerIcon, PlanId, TextElement, WorldBounds, ZoneType } from '@/types'
import { DEFAULT_STYLE } from './mapStyle'

export const APP_NAME = 'FiveM Map Studio'

export const DEFAULT_WORLD: WorldBounds = {
  minX: -4300,
  maxX: 4600,
  minY: -4400,
  maxY: 8300,
}

export const PRESETS: {
  id: BaseMapPreset
  name: string
  tag: string
  description: string
}[] = [
  { id: 'color', name: 'GTA V Color Map', tag: '3K native', description: 'Vibrant in-game style with green land and orange roads.' },
  { id: 'original', name: 'Original Map', tag: '1K native', description: 'Classic dark radar look with crisp white roads.' },
  { id: 'satellite', name: 'Satellite', tag: '4K native', description: 'Aerial imagery style with terrain shading.' },
  { id: 'realmap', name: 'Real Map', tag: '4K native', description: 'Paper-like cartography with soft tones.' },
  { id: 'realmapdown', name: 'Real Map Down', tag: '4K native', description: 'Alternative real-map variant.' },
  { id: 'custom', name: 'Custom Upload', tag: 'Your files', description: 'Import PNG / JPG / WebP / DDS frames or split tiles.' },
]

export const MAP_PRESET_IDS: MapPresetId[] = ['color', 'original', 'satellite', 'realmap', 'realmapdown']

/**
 * Folder under `public/maps/` that holds the real texture for each preset.
 * Drop a single image (any name) or `*_X_Y.png` tiles inside; the build
 * script indexes them into `public/maps/manifest.json`.
 */
export const MAP_FOLDERS: Record<MapPresetId, string> = {
  color: 'Color',
  original: 'original',
  satellite: 'satellite',
  realmap: 'real-map',
  realmapdown: 'real-map-down',
}

export const ZONE_TYPES: Record<ZoneType, { label: string; color: string; description: string }> = {
  gang: { label: 'Gang zone', color: '#e11d48', description: 'Territory controlled by a gang or faction.' },
  police: { label: 'Police zone', color: '#3b82f6', description: 'Law enforcement jurisdiction or restricted area.' },
  safe: { label: 'Safe zone', color: '#22c55e', description: 'No combat allowed. Players are protected.' },
  custom: { label: 'Custom area', color: '#ff8a1f', description: 'Anything else: businesses, events, hotspots.' },
}

export const MARKER_ICONS: Record<MarkerIcon, { label: string; color: string; blip: number }> = {
  police: { label: 'Police', color: '#3b82f6', blip: 60 },
  hospital: { label: 'Hospital', color: '#ef4444', blip: 61 },
  bank: { label: 'Bank', color: '#22c55e', blip: 108 },
  shop: { label: 'Shop', color: '#f59e0b', blip: 52 },
  garage: { label: 'Garage', color: '#a855f7', blip: 357 },
  custom: { label: 'Custom', color: '#ff8a1f', blip: 1 },
}

export const FONTS: FontFamily[] = [
  'Inter',
  'Bebas Neue',
  'Anton',
  'Oswald',
  'Teko',
  'Russo One',
  'Black Ops One',
  'Bangers',
  'Righteous',
  'Permanent Marker',
  'Pacifico',
  'Great Vibes',
  'Cinzel',
  'Impact',
  'Arial',
  'Georgia',
  'Verdana',
  'Trebuchet MS',
  'Times New Roman',
  'Courier New',
]

/** Google Fonts loaded on demand; system fonts are not listed. */
export const WEB_FONTS: FontFamily[] = [
  'Inter',
  'Bebas Neue',
  'Anton',
  'Oswald',
  'Teko',
  'Russo One',
  'Black Ops One',
  'Bangers',
  'Righteous',
  'Permanent Marker',
  'Pacifico',
  'Great Vibes',
  'Cinzel',
]

export interface TextPreset {
  id: string
  name: string
  patch: Partial<TextElement>
}

export const TEXT_PRESETS: TextPreset[] = [
  {
    id: 'district',
    name: 'District',
    patch: { fontFamily: 'Bebas Neue', fontStyle: 'normal', fill: '#ffffff', stroke: '#000000', strokeWidth: 3, letterSpacing: 4, uppercase: true, effects: { shadowEnabled: true, shadowColor: '#000000', shadowBlur: 18, shadowOffsetX: 0, shadowOffsetY: 4, shadowOpacity: 0.9 } },
  },
  {
    id: 'neon',
    name: 'Neon',
    patch: { fontFamily: 'Righteous', fontStyle: 'normal', fill: '#ffffff', strokeWidth: 0, letterSpacing: 2, effects: { shadowEnabled: true, shadowColor: '#ff3df2', shadowBlur: 36, shadowOffsetX: 0, shadowOffsetY: 0, shadowOpacity: 1 } },
  },
  {
    id: 'script',
    name: 'Script',
    patch: { fontFamily: 'Great Vibes', fontStyle: 'normal', fill: '#ffffff', stroke: '#000000', strokeWidth: 1.5, letterSpacing: 0, uppercase: false, effects: { shadowEnabled: true, shadowColor: '#000000', shadowBlur: 12, shadowOffsetX: 2, shadowOffsetY: 3, shadowOpacity: 0.85 } },
  },
  {
    id: 'comic',
    name: 'Comic',
    patch: { fontFamily: 'Bangers', fontStyle: 'normal', fill: '#ffd60a', stroke: '#1a1a1a', strokeWidth: 4, letterSpacing: 2, effects: { shadowEnabled: true, shadowColor: '#000000', shadowBlur: 0, shadowOffsetX: 5, shadowOffsetY: 5, shadowOpacity: 1 } },
  },
  {
    id: 'military',
    name: 'Military',
    patch: { fontFamily: 'Black Ops One', fontStyle: 'normal', fill: '#e5e7eb', stroke: '#000000', strokeWidth: 2, letterSpacing: 1, uppercase: true, effects: { shadowEnabled: true, shadowColor: '#000000', shadowBlur: 10, shadowOffsetX: 0, shadowOffsetY: 2, shadowOpacity: 0.9 } },
  },
  {
    id: 'marker',
    name: 'Marker',
    patch: { fontFamily: 'Permanent Marker', fontStyle: 'normal', fill: '#ff8a1f', strokeWidth: 0, letterSpacing: 0, effects: { shadowEnabled: true, shadowColor: '#000000', shadowBlur: 8, shadowOffsetX: 2, shadowOffsetY: 2, shadowOpacity: 0.9 } },
  },
]

export interface StylePreset {
  id: string
  name: string
  /** Swatch colors for the preset button. */
  swatch: [string, string]
  style: Partial<BaseMapStyle>
}

const off = { gradient: { ...DEFAULT_STYLE.gradient, enabled: false }, glow: { ...DEFAULT_STYLE.glow, enabled: false } }

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: 'clean',
    name: 'Clean',
    swatch: ['#3a3a44', '#0b0b0f'],
    style: { brightness: 1, contrast: 1, saturation: 1, hue: 0, grayscale: 0, invert: false, tintOpacity: 0, ...off },
  },
  {
    id: 'neon',
    name: 'Neon Purple',
    swatch: ['#ec4899', '#6d28d9'],
    style: {
      brightness: 1.05,
      contrast: 1.1,
      saturation: 1.2,
      grayscale: 0,
      invert: false,
      tint: '#7c3aed',
      tintOpacity: 0.55,
      tintBlend: 'color',
      gradient: { enabled: true, from: '#f472b6', to: '#4c1d95', angle: 160, opacity: 0.75, blend: 'overlay' },
      glow: { enabled: true, color: '#c026d3', size: 140, strength: 3, opacity: 0.95 },
    },
  },
  {
    id: 'inferno',
    name: 'Inferno',
    swatch: ['#f97316', '#7c2d12'],
    style: {
      brightness: 0.95,
      contrast: 1.15,
      saturation: 1.1,
      grayscale: 0,
      invert: false,
      tint: '#c2410c',
      tintOpacity: 0.6,
      tintBlend: 'color',
      gradient: { enabled: true, from: '#fbbf24', to: '#7f1d1d', angle: 180, opacity: 0.6, blend: 'soft-light' },
      glow: { enabled: true, color: '#ff7a00', size: 160, strength: 3, opacity: 1 },
    },
  },
  {
    id: 'blood',
    name: 'Blood',
    swatch: ['#dc2626', '#3f0a0a'],
    style: {
      brightness: 0.9,
      contrast: 1.2,
      saturation: 1,
      grayscale: 0.2,
      invert: false,
      tint: '#991b1b',
      tintOpacity: 0.65,
      tintBlend: 'multiply',
      gradient: { enabled: true, from: '#ef4444', to: '#1e1b4b', angle: 135, opacity: 0.55, blend: 'overlay' },
      glow: { enabled: true, color: '#ef4444', size: 120, strength: 3, opacity: 0.9 },
    },
  },
  {
    id: 'ice',
    name: 'Ice',
    swatch: ['#67e8f9', '#1e3a8a'],
    style: {
      brightness: 1.05,
      contrast: 1.05,
      saturation: 0.9,
      grayscale: 0,
      invert: false,
      tint: '#0ea5e9',
      tintOpacity: 0.5,
      tintBlend: 'color',
      gradient: { enabled: true, from: '#a5f3fc', to: '#1e3a8a', angle: 180, opacity: 0.5, blend: 'overlay' },
      glow: { enabled: true, color: '#22d3ee', size: 130, strength: 2, opacity: 0.9 },
    },
  },
  {
    id: 'miami',
    name: 'Miami',
    swatch: ['#f472b6', '#22d3ee'],
    style: {
      brightness: 1.05,
      contrast: 1.1,
      saturation: 1.3,
      grayscale: 0,
      invert: false,
      tint: '#db2777',
      tintOpacity: 0.35,
      tintBlend: 'color',
      gradient: { enabled: true, from: '#fb7185', to: '#06b6d4', angle: 150, opacity: 0.7, blend: 'overlay' },
      glow: { enabled: true, color: '#22d3ee', size: 130, strength: 2, opacity: 0.9 },
    },
  },
  {
    id: 'gold',
    name: 'Gold',
    swatch: ['#fbbf24', '#78350f'],
    style: {
      brightness: 1,
      contrast: 1.15,
      saturation: 0.8,
      grayscale: 0,
      invert: false,
      tint: '#b45309',
      tintOpacity: 0.7,
      tintBlend: 'color',
      gradient: { enabled: true, from: '#fde68a', to: '#451a03', angle: 180, opacity: 0.5, blend: 'soft-light' },
      glow: { enabled: true, color: '#f59e0b', size: 120, strength: 2, opacity: 0.9 },
    },
  },
  {
    id: 'noir',
    name: 'Noir',
    swatch: ['#e5e7eb', '#111827'],
    style: {
      brightness: 0.95,
      contrast: 1.3,
      saturation: 1,
      grayscale: 1,
      invert: false,
      tintOpacity: 0,
      gradient: { ...DEFAULT_STYLE.gradient, enabled: false },
      glow: { enabled: true, color: '#ffffff', size: 90, strength: 1, opacity: 0.6 },
    },
  },
  {
    id: 'toxic',
    name: 'Toxic',
    swatch: ['#a3e635', '#14532d'],
    style: {
      brightness: 1,
      contrast: 1.15,
      saturation: 1.2,
      grayscale: 0,
      invert: false,
      tint: '#16a34a',
      tintOpacity: 0.55,
      tintBlend: 'color',
      gradient: { enabled: true, from: '#bef264', to: '#052e16', angle: 180, opacity: 0.55, blend: 'overlay' },
      glow: { enabled: true, color: '#84cc16', size: 130, strength: 3, opacity: 0.95 },
    },
  },
]

export const PALETTE = [
  '#ff8a1f',
  '#ffffff',
  '#0b0b0f',
  '#e11d48',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#94a3b8',
]

export const PLANS: Record<
  PlanId,
  { name: string; price: string; exportsPerDay: number | null; storageBytes: number; features: string[] }
> = {
  free: {
    name: 'Free',
    price: '$0',
    exportsPerDay: 1,
    storageBytes: 250 * 1024 * 1024,
    features: ['1 export per day', 'All base map presets', 'Unlimited projects', 'Zones, labels, images & markers', '250 MB storage'],
  },
  supporter: {
    name: 'Supporter',
    price: '$4.99 / mo',
    exportsPerDay: null,
    storageBytes: 5 * 1024 * 1024 * 1024,
    features: ['Unlimited exports', 'Priority rendering', '4K tile export', 'Custom marker icons', '5 GB storage', 'Early access to new tools'],
  },
}

export const MIN_ZOOM = 0.05
export const MAX_ZOOM = 12
