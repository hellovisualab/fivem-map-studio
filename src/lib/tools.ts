import type { LucideIcon } from 'lucide-react'
import { Box, Car, Crosshair, Map, Package } from 'lucide-react'

export type ToolId = 'minimap' | 'props' | 'handling' | 'weapon' | 'ytd'

export interface ToolDef {
  id: ToolId
  name: string
  description: string
  href: string | null
  icon: LucideIcon
  section: 'creation' | 'optimization'
  badge?: string
  comingSoon?: boolean
  freeLimit: string
  supporterLimit: string
}

export const TOOLS: ToolDef[] = [
  {
    id: 'minimap',
    name: 'Minimap Live Editor',
    description:
      'Design your GTA V minimap live in the browser. Add gang zones, labels, images and custom tints, then export a drop-in FiveM resource in one click.',
    href: '/dashboard',
    icon: Map,
    section: 'creation',
    badge: 'NEW: Cayo Perico map support',
    freeLimit: 'Free · 1/day',
    supporterLimit: 'Supporter · ∞',
  },
  {
    id: 'props',
    name: 'Prop Creator',
    description:
      'Turn any 3D model into a spawnable GTA V prop. Collision, textures and LODs handled, packaged as a drop-in FiveM resource.',
    href: '/tools/props',
    icon: Box,
    section: 'creation',
    freeLimit: 'Free · 1/day',
    supporterLimit: 'Supporter · ∞',
  },
  {
    id: 'handling',
    name: 'Handling Editor',
    description:
      'Tweak or build a GTA V handling.meta in your browser. Upload an existing file or start from scratch, pick a preset, choose your drivetrain, fine-tune with sliders and export a drop-in handling.meta.',
    href: '/tools/handling',
    icon: Car,
    section: 'creation',
    badge: 'NEW',
    freeLimit: 'Free · 1/day',
    supporterLimit: 'Supporter · ∞',
  },
  {
    id: 'weapon',
    name: 'Weapon Creator',
    description:
      'Turn any 3D model into a working GTA V add-on weapon. Position it in first-person hands, set the stats, and export a drop-in FiveM resource.',
    href: null,
    icon: Crosshair,
    section: 'creation',
    comingSoon: true,
    freeLimit: 'Free · 1/day',
    supporterLimit: 'Supporter · ∞',
  },
  {
    id: 'ytd',
    name: 'YTD Optimizer',
    description:
      'Shrink your GTA V texture dictionaries. Upload a .ytd or a pack of textures, see every texture and its size, then re-compress with smart presets or tune each texture by hand.',
    href: '/tools/ytd',
    icon: Package,
    section: 'optimization',
    freeLimit: 'Free · 1/day',
    supporterLimit: 'Supporter · ∞',
  },
]
