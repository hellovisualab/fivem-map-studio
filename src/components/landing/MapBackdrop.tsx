import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { getPresetMapAsync } from '@/lib/basemaps'
import type { BaseMapPreset } from '@/types'
import { cn } from '@/lib/utils'

/** Renders a preset map as a dimmed, slowly drifting hero backdrop. */
export function MapBackdrop({ preset = 'original', className }: { preset?: Exclude<BaseMapPreset, 'custom'>; className?: string }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    getPresetMapAsync(preset).then((s) => alive && setSrc(s))
    return () => {
      alive = false
    }
  }, [preset])

  return (
    <div className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}>
      {src && (
        <motion.img
          src={src}
          alt=""
          initial={{ opacity: 0, scale: 1.15 }}
          animate={{ opacity: 0.55, scale: 1.05, x: [0, -20, 0], y: [0, 14, 0] }}
          transition={{ opacity: { duration: 1.2 }, scale: { duration: 1.6 }, x: { duration: 40, repeat: Infinity }, y: { duration: 46, repeat: Infinity } }}
          className="absolute top-1/2 left-1/2 min-h-[140%] min-w-[140%] -translate-x-1/2 -translate-y-1/2 object-cover"
          style={{ filter: 'saturate(0.7) brightness(0.9)' }}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-ink-950/60 via-ink-950/70 to-ink-950" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,138,31,0.16),transparent_60%)]" />
    </div>
  )
}
