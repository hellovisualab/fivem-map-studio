import type { ReactNode } from 'react'
import { Box, ListTree, Palette, Shield, SlidersHorizontal, Wrench } from 'lucide-react'

export type PanelTab = 'outliner' | 'object' | 'modifiers' | 'material' | 'mesh' | 'gta'

export const PANEL_TABS: { id: PanelTab; label: string; icon: ReactNode }[] = [
  { id: 'outliner', label: 'Scene', icon: <ListTree className="h-4 w-4" /> },
  { id: 'object', label: 'Object', icon: <SlidersHorizontal className="h-4 w-4" /> },
  { id: 'modifiers', label: 'Modifiers', icon: <Wrench className="h-4 w-4" /> },
  { id: 'material', label: 'Material', icon: <Palette className="h-4 w-4" /> },
  { id: 'mesh', label: 'Mesh', icon: <Box className="h-4 w-4" /> },
  { id: 'gta', label: 'FiveM', icon: <Shield className="h-4 w-4" /> },
]

