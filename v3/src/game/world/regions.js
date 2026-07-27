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
  earth: { min: 0, max: 12 },       //  469 tiles — two continents + ocean + islands
  space: { min: 13, max: 20 },      //  Moon (r2) and Mars (r3) discs live here
  deep: { min: 21, max: 31 },       //  the deep-space "ocean"; exoplanet (r5) lives here
  galactic: { min: 32, max: 34 },   //  planets / stars / singularities
  battlefield: { min: 35, max: 36 },//  enemy muster ring, outermost
}

export const MAX_RADIUS = BANDS.battlefield.max

// Bodies embedded in their band. `dist` is the ring the body's CENTRE sits on.
// A band must be at least 2*radius+1 rings wide to contain its body.
export const BODIES = {
  moon: { radius: 2, dist: 16 },     // spans 14..18, inside space 13..20
  mars: { radius: 3, dist: 16 },     // spans 13..19, inside space 13..20
  exoplanet: { radius: 5, dist: 26 },// spans 21..31, inside deep 21..31
}

/** Which band a distance falls in. */
export function bandAt(d) {
  if (d <= BANDS.earth.max) return 'earth'
  if (d <= BANDS.space.max) return 'space'
  if (d <= BANDS.deep.max) return 'deep'
  if (d <= BANDS.galactic.max) return 'galactic'
  return 'battlefield'
}

// ---------------------------------------------------------------------------
// Known-world reveal ladder.
//
// Every tile is stamped with a `revealStage` at generation time; a tile is known
// when `tile.revealStage <= currentStage`. Encoding it per-tile (rather than
// re-deriving a mask per stage) keeps the nuance — "New World coastline" is a
// geometric subset that only the generator knows how to compute.
//
// In the real game these are unlocked by progress techs (cartography, ocean
// navigation, spaceflight, generation ships...). For now the debug menu drives
// the ladder directly.
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

/** Radius of the starting "Local" reveal. */
export const LOCAL_RADIUS = 3
