import { useGame } from '../../game/react/GameProvider.jsx'
import InfoTip from '../common/InfoTip.jsx'
import './WidgetRail.css'

/**
 * Far-right widget rail — a vertical stack of framed icon buttons floating on the
 * right edge of the tableau window. Widgets surface here contextually. For now it
 * holds the Victory trophy: once the game is won and the victory popup has been
 * hidden, the trophy re-opens it.
 */
export default function WidgetRail({ victoryHidden, onShowVictory }) {
  const game = useGame()
  const showTrophy = game.data.won && victoryHidden

  if (!showTrophy) return null

  return (
    <div className="widget-rail">
      <InfoTip className="widget-tip" title="Victory" text="Show the victory screen.">
        <button className="widget-btn frame-box-dark" onClick={onShowVictory} aria-label="Victory">
          <span className="widget-glyph">🏆</span>
        </button>
      </InfoTip>
    </div>
  )
}
