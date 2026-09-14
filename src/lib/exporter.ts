import JSZip from 'jszip'
import type { MapDocument, MapElement, Project } from '@/types'
import { absolutePoints, canvasToWorld } from './geometry'
import { canvasToBlob, renderDocument } from './render'
import { overlayFxOf, overlayIndexHtml, overlayFxDriverJs } from './overlayFx'
import overlayFxCss from './overlayFx.css?raw'
import { hexToRgb, round, slugify } from './utils'

export interface ExportOptions {
  resourceName: string
  includeTextures: boolean
  splitTiles: boolean
  includeHtml: boolean
  tileColumns: number
  tileRows: number
  onProgress?: (pct: number, label: string) => void
}

interface ZoneOut {
  id: string
  name: string
  type: string
  description: string
  color: string
  alpha: number
  border: { color: string; width: number }
  polygon: { x: number; y: number }[]
  center: { x: number; y: number }
  size: { width: number; height: number }
  blipColour: number
}

interface MarkerOut {
  id: string
  name: string
  icon: string
  label: string
  color: string
  blipSprite: number
  blipColour: number
  scale: number
  position: { x: number; y: number; z: number }
}

interface LabelOut {
  id: string
  text: string
  font: string
  size: number
  color: string
  rotation: number
  position: { x: number; y: number }
}

const BLIP_COLOURS: [number, string][] = [
  [0, '#ffffff'],
  [1, '#e03232'],
  [2, '#71cb71'],
  [3, '#5db6e5'],
  [5, '#eec64e'],
  [8, '#f28cc1'],
  [17, '#f0a83f'],
  [27, '#a35bd7'],
  [40, '#8c8c8c'],
  [47, '#ff8a1f'],
  [29, '#2b62d6'],
  [69, '#3fb35f'],
]

export function nearestBlipColour(hex: string) {
  const [r, g, b] = hexToRgb(hex)
  let best = 0
  let bestD = Infinity
  for (const [idx, c] of BLIP_COLOURS) {
    const [r2, g2, b2] = hexToRgb(c)
    const d = (r - r2) ** 2 + (g - g2) ** 2 + (b - b2) ** 2
    if (d < bestD) {
      bestD = d
      best = idx
    }
  }
  return best
}

export function buildPositions(doc: MapDocument) {
  const zones: ZoneOut[] = []
  const markers: MarkerOut[] = []
  const labels: LabelOut[] = []
  const lines: { id: string; name: string; color: string; width: number; points: { x: number; y: number }[] }[] = []

  for (const el of doc.elements) {
    if (!el.visible) continue
    switch (el.type) {
      case 'zone': {
        const pts = absolutePoints(el).map((p) => canvasToWorld(p.x, p.y, doc))
        const xs = pts.map((p) => p.x)
        const ys = pts.map((p) => p.y)
        const minX = Math.min(...xs)
        const maxX = Math.max(...xs)
        const minY = Math.min(...ys)
        const maxY = Math.max(...ys)
        zones.push({
          id: el.id,
          name: el.name,
          type: el.zoneType,
          description: el.description,
          color: el.fill,
          alpha: round(el.fillOpacity, 2),
          border: { color: el.stroke, width: el.strokeWidth },
          polygon: pts,
          center: { x: round((minX + maxX) / 2), y: round((minY + maxY) / 2) },
          size: { width: round(maxX - minX), height: round(maxY - minY) },
          blipColour: nearestBlipColour(el.fill),
        })
        break
      }
      case 'marker': {
        const w = canvasToWorld(el.x, el.y, doc)
        markers.push({
          id: el.id,
          name: el.name,
          icon: el.icon,
          label: el.label,
          color: el.color,
          blipSprite: el.blipSprite,
          blipColour: nearestBlipColour(el.color),
          scale: round(el.size / 40, 2),
          position: { x: w.x, y: w.y, z: 30.0 },
        })
        break
      }
      case 'text': {
        const w = canvasToWorld(el.x, el.y, doc)
        labels.push({
          id: el.id,
          text: el.text,
          font: el.fontFamily,
          size: el.fontSize,
          color: el.fill,
          rotation: el.rotation,
          position: w,
        })
        break
      }
      case 'line': {
        lines.push({
          id: el.id,
          name: el.name,
          color: el.stroke,
          width: el.strokeWidth,
          points: absolutePoints(el).map((p) => canvasToWorld(p.x, p.y, doc)),
        })
        break
      }
      default:
        break
    }
  }
  return { zones, markers, labels, lines }
}

const luaStr = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ')}"`

function fxmanifest(name: string, opts: ExportOptions) {
  return `fx_version 'cerulean'
game 'gta5'
lua54 'yes'

name '${name}'
description 'Custom minimap generated with LABSEVE7 Map Studio'
author 'LABSEVE7 Map Studio'
version '1.0.0'

client_scripts {
    'config/config.lua',
    'client.lua'
}

server_script 'server.lua'
${
  opts.includeHtml
    ? `
ui_page 'html/index.html'

files {
    'html/index.html',
    'html/style.css',
    'html/script.js',
    'html/overlay.png',
    'config/positions.json'
}
`
    : `
files {
    'config/positions.json'
}
`
}${
  opts.includeTextures
    ? `
-- Textures in stream/ are picked up automatically once converted to .ytd
-- (see stream/README.txt).
`
    : ''
}`
}

function configLua(doc: MapDocument, data: ReturnType<typeof buildPositions>) {
  const zones = data.zones
    .map(
      (z) => `    {
        id = ${luaStr(z.id)},
        name = ${luaStr(z.name)},
        type = ${luaStr(z.type)},
        description = ${luaStr(z.description)},
        color = ${luaStr(z.color)},
        blipColour = ${z.blipColour},
        alpha = ${Math.round(z.alpha * 255)},
        center = vector2(${z.center.x}, ${z.center.y}),
        size = vector2(${z.size.width}, ${z.size.height}),
        polygon = {
${z.polygon.map((p) => `            vector2(${p.x}, ${p.y})`).join(',\n')}
        }
    }`,
    )
    .join(',\n')

  const markers = data.markers
    .map(
      (m) => `    {
        id = ${luaStr(m.id)},
        label = ${luaStr(m.label || m.name)},
        icon = ${luaStr(m.icon)},
        sprite = ${m.blipSprite},
        colour = ${m.blipColour},
        scale = ${m.scale},
        coords = vector3(${m.position.x}, ${m.position.y}, ${m.position.z})
    }`,
    )
    .join(',\n')

  const labels = data.labels
    .map(
      (l) => `    { text = ${luaStr(l.text)}, coords = vector2(${l.position.x}, ${l.position.y}), size = ${l.size}, color = ${luaStr(l.color)} }`,
    )
    .join(',\n')

  return `Config = {}

-- World bounds used to convert the minimap texture into GTA coordinates.
Config.World = {
    minX = ${doc.world.minX}, maxX = ${doc.world.maxX},
    minY = ${doc.world.minY}, maxY = ${doc.world.maxY}
}

-- Show area blips for zones on the radar / pause map.
Config.ShowZoneBlips = true
-- Show markers as blips.
Config.ShowMarkerBlips = true
-- Draw zone names as 3D text when the player is nearby.
Config.DrawZoneNames = false

Config.Zones = {
${zones}
}

Config.Markers = {
${markers}
}

Config.Labels = {
${labels}
}
`
}

function clientLua(opts: ExportOptions) {
  return `-- Generated by LABSEVE7 Map Studio
local zoneBlips, markerBlips = {}, {}

local function createZoneBlips()
    if not Config.ShowZoneBlips then return end
    for _, zone in ipairs(Config.Zones) do
        local blip = AddBlipForArea(zone.center.x, zone.center.y, 30.0, zone.size.x, zone.size.y)
        SetBlipRotation(blip, 0)
        SetBlipColour(blip, zone.blipColour)
        SetBlipAlpha(blip, zone.alpha)
        BeginTextCommandSetBlipName("STRING")
        AddTextComponentSubstringPlayerName(zone.name)
        EndTextCommandSetBlipName(blip)
        zoneBlips[#zoneBlips + 1] = blip
    end
end

local function createMarkerBlips()
    if not Config.ShowMarkerBlips then return end
    for _, m in ipairs(Config.Markers) do
        local blip = AddBlipForCoord(m.coords.x, m.coords.y, m.coords.z)
        SetBlipSprite(blip, m.sprite)
        SetBlipDisplay(blip, 4)
        SetBlipScale(blip, m.scale)
        SetBlipColour(blip, m.colour)
        SetBlipAsShortRange(blip, true)
        BeginTextCommandSetBlipName("STRING")
        AddTextComponentSubstringPlayerName(m.label)
        EndTextCommandSetBlipName(blip)
        markerBlips[#markerBlips + 1] = blip
    end
end

-- Standard fix so a custom minimap texture keeps the right aspect ratio.
local function setupMinimap()
    RequestStreamedTextureDict("minimap", false)
    RequestStreamedTextureDict("minimap_sea_0_0", false)
    SetMinimapClipType(0)
    AddReplaceTexture("platform:/textures/graphics", "radarmasksm", "minimap", "radarmasksm")
    AddReplaceTexture("platform:/textures/graphics", "radarmask1g", "minimap", "radarmasksm")
    SetMinimapComponentPosition("minimap", "L", "B", -0.0100, 0.030, 0.150, 0.188888)
    SetMinimapComponentPosition("minimap_mask", "L", "B", 0.200, 0.0, 0.065, 0.20)
    SetMinimapComponentPosition("minimap_blur", "L", "B", -0.00, 0.015, 0.252, 0.338)
    SetBlipAlpha(GetNorthRadarBlip(), 0)
    SetRadarBigmapEnabled(true, false)
    Wait(0)
    SetRadarBigmapEnabled(false, false)
end

CreateThread(function()
    setupMinimap()
    createZoneBlips()
    createMarkerBlips()
end)

CreateThread(function()
    while true do
        Wait(0)
        if Config.DrawZoneNames then
            local ped = PlayerPedId()
            local pos = GetEntityCoords(ped)
            for _, zone in ipairs(Config.Zones) do
                local dist = #(vector2(pos.x, pos.y) - zone.center)
                if dist < 120.0 then
                    local onScreen, sx, sy = World3dToScreen2d(zone.center.x, zone.center.y, pos.z + 10.0)
                    if onScreen then
                        SetTextScale(0.35, 0.35)
                        SetTextFont(4)
                        SetTextCentre(true)
                        SetTextOutline()
                        BeginTextCommandDisplayText("STRING")
                        AddTextComponentSubstringPlayerName(zone.name)
                        EndTextCommandDisplayText(sx, sy)
                    end
                end
            end
        else
            Wait(500)
        end
    end
end)
${
  opts.includeHtml
    ? `
-- /minimapoverlay toggles the HTML overlay (studio design + CSS effects).
local overlayVisible = false
RegisterCommand("minimapoverlay", function()
    overlayVisible = not overlayVisible
    SendNUIMessage({ action = "toggle", visible = overlayVisible })
end, false)
`
    : ''
}
-- Exports for other resources
exports("GetZones", function() return Config.Zones end)
exports("GetMarkers", function() return Config.Markers end)
exports("GetZoneAt", function(x, y)
    for _, zone in ipairs(Config.Zones) do
        local hx, hy = zone.size.x / 2, zone.size.y / 2
        if x >= zone.center.x - hx and x <= zone.center.x + hx and y >= zone.center.y - hy and y <= zone.center.y + hy then
            return zone
        end
    end
    return nil
end)
`
}

const serverLua = `-- Generated by LABSEVE7 Map Studio
-- Server side hook: use this to sync dynamic zone ownership if needed.
RegisterNetEvent("fms:requestZones", function()
    TriggerClientEvent("fms:receiveZones", source, Config and Config.Zones or {})
end)
`

const htmlCssBase = `html, body { margin: 0; background: transparent; overflow: hidden; }
#overlay { position: fixed; left: 1.2vw; bottom: 2.4vh; width: 15vw; pointer-events: none; opacity: 0.9;
  transition: opacity .2s ease; border-radius: 6px; }
#overlay.hidden { opacity: 0; }
#overlay img { width: 100%; height: auto; display: block; border-radius: 6px; }
`

const htmlJs = `window.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.action === "toggle") {
    document.getElementById("overlay").classList.toggle("hidden", !data.visible);
  }
});
`

const streamReadme = (cols: number, rows: number) => `HOW TO USE THESE TEXTURES
=========================

FiveM streams minimap textures from a .ytd texture dictionary. Browsers cannot
write .ytd files, so this folder contains ready-to-pack PNGs:

  minimap_full.png             full composited minimap (reference / NUI use)
  minimap_sea_R_C.png          ${cols} columns x ${rows} rows (R = row, C = column), same naming as the vanilla textures

Steps:
  1. Open OpenIV (or CodeWalker) and create a new texture dictionary named minimap.ytd
  2. Import every minimap_sea_R_C.png, keeping the file names as texture names
  3. Save minimap.ytd inside this stream/ folder and delete the PNGs
  4. Restart the resource: ensure ${'<resource>'} in server.cfg

The client.lua already calls the standard SetMinimapComponentPosition fixes so the
custom texture keeps the right aspect ratio.
`

const readme = (name: string, project: Project) => `# ${name}

Generated with **LABSEVE7 Map Studio** from project "${project.name}".

## Install
1. Drop the \`${name}\` folder into your server's \`resources/\` directory
2. Add \`ensure ${name}\` to \`server.cfg\`
3. (Optional) Convert \`stream/*.png\` into \`minimap.ytd\` – see \`stream/README.txt\`

## Contents
- \`fxmanifest.lua\` – resource manifest
- \`client.lua\` – creates zone/marker blips and applies minimap fixes
- \`config/config.lua\` – all zones, markers and labels in GTA world coordinates
- \`config/*.json\` – the same data as JSON for other tools
- \`config/project.json\` – full studio project (re-import it in LABSEVE7 Map Studio)
- \`stream/\` – minimap textures
- \`html/\` – optional NUI overlay with CSS effects (toggle with /minimapoverlay)
`

export async function exportFiveMResource(project: Project, opts: ExportOptions): Promise<Blob> {
  const doc = project.document
  const progress = (p: number, l: string) => opts.onProgress?.(p, l)
  const name = slugify(opts.resourceName || `${project.name}_minimap`)
  const zip = new JSZip()
  const root = zip.folder(name)!

  progress(5, 'Collecting positions')
  const data = buildPositions(doc)

  root.file('fxmanifest.lua', fxmanifest(name, opts))
  root.file('client.lua', clientLua(opts))
  root.file('server.lua', serverLua)
  root.file('README.md', readme(name, project))

  const config = root.folder('config')!
  config.file('config.lua', configLua(doc, data))
  config.file('zones.json', JSON.stringify(data.zones, null, 2))
  config.file('markers.json', JSON.stringify(data.markers, null, 2))
  config.file('labels.json', JSON.stringify(data.labels, null, 2))
  config.file(
    'positions.json',
    JSON.stringify(
      {
        generator: 'LABSEVE7 Map Studio',
        project: project.name,
        exportedAt: new Date().toISOString(),
        world: doc.world,
        texture: { width: doc.baseMap.width, height: doc.baseMap.height },
        ...data,
      },
      null,
      2,
    ),
  )
  // Strip heavy inline images from the embedded project to keep the ZIP lean.
  const lean: MapDocument = {
    ...doc,
    baseMap: { ...doc.baseMap, src: doc.baseMap.src.startsWith('data:') ? '' : doc.baseMap.src },
    elements: doc.elements.map((e): MapElement => (e.type === 'image' && e.src.startsWith('data:') ? { ...e, src: '' } : e)),
  }
  config.file('project.json', JSON.stringify({ ...project, document: lean }, null, 2))

  if (opts.includeTextures) {
    progress(20, 'Rendering minimap texture')
    const full = await renderDocument(doc)
    const stream = root.folder('stream')!
    stream.file('minimap_full.png', await canvasToBlob(full, 'image/png'))
    stream.file('README.txt', streamReadme(opts.tileColumns, opts.tileRows))

    if (opts.splitTiles) {
      const cols = Math.max(1, opts.tileColumns)
      const rows = Math.max(1, opts.tileRows)
      const tw = Math.floor(full.width / cols)
      const th = Math.floor(full.height / rows)
      let i = 0
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const t = document.createElement('canvas')
          t.width = tw
          t.height = th
          t.getContext('2d')!.drawImage(full, c * tw, r * th, tw, th, 0, 0, tw, th)
          // Vanilla naming is minimap_sea_<row>_<col> (2 columns × 3 rows in the base game).
          stream.file(`minimap_sea_${r}_${c}.png`, await canvasToBlob(t, 'image/png'))
          i++
          progress(20 + Math.round((i / (cols * rows)) * 50), `Slicing tile ${i}/${cols * rows}`)
        }
      }
    }
  }

  if (opts.includeHtml) {
    progress(75, 'Rendering NUI overlay')
    const overlay = await renderDocument(doc, { overlayOnly: true, maxWidth: 1024 })
    const fx = overlayFxOf(doc)
    const html = root.folder('html')!
    html.file('index.html', overlayIndexHtml(fx))
    html.file('style.css', `${htmlCssBase}\n${overlayFxCss}`)
    html.file('script.js', `${htmlJs}\n${overlayFxDriverJs}`)
    html.file('overlay.png', await canvasToBlob(overlay, 'image/png'))
  }

  progress(90, 'Compressing ZIP')
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })
  progress(100, 'Done')
  return blob
}
