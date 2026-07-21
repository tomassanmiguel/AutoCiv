import { useGame } from '../../game/react/GameProvider.jsx'
import './VictoryScreen.css'

/**
 * Victory popup — appears once the final (Infinity) era is completed
 * (`game.data.won`). "Hide" tucks it away so the finished map stays inspectable
 * (and reveals the trophy widget in the right-hand rail, which brings it back);
 * "Return to Title" leaves the run.
 */
export default function VictoryScreen({ hidden, onHide, onExit }) {
  const game = useGame()
  if (!game.data.won || hidden) return null

  return (
    <div className="victory-backdrop">
      <div className="victory-panel frame-box">
        <h1 className="victory-title">Victory</h1>
        <div className="victory-actions">
          <button className="victory-btn frame-box-dark" onClick={onHide}>Hide</button>
          <button className="victory-btn frame-box-dark" onClick={onExit}>Return to Title</button>
        </div>
      </div>
    </div>
  )
}
