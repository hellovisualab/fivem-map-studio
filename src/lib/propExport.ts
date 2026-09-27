import * as THREE from 'three'
import JSZip from 'jszip'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js'
import {
  applyPropWorldTransform,
  bakeWorldMeshes,
  extractMaterialTextures,
  gtaBounds,
  makeCollisionGeometry,
  meshCollisionGeometry,
  simplifyObject,
} from '@/lib/propGeometry'
import type { PropAsset } from '@/lib/propTypes'
import { fixModelName } from '@/lib/propLoad'
import { slugify } from '@/lib/utils'

export type { PropAsset } from '@/lib/propTypes'

function num(n: number, d = 4) {
  return Number.isFinite(n) ? n.toFixed(d) : '0'
}

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

function bakedRoot(prop: PropAsset) {
  const wrapped = applyPropWorldTransform(prop.object, prop.position, prop.rotation, prop.scale)
  return bakeWorldMeshes(wrapped)
}

function worldBox(prop: PropAsset) {
  const wrapped = applyPropWorldTransform(prop.object, prop.position, prop.rotation, prop.scale)
  wrapped.updateMatrixWorld(true)
  // precise: bounds of the actual vertices, not of rotated bounding boxes
  return new THREE.Box3().setFromObject(wrapped, true)
}

function disposeGeometry(root: THREE.Object3D) {
  root.traverse((c) => (c as THREE.Mesh).geometry?.dispose())
}

/** Lua single-quoted string literal. */
function luaStr(s: string) {
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, '\\n')}'`
}

function xmlText(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// CodeWalker archetype flags: 32 = Static, 131072 = Dynamic.
const FLAG_STATIC = 32
const FLAG_DYNAMIC = 131072

/** Valid, unique model names for the whole pack (the editor already keeps them so). */
export function resolvePropNames(props: PropAsset[]) {
  const used = new Set<string>()
  return props.map((p) => ({ ...p, name: fixModelName(p.name, p.label, used) }))
}

function ytypXml(resource: string, props: PropAsset[], textured: Set<string>) {
  const items = props
    .map((prop) => {
      const box = worldBox(prop)
      const { bbMin, bbMax, bsCentre, bsRadius } = gtaBounds(box.min, box.max)
      const physics = prop.collision === 'none' ? '' : prop.name
      return `    <Item type="CBaseArchetypeDef">
      <lodDist value="${num(prop.lodDist, 2)}" />
      <flags value="${prop.dynamic ? FLAG_DYNAMIC : FLAG_STATIC}" />
      <specialAttribute value="0" />
      <bbMin x="${num(bbMin.x)}" y="${num(bbMin.y)}" z="${num(bbMin.z)}" />
      <bbMax x="${num(bbMax.x)}" y="${num(bbMax.y)}" z="${num(bbMax.z)}" />
      <bsCentre x="${num(bsCentre.x)}" y="${num(bsCentre.y)}" z="${num(bsCentre.z)}" />
      <bsRadius value="${num(bsRadius)}" />
      <hdTextureDist value="${num(prop.hdTextureDist, 2)}" />
      <name>${prop.name}</name>
      <textureDictionary>${textured.has(prop.name) ? prop.name : ''}</textureDictionary>
      <clipDictionary />
      <drawableDictionary />
      <physicsDictionary>${physics}</physicsDictionary>
      <assetType>ASSET_TYPE_DRAWABLE</assetType>
      <assetName>${prop.name}</assetName>
      <extensions />
    </Item>`
    })
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<CMapTypes>
  <extensions />
  <archetypes>
${items}
  </archetypes>
  <name>${xmlText(resource)}</name>
  <dependencies />
  <compositeEntityTypes />
</CMapTypes>
`
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
    notify(('Model %s is not streamed yet: convert it and put the .ydr / .ytd / .ybn and ${resource}.ytyp in stream/ (see README.md).'):format(entry.model))
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

function readme(resource: string, props: PropAsset[], files: Map<string, string[]>) {
  const list = props
    .map((p) => `- \`${p.name}\` — ${p.label} · ${p.triangleCount.toLocaleString('en')} tris · ${p.collision} collision · ${p.dynamic ? 'dynamic' : 'static'} · files: ${(files.get(p.name) ?? []).join(', ')}`)
    .join('\n')
  return `# ${resource}

Exported from **LABSEVE7 Tools · Prop Creator**.

Browsers cannot write GTA's native \`.ydr\` / \`.ytd\` / \`.ybn\` / \`.ytyp\` binaries, so this pack contains everything
already baked (transforms, materials, collision, LODs, bounds) for a one-step conversion with
**Blender + Sollumz** or **CodeWalker**.

## Convert (Blender + Sollumz)
For each prop:
1. *File → Import → glTF 2.0* \`source/<prop>.glb\` (metres, origin on the ground — do not move it).
2. Select the mesh and use *Sollumz → Convert to Drawable*. If \`<prop>_lod1.glb\` / \`<prop>_lod2.glb\` exist,
   import them and assign them as the **Medium** / **Low** LOD of the same drawable.
3. Collision: import \`source/<prop>_col.obj\` (*Forward -Z, Up Y*), convert it to a *Bound Composite* with a
   *Bound Geometry BVH* child and parent it to the drawable (skip for props with \`none\` collision).
4. Textures are embedded in the GLB; \`source/textures/\` has the same images as power-of-two PNGs
   (\`*_n.png\` = normal map) if you build the \`.ytd\` yourself.
5. Export the drawable (\`<prop>.ydr\`, embedded collision and textures).

Then import \`codewalker/${resource}.ytyp.xml\` (Sollumz *Import YTYP* or CodeWalker *Import XML*) and export it as
\`${resource}.ytyp\`. Its archetypes already carry the bounds, draw distance, texture / physics dictionary names
and the Static / Dynamic flag of each prop.

## Install
1. Put every \`.ydr\` (and \`.ytd\` / \`.ybn\` if you made separate ones) plus \`${resource}.ytyp\` in \`stream/\`.
2. Copy this folder to your server's \`resources/\` and add \`ensure ${resource}\` to \`server.cfg\`.
3. In game: \`/spawnprop [model]\`, \`/listprops\`, \`/delprop\` (commands can be renamed in \`config.lua\`).

## This pack
${list}

## Folders
- \`source/\` — baked GLB per prop (Y-up glTF, metres), LOD meshes, collision OBJ, the original upload and \`textures/\`
- \`codewalker/${resource}.ytyp.xml\` — archetype definitions (CodeWalker / Sollumz XML)
- \`stream/\` — put the converted game files here
- \`config.lua\` / \`client.lua\` — spawn, list and delete commands
- \`props.json\` — the editor settings of each prop
`
}

export async function exportPropResource(input: PropAsset[], resourceName: string) {
  const props = resolvePropNames(input)
  const zip = new JSZip()
  const rootName = slugify(resourceName.trim() || 'prop_pack')
  const folder = zip.folder(rootName)!
  const source = folder.folder('source')!
  const textures = source.folder('textures')!
  const stream = folder.folder('stream')!
  const codewalker = folder.folder('codewalker')!
  const files = new Map<string, string[]>()
  // Like Sollumz: only props with textures name a texture dictionary.
  const textured = new Set<string>()

  for (const prop of props) {
    const written: string[] = []
    const add = (dir: JSZip, path: string, data: string | ArrayBuffer | Blob) => {
      dir.file(path, data)
      written.push(path)
    }
    const baked = bakedRoot(prop)
    add(source, `${prop.name}.glb`, await exportGlb(baked))
    if (prop.file.size > 64) add(source, `${prop.name}.original${extOf(prop.file)}`, prop.file)

    if (prop.generateLods && prop.triangleCount > 80) {
      for (const [suffix, ratio] of [
        ['lod1', 0.45],
        ['lod2', 0.18],
      ] as const) {
        try {
          const lod = simplifyObject(baked, ratio)
          add(source, `${prop.name}_${suffix}.glb`, await exportGlb(lod))
          disposeGeometry(lod)
        } catch {
          /* keep the high model only if simplification fails */
        }
      }
    }

    const colGeo =
      prop.collision === 'mesh'
        ? meshCollisionGeometry(prop.object, prop.collisionRatio ?? 0.25)
        : makeCollisionGeometry(prop.collision, new THREE.Vector3(...prop.localMin), new THREE.Vector3(...prop.localMax), prop.object)
    if (colGeo) {
      const col = applyPropWorldTransform(new THREE.Mesh(colGeo), prop.position, prop.rotation, prop.scale)
      const bakedCol = bakeWorldMeshes(col)
      add(source, `${prop.name}_col.obj`, new OBJExporter().parse(bakedCol))
      disposeGeometry(bakedCol)
      colGeo.dispose()
    }

    const maps = await extractMaterialTextures(baked)
    for (const tex of maps) add(textures, `${prop.name}_${tex.name}`, tex.blob)
    if (maps.length) textured.add(prop.name)
    disposeGeometry(baked)
    files.set(prop.name, written)
  }

  codewalker.file(`${rootName}.ytyp.xml`, ytypXml(rootName, props, textured))
  stream.file(
    'README.txt',
    `Put ${rootName}.ytyp, plus each prop's .ydr (and .ytd / .ybn if separate) in this folder after converting with Sollumz or CodeWalker. See ../README.md.\n`,
  )

  folder.file('fxmanifest.lua', fxmanifest(rootName))
  folder.file('config.lua', configLua(props))
  folder.file('client.lua', clientLua(rootName))
  folder.file('server.lua', serverLua(rootName, props.length))
  folder.file('README.md', readme(rootName, props, files))
  folder.file(
    'props.json',
    JSON.stringify(
      {
        resource: rootName,
        props: props.map((p) => ({
          name: p.name,
          label: p.label,
          file: p.file.name,
          position: p.position,
          rotation: p.rotation,
          scale: p.scale,
          collision: p.collision,
          collisionRatio: p.collisionRatio,
          lodDist: p.lodDist,
          hdTextureDist: p.hdTextureDist,
          generateLods: p.generateLods,
          dynamic: p.dynamic,
          vertexCount: p.vertexCount,
          triangleCount: p.triangleCount,
          size: p.size,
          files: files.get(p.name) ?? [],
        })),
      },
      null,
      2,
    ),
  )

  return { blob: await zip.generateAsync({ type: 'blob' }), fileName: `${rootName}.zip`, renamed: props.filter((p, i) => p.name !== input[i].name).length }
}

function extOf(file: File) {
  const ext = file.name.split('.').pop()?.toLowerCase()
  return ext ? `.${ext}` : ''
}
