import { useState } from 'react'
import { useGame } from '../../game/react/GameProvider.jsx'
import { ERAS } from '../../game/data/eras.js'
import IconText from '../common/IconText.jsx'
import './ProgressOverlay.css'

/**
 * Advancement chooser, shown when a progress threshold is crossed (the game holds
 * paused). Three weighted cards; picking one unlocks its item into the roster.
 * Full-slot unlocks route through a confirm ("Are you sure?") and/or a slot-replace
 * prompt (the panel flashes the candidate slots red). "Hide" tucks the cards away
 * — the widget rail's flask re-summons them.
 */
export default function ProgressOverlay() {
  const game = useGame()
  const sel = game.data.selection
  const [dontAsk, setDontAsk] = useState(false)
  if (!sel || sel.type !== 'progress') return null

  // Replace stage: the cards are hidden; a small prompt drives panel picking.
  if (sel.stage === 'replace') {
    return (
      <div className="progress-backdrop progress-backdrop--soft">
        <div className="replace-prompt frame-box">
          <div className="replace-prompt-title">Choose which slot to replace</div>
          <div className="replace-prompt-hint">Pick a flashing slot in the panel →</div>
          <button className="progress-btn frame-box-dark" onClick={() => game.cancelReplace()}>Cancel</button>
        </div>
      </div>
    )
  }

  // Confirm stage: an extra "are you sure" before overwriting a full slot.
  if (sel.stage === 'confirm') {
    return (
      <div className="progress-backdrop">
        <div className="confirm-window frame-box">
          <div className="confirm-title">Replace an existing item?</div>
          <div className="confirm-text">Its slot is already full. Choosing this will overwrite what you have.</div>
          <label className="confirm-check">
            <input type="checkbox" checked={dontAsk} onChange={(e) => setDontAsk(e.target.checked)} />
            Don&apos;t ask again
          </label>
          <div className="confirm-actions">
            <button className="progress-btn frame-box-dark" onClick={() => game.cancelReplace()}>Cancel</button>
            <button className="progress-btn frame-box-dark" onClick={() => game.confirmReplace(dontAsk)}>Confirm</button>
          </div>
        </div>
      </div>
    )
  }

  // Choose stage. Hidden -> nothing here (the widget rail restores it).
  if (sel.hidden) return null

  return (
    <div className="progress-backdrop">
      <div className="progress-window">
        <h2 className="progress-heading">Progress!</h2>
        <div className="progress-cards">
          {sel.options.map((opt, i) => (
            <button
              key={opt.id}
              className={`progress-card frame-box ${opt.implemented ? '' : 'not-impl'}`}
              onClick={() => game.chooseProgress(i)}
            >
              <div className="progress-card-corner">
                {opt.silhouette
                  ? <img src={opt.silhouette} alt="" />
                  : <span className="progress-card-glyph">{opt.glyph}</span>}
              </div>
              <div className="progress-card-era">{ERAS[opt.eraIndex].name}</div>
              <div className="progress-card-name">{opt.name}</div>
              <div className="progress-card-desc"><IconText>{opt.description}</IconText></div>
            </button>
          ))}
        </div>
        <button className="progress-btn frame-box-dark progress-hide" onClick={() => game.hideSelection()}>
          Hide
        </button>
      </div>
    </div>
  )
}
