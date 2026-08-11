import { useGame } from '../../game/react/GameProvider.jsx'
import { FLAVOR_META } from '../../game/data/progress.js'
import IconText from '../common/IconText.jsx'
import './DraftOverlay.css'

/** The in-combat progress draft — pauses combat, instant-apply cards. */
export default function DraftOverlay() {
  const game = useGame()
  const sel = game.selection
  if (sel?.type !== 'draft') return null

  return (
    <div className="draft-backdrop">
      <div className="draft-panel">
        <h2>Choose an Advancement</h2>
        <div className="draft-cards">
          {sel.options.map((a) => {
            const m = FLAVOR_META[a.flavor]
            return (
              <button key={a.id} className="draft-card" style={{ '--flavor': m.color }} onClick={() => game.draftPick(a)}>
                <div className="dc-flavor">{m.name} · Era {a.era + 1}</div>
                <div className="dc-name">{a.name}</div>
                <div className="dc-desc"><IconText>{a.desc}</IconText></div>
              </button>
            )
          })}
        </div>
        <button className="draft-skip" onClick={() => game.draftSkip()}>Skip</button>
      </div>
    </div>
  )
}
