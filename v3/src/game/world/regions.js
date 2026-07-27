// The concentric layout of the world, and the known-world reveal ladder.
//
// The map is a disc centred on the palace at (0,0). Bands are pure functions of
// axial distance from that centre; discrete bodies (Moon / Mars / the exoplanet)
// are DISCS embedded inside a band, so a band must be at least 2*radius+1 rings
// wide to contain its body.
//
// Radii are deliberately all in one place — this is the knob to turn when the
// map feels too small or too sprawling.

export const BANDS = {
  earth: { min: 0, max: 9 },        //  271 tiles — two continents + ocean + islands
  space: { min: 10, max: 20 },      //  Moon (r1) and Mars (r2) discs live here
  deep: { min: 21, max: 31 },       //  the deep-space "ocean"; exoplanet (r4) lives here
  galactic: { min: 32, max: 38 },   //  planets / stars / singularities littered throughout
}

// The world is generated 2 rings PAST the last revealable ring, so the derived
// battlefield ring (see below) always has real tiles to occupy.
export const BATTLEFIELD_DEPTH = 2
export const MAX_REVEAL_RADIUS = BANDS.galactic.max
export const MAX_RADIUS = MAX_REVEAL_RADIUS + BATTLEFIELD_DEPTH

// Bodies embedded in their band. `dist` is the ring the body's CENTRE sits on;
// a body spans dist±radius, which must stay inside its band AND inside a single
// reveal step (otherwise it would be half-revealed).
//
// The Moon sits exactly 2 rings clear of Earth's rim; Mars is further out so the
// two are reached at different stages by a purely concentric reveal.
export const BODIES = {
  moon: { radius: 1, dist: 13 },      // spans 12..14 (2-ring gap from Earth's rim at 9)
  mars: { radius: 2, dist: 18 },      // spans 16..20
  exoplanet: { radius: 4, dist: 27 }, // spans 23..31
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
// when `tile.revealStage <= currentStage`.
//
// TWO RULES the generator must uphold:
//  1. The known set is CLOSED — never a hole of unrevealed tiles inside it.
//     Earth's stages are region-shaped, so worldgen runs a sealing pass that
//     pulls any enclosed pocket into the stage that enclosed it.
//  2. Beyond Earth the reveal is purely CONCENTRIC (see RADIUS below), which
//     makes holes impossible and is why the Moon and Mars sit at different
//     distances rather than side by side.
//
// In the real game each notch is unlocked by a progress tech (cartography,
// ocean navigation, spaceflight, generation ships…). For now the debug menu
// drives the ladder directly.
// ---------------------------------------------------------------------------

export const STAGES = [
  { key: 'local', name: 'Local' },
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
 * Reveal radius for the concentric (off-Earth) stages. Earth's stages are
 * region-shaped instead and are handled by the generator.
 */
export const REVEAL_RADIUS = {
  [STAGE.space]: 11,     // the 2-ring gap of open space around Earth
  [STAGE.moon]: 15,      // reaches the Moon (12..14)
  [STAGE.mars]: 20,      // reaches Mars (16..20)
  [STAGE.deep]: 22,      // first rings of the deep-space ocean
  [STAGE.exo_coast]: 27, // the near side of the exoplanet (23..31)
  [STAGE.full_exo]: 31,  // all of it
  [STAGE.galaxy1]: 35,
  [STAGE.full_map]: MAX_REVEAL_RADIUS,
}

/** Radius of the starting "Local" reveal. */
export const LOCAL_RADIUS = 3
