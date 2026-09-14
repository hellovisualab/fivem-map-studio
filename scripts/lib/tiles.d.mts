export const TILE_RE: RegExp

export interface TileIndex {
  a: number
  b: number
}

export interface TileEdges {
  left: ArrayLike<number>
  right: ArrayLike<number>
  top: ArrayLike<number>
  bottom: ArrayLike<number>
}

export type Orientation = 'col_row' | 'row_col'

export function parseTileIndex(name: string): TileIndex | null
export function edgeDiff(e1: ArrayLike<number>, e2: ArrayLike<number>): number | null
export function detectOrientation<T extends TileIndex & { name?: string }>(tiles: T[], edgesOf: (tile: T) => TileEdges): Orientation
export function layoutTiles<T extends TileIndex>(tiles: T[], orientation: Orientation): { cols: number; rows: number; placed: (T & { col: number; row: number })[] }
