import { useGame } from '../../game/react/GameProvider.jsx'
import { UNIT_DEFS, UNIT_ORDER } from '../../game/data/units.js'
import { CITY_COST, UNIT_COSTS } from '../../game/data/config.js'
import './BuildPanel.css'

/** Prep-only left panel: found cities, hire units, open upgrades, begin the wave. */
export default function BuildPanel() {
  const game = useGame()
  if (game.phase !== 'prep' || game.won || game.defeated) return null

  const sel = game.selection
  if (sel?.type === 'placement') {
    return (
      <div className="build-panel placing">
        <div className="bp-hint">Placing <b>{sel.kind === 'city' ? 'City' : UNIT_DEFS[sel.kind].name}</b> — click a highlighted tile.</div>
        <button className="bp-cancel" onClick={() => game.cancelSelection()}>Cancel</button>
      </div>
    )
  }

  const classes = UNIT_ORDER.filter((c) => game.unlockedClasses.has(c))
  return (
    <div className="build-panel">
      <div className="bp-head">Prepare · Wave {game.wave}</div>
      <div className="bp-section">Build</div>
      <BuildBtn game={game} kind="city" label="Found City" cost={CITY_COST} />
      {classes.map((c) => <BuildBtn key={c} game={game} kind={c} label={`Hire ${UNIT_DEFS[c].name}`} cost={UNIT_COSTS[c]} />)}
      <button className="bp-upgrades" onClick={() => game.toggleUpgrade()}>⚒ Upgrades</button>
      <div className="bp-spacer" />
      <button className="bp-begin" onClick={() => game.beginWave()}>Begin Wave ⚔</button>
    </div>
  )
}

function BuildBtn({ game, kind, label, cost }) {
  const can = game.canBuild(kind)
  return (
    <button className={`bp-build${can ? '' : ' poor'}`} disabled={!can} onClick={() => game.beginBuild(kind)}>
      <span>{label}</span>
      <span className="bp-cost"><img src="/sprites/icons/gold.png" alt="gold" />{cost}</span>
    </button>
  )
}
