import InfoTip from '../common/InfoTip.jsx'
import { UNIT_DEFS, PALACE_ICON, CITY_ICON } from '../../game/data/units.js'
import './PieceCard.css'

const ATK = '/sprites/icons/attack.png'
const DEF = '/sprites/icons/defense.png'

/** Def reddens as HP drops, so damage reads at a glance. */
function defColor(hp, maxHp) {
  const f = Math.max(0, Math.min(1, hp / maxHp))
  return { color: `color-mix(in srgb, #ff6b5a ${Math.round((1 - f) * 100)}%, #dfe6f2)` }
}

function iconFor(piece) {
  if (piece.side === 'player') return UNIT_DEFS[piece.cls]?.icon
  if (piece.side === 'palace') return PALACE_ICON
  if (piece.side === 'city') return CITY_ICON
  return null
}

/**
 * A combat piece on a hex — a player unit, an enemy, a city or the palace.
 * Shows the class SYMBOL, name, atk/hp, an HP bar and a COOLDOWN bar (progress to
 * its next act). Coloured by flavour (player class), red (enemy) or gold (city).
 */
export default function PieceCard({ piece, x, y, size, acting = false, embarked = false, slideDelay = false }) {
  const side = piece.side
  const isCity = side === 'city' || side === 'palace'
  const def = side === 'player' ? UNIT_DEFS[piece.cls] : null
  const color = def?.flavor ?? (side === 'enemy' ? '#d85a5a' : '#e6c15a')
  const icon = iconFor(piece)
  const canAttackEmbarked = piece.embarkAttack
  // The bash replays whenever `lastAttackSeq` changes (the keyed wrapper remounts),
  // so it fires on every attack — not only for the last attacker of the tick.
  const hasAttacked = piece.lastAttackSeq != null
  const dir = piece.lastAttackDir ?? { x: 0, y: -1 }

  const cdMax = piece.cd ?? piece.yieldCd ?? 0
  const cdCur = piece.cd != null ? piece.cdTimer : piece.yieldTimer
  const cdFrac = cdMax > 0 ? Math.max(0, Math.min(1, 1 - cdCur / cdMax)) : 0

  const tip = (
    <div>
      <div className="pc-tip-sub">
        {side === 'palace' ? 'Your seat of power — if it falls, the run ends.'
          : side === 'city' ? 'A city — grows pop and pumps gold + progress.'
            : side === 'enemy' ? (embarked ? (canAttackEmbarked ? 'At sea — a Specialist, and still deadly.' : 'Embarked — cannot attack, and exposed to naval/air.') : piece.name)
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
      style={{ left: x, top: y, width: size, height: size * 0.78, transitionDelay: slideDelay ? 'var(--bash-dur)' : '0s' }}
      title={piece.name}
      text={tip}
    >
      <div className={`pc-lunge${hasAttacked ? ' attacking' : ''}`} key={piece.lastAttackSeq ?? 'idle'}
        style={{ '--lx': dir.x ?? 0, '--ly': dir.y ?? 0 }}>
        <div
          className={`piece-card ${side}${piece.dead ? ' dead' : ''}${isCity ? ' city-card' : ''}${acting ? ' acting' : ''}${embarked ? ' embarked' : ''}`}
          style={{ '--flavor': color }}
        >
          {embarked && <span className="pc-embark" title={canAttackEmbarked ? 'At sea (Specialist)' : 'Embarked — exposed'}>🌊</span>}
          {icon && <img className="pc-icon" src={icon} alt="" />}
          <div className="pc-name">{piece.name}</div>
          <div className="pc-stats">
            {piece.atk > 0 && <span><img src={ATK} alt="" />{piece.atk}</span>}
            <span style={defColor(piece.hp, piece.maxHp)}><img src={DEF} alt="" />{Math.max(0, Math.round(piece.hp))}</span>
          </div>
          <div className="pc-hpbar"><span style={{ width: `${Math.max(0, (piece.hp / piece.maxHp) * 100)}%` }} /></div>
          <div className="pc-cdbar"><span style={{ width: `${cdFrac * 100}%` }} /></div>
        </div>
      </div>
    </InfoTip>
  )
}
