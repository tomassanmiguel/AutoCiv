// The full ordered list of eras. Index (0-based) is the canonical era number
// used everywhere in the engine. Names come straight from the design sheet.
export const ERAS = [
  { id: 'stone',          name: 'Stone' },
  { id: 'bronze',         name: 'Bronze' },
  { id: 'iron',           name: 'Iron' },
  { id: 'classical',      name: 'Classical' },
  { id: 'early_medieval', name: 'Early Medieval' },
  { id: 'late_medieval',  name: 'Late Medieval' },
  { id: 'renaissance',    name: 'Renaissance' },
  { id: 'exploration',    name: 'Exploration' },
  { id: 'revolution',     name: 'Revolution' },
  { id: 'steam',          name: 'Steam' },
  { id: 'gilded',         name: 'Gilded' },
  { id: 'modern',         name: 'Modern' },
  { id: 'atomic',         name: 'Atomic' },
  { id: 'silicon',        name: 'Silicon' },
  { id: 'lunar',          name: 'Lunar' },
  { id: 'intelligence',   name: 'Intelligence' },
  { id: 'solar',          name: 'Solar' },
  { id: 'invasion',       name: 'Invasion' },
  { id: 'exodus',         name: 'Exodus' },
  { id: 'frontier',       name: 'Frontier' },
  { id: 'liminite',       name: 'Liminite' },
  { id: 'xenotic',        name: 'Xenotic' },
  { id: 'evolution',      name: 'Evolution' },
  { id: 'early_galactic', name: 'Early Galactic' },
  { id: 'late_galactic',  name: 'Late Galactic' },
  { id: 'utopian',        name: 'Utopian' },
  { id: 'time',           name: 'Time' },
  { id: 'infinity',       name: 'Infinity' },
]

export const ERA_COUNT = ERAS.length // 28

// Fast lookup: era id -> index.
export const ERA_INDEX = Object.fromEntries(ERAS.map((e, i) => [e.id, i]))

/** Resolve an era id (e.g. 'stone') to its numeric index. */
export function eraIndex(id) {
  const i = ERA_INDEX[id]
  if (i === undefined) throw new Error(`Unknown era id: ${id}`)
  return i
}

// Soundtrack. Each track starts at the given era index and plays until the
// next track's start era. Sources live in /public/music, transcoded from the
// original WAVs to OGG (~10x smaller) for the web.
export const MUSIC_TRACKS = [
  { startEra: eraIndex('stone'),          src: '/music/ancient.ogg' },
  { startEra: eraIndex('iron'),           src: '/music/classical.ogg' },
  { startEra: eraIndex('early_medieval'), src: '/music/medieval.ogg' },
  { startEra: eraIndex('renaissance'),    src: '/music/renaissance.ogg' },
  { startEra: eraIndex('steam'),          src: '/music/modern.ogg' },
  { startEra: eraIndex('silicon'),        src: '/music/digital.ogg' },
  { startEra: eraIndex('invasion'),       src: '/music/crisis.ogg' },
  { startEra: eraIndex('frontier'),       src: '/music/frontier.ogg' },
  { startEra: eraIndex('early_galactic'), src: '/music/ascension.ogg' },
  { startEra: eraIndex('time'),           src: '/music/final.ogg' },
]

/** The track that should be playing during the given era index. */
export function trackForEra(idx) {
  let chosen = MUSIC_TRACKS[0]
  for (const t of MUSIC_TRACKS) {
    if (idx >= t.startEra) chosen = t
  }
  return chosen
}
