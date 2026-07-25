// Unit definitions (v2 turn-based tower defense). A unit occupies a UNIT_CATEGORIES
// slot once unlocked and deploys onto tiles during production; in combat it is a
// stationary tower that strikes the lowest-HP enemy within its Manhattan-diamond range.
//
// v2 schema (see docs/SCALING.md §9 + docs/units.md):
//   atk      — as-built attack at the unlock era (≈ anchor · 1.15^E). Upgrades add atk per
//              level (additive): melee & naval-ranged +10%, everything else +25% (see unitStats).
//   def      — health (HP); flat per level EXCEPT melee, which gains +1 def per level.
//   range    — attack range as a Manhattan diamond (|Δrow|+|Δcol| ≤ range).
//   pursuit  — chase distance: cavalry/aerial reposition toward enemies within range+pursuit.
//   cooldown — turns to wait after attacking (0 = every turn; Siege = 2).
//   placement— deploy terrain class (land/coast/space) via canPlaceOn.
//   move     — domains the unit may reposition through in combat (Land/Water/Space).
//   combatRole — battle behaviour when it differs from types[0] (e.g. a Galley fights melee).
//   tech     — the advancement that unlocks it (for the advancement→unlock registry).
// Abilities are authored as `ability` text; their mechanics are wired incrementally.

// Era-0 attack anchors by role (round(anchor · 1.15^E) gives a tier's as-built atk).
export const ATTACK_ANCHORS = { melee: 5, ranged: 4, cavalry: 5, siege: 8, naval: 4, aerial: 5, astral: 4 }

export const UNIT_DEFS = {
  // ---------------- Melee (deploy Land · range 1 · never moves) ----------------
  warrior:      { key: 'warrior', name: 'Warrior', era: 0, types: ['melee'], placement: 'land', move: ['land'], atk: 5, def: 2, range: 1, description: 'A basic :melee: soldier — the baseline blocker.' },
  spearman:     { key: 'spearman', name: 'Spearman', era: 1, types: ['melee'], placement: 'land', move: ['land'], tech: 'Alloying', atk: 6, def: 3, range: 1, vsCavalry: 1.5, ability: '+50% :attack: versus :cavalry:-type enemies.', description: 'A bronze :melee: spearman that punishes charging :cavalry:.' },
  knight:       { key: 'knight', name: 'Knight', era: 5, types: ['melee'], placement: 'land', move: ['land'], tech: 'Crusades', atk: 10, def: 3, range: 1, description: 'An armoured :melee: knight.' },
  musketman:    { key: 'musketman', name: 'Musketman', era: 7, types: ['melee'], placement: 'land', move: ['land'], tech: 'Muskets', atk: 13, def: 3, range: 1, description: 'A gunpowder :melee: line infantryman.' },
  infantryman:  { key: 'infantryman', name: 'Infantryman', era: 10, types: ['melee'], placement: 'land', move: ['land'], tech: 'Trenchwarfare', atk: 20, def: 4, range: 1, description: 'A trench-era :melee: infantryman.' },
  rifleman:     { key: 'rifleman', name: 'Rifleman', era: 11, types: ['melee'], placement: 'land', move: ['land'], tech: 'Rifling', atk: 23, def: 3, range: 1, description: 'A modern :melee: rifleman.' },
  terminator:   { key: 'terminator', name: 'Terminator', era: 17, types: ['melee'], placement: 'land', move: ['land'], tech: 'Replicant Legions', atk: 54, def: 4, range: 1, description: 'A relentless robotic :melee: killer.' },
  space_marine: { key: 'space_marine', name: 'Space Marine', era: 21, types: ['melee'], placement: 'land', move: ['land'], tech: 'Space Marines', atk: 94, def: 4, range: 1, description: 'A powerful late-game :melee: trooper.' },
  jedi:         { key: 'jedi', name: 'Jedi', era: 23, types: ['melee'], placement: 'land', move: ['land'], tech: 'Kyber Crystals', atk: 124, def: 3, range: 1, pushCd: 5, ability: '**Force Push**: knocks the attacked enemy back 1 tile (5-turn cooldown; attacks normally between).', description: 'A :melee: knight wielding the Force.' },
  ascendant:    { key: 'ascendant', name: 'Ascendant', era: 25, types: ['melee'], placement: 'land', move: ['land', 'space'], tech: 'Superhumanity', atk: 165, def: 4, range: 1, pursuit: 2, ability: 'Cavalry behaviour; moves across Land and Space.', description: 'A transcendent :melee: warrior.' },

  // ---------------- Ranged (deploy Land · attack from range) ----------------
  slinger:       { key: 'slinger', name: 'Slinger', era: 0, types: ['ranged'], placement: 'land', move: ['land'], tech: 'The Sling', atk: 4, def: 1, range: 2, description: 'The earliest :ranged: skirmisher.' },
  archer:        { key: 'archer', name: 'Archer', era: 1, types: ['ranged'], placement: 'land', move: ['land'], tech: 'Archery', atk: 5, def: 1, range: 2, description: 'A :ranged: bowman.' },
  crossbowman:   { key: 'crossbowman', name: 'Crossbowman', era: 4, types: ['ranged'], placement: 'land', move: ['land'], tech: 'Crossbows', atk: 7, def: 1, range: 2, description: 'A :ranged: crossbowman.' },
  cannoneer:     { key: 'cannoneer', name: 'Cannoneer', era: 7, types: ['ranged'], placement: 'land', move: ['land'], tech: 'Canons', atk: 11, def: 1, range: 3, description: 'A :ranged: cannon crew.' },
  mortar_squad:  { key: 'mortar_squad', name: 'Mortar Squad', era: 10, types: ['ranged'], placement: 'land', move: ['land'], tech: 'Artillery', atk: 16, def: 1, range: 4, description: 'A long-:ranged: mortar team.' },
  railgunner:    { key: 'railgunner', name: 'Railgunner', era: 14, types: ['ranged'], placement: 'land', move: ['land'], tech: 'Lasers', atk: 28, def: 1, range: 4, description: 'A :ranged: railgun trooper.' },
  plasmer:       { key: 'plasmer', name: 'Plasmer', era: 17, types: ['ranged'], placement: 'land', move: ['land'], tech: 'Plasmatics', atk: 43, def: 1, range: 4, description: 'A :ranged: plasma gunner.' },
  psyker:        { key: 'psyker', name: 'Psyker', era: 22, types: ['ranged'], placement: 'land', move: ['land'], tech: 'Psionics', atk: 87, def: 1, range: 5, description: 'A :ranged: psychic blaster.' },
  tachyon_lancer:{ key: 'tachyon_lancer', name: 'Tachyon Lancer', era: 23, types: ['ranged'], placement: 'land', move: ['land'], tech: 'Particle Lance', atk: 100, def: 1, range: 6, line: true, ability: 'Hits every enemy in a straight line out to its range.', description: 'A :ranged: lance that pierces a whole line.' },
  sun_launcher:  { key: 'sun_launcher', name: 'Sun Launcher', era: 26, types: ['ranged'], placement: 'space', move: ['space'], tech: 'Oblivion Beam', atk: 151, def: 1, range: 99, multi: true, ability: 'Infinite range, multi-attack; deploy on Stars only.', description: 'A star-powered :ranged: annihilator.' },

  // ---------------- Cavalry (deploy Land · attack adjacent · pursue) ----------------
  wolf:         { key: 'wolf', name: 'Wolf', era: 0, types: ['cavalry'], placement: 'land', move: ['land'], tech: 'Pack Bonding', atk: 5, def: 2, range: 1, pursuit: 2, shift: true, ability: 'After attacking, shifts to an adjacent empty valid tile.', description: 'A swift Stone-age :cavalry: pack hunter.' },
  chariot:      { key: 'chariot', name: 'Chariot', era: 1, types: ['cavalry'], placement: 'land', move: ['land'], tech: 'The Wheel', atk: 6, def: 2, range: 1, pursuit: 2, description: 'A bronze :cavalry: war chariot.' },
  heavy_cavalry:{ key: 'heavy_cavalry', name: 'Heavy Cavalry', era: 5, types: ['cavalry'], placement: 'land', move: ['land'], tech: 'Stirrups', atk: 10, def: 3, range: 1, pursuit: 2, description: 'A shock :cavalry: charger.' },
  dragoon:      { key: 'dragoon', name: 'Dragoon', era: 7, types: ['cavalry'], placement: 'land', move: ['land'], tech: 'Dragoons', atk: 13, def: 2, range: 2, pursuit: 2, ability: 'Ranged attack — fires while pursuing.', description: 'A mounted :cavalry: gunner.' },
  tank:         { key: 'tank', name: 'Tank', era: 10, types: ['cavalry'], placement: 'land', move: ['land'], tech: 'Tanks', atk: 20, def: 6, range: 1, pursuit: 1, ability: 'High defence.', description: 'An armoured :cavalry: tank.' },
  drone:        { key: 'drone', name: 'Drone', era: 14, types: ['cavalry'], placement: 'land', move: ['land'], tech: 'Drone Warfare', atk: 35, def: 1, range: 4, pursuit: 3, ability: 'High range and damage, very fragile.', description: 'A fast, fragile :cavalry: drone.' },
  warper:       { key: 'warper', name: 'Warper', era: 25, types: ['cavalry'], placement: 'land', move: ['land'], tech: 'Teleportation', atk: 165, def: 2, range: 1, pursuit: 5, ability: 'Long pursuit — attempts to flank.', description: 'A teleporting :cavalry: flanker.' },

  // ---------------- Siege (deploy Land · ranged + splash · 2-turn cooldown) ----------------
  ballista:        { key: 'ballista', name: 'Ballista', era: 2, types: ['siege'], placement: 'land', move: ['land'], tech: 'Siege', atk: 11, def: 1, range: 3, cooldown: 2, pushBack: true, ability: 'Single-target; pushes the target back 1 tile.', description: 'A :siege: bolt-thrower.' },
  catapult:        { key: 'catapult', name: 'Catapult', era: 4, types: ['siege'], placement: 'land', move: ['land'], tech: 'Algebra', atk: 14, def: 1, range: 3, cooldown: 2, splash: 0.5, ability: 'Splash damage to the target’s neighbours.', description: 'A :siege: catapult.' },
  trebuchet:       { key: 'trebuchet', name: 'Trebuchet', era: 5, types: ['siege'], placement: 'land', move: ['land'], tech: 'Counterweights', atk: 16, def: 1, range: 4, cooldown: 2, splash: 0.5, ability: 'Splash, range 4.', description: 'A long-range :siege: trebuchet.' },
  artillery:       { key: 'artillery', name: 'Artillery', era: 9, types: ['siege'], placement: 'land', move: ['land'], tech: 'Dynamite', atk: 28, def: 1, range: 4, cooldown: 2, splash: 0.5, ability: 'Splash damage.', description: 'A :siege: artillery piece.' },
  missile_launcher:{ key: 'missile_launcher', name: 'Missile Launcher', era: 12, types: ['siege'], placement: 'land', move: ['land'], tech: 'Ballistics', atk: 43, def: 1, range: 5, cooldown: 2, splash: 0.75, ability: 'Bigger area of effect.', description: 'A :siege: missile launcher.' },
  grav_cannon:     { key: 'grav_cannon', name: 'Grav Cannon', era: 19, types: ['siege'], placement: 'land', move: ['land'], tech: 'Gravwaves', atk: 114, def: 1, range: 5, cooldown: 2, splash: 1, ability: 'Big AoE; pushes the whole group back.', description: 'A :siege: gravity cannon.' },
  tachyon_bomber:  { key: 'tachyon_bomber', name: 'Tachyon Bomber', era: 24, types: ['siege'], placement: 'land', move: ['land'], tech: 'Neutron Canons', atk: 229, def: 1, range: 6, cooldown: 2, splash: 1, ability: 'Huge area of effect.', description: 'A :siege: tachyon bomber.' },

  // ---------------- Naval (deploy Water · water only) ----------------
  galley:     { key: 'galley', name: 'Galley', era: 1, types: ['naval'], placement: 'coast', move: ['water'], combatRole: 'melee', tech: 'Sailing', atk: 5, def: 2, range: 1, ability: 'Rams enemies (:melee: range).', description: 'A :naval: galley that rams as :melee:.' },
  trireme:    { key: 'trireme', name: 'Trireme', era: 3, types: ['naval'], placement: 'coast', move: ['water'], combatRole: 'ranged', tech: 'Warships', atk: 6, def: 2, range: 2, description: 'A :naval: trireme.' },
  longship:   { key: 'longship', name: 'Longship', era: 5, types: ['naval'], placement: 'water', move: ['water'], combatRole: 'ranged', tech: 'Clinker Construction', atk: 8, def: 3, range: 2, description: 'A raiding :naval: longship.' },
  frigate:    { key: 'frigate', name: 'Frigate', era: 7, types: ['naval'], placement: 'water', move: ['water'], combatRole: 'ranged', tech: 'Circumnavigation', atk: 11, def: 2, range: 3, description: 'A :naval: frigate.' },
  battleship: { key: 'battleship', name: 'Battleship', era: 11, types: ['naval'], placement: 'water', move: ['water'], combatRole: 'ranged', tech: 'Steel Hulls', atk: 19, def: 4, range: 3, description: 'A steel :naval: battleship.' },
  leviathan:  { key: 'leviathan', name: 'Leviathan', era: 17, types: ['naval'], placement: 'water', move: ['water'], combatRole: 'ranged', tech: 'Gundam', atk: 43, def: 4, range: 4, description: 'A colossal :naval: war machine.' },

  // ---------------- Aerial (deploy Land · fast · flanks) ----------------
  biplane:    { key: 'biplane', name: 'Biplane', era: 10, types: ['aerial'], placement: 'land', move: ['land'], combatRole: 'cavalry', tech: 'Flight', atk: 20, def: 1, range: 1, pursuit: 3, description: 'An :aerial: biplane.' },
  fighter:    { key: 'fighter', name: 'Fighter', era: 11, types: ['aerial'], placement: 'land', move: ['land'], combatRole: 'cavalry', tech: 'Radar', atk: 23, def: 1, range: 1, pursuit: 3, description: 'An :aerial: fighter.' },
  raptor:     { key: 'raptor', name: 'Raptor', era: 13, types: ['aerial'], placement: 'land', move: ['land'], combatRole: 'cavalry', tech: 'Stealth', atk: 31, def: 1, range: 2, pursuit: 4, description: 'A stealth :aerial: jet.' },
  hovercraft: { key: 'hovercraft', name: 'Hovercraft', era: 17, types: ['aerial'], placement: 'land', move: ['land', 'water'], combatRole: 'cavalry', tech: 'Artificial Gravity', atk: 54, def: 1, range: 2, pursuit: 4, ability: 'Flies over water.', description: 'An :aerial: hovercraft.' },
  x_wing:     { key: 'x_wing', name: 'X-Wing', era: 23, types: ['aerial'], placement: 'land', move: ['land', 'water', 'space'], combatRole: 'cavalry', tech: 'Inertia Dampeners', atk: 124, def: 1, range: 2, pursuit: 5, ability: 'Space-capable.', description: 'A space-capable :aerial: fighter.' },

  // ---------------- Astral (deploy Space · space only) ----------------
  satellite:      { key: 'satellite', name: 'Satellite', era: 14, types: ['astral'], placement: 'space', move: ['space'], combatRole: 'ranged', tech: 'Satelite Defense', atk: 28, def: 1, range: 4, ability: 'Stationary; hits terrestrial targets only.', description: 'An :astral: defense satellite.' },
  astral_galleon: { key: 'astral_galleon', name: 'Astral Galleon', era: 16, types: ['astral'], placement: 'space', move: ['space'], combatRole: 'melee', tech: 'Solar Sails', atk: 37, def: 2, range: 1, pursuit: 3, cooldown: 1, ability: 'Long pursuit but moves 1 tile/turn; melee-range ram.', description: 'An :astral: solar-sail galleon.' },
  spaceship:      { key: 'spaceship', name: 'Spaceship', era: 18, types: ['astral'], placement: 'space', move: ['space'], combatRole: 'ranged', tech: 'Starships', atk: 50, def: 2, range: 3, pursuit: 3, ability: 'Cavalry movement; cannot go planetside.', description: 'An :astral: starship.' },
  valkyrie:       { key: 'valkyrie', name: 'Valkyrie', era: 20, types: ['astral'], placement: 'space', move: ['space'], combatRole: 'ranged', tech: 'Bimodal Starships', atk: 65, def: 4, range: 3, pursuit: 2, ability: 'Tanky.', description: 'A tanky :astral: interceptor.' },
  star_destroyer: { key: 'star_destroyer', name: 'Star Destroyer', era: 24, types: ['astral'], placement: 'space', move: ['space'], combatRole: 'ranged', tech: 'Adaptive Hulls', atk: 114, def: 8, range: 5, ability: 'Extremely tanky; stationary; ranged.', description: 'A massive :astral: warship.' },

  // ---------------- Auxiliary (unique specials) ----------------
  hunter:       { key: 'hunter', name: 'Hunter', era: 0, types: ['melee'], placement: 'land', move: ['land'], combatRole: 'melee', tech: 'Hunting', atk: 5, def: 2, range: 1, pursuit: 1, foodOnKill: true, ability: 'Gains :food: on a kill.', description: 'An auxiliary :melee: hunter that forages from kills.' },
  war_elephant: { key: 'war_elephant', name: 'War Elephant', era: 3, types: ['cavalry'], placement: 'land', move: ['land'], combatRole: 'cavalry', tech: 'War Elephants', atk: 8, def: 2, range: 1, pursuit: 2, pushBack: true, ability: 'On attack, pushes the enemy back, then pursues.', description: 'An auxiliary :cavalry: war elephant.' },
  warrior_monk: { key: 'warrior_monk', name: 'Warrior Monk', era: 4, types: ['melee'], placement: 'land', move: ['land'], combatRole: 'melee', tech: 'Monastic Order', atk: 9, atkFromLegit: 0.1, def: 4, range: 1, ability: ':attack: equals 10% of your :legitimacy:; gains :progress: when damaged.', description: 'An auxiliary :melee: monk whose strength scales with :legitimacy:.' },
  pirate:       { key: 'pirate', name: 'Pirate', era: 7, types: ['naval'], placement: 'coast', move: ['water'], combatRole: 'melee', tech: 'Cartography', atk: 13, def: 2, range: 1, pursuit: 1, goldOnAttack: true, ability: 'Melee naval; gains :gold: on attack.', description: 'An auxiliary :naval: raider.' },
  mustard_man:  { key: 'mustard_man', name: 'Mustard Man', era: 10, types: ['ranged'], placement: 'land', move: ['land'], combatRole: 'ranged', tech: 'Total War', atk: 20, def: 1, range: 2, poison: 0.05, ability: 'Applies poison (5% of the enemy’s max HP per turn).', description: 'An auxiliary :ranged: gas trooper.' },
  aspirant:     { key: 'aspirant', name: 'Aspirant', era: 15, types: ['melee'], placement: 'land', move: ['land'], combatRole: 'melee', tech: 'Recursive Self-Improvement', atk: 1, def: 1, range: 1, scaling: true, ability: 'Starts 1/1; each era survived, randomly +1 :defense: OR double :attack:.', description: 'An auxiliary :melee: unit that self-improves each era.' },
  cryo_specialist:{ key: 'cryo_specialist', name: 'Cryo Specialist', era: 18, types: ['ranged'], placement: 'land', move: ['land'], combatRole: 'ranged', tech: 'Cryogenics', atk: 50, def: 1, range: 3, cooldown: 2, freeze: 2, ability: 'Freezes the target for 2 turns.', description: 'An auxiliary :ranged: cryo trooper.' },
  zealot:       { key: 'zealot', name: 'Zealot', era: 19, types: ['melee'], placement: 'land', move: ['land'], combatRole: 'melee', tech: 'Church of the Simulation', atk: 70, atkFromLegit: 1, def: 3, range: 1, pursuit: 1, legitOnAttack: true, ability: ':attack: equals your :legitimacy:; gains :legitimacy: on attack.', description: 'An auxiliary :melee: zealot fuelled by :legitimacy:.' },
  timelord:     { key: 'timelord', name: 'Timelord', era: 26, types: ['melee'], placement: 'land', move: ['land'], combatRole: 'melee', tech: 'Sonic Screwdrivers', atk: 189, def: 2, range: 2, teleportOnDeath: true, ability: 'Teleports to a random available tile when killed.', description: 'An auxiliary :melee: time-traveller.' },

  // ---------------- v1 holdovers (kept until the registry reconciliation prunes them) ----------------
  baker:       { key: 'baker', name: 'Baker', era: 1, types: ['utility'], placement: 'land', move: ['land'], atk: 0, def: 10, range: 0, bakerDef: (level = 1) => level + 1, ability: 'When it acts, adjacent units permanently gain :defense:.', description: 'A :utility: support that toughens nearby units.' },
  legionnaire: { key: 'legionnaire', name: 'Legionnaire', era: 2, types: ['melee'], placement: 'land', move: ['land'], atk: 7, def: 3, range: 1, packAtk: 3, ability: 'Gains +3 :attack: per other Legionnaire.', description: 'A disciplined :melee: legionnaire.' },
  horseman:    { key: 'horseman', name: 'Horseman', era: 2, types: ['cavalry'], placement: 'land', move: ['land'], atk: 7, def: 3, range: 1, pursuit: 2, longSupport: true, ability: 'Supports any column on its landmass.', description: 'A swift :cavalry: rider.' },

  // ---------------- Era -1 wildlife (enemy-only) ----------------
  bear: { key: 'bear', name: 'Bear', era: -1, types: ['melee'], placement: 'land', move: ['land'], atk: 8, def: 6, range: 1, description: 'A hulking :melee: beast.' },
  lion: { key: 'lion', name: 'Lion', era: -1, types: ['cavalry'], placement: 'land', move: ['land'], atk: 6, def: 4, range: 1, pursuit: 2, description: 'A swift :cavalry: predator.' },
}

/** Combat behaviour of a unit — its role in battle. Defaults to the first slot
 *  category, but a unit may override via `combatRole`. */
export function unitRole(def) {
  return def?.combatRole ?? def?.types?.[0]
}

/** Effective stats at an upgrade level. v2 upgrade scaling per level (additive):
 *  - :melee: role      → +10% :attack: AND +1 :defense: (durable front line)
 *  - naval :ranged:    → +10% :attack: (a smaller boost, like melee)
 *  - everything else   → +25% :attack: (cavalry / land ranged / siege / aerial / astral)
 *  DEF (HP) is flat except melee (+1 per level). Optional flat bonuses: hpBonus (def),
 *  atkBonus (flat atk). Also returns range + pursuit for the stat block. */
export function unitStats(def, level = 1, hpBonus = 0, atkBonus = 0) {
  const steps = Math.max(0, level - 1)
  const role = unitRole(def)
  const naval = def.types?.includes('naval')
  const atkPct = role === 'melee' || (role === 'ranged' && naval) ? 0.10 : 0.25
  const defGrow = role === 'melee' ? steps : 0 // +1 :defense: per level for melee only
  const atk = Math.round(def.atk * (1 + atkPct * steps)) + atkBonus
  return { atk, def: def.def + defGrow + hpBonus, range: def.range, pursuit: def.pursuit ?? 0 }
}

/** One-line stat summary, e.g. "Range 1 · Atk 5 · Def 2". */
export function unitStatLine(def, level = 1, hpBonus = 0) {
  const s = unitStats(def, level, hpBonus)
  return `Range ${s.range} · Atk ${s.atk} · Def ${s.def}`
}
