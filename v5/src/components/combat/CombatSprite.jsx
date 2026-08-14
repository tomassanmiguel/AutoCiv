// Hand-drawn SVG combat sprites — one sensible figure per (domain, stat), shared by
// both sides. The enemy re-uses the SAME art, recolored red via a CSS filter
// (see .lane-side.foe .cbt-sprite). Pure vector; scales crisply, themes cleanly.

const P = { light: '#dfe8f2', steel: '#7ea3cc', deep: '#3a5f8f', dark: '#22344f', gold: '#e6c877', wood: '#8a6a3a', flame: '#f0a63c', accent: '#c25a3a' }

// key `${domain}-${stat}` -> svg children.  stat: def = shield-type, atk = sword-type, bomb = ranged/ordnance
const S = {
  'land-def': (
    <>
      <path d="M24 5 L39 9 V24 Q39 37 24 44 Q9 37 9 24 V9 Z" fill={P.steel} stroke={P.dark} strokeWidth="1.5" />
      <path d="M24 5 L39 9 V24 Q39 37 24 44 Z" fill={P.deep} />
      <rect x="22.5" y="12" width="3" height="24" fill={P.gold} />
      <rect x="14" y="21" width="20" height="3" fill={P.gold} />
    </>
  ),
  'land-atk': (
    <>
      <polygon points="24,3 27,9 26,30 22,30 21,9" fill={P.light} stroke={P.dark} strokeWidth="1" />
      <rect x="15" y="29" width="18" height="3" rx="1.5" fill={P.gold} />
      <rect x="22" y="32" width="4" height="8" rx="1.5" fill={P.wood} />
      <circle cx="24" cy="42" r="2.4" fill={P.gold} />
    </>
  ),
  'land-bomb': (
    <>
      <path d="M15 5 Q35 24 15 43" fill="none" stroke={P.wood} strokeWidth="3.5" strokeLinecap="round" />
      <line x1="15" y1="5" x2="15" y2="43" stroke={P.light} strokeWidth="1.2" />
      <line x1="13" y1="24" x2="42" y2="24" stroke={P.light} strokeWidth="2" />
      <polygon points="42,24 35,20.5 35,27.5" fill={P.gold} />
    </>
  ),
  'sea-def': (
    <>
      <path d="M7 33 H41 L36 41 H12 Z" fill={P.dark} stroke="#000" strokeWidth="0.6" />
      <circle cx="15" cy="35" r="2.4" fill={P.gold} /><circle cx="24" cy="35" r="2.4" fill={P.steel} /><circle cx="33" cy="35" r="2.4" fill={P.gold} />
      <rect x="23" y="8" width="2" height="25" fill={P.wood} />
      <path d="M25 9 L37 31 H25 Z" fill={P.steel} stroke={P.dark} strokeWidth="0.8" />
      <rect x="28" y="14" width="3" height="8" fill={P.gold} /><rect x="26" y="17" width="7" height="2" fill={P.gold} />
    </>
  ),
  'sea-atk': (
    <>
      <path d="M7 33 H41 L36 41 H12 Z" fill={P.deep} stroke={P.dark} strokeWidth="1" />
      <rect x="23" y="8" width="2" height="25" fill={P.wood} />
      <path d="M25 9 L37 31 H25 Z" fill={P.light} stroke={P.dark} strokeWidth="0.8" />
      <path d="M22 12 L12 31 H22 Z" fill={P.steel} stroke={P.dark} strokeWidth="0.8" />
    </>
  ),
  'sea-bomb': (
    <>
      <path d="M7 34 H41 L36 41 H12 Z" fill={P.deep} stroke={P.dark} strokeWidth="1" />
      <rect x="18" y="26" width="14" height="6" rx="2" fill={P.dark} />
      <rect x="30" y="27" width="12" height="4" rx="2" fill={P.steel} stroke={P.dark} strokeWidth="0.6" />
      <circle cx="43" cy="29" r="3" fill={P.flame} opacity="0.9" /><circle cx="46" cy="29" r="1.6" fill={P.gold} />
    </>
  ),
  'sky-def': (
    <>
      <ellipse cx="25" cy="20" rx="17" ry="9" fill={P.steel} stroke={P.dark} strokeWidth="1.2" />
      <path d="M8 20 H42" stroke={P.deep} strokeWidth="1.4" />
      <polygon points="6,16 6,24 12,20" fill={P.gold} />
      <rect x="18" y="30" width="14" height="5" rx="2" fill={P.wood} />
      <line x1="20" y1="28.5" x2="20" y2="30" stroke={P.dark} /><line x1="30" y1="28.5" x2="30" y2="30" stroke={P.dark} />
    </>
  ),
  'sky-atk': (
    <>
      <polygon points="6,24 40,19 40,29" fill={P.light} stroke={P.dark} strokeWidth="1" />
      <polygon points="18,23 30,9 34,23" fill={P.deep} />
      <polygon points="18,25 30,39 34,25" fill={P.deep} />
      <polygon points="40,24 47,22 47,26" fill={P.gold} />
      <circle cx="12" cy="24" r="2" fill={P.steel} />
    </>
  ),
  'sky-bomb': (
    <>
      <polygon points="8,18 38,14 38,22" fill={P.light} stroke={P.dark} strokeWidth="1" />
      <polygon points="18,18 28,7 32,18" fill={P.deep} />
      <ellipse cx="26" cy="34" rx="4" ry="6" fill={P.dark} />
      <polygon points="24,30 28,30 26,26" fill={P.steel} />
      <polygon points="24,40 28,40 26,46" fill={P.flame} />
    </>
  ),
  'space-def': (
    <>
      <rect x="19" y="17" width="10" height="14" rx="2" fill={P.light} stroke={P.dark} strokeWidth="1" />
      <rect x="3" y="20" width="15" height="8" fill={P.deep} stroke={P.dark} strokeWidth="0.8" />
      <rect x="30" y="20" width="15" height="8" fill={P.deep} stroke={P.dark} strokeWidth="0.8" />
      <path d="M6 21 V27 M11 21 V27 M32 21 V27 M37 21 V27" stroke={P.steel} strokeWidth="0.8" />
      <circle cx="24" cy="11" r="3.4" fill={P.gold} /><line x1="24" y1="14" x2="24" y2="17" stroke={P.dark} />
    </>
  ),
  'space-atk': (
    <>
      <path d="M24 3 Q33 16 30 33 H18 Q15 16 24 3 Z" fill={P.light} stroke={P.dark} strokeWidth="1" />
      <circle cx="24" cy="17" r="3.4" fill={P.deep} stroke={P.dark} strokeWidth="0.8" />
      <polygon points="18,29 11,41 18,36" fill={P.steel} stroke={P.dark} strokeWidth="0.6" />
      <polygon points="30,29 37,41 30,36" fill={P.steel} stroke={P.dark} strokeWidth="0.6" />
      <polygon points="20,33 24,45 28,33" fill={P.flame} />
    </>
  ),
  'space-bomb': (
    <>
      <path d="M20 6 Q26 16 24 32 H14 Q12 16 20 6 Z" fill={P.light} stroke={P.dark} strokeWidth="1" />
      <polygon points="14,28 9,38 14,34" fill={P.steel} />
      <polygon points="16,32 19,42 22,32" fill={P.flame} />
      <rect x="28" y="16" width="4" height="14" rx="2" fill={P.gold} stroke={P.dark} strokeWidth="0.6" />
      <polygon points="28,16 32,16 30,10" fill={P.accent} />
      <polygon points="28,30 32,30 30,36" fill={P.flame} />
    </>
  ),
}

// Per-domain battlefield backdrop (drawn behind a lane).
const BG = {
  land: (
    <>
      <circle cx="345" cy="26" r="12" fill="#e9b96a" opacity="0.35" />
      <path d="M0 100 L0 70 Q70 50 150 66 T300 60 L400 74 L400 100 Z" fill="#0e1f0b" opacity="0.85" />
      <path d="M0 100 L0 84 Q100 70 200 82 T400 82 L400 100 Z" fill="#18280f" />
      <path d="M40 84 l4 -12 4 12 M120 82 l5 -14 5 14 M250 82 l4 -12 4 12" fill="#0a170a" opacity="0.7" />
    </>
  ),
  sea: (
    <>
      <rect x="0" y="0" width="400" height="54" fill="#12314a" opacity="0.5" />
      <circle cx="60" cy="22" r="9" fill="#cfe3f2" opacity="0.25" />
      <path d="M0 66 q20 -7 40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0" fill="none" stroke="#3f82b0" strokeWidth="3" opacity="0.45" />
      <path d="M0 82 q22 -7 44 0 t44 0 t44 0 t44 0 t44 0 t44 0 t44 0 t44 0 t44 0" fill="none" stroke="#2e6690" strokeWidth="4" opacity="0.5" />
    </>
  ),
  sky: (
    <>
      <ellipse cx="70" cy="34" rx="46" ry="15" fill="#cdd9ea" opacity="0.14" />
      <ellipse cx="250" cy="24" rx="60" ry="17" fill="#cdd9ea" opacity="0.12" />
      <ellipse cx="360" cy="60" rx="50" ry="15" fill="#cdd9ea" opacity="0.12" />
    </>
  ),
  space: (
    <>
      <circle cx="330" cy="30" r="20" fill="#7a5bd0" opacity="0.4" />
      <circle cx="330" cy="30" r="20" fill="none" stroke="#b39cf0" strokeWidth="1.5" opacity="0.3" />
      <g fill="#fff" opacity="0.7"><circle cx="40" cy="24" r="1.2" /><circle cx="120" cy="60" r="1" /><circle cx="200" cy="30" r="1.4" /><circle cx="270" cy="70" r="1" /><circle cx="90" cy="80" r="1.1" /><circle cx="180" cy="80" r="1" /></g>
    </>
  ),
}
export function LaneBackdrop({ domain }) {
  return <svg className="lane-bg" viewBox="0 0 400 100" preserveAspectRatio="xMidYMax slice" aria-hidden="true">{BG[domain]}</svg>
}

export default function CombatSprite({ side, domain, stat, className = '' }) {
  const art = S[`${domain}-${stat}`]
  return (
    <svg className={`cbt-sprite ${side === 'foe' ? 'foe' : ''} ${className}`} viewBox="0 0 48 48" width="1em" height="1em" aria-hidden="true">
      {art || <circle cx="24" cy="24" r="10" fill={P.steel} />}
    </svg>
  )
}
