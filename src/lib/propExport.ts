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
  return new THREE.Box3().setFromObject(wrapped)
}

function ytypXml(resource: string, props: PropAsset[]) {
  const items = props
    .map((prop) => {
      const box = worldBox(prop)
      const { bbMin, bbMax, bsCentre, bsRadius } = gtaBounds(box.min, box.max)
      const physics = prop.collision === 'none' ? '' : prop.name
      return `    <Item type="CBaseArchetypeDef">
      <lodDist value="${num(prop.lodDist, 2)}" />
      <flags value="${prop.dynamic ? 32 : 0}" />
      <specialAttribute value="0" />
      <bbMin x="${num(bbMin.x)}" y="${num(bbMin.y)}" z="${num(bbMin.z)}" />
      <bbMax x="${num(bbMax.x)}" y="${num(bbMax.y)}" z="${num(bbMax.z)}" />
      <bsCentre x="${num(bsCentre.x)}" y="${num(bsCentre.y)}" z="${num(bsCentre.z)}" />
      <bsRadius value="${num(bsRadius)}" />
      <hdTextureDist value="${num(prop.hdTextureDist, 2)}" />
      <name>${prop.name}</name>
      <textureDictionary>${prop.name}</textureDictionary>
      <clipDictionary />
      <drawableDictionary />
      <physicsDictionary>${physics}</physicsDictionary>
      <assetType>ASSET_TYPE_DRAWABLE</assetType>
      <assetName>${prop.name}</assetName>
    </Item>`
    })
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<CMapTypes>
  <extensions />
  <archetypes>
${items}
  </archetypes>
  <name>${resource}</name>
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
        `  { model = '${p.name}', label = '${p.label.replace(/'/g, "\\'")}', lodDist = ${p.lodDist}, dynamic = ${p.dynamic} }`,
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
  return `local function findProp(name)
  if not name or name == '' then return Config.Props[1] end
  local needle = name:lower()
  for _, prop in ipairs(Config.Props) do
    if prop.model:lower() == needle or prop.label:lower() == needle then
      return prop
    end
  end
  return nil
end

local function loadModel(model)
  if not IsModelValid(model) then return false end
  RequestModel(model)
  local timeout = GetGameTimer() + 8000
  while not HasModelLoaded(model) do
    if GetGameTimer() > timeout then return false end
    Wait(10)
  end
  return true
end

RegisterCommand(Config.SpawnCommand, function(_, args)
  local entry = findProp(args[1])
  if not entry then
    print(('[%s] Unknown prop. /%s to list.'):format('${resource}', Config.ListCommand))
    return
  end
  local hash = joaat(entry.model)
  if not loadModel(hash) then
    print(('[%s] Model "%s" is not streamed. Convert codewalker/%s.ytyp.xml + source GLB to .ydr/.ytd/.ytyp and put them in stream/.'):format('${resource}', entry.model, '${resource}'))
    return
  end
  local ped = PlayerPedId()
  local coords = GetOffsetFromEntityInWorldCoords(ped, 0.0, Config.PlaceDistance, 0.0)
  local obj = CreateObject(hash, coords.x, coords.y, coords.z, true, true, false)
  PlaceObjectOnGroundProperly(obj)
  SetEntityHeading(obj, GetEntityHeading(ped))
  FreezeEntityPosition(obj, not entry.dynamic)
  SetModelAsNoLongerNeeded(hash)
  print(('[%s] Spawned %s'):format('${resource}', entry.model))
end, false)

RegisterCommand(Config.DeleteCommand, function()
  local ped = PlayerPedId()
  local coords = GetEntityCoords(ped)
  local handle, object = FindFirstObject()
  local ok = true
  local closest, closestDist
  while ok do
    local pos = GetEntityCoords(object)
    local dist = #(coords - pos)
    if dist < 4.0 and (not closestDist or dist < closestDist) then
      for _, prop in ipairs(Config.Props) do
        if GetEntityModel(object) == joaat(prop.model) then
          closest, closestDist = object, dist
        end
      end
    end
    ok, object = FindNextObject(handle)
  end
  EndFindObject(handle)
  if closest then
    DeleteObject(closest)
    print(('[%s] Deleted prop'):format('${resource}'))
  end
end, false)

RegisterCommand(Config.ListCommand, function()
  for _, prop in ipairs(Config.Props) do
    print(('  %s  (%s)'):format(prop.model, prop.label))
  end
end, false)

TriggerEvent('chat:addSuggestion', '/' .. Config.SpawnCommand, 'Spawn an addon prop from this pack', {
  { name = 'model', help = 'Model name (optional)' }
})
TriggerEvent('chat:addSuggestion', '/' .. Config.DeleteCommand, 'Delete the closest addon prop from this pack')
TriggerEvent('chat:addSuggestion', '/' .. Config.ListCommand, 'List addon props in this pack')
`
}

function serverLua(resource: string, count: number) {
  return `print(('[%s] %s addon prop%s ready'):format('${resource}', ${count}, ${count === 1 ? "''" : "'s'"}))
`
}

function readme(resource: string, props: PropAsset[]) {
  const list = props.map((p) => `- \`${p.name}\` — ${p.label} · ${p.triangleCount} tris · ${p.collision} collision`).join('\n')
  return `# ${resource}

Exported from **LABSEVE7 Tools · Prop Creator**.

## Install
1. Convert the files in \`codewalker/\` + \`source/\` to native GTA formats with **CodeWalker** or **Blender + Sollumz** (GLB → YDR / YTD / YBN, XML → YTYP).
2. Drop the resulting \`.ydr\`, \`.ytd\`, \`.ybn\` and \`${resource}.ytyp\` into \`stream/\`.
3. Copy this folder to \`resources/[${resource}]\` and add \`ensure ${resource}\` to \`server.cfg\`.
4. In-game: \`/${'spawnprop'} [model]\`, \`/listprops\`, \`/delprop\`.

## This pack
${list}

## Folders
- \`source/\` — baked GLB (origin on the ground, metres), LOD meshes, collision OBJ, extracted textures
- \`codewalker/${resource}.ytyp.xml\` — archetype definitions (bounds, lod, texture dictionary)
- \`stream/\` — put converted game files here
- \`config.lua\` / \`client.lua\` — spawn commands

Browsers cannot write native \`.ydr\` / \`.ytd\` / \`.ybn\` binaries. The studio bakes transforms, materials, collision and LODs so conversion is a single step.
`
}

export async function exportPropResource(props: PropAsset[], resourceName: string) {
  const zip = new JSZip()
  const rootName = slugify(resourceName) || 'prop_pack'
  const folder = zip.folder(rootName)!
  const source = folder.folder('source')!
  const textures = source.folder('textures')!
  const stream = folder.folder('stream')!
  const codewalker = folder.folder('codewalker')!

  for (const prop of props) {
    const baked = bakedRoot(prop)
    const glb = await exportGlb(baked)
    source.file(`${prop.name}.glb`, glb)
    if (prop.file.size > 64) source.file(`${prop.name}.original${extOf(prop.file)}`, prop.file)

    if (prop.generateLods && prop.triangleCount > 80) {
      try {
        const lod1 = simplifyObject(baked, 0.45)
        const lod2 = simplifyObject(baked, 0.18)
        source.file(`${prop.name}_lod1.glb`, await exportGlb(lod1))
        source.file(`${prop.name}_lod2.glb`, await exportGlb(lod2))
      } catch {
        /* keep high-only if simplify fails */
      }
    }

    const min = new THREE.Vector3(...prop.localMin)
    const max = new THREE.Vector3(...prop.localMax)
    if (prop.collision === 'mesh') {
      const colGeo = meshCollisionGeometry(prop.object, prop.collisionRatio ?? 0.25)
      if (colGeo) {
        const colMesh = new THREE.Mesh(colGeo)
        const wrap = new THREE.Group()
        wrap.add(colMesh)
        wrap.position.set(...prop.position)
        wrap.rotation.set((prop.rotation[0] * Math.PI) / 180, (prop.rotation[1] * Math.PI) / 180, (prop.rotation[2] * Math.PI) / 180)
        wrap.scale.set(...prop.scale)
        wrap.updateMatrixWorld(true)
        const bakedCol = colGeo.clone()
        bakedCol.applyMatrix4(colMesh.matrixWorld)
        source.file(`${prop.name}_col.obj`, new OBJExporter().parse(new THREE.Mesh(bakedCol)))
      }
    } else {
      const colGeo = makeCollisionGeometry(prop.collision, min, max, prop.object)
      if (colGeo) {
        const colMesh = new THREE.Mesh(colGeo)
        const wrap = new THREE.Group()
        wrap.add(colMesh)
        wrap.position.set(...prop.position)
        wrap.rotation.set((prop.rotation[0] * Math.PI) / 180, (prop.rotation[1] * Math.PI) / 180, (prop.rotation[2] * Math.PI) / 180)
        wrap.scale.set(...prop.scale)
        wrap.updateMatrixWorld(true)
        const bakedCol = colGeo.clone()
        bakedCol.applyMatrix4(colMesh.matrixWorld)
        source.file(`${prop.name}_col.obj`, new OBJExporter().parse(new THREE.Mesh(bakedCol)))
      }
    }

    const maps = await extractMaterialTextures(baked)
    for (const tex of maps) textures.file(`${prop.name}_${tex.name}`, tex.blob)
  }

  codewalker.file(`${rootName}.ytyp.xml`, ytypXml(rootName, props))
  stream.file(
    'README.txt',
    `Put ${rootName}.ytyp, plus each prop's .ydr / .ytd / .ybn in this folder after converting with CodeWalker or Sollumz.\n`,
  )

  folder.file('fxmanifest.lua', fxmanifest(rootName))
  folder.file('config.lua', configLua(props))
  folder.file('client.lua', clientLua(rootName))
  folder.file('server.lua', serverLua(rootName, props.length))
  folder.file('README.md', readme(rootName, props))
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
        })),
      },
      null,
      2,
    ),
  )

  return zip.generateAsync({ type: 'blob' })
}

function extOf(file: File) {
  const ext = file.name.split('.').pop()?.toLowerCase()
  return ext ? `.${ext}` : ''
}
