import { useGame } from '../../game/react/GameProvider.jsx'
import { FLAVOR_META } from '../../game/data/progress.js'
import './ProgressPanel.css'

/** The summonable five-column record of what you hold and your path to the win. */
export default function ProgressPanel() {
  const game = useGame()
  if (!game.ui.progress) return null
  const status = game.flavorStatus()

  return (
    <div className="prog-backdrop" onClick={() => game.toggleProgress()}>
      <div className="prog-panel" onClick={(e) => e.stopPropagation()}>
        <div className="prog-head">
          <h2>Progress</h2>
          <button className="prog-close" onClick={() => game.toggleProgress()}>✕</button>
        </div>
        <div className="prog-cols">
          {status.map((s) => {
            const m = FLAVOR_META[s.flavor]
            return (
              <div key={s.flavor} className="prog-col" style={{ '--flavor': m.color }}>
                <div className="pcol-head">
                  <span>{m.name}</span>
                  <span className="pcol-era">{s.complete ? '✓' : `${s.era}/${s.total}`}</span>
                </div>
                <div className="pcol-blurb">{m.blurb}</div>
                <div className="pcol-ladder">
                  {Array.from({ length: s.total }).map((_, i) => (
                    <div key={i} className={`pcol-step${i < s.era ? ' done' : ''}${i === s.era && !s.complete ? ' next' : ''}`}>
                      Era {i + 1}
                    </div>
                  ))}
                </div>
                {s.complete && <div className="pcol-done">COMPLETE</div>}
              </div>
            )
          })}
        </div>
        <div className="prog-foot">Complete all five tracks to win.</div>
      </div>
    </div>
  )
}
