// Prepares the real base-map textures under public/maps/<folder>/ for the web.
//
// GTA V minimap exports are huge (six 4096² DXT5 tiles ≈ 100 MB per map), so
// instead of shipping them to the browser we decode them here at build time,
// figure out the tile layout, stitch and downsample them, and write a single
// optimized image (plus a small preview) into public/maps/_generated/. The
// app reads public/maps/manifest.json to find them. Runs before `dev`/`build`.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'
import JSZip from 'jszip'
import { decodeDds, isDds } from './lib/dds-core.mjs'
import { detectOrientation, layoutTiles, parseTileIndex } from './lib/tiles.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const mapsDir = join(root, 'public', 'maps')
const outDir = join(mapsDir, '_generated')

// Preset id → folder name (must match MAP_FOLDERS in src/lib/constants.ts).
const FOLDERS = {
  color: 'Color',
  original: 'original',
  satellite: 'satellite',
  realmap: 'real-map',
  realmapdown: 'real-map-down',
}
const FULL_MAX_SIDE = 4096 // editor texture
const PREVIEW_MAX_SIDE = 1024 // cards / landing backdrop
const IMAGE_RE = /\.(png|jpe?g|webp|dds)$/i
const ASSET_RE = /\.(png|jpe?g|webp|dds|zip)$/i

let sharp = null
try {
  sharp = (await import('sharp')).default
} catch {
  console.log('[maps] sharp not available: PNG/JPG/WebP sources are stitched in the browser and output is PNG')
}

const log = (msg) => console.log(`[maps] ${msg}`)
const toPosix = (p) => p.split(sep).join('/')

function listAssets(dir) {
  if (!existsSync(dir)) return []
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...listAssets(p))
    else if (ASSET_RE.test(name)) out.push(p)
  }
  return out
}

/** Expands ZIPs into virtual image entries. Each entry: { name, path, size, read: () => Promise<Buffer> }. */
async function collectSources(files) {
  const entries = []
  for (const f of files) {
    if (/\.zip$/i.test(f)) {
      const zip = await JSZip.loadAsync(readFileSync(f))
      for (const [name, entry] of Object.entries(zip.files)) {
        if (entry.dir || !IMAGE_RE.test(name) || /(^|\/)__MACOSX\//.test(name)) continue
        entries.push({ name: basename(name), path: `${f}!${name}`, size: 0, read: () => entry.async('nodebuffer') })
      }
    } else {
      entries.push({ name: basename(f), path: f, size: statSync(f).size, read: async () => readFileSync(f) })
    }
  }
  return entries
}

/** Decodes any supported source into RGBA. Throws with a readable reason. */
async function decodeSource(entry) {
  const buf = await entry.read()
  if (isDds(entry.name)) {
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
    const { data, info } = decodeDds(ab)
    return { data, width: info.width, height: info.height, codec: info.codec }
  }
  if (!sharp) throw new Error('sharp is not installed, cannot decode PNG/JPG/WebP at build time')
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength), width: info.width, height: info.height, codec: info.format }
}

/** Box-filter downsample by an integer factor with alpha-weighted colour averaging. */
function downsample(src, w, h, f) {
  if (f <= 1) return { data: src, width: w, height: h }
  const ow = Math.ceil(w / f)
  const oh = Math.ceil(h / f)
  const out = new Uint8ClampedArray(ow * oh * 4)
  for (let oy = 0; oy < oh; oy++) {
    const y0 = oy * f
    const y1 = Math.min(h, y0 + f)
    for (let ox = 0; ox < ow; ox++) {
      const x0 = ox * f
      const x1 = Math.min(w, x0 + f)
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      let n = 0
      for (let y = y0; y < y1; y++) {
        let i = (y * w + x0) * 4
        for (let x = x0; x < x1; x++, i += 4) {
          const al = src[i + 3]
          r += src[i] * al
          g += src[i + 1] * al
          b += src[i + 2] * al
          a += al
          n++
        }
      }
      const o = (oy * ow + ox) * 4
      if (a > 0) {
        out[o] = r / a
        out[o + 1] = g / a
        out[o + 2] = b / a
      }
      out[o + 3] = a / n
    }
  }
  return { data: out, width: ow, height: oh }
}

/** Extracts 1px RGBA strips along the four edges of a tile (sampled every `step` px). */
function edgesOf(img, step = 4) {
  const { data, width: w, height: h } = img
  const n = Math.floor(Math.min(w, h) / step)
  const left = new Uint8ClampedArray(n * 4)
  const right = new Uint8ClampedArray(n * 4)
  const top = new Uint8ClampedArray(n * 4)
  const bottom = new Uint8ClampedArray(n * 4)
  for (let i = 0; i < n; i++) {
    const p = i * step
    left.set(data.subarray((p * w) * 4, (p * w) * 4 + 4), i * 4)
    right.set(data.subarray((p * w + w - 1) * 4, (p * w + w - 1) * 4 + 4), i * 4)
    top.set(data.subarray(p * 4, p * 4 + 4), i * 4)
    bottom.set(data.subarray(((h - 1) * w + p) * 4, ((h - 1) * w + p) * 4 + 4), i * 4)
  }
  return { left, right, top, bottom }
}

function blit(dst, dw, src, sw, sh, x0, y0) {
  for (let y = 0; y < sh; y++) {
    dst.set(src.subarray(y * sw * 4, (y + 1) * sw * 4), ((y0 + y) * dw + x0) * 4)
  }
}

/** Minimal PNG encoder (RGBA, no filtering) used when sharp is unavailable. */
function encodePng(data, w, h) {
  const crcTable = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crcTable[n] = c
  }
  const crc = (buf) => {
    let c = -1
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 255] ^ (c >>> 8)
    return (c ^ -1) >>> 0
  }
  const chunk = (type, body) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(body.length)
    const typeBuf = Buffer.from(type, 'ascii')
    const crcBuf = Buffer.alloc(4)
    crcBuf.writeUInt32BE(crc(Buffer.concat([typeBuf, body])))
    return Buffer.concat([len, typeBuf, body, crcBuf])
  }
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0
    raw.set(data.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

async function writeImage(file, img) {
  if (sharp) {
    await sharp(Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength), { raw: { width: img.width, height: img.height, channels: 4 } })
      .webp({ quality: 90, alphaQuality: 100, effort: 4 })
      .toFile(file)
  } else {
    writeFileSync(file, encodePng(img.data, img.width, img.height))
  }
}

const ext = () => (sharp ? 'webp' : 'png')

/** Builds one preset. Returns the manifest entry. */
async function buildPreset(preset, files, prevEntry) {
  const sources = await collectSources(files)
  const relFiles = files.map((f) => toPosix(relative(mapsDir, f))).sort()
  const entry = { files: relFiles, errors: [] }
  if (!sources.length) {
    entry.errors.push('ZIP archives contain no PNG/JPG/WebP/DDS images')
    return entry
  }

  // Cache key from names + sizes + mtimes: skip re-encoding when nothing changed.
  const hash = createHash('sha1')
  for (const f of files) hash.update(`${toPosix(relative(mapsDir, f))}:${statSync(f).size}:${statSync(f).mtimeMs}`)
  hash.update(sharp ? 'webp' : 'png')
  const key = hash.digest('hex').slice(0, 10)
  const fullName = `_generated/${preset}-${key}.${ext()}`
  const previewName = `_generated/${preset}-${key}-preview.${ext()}`
  if (prevEntry?.full === fullName && existsSync(join(mapsDir, fullName)) && existsSync(join(mapsDir, previewName))) {
    log(`${preset}: up to date (${prevEntry.width}×${prevEntry.height}, ${prevEntry.tiles} tile${prevEntry.tiles === 1 ? '' : 's'})`)
    return { ...prevEntry, files: relFiles, errors: [] }
  }

  // Pick a tile set when we have one, otherwise the largest single image.
  let tiles = sources.map((s) => ({ ...s, ...parseTileIndex(s.name) })).filter((s) => s.a != null)
  if (tiles.length < 2) {
    const single = sources.sort((x, y) => y.size - x.size)[0]
    tiles = [{ ...single, a: 0, b: 0 }]
  }

  const t0 = Date.now()
  const nA = Math.max(...tiles.map((t) => t.a)) - Math.min(...tiles.map((t) => t.a)) + 1
  const nB = Math.max(...tiles.map((t) => t.b)) - Math.min(...tiles.map((t) => t.b)) + 1

  // Pass 1: decode each tile once, keep only its edges and a downsampled copy.
  let factor = 1
  let tileW = 0
  let tileH = 0
  const decoded = []
  for (const t of tiles) {
    let img
    try {
      img = await decodeSource(t)
    } catch (e) {
      entry.errors.push(`${t.name}: ${e.message}`)
      return entry
    }
    if (!tileW) {
      tileW = img.width
      tileH = img.height
      // ceil(tile/factor)*axis can overshoot FULL_MAX_SIDE (e.g. 3×ceil(4096/3)=4098),
      // which blanks the editor canvas on GPUs/browsers with a 4096 texture limit.
      const axis = Math.max(nA, nB)
      const side = Math.max(tileW, tileH)
      factor = 1
      while (Math.ceil(side / factor) * axis > FULL_MAX_SIDE) factor++
    } else if (img.width !== tileW || img.height !== tileH) {
      entry.errors.push(`${t.name}: tile is ${img.width}×${img.height} but others are ${tileW}×${tileH}`)
      return entry
    }
    decoded.push({ a: t.a, b: t.b, name: t.name, codec: img.codec, edges: edgesOf(img), small: downsample(img.data, img.width, img.height, factor) })
  }

  // Pass 2: detect the grid orientation and composite.
  const orientation = detectOrientation(decoded, (t) => t.edges)
  const { cols, rows, placed } = layoutTiles(decoded, orientation)
  const sw = decoded[0].small.width
  const sh = decoded[0].small.height
  let full = { data: new Uint8ClampedArray(cols * sw * rows * sh * 4), width: cols * sw, height: rows * sh }
  for (const p of placed) blit(full.data, full.width, p.small.data, p.small.width, p.small.height, p.col * sw, p.row * sh)

  // Final safety clamp if orientation made the other axis the long one.
  const over = Math.max(full.width, full.height)
  if (over > FULL_MAX_SIDE) {
    const clamp = Math.max(1, Math.ceil(over / FULL_MAX_SIDE))
    full = downsample(full.data, full.width, full.height, clamp)
  }

  const previewFactor = Math.max(1, Math.ceil(Math.max(full.width, full.height) / PREVIEW_MAX_SIDE))
  const preview = downsample(full.data, full.width, full.height, previewFactor)

  mkdirSync(outDir, { recursive: true })
  await writeImage(join(mapsDir, fullName), full)
  await writeImage(join(mapsDir, previewName), preview)

  const sourceW = tileW * cols
  const sourceH = tileH * rows
  log(
    `${preset}: ${tiles.length} tile${tiles.length === 1 ? '' : 's'} (${decoded[0].codec}, ${cols}×${rows} grid, ${orientation}) ` +
      `${sourceW}×${sourceH} → ${full.width}×${full.height} ${ext()} in ${((Date.now() - t0) / 1000).toFixed(1)}s`,
  )
  return {
    ...entry,
    full: fullName,
    preview: previewName,
    width: full.width,
    height: full.height,
    sourceWidth: sourceW,
    sourceHeight: sourceH,
    tiles: tiles.length,
    grid: { cols, rows, orientation },
  }
}

async function main() {
  if (!existsSync(mapsDir)) return
  const manifestPath = join(mapsDir, 'manifest.json')
  let previous = {}
  try {
    const parsed = JSON.parse(readFileSync(manifestPath, 'utf8'))
    if (parsed?.version === 2) previous = parsed.presets ?? {}
  } catch {
    /* no previous manifest */
  }

  const presets = {}
  for (const [preset, folder] of Object.entries(FOLDERS)) {
    // Case-insensitive folder match so "color" and "Color" both work.
    const actual = readdirSync(mapsDir).find((d) => d.toLowerCase() === folder.toLowerCase())
    let files = actual ? listAssets(join(mapsDir, actual)) : []
    // Legacy single-file convention: public/maps/<preset>.<ext>
    if (!files.length) {
      files = readdirSync(mapsDir)
        .filter((f) => IMAGE_RE.test(f) && f.replace(IMAGE_RE, '').toLowerCase() === preset)
        .map((f) => join(mapsDir, f))
    }
    if (!files.length) continue
    try {
      presets[preset] = await buildPreset(preset, files, previous[preset])
    } catch (e) {
      presets[preset] = { files: files.map((f) => toPosix(relative(mapsDir, f))), errors: [e.message] }
    }
    for (const err of presets[preset].errors) log(`${preset}: ${err}`)
  }

  // Drop stale generated files.
  if (existsSync(outDir)) {
    const keep = new Set(Object.values(presets).flatMap((p) => [p.full, p.preview]).filter(Boolean).map((p) => basename(p)))
    for (const f of readdirSync(outDir)) if (!keep.has(f)) rmSync(join(outDir, f))
  }

  writeFileSync(manifestPath, JSON.stringify({ version: 2, presets }, null, 2) + '\n')
  const ready = Object.entries(presets).filter(([, p]) => p.full).map(([k]) => k)
  log(ready.length ? `ready: ${ready.join(', ')}` : 'no real textures found, procedural presets will be used')
}

await main()
