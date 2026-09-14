# Real base-map textures

FiveM Map Studio ships with **stylized, procedurally generated** presets because the
original GTA V minimap textures are copyrighted by Rockstar Games and cannot be
redistributed with this project.

To use the real maps, drop your own textures in this folder. They are picked up
automatically (no code changes) by the project creator, the editor and the landing page:

| File                     | Preset             |
| ------------------------ | ------------------ |
| `color.jpg`              | GTA V Color Map    |
| `original.jpg`           | Original Map       |
| `satellite.jpg`          | Satellite          |
| `realmap.jpg`            | Real Map           |

`.png` and `.webp` are accepted too (`color.png`, `color.webp`, …). A single
composited image per preset is expected (portrait, roughly 3:4, e.g. 3072×4096 or
6144×8192). Larger images are fine; the editor scales them for display.

## Getting a composited image from the game files

1. Open `x64a.rpf` (or the update RPFs) in **OpenIV** and locate
   `minimap.ytd` / `minimap_sea_*.ytd` textures.
2. Export the tiles as PNG (`minimap_sea_0_0.png` … `minimap_sea_2_3.png`).
3. Either stitch them yourself, or open FiveM Map Studio → **Import minimap** and drop
   all tiles: the app stitches them into one image. Right-click the preview to save it,
   or export the project and take `stream/minimap_full.png` from the ZIP.
4. Save the result here with the preset name, redeploy, and the preset shows the real map.

Community-made variants (satellite, colored, "Cayo Perico" etc.) work the same way as
long as you have the rights to use them on your server.

After adding textures, redeploy (Vercel/Netlify rebuild) so the files are published.
