import { useGame } from '../../game/react/GameProvider.jsx'
import { UNIT_DEFS, UNIT_ORDER } from '../../game/data/units.js'
import { BUILDING_DEFS, BUILDING_ORDER } from '../../game/data/buildings.js'
import IconText from '../common/IconText.jsx'
import './BuildPanel.css'

/** Left panel: found cities, hire units, raise buildings, open upgrades. Always
 *  available while planning (there is no combat phase). */
export default function BuildPanel() {
  const game = useGame()
  if (game.won || game.defeated) return null

  const sel = game.selection
  if (sel?.type === 'placement') {
    const label = sel.kind === 'city' ? 'City' : UNIT_DEFS[sel.kind]?.name ?? BUILDING_DEFS[sel.kind]?.name
    return (
      <div className="build-panel placing">
        <div className="bp-hint">Placing <b>{label}</b> — click a highlighted tile.</div>
        <button className="bp-cancel" onClick={() => game.cancelSelection()}>Cancel</button>
      </div>
    )
  }

  const units = UNIT_ORDER.filter((c) => game.unlockedClasses.has(c))
  const buildings = BUILDING_ORDER.filter((b) => game.unlockedBuildings.has(b))
  return (
    <div className="build-panel">
      <div className="bp-head">Build</div>

      <div className="bp-section">Settlement</div>
      <BuildBtn game={game} kind="city" name="Found City" blurb="Works the land — grows pop, pumps :gold: and :progress:." />

      <div className="bp-section">Units</div>
      {units.map((c) => <BuildBtn key={c} game={game} kind={c} name={UNIT_DEFS[c].name} blurb={UNIT_DEFS[c].blurb} />)}

      {buildings.length > 0 && <div className="bp-section">Buildings</div>}
      {buildings.map((b) => <BuildBtn key={b} game={game} kind={b} name={BUILDING_DEFS[b].name} blurb={BUILDING_DEFS[b].blurb} />)}

      <div className="bp-spacer" />
      <button className="bp-upgrades" onClick={() => game.toggleUpgrade()}>⚒ Upgrades</button>
    </div>
  )
}

function BuildBtn({ game, kind, name, blurb }) {
  const cost = game.buildCost(kind)
  const can = game.canBuild(kind)
  return (
    <button className={`bp-build${can ? '' : ' poor'}`} disabled={!can} onClick={() => game.beginBuild(kind)}
      title={undefined}>
      <span className="bp-name">{name}</span>
      <span className="bp-cost"><img src="/sprites/icons/gold.png" alt="gold" />{cost}</span>
      <span className="bp-blurb"><IconText>{blurb}</IconText></span>
    </button>
  )
}
