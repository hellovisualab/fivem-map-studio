import * as THREE from 'three'
import JSZip from 'jszip'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { compileProp, type CompiledProp, type PropCompileInput } from '@/lib/gta/prop'
import { ddsFile } from '@/lib/gta/cwxml'
import { buildYtyp, ytypXml } from '@/lib/gta/ytyp'
import { collisionGeometries, modelMaterials } from '@/lib/modeler/build'
import { serializeDoc, MODEL_FILE_EXT } from '@/lib/modeler/doc'
import { applyPropWorldTransform, bakeWorldMeshes, makeCollisionGeometry, meshCollisionGeometry, simplifyGeometry } from '@/lib/propGeometry'
import { SURFACES, SURFACE_CONCRETE, SURFACE_PLASTIC, type PropAsset } from '@/lib/propTypes'
import { fixModelName } from '@/lib/propLoad'
import { slugify } from '@/lib/utils'

export type { PropAsset } from '@/lib/propTypes'

function exportGlb(object: THREE.Object3D): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    new GLTFExporter().parse(
      object,
      (result) => {
        if (result instanceof ArrayBuffer) resolve(result)
        else resolve(new TextEncoder().encode(JSON.stringify(result)).buffer)
      },
      (err) => reject(err),
      { binary: true, embedImages: true },
    )
  })
}

function disposeGeometry(root: THREE.Object3D) {
  root.traverse((c) => (c as THREE.Mesh).geometry?.dispose())
}

/** Lua single-quoted string literal. */
function luaStr(s: string) {
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, '\\n')}'`
}

/** Valid, unique model names for the whole pack (the editor already keeps them so). */
export function resolvePropNames(props: PropAsset[]) {
  const used = new Set<string>()
  return props.map((p) => ({ ...p, name: fixModelName(p.name, p.label, used) }))
}

/** World matrix of the prop transform set in the pack. */
function packMatrix(prop: PropAsset) {
  return applyPropWorldTransform(new THREE.Group(), prop.position, prop.rotation, prop.scale).matrixWorld.clone()
}

/** Geometry baked to the root's space; mirrored matrices keep their triangles facing out. */
function bakedGeometry(mesh: THREE.Mesh): THREE.BufferGeometry {
  const geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()
  geo.applyMatrix4(mesh.matrixWorld)
  if (mesh.matrixWorld.determinant() < 0) {
    for (const name of Object.keys(geo.attributes)) {
      const a = geo.attributes[name]
      for (let i = 0; i + 2 < a.count; i += 3) {
        for (let k = 0; k < a.itemSize; k++) {
          const t = a.getComponent(i + 1, k)
          a.setComponent(i + 1, k, a.getComponent(i + 2, k))
          a.setComponent(i + 2, k, t)
        }
      }
    }
  }
  return geo
}

/** Simplified copy for a LOD level. Materials are shared so LODs reuse the same shaders. */
function lodObject(root: THREE.Object3D, ratio: number) {
  root.updateMatrixWorld(true)
  const out = new THREE.Group()
  root.traverse((c) => {
    const mesh = c as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry?.attributes.position) return
    const baked = bakedGeometry(mesh)
    const simple = simplifyGeometry(baked, ratio)
    if (simple !== baked) baked.dispose()
    out.add(new THREE.Mesh(simple, mesh.material))
  })
  return out
}

/** Collision input for the compiler, in editor space with the pack transform applied. */
function collisionInput(prop: PropAsset): PropCompileInput['collision'] {
  const matrix = packMatrix(prop)
  if (prop.collision === 'custom' && prop.model) {
    const parts = collisionGeometries(prop.model).map((g) => g.applyMatrix4(matrix))
    return { kind: 'custom', parts }
  }
  if (prop.collision === 'none' || prop.collision === 'custom') return { kind: 'none' }
  const geo =
    prop.collision === 'mesh'
      ? meshCollisionGeometry(prop.object, prop.collisionRatio ?? 0.25)
      : makeCollisionGeometry(prop.collision, new THREE.Vector3(...prop.localMin), new THREE.Vector3(...prop.localMax), prop.object)
  return { kind: prop.collision, mesh: geo ? geo.applyMatrix4(matrix) : null }
}

export function surfaceOf(prop: PropAsset) {
  return prop.surface ?? (prop.dynamic ? SURFACE_PLASTIC : SURFACE_CONCRETE)
}

export interface PropBuildResult {
  prop: PropAsset
  compiled: CompiledProp
  /** Visual meshes in editor space with the pack transform (for the GLB copy). */
  visual: THREE.Object3D
}

/** Compiles one prop into its native files. */
export async function buildProp(prop: PropAsset): Promise<PropBuildResult> {
  if (prop.model) await modelMaterials.ready(prop.model.materials)
  const visual = applyPropWorldTransform(prop.object, prop.position, prop.rotation, prop.scale)
  const lods = prop.generateLods && prop.triangleCount > 80 ? { med: lodObject(visual, 0.45), low: lodObject(visual, 0.18) } : undefined
  const collision = collisionInput(prop)
  try {
    const compiled = compileProp({
      name: prop.name,
      visual,
      lods,
      collision,
      collisionMaterial: surfaceOf(prop),
      dynamic: prop.dynamic,
      lodDist: prop.lodDist,
      hdTextureDist: prop.hdTextureDist,
      textureMaxSize: prop.textureSize ?? 1024,
    })
    return { prop, compiled, visual }
  } finally {
    collision.mesh?.dispose()
    for (const g of collision.parts ?? []) g.dispose()
    if (lods?.med) disposeGeometry(lods.med)
    if (lods?.low) disposeGeometry(lods.low)
  }
}

function fxmanifest(resource: string) {
  return `fx_version 'cerulean'
game 'gta5'
lua54 'yes'

name '${resource}'
author 'LABSEVE7 Tools'
description 'Addon props exported from Prop Creator'
version '1.0.0'

shared_script 'config.lua'
client_script 'client.lua'
server_script 'server.lua'

files {
  'stream/${resource}.ytyp'
}

data_file 'DLC_ITYP_REQUEST' 'stream/${resource}.ytyp'
`
}

function configLua(props: PropAsset[]) {
  const rows = props
    .map(
      (p) =>
        `  { model = ${luaStr(p.name)}, label = ${luaStr(p.label || p.name)}, lodDist = ${p.lodDist}, dynamic = ${p.dynamic} }`,
    )
    .join(',\n')
  return `Config = {}

Config.SpawnCommand = 'spawnprop'
Config.DeleteCommand = 'delprop'
Config.ListCommand = 'listprops'
Config.PlaceDistance = 2.0

Config.Props = {
${rows}
}
`
}

function clientLua(resource: string) {
  return `-- Spawn / delete commands for the addon props of this pack.
local RESOURCE = GetCurrentResourceName()
local spawned = {}

local function notify(msg)
  print(('[%s] %s'):format(RESOURCE, msg))
  TriggerEvent('chat:addMessage', { args = { RESOURCE, msg } })
end

local function findProp(name)
  if not name or name == '' then return Config.Props[1] end
  local needle = name:lower()
  for _, prop in ipairs(Config.Props) do
    if prop.model:lower() == needle or prop.label:lower() == needle then
      return prop
    end
  end
  return nil
end

local function isPackModel(model)
  for _, prop in ipairs(Config.Props) do
    if GetHashKey(prop.model) == model then return true end
  end
  return false
end

local function loadModel(hash)
  if not IsModelInCdimage(hash) or not IsModelValid(hash) then return false end
  RequestModel(hash)
  local timeout = GetGameTimer() + 8000
  while not HasModelLoaded(hash) do
    if GetGameTimer() > timeout then return false end
    Wait(10)
  end
  return true
end

local function deleteProp(obj)
  if NetworkGetEntityIsNetworked(obj) and not NetworkHasControlOfEntity(obj) then
    NetworkRequestControlOfEntity(obj)
    local timeout = GetGameTimer() + 1000
    while not NetworkHasControlOfEntity(obj) and GetGameTimer() < timeout do Wait(0) end
  end
  SetEntityAsMissionEntity(obj, true, true)
  DeleteEntity(obj)
  return not DoesEntityExist(obj)
end

RegisterCommand(Config.SpawnCommand, function(_, args)
  local entry = findProp(args[1])
  if not entry then
    notify(('Unknown prop "%s". Use /%s to list them.'):format(args[1] or '', Config.ListCommand))
    return
  end
  local hash = GetHashKey(entry.model)
  if not loadModel(hash) then
    notify(('Model %s did not load. Check that ${resource} is started (ensure ${resource}) and that stream/ has %s.ydr and ${resource}.ytyp.'):format(entry.model, entry.model))
    return
  end
  local ped = PlayerPedId()
  local coords = GetOffsetFromEntityInWorldCoords(ped, 0.0, Config.PlaceDistance, 0.0)
  local obj = CreateObject(hash, coords.x, coords.y, coords.z, true, true, false)
  SetEntityHeading(obj, GetEntityHeading(ped))
  PlaceObjectOnGroundProperly(obj)
  FreezeEntityPosition(obj, not entry.dynamic)
  SetModelAsNoLongerNeeded(hash)
  spawned[#spawned + 1] = obj
  notify(('Spawned %s'):format(entry.model))
end, false)

RegisterCommand(Config.DeleteCommand, function()
  local coords = GetEntityCoords(PlayerPedId())
  local closest, closestDist
  for _, obj in ipairs(GetGamePool('CObject')) do
    local dist = #(coords - GetEntityCoords(obj))
    if dist < 4.0 and (not closestDist or dist < closestDist) and isPackModel(GetEntityModel(obj)) then
      closest, closestDist = obj, dist
    end
  end
  if not closest then
    notify('No prop from this pack within 4 m.')
  elseif deleteProp(closest) then
    notify('Deleted prop')
  else
    notify('Could not delete the prop (another player controls it).')
  end
end, false)

RegisterCommand(Config.ListCommand, function()
  for _, prop in ipairs(Config.Props) do
    notify(('%s  (%s)'):format(prop.model, prop.label))
  end
end, false)

-- Props spawned by this client go away with the resource.
AddEventHandler('onResourceStop', function(name)
  if name ~= RESOURCE then return end
  for _, obj in ipairs(spawned) do
    if DoesEntityExist(obj) then DeleteEntity(obj) end
  end
end)

TriggerEvent('chat:addSuggestion', '/' .. Config.SpawnCommand, 'Spawn an addon prop from this pack', {
  { name = 'model', help = 'Model name or label (optional)' }
})
TriggerEvent('chat:addSuggestion', '/' .. Config.DeleteCommand, 'Delete the closest addon prop from this pack')
TriggerEvent('chat:addSuggestion', '/' .. Config.ListCommand, 'List addon props in this pack')
`
}

function serverLua(resource: string, count: number) {
  return `print(('[%s] %s addon prop%s ready'):format('${resource}', ${count}, ${count === 1 ? "''" : "'s'"}))
`
}

function surfaceName(id: number) {
  return SURFACES.find((s) => s.id === id)?.label ?? `material ${id}`
}

function readme(resource: string, built: PropBuildResult[]) {
  const list = built
    .map(({ prop: p, compiled: c }) => {
      const s = c.stats
      return `- \`${p.name}\` — ${p.label} · ${s.triangles.toLocaleString('en')} tris · ${c.textures.length} texture${c.textures.length === 1 ? '' : 's'} · collision: ${s.collisionType}${s.collisionTriangles ? ` (${s.collisionTriangles} tris)` : ''}, ${surfaceName(surfaceOf(p)).toLowerCase()} · ${p.dynamic ? 'dynamic' : 'static'} · draw distance ${p.lodDist} m`
    })
    .join('\n')
  return `# ${resource}

Exported from **LABSEVE7 Tools · Prop Creator**. Everything in \`stream/\` is a native GTA V file, ready for FiveM —
no Blender, Sollumz or CodeWalker step needed.

## Install
1. Copy this folder to your server's \`resources/\` folder.
2. Add \`ensure ${resource}\` to \`server.cfg\` (or run \`refresh\` + \`ensure ${resource}\` in the server console).
3. In game: \`/spawnprop [model]\`, \`/listprops\`, \`/delprop\` (commands can be renamed in \`config.lua\`).

Use the model names below in your own scripts (\`CreateObject(\`GetHashKey('model')\`...)\`), in map editors, or place
them in a \`.ymap\`.

## What is inside
- \`stream/<prop>.ydr\` — the drawable: meshes (Z-up, metres), shaders, **embedded DXT textures**, LODs and the
  **embedded collision** (bound composite: box, sphere, convex hull or BVH mesh).
- \`stream/${resource}.ytyp\` — the archetypes: bounds, draw distance, Static / Dynamic flag of every prop.
  \`fxmanifest.lua\` loads it with \`data_file 'DLC_ITYP_REQUEST'\`.
- \`config.lua\` / \`client.lua\` / \`server.lua\` — spawn, list and delete commands.
- \`source/\` — editable copies:
  - \`<prop>.ydr.xml\` + \`<prop>/*.dds\` — CodeWalker / Sollumz XML of each drawable (open or import to tweak it and
    re-export).
  - \`${resource}.ytyp.xml\` — the archetypes as XML.
  - \`<prop>.glb\` — the model for Blender or any 3D tool.
  - \`*${MODEL_FILE_EXT}\` — modeler scenes: open them again in Prop Creator → Modeler → File → Open model.
- \`props.json\` — the editor settings of each prop.

## Props
${list}
`
}

export async function exportPropResource(input: PropAsset[], resourceName: string, onProgress?: (text: string) => void) {
  const props = resolvePropNames(input)
  const zip = new JSZip()
  const rootName = slugify(resourceName.trim() || 'prop_pack')
  const folder = zip.folder(rootName)!
  const stream = folder.folder('stream')!
  const source = folder.folder('source')!
  const built: PropBuildResult[] = []
  const warnings: string[] = []

  for (const [i, prop] of props.entries()) {
    onProgress?.(`Compiling ${prop.name} (${i + 1}/${props.length})`)
    // let the UI paint between props
    await new Promise((r) => setTimeout(r, 0))
    const result = await buildProp(prop)
    built.push(result)
    const c = result.compiled
    stream.file(`${prop.name}.ydr`, c.ydr)
    source.file(`${prop.name}.ydr.xml`, c.ydrXml)
    const texFolder = source.folder(prop.name)!
    for (const t of c.textures) texFolder.file(`${t.name}.dds`, ddsFile(t))
    for (const w of c.warnings) warnings.push(`${prop.name}: ${w}`)

    try {
      const baked = bakeWorldMeshes(result.visual)
      source.file(`${prop.name}.glb`, await exportGlb(baked))
      disposeGeometry(baked)
    } catch {
      warnings.push(`${prop.name}: the GLB copy could not be written.`)
    }
    if (prop.model) source.file(`${prop.name}${MODEL_FILE_EXT}`, serializeDoc(prop.model, prop.name))
    else if (prop.file.size > 64) source.file(`${prop.name}.original${extOf(prop.file)}`, prop.file)
  }

  const archetypes = built.map((b) => b.compiled.archetype)
  stream.file(`${rootName}.ytyp`, buildYtyp(rootName, archetypes))
  source.file(`${rootName}.ytyp.xml`, ytypXml(rootName, archetypes))

  folder.file('fxmanifest.lua', fxmanifest(rootName))
  folder.file('config.lua', configLua(props))
  folder.file('client.lua', clientLua(rootName))
  folder.file('server.lua', serverLua(rootName, props.length))
  folder.file('README.md', readme(rootName, built))
  folder.file(
    'props.json',
    JSON.stringify(
      {
        resource: rootName,
        props: built.map(({ prop: p, compiled: c }) => ({
          name: p.name,
          label: p.label,
          file: p.model ? `${p.name}${MODEL_FILE_EXT}` : p.file.name,
          position: p.position,
          rotation: p.rotation,
          scale: p.scale,
          collision: p.collision,
          collisionType: c.stats.collisionType,
          collisionRatio: p.collisionRatio,
          surface: surfaceOf(p),
          lodDist: p.lodDist,
          hdTextureDist: p.hdTextureDist,
          generateLods: p.generateLods,
          dynamic: p.dynamic,
          textureSize: p.textureSize ?? 1024,
          vertices: c.stats.vertices,
          triangles: c.stats.triangles,
          textures: c.textures.map((t) => `${t.name} ${t.width}x${t.height} ${t.format}`),
          bbMin: c.archetype.bbMin,
          bbMax: c.archetype.bbMax,
        })),
      },
      null,
      2,
    ),
  )

  onProgress?.('Zipping')
  return {
    blob: await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } }),
    fileName: `${rootName}.zip`,
    renamed: props.filter((p, i) => p.name !== input[i].name).length,
    warnings,
  }
}

function extOf(file: File) {
  const ext = file.name.split('.').pop()?.toLowerCase()
  return ext ? `.${ext}` : ''
}
