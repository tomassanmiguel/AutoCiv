import InfoTip from '../common/InfoTip.jsx'
import { UNIT_DEFS } from '../../game/data/units.js'
import './PieceCard.css'

const ATK = '/sprites/icons/attack.png'
const DEF = '/sprites/icons/defense.png'

/** Def reddens as HP drops, so damage reads at a glance. */
function defColor(hp, maxHp) {
  const f = Math.max(0, Math.min(1, hp / maxHp))
  return { color: `color-mix(in srgb, #ff6b5a ${Math.round((1 - f) * 100)}%, #dfe6f2)` }
}

/**
 * A combat piece on a hex — a player unit, an enemy, a city or the palace.
 * Rendered as a coloured badge (flavour for player class, red for enemy, gold
 * for a city/palace) with name + atk/hp + an HP bar. No dependency on per-class
 * sprites, so a new class never renders a broken image.
 */
export default function PieceCard({ piece, turn, x, y, size, acting = false }) {
  const side = piece.side // 'player' | 'enemy' | 'city' | 'palace'
  const isCity = side === 'city' || side === 'palace'
  const def = side === 'player' ? UNIT_DEFS[piece.cls] : null
  const color = def?.flavor ?? (side === 'enemy' ? '#d85a5a' : '#e6c15a')
  const attacking = piece.lastAttackSeq != null && piece.lastAttackSeq === turn
  const dir = piece.lastAttackDir ?? { q: 0, r: -1 }

  const tip = (
    <div>
      <div className="pc-tip-sub">
        {side === 'palace' ? 'Your seat of power — if it falls, the run ends.'
          : side === 'city' ? 'A city — grows pop and pumps gold + progress.'
            : side === 'enemy' ? `${piece.name} · ${piece.domain} domain`
              : def?.blurb}
      </div>
      <div className="pc-tip-stats">
        {piece.atk > 0 && <span><img src={ATK} alt="attack" />{piece.atk}</span>}
        <span><img src={DEF} alt="defense" />{Math.max(0, Math.round(piece.hp))} / {piece.maxHp}</span>
      </div>
    </div>
  )

  return (
    <InfoTip
      className="pc-anchor"
      style={{ left: x, top: y, width: size, height: size * 0.72 }}
      title={piece.name}
      text={tip}
    >
      <div className={`pc-lunge${attacking ? ' attacking' : ''}`} key={piece.lastAttackSeq ?? 0}
        style={{ '--lx': dir.q ?? 0, '--ly': dir.r ?? 0 }}>
        <div
          className={`piece-card ${side}${piece.dead ? ' dead' : ''}${isCity ? ' city-card' : ''}${acting ? ' acting' : ''}`}
          style={{ '--flavor': color }}
        >
          <div className="pc-name">{piece.name}</div>
          <div className="pc-stats">
            {piece.atk > 0 && <span><img src={ATK} alt="" />{piece.atk}</span>}
            <span style={defColor(piece.hp, piece.maxHp)}><img src={DEF} alt="" />{Math.max(0, Math.round(piece.hp))}</span>
          </div>
          <div className="pc-hpbar"><span style={{ width: `${Math.max(0, (piece.hp / piece.maxHp) * 100)}%` }} /></div>
        </div>
      </div>
    </InfoTip>
  )
}
