import { useEffect } from 'react'
import { useGame } from '../game/react/GameProvider.jsx'

/**
 * Side-effect-only component: keeps the (shared, App-owned) AudioManager synced
 * to the current era while the game screen is mounted. It does NOT create or stop
 * the manager — App owns its lifecycle so the title↔era music can cross-fade
 * across screen changes. Renders nothing.
 */
export default function AudioController({ audio }) {
  const game = useGame()
  const era = game.era

  useEffect(() => {
    audio.playForEra(era)
  }, [audio, era])

  return null
}
