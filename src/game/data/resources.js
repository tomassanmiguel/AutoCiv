// Development-phase resource thresholds.
//
// Each threshold resource (progress / food / production) accumulates `value`
// (+= output each tick) toward the current level's `threshold`. When it reaches
// the threshold, `level` (# thresholds reached) increments, the overflow carries
// over, and the threshold GROWS by a delta per the design formula:
//
//   threshold(N) = threshold(N-1) + X * 1.25^E * n * R
//
// where E = era index (0-based) and n = the GLOBAL level (never resets). Because
// the delta is always positive, each level's requirement is strictly higher than
// the last. R is a rubber band keeping the running level on pace with the era.
//
// INTERPRETATION NOTES:
//  - E is the 0-based era index (Stone = 0), so 1.25^E = 1 in the first era.
//  - `value` RESETS each level (overflow carries); the displayed threshold is the
//    per-level requirement, which grows monotonically. n (= level) never resets.
//  - R uses expected = (era + 1) * targetPerEra, actual = level (thresholds reached).

export const TICKS_PER_ERA = 65

export const RESOURCE_CONFIG = {
  progress:   { T0: 10, X: 5.6,  targetPerEra: 5 },
  food:       { T0: 15, X: 13.3, targetPerEra: 3 },
  production: { T0: 20, X: 7.4,  targetPerEra: 4 },
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

/** Rubber band R = 1 + 0.1*(actual - expected), clamped to [0.5, 1.5]. */
export function rubberBand(actual, expected) {
  return clamp(1 + 0.1 * (actual - expected), 0.5, 1.5)
}

/** Next cumulative threshold given the previous one. */
export function nextThreshold(prev, X, eraIndex, n, R) {
  return prev + X * Math.pow(1.25, eraIndex) * n * R
}
