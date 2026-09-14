import type { BaseMapPreset, FontFamily, MarkerIcon, PlanId, WorldBounds, ZoneType } from '@/types'

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
  { id: 'custom', name: 'Custom Upload', tag: 'Your files', description: 'Import PNG / JPG / WebP frames or split tiles.' },
]

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
  'Arial',
  'Impact',
  'Georgia',
  'Courier New',
  'Verdana',
  'Trebuchet MS',
  'Times New Roman',
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
