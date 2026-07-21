import { Tile } from './Tile.js'
import { ROWS, COLS, labelAt, isWestCoast, unlockEraIndexAt } from './data/map.js'
import { resolveTerrainGrid } from './data/terrain.js'

/**
 * The tableau: the full 8x22 grid of tiles plus the logic for which subset is
 * visible in a given era. Owned by GameData.
 */
export class TableauData {
  constructor(seed = 1) {
    this.rows = ROWS
    this.cols = COLS

    const resolved = resolveTerrainGrid(seed)
    // tiles keyed "row,col"
    this.tiles = new Map()
    for (let r = 1; r <= ROWS; r++) {
      for (let c = 1; c <= COLS; c++) {
        this.tiles.set(`${r},${c}`, new Tile({
          row: r,
          col: c,
          label: labelAt(r, c),
          terrain: resolved.get(`${r},${c}`),
          flipX: isWestCoast(r, c),
        }))
      }
    }
  }

  tileAt(row, col) {
    return this.tiles.get(`${row},${col}`) ?? null
  }

  isUnlocked(row, col, eraIndex) {
    return eraIndex >= unlockEraIndexAt(row, col)
  }

  /** Sorted list of visible row numbers for an era (empty until Stone). */
  visibleRows(eraIndex) {
    const rows = []
    for (let r = 1; r <= ROWS; r++) {
      for (let c = 1; c <= COLS; c++) {
        if (this.isUnlocked(r, c, eraIndex)) { rows.push(r); break }
      }
    }
    return rows
  }

  /** Sorted list of visible column numbers for an era. */
  visibleCols(eraIndex) {
    const cols = []
    for (let c = 1; c <= COLS; c++) {
      for (let r = 1; r <= ROWS; r++) {
        if (this.isUnlocked(r, c, eraIndex)) { cols.push(c); break }
      }
    }
    return cols
  }

  /**
   * Visible rectangle for an era. Returns null if nothing is visible yet.
   * minRow/maxRow use sheet numbering (1 = bottom). The unlocked set is always
   * a contiguous rectangle, so min/max fully describe it.
   */
  visibleBounds(eraIndex) {
    const rows = this.visibleRows(eraIndex)
    const cols = this.visibleCols(eraIndex)
    if (rows.length === 0 || cols.length === 0) return null
    return {
      minRow: Math.min(...rows),
      maxRow: Math.max(...rows),
      minCol: Math.min(...cols),
      maxCol: Math.max(...cols),
    }
  }

  /** All tiles visible in an era, as a flat array. */
  visibleTiles(eraIndex) {
    const out = []
    for (let r = 1; r <= ROWS; r++) {
      for (let c = 1; c <= COLS; c++) {
        if (this.isUnlocked(r, c, eraIndex)) out.push(this.tileAt(r, c))
      }
    }
    return out
  }
}
