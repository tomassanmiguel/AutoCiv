import { useGame } from '../../game/react/GameProvider.jsx'
import { RES_ICON, RESOURCES, spriteUrl } from '../../game/world/terrain.js'
import NineSlice from '../common/NineSlice.jsx'
import InfoTip from '../common/InfoTip.jsx'
import './UIPanel.css'

const FRAME = { light: '/sprites/ui/box.png', dark: '/sprites/ui/box-dark.png' }
const FRAME_SLICE = 205 // border inset in source px (frames are 1254x1254)

// v3 drops legitimacy — the palace at the centre of the map IS the fail state.
// The four remaining resources map 1:1 onto terrain (see world/terrain.js).
const RES_TIP = {
  food: 'Expands your civilization. Spend :food: to claim new tiles and to grow cities.',
  production: 'Builds wonders and fortifications.',
  gold: 'Repairs, upgrades, and repositioning your army.',
  progress: 'Advances the tech tree, unlocking buildings, units and new frontiers.',
}

/**
 * The civilization panel.
 *
 * While v3 is map-first this shows the KNOWN WORLD's potential: the total base
 * yield of every revealed tile, plus a terrain census. That makes it a design
 * instrument — reveal a stage and read straight off what that frontier is worth.
 * The roster tabs (units/buildings/policies/population) are intentionally gone
 * until the v3 content model is decided.
 */
export default function UIPanel() {
  const game = useGame()
  const known = game.known

  return (
    <NineSlice
      className="ui-panel"
      src={FRAME.light}
      slice={FRAME_SLICE}
      width={40}
      fill="#e9dcbd"
    >
      <div className="panel-inner">
        <header className="panel-head">
          <h2>Known World</h2>
          <span className="panel-sub">potential yield per tick</span>
        </header>

        <NineSlice className="panel-box" src={FRAME.dark} slice={FRAME_SLICE} width={16}>
          <div className="res-list">
            {RESOURCES.map((res) => (
              <InfoTip key={res} text={RES_TIP[res]}>
                <div className="res-row">
                  <img className="res-icon" src={RES_ICON[res]} alt={res} />
                  <span className="res-name">{res}</span>
                  <span className="res-value">{known.yields[res]}</span>
                </div>
              </InfoTip>
            ))}
          </div>
        </NineSlice>

        <header className="panel-head">
          <h2>Terrain</h2>
          <span className="panel-sub">{known.tiles.length} tiles revealed</span>
        </header>

        <NineSlice className="panel-box grow" src={FRAME.dark} slice={FRAME_SLICE} width={16}>
          {/* Late stages reveal 20+ terrains; two columns keeps them all visible
              without scrolling (the panel must never scroll). */}
          <div className={`legend-list${known.legend.length > 12 ? ' two-col' : ''}`}>
            {known.legend.map(({ key, count, def }) => (
              <div className="legend-row" key={key}>
                <span className="legend-swatch" style={{ backgroundImage: `url(${spriteUrl(key)})` }} />
                <span className="legend-name">{def.name}</span>
                {def.yield ? (
                  <span className="legend-yield">
                    +{def.yield.amount}
                    <img src={RES_ICON[def.yield.res]} alt={def.yield.res} />
                  </span>
                ) : (
                  <span className="legend-yield none">{def.passable ? '—' : 'blocks'}</span>
                )}
                <span className="legend-count">{count}</span>
              </div>
            ))}
          </div>
        </NineSlice>
      </div>
    </NineSlice>
  )
}
