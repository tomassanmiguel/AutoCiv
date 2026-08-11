import { useEffect } from 'react'
import { useGame } from '../game/react/GameProvider.jsx'
import { trackForEra } from '../game/audio/tracks.js'

/**
 * Drives the in-game soundtrack off the reveal era. Mounted inside the game's
 * GameProvider so it can read `game.revealEra`; it shares the session-long
 * AudioManager App owns, so the title↔era hand-off cross-fades on one system.
 *
 * Renders nothing — it is an effect that requests the right era track whenever
 * the era crosses a track boundary. `playTrack` is idempotent, so re-requesting
 * the same src on an unrelated re-render never restarts it.
 */
export default function AudioController({ audio }) {
  const game = useGame()
  const era = game.revealEra
  useEffect(() => {
    if (audio) audio.playTrack(trackForEra(era))
  }, [audio, era])
  return null
}
