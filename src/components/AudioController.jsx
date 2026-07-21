import { useEffect, useRef } from 'react'
import { useGame } from '../game/react/GameProvider.jsx'
import { trackForEra } from '../game/data/eras.js'

/**
 * Side-effect-only component: keeps the (shared, App-owned) AudioManager synced
 * to the current era's track. It subscribes directly to the manager and reacts to
 * every change, playing the new track whenever the era crosses a track boundary
 * (including auto era transitions in the loop). Renders nothing.
 */
export default function AudioController({ audio }) {
  const game = useGame()
  const lastTrack = useRef(null)

  useEffect(() => {
    const sync = () => {
      const src = trackForEra(game.era).src
      if (src !== lastTrack.current) {
        lastTrack.current = src
        audio.playForEra(game.era)
      }
    }
    sync() // initial track for the current era
    return game.subscribe(sync)
  }, [game, audio])

  return null
}
