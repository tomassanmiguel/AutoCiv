import './IconText.css'

// Inline-icon tokens for gameplay prose. Write `:token:` in any description/effect
// and it renders as the matching icon inline (scaling with the surrounding text).
// PATTERN: gameplay descriptions should use these icons instead of the words —
// resources, stats, and unit/building/policy/pop TYPES. See CLAUDE.md.
const ICON_TOKENS = {
  // resources
  food: '/sprites/icons/food.png',
  gold: '/sprites/icons/gold.png',
  production: '/sprites/icons/production.png',
  progress: '/sprites/icons/progress.png',
  legitimacy: '/sprites/icons/legitimacy.png',
  // unit/building stats
  speed: '/sprites/icons/speed.png',
  attack: '/sprites/icons/attack.png',
  defense: '/sprites/icons/defense.png',
  range: '/sprites/icons/range.png',
  crit: '/sprites/icons/attack.png', // placeholder — no dedicated crit icon yet
  poison: '/sprites/ui/trap.png',    // placeholder — no dedicated poison icon yet
  // unit type categories
  melee: '/sprites/ui/melee.png',
  ranged: '/sprites/ui/ranged.png',
  cavalry: '/sprites/ui/cavalry.png',
  siege: '/sprites/ui/siege.png',
  utility: '/sprites/ui/utility.png',
  naval: '/sprites/ui/boat.png',
  aerial: '/sprites/ui/aerial.png',
  astral: '/sprites/ui/astral.png',
  astral_utility: '/sprites/ui/astral-utility.png',
  fort: '/sprites/ui/defense.png',
  // other slot types
  policy: '/sprites/ui/policy.png',
  pop: '/sprites/ui/pop.png',
  trap: '/sprites/ui/trap.png',
  wonder: '/sprites/ui/wonder.png',
  building: '/sprites/ui/building.png',
  road: '/sprites/ui/utility-building.png',
}

const TOKEN_RE = /(:[a-z_]+:)/g

/** Render a string, replacing :token: with its inline icon. Non-strings pass through. */
export default function IconText({ children, className = '' }) {
  if (typeof children !== 'string') return <>{children}</>
  const parts = children.split(TOKEN_RE)
  return (
    <span className={className}>
      {parts.map((p, i) => {
        const m = /^:([a-z_]+):$/.exec(p)
        const src = m && ICON_TOKENS[m[1]]
        return src ? <img key={i} className="itext-icon" src={src} alt={m[1]} /> : p
      })}
    </span>
  )
}
