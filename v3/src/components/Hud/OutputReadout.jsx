import { useGame } from '../../game/react/GameProvider.jsx'
import { RES_ICON } from '../../game/world/terrain.js'
import { THRESHOLD_RESOURCES } from '../../game/data/resources.js'
import InfoTip from '../common/InfoTip.jsx'
import './OutputReadout.css'

// Output is the per-tick yield of everything you CONTROL — improvements double
// a tile, cities add their population on top.
const TIP = {
  food: 'Expands your civilization. Spend :food: to claim new tiles and to grow cities.',
  production: 'Builds wonders and fortifications.',
  gold: 'Repairs, upgrades, and repositioning your army.',
  progress: 'Advances the progress web, unlocking buildings, units and new frontiers.',
}

// Outputs are floats; show one decimal but never round UP, so a bar that is
// visibly filling never reads as a rate it isn't earning.
const fmtRate = (n) => {
  const f = Math.floor(n * 10) / 10
  return `+${Number.isInteger(f) ? f : f.toFixed(1)}`
}

/**
 * Corner readout of the four outputs. The three THRESHOLD resources show their
 * level and a bar toward the next threshold (v2's panel treatment); gold is a
 * plain stock, so it just shows the total.
 */
export default function OutputReadout() {
  const game = useGame()
  const output = game.output
  const res = game.resources

  return (
    <div className="output-readout">
      {THRESHOLD_RESOURCES.map((key) => {
        const s = res[key]
        const pct = Math.max(0, Math.min(100, (s.value / s.threshold) * 100))
        return (
          <InfoTip
            key={key}
            className="output-row"
            title={key[0].toUpperCase() + key.slice(1)}
            text={
              <div>
                <div>{TIP[key]}</div>
                <div className="output-tip-nums">
                  Level {s.level} · {Math.floor(s.value)} / {Math.round(s.threshold)} toward the next
                </div>
              </div>
            }
          >
            <img src={RES_ICON[key]} alt={key} />
            <span className="output-level">{s.level}</span>
            <span className="output-bar"><span style={{ width: `${pct}%` }} /></span>
            <span className="output-rate">{fmtRate(output[key])}</span>
          </InfoTip>
        )
      })}

      <InfoTip className="output-row gold" title="Gold" text={TIP.gold}>
        <img src={RES_ICON.gold} alt="gold" />
        <span className="output-total">{Math.floor(res.gold.value)}</span>
        <span className="output-rate">{fmtRate(output.gold)}</span>
      </InfoTip>
    </div>
  )
}
