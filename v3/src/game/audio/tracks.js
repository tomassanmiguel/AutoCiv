// Soundtrack (v3).
//
// Only the title track is wired for now — in-game music is deliberately cut
// until the era/phase structure of v3 is decided. The AudioManager itself is
// unchanged and already cross-fades, so adding in-game tracks later is just a
// matter of calling `playTrack()` with the right src.

export const TITLE_TRACK = '/music/title.ogg'
