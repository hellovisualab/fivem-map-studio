import JSZip from 'jszip'
import type { MapDocument, MapElement, Project } from '@/types'
import { absolutePoints, canvasToWorld, polygonCentroid } from './geometry'
import { canvasToBlob, renderDocument } from './render'
import { CAYO_PERICO, isInCayo } from './cayo'
import { mapFrame, type PixelRect } from './mapFrame'
import { overlayFxOf } from './overlayFx'
import { nuiIndexHtml, nuiOverlayJs, nuiScriptJs, nuiStyleCss } from './overlayNui'
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

/** Which island a position belongs to; only set when the project includes Cayo Perico. */
type Region = 'los_santos' | 'cayo_perico'

interface ZoneOut {
  id: string
  region?: Region
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
  region?: Region
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
  region?: Region
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

/** World position an element is anchored at (its centre for shapes and images). */
function elementAnchor(el: MapElement, doc: MapDocument) {
  if (el.type === 'zone' || el.type === 'line') {
    const c = polygonCentroid(absolutePoints(el))
    return canvasToWorld(c.x, c.y, doc)
  }
  if (el.type === 'image') return canvasToWorld(el.x + el.width / 2, el.y + el.height / 2, doc)
  return canvasToWorld(el.x, el.y, doc)
}

/** True for elements designed on Cayo Perico (only when the project includes the island). */
const isCayoElement = (el: MapElement, doc: MapDocument) => {
  if (!doc.cayoPerico) return false
  const w = elementAnchor(el, doc)
  return isInCayo(w.x, w.y)
}

export function buildPositions(doc: MapDocument) {
  // Same test the tile export uses, so an element is never tagged one island and drawn on the other.
  const regionOf = (el: MapElement): Region | undefined => (doc.cayoPerico ? (isCayoElement(el, doc) ? 'cayo_perico' : 'los_santos') : undefined)
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
          region: regionOf(el),
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
          region: regionOf(el),
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
          region: regionOf(el),
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
    'html/overlay.js',
    'html/script.js',
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

function configLua(doc: MapDocument, data: ReturnType<typeof buildPositions>, opts: ExportOptions) {
  const fx = overlayFxOf(doc)
  const zones = data.zones
    .map(
      (z) => `    {
        id = ${luaStr(z.id)},${z.region ? `\n        region = ${luaStr(z.region)},` : ''}
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
        id = ${luaStr(m.id)},${m.region ? `\n        region = ${luaStr(m.region)},` : ''}
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
      (l) =>
        `    { text = ${luaStr(l.text)}, coords = vector2(${l.position.x}, ${l.position.y}), size = ${l.size}, color = ${luaStr(l.color)}${l.region ? `, region = ${luaStr(l.region)}` : ''} }`,
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
${
  opts.includeHtml
    ? `
-- Animated effects drawn over the radar by html/ (NUI). The overlay follows the radar
-- on any resolution, safe zone and aspect ratio, and hides with the pause menu, the
-- expanded map or a hidden HUD. Players toggle it with /${OVERLAY_COMMAND} (remembered).
Config.Overlay = {
    Enabled = true,
    Command = ${luaStr(OVERLAY_COMMAND)},
    -- glow, radar, ripple, scanlines, pulse, heartbeat, breathe, shimmer, vignette, hue, flicker, glitch
    Effects = { ${fx.ids.map(luaStr).join(', ')} },
    Intensity = ${fx.intensity.toFixed(2)}, -- 0.0 - 1.0
    Speed = ${fx.speed.toFixed(2)}, -- 0.25 - 3.0
    Color = ${luaStr(fx.color)},
    -- Nudge the overlay if another resource moves or resizes the radar (fractions of the screen).
    Adjust = { x = 0.0, y = 0.0, width = 0.0, height = 0.0 }
}
`
    : ''
}${
  doc.cayoPerico
    ? `
-- Cayo Perico island. Needs sv_enforceGameBuild ${CAYO_PERICO.minGameBuild} or newer in server.cfg.
-- Within LoadDistance of Center the island is streamed and the radar / pause map
-- switch to the island map, like GTA Online does.
Config.CayoPerico = {
    Enabled = true,
    Center = vector3(${CAYO_PERICO.center.x}, ${CAYO_PERICO.center.y}, ${CAYO_PERICO.center.z.toFixed(1)}),
    LoadDistance = ${CAYO_PERICO.loadDistance.toFixed(1)}
}
`
    : ''
}
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

function clientLua(opts: ExportOptions, doc: MapDocument) {
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

-- The radar keeps its vanilla size and position: the minimap_sea_R_C.ytd files in
-- stream/ replace its textures one to one.
CreateThread(function()
    createZoneBlips()
    createMarkerBlips()
end)
${
  doc.cayoPerico
    ? `
-- Cayo Perico: streams the island and switches the radar / pause map to the island
-- map while the player is near it (Config.CayoPerico).
CreateThread(function()
    local cayo = Config.CayoPerico
    if not cayo or not cayo.Enabled then return end
    if GetGameBuildNumber() < ${CAYO_PERICO.minGameBuild} then
        print(("[%s] Cayo Perico needs sv_enforceGameBuild ${CAYO_PERICO.minGameBuild} or newer in server.cfg"):format(GetCurrentResourceName()))
        return
    end
    local loaded = nil
    while true do
        local near = #(GetEntityCoords(PlayerPedId()) - cayo.Center) < cayo.LoadDistance
        if near ~= loaded then
            loaded = near
            Citizen.InvokeNative(0x9A9D1BA639675CF1, "HeistIsland", near) -- SET_ISLAND_ENABLED: island map data
            Citizen.InvokeNative(0x5E1460624D194A38, near) -- SET_USE_ISLAND_MAP: radar and pause map
        end
        Wait(2000)
    end
end)
`
    : ''
}
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
${opts.includeHtml ? overlayLua : ''}
-- Exports for other resources
exports("GetZones", function() return Config.Zones end)
exports("GetMarkers", function() return Config.Markers end)
-- Even-odd ray cast so polygon and rotated zones match their real shape.
local function pointInPolygon(x, y, poly)
    local inside, j = false, #poly
    for i = 1, #poly do
        local a, b = poly[i], poly[j]
        if (a.y > y) ~= (b.y > y) and x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x then
            inside = not inside
        end
        j = i
    end
    return inside
end

exports("GetZoneAt", function(x, y)
    for _, zone in ipairs(Config.Zones) do
        local hx, hy = zone.size.x / 2, zone.size.y / 2
        if x >= zone.center.x - hx and x <= zone.center.x + hx and y >= zone.center.y - hy and y <= zone.center.y + hy then
            if not zone.polygon or #zone.polygon < 3 or pointInPolygon(x, y, zone.polygon) then
                return zone
            end
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

const OVERLAY_COMMAND = 'minimapoverlay'

/** Keeps the NUI effects canvas over the radar (see overlayNui.ts for the page side). */
const overlayLua = `
-- Animated overlay (html/): the NUI page paints Config.Overlay.Effects over the radar.
local overlay = { ready = false, enabled = false }

-- Screen rectangle of the vanilla radar (0-1). Size measured by glitchdetector
-- (fivem-minimap-anchor): width = screen height / 4, height = screen height / 5.674,
-- inset by the safe zone (5% per 0.1 below 1.0). Wider than 16:9, the HUD stays
-- inside a centred 16:9 area.
local function minimapRect()
    local resX, resY = GetActiveScreenResolution()
    local margin = (1.0 - GetSafeZoneSize()) * 0.5
    local hudW = math.min(resX, resY * 16.0 / 9.0)
    local hudX = (resX - hudW) / 2.0
    local w, h = resY / 4.0, resY / 5.674
    local adjust = Config.Overlay.Adjust or {}
    return {
        x = (hudX + hudW * margin) / resX + (adjust.x or 0.0),
        y = (resY * (1.0 - margin) - h) / resY + (adjust.y or 0.0),
        w = w / resX + (adjust.width or 0.0),
        h = h / resY + (adjust.height or 0.0)
    }
end

local function isOn(native)
    return native ~= nil and native() == true
end

-- Only while the radar itself is on screen.
local function overlayVisible()
    return overlay.enabled
        and not isOn(IsPauseMenuActive)
        and not isOn(IsRadarHidden)
        and not isOn(IsHudHidden)
        and not isOn(IsBigmapActive)
        and not isOn(IsPlayerSwitchInProgress)
        and not isOn(IsScreenFadedOut)
end

local function sendOverlayConfig()
    SendNUIMessage({
        action = "fx:config",
        fx = {
            ids = Config.Overlay.Effects,
            intensity = Config.Overlay.Intensity,
            speed = Config.Overlay.Speed,
            color = Config.Overlay.Color
        }
    })
end

local lastLayout, lastSend = nil, 0

RegisterNUICallback("fxReady", function(_, cb)
    overlay.ready = true
    lastLayout = nil
    sendOverlayConfig()
    cb("ok")
end)

RegisterCommand(Config.Overlay.Command, function()
    overlay.enabled = not overlay.enabled
    SetResourceKvp("overlay", overlay.enabled and "on" or "off")
end, false)

CreateThread(function()
    overlay.enabled = Config.Overlay.Enabled and GetResourceKvpString("overlay") ~= "off"
    TriggerEvent("chat:addSuggestion", "/" .. Config.Overlay.Command, "Toggle the animated minimap overlay")
    while true do
        local visible = overlayVisible()
        local rect = visible and minimapRect() or nil
        local key = rect and string.format("%.4f %.4f %.4f %.4f", rect.x, rect.y, rect.w, rect.h) or "hidden"
        -- Until the page has answered, keep re-sending: messages sent before it loads are lost.
        if key ~= lastLayout or (not overlay.ready and GetGameTimer() - lastSend > 2000) then
            if not overlay.ready then sendOverlayConfig() end
            SendNUIMessage({ action = "fx:layout", visible = visible, rect = rect })
            lastLayout, lastSend = key, GetGameTimer()
        end
        Wait(200)
    end
end)
`

const streamReadme = (cols: number, rows: number, cayo: boolean) => `HOW TO USE THESE TEXTURES
=========================

FiveM streams minimap textures from a .ytd texture dictionary. Browsers cannot
write .ytd files, so this folder contains ready-to-pack PNGs:

  minimap_full.png             full composited minimap (reference / NUI use)
  minimap_sea_R_C.png          ${cols} columns x ${rows} rows (R = row, C = column), same naming as the vanilla textures

The game loads each minimap tile from its own texture dictionary, so every PNG
becomes one .ytd with the same name (minimap_sea_0_0.png -> minimap_sea_0_0.ytd).

Steps:
  1. Open OpenIV (or CodeWalker) and, for each minimap_sea_R_C.png, create a texture
     dictionary named minimap_sea_R_C.ytd
  2. Import the matching PNG into it, keeping the file name as the texture name
     (minimap_sea_R_C) - DXT5 / BC3 keeps the transparent sea
  3. Save the ${cols * rows} .ytd files inside this stream/ folder and delete the PNGs
  4. Restart the resource: ensure ${'<resource>'} in server.cfg

The tiles have the vanilla layout, so the radar keeps its normal size and position.
${
  cayo
    ? `
CAYO PERICO
  cayo_perico.png              your design over the island (reference / NUI use)

Cayo Perico lies outside the vanilla minimap_sea grid: the game draws it with its own
island map, which client.lua switches on near the island. The minimap_sea tiles above
therefore only contain Los Santos; zones and markers on the island still become blips.
`
    : ''
}`

const readme = (name: string, project: Project, overlay: boolean) => `# ${name}

Generated with **LABSEVE7 Map Studio** from project "${project.name}".

## Install
1. Drop the \`${name}\` folder into your server's \`resources/\` directory
2. Add \`ensure ${name}\` to \`server.cfg\`
3. (Optional) Convert each \`stream/minimap_sea_R_C.png\` into its own \`minimap_sea_R_C.ytd\` – see \`stream/README.txt\`
${
  project.document.cayoPerico
    ? `4. Cayo Perico ships with game build ${CAYO_PERICO.minGameBuild}: add \`sv_enforceGameBuild ${CAYO_PERICO.minGameBuild}\` (or newer) to \`server.cfg\`

## Cayo Perico
Near the island (\`Config.CayoPerico\` in \`config/config.lua\`) the resource streams it and
switches the radar / pause map to the island map. Zones, markers and labels you placed on it
are exported with real GTA coordinates and tagged \`region = "cayo_perico"\`.
`
    : ''
}
## Contents
- \`fxmanifest.lua\` – resource manifest
- \`client.lua\` – creates zone/marker blips${overlay ? ' and keeps the animated overlay on the radar' : ''}
- \`config/config.lua\` – all zones, markers and labels in GTA world coordinates
- \`config/*.json\` – the same data as JSON for other tools
- \`config/project.json\` – full studio project (re-import it in LABSEVE7 Map Studio)
- \`stream/\` – minimap textures
${overlay ? `- \`html/\` – animated effects drawn over the radar (\`Config.Overlay\`, toggle with /${OVERLAY_COMMAND})\n` : ''}
`

/** Copies a rectangle (document pixels, clamped to the canvas) into a new canvas. */
function crop(source: HTMLCanvasElement, r: PixelRect) {
  const x = Math.max(0, Math.floor(r.x))
  const y = Math.max(0, Math.floor(r.y))
  const w = Math.max(1, Math.min(source.width, Math.ceil(r.x + r.width)) - x)
  const h = Math.max(1, Math.min(source.height, Math.ceil(r.y + r.height)) - y)
  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  out.getContext('2d')!.drawImage(source, x, y, w, h, 0, 0, w, h)
  return out
}

export async function exportFiveMResource(project: Project, opts: ExportOptions): Promise<Blob> {
  const doc = project.document
  const progress = (p: number, l: string) => opts.onProgress?.(p, l)
  const name = slugify(opts.resourceName || `${project.name}_minimap`)
  const zip = new JSZip()
  const root = zip.folder(name)!

  progress(5, 'Collecting positions')
  const data = buildPositions(doc)
  const frame = mapFrame(doc)

  root.file('fxmanifest.lua', fxmanifest(name, opts))
  root.file('client.lua', clientLua(opts, doc))
  root.file('server.lua', serverLua)
  root.file('README.md', readme(name, project, opts.includeHtml))

  const config = root.folder('config')!
  config.file('config.lua', configLua(doc, data, opts))
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
        ...(frame.cayo
          ? {
              canvas: { width: frame.width, height: frame.height, world: frame.world },
              cayoPerico: {
                center: CAYO_PERICO.center,
                loadDistance: CAYO_PERICO.loadDistance,
                minGameBuild: CAYO_PERICO.minGameBuild,
                bounds: CAYO_PERICO.bounds,
              },
            }
          : {}),
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
    stream.file('README.txt', streamReadme(opts.tileColumns, opts.tileRows, !!frame.cayo))

    // The minimap_sea grid only covers Los Santos (the game shows Cayo Perico with its own
    // island map), so the tiles come from a render without the island and its elements.
    let grid = full
    if (frame.cayo) {
      stream.file('cayo_perico.png', await canvasToBlob(crop(full, frame.cayo), 'image/png'))
      progress(30, 'Rendering Los Santos tiles')
      grid = await renderDocument({ ...doc, cayoPerico: false, elements: doc.elements.filter((e) => !isCayoElement(e, doc)) })
    }

    if (opts.splitTiles) {
      const cols = Math.max(1, opts.tileColumns)
      const rows = Math.max(1, opts.tileRows)
      const tw = Math.floor(grid.width / cols)
      const th = Math.floor(grid.height / rows)
      let i = 0
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const t = document.createElement('canvas')
          t.width = tw
          t.height = th
          t.getContext('2d')!.drawImage(grid, c * tw, r * th, tw, th, 0, 0, tw, th)
          // Vanilla naming is minimap_sea_<row>_<col> (2 columns × 3 rows in the base game).
          stream.file(`minimap_sea_${r}_${c}.png`, await canvasToBlob(t, 'image/png'))
          i++
          progress(20 + Math.round((i / (cols * rows)) * 50), `Slicing tile ${i}/${cols * rows}`)
        }
      }
    }
  }

  if (opts.includeHtml) {
    progress(80, 'Writing radar overlay')
    const html = root.folder('html')!
    html.file('index.html', nuiIndexHtml)
    html.file('style.css', nuiStyleCss)
    html.file('overlay.js', nuiOverlayJs)
    html.file('script.js', nuiScriptJs)
  }

  progress(90, 'Compressing ZIP')
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })
  progress(100, 'Done')
  return blob
}
