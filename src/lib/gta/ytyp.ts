import { XmlOut } from '@/lib/gta/cwxml'
import { joaat } from '@/lib/gta/hash'
import { Block, DataBlock, FileBaseBlock, StructWriter, buildResource, type ResourceWriter, type Vec3 } from '@/lib/gta/resource'

/*
 * .ytyp (archetype definitions) writer: a "meta" resource, ported from CodeWalker's
 * MetaBuilder / XmlMeta so the result matches what CodeWalker makes from a .ytyp.xml.
 */

export const META_VERSION = 2

/** CBaseArchetypeDef flags: 32 = static, 131072 = dynamic (can be moved / has physics). */
export const ARCHETYPE_FLAG_STATIC = 32
export const ARCHETYPE_FLAG_DYNAMIC = 131072

export interface ArchetypeDef {
  name: string
  lodDist: number
  flags: number
  specialAttribute?: number
  bbMin: Vec3
  bbMax: Vec3
  bsCentre: Vec3
  bsRadius: number
  hdTextureDist: number
  /** Empty when the textures are embedded in the drawable. */
  textureDictionary?: string
  /** Empty when the collision is embedded in the drawable. */
  physicsDictionary?: string
}

const h = joaat
const T = {
  CMapTypes: h('CMapTypes'),
  CBaseArchetypeDef: h('CBaseArchetypeDef'),
  CCompositeEntityType: h('CCompositeEntityType'),
  eAssetType: h('rage__fwArchetypeDef__eAssetType'),
  POINTER: 0x7,
  ARRAYINFO: 0x100,
}

// MetaStructureEntryDataType
const DT = { Array: 0x52, Hash: 0x4a, Float: 0x21, Float_XYZ: 0x33, UnsignedInt: 0x15, IntEnum: 0x62, StructurePointer: 0x07, Structure: 0x05 }

type Entry = [name: number, offset: number, type: number, unk9h: number, refIndex: number, refKey: number]

const STRUCT_INFOS: Record<number, { key: number; unknown: number; size: number; entries: Entry[] }> = {
  [T.CMapTypes]: {
    key: 2608875220,
    unknown: 768,
    size: 80,
    entries: [
      [T.ARRAYINFO, 0, DT.StructurePointer, 0, 0, 0],
      [h('extensions'), 8, DT.Array, 0, 0, 0],
      [T.ARRAYINFO, 0, DT.StructurePointer, 0, 0, 0],
      [h('archetypes'), 24, DT.Array, 0, 2, 0],
      [h('name'), 40, DT.Hash, 0, 0, 0],
      [T.ARRAYINFO, 0, DT.Hash, 0, 0, 0],
      [h('dependencies'), 48, DT.Array, 0, 5, 0],
      [T.ARRAYINFO, 0, DT.Structure, 0, 0, T.CCompositeEntityType],
      [h('compositeEntityTypes'), 64, DT.Array, 0, 7, 0],
    ],
  },
  [T.CBaseArchetypeDef]: {
    key: 2411387556,
    unknown: 1024,
    size: 144,
    entries: [
      [h('lodDist'), 8, DT.Float, 0, 0, 0],
      [h('flags'), 12, DT.UnsignedInt, 0, 0, 0],
      [h('specialAttribute'), 16, DT.UnsignedInt, 0, 0, 0],
      [h('bbMin'), 32, DT.Float_XYZ, 0, 0, 0],
      [h('bbMax'), 48, DT.Float_XYZ, 0, 0, 0],
      [h('bsCentre'), 64, DT.Float_XYZ, 0, 0, 0],
      [h('bsRadius'), 80, DT.Float, 0, 0, 0],
      [h('hdTextureDist'), 84, DT.Float, 0, 0, 0],
      [h('name'), 88, DT.Hash, 0, 0, 0],
      [h('textureDictionary'), 92, DT.Hash, 0, 0, 0],
      [h('clipDictionary'), 96, DT.Hash, 0, 0, 0],
      [h('drawableDictionary'), 100, DT.Hash, 0, 0, 0],
      [h('physicsDictionary'), 104, DT.Hash, 0, 0, 0],
      [h('assetType'), 108, DT.IntEnum, 0, 0, T.eAssetType],
      [h('assetName'), 112, DT.Hash, 0, 0, 0],
      [T.ARRAYINFO, 0, DT.StructurePointer, 0, 0, 0],
      [h('extensions'), 120, DT.Array, 0, 15, 0],
    ],
  },
}

const ASSET_TYPES: [string, number][] = [
  ['ASSET_TYPE_UNINITIALIZED', 0],
  ['ASSET_TYPE_FRAGMENT', 1],
  ['ASSET_TYPE_DRAWABLE', 2],
  ['ASSET_TYPE_DRAWABLEDICTIONARY', 3],
  ['ASSET_TYPE_ASSETLESS', 4],
]
const ENUM_INFOS: Record<number, { key: number; entries: [number, number][] }> = {
  [T.eAssetType]: { key: 1866031916, entries: ASSET_TYPES.map(([n, v]) => [h(n), v]) },
}

/* MetaBuilder ------------------------------------------------------------------------------ */

interface BuilderBlock {
  type: number
  items: Uint8Array[]
  totalSize: number
  index: number
}

class MetaBuilder {
  blocks: BuilderBlock[] = []
  structureInfos: number[] = []
  enumInfos: number[] = []
  ensureBlock(type: number) {
    for (const b of this.blocks) if (b.type === type && b.totalSize < 0x4000) return b
    const b: BuilderBlock = { type, items: [], totalSize: 0, index: this.blocks.length }
    this.blocks.push(b)
    return b
  }
  private add(b: BuilderBlock, data: Uint8Array) {
    b.items.push(data)
    b.totalSize += data.length
  }
  /** Returns the meta pointer (block id | offset << 12). */
  addItem(type: number, data: Uint8Array) {
    const b = this.ensureBlock(type)
    let d = data
    if (d.length % 16) {
      d = new Uint8Array(d.length - (d.length % 16) + 16)
      d.set(data)
    }
    const idx = b.items.length
    this.add(b, d)
    return pointer(b.index + 1, idx * d.length)
  }
  addItemArray(type: number, data: Uint8Array) {
    const b = this.ensureBlock(type)
    let d = data
    if (d.length % 16) {
      d = new Uint8Array(d.length + 16 - (d.length % 16))
      d.set(data)
    }
    const offset = b.totalSize
    this.add(b, d)
    return pointer(b.index + 1, offset)
  }
  addStructureInfo(type: number) {
    if (!this.structureInfos.includes(type)) this.structureInfos.push(type)
  }
  addEnumInfo(type: number) {
    if (!this.enumInfos.includes(type)) this.enumInfos.push(type)
  }
}

function pointer(blockId: number, offset: number) {
  return ((blockId & 0xfff) + ((offset & 0xfffff) << 12)) >>> 0
}

/* Resource blocks -------------------------------------------------------------------------- */

class ArrayBlock<T extends Block> extends Block {
  items: T[]
  constructor(items: T[]) {
    super()
    this.items = items
  }
  get length() {
    return this.items.reduce((s, i) => s + i.length, 0)
  }
  write(w: ResourceWriter) {
    for (const i of this.items) i.write(w)
  }
  parts(): [number, Block][] {
    let o = 0
    return this.items.map((i) => {
      const p: [number, Block] = [o, i]
      o += i.length
      return p
    })
  }
}

class StructureInfoBlock extends Block {
  type: number
  entries: DataBlock
  constructor(type: number) {
    super()
    this.type = type
    const info = STRUCT_INFOS[type]
    const s = new StructWriter(info.entries.length * 16)
    for (const [name, offset, dt, unk, ref, key] of info.entries) {
      s.u32(name)
      s.i32(offset)
      s.u8(dt)
      s.u8(unk)
      s.i16(ref)
      s.u32(key)
    }
    this.entries = new DataBlock(s.bytes, info.entries.length)
  }
  get length() {
    return 32
  }
  write(w: ResourceWriter) {
    const info = STRUCT_INFOS[this.type]
    w.u32(this.type)
    w.u32(info.key)
    w.u32(info.unknown)
    w.u32(0)
    w.u64(this.entries.filePosition)
    w.i32(info.size)
    w.i16(0)
    w.i16(this.entries.itemCount)
  }
  references() {
    return [this.entries]
  }
}

class EnumInfoBlock extends Block {
  type: number
  entries: DataBlock
  constructor(type: number) {
    super()
    this.type = type
    const info = ENUM_INFOS[type]
    const s = new StructWriter(info.entries.length * 8)
    for (const [name, value] of info.entries) {
      s.u32(name)
      s.i32(value)
    }
    this.entries = new DataBlock(s.bytes, info.entries.length)
  }
  get length() {
    return 24
  }
  write(w: ResourceWriter) {
    w.u32(this.type)
    w.u32(ENUM_INFOS[this.type].key)
    w.u64(this.entries.filePosition)
    w.i32(this.entries.itemCount)
    w.i32(0)
  }
  references() {
    return [this.entries]
  }
}

class MetaDataBlockHeader extends Block {
  type: number
  data: DataBlock
  constructor(type: number, data: Uint8Array) {
    super()
    this.type = type
    this.data = new DataBlock(data)
  }
  get length() {
    return 16
  }
  write(w: ResourceWriter) {
    w.u32(this.type)
    w.i32(this.data.length)
    w.u64(this.data.filePosition)
  }
  references() {
    return [this.data]
  }
}

class MetaBlock extends FileBaseBlock {
  structs: ArrayBlock<StructureInfoBlock> | null
  enums: ArrayBlock<EnumInfoBlock> | null
  data: ArrayBlock<MetaDataBlockHeader>
  constructor(mb: MetaBuilder) {
    super()
    this.fileVFT = 0x405bc808
    this.structs = mb.structureInfos.length ? new ArrayBlock(mb.structureInfos.map((t) => new StructureInfoBlock(t))) : null
    this.enums = mb.enumInfos.length ? new ArrayBlock(mb.enumInfos.map((t) => new EnumInfoBlock(t))) : null
    this.data = new ArrayBlock(
      mb.blocks.map((b) => {
        const bytes = new Uint8Array(b.totalSize)
        let o = 0
        for (const item of b.items) {
          bytes.set(item, o)
          o += item.length
        }
        return new MetaDataBlockHeader(b.type, bytes)
      }),
    )
  }
  get length() {
    return 112
  }
  write(w: ResourceWriter) {
    this.writeFileBase(w)
    w.i32(0x50524430)
    w.i16(0x0079)
    w.u8(0)
    w.u8(0)
    w.i32(0)
    w.i32(1) // root block index
    w.u64(this.structs ? this.structs.filePosition : 0)
    w.u64(this.enums ? this.enums.filePosition : 0)
    w.u64(this.data.filePosition)
    w.u64(0)
    w.u64(0)
    w.i16(this.structs ? this.structs.items.length : 0)
    w.i16(this.enums ? this.enums.items.length : 0)
    w.i16(this.data.items.length)
    w.i16(0)
    w.zeros(32)
  }
  references() {
    const refs = super.references()
    if (this.structs) refs.push(this.structs)
    if (this.enums) refs.push(this.enums)
    refs.push(this.data)
    return refs
  }
}

/* CMapTypes ---------------------------------------------------------------------------------- */

function archetypeData(mb: MetaBuilder, a: ArchetypeDef) {
  const s = new StructWriter(144)
  s.offset = 8
  s.f32(a.lodDist)
  s.u32(a.flags)
  s.u32(a.specialAttribute ?? 0)
  s.offset = 32
  s.vec3(a.bbMin)
  s.offset = 48
  s.vec3(a.bbMax)
  s.offset = 64
  s.vec3(a.bsCentre)
  s.offset = 80
  s.f32(a.bsRadius)
  s.f32(a.hdTextureDist)
  s.u32(h(a.name))
  s.u32(a.textureDictionary ? h(a.textureDictionary) : 0)
  s.u32(0) // clipDictionary
  s.u32(0) // drawableDictionary
  s.u32(a.physicsDictionary ? h(a.physicsDictionary) : 0)
  mb.addEnumInfo(T.eAssetType)
  s.i32(2) // ASSET_TYPE_DRAWABLE
  s.u32(h(a.name))
  mb.addStructureInfo(T.CBaseArchetypeDef)
  return s.bytes
}

/** Builds a .ytyp for `archetypes`, named `name` (the resource / pack name). */
export function buildYtyp(name: string, archetypes: ArchetypeDef[]): Uint8Array {
  const mb = new MetaBuilder()
  mb.ensureBlock(T.CMapTypes)
  const root = new StructWriter(80)
  if (archetypes.length) {
    const ptrs = archetypes.map((a) => mb.addItem(T.CBaseArchetypeDef, archetypeData(mb, a)))
    const arr = new StructWriter(ptrs.length * 8)
    for (const p of ptrs) arr.u64(p)
    const ptr = mb.addItemArray(T.POINTER, arr.bytes)
    root.offset = 24
    root.u64(ptr)
    root.u16(ptrs.length)
    root.u16(ptrs.length)
  }
  root.offset = 40
  root.u32(h(name))
  mb.addStructureInfo(T.CMapTypes)
  mb.addItem(T.CMapTypes, root.bytes)
  return buildResource(new MetaBlock(mb), META_VERSION, { meta: true })
}

/** The same archetypes as CodeWalker / Sollumz `.ytyp.xml`. */
export function ytypXml(name: string, archetypes: ArchetypeDef[]): string {
  const x = new XmlOut()
  x.open('CMapTypes')
  x.empty('extensions')
  x.open('archetypes')
  for (const a of archetypes) {
    x.open('Item', 'type="CBaseArchetypeDef"')
    x.value('lodDist', a.lodDist)
    x.value('flags', String(a.flags))
    x.value('specialAttribute', String(a.specialAttribute ?? 0))
    x.vec3('bbMin', a.bbMin)
    x.vec3('bbMax', a.bbMax)
    x.vec3('bsCentre', a.bsCentre)
    x.value('bsRadius', a.bsRadius)
    x.value('hdTextureDist', a.hdTextureDist)
    x.text('name', a.name)
    x.text('textureDictionary', a.textureDictionary ?? '')
    x.text('clipDictionary', '')
    x.text('drawableDictionary', '')
    x.text('physicsDictionary', a.physicsDictionary ?? '')
    x.text('assetType', 'ASSET_TYPE_DRAWABLE')
    x.text('assetName', a.name)
    x.empty('extensions')
    x.close('Item')
  }
  x.close('archetypes')
  x.text('name', name)
  x.empty('dependencies')
  x.empty('compositeEntityTypes')
  x.close('CMapTypes')
  return x.toString()
}

