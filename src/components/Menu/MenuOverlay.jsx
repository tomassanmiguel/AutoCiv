import { useState } from 'react'
import { useGame } from '../../game/react/GameProvider.jsx'
import { ERAS, ERA_COUNT } from '../../game/data/eras.js'
import './MenuOverlay.css'

/**
 * Floating menu button (upper-left) that opens an overlay above the tableau.
 * For now the overlay holds a temporary Era control used to drive the viewer;
 * changing it flows through GameManager.setEra, which triggers the tableau's
 * zoom-out reveal and the soundtrack change.
 */
export default function MenuOverlay({ onExit }) {
  const game = useGame()
  const [open, setOpen] = useState(false)
  const era = game.era

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
              <div className="menu-section-title">Era <span className="temp-tag">temporary</span></div>
              <div className="era-readout">
                <span className="era-index">{era + 1} / {ERA_COUNT}</span>
                <span className="era-name">{ERAS[era].name}</span>
              </div>
              <input
                className="era-slider"
                type="range"
                min={0}
                max={ERA_COUNT - 1}
                value={era}
                onChange={(e) => game.setEra(Number(e.target.value))}
              />
              <div className="era-steppers">
                <button className="menu-frame-btn frame-box-dark" onClick={() => game.prevEra()} disabled={era === 0}>
                  ◀ Prev
                </button>
                <button className="menu-frame-btn frame-box-dark" onClick={() => game.nextEra()} disabled={era === ERA_COUNT - 1}>
                  Next ▶
                </button>
              </div>
            </section>

            <section className="menu-section">
              <button className="menu-frame-btn frame-box-dark menu-exit" onClick={onExit}>Exit to Title</button>
            </section>
          </div>
        </div>
      )}
    </>
  )
}
