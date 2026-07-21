import { useEffect, useState } from 'react'
import './LoadingScreen.css'

/**
 * Faux "loading" splash shown first. Its real job is to get a user gesture
 * (click / keypress) so the browser will let audio play. It shows "Loading…"
 * while a bar fills, and only lets you advance once the bar is full — then a
 * click or key fades out to the title screen, where the music starts.
 */
export default function LoadingScreen({ onStart }) {
  const [loaded, setLoaded] = useState(false)

  // Safety net so we never get stuck if the bar's animationend doesn't fire
  // (e.g. prefers-reduced-motion disables the fill animation).
  useEffect(() => {
    const t = setTimeout(() => setLoaded(true), 2500)
    return () => clearTimeout(t)
  }, [])

  // Advancing (click/key) is only allowed once loading has finished.
  useEffect(() => {
    if (!loaded) return
    const onKey = () => onStart()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [loaded, onStart])

  const advance = () => {
    if (loaded) onStart()
  }

  return (
    <div className={`loading-screen${loaded ? ' ready' : ''}`} onClick={advance}>
      <div className="loading-stars" aria-hidden="true" />
      <div className="loading-content">
        <h1 className="loading-title">AutoCiv</h1>
        <div className="loading-bar" aria-hidden="true">
          <div className="loading-bar-fill" onAnimationEnd={() => setLoaded(true)} />
        </div>
        <p className={`loading-prompt${loaded ? ' ready' : ' loading'}`}>
          {loaded ? 'Click to Start' : <>Loading<span className="load-dots" /></>}
        </p>
      </div>
    </div>
  )
}
