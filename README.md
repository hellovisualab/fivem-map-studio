# FiveM Map Studio

A visual minimap editor for FiveM (GTA V) servers. Design custom minimaps in the browser — zones, labels, images and markers — then export a drop-in FiveM resource as a ZIP.

![stack](https://img.shields.io/badge/React_19-TypeScript-blue) ![tailwind](https://img.shields.io/badge/TailwindCSS_4-38bdf8) ![konva](https://img.shields.io/badge/Konva-canvas-orange) ![supabase](https://img.shields.io/badge/Supabase-auth_%2B_db_%2B_storage-3ecf8e)

## Features

- **Landing page** with hero, feature grid and Free / Supporter plan cards
- **Auth & dashboard** – register / login, saved projects with thumbnails, activity history, plan & storage usage
- **Project creator** – name your project, choose a base map preset (GTA V Color, Original, Satellite, Real Map) or upload your own
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
- **Elements**
  - Text: content, size, 20 fonts (Bebas Neue, Anton, Bangers, Permanent Marker, Great Vibes, Cinzel…), style, letter spacing, uppercase, color, outline, shadow, rotation, quick styles
  - Zones: gang / police / safe / custom with color, transparency, border, name, description
  - Images: PNG / JPG / WebP with scale, rotate, move
  - Lines: width, dashed, arrow head
  - Markers: police, hospital, bank, shop, garage, custom icon → mapped to FiveM blip sprites
- **Export FiveM Resource** – generates `fxmanifest.lua`, `client.lua`, `server.lua`, `config/` (Lua + JSON positions in world coordinates), `stream/` (full texture + 3×4 `minimap_sea_X_Y.png` tiles) and an optional `html/` NUI overlay, zipped for download
- **Import** – PNG / JPG / WebP frames, split tiles (`*_X_Y.png` auto-stitched) and ZIP archives
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
├─ client.lua            zone + marker blips, minimap aspect fixes, /minimapoverlay
├─ server.lua
├─ config/
│  ├─ config.lua         Config.Zones / Config.Markers / Config.Labels (vector2/vector3)
│  ├─ zones.json · markers.json · labels.json · positions.json
│  └─ project.json       re-importable studio project
├─ stream/
│  ├─ minimap_full.png
│  ├─ minimap_sea_0_0.png … minimap_sea_2_3.png
│  └─ README.txt         how to pack the PNGs into minimap.ytd with OpenIV
└─ html/                 optional NUI overlay
```

Browsers cannot write `.ytd` texture dictionaries, so the exporter ships ready-to-pack PNG tiles plus instructions.

## Notes

- Base map presets are generated procedurally at runtime (stylized San Andreas silhouette) to avoid shipping copyrighted Rockstar textures. To use the **real GTA V maps**, drop your own textures (a single image or `minimap_sea_X_Y.png` tiles) into `public/maps/Color/`, `original/`, `satellite/`, `real-map/`, `real-map-down/` — the build indexes them and they replace the stylized presets automatically. See [`public/maps/README.md`](public/maps/README.md) for details, or upload a minimap per project via *Custom Upload*.
- Payments are not wired up; the Supporter upgrade in the dashboard simulates a successful checkout so the plan logic can be tested.
- FiveM Map Studio is a community tool and is not affiliated with Rockstar Games or Cfx.re.
