/* This component is an animation orchestrator: it intentionally drives banner
   state from phase changes and timers, so react-hooks/set-state-in-effect
   (a nudge against accidental effect-driven setState) does not apply. */
/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useRef, useState } from 'react'
import { useGame } from '../../game/react/GameProvider.jsx'
import { eraTitle } from '../../game/data/eras.js'
import './TransitionOverlay.css'

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/**
 * Full-screen banner shown during the battle and era-transition phases. It
 * orchestrates the animation with timers and calls back into the manager
 * (endBattle / completeTransition) when the animation finishes.
 *
 *  - Battle phase: fade in "Battle", hold, fade out.
 *  - Transition phase: fade in showing the previous era, slot-machine spin the
 *    characters, settle on the new era, fade out.
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
      setState({ mode: 'battle', visible: false, text: 'Battle' })
      after(20, () => set({ visible: true }))
      after(1300, () => set({ visible: false }))
      after(1750, () => game.endBattle())
    } else if (phase === 'transition') {
      const from = eraTitle(era)
      const to = eraTitle(era + 1)
      setState({ mode: 'era', visible: false, text: from, spinning: false })
      after(20, () => set({ visible: true }))                    // fade in (previous era)
      after(950, () => set({ text: to, spinning: true }))        // spin toward the new era
      after(2450, () => set({ spinning: false }))                // settle
      after(3150, () => set({ visible: false }))                 // fade out
      after(3600, () => game.completeTransition())
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
          <span className="transition-text">{state.text}</span>
        ) : (
          <SlotText text={state.text} spinning={state.spinning} />
        )}
      </div>
    </div>
  )
}

/** Slot-machine text: while `spinning`, scrambles characters and settles them
 *  left-to-right onto `text`. */
function SlotText({ text, spinning }) {
  const [display, setDisplay] = useState(text)
  const settled = useRef(0)
  const interval = useRef(null)
  const timers = useRef([])

  useEffect(() => {
    if (interval.current) clearInterval(interval.current)
    timers.current.forEach(clearTimeout)
    timers.current = []

    if (!spinning) {
      setDisplay(text)
      return
    }

    const chars = text.split('')
    settled.current = 0
    interval.current = setInterval(() => {
      setDisplay(
        chars
          .map((c, i) => {
            if (c === ' ') return ' '
            return i < settled.current ? c : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]
          })
          .join(''),
      )
    }, 55)
    chars.forEach((_, i) => {
      timers.current.push(setTimeout(() => { settled.current = i + 1 }, 250 + i * 70))
    })
    timers.current.push(setTimeout(() => {
      if (interval.current) clearInterval(interval.current)
      setDisplay(text)
    }, 250 + chars.length * 70 + 150))

    return () => {
      if (interval.current) clearInterval(interval.current)
      timers.current.forEach(clearTimeout)
    }
  }, [spinning, text])

  return (
    <span className="slot-text">
      {display.split('').map((c, i) => (
        <span key={i} className={`slot-char${spinning ? ' spinning' : ''}`}>
          {c === ' ' ? ' ' : c}
        </span>
      ))}
    </span>
  )
}
