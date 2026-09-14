// Removes raw source textures from dist/maps/ after `vite build`.
//
// The presets that scripts/build-maps.mjs stitched successfully are served from
// dist/maps/_generated/, so their raw tiles (100 MB+ of DDS per map) would only
// bloat the deployment. Raw files are kept for presets the build step could not
// process, since the browser falls back to loading those directly.
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const distMaps = join(root, 'dist', 'maps')
const manifestPath = join(distMaps, 'manifest.json')
if (!existsSync(manifestPath)) process.exit(0)

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
if (manifest?.version !== 2) process.exit(0)

let removed = 0
let bytes = 0
for (const entry of Object.values(manifest.presets ?? {})) {
  if (!entry.full) continue
  for (const rel of entry.files ?? []) {
    const p = join(distMaps, rel)
    if (!existsSync(p)) continue
    bytes += statSync(p).size
    rmSync(p)
    removed++
  }
}
if (removed) console.log(`[maps] pruned ${removed} raw source file${removed === 1 ? '' : 's'} (${(bytes / 1048576).toFixed(0)} MB) from dist/maps`)
