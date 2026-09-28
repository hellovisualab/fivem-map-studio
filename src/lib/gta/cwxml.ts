import {
  layoutOffset,
  layoutStride,
  VertexSemantic,
  type DrawableDef,
  type GeometryDef,
  type ModelDef,
  type ShaderDef,
  type TextureDef,
} from '@/lib/gta/drawable'
import type { Vec3, Vec4 } from '@/lib/gta/resource'
import {
  BoundBoxBlock,
  BoundCompositeBlock,
  BoundGeometryBlock,
  BoundSphereBlock,
  BoundType,
  collisionFlagsText,
  packMaterial,
  type BoundBlock,
  type BoundMaterial,
} from '@/lib/gta/bounds'

/**
 * CodeWalker / Sollumz XML (`.ydr.xml`, `.ybn.xml`, `.ytyp.xml`) for the same data the
 * binary writers produce, so a pack can be opened, tweaked and re-exported in CodeWalker
 * or Blender + Sollumz.
 */

export function xmlEscape(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** A float as the exact float32 the binary stores. */
export function xf(n: number) {
  const f = Math.fround(n)
  return Object.is(f, -0) ? '0' : String(f)
}

export class XmlOut {
  private readonly lines: string[] = ['<?xml version="1.0" encoding="UTF-8"?>']
  private depth = 0
  private pad() {
    return ' '.repeat(this.depth)
  }
  open(tag: string, attrs = '') {
    this.lines.push(`${this.pad()}<${tag}${attrs ? ` ${attrs}` : ''}>`)
    this.depth++
  }
  close(tag: string) {
    this.depth--
    this.lines.push(`${this.pad()}</${tag}>`)
  }
  empty(tag: string, attrs = '') {
    this.lines.push(`${this.pad()}<${tag}${attrs ? ` ${attrs}` : ''} />`)
  }
  text(tag: string, value: string) {
    this.lines.push(`${this.pad()}<${tag}>${xmlEscape(value)}</${tag}>`)
  }
  value(tag: string, value: number | string) {
    this.empty(tag, `value="${typeof value === 'number' ? xf(value) : value}"`)
  }
  vec3(tag: string, v: Vec3) {
    this.empty(tag, `x="${xf(v[0])}" y="${xf(v[1])}" z="${xf(v[2])}"`)
  }
  vec4(tag: string, v: Vec4) {
    this.empty(tag, `x="${xf(v[0])}" y="${xf(v[1])}" z="${xf(v[2])}" w="${xf(v[3])}"`)
  }
  raw(line: string) {
    this.lines.push(`${this.pad()}${line}`)
  }
  toString() {
    return `${this.lines.join('\n')}\n`
  }
}

const FORMAT_NAMES: Record<TextureDef['format'], string> = {
  DXT1: 'D3DFMT_DXT1',
  DXT5: 'D3DFMT_DXT5',
  A8R8G8B8: 'D3DFMT_A8R8G8B8',
}

function writeShaders(x: XmlOut, shaders: ShaderDef[]) {
  x.open('Shaders')
  for (const s of shaders) {
    x.open('Item')
    x.text('Name', s.name)
    x.text('FileName', s.fileName)
    x.value('RenderBucket', s.renderBucket)
    x.open('Parameters')
    for (const p of s.params) {
      if (p.value === null || typeof p.value === 'string') {
        if (p.value === null) x.empty('Item', `name="${p.name}" type="Texture"`)
        else {
          x.open('Item', `name="${p.name}" type="Texture"`)
          x.text('Name', p.value)
          x.close('Item')
        }
      } else if (Array.isArray(p.value[0])) {
        x.open('Item', `name="${p.name}" type="Array"`)
        for (const v of p.value as Vec4[]) x.vec4('Value', v)
        x.close('Item')
      } else {
        const v = p.value as Vec4
        x.empty('Item', `name="${p.name}" type="Vector" x="${xf(v[0])}" y="${xf(v[1])}" z="${xf(v[2])}" w="${xf(v[3])}"`)
      }
    }
    x.close('Parameters')
    x.close('Item')
  }
  x.close('Shaders')
}

const LAYOUT_TAGS: [number, string][] = [
  [VertexSemantic.Position, 'Position'],
  [VertexSemantic.Normal, 'Normal'],
  [VertexSemantic.Colour0, 'Colour0'],
  [VertexSemantic.TexCoord0, 'TexCoord0'],
  [VertexSemantic.Tangent, 'Tangent'],
]

function writeGeometry(x: XmlOut, g: GeometryDef) {
  x.open('Item')
  x.value('ShaderIndex', g.shaderIndex)
  x.vec4('BoundingBoxMin', g.bbMin)
  x.vec4('BoundingBoxMax', g.bbMax)
  x.open('VertexBuffer')
  x.value('Flags', 0)
  x.open('Layout', 'type="GTAV1"')
  for (const [sem, tag] of LAYOUT_TAGS) if ((g.layout >> sem) & 1) x.empty(tag)
  x.close('Layout')
  x.open('Data')
  const stride = layoutStride(g.layout)
  const view = new DataView(g.vertices.buffer, g.vertices.byteOffset, g.vertices.byteLength)
  const floats = (o: number, n: number) => Array.from({ length: n }, (_, i) => xf(view.getFloat32(o + i * 4, true))).join(' ')
  for (let v = 0; v < g.vertexCount; v++) {
    const base = v * stride
    const cols: string[] = []
    if ((g.layout >> VertexSemantic.Position) & 1) cols.push(floats(base + layoutOffset(g.layout, VertexSemantic.Position), 3))
    if ((g.layout >> VertexSemantic.Normal) & 1) cols.push(floats(base + layoutOffset(g.layout, VertexSemantic.Normal), 3))
    if ((g.layout >> VertexSemantic.Colour0) & 1) {
      const o = base + layoutOffset(g.layout, VertexSemantic.Colour0)
      cols.push([0, 1, 2, 3].map((i) => g.vertices[o + i]).join(' '))
    }
    if ((g.layout >> VertexSemantic.TexCoord0) & 1) cols.push(floats(base + layoutOffset(g.layout, VertexSemantic.TexCoord0), 2))
    if ((g.layout >> VertexSemantic.Tangent) & 1) cols.push(floats(base + layoutOffset(g.layout, VertexSemantic.Tangent), 4))
    x.raw(cols.join('   '))
  }
  x.close('Data')
  x.close('VertexBuffer')
  x.open('IndexBuffer')
  x.open('Data')
  for (let i = 0; i < g.indices.length; i += 24) x.raw(Array.from(g.indices.subarray(i, i + 24)).join(' '))
  x.close('Data')
  x.close('IndexBuffer')
  x.close('Item')
}

function writeModels(x: XmlOut, tag: string, models: ModelDef[] | undefined) {
  if (!models || !models.length) return
  x.open(tag)
  for (const m of models) {
    x.open('Item')
    x.value('RenderMask', m.renderMask)
    x.value('Flags', m.flags)
    x.value('HasSkin', 0)
    x.value('BoneIndex', 0)
    x.value('Unknown1', 0)
    x.open('Geometries')
    for (const g of m.geometries) writeGeometry(x, g)
    x.close('Geometries')
    x.close('Item')
  }
  x.close(tag)
}

/** `.ydr.xml`. Embedded textures are referenced as `<name>.dds` next to the XML. `boundsXml` is inserted as-is. */
export function drawableXml(d: DrawableDef, boundsXml?: (x: XmlOut) => void): string {
  const x = new XmlOut()
  x.open('Drawable')
  x.text('Name', d.name)
  x.vec3('BoundingSphereCenter', d.bsCenter)
  x.value('BoundingSphereRadius', d.bsRadius)
  x.vec3('BoundingBoxMin', d.bbMin)
  x.vec3('BoundingBoxMax', d.bbMax)
  x.value('LodDistHigh', d.lodDist[0])
  x.value('LodDistMed', d.lodDist[1])
  x.value('LodDistLow', d.lodDist[2])
  x.value('LodDistVlow', d.lodDist[3])
  x.value('FlagsHigh', d.models.high.length)
  x.value('FlagsMed', d.models.med?.length ?? 0)
  x.value('FlagsLow', d.models.low?.length ?? 0)
  x.value('FlagsVlow', d.models.vlow?.length ?? 0)
  x.open('ShaderGroup')
  if (d.textures.length) {
    x.open('TextureDictionary')
    for (const t of d.textures) {
      x.open('Item')
      x.text('Name', t.name)
      x.value('Unk32', 0)
      x.text('Usage', 'UNKNOWN')
      x.text('UsageFlags', '')
      x.value('ExtraFlags', 0)
      x.value('Width', t.width)
      x.value('Height', t.height)
      x.value('MipLevels', t.levels)
      x.text('Format', FORMAT_NAMES[t.format])
      x.text('FileName', `${t.name}.dds`)
      x.close('Item')
    }
    x.close('TextureDictionary')
  }
  writeShaders(x, d.shaders)
  x.close('ShaderGroup')
  writeModels(x, 'DrawableModelsHigh', d.models.high)
  writeModels(x, 'DrawableModelsMedium', d.models.med)
  writeModels(x, 'DrawableModelsLow', d.models.low)
  writeModels(x, 'DrawableModelsVeryLow', d.models.vlow)
  boundsXml?.(x)
  x.empty('Lights')
  x.close('Drawable')
  return x.toString()
}

/** A .dds file (DX9 header) for a texture, as CodeWalker and texture tools read it. */
export function ddsFile(t: TextureDef): Uint8Array {
  const out = new Uint8Array(128 + t.data.length)
  const v = new DataView(out.buffer)
  v.setUint32(0, 0x20534444, true) // 'DDS '
  v.setUint32(4, 124, true)
  // CAPS | HEIGHT | WIDTH | PIXELFORMAT | MIPMAPCOUNT | LINEARSIZE / PITCH
  const compressed = t.format !== 'A8R8G8B8'
  v.setUint32(8, 0x1 | 0x2 | 0x4 | 0x1000 | 0x20000 | (compressed ? 0x80000 : 0x8), true)
  v.setUint32(12, t.height, true)
  v.setUint32(16, t.width, true)
  const blocks = Math.max(1, Math.floor((t.width + 3) / 4)) * Math.max(1, Math.floor((t.height + 3) / 4))
  v.setUint32(20, compressed ? blocks * (t.format === 'DXT1' ? 8 : 16) : t.width * 4, true)
  v.setUint32(24, 0, true)
  v.setUint32(28, t.levels, true)
  // pixel format at 76
  v.setUint32(76, 32, true)
  if (compressed) {
    v.setUint32(80, 0x4, true) // FOURCC
    v.setUint32(84, t.format === 'DXT1' ? 0x31545844 : 0x35545844, true)
  } else {
    v.setUint32(80, 0x41, true) // RGB | ALPHAPIXELS
    v.setUint32(88, 32, true)
    v.setUint32(92, 0x00ff0000, true)
    v.setUint32(96, 0x0000ff00, true)
    v.setUint32(100, 0x000000ff, true)
    v.setUint32(104, 0xff000000, true)
  }
  v.setUint32(108, 0x1000 | (t.levels > 1 ? 0x400008 : 0), true) // TEXTURE | MIPMAP | COMPLEX
  out.set(t.data, 128)
  return out
}

/* ---------------------------------------------------------------------------------------- */
/* Bounds                                                                                    */

const MATERIAL_FLAG_NAMES = [
  'FLAG_STAIRS',
  'FLAG_NOT_CLIMBABLE',
  'FLAG_SEE_THROUGH',
  'FLAG_SHOOT_THROUGH',
  'FLAG_NOT_COVER',
  'FLAG_WALKABLE_PATH',
  'FLAG_NO_CAM_COLLISION',
  'FLAG_SHOOT_THROUGH_FX',
  'FLAG_NO_DECAL',
  'FLAG_NO_NAVMESH',
  'FLAG_NO_RAGDOLL',
  'FLAG_VEHICLE_WHEEL',
  'FLAG_NO_PTFX',
  'FLAG_TOO_STEEP_FOR_PLAYER',
  'FLAG_NO_NETWORK_SPAWN',
  'FLAG_NO_CAM_COLLISION_ALLOW_CLIPPING',
]

function materialFlagsText(flags: number) {
  const names = MATERIAL_FLAG_NAMES.filter((_, i) => (flags >> i) & 1)
  return names.length ? names.join(', ') : 'NONE'
}

const BOUND_TYPE_NAMES: Record<number, string> = {
  [BoundType.Sphere]: 'Sphere',
  [BoundType.Capsule]: 'Capsule',
  [BoundType.Box]: 'Box',
  [BoundType.Geometry]: 'Geometry',
  [BoundType.GeometryBVH]: 'GeometryBVH',
  [BoundType.Composite]: 'Composite',
}

function writeBound(x: XmlOut, b: BoundBlock, tag: string, child: boolean) {
  x.open(tag, `type="${BOUND_TYPE_NAMES[b.type]}"`)
  const a = b.authored
  const primitive = b instanceof BoundBoxBlock || b instanceof BoundSphereBlock
  const m = primitive ? b.material : { type: 0 }
  x.vec3('BoxMin', a.boxMin)
  x.vec3('BoxMax', a.boxMax)
  x.vec3('BoxCenter', a.boxCenter)
  x.vec3('SphereCenter', a.sphereCenter)
  x.value('SphereRadius', a.sphereRadius)
  x.value('Margin', b.margin)
  x.value('Volume', b.volume)
  x.vec3('Inertia', b.inertia)
  x.value('MaterialIndex', m.type)
  x.value('MaterialColourIndex', m.colourIndex ?? 0)
  x.value('ProceduralID', m.proceduralId ?? 0)
  x.value('RoomID', m.roomId ?? 0)
  x.value('PedDensity', m.pedDensity ?? 0)
  x.value('UnkFlags', (m.flags ?? 0) & 0xff)
  x.value('PolyFlags', ((m.flags ?? 0) >> 8) & 0xff)
  x.value('UnkType', 1)
  if (child) {
    x.open('CompositeTransform')
    x.raw('1 0 0 0')
    x.raw('0 1 0 0')
    x.raw('0 0 1 0')
    x.raw('0 0 0 1')
    x.close('CompositeTransform')
    x.text('CompositeFlags1', collisionFlagsText(b.typeFlags))
    x.text('CompositeFlags2', collisionFlagsText(b.includeFlags))
  }
  if (b instanceof BoundGeometryBlock) {
    x.vec3('GeometryCenter', b.center)
    x.value('UnkFloat1', 0)
    x.value('UnkFloat2', 0)
    const mats: BoundMaterial[] = []
    const keys = new Map<string, number>()
    const polyMats = b.authoredTriangles.map((t) => {
      const key = packMaterial(t.material).join(':')
      let i = keys.get(key)
      if (i === undefined) {
        i = mats.length
        keys.set(key, i)
        mats.push(t.material)
      }
      return i
    })
    x.open('Materials')
    for (const mat of mats) {
      x.open('Item')
      x.value('Type', mat.type)
      x.value('ProceduralID', mat.proceduralId ?? 0)
      x.value('RoomID', mat.roomId ?? 0)
      x.value('PedDensity', mat.pedDensity ?? 0)
      x.text('Flags', materialFlagsText(mat.flags ?? 0))
      x.value('MaterialColourIndex', mat.colourIndex ?? 0)
      x.value('Unk', 0)
      x.close('Item')
    }
    x.close('Materials')
    x.open('Vertices')
    for (const v of b.vertices) x.raw(`${xf(v[0])}, ${xf(v[1])}, ${xf(v[2])}`)
    x.close('Vertices')
    x.open('Polygons')
    b.authoredTriangles.forEach((t, i) => {
      x.empty('Triangle', `m="${polyMats[i]}" v1="${t.v[0]}" v2="${t.v[1]}" v3="${t.v[2]}" f1="0" f2="0" f3="0"`)
    })
    x.close('Polygons')
  }
  if (b instanceof BoundCompositeBlock) {
    x.open('Children')
    for (const c of b.children) writeBound(x, c, 'Item', true)
    x.close('Children')
  }
  x.close(tag)
}

/** Writes `<Bounds>` into a drawable XML. */
export function boundsXmlWriter(root: BoundBlock) {
  return (x: XmlOut) => writeBound(x, root, 'Bounds', false)
}

/** Standalone `.ybn.xml`. */
export function ybnXml(root: BoundBlock) {
  const x = new XmlOut()
  x.open('BoundsFile')
  writeBound(x, root, 'Bounds', false)
  x.close('BoundsFile')
  return x.toString()
}
