import { useEffect, useRef } from 'react'
import { useGame } from '../game/react/GameProvider.jsx'
import { AudioManager } from '../game/audio/AudioManager.js'

/**
 * Side-effect-only component: owns the AudioManager and keeps the soundtrack in
 * sync with the current era. Renders nothing.
 */
export default function AudioController() {
  const game = useGame()
  const era = game.era
  const mgrRef = useRef(null)
  if (!mgrRef.current) mgrRef.current = new AudioManager(0.5)

  // Mount: request the current era's track and unlock on the first gesture.
  useEffect(() => {
    // Escape hatch (also a future settings hook): localStorage 'autociv.mute'.
    if (localStorage.getItem('autociv.mute') === '1') return
    const mgr = mgrRef.current
    mgr.playForEra(game.era)
    mgr.enable() // best-effort; entering via a click usually grants activation
    const kick = () => mgr.enable()
    window.addEventListener('pointerdown', kick)
    window.addEventListener('keydown', kick)
    return () => {
      window.removeEventListener('pointerdown', kick)
      window.removeEventListener('keydown', kick)
      mgr.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Era change: switch track (cross-fades internally, no-op if same track).
  useEffect(() => {
    mgrRef.current.playForEra(era)
  }, [era])

  return null
}
