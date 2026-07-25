// Enemy roster + host generation (v2 turn-based tower defense). Hand-authored enemies
// (docs/enemies.md) march DOWN the shared grid toward the player. Two numbers per enemy:
//   def = base HP  → scaled ×1.25^E at spawn (HP outpaces player attack 1.15^E on purpose).
//   atk = base breach legitimacy damage → +1/era at spawn (dealt only if it reaches the bottom).
// Blocker chip = per-enemy `chip` (default 1). `special` tags mark abilities wired incrementally.
//
// A wave draws weighted-random enemies until their summed (scaled) HP meets a budget that grows
// with the era; 5% of spawns are Elite (double HP + double breach atk). Bosses are excluded from
// normal waves (scripted waves come later).

export const ENEMY_DEFS = {
  // --- Ordinary ---
  thrall: { key: 'thrall', name: 'Thrall', era: 0, types: ['melee'], atk: 1, def: 1, chip: 1, ability: 'Cannon fodder.' },
  raider: { key: 'raider', name: 'Raider', era: 0, types: ['melee'], atk: 5, def: 10, chip: 1, ability: 'Baseline marcher.' },
  marauder: { key: 'marauder', name: 'Marauder', era: 2, types: ['melee'], atk: 8, def: 12, chip: 1, waterMove: true, ability: 'Can move on water.' },
  enemy_shaman: { key: 'enemy_shaman', name: 'Shaman', era: 1, types: ['ranged'], atk: 1, def: 15, chip: 1, special: 'heal_adjacent', ability: 'Heals adjacent enemies 10% max HP/turn; moves toward an enemy at range 2 if none adjacent.' },
  sentinel: { key: 'sentinel', name: 'Sentinel', era: 2, types: ['melee'], atk: 1, def: 30, chip: 1, ability: 'Pure damage-sponge.' },
  juggernaut: { key: 'juggernaut', name: 'Juggernaut', era: 2, types: ['melee'], atk: 25, def: 50, chip: 1, special: 'skip_alt_turn', ability: 'Skips every other turn (slow, huge breach threat).' },
  leader: { key: 'leader', name: 'Leader', era: 2, types: ['cavalry'], atk: 3, def: 20, chip: 1, special: 'buff_adjacent', ability: 'Adjacent enemies deal +100% breach :attack:; Shaman-like movement.' },
  barbarian: { key: 'barbarian', name: 'Barbarian', era: 3, types: ['melee'], atk: 5, def: 7, chip: 2, ability: 'Double chip vs units (2/turn).' },
  ranger: { key: 'ranger', name: 'Ranger', era: 4, types: ['ranged'], atk: 4, def: 5, chip: 1, special: 'ranged_chip', ability: 'Chips blockers at range 2.' },
  berserker: { key: 'berserker', name: 'Berserker', era: 5, types: ['melee'], atk: 2, def: 15, chip: 1, special: 'grows_when_damaged', ability: 'Breach :attack: grows as it is damaged (2 + missing HP).' },
  dervish: { key: 'dervish', name: 'Dervish', era: 5, types: ['cavalry'], atk: 20, def: 1, chip: 1, special: 'triple_speed', ability: 'Triple speed, glass.' },
  ninja: { key: 'ninja', name: 'Ninja', era: 6, types: ['cavalry'], atk: 5, def: 8, chip: 1, special: 'least_resistance', ability: 'Takes the path of least resistance; moves 2/turn.' },
  mongol: { key: 'mongol', name: 'Mongol', era: 6, types: ['cavalry'], atk: 8, def: 8, chip: 1, special: 'double_speed', ability: 'Double speed; removes blockers at range 2.' },
  corsair: { key: 'corsair', name: 'Corsair', era: 7, types: ['naval'], atk: 6, def: 12, chip: 1, special: 'aquatic_path', ability: 'Attacks via the nearest aquatic route; can hit you at sea.' },
  sapper: { key: 'sapper', name: 'Sapper', era: 8, types: ['siege'], atk: 3, def: 8, chip: 1, special: 'destroy_buildings', ability: 'Chips all adjacent blockers; destroys buildings instantly.' },
  quartermaster: { key: 'quartermaster', name: 'Quartermaster', era: 8, types: ['melee'], atk: 1, def: 12, chip: 1, special: 'spawn_on_move', ability: 'After moving, spawns a Raider on an adjacent tile.' },
  deadeye: { key: 'deadeye', name: 'Deadeye', era: 9, types: ['ranged'], atk: 3, def: 7, chip: 1, special: 'ranged_chip', ability: 'Chips blockers at range 4.' },
  dreadnought: { key: 'dreadnought', name: 'Dreadnought', era: 9, types: ['naval'], atk: 15, def: 30, chip: 1, special: 'aquatic_path', ability: 'Corsair movement (aquatic), heavy.' },
  kamikaze: { key: 'kamikaze', name: 'Kamikaze', era: 11, types: ['aerial'], atk: 10, def: 2, chip: 1, special: 'self_destruct', ability: 'Double speed; on first attack self-destructs, killing everything within range 2 of the target.' },
  jager: { key: 'jager', name: 'Jäger', era: 11, types: ['melee'], atk: 20, def: 20, chip: 1, special: 'least_resistance', ability: 'Takes the path with the fewest tiles in player ranged-range.' },
  beamer: { key: 'beamer', name: 'Beamer', era: 16, types: ['ranged'], atk: 3, def: 17, chip: 1, special: 'pierce_blockers', ability: 'Chipping a blocker pierces to all blockers behind it.' },
  alien: { key: 'alien', name: 'Alien', era: 17, types: ['cavalry'], atk: 4, def: 12, chip: 1, special: 'triple_speed', ability: 'Triple movement in space.' },
  phantom: { key: 'phantom', name: 'Phantom', era: 18, types: ['aerial'], atk: 10, def: 8, chip: 1, special: 'not_impeded', ability: 'Not impeded by anything; may attack over water (not space).' },
  obliterator: { key: 'obliterator', name: 'Obliterator', era: 21, types: ['siege'], atk: 20, def: 40, chip: 1, special: 'destroy_blockers', ability: 'Instantly destroys all blockers in its path.' },
  swarm: { key: 'swarm', name: 'Swarm', era: 23, types: ['melee'], atk: 50, def: 5, chip: 1, special: 'split_when_damaged', ability: 'HP does not scale, takes only 1 dmg/hit; when damaged, spawns another Swarm on an empty adjacent tile.' },
  enemy_warper: { key: 'enemy_warper', name: 'Warper', era: 24, types: ['astral'], atk: 9, def: 9, chip: 1, special: 'teleport_when_damaged', ability: 'When damaged, teleports to a random tile within range 3.' },

  // --- Bosses (excluded from normal waves; scripted waves later) ---
  titan: { key: 'titan', name: 'Titan', era: 20, types: ['melee'], atk: 50, def: 75, chip: 4, boss: true, footprint: [2, 2], special: 'plows_planets', ability: '2×2; plows through Mars/Moon; ×4 chip vs units & buildings — a mobile wall-breaker.' },
  flagship: { key: 'flagship', name: 'Flagship', era: 24, types: ['naval'], atk: 100, def: 4000, chip: 1, boss: true, footprint: [4, 2], special: 'spawns_enemies', ability: 'Moves on odd turns; each turn spawns 2 random enemies in the nearest empty tiles.' },
  azazoth: { key: 'azazoth', name: 'Azazoth', era: 27, types: ['astral'], atk: 99999, def: 10000, chip: 1, boss: true, special: 'azazoth', ability: 'Fills the enemy row (the only enemy that wave). Immune to freeze/pushback/poison. Marches every other turn, instantly destroying anything in its path.' },
}

/** Wave HP budget for an era: 40 · 1.3^E · difficulty (grows a bit faster than per-enemy HP). */
export function waveBudget(era, difficulty = 1) {
  return 40 * Math.pow(1.3, era) * difficulty
}

/**
 * Compose an enemy host for an era. Draws weighted-random (non-boss) enemies with era ≤ E until
 * their summed scaled-HP meets the budget or the spawn zone is full; 5% Elite (×2 HP + ×2 atk).
 * @param bounds    { minRow, maxRow, minCol, maxCol } of the visible grid.
 * @param spawnRows battlefield rows above the grid.
 * @param columns   [{ col, places }] visible columns.
 * @returns { type, units: [{ id, kind:'unit', key, name, types, col, row, hp, maxHp, atk, chip, elite, damaged, breached }] }
 */
export function generateHost(era, bounds, spawnRows, columns, rng = Math.random, difficulty = 1) {
  if (!bounds || columns.length === 0 || spawnRows <= 0) return { type: 'mixed', units: [] }
  const capacity = spawnRows * columns.length
  const scale = Math.pow(1.25, era)
  const budget = waveBudget(era, difficulty)
  const pool = Object.values(ENEMY_DEFS).filter((d) => !d.boss && d.era <= era)
  if (pool.length === 0) return { type: 'mixed', units: [] }

  const totalW = pool.reduce((s, d) => s + Math.pow(2, d.era), 0)
  const pick = () => {
    let r = rng() * totalW
    for (const d of pool) { r -= Math.pow(2, d.era); if (r <= 0) return d }
    return pool[pool.length - 1]
  }

  const perCol = new Map(columns.map((c) => [c.col, 0]))
  const units = []
  let spentHp = 0, placed = 0, id = 0
  while (spentHp < budget && placed < capacity) {
    const open = columns.filter((c) => perCol.get(c.col) < spawnRows)
    if (open.length === 0) break
    const d = pick()
    const elite = rng() < 0.05
    const mult = elite ? 2 : 1
    const hp = Math.max(1, Math.round(d.def * scale)) * mult
    const atk = (d.atk + era) * mult
    const c = open[Math.floor(rng() * open.length)]
    const idx = perCol.get(c.col)
    perCol.set(c.col, idx + 1)
    units.push({
      id: id++, kind: 'unit', key: d.key, name: (elite ? 'Elite ' : '') + d.name,
      types: d.types ?? ['melee'], level: 1,
      col: c.col, row: bounds.maxRow + 1 + idx,
      hp, maxHp: hp, atk, chip: d.chip ?? 1,
      elite, damaged: false, breached: false,
    })
    spentHp += hp
    placed++
  }
  return { type: 'mixed', units }
}
