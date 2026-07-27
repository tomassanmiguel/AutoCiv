import InfoTip from '../common/InfoTip.jsx'
import './PieceCard.css'

const STAT = {
  atk: '/sprites/icons/attack.png',
  def: '/sprites/icons/defense.png',
  range: '/sprites/icons/range.png',
  speed: '/sprites/icons/speed.png',
}
const TYPE_ICON = {
  melee: '/sprites/ui/melee.png',
  ranged: '/sprites/ui/ranged.png',
  cavalry: '/sprites/ui/cavalry.png',
  palace: '/sprites/ui/wonder.png',
}

/** Def reddens as HP drops — the v2 treatment, so damage reads at a glance. */
function defColor(hp, maxHp) {
  const f = Math.max(0, Math.min(1, hp / maxHp))
  return { color: `color-mix(in srgb, #ff6b5a ${Math.round((1 - f) * 100)}%, #dfe6f2)` }
}

/**
 * A unit / enemy / palace card sitting on a hex. Borrows v2's TileCard: name +
 * stat icons, Def tinted by remaining HP, a lunge on attack, and a grey-out on
 * death.
 *
 * The lunge wrapper is KEYED by `lastAttackSeq` so it remounts and replays each
 * time the piece attacks, and only carries `.attacking` when it struck on this
 * very turn — otherwise every card would jerk whenever combat state changed.
 */
export default function PieceCard({ piece, turn, x, y, size, acting = false }) {
  const isPalace = piece.type === 'palace'
  const side = isPalace ? 'palace' : piece.side
  const attacking = piece.lastAttackSeq != null && piece.lastAttackSeq === turn
  const dir = piece.lastAttackDir ?? { dx: 0, dy: -1 }

  const tip = (
    <div>
      <div className="pc-tip-sub">
        {isPalace ? 'Your seat of power — if it falls, the run ends.'
          : piece.side === 'enemy'
            ? `${piece.tier} ${piece.type} · ${piece.domain} domain`
            : `${piece.type} · defender`}
      </div>
      <div className="pc-tip-stats">
        <span><img src={STAT.atk} alt="attack" />{piece.atk}</span>
        <span><img src={STAT.def} alt="defense" />{piece.hp} / {piece.maxHp}</span>
        <span><img src={STAT.range} alt="range" />{piece.range}</span>
        {!isPalace && <span><img src={STAT.speed} alt="speed" />{piece.acts}</span>}
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
      <div
        className={`pc-lunge${attacking ? ' attacking' : ''}`}
        key={piece.lastAttackSeq ?? 0}
        style={{ '--lx': dir.dx, '--ly': dir.dy }}
      >
        <div className={`piece-card ${side}${piece.dead ? ' dead' : ''}${isPalace ? ' palace-card' : ''}${acting ? ' acting' : ''}`}>
          <div className="pc-name">{piece.name}</div>
          <div className="pc-stats">
            <span><img src={STAT.atk} alt="" />{piece.atk}</span>
            <span style={defColor(piece.hp, piece.maxHp)}><img src={STAT.def} alt="" />{piece.hp}</span>
          </div>
          <div className="pc-hpbar">
            <span style={{ width: `${Math.max(0, (piece.hp / piece.maxHp) * 100)}%` }} />
          </div>
          {TYPE_ICON[piece.type] && <img className="pc-type" src={TYPE_ICON[piece.type]} alt="" />}
        </div>
      </div>
    </InfoTip>
  )
}
