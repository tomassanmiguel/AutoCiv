// The concentric layout of the world, and the known-world reveal ladder.
//
// The map is a disc centred on the palace at (0,0). Bands are pure functions of
// axial distance from that centre; discrete bodies (Moon / Mars / the exoplanet
// and its moon) are DISCS embedded inside a band, so a band must be at least
// 2*radius+1 rings wide to contain its body.
//
// Radii are deliberately all in one place — this is the knob to turn when the
// map feels too small or too sprawling.

export const BANDS = {
  earth: { min: 0, max: 10 },       //  331 tiles — two continents + a wide ocean + islands
  space: { min: 11, max: 21 },      //  Moon (r1) and Mars (r2) discs live here
  deep: { min: 22, max: 38 },       //  the deep-space "ocean"; exoplanet (r5) + its moon
  galactic: { min: 39, max: 41 },   //  outer deep space
}

// The world is generated 2 rings PAST the last revealable ring, so the derived
// battlefield ring (see GameManager) always has real tiles to occupy.
export const BATTLEFIELD_DEPTH = 2
export const MAX_REVEAL_RADIUS = BANDS.galactic.max
export const MAX_RADIUS = MAX_REVEAL_RADIUS + BATTLEFIELD_DEPTH

// Bodies embedded in their band. `dist` is the ring the body's CENTRE sits on;
// a body spans dist±radius, which must stay inside its band AND inside a single
// reveal step (otherwise it would be half-revealed).
//
// Spacing rules the invariants enforce:
//   - the Moon sits exactly ONE ring of open space beyond Earth's rim
//   - Mars keeps open space on BOTH sides (it must not touch deep space)
//   - the exoplanet's moon is always on its BACKSIDE — further out along the
//     same bearing, so you meet the planet before its moon
export const BODIES = {
  moon: { radius: 1, dist: 13 },      // spans 12..14 — ring 11 is the lone gap from Earth
  mars: { radius: 2, dist: 18 },      // spans 16..20 — ring 21 is open space before deep
  exoplanet: { radius: 5, dist: 29 }, // spans 24..34
  exomoon: { radius: 1, dist: 37 },   // spans 36..38 — ring 35 is its lone buffer
}

// The exoplanet is reached along a CORRIDOR rather than by revealing the whole
// deep band, so the space between Earth and it opens first and the rest of deep
// space stays dark (and keeps its planets/stars a surprise). Half-angle of that
// cone, in radians, per stage.
export const EXO_CORRIDOR = {
  approach: 0.46, // ~26°, out to the exoplanet's centre ring
  arrival: 0.58,  // ~33°, out past its moon
}

/** Which band a distance falls in. */
export function bandAt(d) {
  if (d <= BANDS.earth.max) return 'earth'
  if (d <= BANDS.space.max) return 'space'
  if (d <= BANDS.deep.max) return 'deep'
  return 'galactic'
}

// ---------------------------------------------------------------------------
// Known-world reveal ladder.
//
// Every tile is stamped with a `revealStage` at generation time; a tile is known
// when `tile.revealStage <= currentStage`. Reveal has THREE shapes — see
// worldgen's assignReveal — and none of them may leave a hole in the known set
// (sealReveal enforces that).
//
// In the real game each notch is unlocked by a progress tech (cartography,
// ocean navigation, spaceflight, generation ships…). For now the debug menu
// drives the ladder directly.
// ---------------------------------------------------------------------------

export const STAGES = [
  { key: 'local', name: 'Local' },
  { key: 'nearby', name: 'Nearby Lands' },
  { key: 'distant', name: 'Distant Lands' },
  { key: 'old_world', name: 'Old World' },
  { key: 'islands', name: 'Islands' },
  { key: 'new_coast', name: 'New World Coastline' },
  { key: 'full_earth', name: 'Full Earth' },
  { key: 'space', name: 'Earth and Space' },
  { key: 'moon', name: 'Moon' },
  { key: 'mars', name: 'Mars' },
  { key: 'deep', name: 'Deeper Space' },
  { key: 'exo_coast', name: 'Exo Coastline' },
  { key: 'full_exo', name: 'Full Exo' },
  { key: 'galaxy1', name: 'Outer Galaxy I' },
  { key: 'full_map', name: 'Full Map' },
]

export const STAGE_COUNT = STAGES.length
export const STAGE = Object.fromEntries(STAGES.map((s, i) => [s.key, i]))

/**
 * Reveal radius for the CONCENTRIC off-Earth stages. Earth's stages are
 * region-shaped and the two exoplanet stages are corridor-shaped; both are
 * handled by the generator.
 */
export const REVEAL_RADIUS = {
  [STAGE.space]: 11, // the lone ring of open space around Earth
  [STAGE.moon]: 15,  // the Moon (12..14) plus the ring of space beyond it
  [STAGE.mars]: 21,  // Mars (16..20) plus the open ring beyond it
  [STAGE.deep]: 23,  // first rings of the deep-space ocean, short of the exoplanet
}

/** How far out each exoplanet stage pushes its corridor. */
export const EXO_REACH = {
  [STAGE.exo_coast]: BODIES.exoplanet.dist,
  [STAGE.full_exo]: BODIES.exomoon.dist + BODIES.exomoon.radius,
}

/**
 * "Outer Galaxy I" does NOT reveal a disc — that would leave the exo corridor
 * poking out of it as a jagged spike. Instead it reveals a smooth TEARDROP whose
 * radius eases from `base` (away from the exoplanet) up to `max` (towards it),
 * enveloping the corridor. The map is deliberately lopsided at that stage, and
 * "Full Map" rounds it back out.
 *
 * `max` must stay large enough to swallow the corridor at its half-angle, or the
 * spike reappears.
 */
export const GALAXY_SHAPE = { base: 30, max: 40, spread: 2.2 }

/** Features never appear on the outermost revealable ring, so the map edge reads clean. */
export const FEATURELESS_OUTER_RINGS = 1

// Earth's opening stages walk outward from the palace before the whole Old
// World is charted.
export const LOCAL_RADIUS = 3
export const NEARBY_RADIUS = 6
export const DISTANT_RADIUS = 9
