// Soundtrack (v3).
//
// One title track plus ten era tracks (transcoded to /public/music, shared with
// v2). v3 has fifteen eras and ten tracks, so each track STARTS at an era index
// and plays until the next track's start era — the ten tracks are spread across
// the fifteen eras thematically. `trackForEra` resolves an era index to its src.
//
// The AudioManager cross-fades between whatever is playing and the requested
// track, so switching on an era change is a clean fade with no pile-up.

export const TITLE_TRACK = '/music/title.ogg'

// startEra → src, ascending by startEra. v3 ERAS (schema.js), 0-based:
//   0 Stone · 1 Bronze · 2 Iron · 3 Classical · 4 Medieval · 5 Renaissance
//   6 Exploration · 7 Steam · 8 Modern · 9 Information · 10 Solar · 11 Exodus
//   12 Liminite · 13 Galactic · 14 Ascension
export const SOUNDTRACK = [
  { startEra: 0, src: '/music/ancient.ogg' },      // Stone, Bronze
  { startEra: 2, src: '/music/classical.ogg' },    // Iron, Classical
  { startEra: 4, src: '/music/medieval.ogg' },     // Medieval
  { startEra: 5, src: '/music/renaissance.ogg' },  // Renaissance, Exploration
  { startEra: 7, src: '/music/modern.ogg' },       // Steam, Modern
  { startEra: 9, src: '/music/digital.ogg' },      // Information
  { startEra: 10, src: '/music/crisis.ogg' },      // Solar
  { startEra: 11, src: '/music/frontier.ogg' },    // Exodus, Liminite
  { startEra: 13, src: '/music/ascension.ogg' },   // Galactic
  { startEra: 14, src: '/music/final.ogg' },       // Ascension
]

/** The track that should be playing during the given era index. */
export function trackForEra(idx) {
  let src = SOUNDTRACK[0].src
  for (const t of SOUNDTRACK) {
    if (idx >= t.startEra) src = t.src
    else break
  }
  return src
}
