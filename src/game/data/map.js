import { eraIndex } from './eras.js'

// ---------------------------------------------------------------------------
// Map layout, transcribed from the design spreadsheet.
//
// The tableau is 8 rows x 22 columns. Rows are numbered 1 (BOTTOM) to 8 (TOP),
// matching the sheet. Columns are numbered 1 (LEFT) to 22 (RIGHT).
//
// A tile (row, col) becomes visible once the current era index is >= BOTH the
// row's unlock era and the column's unlock era. In practice the unlocked set is
// always a contiguous rectangle that grows outward from the Stone-era core
// (rows 2-4, cols 9-12).
// ---------------------------------------------------------------------------

export const ROWS = 8
export const COLS = 22

// Era at which each ROW unlocks (row number -> era id).
export const ROW_UNLOCK = {
  1: 'iron',
  2: 'stone',
  3: 'stone',
  4: 'stone',
  5: 'atomic',
  6: 'lunar',
  7: 'solar',
  8: 'solar',
}

// Era at which each COLUMN unlocks (column number -> era id).
export const COL_UNLOCK = {
  1: 'steam',        2: 'steam',
  3: 'revolution',   4: 'revolution',
  5: 'exploration',  6: 'exploration',
  7: 'renaissance',  8: 'renaissance',
  9: 'stone',        10: 'stone',       11: 'stone',      12: 'stone',
  13: 'classical',
  14: 'early_medieval',
  15: 'late_medieval', 16: 'late_medieval', 17: 'late_medieval',
  18: 'exodus',      19: 'exodus',
  20: 'frontier',
  21: 'xenotic',     22: 'xenotic',
}

// Design label per cell, GRID[row][col] (row 1..8, col 1..22).
// Some labels are META-types resolved to concrete sprites at build time
// (see terrain.js): 'Old World', 'New World', 'Ocean', 'Deep Space', 'Space',
// 'Exoplanet'. The rest are concrete: 'Coast', 'Mountains', 'Mars', 'Exosea',
// 'Moon'.
export const GRID = {
  8: ['Space','Mars','Mars','Mars','Mars','Mars','Space','Space','Space','Space','Space','Space','Space','Space','Space','Space','Space','Deep Space','Deep Space','Exoplanet','Exoplanet','Exoplanet'],
  7: ['Space','Mars','Mars','Mars','Mars','Mars','Space','Space','Space','Space','Space','Space','Space','Space','Space','Space','Space','Deep Space','Deep Space','Exoplanet','Exoplanet','Exoplanet'],
  6: ['Space','Space','Space','Space','Space','Space','Space','Space','Space','Space','Moon','Moon','Moon','Moon','Space','Space','Space','Deep Space','Deep Space','Exoplanet','Exosea','Exoplanet'],
  5: ['Space','Space','Space','Space','Space','Space','Space','Space','Space','Space','Space','Space','Space','Space','Space','Space','Space','Deep Space','Deep Space','Exoplanet','Exosea','Exoplanet'],
  4: ['Coast','New World','New World','New World','New World','Coast','Ocean','Ocean','Coast','Old World','Old World','Old World','Old World','Mountains','Old World','Old World','Coast','Deep Space','Deep Space','Exoplanet','Exosea','Exoplanet'],
  3: ['Coast','New World','New World','New World','New World','Coast','Ocean','Ocean','Coast','Old World','Old World','Old World','Old World','Mountains','Old World','Old World','Coast','Deep Space','Deep Space','Exoplanet','Exosea','Exoplanet'],
  2: ['Coast','New World','New World','New World','New World','Coast','Ocean','Ocean','Coast','Old World','Old World','Old World','Old World','Mountains','Old World','Old World','Coast','Deep Space','Deep Space','Exoplanet','Exoplanet','Exoplanet'],
  1: ['Coast','New World','New World','New World','New World','Coast','Ocean','Ocean','Coast','Old World','Old World','Old World','Old World','Mountains','Old World','Old World','Coast','Deep Space','Deep Space','Exoplanet','Exoplanet','Exoplanet'],
}

// Continent/land labels — used to orient coastlines (a Coast tile with land to
// its east is a west coast and its sprite must be mirrored horizontally).
export const LAND_LABELS = new Set(['New World', 'Old World', 'Mountains'])

/** Design label at a 1-indexed (row, col). */
export function labelAt(row, col) {
  return GRID[row][col - 1]
}

/** True if this Coast tile faces west (land lies to its east) and so its sprite
 *  should be flipped horizontally. */
export function isWestCoast(row, col) {
  if (labelAt(row, col) !== 'Coast' || col >= COLS) return false
  return LAND_LABELS.has(labelAt(row, col + 1))
}

/** Era index at which a tile (row, col) becomes visible. */
export function unlockEraIndexAt(row, col) {
  return Math.max(eraIndex(ROW_UNLOCK[row]), eraIndex(COL_UNLOCK[col]))
}
