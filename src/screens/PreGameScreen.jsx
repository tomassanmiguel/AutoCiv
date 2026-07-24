import { useState } from 'react'
import { CIVILIZATIONS, DEFAULT_CIV, DIFFICULTIES, DEFAULT_DIFFICULTY } from '../game/data/civilizations.js'
import './PreGameScreen.css'

/**
 * Pre-game setup: pick a civilization (marquee policy + starting unit/building) and a
 * difficulty (enemy wave-budget scaler), then Begin. Shown between the title and the game.
 */
export default function PreGameScreen({ onStart, onBack }) {
  const [civ, setCiv] = useState(DEFAULT_CIV)
  const [diff, setDiff] = useState(DEFAULT_DIFFICULTY)
  const civs = Object.values(CIVILIZATIONS)

  return (
    <div className="pregame-screen">
      <h1 className="pregame-title">Found Your Civilization</h1>

      <div className="pregame-label">Choose a people</div>
      <div className="civ-grid">
        {civs.map((c) => (
          <button
            key={c.key}
            type="button"
            className={`civ-card${civ === c.key ? ' selected' : ''}`}
            onClick={() => setCiv(c.key)}
          >
            <div className="civ-name">{c.name}</div>
            <div className="civ-blurb">{c.blurb}</div>
          </button>
        ))}
      </div>

      <div className="pregame-label">Choose a difficulty</div>
      <div className="diff-row">
        {DIFFICULTIES.map((d) => (
          <button
            key={d.key}
            type="button"
            className={`diff-btn${diff === d.key ? ' selected' : ''}`}
            onClick={() => setDiff(d.key)}
          >
            <div className="diff-name">{d.name}</div>
            <div className="diff-blurb">{d.blurb}</div>
          </button>
        ))}
      </div>

      <div className="pregame-actions">
        <button type="button" className="btn btn-ghost" onClick={onBack}>Back</button>
        <button type="button" className="btn btn-primary" onClick={() => onStart(civ, diff)}>Begin</button>
      </div>
    </div>
  )
}
