import { useGame } from '../../game/react/GameProvider.jsx'
import { eraTitle } from '../../game/data/eras.js'
import './EraBanner.css'

/** Small parchment plaque (upper-left) showing the current era, e.g. "Stone Age". */
export default function EraBanner() {
  const game = useGame()
  return (
    <div className="era-banner frame-box">
      <span className="era-banner-label">{eraTitle(game.era)}</span>
    </div>
  )
}
