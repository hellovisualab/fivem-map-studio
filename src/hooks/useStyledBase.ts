import { useEffect, useRef, useState } from 'react'
import type { BaseMap } from '@/types'
import { composeBaseMap, styleKey, styleOf, type StyledBase } from '@/lib/mapStyle'

/**
 * Re-composes the styled base texture when the image or style changes.
 * Slider drags fire many updates, so the heavy compose step is debounced.
 */
export function useStyledBase(img: HTMLImageElement | undefined, baseMap: BaseMap): StyledBase | null {
  const [styled, setStyled] = useState<StyledBase | null>(null)
  const style = styleOf(baseMap)
  const key = styleKey(style)
  const first = useRef(true)

  useEffect(() => {
    if (!img) {
      setStyled(null)
      return
    }
    const run = () => setStyled(composeBaseMap(img, baseMap.width, baseMap.height, styleOf(baseMap)))
    if (first.current) {
      first.current = false
      run()
      return
    }
    const t = window.setTimeout(run, 70)
    return () => window.clearTimeout(t)
    // `key` captures every style field; baseMap identity changes on unrelated edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img, key, baseMap.width, baseMap.height])

  return styled
}
