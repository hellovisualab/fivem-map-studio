# LABSEVE7 Tools

A visual minimap editor for FiveM (GTA V) servers. Design custom minimaps in the browser — zones, labels, images and markers — then export a drop-in FiveM resource as a ZIP.

![stack](https://img.shields.io/badge/React_19-TypeScript-blue) ![tailwind](https://img.shields.io/badge/TailwindCSS_4-38bdf8) ![konva](https://img.shields.io/badge/Konva-canvas-orange) ![supabase](https://img.shields.io/badge/Supabase-auth_%2B_db_%2B_storage-3ecf8e)

## Features

- **Landing page** with hero, feature grid and Free / Supporter plan cards
- **Auth & dashboard** – register / login, saved projects with thumbnails, activity history, plan & storage usage
- **Project creator** – name your project, choose a base map preset (GTA V Color, Original, Satellite, Real Map) or upload your own
- **Cayo Perico** – optionally add the heist island south-east of Los Santos (on project creation or later under *Map settings → Islands*). The canvas grows to include a stylized island in your map's colors; zones, markers and labels drawn on it export with real GTA coordinates, and the resource streams the island in-game (game build 2189+)
- **Canvas editor (Konva)** – zoom (wheel / pinch), pan (hand tool, space-drag, middle mouse), optional grid, live pixel + GTA world coordinates
- **Tools** – select, move, text, image, rectangle zone, line, polygon zone, marker, paint color, undo / redo, delete
- **Layers panel** – show/hide, lock, drag to reorder, bring forward / send backward, search
- **Map styles & effects (Photoshop-like)**
  - One-click style presets: Clean, Neon Purple, Inferno, Blood, Ice, Miami, Gold, Noir, Toxic
  - Color grading: brightness, contrast, saturation, hue shift, grayscale, invert
  - Color tint and two-color gradient overlay, each with a blend mode (multiply, overlay, screen, soft light, color…)
  - Outer glow / aura around the island silhouette, with color, size, density and opacity
  - Sea removal by color key for opaque textures, and transparent background for alpha exports
  - Per-element effects: blend mode, drop shadow / glow, and **clip to map shape** (flags, textures and zones masked to the island)
- **Radar overlay effects** – neon glow, radar sweep, sonar ping, scanlines, pulse, heartbeat (ECG), breathe, glass shine, vignette, hue cycle, flicker and glitch on the minimap, the expanded radar and the full-screen pause-menu blip map, previewed on in-game mock-ups of each and exported as a NUI page that follows whichever map is on screen
- **Elements**
  - Text: content, size, 20 fonts (Bebas Neue, Anton, Bangers, Permanent Marker, Great Vibes, Cinzel…), style, letter spacing, uppercase, color, outline, shadow, rotation, quick styles
  - Zones: gang / police / safe / custom with color, transparency, border, name, description
  - Images: PNG / JPG / WebP with scale, rotate, move
  - Lines: width, dashed, arrow head
  - Markers: police, hospital, bank, shop, garage, custom icon → mapped to FiveM blip sprites
- **Export FiveM Resource** – generates `fxmanifest.lua`, `client.lua`, `server.lua`, `config/` (Lua + JSON positions in world coordinates), `stream/` (full texture + 2×3 `minimap_sea_R_C.png` tiles named like the vanilla textures) and an optional `html/` NUI page that animates the chosen effects over the in-game minimap, expanded radar and pause-menu map, zipped for download
- **Import** – PNG / JPG / WebP / DDS (DXT1/3/5 decoded in-browser) frames, split tiles (`*_X_Y.*` auto-stitched) and ZIP archives
- **Autosave** on every change (debounced), `Ctrl+S` manual save, `beforeunload` guard
- **Plans** – Free (1 export / day) and Supporter (unlimited); limits enforced in the export dialog
- **Responsive** – desktop side panels, tablet toggles, mobile horizontal toolbar with bottom sheets

## Keyboard shortcuts

| Keys | Action |
| --- | --- |
| `V` `H` `T` `I` `Z` `L` `P` `M` `C` | Select · Move · Text · Image · Zone · Line · Polygon · Marker · Paint |
| `Ctrl+Z` / `Ctrl+Shift+Z` (`Ctrl+Y`) | Undo / Redo |
| `Ctrl+S` | Save |
| `Ctrl+D` | Duplicate selection |
| `Ctrl+A` | Select all |
| `Ctrl+E` | Export |
| `Delete` / `Backspace` | Delete selection |
| `Esc` | Cancel drawing / clear selection |
| `Enter` | Finish polygon or line |
| `G` | Toggle grid |
| `+` / `-` / `Ctrl+0` / `Shift+1` | Zoom in / out / 100% / fit |
| `[` / `]` (`Shift` = to back / front) | Reorder layer |
| Arrow keys (`Shift` = 10px) | Nudge selection |
| `Space` + drag / middle mouse | Pan |

## Getting started

```bash
npm install
npm run dev
```

Open <http://localhost:5173>. Without Supabase credentials the app runs in **local mode**: accounts, projects and images are stored in the browser (IndexedDB), so everything works offline out of the box.

### Connecting Supabase

1. Create a Supabase project and run [`supabase/schema.sql`](supabase/schema.sql) in the SQL editor.
2. Create a **public** storage bucket named `assets`.
3. Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. Restart `npm run dev`. The status bar will show "Supabase" instead of "Local storage".

Auth uses Supabase email/password; enable it in *Authentication → Providers*. Disable "Confirm email" while developing if you want instant sign-in.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Type-check and build for production (`dist/`) |
| `npm run preview` | Preview the production build |
| `npm run lint` | Run oxlint |

## Project structure

```
src/
├─ components/
│  ├─ editor/      MapCanvas (Konva), Toolbar, LayersPanel, PropertiesPanel, TopBar, StatusBar, Export/Import dialogs
│  ├─ landing/     Hero backdrop
│  ├─ layout/      Navbar
│  └─ ui/          Button, Modal, Toast, Logo
├─ hooks/          useShortcuts
├─ lib/
│  ├─ data/        DataService interface + Supabase and IndexedDB implementations
│  ├─ basemaps.ts  Procedural base-map presets (rendered in-browser, no external assets)
│  ├─ exporter.ts  FiveM resource ZIP generator
│  ├─ importer.ts  PNG / tiles / ZIP import & stitching
│  ├─ render.ts    2D renderer used for textures and thumbnails
│  └─ geometry.ts  Pixel ⇄ GTA world coordinate conversion
├─ pages/          Landing, Auth, Dashboard, NewProject, Editor
├─ store/          Zustand stores (auth, editor document + history)
└─ types.ts        Document model
```

## Exported resource layout

```
<name>/
├─ fxmanifest.lua
├─ client.lua            zone + marker blips, map overlay driver, /minimapoverlay
├─ server.lua
├─ config/
│  ├─ config.lua         Config.Zones / Config.Markers / Config.Labels (vector2/vector3)
│  ├─ zones.json · markers.json · labels.json · positions.json
│  └─ project.json       re-importable studio project
├─ stream/
│  ├─ minimap_full.png
│  ├─ minimap_sea_0_0.png … minimap_sea_2_1.png
│  ├─ cayo_perico.png    only when the project includes Cayo Perico
│  └─ README.txt         how to pack each PNG into its minimap_sea_R_C.ytd with OpenIV
└─ html/                 optional map overlay: index.html · overlay.js · script.js · style.css
```

Browsers cannot write `.ytd` texture dictionaries, so the exporter ships ready-to-pack PNG tiles plus instructions.

Pixel ↔ world conversion uses the vanilla minimap grid from `minimap.ymt`: six 4500-unit tiles starting at X −4140 / Y 8400, i.e. X −4140…4860 and Y −5100…8400 (editable per project under *World bounds*). Projects saved with the old approximate bounds are migrated automatically when opened.

### Radar overlay

The effects are painted by one plain-JS runtime (`src/lib/overlayRuntime.js`) that both the editor preview and the exported `html/overlay.js` run, so the preview matches the game. They play on three maps, each switchable in the editor (*Plays on*) and in `Config.Overlay` (`Radar`, `Bigmap`, `PauseMap`):

- **Minimap** – the radar in the bottom-left corner (size as measured by [fivem-minimap-anchor](https://github.com/glitchdetector/fivem-minimap-anchor)).
- **Expanded radar** – the bigger radar shown while `IsBigmapActive` (Z in GTA Online; size as used by [Boost-DynamicHud](https://github.com/boostless/Boost-DynamicHud)).
- **Pause map** – the full-screen blip map on the pause menu's MAP tab. Where the game reports the map page's context (`MAP_CanZoom`) the effects hide on the other tabs; otherwise they stay while the pause menu is open.

Every 150 ms `client.lua` works out which map is on screen, computes its rectangle from the screen resolution and safe zone (on screens wider than 16:9 the HUD stays in a centred 16:9 area) and sends it to the NUI page, which draws the effects on a canvas right over that map at 30 fps. The overlay hides with a hidden HUD or radar, player switches and screen fades, and can be toggled per player with `/minimapoverlay`. Everything is configurable in `Config.Overlay` (maps, effects, intensity, speed, color, and an `Adjust` offset for servers that move the radar). The NUI page draws on top of the game's maps; it cannot recolour the map pixels themselves.

### Cayo Perico

The island lies outside the `minimap_sea` grid, so the game shows it with its own island map. When a project includes Cayo Perico the export adds `Config.CayoPerico` and a client thread that, within 2000 m of the island, calls `SET_ISLAND_ENABLED("HeistIsland")` and `SET_USE_ISLAND_MAP` (the same switch GTA Online uses). The `minimap_sea` tiles contain only Los Santos; your island design goes to `stream/cayo_perico.png`, and island zones / markers become blips tagged `region = "cayo_perico"`. The server needs `sv_enforceGameBuild 2189` (or newer) in `server.cfg`.

## Notes

- Base map presets are generated procedurally at runtime (stylized San Andreas silhouette) to avoid shipping copyrighted Rockstar textures. To use the **real GTA V maps**, drop your own textures (a single image or the `minimap_sea_*.dds` / `.png` tiles exported from OpenIV) into `public/maps/Color/`, `original/`, `satellite/`, `real-map/`, `real-map-down/` — the build decodes, stitches and optimizes them, and they replace the stylized presets automatically. See [`public/maps/README.md`](public/maps/README.md) for details, or upload a minimap per project via *Custom Upload*.
- Payments are not wired up; the Supporter upgrade in the dashboard simulates a successful checkout so the plan logic can be tested.
- LABSEVE7 Map Studio is a community tool and is not affiliated with Rockstar Games or Cfx.re.
