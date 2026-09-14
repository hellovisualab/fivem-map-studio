// Indexes real base-map textures under public/maps/<folder>/ into
// public/maps/manifest.json so the app knows which files exist without
// probing (static hosts cannot list directories). Runs before `dev` and `build`.
import { readdirSync, statSync, writeFileSync, existsSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const mapsDir = join(root, 'public', 'maps')

// Preset id → folder name (must match MAP_FOLDERS in src/lib/constants.ts).
const FOLDERS = {
  color: 'Color',
  original: 'original',
  satellite: 'satellite',
  realmap: 'real-map',
  realmapdown: 'real-map-down',
}
const IMAGE_RE = /\.(png|jpe?g|webp)$/i
const TILE_RE = /(\d+)[_-](\d+)\.(png|jpe?g|webp)$/i

function listImages(dir) {
  if (!existsSync(dir)) return []
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...listImages(p))
    else if (IMAGE_RE.test(name)) out.push(p)
  }
  return out
}

const manifest = {}
for (const [preset, folder] of Object.entries(FOLDERS)) {
  // Case-insensitive folder match so "color" and "Color" both work.
  const actual = existsSync(mapsDir) ? readdirSync(mapsDir).find((d) => d.toLowerCase() === folder.toLowerCase()) : undefined
  let files = actual ? listImages(join(mapsDir, actual)) : []
  // Legacy single-file convention: public/maps/<preset>.<ext>
  if (!files.length && existsSync(mapsDir)) {
    files = readdirSync(mapsDir)
      .filter((f) => IMAGE_RE.test(f) && f.replace(IMAGE_RE, '').toLowerCase() === preset)
      .map((f) => join(mapsDir, f))
  }
  if (!files.length) continue
  const tiles = files.filter((f) => TILE_RE.test(f))
  // Prefer a tile set when present; otherwise the largest single image.
  const chosen = tiles.length > 1 ? tiles : [files.map((f) => ({ f, size: statSync(f).size })).sort((a, b) => b.size - a.size)[0].f]
  manifest[preset] = chosen.map((f) => relative(mapsDir, f).split(sep).join('/')).sort()
}

if (existsSync(mapsDir)) {
  writeFileSync(join(mapsDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  const summary = Object.entries(manifest)
    .map(([k, v]) => `${k}: ${v.length} file${v.length === 1 ? '' : 's'}`)
    .join(', ')
  console.log(`[maps] manifest written (${summary || 'no real textures, procedural presets will be used'})`)
}
