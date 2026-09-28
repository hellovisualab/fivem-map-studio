import type { TextureDef, TextureFormatName } from '@/lib/gta/drawable'

/*
 * BC1 (DXT1) / BC3 (DXT5) block compression, a port of stb_dxt (public domain, by
 * Fabian Giesen and Sean Barrett): PCA endpoints, least-squares refinement and optimal
 * single-colour tables. Mip chains stop at 4x4 like GTA's own textures.
 */

const expand5 = new Uint8Array(32)
const expand6 = new Uint8Array(64)
for (let i = 0; i < 32; i++) expand5[i] = (i << 3) | (i >> 2)
for (let i = 0; i < 64; i++) expand6[i] = (i << 2) | (i >> 4)

const lerp13 = (a: number, b: number) => Math.trunc((2 * a + b) / 3)

function prepareOptTable(expand: Uint8Array, size: number) {
  const table = new Uint8Array(512)
  for (let i = 0; i < 256; i++) {
    let bestErr = 256
    for (let mn = 0; mn < size; mn++) {
      for (let mx = 0; mx < size; mx++) {
        const mine = expand[mn]
        const maxe = expand[mx]
        let err = Math.abs(lerp13(maxe, mine) - i)
        err += Math.trunc((Math.abs(maxe - mine) * 3) / 100)
        if (err < bestErr) {
          table[i * 2] = mx
          table[i * 2 + 1] = mn
          bestErr = err
        }
      }
    }
  }
  return table
}

let omatch5: Uint8Array | null = null
let omatch6: Uint8Array | null = null
function tables() {
  if (!omatch5 || !omatch6) {
    omatch5 = prepareOptTable(expand5, 32)
    omatch6 = prepareOptTable(expand6, 64)
  }
  return { omatch5, omatch6 }
}

const mul8bit = (a: number, b: number) => {
  const t = a * b + 128
  return (t + (t >> 8)) >> 8
}
const as16bit = (r: number, g: number, b: number) => (mul8bit(r, 31) << 11) + (mul8bit(g, 63) << 5) + mul8bit(b, 31)

function from16bit(out: Uint8Array, o: number, v: number) {
  out[o] = expand5[(v & 0xf800) >> 11]
  out[o + 1] = expand6[(v & 0x07e0) >> 5]
  out[o + 2] = expand5[v & 0x001f]
  out[o + 3] = 0
}

function evalColors(color: Uint8Array, c0: number, c1: number) {
  from16bit(color, 0, c0)
  from16bit(color, 4, c1)
  for (let i = 0; i < 3; i++) {
    color[8 + i] = lerp13(color[i], color[4 + i])
    color[12 + i] = lerp13(color[4 + i], color[i])
  }
}

function matchColorsBlock(block: Uint8Array, color: Uint8Array) {
  const dirr = color[0] - color[4]
  const dirg = color[1] - color[5]
  const dirb = color[2] - color[6]
  const dots = new Int32Array(16)
  for (let i = 0; i < 16; i++) dots[i] = block[i * 4] * dirr + block[i * 4 + 1] * dirg + block[i * 4 + 2] * dirb
  const stops = [0, 1, 2, 3].map((i) => color[i * 4] * dirr + color[i * 4 + 1] * dirg + color[i * 4 + 2] * dirb)
  const c0Point = stops[1] + stops[3]
  const halfPoint = stops[3] + stops[2]
  const c3Point = stops[2] + stops[0]
  let mask = 0
  for (let i = 15; i >= 0; i--) {
    const dot = dots[i] * 2
    mask = (mask << 2) >>> 0
    if (dot < halfPoint) mask |= dot < c0Point ? 1 : 3
    else mask |= dot < c3Point ? 2 : 0
  }
  return mask >>> 0
}

function optimizeColorsBlock(block: Uint8Array): [number, number] {
  const mu = [0, 0, 0]
  const min = [0, 0, 0]
  const max = [0, 0, 0]
  for (let ch = 0; ch < 3; ch++) {
    let muv = block[ch]
    let minv = muv
    let maxv = muv
    for (let i = 4; i < 64; i += 4) {
      const v = block[i + ch]
      muv += v
      if (v < minv) minv = v
      else if (v > maxv) maxv = v
    }
    mu[ch] = (muv + 8) >> 4
    min[ch] = minv
    max[ch] = maxv
  }
  const cov = [0, 0, 0, 0, 0, 0]
  for (let i = 0; i < 16; i++) {
    const r = block[i * 4] - mu[0]
    const g = block[i * 4 + 1] - mu[1]
    const b = block[i * 4 + 2] - mu[2]
    cov[0] += r * r
    cov[1] += r * g
    cov[2] += r * b
    cov[3] += g * g
    cov[4] += g * b
    cov[5] += b * b
  }
  const covf = cov.map((c) => Math.fround(c / 255))
  let vfr = max[0] - min[0]
  let vfg = max[1] - min[1]
  let vfb = max[2] - min[2]
  for (let iter = 0; iter < 4; iter++) {
    const r = Math.fround(vfr * covf[0] + vfg * covf[1] + vfb * covf[2])
    const g = Math.fround(vfr * covf[1] + vfg * covf[3] + vfb * covf[4])
    const b = Math.fround(vfr * covf[2] + vfg * covf[4] + vfb * covf[5])
    vfr = r
    vfg = g
    vfb = b
  }
  let magn = Math.max(Math.abs(vfr), Math.abs(vfg), Math.abs(vfb))
  let vr: number
  let vg: number
  let vb: number
  if (magn < 4) {
    vr = 299
    vg = 587
    vb = 114
  } else {
    magn = 512 / magn
    vr = Math.trunc(vfr * magn)
    vg = Math.trunc(vfg * magn)
    vb = Math.trunc(vfb * magn)
  }
  let mind = block[0] * vr + block[1] * vg + block[2] * vb
  let maxd = mind
  let minp = 0
  let maxp = 0
  for (let i = 1; i < 16; i++) {
    const dot = block[i * 4] * vr + block[i * 4 + 1] * vg + block[i * 4 + 2] * vb
    if (dot < mind) {
      mind = dot
      minp = i * 4
    }
    if (dot > maxd) {
      maxd = dot
      maxp = i * 4
    }
  }
  return [as16bit(block[maxp], block[maxp + 1], block[maxp + 2]), as16bit(block[minp], block[minp + 1], block[minp + 2])]
}

const sclamp = (y: number, p0: number, p1: number) => {
  const x = Math.trunc(y)
  return x < p0 ? p0 : x > p1 ? p1 : x
}

const W1_TAB = [3, 0, 2, 1]
const PRODS = [0x090000, 0x000900, 0x040102, 0x010402]

function refineBlock(block: Uint8Array, max16: number, min16: number, mask: number): [number, number, boolean] {
  let nmax: number
  let nmin: number
  if (((mask ^ (mask << 2)) >>> 0) < 4) {
    let r = 8
    let g = 8
    let b = 8
    for (let i = 0; i < 16; i++) {
      r += block[i * 4]
      g += block[i * 4 + 1]
      b += block[i * 4 + 2]
    }
    r >>= 4
    g >>= 4
    b >>= 4
    const { omatch5: o5, omatch6: o6 } = tables()
    nmax = (o5[r * 2] << 11) | (o6[g * 2] << 5) | o5[b * 2]
    nmin = (o5[r * 2 + 1] << 11) | (o6[g * 2 + 1] << 5) | o5[b * 2 + 1]
  } else {
    let akku = 0
    let at1r = 0
    let at1g = 0
    let at1b = 0
    let at2r = 0
    let at2g = 0
    let at2b = 0
    let cm = mask
    for (let i = 0; i < 16; i++, cm >>>= 2) {
      const step = cm & 3
      const w1 = W1_TAB[step]
      const r = block[i * 4]
      const g = block[i * 4 + 1]
      const b = block[i * 4 + 2]
      akku += PRODS[step]
      at1r += w1 * r
      at1g += w1 * g
      at1b += w1 * b
      at2r += r
      at2g += g
      at2b += b
    }
    at2r = 3 * at2r - at1r
    at2g = 3 * at2g - at1g
    at2b = 3 * at2b - at1b
    const xx = akku >> 16
    const yy = (akku >> 8) & 0xff
    const xy = akku & 0xff
    const frb = (3 * 31) / 255 / (xx * yy - xy * xy)
    const fg = (frb * 63) / 31
    nmax =
      (sclamp((at1r * yy - at2r * xy) * frb + 0.5, 0, 31) << 11) |
      (sclamp((at1g * yy - at2g * xy) * fg + 0.5, 0, 63) << 5) |
      sclamp((at1b * yy - at2b * xy) * frb + 0.5, 0, 31)
    nmin =
      (sclamp((at2r * xx - at1r * xy) * frb + 0.5, 0, 31) << 11) |
      (sclamp((at2g * xx - at1g * xy) * fg + 0.5, 0, 63) << 5) |
      sclamp((at2b * xx - at1b * xy) * frb + 0.5, 0, 31)
  }
  return [nmax, nmin, nmax !== max16 || nmin !== min16]
}

function compressColorBlock(dest: Uint8Array, o: number, block: Uint8Array) {
  const words = new Uint32Array(block.buffer, block.byteOffset, 16)
  let constant = true
  for (let i = 1; i < 16; i++) {
    if (words[i] !== words[0]) {
      constant = false
      break
    }
  }
  let max16: number
  let min16: number
  let mask: number
  if (constant) {
    const { omatch5: o5, omatch6: o6 } = tables()
    const r = block[0]
    const g = block[1]
    const b = block[2]
    mask = 0xaaaaaaaa
    max16 = (o5[r * 2] << 11) | (o6[g * 2] << 5) | o5[b * 2]
    min16 = (o5[r * 2 + 1] << 11) | (o6[g * 2 + 1] << 5) | o5[b * 2 + 1]
  } else {
    const color = new Uint8Array(16)
    ;[max16, min16] = optimizeColorsBlock(block)
    if (max16 !== min16) {
      evalColors(color, max16, min16)
      mask = matchColorsBlock(block, color)
    } else mask = 0
    for (let i = 0; i < 2; i++) {
      const last = mask
      const [nmax, nmin, changed] = refineBlock(block, max16, min16, mask)
      max16 = nmax
      min16 = nmin
      if (changed) {
        if (max16 !== min16) {
          evalColors(color, max16, min16)
          mask = matchColorsBlock(block, color)
        } else {
          mask = 0
          break
        }
      }
      if (mask === last) break
    }
  }
  if (max16 < min16) {
    const t = min16
    min16 = max16
    max16 = t
    mask = (mask ^ 0x55555555) >>> 0
  }
  dest[o] = max16 & 0xff
  dest[o + 1] = max16 >> 8
  dest[o + 2] = min16 & 0xff
  dest[o + 3] = min16 >> 8
  dest[o + 4] = mask & 0xff
  dest[o + 5] = (mask >>> 8) & 0xff
  dest[o + 6] = (mask >>> 16) & 0xff
  dest[o + 7] = (mask >>> 24) & 0xff
}

function compressAlphaBlock(dest: Uint8Array, o: number, block: Uint8Array) {
  let mn = block[3]
  let mx = mn
  for (let i = 1; i < 16; i++) {
    const a = block[i * 4 + 3]
    if (a < mn) mn = a
    else if (a > mx) mx = a
  }
  dest[o] = mx
  dest[o + 1] = mn
  let p = o + 2
  const dist = mx - mn
  const dist4 = dist * 4
  const dist2 = dist * 2
  let bias = dist < 8 ? dist - 1 : Math.trunc(dist / 2) + 2
  bias -= mn * 7
  let bits = 0
  let mask = 0
  for (let i = 0; i < 16; i++) {
    let a = block[i * 4 + 3] * 7 + bias
    let t = a >= dist4 ? -1 : 0
    let ind = t & 4
    a -= dist4 & t
    t = a >= dist2 ? -1 : 0
    ind += t & 2
    a -= dist2 & t
    ind += a >= dist ? 1 : 0
    ind = -ind & 7
    ind ^= 2 > ind ? 1 : 0
    mask |= ind << bits
    bits += 3
    if (bits >= 8) {
      dest[p++] = mask & 0xff
      mask >>= 8
      bits -= 8
    }
  }
}

/** Compresses one RGBA mip level. `rgba` is top-to-bottom rows, 4 bytes per pixel. */
export function compressLevel(rgba: Uint8Array, width: number, height: number, format: 'DXT1' | 'DXT5'): Uint8Array {
  const bw = Math.max(1, Math.ceil(width / 4))
  const bh = Math.max(1, Math.ceil(height / 4))
  const blockBytes = format === 'DXT1' ? 8 : 16
  const out = new Uint8Array(bw * bh * blockBytes)
  const block = new Uint8Array(64)
  let o = 0
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      for (let y = 0; y < 4; y++) {
        const sy = Math.min(height - 1, by * 4 + y)
        for (let x = 0; x < 4; x++) {
          const sx = Math.min(width - 1, bx * 4 + x)
          const s = (sy * width + sx) * 4
          const d = (y * 4 + x) * 4
          block[d] = rgba[s]
          block[d + 1] = rgba[s + 1]
          block[d + 2] = rgba[s + 2]
          block[d + 3] = rgba[s + 3]
        }
      }
      if (format === 'DXT5') {
        compressAlphaBlock(out, o, block)
        o += 8
      }
      compressColorBlock(out, o, block)
      o += 8
    }
  }
  return out
}

/** Half-size box filter (alpha weighted so transparent texels don't bleed their colour). */
export function downsample(rgba: Uint8Array, width: number, height: number) {
  const w = Math.max(1, width >> 1)
  const h = Math.max(1, height >> 1)
  const out = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      let n = 0
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const sx = Math.min(width - 1, x * 2 + dx)
          const sy = Math.min(height - 1, y * 2 + dy)
          const s = (sy * width + sx) * 4
          const wa = rgba[s + 3] + 1
          r += rgba[s] * wa
          g += rgba[s + 1] * wa
          b += rgba[s + 2] * wa
          a += rgba[s + 3]
          n += wa
        }
      }
      const d = (y * w + x) * 4
      out[d] = Math.round(r / n)
      out[d + 1] = Math.round(g / n)
      out[d + 2] = Math.round(b / n)
      out[d + 3] = Math.round(a / 4)
    }
  }
  return out
}

function isPowerOfTwo(n: number) {
  return n > 0 && (n & (n - 1)) === 0
}

/**
 * Encodes an RGBA image (power-of-two sides, at least 4x4) into a texture with a full
 * mip chain down to 4x4. Uses DXT1 for opaque images and DXT5 when any texel has alpha.
 */
export function encodeTexture(name: string, rgba: Uint8Array, width: number, height: number, force?: TextureFormatName): TextureDef {
  if (!isPowerOfTwo(width) || !isPowerOfTwo(height) || width < 4 || height < 4) {
    throw new Error(`Texture ${name} must be a power of two of at least 4x4 (got ${width}x${height})`)
  }
  let hasAlpha = false
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i] < 250) {
      hasAlpha = true
      break
    }
  }
  const format: TextureFormatName = force ?? (hasAlpha ? 'DXT5' : 'DXT1')
  const levels: Uint8Array[] = []
  let w = width
  let h = height
  let level = rgba
  for (;;) {
    if (format === 'A8R8G8B8') {
      const bgra = new Uint8Array(level.length)
      for (let i = 0; i < level.length; i += 4) {
        bgra[i] = level[i + 2]
        bgra[i + 1] = level[i + 1]
        bgra[i + 2] = level[i]
        bgra[i + 3] = level[i + 3]
      }
      levels.push(bgra)
    } else levels.push(compressLevel(level, w, h, format))
    if (w <= 4 || h <= 4) break
    level = downsample(level, w, h)
    w >>= 1
    h >>= 1
  }
  const total = levels.reduce((s, l) => s + l.length, 0)
  const data = new Uint8Array(total)
  let o = 0
  for (const l of levels) {
    data.set(l, o)
    o += l.length
  }
  return { name, width, height, format, levels: levels.length, data }
}
