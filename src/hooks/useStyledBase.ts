import { useEffect, useRef, useState } from 'react'
import type { MapDocument } from '@/types'
import { composeBaseMap, styleKey, styleOf, type StyledBase } from '@/lib/mapStyle'
import { frameSource, mapFrame, MAX_EDITOR_TEXTURE } from '@/lib/mapFrame'

/**
 * Re-composes the styled base texture (plus enabled islands such as Cayo Perico)
 * when the image, style or canvas layout changes. Slider drags fire many updates,
 * so style-only changes are debounced; layout changes apply at once.
 */
export function useStyledBase(img: HTMLImageElement | undefined, doc: MapDocument | null): StyledBase | null {
  const [state, setState] = useState<{ styled: StyledBase; layout: string } | null>(null)
  const key = doc ? styleKey(styleOf(doc.baseMap)) : ''
  const frame = doc ? mapFrame(doc) : null
  const layout = doc && frame ? JSON.stringify([frame.width, frame.height, doc.world, doc.baseMap.preset, doc.baseMap.width, doc.baseMap.height]) : ''
  const composedLayout = useRef<string | null>(null)

  useEffect(() => {
    if (!img || !doc || !frame) {
      composedLayout.current = null
      setState(null)
      return
    }
    const run = () => {
      const source = frameSource(img, doc, MAX_EDITOR_TEXTURE)
      setState({ styled: composeBaseMap(source, frame.width, frame.height, styleOf(doc.baseMap), MAX_EDITOR_TEXTURE), layout })
    }
    if (composedLayout.current !== layout) {
      composedLayout.current = layout
      run()
      return
    }
    const t = window.setTimeout(run, 70)
    return () => window.clearTimeout(t)
    // `key` and `layout` capture every input; the doc identity changes on unrelated edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img, key, layout])

  // Never hand out a picture composed for another canvas size (e.g. right after
  // toggling Cayo Perico); callers fall back to the plain texture meanwhile.
  return state && state.layout === layout ? state.styled : null
}
