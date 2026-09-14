import type { FontFamily, MapDocument } from '@/types'
import { WEB_FONTS } from './constants'

const loaded = new Set<string>()
const pending = new Map<string, Promise<void>>()

/**
 * Canvas text does not trigger webfont downloads by itself, so families must be
 * requested through the CSS Font Loading API before Konva / the exporter draw.
 */
export function loadFont(family: FontFamily): Promise<void> {
  if (!(WEB_FONTS as string[]).includes(family) || loaded.has(family)) return Promise.resolve()
  let p = pending.get(family)
  if (!p) {
    p = Promise.all([document.fonts.load(`32px "${family}"`), document.fonts.load(`bold 32px "${family}"`)])
      .then(() => {
        loaded.add(family)
      })
      .catch(() => {
        /* fallback font is used */
      })
      .finally(() => pending.delete(family))
    pending.set(family, p)
  }
  return p
}

export function fontsInDocument(doc: MapDocument): FontFamily[] {
  const set = new Set<FontFamily>()
  for (const el of doc.elements) if (el.type === 'text') set.add(el.fontFamily)
  return [...set]
}

export const loadDocumentFonts = (doc: MapDocument) => Promise.all(fontsInDocument(doc).map(loadFont))

export const isFontLoaded = (family: FontFamily) => !(WEB_FONTS as string[]).includes(family) || loaded.has(family)
