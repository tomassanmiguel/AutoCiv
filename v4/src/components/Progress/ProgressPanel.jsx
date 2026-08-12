import { useGame } from '../../game/react/GameProvider.jsx'
import { FLAVOR_META } from '../../game/data/progress.js'
import { ERA_NAMES } from '../../game/data/config.js'
import IconText from '../common/IconText.jsx'
import './ProgressPanel.css'

/** The research board. Pick ONE lane to commit to; progress income fills its
 *  current tech. Completing any lane's Renaissance ascendancy wins the run. */
export default function ProgressPanel() {
  const game = useGame()
  const forced = game.pickingResearch
  if (!game.ui.progress && !forced) return null
  const status = game.flavorStatus()
  const close = () => { if (!forced) game.toggleProgress() }

  return (
    <div className={`prog-backdrop${forced ? ' forced' : ''}`} onClick={close}>
      <div className="prog-panel" onClick={(e) => e.stopPropagation()}>
        <div className="prog-head">
          <h2>{forced ? 'Choose your next research' : 'Research'}</h2>
          <span className="prog-hint">{forced
            ? 'Your last tech completed — pick the next. Reach any Renaissance ascendancy to win.'
            : 'Pick a lane to research. Reach any Renaissance ascendancy to win.'}</span>
          {!forced && <button className="prog-close" onClick={() => game.toggleProgress()}>✕</button>}
        </div>
        <div className="prog-cols">
          {status.map((s) => {
            const m = FLAVOR_META[s.flavor]
            const clickable = !s.complete
            return (
              <button key={s.flavor}
                className={`prog-col${s.active ? ' active' : ''}${s.complete ? ' complete' : ''}`}
                style={{ '--flavor': m.color }}
                disabled={!clickable}
                onClick={() => game.setResearch(s.flavor)}>
                <div className="pcol-head">
                  <img src={m.icon} alt="" />
                  <span>{m.name}</span>
                  <span className="pcol-era">{s.complete ? '★' : `${s.era}/${ERA_NAMES.length}`}</span>
                </div>
                <div className="pcol-blurb"><IconText>{m.blurb}</IconText></div>
                {s.adv && (
                  <div className="pcol-next">
                    <div className="pcol-next-name">{ERA_NAMES[s.era]}: {s.adv.name}</div>
                    <div className="pcol-next-desc"><IconText>{s.adv.desc}</IconText></div>
                    <div className="pcol-next-cost"><img src="/sprites/icons/progress.png" alt="" />{s.cost}</div>
                  </div>
                )}
                <div className="pcol-ladder">
                  {ERA_NAMES.map((era, i) => (
                    <span key={i} className={`pcol-pip${i < s.era ? ' done' : ''}${i === s.era && !s.complete ? ' next' : ''}${i === ERA_NAMES.length - 1 ? ' asc' : ''}`}
                      title={era} />
                  ))}
                </div>
                {s.active && <div className="pcol-tag">RESEARCHING</div>}
                {s.complete && <div className="pcol-tag win">ASCENDED</div>}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
