/** Jenkins one-at-a-time hash (`joaat`), the string hash GTA V uses for names. Case sensitive, UTF-8. */
export function joaat(text: string): number {
  const bytes = new TextEncoder().encode(text)
  let h = 0
  for (const b of bytes) {
    h = (h + b) >>> 0
    h = (h + (h << 10)) >>> 0
    h = (h ^ (h >>> 6)) >>> 0
  }
  h = (h + (h << 3)) >>> 0
  h = (h ^ (h >>> 11)) >>> 0
  h = (h + (h << 15)) >>> 0
  return h
}

/** Hash of a lowercased name: models, textures and archetypes are looked up this way. */
export function nameHash(text: string): number {
  return joaat(text.toLowerCase())
}
