// Threshold resources (v3).
//
// Ported from v2's model: food / production / progress accumulate `value`
// toward the current level's `threshold`. On reaching it the level increments,
// the overflow carries, and the threshold GROWS — so each level costs strictly
// more than the last. Gold is a plain stock with no threshold.
//
//   threshold(n) = threshold(n-1) + X * n
//
// v2's formula also carried a `1.25^era` term and a rubber band pacing the
// player against the era clock. v3 has no eras yet, so both are dropped rather
// than faked; re-add them when the era/phase structure lands.

export const THRESHOLD_RESOURCES = ['food', 'production', 'progress']

export const RESOURCE_CONFIG = {
  progress: { T0: 10, X: 5.6 },
  food: { T0: 15, X: 13.3 },
  production: { T0: 20, X: 7.4 },
}

export const nextThreshold = (prev, X, level) => prev + X * level

/** A fresh set of resource stocks. */
export function initialResources() {
  const out = { gold: { value: 0 } }
  for (const res of THRESHOLD_RESOURCES) {
    out[res] = { value: 0, level: 0, threshold: RESOURCE_CONFIG[res].T0 }
  }
  return out
}

/**
 * Add one tick of `output` to each stock, crossing as many thresholds as the
 * income covers. Returns the number of levels gained per resource.
 *
 * `mult` is the progress web's threshold discount (1 = none, 0.9 = 10% cheaper).
 * It is applied at COMPARISON time rather than baked into `stock.threshold`, so
 * taking a discount is retroactive and two discounts can't compound into free.
 */
export function accrue(resources, output, mult = null) {
  const gained = {}
  resources.gold.value += output.gold ?? 0
  for (const res of THRESHOLD_RESOURCES) {
    const cfg = RESOURCE_CONFIG[res]
    const stock = resources[res]
    const m = mult?.[res] ?? 1
    stock.value += output[res] ?? 0
    let levels = 0
    // Guarded: a very large output could otherwise spin here for a long time.
    while (stock.value >= stock.threshold * m && levels < 1000) {
      stock.value -= stock.threshold * m
      stock.level += 1
      stock.threshold = nextThreshold(stock.threshold, cfg.X, stock.level)
      levels++
    }
    gained[res] = levels
  }
  return gained
}

/** What the UI should show as "the bar you are filling". */
export const effectiveThreshold = (stock, mult = 1) => stock.threshold * mult
