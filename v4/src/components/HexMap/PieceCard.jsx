import './PieceCard.css'

const ATK = '/sprites/icons/attack.png'
const DEF = '/sprites/icons/defense.png'
const POP = '/sprites/ui/pop.png'

/** Def reddens as HP drops, so damage reads at a glance. */
function defColor(hp, maxHp) {
  const f = Math.max(0, Math.min(1, hp / maxHp))
  return { color: `color-mix(in srgb, #ff6b5a ${Math.round((1 - f) * 100)}%, #dfe6f2)` }
}

/**
 * A board piece on a hex — a player unit, a building, a city/palace or an enemy.
 * The piece object is pre-computed by HexMap and carries { side, name, icon,
 * color, atk, hp, maxHp, pop?, lastAttackSeq, lastAttackDir }. The bash replays
 * whenever `lastAttackSeq` changes (the keyed wrapper remounts). `ghost` renders
 * a forecast arrival (translucent, dashed) with no HP bar.
 */
export default function PieceCard({ piece, x, y, size, ghost = false, embarked = false }) {
  const side = piece.side
  const isPalace = side === 'palace'
  const isCity = side === 'city' || side === 'palace'
  const usePop = side === 'city' // cities show pop (their durability), not an HP bar
  const dir = piece.lastAttackDir ?? { x: 0, y: -1 }
  const hasAttacked = !ghost && piece.lastAttackSeq != null

  return (
    <div className="pc-anchor" style={{ left: x, top: y, width: size, height: size * 0.78 }}>
      <div className={`pc-lunge${hasAttacked ? ' attacking' : ''}`} key={ghost ? 'g' : (piece.lastAttackSeq ?? 'idle')}
        style={{ '--lx': dir.x ?? 0, '--ly': dir.y ?? 0 }}>
        <div
          className={`piece-card ${side}${piece.dead ? ' dead' : ''}${isCity ? ' city-card' : ''}${ghost ? ' ghost' : ''}${embarked ? ' embarked' : ''}`}
          style={{ '--flavor': piece.color }}
        >
          {embarked && <span className="pc-embark" title="Embarked — exposed">🌊</span>}
          {isPalace && <span className="pc-crown" title="Your capital — if it falls, the run ends">♛</span>}
          {isPalace && <span className="pc-pop" title="Population"><img src={POP} alt="" />{piece.pop}</span>}
          {piece.icon && <img className="pc-icon" src={piece.icon} alt="" />}
          <div className="pc-name">{piece.name}</div>
          {ghost ? (
            <div className="pc-incoming">incoming</div>
          ) : (
            <div className="pc-stats">
              {piece.atk > 0 && <span><img src={ATK} alt="" />{piece.atk}</span>}
              {usePop
                ? <span><img src={POP} alt="" />{piece.pop}</span>
                : <span style={defColor(piece.hp, piece.maxHp)}><img src={DEF} alt="" />{Math.max(0, Math.round(piece.hp))}{isPalace ? `/${piece.maxHp}` : ''}</span>}
            </div>
          )}
          {!ghost && !usePop && (
            <div className="pc-hpbar"><span style={{ width: `${Math.max(0, (piece.hp / piece.maxHp) * 100)}%` }} /></div>
          )}
        </div>
      </div>
    </div>
  )
}
