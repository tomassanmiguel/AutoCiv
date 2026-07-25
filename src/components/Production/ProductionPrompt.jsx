import { useGame } from '../../game/react/GameProvider.jsx'
import { UNIT_DEFS } from '../../game/data/units.js'
import { defOf } from '../../game/data/buildings.js'
import IconText from '../common/IconText.jsx'
import './ProductionPrompt.css'

/**
 * Small non-blocking prompt for the production (build) flow. In 'pick' the roster
 * flashes yellow (choose what to build); in 'place' the valid tiles flash yellow
 * (empty) / red (replace) on the tableau. Skip declines; Back returns to picking.
 *
 * A wonder in flight is offered here too — the FIRST pick places its incomplete
 * structure, later picks advance it. A destroyed wonder must be repaired first.
 */
export default function ProductionPrompt() {
  const game = useGame()
  const sel = game.data.selection
  if (!sel || sel.type !== 'production') return null

  if (sel.stage === 'pick') {
    const w = game.data.civilization.wonder
    const wDef = w ? defOf(w.key) : null
    // Wonder button state: place it (first pick), advance it, or blocked until repaired.
    let wonderBtn = null
    if (w && wDef) {
      const damaged = w.placed && w.inst?.damaged
      const label = !w.placed
        ? `Place ${wDef.name}`
        : damaged
          ? `${wDef.name} — repair first`
          : `Build ${wDef.name} (${w.buildsLeft} left)`
      wonderBtn = (
        <button
          className={`prod-btn wonder frame-box-dark${damaged ? ' disabled' : ''}`}
          disabled={!!damaged}
          onClick={() => game.pickWonder()}
          title={damaged ? 'The structure was destroyed — repair it with gold before building continues.' : 'Spend this build on the wonder.'}
        >
          <img className="prod-wonder-icon" src="/sprites/ui/wonder.png" alt="" />
          {label}
        </button>
      )
    }
    return (
      <div className="prod-prompt-wrap">
        <div className="prod-prompt frame-box">
          <div className="prod-prompt-title">Production!</div>
          <div className="prod-prompt-hint">Choose a highlighted unit or building to build.</div>
          {wonderBtn}
          <button className="prod-btn frame-box-dark" onClick={() => game.cancelBuild()}>Skip</button>
        </div>
      </div>
    )
  }

  const def = sel.chosen.kind === 'unit' ? UNIT_DEFS[sel.chosen.key] : defOf(sel.chosen.key)
  const isWonder = !!sel.chosen.wonder
  return (
    <div className="prod-prompt-wrap">
      <div className="prod-prompt frame-box">
        <div className="prod-prompt-title">Place {def.name}</div>
        <div className="prod-prompt-hint">
          {isWonder
            ? <IconText>{'Click a highlighted tile to raise the incomplete wonder.'}</IconText>
            : 'Click a highlighted tile — yellow to build, red to replace.'}
        </div>
        <div className="prod-prompt-actions">
          <button className="prod-btn frame-box-dark" onClick={() => game.backToBuildPick()}>Back</button>
          <button className="prod-btn frame-box-dark" onClick={() => game.cancelBuild()}>Skip</button>
        </div>
      </div>
    </div>
  )
}
