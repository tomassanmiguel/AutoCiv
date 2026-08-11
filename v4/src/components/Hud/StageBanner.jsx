import { useGame } from '../../game/react/GameProvider.jsx'
import { STAGES, STAGE_COUNT } from '../../game/world/regions.js'
import './StageBanner.css'

/** Reads out the current known-world stage — v2's era banner, repurposed. */
export default function StageBanner() {
  const game = useGame()
  const stage = game.stage
  return (
    <div className="stage-banner">
      <span className="stage-banner-name">{STAGES[stage].name}</span>
      <span className="stage-banner-index">{stage + 1}/{STAGE_COUNT}</span>
    </div>
  )
}
