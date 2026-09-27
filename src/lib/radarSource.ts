import { useSyncExternalStore } from 'react'
import type { RadarSource } from './radarScene'

// The editor canvas renders the map around the player once; every effect preview reads it.
let current: RadarSource | null = null
const listeners = new Set<() => void>()

export function setRadarSource(source: RadarSource | null) {
  current = source
  for (const l of listeners) l()
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

/** Latest map picture for the radar previews (null until the editor has rendered one). */
export const useRadarSource = () => useSyncExternalStore(subscribe, () => current)
