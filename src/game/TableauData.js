import { Tile } from './Tile.js'
import { ROWS, COLS, labelAt, isWestCoast, unlockEraIndexAt } from './data/map.js'
import { resolveTerrainGrid } from './data/terrain.js'
import { ERA_INDEX } from './data/eras.js'

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

  /** Number of battlefield (enemy) slot rows above the grid (4 from Revolution). */
  enemyRowCount(eraIndex) {
    return eraIndex >= ERA_INDEX.revolution ? 4 : 3
  }

  /** Columns that host battlefield (enemy spawn) tiles. Before the Iron age, purely-water
   *  columns (e.g. the Coast column of the Stone start) are excluded — enemies can't fairly
   *  threaten across water that early, so the spawn zone doesn't extend above them. */
  battlefieldColumns(eraIndex) {
    const cols = this.columnPlaces(eraIndex)
    if (eraIndex >= ERA_INDEX.iron) return cols
    return cols.filter((c) => [...c.places].some((p) => p !== 'coast' && p !== 'sea'))
  }

  /** Per visible column, the set of terrain placement classes among its player tiles. */
  columnPlaces(eraIndex) {
    const b = this.visibleBounds(eraIndex)
    if (!b) return []
    const out = []
    for (let c = b.minCol; c <= b.maxCol; c++) {
      const places = new Set()
      for (let r = b.minRow; r <= b.maxRow; r++) {
        const p = this.tileAt(r, c)?.def?.place
        if (p) places.add(p)
      }
      out.push({ col: c, places })
    }
    return out
  }
}
