/* This component is an animation orchestrator: it intentionally drives banner
   state from phase changes and timers, so react-hooks/set-state-in-effect
   (a nudge against accidental effect-driven setState) does not apply. */
/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useRef, useState } from 'react'
import { useGame } from '../../game/react/GameProvider.jsx'
import { eraTitle } from '../../game/data/eras.js'
import './TransitionOverlay.css'

const STEP_MS = 70 // per-character delete/type speed

/**
 * Full-screen banner shown during the battle and era-transition phases. It
 * orchestrates the animation with timers and calls completeTransition() when the
 * era-transition animation finishes (the battle banner is a brief announcement).
 *
 *  - Battle phase: a brief "Battle" announcement, then it clears so the live combat
 *    underneath is visible (combat runs on the manager's own timer).
 *  - Transition phase: fade in showing the previous era, then a typewriter effect
 *    that deletes the old era one character at a time and types the new one, then
 *    holds and fades out, calling completeTransition().
 */
export default function TransitionOverlay() {
  const game = useGame()
  const phase = game.data.phase
  const era = game.era
  const [state, setState] = useState(null)
  const timers = useRef([])

  useEffect(() => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    const after = (ms, fn) => timers.current.push(setTimeout(fn, ms))
    const set = (patch) => setState((s) => ({ ...s, ...patch }))

    if (phase === 'battle') {
      // Brief announcement only — combat runs on the manager timer underneath.
      setState({ mode: 'battle', visible: false })
      after(20, () => set({ visible: true }))
      after(1000, () => set({ visible: false }))
      after(1400, () => setState(null))
    } else if (phase === 'transition') {
      const from = eraTitle(era)
      const to = eraTitle(era + 1)
      const typeMs = (from.length + to.length + 1) * STEP_MS
      setState({ mode: 'era', visible: false, typing: false, from, to })
      after(20, () => set({ visible: true }))            // fade in (previous era)
      after(650, () => set({ typing: true }))            // delete old + type new
      after(650 + typeMs + 750, () => set({ visible: false }))
      after(650 + typeMs + 1150, () => game.completeTransition())
    } else {
      setState(null)
    }

    return () => { timers.current.forEach(clearTimeout); timers.current = [] }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  if (!state) return null
  const big = state.mode === 'era'
  return (
    <div className={`transition-overlay${state.visible ? ' visible' : ''}`}>
      <div className={`transition-banner frame-box${big ? ' big' : ''}`}>
        {state.mode === 'battle' ? (
          <span className="transition-text">Battle</span>
        ) : (
          <Typewriter from={state.from} to={state.to} active={state.typing} />
        )}
      </div>
    </div>
  )
}

/** Deletes `from` one char at a time, then types `to` one char at a time (when
 *  `active`). Shows `from` until activated. */
function Typewriter({ from, to, active }) {
  const [text, setText] = useState(from)
  const timers = useRef([])

  useEffect(() => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    if (!active) {
      setText(from)
      return
    }
    let t = 0
    for (let i = from.length - 1; i >= 0; i--) {
      const n = i
      timers.current.push(setTimeout(() => setText(from.slice(0, n)), t))
      t += STEP_MS
    }
    for (let i = 1; i <= to.length; i++) {
      const n = i
      timers.current.push(setTimeout(() => setText(to.slice(0, n)), t))
      t += STEP_MS
    }
    return () => { timers.current.forEach(clearTimeout); timers.current = [] }
  }, [active, from, to])

  return (
    <span className="type-text">
      {text}
      <span className="type-caret" />
    </span>
  )
}
