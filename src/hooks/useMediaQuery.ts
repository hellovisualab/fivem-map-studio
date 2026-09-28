import { useSyncExternalStore } from 'react'

/** True while the CSS media query matches (re-renders on change). */
export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const m = window.matchMedia(query)
      m.addEventListener('change', onChange)
      return () => m.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}
