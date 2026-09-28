import { deflateSync } from 'fflate'

/**
 * GTA V resource (RSC7) writer, ported from CodeWalker's ResourceBuilder so the files we
 * produce are laid out exactly like the ones CodeWalker and Sollumz produce.
 *
 * A resource is a graph of blocks. Every block lives in the "system" (CPU) or "graphics"
 * (GPU: texture pixels) segment, is placed in fixed-size pages and points at other blocks
 * with absolute virtual addresses (0x50000000 system, 0x60000000 graphics).
 */

export const SYSTEM_BASE = 0x50000000
export const GRAPHICS_BASE = 0x60000000
const ALIGN_SIZE = 16

class GrowBuffer {
  bytes = new Uint8Array(4096)
  length = 0

  write(pos: number, data: Uint8Array) {
    const end = pos + data.length
    if (end > this.bytes.length) {
      let cap = this.bytes.length
      while (cap < end) cap *= 2
      const next = new Uint8Array(cap)
      next.set(this.bytes.subarray(0, this.length))
      this.bytes = next
    }
    this.bytes.set(data, pos)
    if (end > this.length) this.length = end
  }
}

const scratch = new DataView(new ArrayBuffer(8))
const scratchBytes = new Uint8Array(scratch.buffer)

/** Little-endian writer over the system and graphics segments (CodeWalker's ResourceDataWriter). */
export class ResourceWriter {
  position = 0
  private readonly system = new GrowBuffer()
  private readonly graphics = new GrowBuffer()

  bytes(data: Uint8Array) {
    if ((this.position & SYSTEM_BASE) === SYSTEM_BASE) {
      this.system.write(this.position - SYSTEM_BASE, data)
    } else if ((this.position & GRAPHICS_BASE) === GRAPHICS_BASE) {
      this.graphics.write(this.position - GRAPHICS_BASE, data)
    } else {
      throw new Error(`Resource write outside of any segment at 0x${this.position.toString(16)}`)
    }
    this.position += data.length
  }
  u8(v: number) {
    scratch.setUint8(0, v)
    this.bytes(scratchBytes.slice(0, 1))
  }
  i8(v: number) {
    scratch.setInt8(0, v)
    this.bytes(scratchBytes.slice(0, 1))
  }
  u16(v: number) {
    scratch.setUint16(0, v, true)
    this.bytes(scratchBytes.slice(0, 2))
  }
  i16(v: number) {
    scratch.setInt16(0, v, true)
    this.bytes(scratchBytes.slice(0, 2))
  }
  u32(v: number) {
    scratch.setUint32(0, v >>> 0, true)
    this.bytes(scratchBytes.slice(0, 4))
  }
  i32(v: number) {
    scratch.setInt32(0, v, true)
    this.bytes(scratchBytes.slice(0, 4))
  }
  f32(v: number) {
    scratch.setFloat32(0, v, true)
    this.bytes(scratchBytes.slice(0, 4))
  }
  /** 64-bit unsigned; pointers and small values only (exact up to 2^53). */
  u64(v: number) {
    scratch.setUint32(0, v % 0x100000000 >>> 0, true)
    scratch.setUint32(4, Math.floor(v / 0x100000000) >>> 0, true)
    this.bytes(scratchBytes.slice(0, 8))
  }
  vec3(v: Vec3) {
    this.f32(v[0])
    this.f32(v[1])
    this.f32(v[2])
  }
  vec4(v: Vec4) {
    this.f32(v[0])
    this.f32(v[1])
    this.f32(v[2])
    this.f32(v[3])
  }
  zeros(n: number) {
    if (n > 0) this.bytes(new Uint8Array(n))
  }
  /** Null-terminated ASCII string. */
  cstring(s: string) {
    const out = new Uint8Array(s.length + 1)
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0x7f
    this.bytes(out)
  }
  padding(alignment: number) {
    const pad = (alignment - (this.position % alignment)) % alignment
    this.zeros(pad)
  }
  block(b: Block) {
    b.write(this)
  }

  segment(which: 'system' | 'graphics') {
    const buf = which === 'system' ? this.system : this.graphics
    return buf.bytes.subarray(0, buf.length)
  }
}

export type Vec2 = [number, number]
export type Vec3 = [number, number, number]
export type Vec4 = [number, number, number, number]

/**
 * One contiguous piece of a resource. `references` are blocks placed elsewhere that this
 * block points at; `parts` are blocks embedded inside this one at fixed offsets.
 */
export abstract class Block {
  filePosition = 0
  abstract get length(): number
  get isGraphics() {
    return false
  }
  abstract write(w: ResourceWriter): void
  references(): Block[] {
    return []
  }
  parts(): [number, Block][] {
    return []
  }
  setPosition(p: number) {
    this.filePosition = p
    for (const [offset, part] of this.parts()) part.setPosition(p + offset)
  }
}

/** Raw bytes (CodeWalker's ResourceSystemDataBlock / ResourceSystemStructBlock). */
export class DataBlock extends Block {
  data: Uint8Array
  /** Number of structs, for struct arrays. */
  itemCount: number
  constructor(data: Uint8Array, itemCount = 0) {
    super()
    this.data = data
    this.itemCount = itemCount
  }
  get length() {
    return this.data.length
  }
  write(w: ResourceWriter) {
    w.bytes(this.data)
  }
}

/** Texture pixels: the only data that goes in the graphics segment. */
export class GraphicsDataBlock extends DataBlock {
  get isGraphics() {
    return true
  }
}

/** Null-terminated string block (string_r). */
export class StringBlock extends Block {
  value: string
  constructor(value: string) {
    super()
    this.value = value
  }
  get length() {
    return this.value.length + 1
  }
  write(w: ResourceWriter) {
    w.cstring(this.value)
  }
}

/** Little-endian struct-array builder for DataBlocks. */
export class StructWriter {
  private readonly view: DataView
  readonly bytes: Uint8Array
  offset = 0
  constructor(size: number) {
    this.bytes = new Uint8Array(size)
    this.view = new DataView(this.bytes.buffer)
  }
  u8(v: number) {
    this.view.setUint8(this.offset, v)
    this.offset += 1
  }
  u16(v: number) {
    this.view.setUint16(this.offset, v, true)
    this.offset += 2
  }
  i16(v: number) {
    this.view.setInt16(this.offset, v, true)
    this.offset += 2
  }
  u32(v: number) {
    this.view.setUint32(this.offset, v >>> 0, true)
    this.offset += 4
  }
  i32(v: number) {
    this.view.setInt32(this.offset, v, true)
    this.offset += 4
  }
  f32(v: number) {
    this.view.setFloat32(this.offset, v, true)
    this.offset += 4
  }
  u64(v: number) {
    this.view.setUint32(this.offset, v % 0x100000000 >>> 0, true)
    this.view.setUint32(this.offset + 4, Math.floor(v / 0x100000000) >>> 0, true)
    this.offset += 8
  }
  vec3(v: Vec3) {
    this.f32(v[0])
    this.f32(v[1])
    this.f32(v[2])
  }
  vec4(v: Vec4) {
    this.f32(v[0])
    this.f32(v[1])
    this.f32(v[2])
    this.f32(v[3])
  }
  skip(n: number) {
    this.offset += n
  }
}

/** Header block every resource file starts with (ResourceFileBase + ResourcePagesInfo). */
export class PagesInfoBlock extends Block {
  systemPagesCount = 128 // sized for the worst case until the real count is known
  graphicsPagesCount = 0
  get length() {
    return 16 + 8 * (this.systemPagesCount + this.graphicsPagesCount)
  }
  write(w: ResourceWriter) {
    w.u32(0)
    w.u32(0)
    w.u8(this.systemPagesCount)
    w.u8(this.graphicsPagesCount)
    w.u16(0)
    w.u32(0)
    w.zeros(8 * (this.systemPagesCount + this.graphicsPagesCount))
  }
}

export abstract class FileBaseBlock extends Block {
  fileVFT = 0
  fileUnknown = 1
  pagesInfo: PagesInfoBlock | null = null
  writeFileBase(w: ResourceWriter) {
    w.u32(this.fileVFT)
    w.u32(this.fileUnknown)
    w.u64(this.pagesInfo ? this.pagesInfo.filePosition : 0)
  }
  references(): Block[] {
    return this.pagesInfo ? [this.pagesInfo] : []
  }
}

/* ------------------------------------------------------------------------------------------ */
/* .NET List<T>.Sort (introsort), so blocks of equal size are ordered exactly like CodeWalker. */

function dotnetSort<T>(keys: T[], cmp: (a: T, b: T) => number) {
  const n = keys.length
  if (n <= 1) return
  const swap = (i: number, j: number) => {
    const t = keys[i]
    keys[i] = keys[j]
    keys[j] = t
  }
  const swapIfGreater = (i: number, j: number) => {
    if (cmp(keys[i], keys[j]) > 0) swap(i, j)
  }
  const insertionSort = (lo: number, hi: number) => {
    for (let i = lo; i < hi; i++) {
      const t = keys[i + 1]
      let j = i
      while (j >= lo && cmp(t, keys[j]) < 0) {
        keys[j + 1] = keys[j]
        j--
      }
      keys[j + 1] = t
    }
  }
  const downHeap = (lo: number, i: number, count: number) => {
    const d = keys[lo + i - 1]
    while (i <= count >> 1) {
      let child = 2 * i
      if (child < count && cmp(keys[lo + child - 1], keys[lo + child]) < 0) child++
      if (!(cmp(d, keys[lo + child - 1]) < 0)) break
      keys[lo + i - 1] = keys[lo + child - 1]
      i = child
    }
    keys[lo + i - 1] = d
  }
  const heapSort = (lo: number, hi: number) => {
    const count = hi - lo + 1
    for (let i = count >> 1; i >= 1; i--) downHeap(lo, i, count)
    for (let i = count; i > 1; i--) {
      swap(lo, lo + i - 1)
      downHeap(lo, 1, i - 1)
    }
  }
  const pickPivotAndPartition = (lo: number, hi: number) => {
    const middle = lo + ((hi - lo) >> 1)
    swapIfGreater(lo, middle)
    swapIfGreater(lo, hi)
    swapIfGreater(middle, hi)
    const pivot = keys[middle]
    swap(middle, hi - 1)
    let left = lo
    let right = hi - 1
    while (left < right) {
      while (cmp(keys[++left], pivot) < 0) {
        /* advance */
      }
      while (cmp(pivot, keys[--right]) < 0) {
        /* advance */
      }
      if (left >= right) break
      swap(left, right)
    }
    if (left !== hi - 1) swap(left, hi - 1)
    return left
  }
  const introSort = (lo: number, hi: number, depthLimit: number) => {
    while (hi > lo) {
      const size = hi - lo + 1
      if (size <= 16) {
        if (size === 2) {
          swapIfGreater(lo, hi)
          return
        }
        if (size === 3) {
          swapIfGreater(lo, hi - 1)
          swapIfGreater(lo, hi)
          swapIfGreater(hi - 1, hi)
          return
        }
        insertionSort(lo, hi)
        return
      }
      if (depthLimit === 0) {
        heapSort(lo, hi)
        return
      }
      depthLimit--
      const p = pickPivotAndPartition(lo, hi)
      introSort(p + 1, hi, depthLimit)
      hi = p - 1
    }
  }
  introSort(0, n - 1, 2 * (Math.floor(Math.log2(n)) + 1))
}

/* ------------------------------------------------------------------------------------------ */

export interface PageFlags {
  value: number
  count: number
  size: number
}

function pageFlags(value: number): PageFlags {
  const shift = value & 0xf
  const baseSize = 0x200 << shift
  const counts = [
    (value >>> 4) & 0x1,
    (value >>> 5) & 0x3,
    (value >>> 7) & 0xf,
    (value >>> 11) & 0x3f,
    (value >>> 17) & 0x7f,
    (value >>> 24) & 0x1,
    (value >>> 25) & 0x1,
    (value >>> 26) & 0x1,
    (value >>> 27) & 0x1,
  ]
  let count = 0
  let size = 0
  counts.forEach((c, i) => {
    count += c
    size += c * (baseSize << (8 - i))
  })
  return { value, count, size }
}

/** Collects every block reachable from the root, system and graphics, in CodeWalker's order. */
function getBlocks(root: Block) {
  const system = new Set<Block>()
  const graphics = new Set<Block>()
  const processed = new Set<Block>()
  const add = (b: Block) => {
    if (b.isGraphics) graphics.add(b)
    else system.add(b)
  }
  const addChildren = (b: Block) => {
    if (b.isGraphics) return
    for (const ref of b.references()) {
      if (processed.has(ref)) continue
      processed.add(ref)
      add(ref)
      addChildren(ref)
    }
    for (const [, part] of b.parts()) addChildren(part)
  }
  add(root)
  addChildren(root)
  return { system: [...system], graphics: [...graphics] }
}

/** CodeWalker's AssignPositions2: packs blocks into at most 5 page sizes. */
function assignPositions(blocks: Block[], base: number, maxPageCount: number): PageFlags {
  const sys = base === SYSTEM_BASE
  const maxPageSizeMult = 16
  let maxBlockSize = 0
  let minBlockSize = blocks.length === 0 ? 0 : Number.MAX_SAFE_INTEGER
  for (const b of blocks) {
    maxBlockSize = Math.max(maxBlockSize, b.length)
    minBlockSize = Math.min(minBlockSize, b.length)
  }
  let baseShift = 0
  let baseSize = 0x2000
  while ((baseSize < minBlockSize || baseSize * maxPageSizeMult < maxBlockSize) && baseShift < 0xf) {
    baseShift++
    baseSize = 0x2000 * 2 ** baseShift
  }
  if (baseSize * maxPageSizeMult < maxBlockSize) throw new Error('Resource block too large to fit a page')

  const rootBlock = sys && blocks.length > 0 ? blocks[0] : null
  const sorted = blocks.filter((b) => b !== rootBlock)
  dotnetSort(sorted, (a, b) => (b.length === a.length ? 0 : b.length > a.length ? 1 : -1))
  if (rootBlock) sorted.unshift(rootBlock)

  const pageCounts = [0, 0, 0, 0, 0]
  let pageSizes: (number[] | null)[] = []
  let blockPages = new Map<Block, [number, number, number]>()
  for (;;) {
    pageSizes = [null, null, null, null, null]
    blockPages = new Map()
    let largestPageSizeI = 0
    let largestPageSize = baseSize
    while (largestPageSize < maxBlockSize) {
      largestPageSizeI++
      largestPageSize *= 2
    }
    for (let i = 0; i < sorted.length; i++) {
      const block = sorted[i]
      const size = block.length
      if (i === 0) {
        pageSizes[largestPageSizeI] = [size]
        blockPages.set(block, [largestPageSizeI, 0, 0])
        continue
      }
      let pageSizeIndex = 0
      let pageSize = baseSize
      while (size > pageSize && pageSizeIndex < largestPageSizeI) {
        pageSizeIndex++
        pageSize *= 2
      }
      let found = false
      let testI = pageSizeIndex
      let testSize = pageSize
      while (!found && testI <= largestPageSizeI) {
        const list = pageSizes[testI]
        if (list) {
          for (let p = 0; p < list.length; p++) {
            let s = list[p]
            s += (ALIGN_SIZE - (s % ALIGN_SIZE)) % ALIGN_SIZE
            const o = s
            s += size
            if (s <= testSize) {
              list[p] = s
              found = true
              blockPages.set(block, [testI, p, o])
              break
            }
          }
        }
        testI++
        testSize *= 2
      }
      if (!found) {
        let list = pageSizes[pageSizeIndex]
        if (!list) {
          list = []
          pageSizes[pageSizeIndex] = list
        }
        blockPages.set(block, [pageSizeIndex, list.length, 0])
        list.push(size)
      }
    }
    let total = 0
    for (let i = 0; i < 5; i++) {
      pageCounts[i] = pageSizes[i]?.length ?? 0
      total += pageCounts[i]
    }
    const ok =
      total <= maxPageCount && pageCounts[0] <= 0x7f && pageCounts[1] <= 0x3f && pageCounts[2] <= 0xf && pageCounts[3] <= 0x3 && pageCounts[4] <= 0x1
    if (ok) break
    if (baseShift >= 0xf) throw new Error('Unable to pack resource blocks')
    baseShift++
    baseSize = 0x2000 * 2 ** baseShift
  }

  let pageOffset = 0
  const pageOffsets = [0, 0, 0, 0, 0]
  for (let i = 4; i >= 0; i--) {
    pageOffsets[i] = pageOffset
    pageOffset += baseSize * 2 ** i * pageCounts[i]
  }
  for (const [block, [sizeI, pageI, offset]] of blockPages) {
    block.setPosition(base + pageOffsets[sizeI] + baseSize * 2 ** sizeI * pageI + offset)
  }

  const v =
    (baseShift & 0xf) +
    (pageCounts[4] & 0x1) * 2 ** 4 +
    (pageCounts[3] & 0x3) * 2 ** 5 +
    (pageCounts[2] & 0xf) * 2 ** 7 +
    (pageCounts[1] & 0x3f) * 2 ** 11 +
    (pageCounts[0] & 0x7f) * 2 ** 17
  return pageFlags(v)
}

/** CodeWalker's AssignPositionsForMeta: sequential packing used for .ymap / .ytyp. */
function assignPositionsForMeta(blocks: Block[], base: number): PageFlags {
  let largest = 0
  for (const b of blocks) largest = Math.max(largest, b.length)
  let pageSize = 0x2000
  while (pageSize < largest) pageSize *= 2
  let pageCount = 0
  for (;;) {
    pageCount = 0
    let position = 0
    for (const block of blocks) {
      const space = pageCount * pageSize - position
      if (space < block.length + 16) {
        pageCount++
        position = pageSize * (pageCount - 1)
      }
      block.setPosition(base + position)
      position += block.length
      if (position % ALIGN_SIZE !== 0) position += ALIGN_SIZE - (position % ALIGN_SIZE)
    }
    if (pageCount < 128) break
    pageSize *= 2
  }
  return pageFlags(flagsFromBlocks(pageCount, pageSize))
}

/** RpfResourceFileEntry.GetFlagsFromBlocks (page count and size to flags). */
function flagsFromBlocks(blockCount: number, blockSize: number) {
  let ss = 0
  let bst = blockSize
  if (blockCount > 0) {
    while (bst > 0x200) {
      ss++
      bst >>= 1
    }
  }
  const s0 = (blockCount >> 0) & 0x1
  const s1 = (blockCount >> 1) & 0x1
  const s2 = (blockCount >> 2) & 0x1
  const s3 = (blockCount >> 3) & 0x1
  const s4 = (blockCount >> 4) & 0x7f
  ss &= 0xf
  return ((s0 << 27) | (s1 << 26) | (s2 << 25) | (s3 << 24) | (s4 << 17) | ss) >>> 0
}

export interface BuildOptions {
  /** Use the sequential packing of meta files (.ytyp / .ymap). */
  meta?: boolean
  /** Skip deflate (for debugging). */
  compress?: boolean
}

/** Lays out, writes and compresses a resource. Returns the complete RSC7 file. */
export function buildResource(root: FileBaseBlock, version: number, options: BuildOptions = {}): Uint8Array {
  root.pagesInfo = new PagesInfoBlock()
  const { system, graphics } = getBlocks(root)

  const sysFlags = options.meta ? assignPositionsForMeta(system, SYSTEM_BASE) : assignPositions(system, SYSTEM_BASE, 128)
  const gfxFlags = options.meta ? assignPositionsForMeta(graphics, GRAPHICS_BASE) : assignPositions(graphics, GRAPHICS_BASE, 128 - sysFlags.count)
  root.pagesInfo.systemPagesCount = sysFlags.count
  root.pagesInfo.graphicsPagesCount = gfxFlags.count

  const w = new ResourceWriter()
  for (const list of [system, graphics]) {
    for (const block of list) {
      w.position = block.filePosition
      const before = w.position
      block.write(w)
      if (w.position - before !== block.length) {
        throw new Error(`${block.constructor.name} wrote ${w.position - before} bytes, expected ${block.length}`)
      }
    }
  }

  const sys = w.segment('system')
  const gfx = w.segment('graphics')
  const data = new Uint8Array(sysFlags.size + gfxFlags.size)
  data.set(sys.subarray(0, Math.min(sys.length, sysFlags.size)), 0)
  data.set(gfx.subarray(0, Math.min(gfx.length, gfxFlags.size)), sysFlags.size)
  const body = options.compress === false ? data : deflateSync(data, { level: 9 })

  const out = new Uint8Array(16 + body.length)
  const view = new DataView(out.buffer)
  const sv = (version >> 4) & 0xf
  const gv = version & 0xf
  view.setUint32(0, 0x37435352, true)
  view.setInt32(4, version, true)
  view.setUint32(8, (sysFlags.value + sv * 2 ** 28) >>> 0, true)
  view.setUint32(12, (gfxFlags.value + gv * 2 ** 28) >>> 0, true)
  out.set(body, 16)
  return out
}
