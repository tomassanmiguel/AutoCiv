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

  // Create the manager once (in an effect, not during render) and stop it on
  // unmount. Declared first so it runs before the effects below on mount.
  useEffect(() => {
    const mgr = (mgrRef.current ??= new AudioManager(0.5))
    return () => mgr.stop()
  }, [])

  // Unlock playback on mount + the first user gesture (unless muted). The
  // 'autociv.mute' localStorage flag is an escape hatch / future settings hook.
  useEffect(() => {
    if (localStorage.getItem('autociv.mute') === '1') return
    const mgr = mgrRef.current
    mgr.enable() // best-effort; entering via a click usually grants activation
    const kick = () => mgr.enable()
    window.addEventListener('pointerdown', kick)
    window.addEventListener('keydown', kick)
    return () => {
      window.removeEventListener('pointerdown', kick)
      window.removeEventListener('keydown', kick)
    }
  }, [])

  // Keep the track synced to the era (cross-fades internally; silent until
  // enabled; no-op if the track is unchanged).
  useEffect(() => {
    mgrRef.current?.playForEra(era)
  }, [era])

  return null
}
