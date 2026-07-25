import { useGame } from '../../game/react/GameProvider.jsx'
import { ENEMY_DEFS } from '../../game/data/enemies.js'
import './BossBar.css'

/**
 * An intimidating health bar pinned across the top of the battlefield whenever a boss
 * (Titan / Flagship / Azazoth) is on the field — during the development preview and the
 * fight. The boss's own on-tile card is name-only, so its HP is surfaced here.
 */
export default function BossBar() {
  const game = useGame()
  const boss = game.data.enemies?.find((e) => e.boss && !e.breached && !e.damaged)
  if (!boss) return null
  const def = ENEMY_DEFS[boss.key]
  const pct = boss.maxHp > 0 ? Math.max(0, Math.min(1, boss.hp / boss.maxHp)) : 0
  return (
    <div className="boss-bar">
      <div className="boss-bar-name">{def?.name ?? boss.name}</div>
      <div className="boss-bar-track">
        <div className="boss-bar-fill" style={{ width: `${pct * 100}%` }} />
        <span className="boss-bar-hp">{Math.max(0, Math.ceil(boss.hp)).toLocaleString()} / {boss.maxHp.toLocaleString()}</span>
      </div>
    </div>
  )
}
