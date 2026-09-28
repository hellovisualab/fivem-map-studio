import { joaat } from '@/lib/gta/hash'
import {
  Block,
  DataBlock,
  FileBaseBlock,
  GraphicsDataBlock,
  StringBlock,
  StructWriter,
  buildResource,
  type ResourceWriter,
  type Vec3,
  type Vec4,
} from '@/lib/gta/resource'

/*
 * .ydr drawable writer (legacy / gen8, what FiveM loads), ported from CodeWalker's
 * Drawable.cs and Texture.cs. The block values mirror what CodeWalker builds when it
 * imports a Sollumz / CodeWalker XML, which is known to load in game.
 */

export const YDR_VERSION = 165

/** GTA V vertex declaration types for most drawables (CodeWalker VertexDeclarationTypes.GTAV1). */
export const VERTEX_TYPES_GTAV1 = { lo: 0x55996996, hi: 0x77555555 }

export const VertexSemantic = {
  Position: 0,
  BlendWeights: 1,
  BlendIndices: 2,
  Normal: 3,
  Colour0: 4,
  Colour1: 5,
  TexCoord0: 6,
  Tangent: 14,
} as const

/** Position, Normal, Colour0, TexCoord0: default.sps / emissive.sps. */
export const LAYOUT_PNCT = 89
/** PNCT + Tangent: normal.sps and friends. */
export const LAYOUT_PNCTX = 16473

const COMPONENT_SIZES = [0, 4, 4, 8, 4, 8, 12, 16, 4, 4, 4, 0, 0, 0, 0, 0]

function componentType(index: number) {
  const nibbles = index < 8 ? VERTEX_TYPES_GTAV1.lo : VERTEX_TYPES_GTAV1.hi
  return (nibbles >>> ((index % 8) * 4)) & 0xf
}

export function layoutStride(flags: number) {
  let stride = 0
  for (let k = 0; k < 16; k++) if ((flags >> k) & 1) stride += COMPONENT_SIZES[componentType(k)]
  return stride
}

export function layoutCount(flags: number) {
  let n = 0
  for (let k = 0; k < 16; k++) if ((flags >> k) & 1) n++
  return n
}

export function layoutOffset(flags: number, semantic: number) {
  let offset = 0
  for (let k = 0; k < semantic; k++) if ((flags >> k) & 1) offset += COMPONENT_SIZES[componentType(k)]
  return offset
}

/* ---------------------------------------------------------------------------------------- */
/* Input model (the same information a CodeWalker .ydr.xml carries).                        */

export type TextureFormatName = 'DXT1' | 'DXT5' | 'A8R8G8B8'

export const TEXTURE_FORMAT_CODES: Record<TextureFormatName, number> = {
  DXT1: 0x31545844,
  DXT5: 0x35545844,
  A8R8G8B8: 21,
}

export interface TextureDef {
  name: string
  width: number
  height: number
  format: TextureFormatName
  /** Number of mip levels in `data`. */
  levels: number
  /** Every mip level, largest first, as in a .dds file body. */
  data: Uint8Array
}

/** Texture parameter (`string` texture name or `null`), vector, or vector array. */
export type ShaderParamValue = string | null | Vec4 | Vec4[]

export interface ShaderParamDef {
  name: string
  value: ShaderParamValue
}

export interface ShaderDef {
  /** Base shader name, e.g. `default`, `normal`, `emissive`. */
  name: string
  /** Preset file, e.g. `default.sps`, `cutout.sps`, `normal_alpha.sps`. */
  fileName: string
  renderBucket: number
  params: ShaderParamDef[]
}

export interface GeometryDef {
  shaderIndex: number
  /** Vertex declaration flags (LAYOUT_PNCT, LAYOUT_PNCTX). */
  layout: number
  vertexCount: number
  /** Packed vertices, `layoutStride(layout)` bytes each. */
  vertices: Uint8Array
  indices: Uint16Array
  bbMin: Vec4
  bbMax: Vec4
}

export interface ModelDef {
  renderMask: number
  flags: number
  geometries: GeometryDef[]
}

export interface DrawableDef {
  name: string
  bsCenter: Vec3
  bsRadius: number
  bbMin: Vec3
  bbMax: Vec3
  lodDist: [number, number, number, number]
  models: { high: ModelDef[]; med?: ModelDef[]; low?: ModelDef[]; vlow?: ModelDef[] }
  /** Embedded texture dictionary. */
  textures: TextureDef[]
  shaders: ShaderDef[]
  /** Embedded collision (bounds root block). */
  bound?: Block | null
}

/** Stride as CodeWalker reads it from a .dds: bytes per pixel row of mip 0. */
export function textureStride(format: TextureFormatName, width: number, height: number) {
  if (format === 'A8R8G8B8') return width * 4
  const nbw = Math.max(1, Math.floor((width + 3) / 4))
  const nbh = Math.max(1, Math.floor((height + 3) / 4))
  const slice = nbw * (format === 'DXT1' ? 8 : 16) * nbh
  return Math.floor(slice / height)
}

/* ---------------------------------------------------------------------------------------- */
/* Blocks                                                                                    */

class StructArrayBlock extends DataBlock {}

function u16Block(values: ArrayLike<number>) {
  const s = new StructWriter(values.length * 2)
  for (let i = 0; i < values.length; i++) s.u16(values[i])
  return new StructArrayBlock(s.bytes, values.length)
}

function u32Block(values: ArrayLike<number>) {
  const s = new StructWriter(values.length * 4)
  for (let i = 0; i < values.length; i++) s.u32(values[i])
  return new StructArrayBlock(s.bytes, values.length)
}

function vec4Block(values: Vec4[]) {
  const s = new StructWriter(values.length * 16)
  for (const v of values) s.vec4(v)
  return new StructArrayBlock(s.bytes, values.length)
}

/** ResourcePointerArray64: a plain array of 64-bit pointers. */
export class PointerArrayBlock extends Block {
  items: Block[]
  constructor(items: Block[]) {
    super()
    this.items = items
  }
  get length() {
    return this.items.length * 8
  }
  write(w: ResourceWriter) {
    for (const item of this.items) w.u64(item.filePosition >>> 0)
  }
  references() {
    return this.items
  }
}

/** ResourcePointerList64 / ResourceSimpleList64: { pointer, count, capacity } header. */
class ListHeaderBlock extends Block {
  target: Block | null
  count: number
  constructor(target: Block | null, count: number) {
    super()
    this.target = target
    this.count = count
  }
  get length() {
    return 16
  }
  write(w: ResourceWriter) {
    w.u64(this.target ? this.target.filePosition : 0)
    w.u16(this.target ? this.count : 0)
    w.u16(this.target ? this.count : 0)
    w.u32(0)
  }
  references() {
    return this.target ? [this.target] : []
  }
}

export class TextureBlock extends Block {
  name: string
  hash: number
  width: number
  height: number
  format: TextureFormatName
  levels: number
  stride: number
  private readonly nameBlock: StringBlock
  private readonly data: GraphicsDataBlock
  constructor(def: TextureDef) {
    super()
    this.name = def.name
    this.hash = joaat(def.name.toLowerCase())
    this.width = def.width
    this.height = def.height
    this.format = def.format
    this.levels = def.levels
    this.stride = textureStride(def.format, def.width, def.height)
    this.nameBlock = new StringBlock(def.name)
    this.data = new GraphicsDataBlock(def.data)
  }
  get length() {
    return 144
  }
  write(w: ResourceWriter) {
    // TextureBase
    w.u32(0) // VFT
    w.u32(1)
    w.zeros(32) // 0x08..0x27
    w.u64(this.nameBlock.filePosition)
    w.u16(1) // Unknown_30h
    w.u16(0) // Unknown_32h
    w.zeros(12) // 0x34..0x3F
    w.u32(0) // UsageData
    w.u32(0) // Unknown_44h
    w.u32(0) // ExtraFlags
    w.u32(0) // Unknown_4Ch
    // Texture
    w.u16(this.width)
    w.u16(this.height)
    w.u16(1) // depth
    w.u16(this.stride)
    w.u32(TEXTURE_FORMAT_CODES[this.format])
    w.u8(0)
    w.u8(this.levels)
    w.u16(0)
    w.zeros(16) // 0x60..0x6F
    w.u64(this.data.filePosition)
    w.zeros(24) // 0x78..0x8F
  }
  references() {
    return [this.nameBlock, this.data]
  }
}

export class TextureDictionaryBlock extends FileBaseBlock {
  readonly textures: TextureBlock[]
  private readonly hashList: ListHeaderBlock
  private readonly textureList: ListHeaderBlock
  constructor(textures: TextureBlock[]) {
    super()
    // CodeWalker sorts by name hash so the game can binary search the dictionary.
    this.textures = [...textures].sort((a, b) => a.hash - b.hash)
    const n = this.textures.length
    this.hashList = new ListHeaderBlock(n ? u32Block(this.textures.map((t) => t.hash)) : null, n)
    this.textureList = new ListHeaderBlock(n ? new PointerArrayBlock(this.textures) : null, n)
  }
  get length() {
    return 64
  }
  write(w: ResourceWriter) {
    this.writeFileBase(w)
    w.u32(0)
    w.u32(0)
    w.u32(1)
    w.u32(0)
    w.block(this.hashList)
    w.block(this.textureList)
  }
  parts(): [number, Block][] {
    return [
      [0x20, this.hashList],
      [0x30, this.textureList],
    ]
  }
}

interface ParamSlot {
  dataType: number
  unknown1h: number
  texture: TextureBlock | TextureRefBlock | null
  vectors: Vec4[] | null
  vectorBlock: StructArrayBlock | null
}

/** A texture parameter pointing at a texture that is not embedded (external .ytd). */
export class TextureRefBlock extends Block {
  name: string
  private readonly nameBlock: StringBlock
  constructor(name: string) {
    super()
    this.name = name
    this.nameBlock = new StringBlock(name)
  }
  get length() {
    return 80
  }
  write(w: ResourceWriter) {
    w.u32(0)
    w.u32(1)
    w.zeros(32)
    w.u64(this.nameBlock.filePosition)
    w.u16(1)
    w.u16(2) // Unknown_32h, as set by CodeWalker's XML import
    w.zeros(12)
    w.u32(0)
    w.u32(0)
    w.u32(0)
    w.u32(0)
  }
  references() {
    return [this.nameBlock]
  }
}

class ShaderParametersBlock extends Block {
  readonly slots: ParamSlot[]
  readonly hashes: number[]
  constructor(params: ShaderParamDef[], lookup: (name: string) => TextureBlock | TextureRefBlock | null) {
    super()
    this.hashes = params.map((p) => joaat(p.name.toLowerCase()))
    this.slots = params.map((p) => {
      if (p.value === null || typeof p.value === 'string') {
        return { dataType: 0, unknown1h: 0, texture: p.value === null ? null : lookup(p.value), vectors: null, vectorBlock: null }
      }
      const vectors = Array.isArray(p.value[0]) ? (p.value as Vec4[]) : [p.value as Vec4]
      const dataType = Array.isArray(p.value[0]) ? vectors.length : 1
      return { dataType, unknown1h: 0, texture: null, vectors, vectorBlock: vec4Block(vectors) }
    })
    // CodeWalker's ShaderParametersBlock.ReadXml: texture params get i + 2, vectors count up from 160 backwards.
    this.slots.forEach((s, i) => {
      if (s.dataType === 0) s.unknown1h = (i + 2) & 0xff
    })
    let offset = 160
    for (let i = this.slots.length - 1; i >= 0; i--) {
      const s = this.slots[i]
      if (s.dataType !== 0) {
        s.unknown1h = offset & 0xff
        offset += s.dataType
      }
    }
  }
  get baseSize() {
    let size = 32
    for (const s of this.slots) size += 16 + 16 * s.dataType
    return size + this.slots.length * 4
  }
  /** ShaderFX.ParameterSize */
  get parametersSize() {
    let size = this.slots.length * 16
    for (const s of this.slots) size += 16 * s.dataType
    return size & 0xffff
  }
  /** ShaderFX.ParameterDataSize */
  get parametersDataSize() {
    let size = this.baseSize
    if (size % 16 !== 0) size += 16 - (size % 16)
    return size & 0xffff
  }
  get textureParamsCount() {
    return this.slots.filter((s) => s.dataType === 0).length
  }
  get length() {
    return this.baseSize + this.parametersDataSize * 4
  }
  write(w: ResourceWriter) {
    for (const s of this.slots) {
      const ptr = s.dataType === 0 ? (s.texture?.filePosition ?? 0) : (s.vectorBlock?.filePosition ?? 0)
      w.u8(s.dataType)
      w.u8(s.unknown1h)
      w.u16(0)
      w.u32(0)
      w.u64(ptr)
    }
    for (const s of this.slots) if (s.dataType !== 0 && s.vectorBlock) w.block(s.vectorBlock)
    for (const h of this.hashes) w.u32(h)
    w.zeros(32 + this.parametersDataSize * 4)
  }
  references() {
    return this.slots.filter((s) => s.dataType === 0 && s.texture).map((s) => s.texture as Block)
  }
  parts(): [number, Block][] {
    const out: [number, Block][] = []
    let offset = this.slots.length * 16
    for (const s of this.slots) {
      if (s.dataType !== 0 && s.vectorBlock) out.push([offset, s.vectorBlock])
      offset += 16 * s.dataType
    }
    return out
  }
}

export class ShaderFXBlock extends Block {
  readonly def: ShaderDef
  readonly params: ShaderParametersBlock
  constructor(def: ShaderDef, lookup: (name: string) => TextureBlock | TextureRefBlock | null) {
    super()
    this.def = def
    this.params = new ShaderParametersBlock(def.params, lookup)
  }
  get length() {
    return 48
  }
  write(w: ResourceWriter) {
    const p = this.params
    w.u64(p.filePosition)
    w.u32(joaat(this.def.name))
    w.u32(0)
    w.u8(p.slots.length)
    w.u8(this.def.renderBucket)
    w.u16(32768)
    w.u16(p.parametersSize)
    w.u16(p.parametersDataSize)
    w.u32(joaat(this.def.fileName))
    w.u32(0)
    w.u32(((1 << this.def.renderBucket) | 0xff00) >>> 0)
    w.u16(0)
    w.u8(0)
    w.u8(p.textureParamsCount)
    w.u64(0)
  }
  references() {
    return [this.params]
  }
}

export class ShaderGroupBlock extends Block {
  readonly dictionary: TextureDictionaryBlock | null
  readonly shaders: ShaderFXBlock[]
  private readonly shaderArray: PointerArrayBlock | null
  constructor(dictionary: TextureDictionaryBlock | null, shaders: ShaderFXBlock[]) {
    super()
    this.dictionary = dictionary
    this.shaders = shaders
    this.shaderArray = shaders.length ? new PointerArrayBlock(shaders) : null
  }
  get length() {
    return 64
  }
  write(w: ResourceWriter) {
    w.u32(1080113136) // VFT
    w.u32(1)
    w.u64(this.dictionary ? this.dictionary.filePosition : 0)
    w.u64(this.shaderArray ? this.shaderArray.filePosition : 0)
    w.u16(this.shaders.length)
    w.u16(this.shaders.length)
    w.u32(0)
    w.u64(0)
    w.u64(0)
    w.u32(64 / 16) // ShaderGroupBlocksSize
    w.u32(0)
    w.u64(0)
  }
  references() {
    const refs: Block[] = []
    if (this.dictionary) refs.push(this.dictionary)
    if (this.shaderArray) refs.push(this.shaderArray)
    return refs
  }
}

class VertexDeclarationBlock extends Block {
  flags: number
  constructor(flags: number) {
    super()
    this.flags = flags
  }
  get length() {
    return 16
  }
  write(w: ResourceWriter) {
    w.u32(this.flags)
    w.u16(layoutStride(this.flags))
    w.u8(0)
    w.u8(layoutCount(this.flags))
    w.u32(VERTEX_TYPES_GTAV1.lo)
    w.u32(VERTEX_TYPES_GTAV1.hi)
  }
}

class VertexBufferBlock extends Block {
  readonly data: DataBlock
  readonly decl: VertexDeclarationBlock
  readonly vertexCount: number
  constructor(data: DataBlock, decl: VertexDeclarationBlock, vertexCount: number) {
    super()
    this.data = data
    this.decl = decl
    this.vertexCount = vertexCount
  }
  get length() {
    return 128
  }
  write(w: ResourceWriter) {
    w.u32(1080153080) // VFT
    w.u32(1)
    w.u16(layoutStride(this.decl.flags))
    w.u16(0) // flags
    w.u32(0)
    w.u64(this.data.filePosition)
    w.u32(this.vertexCount)
    w.u32(0)
    w.u64(this.data.filePosition) // Data2 == Data1
    w.u64(0)
    w.u64(this.decl.filePosition)
    w.zeros(64) // 0x38..0x77
    w.u64(0)
  }
  references() {
    return [this.data, this.data, this.decl]
  }
}

class IndexBufferBlock extends Block {
  readonly indices: StructArrayBlock
  constructor(indices: Uint16Array) {
    super()
    this.indices = u16Block(indices)
  }
  get length() {
    return 96
  }
  write(w: ResourceWriter) {
    w.u32(1080152408) // VFT
    w.u32(1)
    w.u32(this.indices.itemCount)
    w.u32(0)
    w.u64(this.indices.filePosition)
    w.zeros(72)
  }
  references() {
    return [this.indices]
  }
}

class GeometryBlock extends Block {
  readonly def: GeometryDef
  readonly vertexData: DataBlock
  readonly vertexBuffer: VertexBufferBlock
  readonly indexBuffer: IndexBufferBlock
  constructor(def: GeometryDef) {
    super()
    this.def = def
    this.vertexData = new DataBlock(def.vertices)
    this.vertexBuffer = new VertexBufferBlock(this.vertexData, new VertexDeclarationBlock(def.layout), def.vertexCount)
    this.indexBuffer = new IndexBufferBlock(def.indices)
  }
  get length() {
    return 152
  }
  write(w: ResourceWriter) {
    const indexCount = this.def.indices.length
    w.u32(1080133528) // VFT
    w.u32(1)
    w.u64(0)
    w.u64(0)
    w.u64(this.vertexBuffer.filePosition)
    w.u64(0)
    w.u64(0)
    w.u64(0)
    w.u64(this.indexBuffer.filePosition)
    w.u64(0)
    w.u64(0)
    w.u64(0)
    w.u32(indexCount)
    w.u32(Math.floor(indexCount / 3))
    w.u16(this.def.vertexCount)
    w.u16(3)
    w.u32(0)
    w.u64(0) // bone ids
    w.u16(layoutStride(this.def.layout))
    w.u16(0)
    w.u32(0)
    w.u64(this.vertexData.filePosition)
    w.u64(0)
    w.u64(0)
    w.u64(0)
  }
  references() {
    return [this.vertexBuffer, this.indexBuffer, this.vertexData]
  }
}

const pad16 = (o: number) => (16 - (o % 16)) % 16

class ModelBlock extends Block {
  readonly def: ModelDef
  readonly geometries: GeometryBlock[]
  readonly bounds: [Vec4, Vec4][]
  constructor(def: ModelDef) {
    super()
    this.def = def
    this.geometries = def.geometries.map((g) => new GeometryBlock(g))
    this.bounds = def.geometries.map((g) => [g.bbMin, g.bbMax] as [Vec4, Vec4])
    if (this.bounds.length > 1) {
      const min: Vec4 = [Infinity, Infinity, Infinity, Infinity]
      const max: Vec4 = [-Infinity, -Infinity, -Infinity, -Infinity]
      for (const [a, b] of this.bounds) {
        for (let i = 0; i < 4; i++) {
          min[i] = Math.min(min[i], a[i])
          max[i] = Math.max(max[i], b[i])
        }
      }
      this.bounds.unshift([min, max])
    }
  }
  private layout() {
    const n = this.geometries.length
    let off = 48
    const shaderMapping = off
    off += n * 2
    if (n === 1) off += 6
    else off += pad16(off)
    const geometryPointers = off
    off += n * 8
    off += pad16(off)
    const bounds = off
    off += this.bounds.length * 32
    const geometries: number[] = []
    for (const g of this.geometries) {
      off += pad16(off)
      geometries.push(off)
      off += g.length
    }
    return { shaderMapping, geometryPointers, bounds, geometries, length: off }
  }
  get length() {
    return this.layout().length
  }
  write(w: ResourceWriter) {
    const n = this.geometries.length
    const start = w.position
    const l = this.layout()
    w.u32(1080101528) // VFT
    w.u32(1)
    w.u64(start + l.geometryPointers)
    w.u16(n)
    w.u16(n)
    w.u32(0)
    w.u64(start + l.bounds)
    w.u64(start + l.shaderMapping)
    w.u32(0) // skeleton binding
    w.u16((this.def.renderMask & 0xff) | ((this.def.flags & 0xff) << 8))
    w.u16(n)
    for (const g of this.def.geometries) w.u16(g.shaderIndex)
    if (n === 1) w.zeros(6)
    else w.padding(16)
    for (const g of this.geometries) w.u64(g.filePosition)
    w.padding(16)
    for (const [min, max] of this.bounds) {
      w.vec4(min)
      w.vec4(max)
    }
    for (const g of this.geometries) {
      w.padding(16)
      w.block(g)
    }
  }
  parts(): [number, Block][] {
    const l = this.layout()
    return this.geometries.map((g, i) => [l.geometries[i], g])
  }
}

class ModelsBlock extends Block {
  readonly lists: (ModelBlock[] | null)[]
  constructor(lists: (ModelBlock[] | null)[]) {
    super()
    this.lists = lists
  }
  private listLength(list: ModelBlock[] | null, o: number) {
    if (!list) return 0
    let l = 16 + list.length * 8
    for (const m of list) l += pad16(l) + m.length
    return pad16(o) + l
  }
  get length() {
    let len = 0
    for (const list of this.lists) len += this.listLength(list, len)
    return len
  }
  /** Absolute pointer of the LOD list `index` (0 high … 3 very low), 0 when absent. */
  listPointer(index: number) {
    if (!this.lists[index]) return 0
    let p = this.filePosition
    for (let i = 0; i < index; i++) {
      if (!this.lists[i]) continue
      p += this.listLength(this.lists[i], p)
      p += pad16(p)
    }
    return p
  }
  write(w: ResourceWriter) {
    let ptr = w.position
    for (const list of this.lists) {
      if (!list) continue
      ptr += pad16(ptr)
      const header = { pointer: ptr + 16, count: list.length }
      ptr += 16 + list.length * 8
      const pointers: number[] = []
      for (const m of list) {
        ptr += pad16(ptr)
        pointers.push(ptr)
        ptr += m.length
      }
      w.padding(16)
      w.u64(header.pointer)
      w.u16(header.count)
      w.u16(header.count)
      w.u32(0)
      for (const p of pointers) w.u64(p)
      for (const m of list) {
        w.padding(16)
        w.block(m)
      }
    }
  }
  parts(): [number, Block][] {
    const out: [number, Block][] = []
    let p = 0
    for (const list of this.lists) {
      if (!list) continue
      p += pad16(p)
      p += 16 + list.length * 8
      for (const m of list) {
        p += pad16(p)
        out.push([p, m])
        p += m.length
      }
    }
    return out
  }
}

class DrawableBlock extends FileBaseBlock {
  readonly def: DrawableDef
  readonly shaderGroup: ShaderGroupBlock
  readonly models: ModelsBlock | null
  readonly nameBlock: StringBlock
  readonly lights = new ListHeaderBlock(null, 0)
  readonly bound: Block | null
  readonly lists: (ModelBlock[] | null)[]
  constructor(def: DrawableDef) {
    super()
    this.def = def
    this.fileVFT = 1079456120
    const textures = def.textures.map((t) => new TextureBlock(t))
    const byHash = new Map(textures.map((t) => [t.hash, t]))
    const refs = new Map<string, TextureRefBlock>()
    const lookup = (name: string) => {
      const embedded = byHash.get(joaat(name.toLowerCase()))
      if (embedded) return embedded
      let ref = refs.get(name)
      if (!ref) {
        ref = new TextureRefBlock(name)
        refs.set(name, ref)
      }
      return ref
    }
    const dictionary = textures.length ? new TextureDictionaryBlock(textures) : null
    const shaders = def.shaders.map((s) => new ShaderFXBlock(s, lookup))
    this.shaderGroup = new ShaderGroupBlock(dictionary, shaders)
    const m = def.models
    this.lists = [m.high, m.med, m.low, m.vlow].map((list) => (list && list.length ? list.map((x) => new ModelBlock(x)) : null))
    this.models = this.lists.some(Boolean) ? new ModelsBlock(this.lists) : null
    this.nameBlock = new StringBlock(def.name)
    this.bound = def.bound ?? null
  }
  get length() {
    return 208
  }
  private renderMaskFlags(index: number) {
    const list = this.lists[index]
    let mask = 0
    for (const m of list ?? []) mask |= m.def.renderMask & 0xff
    const count = list?.length ?? 0
    return ((count & 0xff) | (mask << 8)) >>> 0
  }
  write(w: ResourceWriter) {
    const d = this.def
    this.writeFileBase(w)
    w.u64(this.shaderGroup.filePosition)
    w.u64(0) // skeleton
    w.vec3(d.bsCenter)
    w.f32(d.bsRadius)
    w.vec3(d.bbMin)
    w.u32(0x7f800001)
    w.vec3(d.bbMax)
    w.u32(0x7f800001)
    for (let i = 0; i < 4; i++) w.u64(this.models ? this.models.listPointer(i) : 0)
    for (const dist of d.lodDist) w.f32(dist)
    for (let i = 0; i < 4; i++) w.u32(this.renderMaskFlags(i))
    w.u64(0) // joints
    w.u16(0)
    w.u16(this.models ? Math.ceil(this.models.length / 16) : 0)
    w.u32(0)
    w.u64(this.models ? this.models.filePosition : 0)
    // Drawable
    w.u64(this.nameBlock.filePosition)
    w.block(this.lights)
    w.u64(0)
    w.u64(this.bound ? this.bound.filePosition : 0)
  }
  references() {
    const refs = super.references()
    refs.push(this.shaderGroup)
    if (this.models) refs.push(this.models)
    refs.push(this.nameBlock)
    if (this.bound) refs.push(this.bound)
    return refs
  }
  parts(): [number, Block][] {
    return [[0xb0, this.lights]]
  }
}

/** Builds a complete .ydr file. */
export function buildYdr(def: DrawableDef): Uint8Array {
  return buildResource(new DrawableBlock(def), YDR_VERSION)
}
