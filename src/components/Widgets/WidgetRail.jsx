import { useGame } from '../../game/react/GameProvider.jsx'
import InfoTip from '../common/InfoTip.jsx'
import './WidgetRail.css'

/**
 * Far-right widget rail — a vertical stack of framed icon buttons floating on the
 * right edge of the tableau window. Widgets surface here contextually:
 *  - the Victory trophy re-opens a hidden victory popup;
 *  - the Progress flask re-summons a hidden advancement chooser.
 */
export default function WidgetRail({ victoryHidden, onShowVictory }) {
  const game = useGame()
  const sel = game.data.selection
  const showTrophy = game.data.won && victoryHidden
  const showProgress = sel && sel.type === 'progress' && sel.stage === 'choose' && sel.hidden

  if (!showTrophy && !showProgress) return null

  return (
    <div className="widget-rail">
      {showProgress && (
        <InfoTip className="widget-tip" title="Advancement" text="Show the advancement choices.">
          <button className="widget-btn frame-box-dark" onClick={() => game.showSelection()} aria-label="Advancement">
            <img className="widget-icon" src="/sprites/icons/progress.png" alt="" />
          </button>
        </InfoTip>
      )}
      {showTrophy && (
        <InfoTip className="widget-tip" title="Victory" text="Show the victory screen.">
          <button className="widget-btn frame-box-dark" onClick={onShowVictory} aria-label="Victory">
            <span className="widget-glyph">🏆</span>
          </button>
        </InfoTip>
      )}
    </div>
  )
}
