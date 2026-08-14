// Hand-drawn SVG combat sprites — a distinct figure per (side, domain, stat).
// Player = a disciplined steel-and-gold army; foe = a red-and-bone barbarian horde.
// Pure vector (no external assets), so they scale crisply and theme cleanly.

// palettes
const P = { light: '#dfe8f2', steel: '#7ea3cc', deep: '#3a5f8f', dark: '#22344f', gold: '#e6c877', wood: '#8a6a3a', flame: '#f0a63c' }
const F = { red: '#d24a34', deepred: '#8a2d20', bone: '#e5d8b8', fur: '#6b4a2e', dark: '#241310', gold: '#d6a53c', ember: '#f0863c', murk: '#5a4a6a' }

// key -> svg children
const S = {
  // ---------- PLAYER ----------
  'you-land-atk': (
    <>
      <polygon points="24,3 27,9 26,30 22,30 21,9" fill={P.light} stroke={P.dark} strokeWidth="1" />
      <rect x="15" y="29" width="18" height="3" rx="1.5" fill={P.gold} />
      <rect x="22" y="32" width="4" height="8" rx="1.5" fill={P.wood} />
      <circle cx="24" cy="42" r="2.4" fill={P.gold} />
    </>
  ),
  'you-land-def': (
    <>
      <path d="M24 5 L39 9 V24 Q39 37 24 44 Q9 37 9 24 V9 Z" fill={P.steel} stroke={P.dark} strokeWidth="1.5" />
      <path d="M24 5 L39 9 V24 Q39 37 24 44 Z" fill={P.deep} />
      <rect x="22.5" y="12" width="3" height="24" fill={P.gold} />
      <rect x="14" y="21" width="20" height="3" fill={P.gold} />
    </>
  ),
  'you-land-bomb': (
    <>
      <path d="M15 5 Q35 24 15 43" fill="none" stroke={P.wood} strokeWidth="3.5" strokeLinecap="round" />
      <line x1="15" y1="5" x2="15" y2="43" stroke={P.light} strokeWidth="1.2" />
      <line x1="13" y1="24" x2="42" y2="24" stroke={P.light} strokeWidth="2" />
      <polygon points="42,24 35,20.5 35,27.5" fill={P.gold} />
    </>
  ),
  'you-sea-atk': (
    <>
      <path d="M7 33 H41 L36 41 H12 Z" fill={P.deep} stroke={P.dark} strokeWidth="1" />
      <rect x="23" y="8" width="2" height="25" fill={P.wood} />
      <path d="M25 9 L37 31 H25 Z" fill={P.light} stroke={P.dark} strokeWidth="0.8" />
      <path d="M22 12 L12 31 H22 Z" fill={P.steel} stroke={P.dark} strokeWidth="0.8" />
    </>
  ),
  'you-sea-def': (
    <>
      <path d="M7 33 H41 L36 41 H12 Z" fill={P.dark} stroke="#000" strokeWidth="0.6" />
      <circle cx="15" cy="35" r="2.4" fill={P.gold} /><circle cx="24" cy="35" r="2.4" fill={P.steel} /><circle cx="33" cy="35" r="2.4" fill={P.gold} />
      <rect x="23" y="8" width="2" height="25" fill={P.wood} />
      <path d="M25 9 L37 31 H25 Z" fill={P.steel} stroke={P.dark} strokeWidth="0.8" />
      <rect x="28" y="14" width="3" height="8" fill={P.gold} /><rect x="26" y="17" width="7" height="2" fill={P.gold} />
    </>
  ),
  'you-sea-bomb': (
    <>
      <path d="M7 34 H41 L36 41 H12 Z" fill={P.deep} stroke={P.dark} strokeWidth="1" />
      <rect x="18" y="26" width="14" height="6" rx="2" fill={P.dark} />
      <rect x="30" y="27" width="12" height="4" rx="2" fill={P.steel} stroke={P.dark} strokeWidth="0.6" />
      <circle cx="43" cy="29" r="3" fill={P.flame} opacity="0.9" /><circle cx="46" cy="29" r="1.6" fill={P.gold} />
    </>
  ),
  'you-sky-atk': (
    <>
      <polygon points="6,24 40,19 40,29" fill={P.light} stroke={P.dark} strokeWidth="1" />
      <polygon points="18,23 30,9 34,23" fill={P.deep} />
      <polygon points="18,25 30,39 34,25" fill={P.deep} />
      <polygon points="40,24 47,22 47,26" fill={P.gold} />
      <circle cx="12" cy="24" r="2" fill={P.steel} />
    </>
  ),
  'you-sky-def': (
    <>
      <ellipse cx="25" cy="20" rx="17" ry="9" fill={P.steel} stroke={P.dark} strokeWidth="1.2" />
      <path d="M8 20 H42" stroke={P.deep} strokeWidth="1.4" />
      <polygon points="6,16 6,24 12,20" fill={P.gold} />
      <rect x="18" y="30" width="14" height="5" rx="2" fill={P.wood} />
      <line x1="20" y1="28.5" x2="20" y2="30" stroke={P.dark} /><line x1="30" y1="28.5" x2="30" y2="30" stroke={P.dark} />
    </>
  ),
  'you-sky-bomb': (
    <>
      <polygon points="8,18 38,14 38,22" fill={P.light} stroke={P.dark} strokeWidth="1" />
      <polygon points="18,18 28,7 32,18" fill={P.deep} />
      <ellipse cx="26" cy="34" rx="4" ry="6" fill={P.dark} />
      <polygon points="24,30 28,30 26,26" fill={P.steel} />
      <polygon points="24,40 28,40 26,46" fill={P.flame} />
    </>
  ),
  'you-space-atk': (
    <>
      <path d="M24 3 Q33 16 30 33 H18 Q15 16 24 3 Z" fill={P.light} stroke={P.dark} strokeWidth="1" />
      <circle cx="24" cy="17" r="3.4" fill={P.deep} stroke={P.dark} strokeWidth="0.8" />
      <polygon points="18,29 11,41 18,36" fill={P.steel} stroke={P.dark} strokeWidth="0.6" />
      <polygon points="30,29 37,41 30,36" fill={P.steel} stroke={P.dark} strokeWidth="0.6" />
      <polygon points="20,33 24,45 28,33" fill={P.flame} />
    </>
  ),
  'you-space-def': (
    <>
      <rect x="19" y="17" width="10" height="14" rx="2" fill={P.light} stroke={P.dark} strokeWidth="1" />
      <rect x="3" y="20" width="15" height="8" fill={P.deep} stroke={P.dark} strokeWidth="0.8" />
      <rect x="30" y="20" width="15" height="8" fill={P.deep} stroke={P.dark} strokeWidth="0.8" />
      <path d="M6 21 V27 M11 21 V27 M32 21 V27 M37 21 V27" stroke={P.steel} strokeWidth="0.8" />
      <circle cx="24" cy="11" r="3.4" fill={P.gold} /><line x1="24" y1="14" x2="24" y2="17" stroke={P.dark} />
    </>
  ),
  'you-space-bomb': (
    <>
      <path d="M20 6 Q26 16 24 32 H14 Q12 16 20 6 Z" fill={P.light} stroke={P.dark} strokeWidth="1" />
      <polygon points="14,28 9,38 14,34" fill={P.steel} />
      <polygon points="16,32 19,42 22,32" fill={P.flame} />
      <rect x="28" y="16" width="4" height="14" rx="2" fill={P.gold} stroke={P.dark} strokeWidth="0.6" />
      <polygon points="28,16 32,16 30,10" fill={P.red || P.deep} />
      <polygon points="28,30 32,30 30,36" fill={P.flame} />
    </>
  ),
  // ---------- FOE (barbarian horde) ----------
  'foe-land-atk': (
    <>
      <rect x="22" y="7" width="3.5" height="35" rx="1.4" fill={F.fur} />
      <path d="M25.5 8 Q41 7 39 21 Q31 18 25.5 21 Z" fill={F.red} stroke={F.dark} strokeWidth="1" />
      <path d="M22.5 8 Q7 7 9 21 Q17 18 22.5 21 Z" fill={F.deepred} stroke={F.dark} strokeWidth="1" />
      <circle cx="24" cy="42" r="2.4" fill={F.bone} />
    </>
  ),
  'foe-land-def': (
    <>
      <circle cx="24" cy="24" r="17" fill={F.deepred} stroke={F.dark} strokeWidth="2" />
      <circle cx="24" cy="23" r="9.5" fill={F.bone} />
      <circle cx="20.5" cy="22" r="2.2" fill={F.dark} /><circle cx="27.5" cy="22" r="2.2" fill={F.dark} />
      <path d="M23 27 h2.5 v3 h-2.5 z" fill={F.dark} />
      <path d="M18 31 l2 -2 2 2 2 -2 2 2 2 -2 2 2" fill="none" stroke={F.bone} strokeWidth="1.6" />
    </>
  ),
  'foe-land-bomb': (
    <>
      <rect x="22" y="20" width="4" height="22" rx="1.4" fill={F.fur} />
      <path d="M24 3 Q35 14 24 23 Q13 14 24 3 Z" fill={F.red} />
      <path d="M24 8 Q31 14 24 21 Q17 14 24 8 Z" fill={F.ember} />
      <path d="M24 12 Q28 15 24 19 Q20 15 24 12 Z" fill={F.gold} />
    </>
  ),
  'foe-sea-atk': (
    <>
      <path d="M5 32 Q24 43 43 32 L38 37 Q24 41 10 37 Z" fill={F.fur} stroke={F.dark} strokeWidth="1" />
      <path d="M6 32 Q1 23 8 20 Q6 27 13 30 Z" fill={F.deepred} stroke={F.dark} strokeWidth="0.8" />
      <rect x="23" y="11" width="2" height="21" fill={F.dark} />
      <path d="M12 13 H36 V27 H12 Z" fill={F.red} stroke={F.dark} strokeWidth="0.8" />
      <path d="M12 18 H36 M12 23 H36" stroke={F.bone} strokeWidth="1.3" />
    </>
  ),
  'foe-sea-def': (
    <>
      <path d="M5 32 Q24 43 43 32 L38 37 Q24 41 10 37 Z" fill={F.dark} stroke="#000" strokeWidth="0.6" />
      <circle cx="14" cy="33.5" r="2.6" fill={F.red} stroke={F.bone} strokeWidth="0.6" />
      <circle cx="24" cy="34.5" r="2.6" fill={F.bone} stroke={F.deepred} strokeWidth="0.6" />
      <circle cx="34" cy="33.5" r="2.6" fill={F.red} stroke={F.bone} strokeWidth="0.6" />
      <rect x="23" y="12" width="2" height="20" fill={F.dark} />
      <path d="M13 14 H35 V26 H13 Z" fill={F.deepred} stroke={F.dark} strokeWidth="0.8" />
    </>
  ),
  'foe-sea-bomb': (
    <>
      <path d="M5 33 Q24 43 43 33 L38 38 Q24 42 10 38 Z" fill={F.fur} stroke={F.dark} strokeWidth="1" />
      <rect x="22" y="14" width="2" height="19" fill={F.dark} />
      <path d="M24 4 Q33 13 24 21 Q15 13 24 4 Z" fill={F.red} />
      <path d="M24 8 Q30 13 24 19 Q18 13 24 8 Z" fill={F.ember} />
      <path d="M12 26 q3 -4 6 0 M30 26 q3 -4 6 0" fill="none" stroke={F.ember} strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  'foe-sky-atk': (
    <>
      <ellipse cx="24" cy="25" rx="4" ry="6.5" fill={F.deepred} />
      <path d="M20 23 Q6 13 3 25 Q13 25 20 27 Z" fill={F.red} stroke={F.dark} strokeWidth="0.8" />
      <path d="M28 23 Q42 13 45 25 Q35 25 28 27 Z" fill={F.red} stroke={F.dark} strokeWidth="0.8" />
      <circle cx="24" cy="15" r="3.4" fill={F.deepred} />
      <circle cx="22.5" cy="14" r="1" fill={F.gold} /><circle cx="25.5" cy="14" r="1" fill={F.gold} />
      <polygon points="21,12 22,8 23,12" fill={F.deepred} /><polygon points="25,12 26,8 27,12" fill={F.deepred} />
    </>
  ),
  'foe-sky-def': (
    <>
      <path d="M11 32 Q6 23 15 22 Q17 13 27 17 Q39 12 39 24 Q46 26 39 32 Z" fill={F.murk} stroke={F.dark} strokeWidth="1.2" />
      <path d="M15 32 Q13 27 17 27 M27 33 Q25 28 29 28" fill="none" stroke="#8aa0c0" strokeWidth="1.4" strokeLinecap="round" />
    </>
  ),
  'foe-sky-bomb': (
    <>
      <path d="M11 24 Q6 16 15 15 Q17 8 27 12 Q39 8 39 19 Q45 21 39 25 Z" fill={F.murk} stroke={F.dark} strokeWidth="1.1" />
      <polygon points="24,24 20,34 25,34 21,44 33,30 27,30 31,24" fill={F.gold} stroke={F.ember} strokeWidth="0.6" />
    </>
  ),
  'foe-space-atk': (
    <>
      <ellipse cx="24" cy="29" rx="19" ry="6" fill={F.deepred} stroke={F.dark} strokeWidth="1" />
      <path d="M13 27 Q24 13 35 27 Z" fill={F.red} stroke={F.dark} strokeWidth="0.8" />
      <circle cx="24" cy="20" r="3" fill={F.bone} opacity="0.8" />
      <circle cx="17" cy="28.5" r="1.6" fill={F.gold} /><circle cx="24" cy="30" r="1.6" fill={F.gold} /><circle cx="31" cy="28.5" r="1.6" fill={F.gold} />
    </>
  ),
  'foe-space-def': (
    <>
      <ellipse cx="24" cy="30" rx="21" ry="7" fill={F.dark} stroke="#000" strokeWidth="0.6" />
      <path d="M10 28 Q24 10 38 28 Z" fill={F.deepred} stroke={F.dark} strokeWidth="1" />
      <ellipse cx="24" cy="17" rx="6" ry="4" fill={F.red} />
      <circle cx="15" cy="30" r="1.6" fill={F.gold} /><circle cx="21" cy="31" r="1.6" fill={F.gold} /><circle cx="27" cy="31" r="1.6" fill={F.gold} /><circle cx="33" cy="30" r="1.6" fill={F.gold} />
    </>
  ),
  'foe-space-bomb': (
    <>
      <path d="M20 20 Q8 12 3 7 M22 26 Q9 24 3 22 M23 32 Q13 35 7 40" fill="none" stroke={F.ember} strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="30" cy="26" r="11" fill={F.fur} stroke={F.dark} strokeWidth="1.4" />
      <circle cx="27" cy="23" r="2.4" fill="#4a3020" /><circle cx="34" cy="29" r="1.8" fill="#4a3020" />
      <path d="M22 20 q10 -3 16 4" fill="none" stroke={F.ember} strokeWidth="1.4" opacity="0.7" />
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
  const key = `${side}-${domain}-${stat}`
  const art = S[key]
  return (
    <svg className={`cbt-sprite ${className}`} viewBox="0 0 48 48" width="1em" height="1em" aria-hidden="true">
      {art || <circle cx="24" cy="24" r="10" fill={side === 'foe' ? F.red : P.steel} />}
    </svg>
  )
}
