import { useGame } from '../../game/react/GameProvider.jsx'
import { RESOURCES, RES_ICON } from '../../game/world/terrain.js'
import InfoTip from '../common/InfoTip.jsx'
import './OutputReadout.css'

// Until the economy exists, "output" is the total base yield of every revealed
// tile — the map's potential rather than a live per-tick rate.
const TIP = {
  food: 'Expands your civilization. Spend :food: to claim new tiles and to grow cities.',
  production: 'Builds wonders and fortifications.',
  gold: 'Repairs, upgrades, and repositioning your army.',
  progress: 'Advances the progress web, unlocking buildings, units and new frontiers.',
}

/** Compact corner readout of the four output types. */
export default function OutputReadout() {
  const game = useGame()
  const { yields } = game.known

  return (
    <div className="output-readout">
      {RESOURCES.map((res) => (
        <InfoTip key={res} className="output-cell" text={TIP[res]}>
          <img src={RES_ICON[res]} alt={res} />
          <span className="output-value">{yields[res]}</span>
        </InfoTip>
      ))}
    </div>
  )
}
