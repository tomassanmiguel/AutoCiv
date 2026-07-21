import { useEffect } from 'react'
import './LoadingScreen.css'

/**
 * Faux "loading" splash shown first. Its real job is to get a user gesture
 * (click / keypress) so the browser will let audio play — clicking fades out to
 * the title screen, where the music starts. Any click or key triggers `onStart`.
 */
export default function LoadingScreen({ onStart }) {
  useEffect(() => {
    const onKey = () => onStart()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onStart])

  return (
    <div className="loading-screen" onClick={onStart}>
      <div className="loading-stars" aria-hidden="true" />
      <div className="loading-content">
        <h1 className="loading-title">AutoCiv</h1>
        <div className="loading-bar" aria-hidden="true">
          <div className="loading-bar-fill" />
        </div>
        <p className="loading-prompt">Click to Start</p>
      </div>
    </div>
  )
}
