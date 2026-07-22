/* This component spawns transient float effects in response to per-step combat
   events (an external system), so react-hooks/set-state-in-effect does not apply. */
/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useRef, useState } from 'react'
import { useGame } from '../../game/react/GameProvider.jsx'
import './CombatFx.css'

const CELL = 96 // must match Tableau's CELL

// Content-space (x,y) center of the cell an event happened on.
function cellPos(ev, bounds, enemyRows) {
  if (ev.col == null) return null
  const x = (ev.col - bounds.minCol) * CELL + CELL / 2
  let y
  if (ev.slot != null) y = ev.slot * CELL + CELL / 2 // enemy slot (0 = top)
  else if (ev.row != null) y = (enemyRows + (bounds.maxRow - ev.row)) * CELL + CELL / 2 // player row
  else y = enemyRows * CELL // legit-on-empty-column: at the front player line
  return { x, y }
}

/**
 * Floating combat numbers over the battlefield: damage taken, gold gained, and
 * legitimacy lost. Lives inside `.tableau-content` so it pans/zooms with the map.
 * Reads the per-step `data.combatEvents` (keyed by combatSeq) and spawns short-lived
 * rising numbers.
 */
export default function CombatFx({ bounds, enemyRows }) {
  const game = useGame()
  const [fx, setFx] = useState([])
  const idRef = useRef(0)
  const lastSeq = useRef(-1)
  const seq = game.data.combatSeq

  useEffect(() => {
    if (game.data.phase !== 'battle' || !bounds || seq === lastSeq.current) return
    lastSeq.current = seq
    const events = game.data.combatEvents || []
    const spawned = []
    for (const ev of events) {
      const pos = cellPos(ev, bounds, enemyRows)
      if (!pos) continue
      if (ev.kind === 'damage') {
        spawned.push({ id: idRef.current++, ...pos, text: `-${ev.amount}`, cls: `dmg ${ev.side === 'enemy' ? 'to-enemy' : 'to-player'}${ev.killed ? ' kill' : ''}` })
      } else if (ev.kind === 'gold') {
        spawned.push({ id: idRef.current++, ...pos, text: `+${ev.amount}`, icon: '/sprites/icons/gold.png', cls: 'gold' })
      } else if (ev.kind === 'legit') {
        spawned.push({ id: idRef.current++, ...pos, text: `-${ev.amount}`, icon: '/sprites/icons/legitimacy.png', cls: 'legit' })
      } else if (ev.kind === 'heal') {
        spawned.push({ id: idRef.current++, ...pos, text: `+${ev.amount}`, icon: '/sprites/icons/defense.png', cls: 'heal' })
      } else if (ev.kind === 'progress') {
        spawned.push({ id: idRef.current++, ...pos, text: `+${ev.amount}`, icon: '/sprites/icons/progress.png', cls: 'progress' })
      }
    }
    if (!spawned.length) return
    setFx((cur) => [...cur.slice(-40), ...spawned]) // cap concurrent floats
    const ids = new Set(spawned.map((s) => s.id))
    setTimeout(() => setFx((cur) => cur.filter((f) => !ids.has(f.id))), 850)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq])

  if (!fx.length) return null
  return (
    <div className="combat-fx">
      {fx.map((f) => (
        <div key={f.id} className={`fx-float ${f.cls}`} style={{ left: f.x, top: f.y }}>
          {f.icon && <img src={f.icon} alt="" />}{f.text}
        </div>
      ))}
    </div>
  )
}
