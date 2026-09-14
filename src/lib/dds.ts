/**
 * Minimal DDS decoder for the formats GTA V / OpenIV textures use:
 * BC1 (DXT1), BC2 (DXT3), BC3 (DXT5) and uncompressed 32/24-bit RGB(A),
 * including DX10-header variants. Only the top mip level is decoded.
 */

const DDS_MAGIC = 0x20534444 // 'DDS '
const DDPF_ALPHAPIXELS = 0x1
const DDPF_FOURCC = 0x4
const DDPF_RGB = 0x40

const FOURCC = (s: string) => s.charCodeAt(0) | (s.charCodeAt(1) << 8) | (s.charCodeAt(2) << 16) | (s.charCodeAt(3) << 24)
const FOURCC_DXT1 = FOURCC('DXT1')
const FOURCC_DXT2 = FOURCC('DXT2')
const FOURCC_DXT3 = FOURCC('DXT3')
const FOURCC_DXT4 = FOURCC('DXT4')
const FOURCC_DXT5 = FOURCC('DXT5')
const FOURCC_DX10 = FOURCC('DX10')

// DXGI_FORMAT values for the DX10 extended header.
const DXGI_BC1 = new Set([70, 71, 72])
const DXGI_BC2 = new Set([73, 74, 75])
const DXGI_BC3 = new Set([76, 77, 78])
const DXGI_RGBA8 = new Set([27, 28, 29]) // R8G8B8A8 (typeless / unorm / srgb)
const DXGI_BGRA8 = new Set([87, 90, 91]) // B8G8R8A8
const DXGI_BGRX8 = new Set([88, 92, 93]) // B8G8R8X8

type Codec = 'bc1' | 'bc2' | 'bc3' | 'rgba8' | 'bgra8' | 'bgrx8' | 'rgb8' | 'bgr8' | 'masked'

export interface DdsInfo {
  width: number
  height: number
  codec: string
}

export const isDds = (name: string) => /\.dds$/i.test(name)

function rgb565(v: number) {
  const r = (v >> 11) & 31
  const g = (v >> 5) & 63
  const b = v & 31
  return [(r << 3) | (r >> 2), (g << 2) | (g >> 4), (b << 3) | (b >> 2)]
}

function decodeColorBlock(src: DataView, off: number, out: Uint8ClampedArray, x0: number, y0: number, w: number, h: number, alpha: Uint8Array | null, bc1: boolean) {
  const c0 = src.getUint16(off, true)
  const c1 = src.getUint16(off + 2, true)
  const bits = src.getUint32(off + 4, true)
  const [r0, g0, b0] = rgb565(c0)
  const [r1, g1, b1] = rgb565(c1)
  const palette = [
    [r0, g0, b0, 255],
    [r1, g1, b1, 255],
    [0, 0, 0, 255],
    [0, 0, 0, 255],
  ]
  if (!bc1 || c0 > c1) {
    palette[2] = [(2 * r0 + r1) / 3, (2 * g0 + g1) / 3, (2 * b0 + b1) / 3, 255]
    palette[3] = [(r0 + 2 * r1) / 3, (g0 + 2 * g1) / 3, (b0 + 2 * b1) / 3, 255]
  } else {
    // BC1 punch-through alpha mode.
    palette[2] = [(r0 + r1) / 2, (g0 + g1) / 2, (b0 + b1) / 2, 255]
    palette[3] = [0, 0, 0, 0]
  }
  for (let py = 0; py < 4; py++) {
    const y = y0 + py
    if (y >= h) break
    for (let px = 0; px < 4; px++) {
      const x = x0 + px
      if (x >= w) continue
      const idx = (bits >> (2 * (py * 4 + px))) & 3
      const p = palette[idx]
      const o = (y * w + x) * 4
      out[o] = p[0]
      out[o + 1] = p[1]
      out[o + 2] = p[2]
      out[o + 3] = alpha ? alpha[py * 4 + px] : p[3]
    }
  }
}

function bc2Alpha(src: DataView, off: number): Uint8Array {
  const a = new Uint8Array(16)
  for (let i = 0; i < 4; i++) {
    const row = src.getUint16(off + i * 2, true)
    for (let j = 0; j < 4; j++) {
      const v = (row >> (j * 4)) & 15
      a[i * 4 + j] = (v << 4) | v
    }
  }
  return a
}

function bc3Alpha(src: DataView, off: number): Uint8Array {
  const a0 = src.getUint8(off)
  const a1 = src.getUint8(off + 1)
  const table = new Array<number>(8)
  table[0] = a0
  table[1] = a1
  if (a0 > a1) {
    for (let i = 1; i <= 6; i++) table[i + 1] = ((7 - i) * a0 + i * a1) / 7
  } else {
    for (let i = 1; i <= 4; i++) table[i + 1] = ((5 - i) * a0 + i * a1) / 5
    table[6] = 0
    table[7] = 255
  }
  // 48 bits of 3-bit indices, little endian.
  const lo = src.getUint8(off + 2) | (src.getUint8(off + 3) << 8) | (src.getUint8(off + 4) << 16)
  const hi = src.getUint8(off + 5) | (src.getUint8(off + 6) << 8) | (src.getUint8(off + 7) << 16)
  const a = new Uint8Array(16)
  for (let i = 0; i < 8; i++) {
    a[i] = table[(lo >> (3 * i)) & 7]
    a[8 + i] = table[(hi >> (3 * i)) & 7]
  }
  return a
}

function maskShift(mask: number) {
  if (!mask) return { shift: 0, bits: 0 }
  let shift = 0
  while (((mask >>> shift) & 1) === 0) shift++
  let bits = 0
  while ((mask >>> (shift + bits)) & 1) bits++
  return { shift, bits }
}

/** Decodes the first mip level of a DDS buffer into RGBA pixels. */
export function decodeDds(buffer: ArrayBuffer): { data: Uint8ClampedArray<ArrayBuffer>; info: DdsInfo } {
  const dv = new DataView(buffer)
  if (buffer.byteLength < 128 || dv.getUint32(0, true) !== DDS_MAGIC) throw new Error('Not a DDS file')
  const headerSize = dv.getUint32(4, true)
  if (headerSize !== 124) throw new Error('Unsupported DDS header')
  const height = dv.getUint32(12, true)
  const width = dv.getUint32(16, true)
  const pfFlags = dv.getUint32(80, true)
  const fourCC = dv.getUint32(84, true)
  const rgbBitCount = dv.getUint32(88, true)
  const rMask = dv.getUint32(92, true)
  const gMask = dv.getUint32(96, true)
  const bMask = dv.getUint32(100, true)
  const aMask = dv.getUint32(104, true)

  let codec: Codec
  let dataOffset = 128
  let label = ''

  if (pfFlags & DDPF_FOURCC) {
    if (fourCC === FOURCC_DX10) {
      const dxgi = dv.getUint32(128, true)
      dataOffset = 148
      if (DXGI_BC1.has(dxgi)) codec = 'bc1'
      else if (DXGI_BC2.has(dxgi)) codec = 'bc2'
      else if (DXGI_BC3.has(dxgi)) codec = 'bc3'
      else if (DXGI_RGBA8.has(dxgi)) codec = 'rgba8'
      else if (DXGI_BGRA8.has(dxgi)) codec = 'bgra8'
      else if (DXGI_BGRX8.has(dxgi)) codec = 'bgrx8'
      else if (dxgi >= 94 && dxgi <= 99) throw new Error('BC7 / BC6H textures are not supported. Re-save the DDS as DXT5 (BC3) or export to PNG.')
      else throw new Error(`Unsupported DDS DXGI format ${dxgi}. Re-save as DXT5 (BC3) or PNG.`)
      label = `DX10 ${dxgi}`
    } else if (fourCC === FOURCC_DXT1) codec = 'bc1'
    else if (fourCC === FOURCC_DXT2 || fourCC === FOURCC_DXT3) codec = 'bc2'
    else if (fourCC === FOURCC_DXT4 || fourCC === FOURCC_DXT5) codec = 'bc3'
    else {
      const tag = String.fromCharCode(fourCC & 255, (fourCC >> 8) & 255, (fourCC >> 16) & 255, (fourCC >> 24) & 255)
      throw new Error(`Unsupported DDS format "${tag}". Re-save as DXT1/DXT5 or export to PNG.`)
    }
    label ||= codec.toUpperCase()
  } else if (pfFlags & DDPF_RGB) {
    if (rgbBitCount === 32 && rMask === 0x00ff0000 && gMask === 0x0000ff00 && bMask === 0x000000ff) codec = pfFlags & DDPF_ALPHAPIXELS ? 'bgra8' : 'bgrx8'
    else if (rgbBitCount === 32 && rMask === 0x000000ff && gMask === 0x0000ff00 && bMask === 0x00ff0000) codec = 'rgba8'
    else if (rgbBitCount === 24 && rMask === 0x00ff0000) codec = 'bgr8'
    else if (rgbBitCount === 24 && rMask === 0x000000ff) codec = 'rgb8'
    else codec = 'masked'
    label = `${rgbBitCount}-bit RGB`
  } else {
    throw new Error('Unsupported DDS pixel format')
  }

  const out = new Uint8ClampedArray(new ArrayBuffer(width * height * 4))

  if (codec === 'bc1' || codec === 'bc2' || codec === 'bc3') {
    const blockSize = codec === 'bc1' ? 8 : 16
    const bw = Math.ceil(width / 4)
    const bh = Math.ceil(height / 4)
    if (buffer.byteLength < dataOffset + bw * bh * blockSize) throw new Error('DDS file is truncated')
    let off = dataOffset
    for (let by = 0; by < bh; by++) {
      for (let bx = 0; bx < bw; bx++) {
        if (codec === 'bc1') decodeColorBlock(dv, off, out, bx * 4, by * 4, width, height, null, true)
        else {
          const alpha = codec === 'bc2' ? bc2Alpha(dv, off) : bc3Alpha(dv, off)
          decodeColorBlock(dv, off + 8, out, bx * 4, by * 4, width, height, alpha, false)
        }
        off += blockSize
      }
    }
  } else {
    const bpp = rgbBitCount / 8
    const rowBytes = width * bpp
    if (buffer.byteLength < dataOffset + rowBytes * height) throw new Error('DDS file is truncated')
    const bytes = new Uint8Array(buffer, dataOffset)
    const rs = maskShift(rMask)
    const gs = maskShift(gMask)
    const bs = maskShift(bMask)
    const as = maskShift(aMask)
    const expand = (v: number, bits: number) => (bits >= 8 ? v >> (bits - 8) : bits === 0 ? 255 : Math.round((v / ((1 << bits) - 1)) * 255))
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * rowBytes + x * bpp
        const o = (y * width + x) * 4
        switch (codec) {
          case 'rgba8':
            out[o] = bytes[i]
            out[o + 1] = bytes[i + 1]
            out[o + 2] = bytes[i + 2]
            out[o + 3] = bytes[i + 3]
            break
          case 'bgra8':
          case 'bgrx8':
            out[o] = bytes[i + 2]
            out[o + 1] = bytes[i + 1]
            out[o + 2] = bytes[i]
            out[o + 3] = codec === 'bgra8' ? bytes[i + 3] : 255
            break
          case 'rgb8':
            out[o] = bytes[i]
            out[o + 1] = bytes[i + 1]
            out[o + 2] = bytes[i + 2]
            out[o + 3] = 255
            break
          case 'bgr8':
            out[o] = bytes[i + 2]
            out[o + 1] = bytes[i + 1]
            out[o + 2] = bytes[i]
            out[o + 3] = 255
            break
          default: {
            let v = 0
            for (let k = 0; k < bpp; k++) v |= bytes[i + k] << (8 * k)
            out[o] = expand((v & rMask) >>> rs.shift, rs.bits)
            out[o + 1] = expand((v & gMask) >>> gs.shift, gs.bits)
            out[o + 2] = expand((v & bMask) >>> bs.shift, bs.bits)
            out[o + 3] = aMask ? expand((v & aMask) >>> as.shift, as.bits) : 255
          }
        }
      }
    }
  }

  return { data: out, info: { width, height, codec: label } }
}

/** Decodes a DDS buffer straight onto a canvas. */
export function ddsToCanvas(buffer: ArrayBuffer): { canvas: HTMLCanvasElement; info: DdsInfo } {
  const { data, info } = decodeDds(buffer)
  const canvas = document.createElement('canvas')
  canvas.width = info.width
  canvas.height = info.height
  canvas.getContext('2d')!.putImageData(new ImageData(data, info.width, info.height), 0, 0)
  return { canvas, info }
}

/** Decodes a DDS blob into a PNG blob so the rest of the pipeline can treat it as a normal image. */
export async function ddsToPngBlob(blob: Blob): Promise<Blob> {
  const { canvas } = ddsToCanvas(await blob.arrayBuffer())
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encode failed'))), 'image/png'))
}

/** Fetches and decodes a DDS URL into an HTMLImageElement (object URL of the decoded PNG). */
export async function loadDdsImage(url: string): Promise<HTMLImageElement | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const type = res.headers.get('content-type') ?? ''
    if (type.includes('text/html')) return null
    const buf = await res.arrayBuffer()
    if (new DataView(buf).getUint32(0, true) !== DDS_MAGIC) return null
    const { canvas } = ddsToCanvas(buf)
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'))
    if (!blob) return null
    const objectUrl = URL.createObjectURL(blob)
    return await new Promise<HTMLImageElement | null>((resolve) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => resolve(null)
      img.src = objectUrl
    })
  } catch {
    return null
export const isDdsBuffer = (buf: ArrayBuffer) => buf.byteLength >= 4 && new DataView(buf).getUint32(0, true) === DDS_MAGIC

/** Decodes a DDS buffer into an HTMLImageElement backed by an object URL of the decoded PNG. */
export async function ddsBufferToImage(buf: ArrayBuffer): Promise<HTMLImageElement> {
  const { canvas } = ddsToCanvas(buf)
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'))
  if (!blob) throw new Error('PNG encode failed')
  const objectUrl = URL.createObjectURL(blob)
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Decoded image failed to load'))
    img.src = objectUrl
  })
}

/** Fetches and decodes a DDS URL. Returns the failure reason instead of throwing. */
export async function loadDdsImage(url: string): Promise<{ img: HTMLImageElement | null; error?: string }> {
  try {
    const res = await fetch(url)
    if (!res.ok) return { img: null, error: `HTTP ${res.status}` }
    const type = res.headers.get('content-type') ?? ''
    if (type.includes('text/html')) return { img: null, error: 'file not found (server returned the app page)' }
    const buf = await res.arrayBuffer()
    if (!isDdsBuffer(buf)) return { img: null, error: 'not a DDS file (missing "DDS " magic)' }
    return { img: await ddsBufferToImage(buf) }
  } catch (e) {
    return { img: null, error: (e as Error).message }
  }
}
