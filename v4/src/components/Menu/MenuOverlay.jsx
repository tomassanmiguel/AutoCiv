import { useState } from 'react'
import { useGame } from '../../game/react/GameProvider.jsx'
import { STAGES, STAGE_COUNT } from '../../game/world/regions.js'
import './MenuOverlay.css'

/**
 * Hamburger menu over the map.
 *
 * Holds the temporary KNOWN WORLD control — v2's era slider, repurposed. In the
 * real game each notch is unlocked by a progress tech (cartography, ocean
 * navigation, spaceflight, generation ships…); here it drives the reveal ladder
 * directly so the map can be explored end to end.
 */
export default function MenuOverlay({ onExit }) {
  const game = useGame()
  const [open, setOpen] = useState(false)
  const stage = game.stage

  return (
    <>
      <button
        className="menu-button frame-box-dark"
        onClick={() => setOpen(true)}
        aria-label="Menu"
      >
        <span /><span /><span />
      </button>

      {open && (
        <div className="menu-backdrop" onClick={() => setOpen(false)}>
          <div className="menu-panel frame-box" onClick={(e) => e.stopPropagation()}>
            <div className="menu-panel-head">
              <h2>Menu</h2>
              <button className="menu-close" onClick={() => setOpen(false)} aria-label="Close">✕</button>
            </div>

            <section className="menu-section">
              <div className="menu-section-title">
                Known World <span className="temp-tag">temporary</span>
              </div>
              <div className="stage-readout">
                <span className="stage-index">{stage + 1} / {STAGE_COUNT}</span>
                <span className="stage-name">{STAGES[stage].name}</span>
              </div>
              <input
                className="stage-slider"
                type="range"
                min={0}
                max={STAGE_COUNT - 1}
                value={stage}
                onChange={(e) => game.setStage(Number(e.target.value))}
              />
              <div className="stage-steppers">
                <button
                  className="menu-frame-btn frame-box-dark"
                  onClick={() => game.prevStage()}
                  disabled={stage === 0}
                >◀ Prev</button>
                <button
                  className="menu-frame-btn frame-box-dark"
                  onClick={() => game.nextStage()}
                  disabled={stage === STAGE_COUNT - 1}
                >Next ▶</button>
              </div>
              <ol className="stage-list">
                {STAGES.map((s, i) => (
                  <li key={s.key}>
                    <button
                      className={`stage-jump${i === stage ? ' active' : ''}`}
                      onClick={() => game.setStage(i)}
                    >{s.name}</button>
                  </li>
                ))}
              </ol>
            </section>

            <section className="menu-section">
              <div className="menu-section-title">Map</div>
              <div className="seed-readout">seed <b>{game.seed}</b></div>
            </section>

            <section className="menu-section">
              <button className="menu-frame-btn frame-box-dark menu-exit" onClick={onExit}>
                Exit to Title
              </button>
            </section>
          </div>
        </div>
      )}
    </>
  )
}
