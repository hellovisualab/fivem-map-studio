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

- a single composited image (any file name; `.png`, `.jpg`, `.webp` or `.dds`), **or**
- a single composited image (any file name; `.png`, `.jpg`, `.webp` or `.dds`),
- a **ZIP** containing the image or the tiles (unpacked in the browser), or
- the tile set exported from the game, e.g. `minimap_sea_0_0.dds` … `minimap_sea_2_1.dds`
  (six 4096² tiles laid out as 2 columns × 3 rows). Any `name_A_B.ext` pattern is accepted;
  whether `A` is the row or the column is detected automatically by matching the tile seams.
  PNG and DDS (DXT1 / DXT3 / DXT5, the formats OpenIV exports) keep the transparent sea.

Uploading through the GitHub web UI works: open the folder → **Add file → Upload files**.
If you have a ZIP, extract it first and upload its images (GitHub does not unpack ZIPs).

## How it is wired

`npm run build` (and `npm run dev`) first runs `scripts/build-maps.mjs`. Raw game exports
are far too heavy for the browser (six DXT5 tiles ≈ 100 MB per map), so the script decodes
the DDS/PNG tiles in Node, detects the grid layout, stitches and downsamples them to a
4096 px editor texture plus a 1024 px preview, and writes them as WebP into
`public/maps/_generated/` (PNG when `sharp` is unavailable). `public/maps/manifest.json`
points the app at those files, so the browser downloads one ~2 MB image per preset
instead of the raw tiles. Both outputs are git-ignored and regenerated on every deploy.

Without a manifest (e.g. a static copy of `dist/` built without the script) the app falls
back to probing `full.*` / `minimap.*` / `minimap_sea_X_Y.*` inside each folder and
stitching in the browser.

The legacy single-file convention `public/maps/<preset>.jpg` (`color.jpg`, `original.jpg`,
`satellite.jpg`, `realmap.jpg`, `realmapdown.jpg`) still works.

## Getting a composited image from the game files

1. Open `x64a.rpf` (or the update RPFs) in **OpenIV** and locate `minimap.ytd` /
   `minimap_sea_*.ytd`.
2. Export the tiles as DDS or PNG and copy them into the matching folder above.
3. Push / redeploy. The preset card shows the real texture with its size and tile count.

Community-made variants (satellite, colored, "down" versions, etc.) work the same way as
long as you have the rights to use them on your server.
