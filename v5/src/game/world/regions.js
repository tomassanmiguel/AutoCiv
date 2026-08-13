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
  earth: { min: 0, max: 9 },        //  two continents + a wide ocean + islands (Earth trimmed 1 ring)
  space: { min: 10, max: 20 },      //  Moon (r1) and Mars (r2) discs live here
  deep: { min: 21, max: 34 },       //  deep space (trimmed 3 rings); the scattered exoplanets live here
  galactic: { min: 35, max: 36 },   //  outer deep space
}

// v5 has no derived battlefield ring, so the map ends at the last revealable ring.
// Combined with the galactic trim above this removes the outer 3 rings of space.
export const BATTLEFIELD_DEPTH = 0
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
  moon: { radius: 1, dist: 12 },      // spans 11..13 — ring 10 is the lone gap from Earth
  mars: { radius: 2, dist: 17 },      // spans 15..19 — ring 20 is open space before deep
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
 * Reveal radius for the CONCENTRIC off-Earth stages. Everything past Earth is now
 * charted in outward rings (a placeholder until the probe/caravel exploration
 * mechanic drives the reveal); Earth's own stages stay region-shaped. The deep
 * band and its scattered exoplanets fall out of these rings by distance.
 */
export const REVEAL_RADIUS = {
  [STAGE.space]: 10, // the lone ring of open space around Earth
  [STAGE.moon]: 14,  // the Moon (11..13) plus the ring of space beyond it
  [STAGE.mars]: 20,  // Mars (15..19) plus the open ring beyond it
  [STAGE.deep]: 24,  // first rings of deep space
  [STAGE.exo_coast]: 28, // deeper into deep space
  [STAGE.full_exo]: 32,  // most of deep space
  [STAGE.galaxy1]: 35,   // the galactic fringe
}

/** Features never appear on the outermost revealable ring, so the map edge reads clean. */
export const FEATURELESS_OUTER_RINGS = 1

// Earth's opening stages walk outward from the palace before the whole Old
// World is charted. LOCAL_RADIUS also gates island spacing (islands never sit
// inside it), so a wider Local view is guaranteed island- and New-World-free.
export const LOCAL_RADIUS = 4
export const NEARBY_RADIUS = 6
export const DISTANT_RADIUS = 7 // Earth now ends at ring 9, so the Old World stage covers rings 8-9
