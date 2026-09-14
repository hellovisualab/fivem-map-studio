// Tile-grid helpers shared by the build script and the browser importer.
//
// Tile sets are named `<name>_<a>_<b>.<ext>`. Whether `a` is the column or the
// row differs between tools: GTA V's own minimap tiles (minimap_sea_0_0 …
// minimap_sea_2_1) are `<row>_<col>` (2 columns × 3 rows, portrait), while most
// generic slicers emit `<col>_<row>`. We detect the layout by comparing the
// pixels along shared tile edges and only fall back to the naming convention
// when the edges carry no information (e.g. fully transparent sea).

export const TILE_RE = /(\d+)[_-](\d+)\.(png|jpe?g|webp|dds)$/i

/** Parses `_a_b.ext` from a file name. */
export function parseTileIndex(name) {
  const m = TILE_RE.exec(name)
  return m ? { a: Number(m[1]), b: Number(m[2]) } : null
}

/** Average RGB distance between two RGBA edge strips, ignoring translucent pixels. */
export function edgeDiff(e1, e2) {
  const n = Math.min(e1.length, e2.length) / 4
  let sum = 0
  let count = 0
  for (let i = 0; i < n; i++) {
    const o = i * 4
    if (e1[o + 3] < 200 || e2[o + 3] < 200) continue
    sum += Math.abs(e1[o] - e2[o]) + Math.abs(e1[o + 1] - e2[o + 1]) + Math.abs(e1[o + 2] - e2[o + 2])
    count++
  }
  // Require a minimum overlap so a handful of stray pixels cannot decide.
  return count >= Math.max(8, n * 0.02) ? sum / count : null
}

/**
 * Decides whether the first index of `_a_b` is the column (`col_row`) or the
 * row (`row_col`).
 *
 * @param tiles   Array of `{ a, b, name }`.
 * @param edgesOf `(tile) => { left, right, top, bottom }` RGBA strips of equal length.
 */
export function detectOrientation(tiles, edgesOf) {
  const byKey = new Map(tiles.map((t) => [`${t.a}_${t.b}`, t]))
  const cache = new Map()
  const edges = (t) => {
    if (!cache.has(t)) cache.set(t, edgesOf(t))
    return cache.get(t)
  }

  let colRow = 0 // votes for a = column, b = row
  let rowCol = 0 // votes for a = row, b = column
  // Each neighbouring pair votes once. A hypothesis whose shared edge has no
  // opaque overlap at all (diff === null) loses outright: tiles that really
  // touch always share some content along the seam.
  const vote = (ifColRow, ifRowCol) => {
    if (ifColRow == null && ifRowCol == null) return
    if (ifColRow == null) rowCol++
    else if (ifRowCol == null) colRow++
    else if (ifColRow < ifRowCol) colRow++
    else if (ifRowCol < ifColRow) rowCol++
  }

  for (const t of tiles) {
    const nextB = byKey.get(`${t.a}_${t.b + 1}`)
    if (nextB) {
      const e1 = edges(t)
      const e2 = edges(nextB)
      // If b is the row, nextB sits below t; if b is the column, it sits to the right.
      vote(edgeDiff(e1.bottom, e2.top), edgeDiff(e1.right, e2.left))
    }
    const nextA = byKey.get(`${t.a + 1}_${t.b}`)
    if (nextA) {
      const e1 = edges(t)
      const e2 = edges(nextA)
      vote(edgeDiff(e1.right, e2.left), edgeDiff(e1.bottom, e2.top))
    }
  }

  if (colRow !== rowCol) return colRow > rowCol ? 'col_row' : 'row_col'
  // No usable evidence: fall back to the naming convention.
  const gtaStyle = tiles.some((t) => /minimap/i.test(t.name ?? ''))
  return gtaStyle ? 'row_col' : 'col_row'
}

/** Maps tiles to grid positions given an orientation. Returns { cols, rows, placed }. */
export function layoutTiles(tiles, orientation) {
  const placed = tiles.map((t) => ({
    ...t,
    col: orientation === 'col_row' ? t.a : t.b,
    row: orientation === 'col_row' ? t.b : t.a,
  }))
  const minCol = Math.min(...placed.map((p) => p.col))
  const minRow = Math.min(...placed.map((p) => p.row))
  for (const p of placed) {
    p.col -= minCol
    p.row -= minRow
  }
  return {
    cols: Math.max(...placed.map((p) => p.col)) + 1,
    rows: Math.max(...placed.map((p) => p.row)) + 1,
    placed,
  }
}
