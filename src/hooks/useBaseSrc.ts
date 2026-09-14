import { useEffect, useState } from 'react'
import type { MapDocument } from '@/types'
import { ensureBaseSrc, resolveBaseSrc } from '@/lib/render'

/**
 * Base texture URL for the open document. Presets may need an async lookup of
 * the real texture under /maps/, so start with the synchronous best guess and
 * swap in the final URL once resolved.
 */
export function useBaseSrc(doc: MapDocument | null): string {
  const preset = doc?.baseMap.preset
  const src = doc?.baseMap.src ?? ''
  const [resolvedSrc, setResolvedSrc] = useState(() => (doc ? resolveBaseSrc(doc) : ''))

  useEffect(() => {
    if (!doc) {
      setResolvedSrc('')
      return
    }
    let alive = true
    setResolvedSrc(resolveBaseSrc(doc))
    ensureBaseSrc(doc).then((s) => alive && setResolvedSrc(s))
    return () => {
      alive = false
    }
    // Only the preset / explicit src decide the texture; style edits must not re-resolve.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, src])

  return resolvedSrc
}
