# Real base-map textures

FiveM Map Studio ships with **stylized, procedurally generated** presets because the
original GTA V minimap textures are copyrighted by Rockstar Games and cannot be
redistributed with this project.

To use the real maps, drop your own textures into these folders. They are picked up
automatically (no code changes) by the project creator, the editor, exports and the
landing page:

| Folder           | Preset          |
| ---------------- | --------------- |
| `Color/`         | GTA V Color Map |
| `original/`      | Original Map    |
| `satellite/`     | Satellite       |
| `real-map/`      | Real Map        |
| `real-map-down/` | Real Map Down   |

Inside each folder put **one of**:

- a single composited image (any file name; `.png`, `.jpg`, `.webp` or `.dds`),
- a **ZIP** containing the image or the tiles (unpacked in the browser), or
- the tile set exported from the game, e.g. `minimap_sea_0_0.png` … `minimap_sea_2_3.png`
  (3 columns × 4 rows). Any `name_X_Y.ext` pattern is accepted; tiles are stitched in the
  browser. PNG and DDS (DXT1 / DXT3 / DXT5, the formats OpenIV exports) keep the transparent sea.

Uploading through the GitHub web UI works: open the folder → **Add file → Upload files**.
If you have a ZIP, extract it first and upload its images (GitHub does not unpack ZIPs).

## How it is wired

`npm run build` (and `npm run dev`) first runs `scripts/maps-manifest.mjs`, which indexes
the images here into `public/maps/manifest.json`. The app reads that manifest, so no
directory listing is required on static hosts. Without a manifest the app falls back to
probing `full.*` / `minimap.*` / `minimap_sea_X_Y.*` inside each folder.

The legacy single-file convention `public/maps/<preset>.jpg` (`color.jpg`, `original.jpg`,
`satellite.jpg`, `realmap.jpg`, `realmapdown.jpg`) still works.

## Getting a composited image from the game files

1. Open `x64a.rpf` (or the update RPFs) in **OpenIV** and locate `minimap.ytd` /
   `minimap_sea_*.ytd`.
2. Export the tiles as PNG and copy them into the matching folder above.
3. Push / redeploy. The preset card shows the real texture with its size and tile count.

Community-made variants (satellite, colored, "down" versions, etc.) work the same way as
long as you have the rights to use them on your server.
