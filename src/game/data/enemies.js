// Enemy roster (v2 — simplified for the testing period). Enemies are composed from a TYPE
// (Melee / Cavalry / Ranged) × a DOMAIN (default / amphibious / astral), rolled with a spawn
// TIER (Grunt / Normal / Elite). generateHost buys them against a per-era budget. Bosses are
// Azazoth-style row-spanning walls injected separately (see combat.js `_injectBossWave`).
//
// Per-enemy combat fields (set on the spawned object, read directly by combat.js):
//   hp/maxHp  = base HP × 1.25^era × tier-mult
//   atk       = (base breach atk + 2·era) × tier-mult   (legitimacy damage on breach)
//   chip      = 1 ALWAYS (blocker damage per attack)
//   acts      = movement speed (cells/turn): melee 1, cavalry 2, ranged 1
//   range     = attack diamond radius: melee/cavalry 1, ranged 2 + floor(era/6)
//   type/domain/tier = taxonomy tags; `types:[type]` mirrors it for shared UI helpers.

import { terrainDomain } from './terrain.js'

// Era-0 anchors per type (tunable — first pass, revisit in playtest).
export const ENEMY_TYPES = {
  melee:   { type: 'melee',   name: 'Melee',   def: 16, atk: 6, acts: 1, range: () => 1 },
  cavalry: { type: 'cavalry', name: 'Cavalry', def: 10, atk: 4, acts: 2, range: () => 1 },
  ranged:  { type: 'ranged',  name: 'Ranged',  def: 6,  atk: 6, acts: 1, range: (era) => 2 + Math.floor(era / 6) },
}

// Domains: the terrain-domain buckets each can path through, a spawn weight(era) (ramps toward
// permissive later), and a display prefix. 'basic' = all; 'water' = amphibious+; 'exotic' = astral.
export const ENEMY_DOMAINS = {
  default:    { domain: 'default',    prefix: '',            buckets: new Set(['basic']),                    weight: () => 6 },
  amphibious: { domain: 'amphibious', prefix: 'Amphibious ', buckets: new Set(['basic', 'water']),           weight: (era) => 2 + 0.5 * era },
  astral:     { domain: 'astral',     prefix: 'Astral ',     buckets: new Set(['basic', 'water', 'exotic']), weight: (era) => Math.max(0, era - 12) },
}

/** Whether an enemy DOMAIN can traverse a terrain (used by combat movement/pathing). */
export function domainCanTraverse(domain, terrainKey) {
  const d = ENEMY_DOMAINS[domain] ?? ENEMY_DOMAINS.default
  return d.buckets.has(terrainDomain(terrainKey))
}

// Spawn tiers: rolled per enemy. Grunts (½) are cheap → more bodies; Elites (×2) are rare walls.
const TIERS = [
  { key: 'grunt',  prefix: 'Grunt ', mult: 0.5, p: 0.5 },
  { key: 'normal', prefix: '',       mult: 1,   p: 0.4 },
  { key: 'elite',  prefix: 'Elite ', mult: 2,   p: 0.1 },
]
function rollTier(rng) {
  let r = rng()
  for (const t of TIERS) { if (r < t.p) return t; r -= t.p }
  return TIERS[1]
}

// Boss roster — Azazoth-style row-spanning walls, keyed by ERA INDEX. `dmg` = per-attack damage
// dealt to each entity in the obstructed row (2/3/4 early/mid/late); Azazoth instead insta-destroys.
export const BOSSES = {
  3:  { key: 'barbarian_horde', name: 'Barbarian Horde', dmg: 2 },
  6:  { key: 'mongol_horde',    name: 'Mongol Horde',    dmg: 2 },
  11: { key: 'the_axis',        name: 'The Axis',        dmg: 3 },
  17: { key: 'alien_invasion',  name: 'Alien Invasion',  dmg: 3 },
  20: { key: 'the_machines',    name: 'The Machines',    dmg: 4 },
  24: { key: 'galactic_armada', name: 'Galactic Armada', dmg: 4 },
  27: { key: 'azazoth',         name: 'Azazoth',         azazoth: true },
}
const BOSS_HP_BASE = 200
const BOSS_GROWTH = 1.3
/** Scaled boss HP for an era (tuning knob — must feel like a wall vs player damage; revisit). */
export function bossHP(era) { return Math.max(1, Math.round(BOSS_HP_BASE * Math.pow(BOSS_GROWTH, era))) }

/** Wave HP budget for an era. Base +50% vs the pre-redesign value (was 40). */
export function waveBudget(era, difficulty = 1) {
  return 60 * Math.pow(1.3, era) * difficulty
}

/**
 * Compose an enemy host for an era. Buys weighted (type × domain) enemies — each rolling a spawn
 * tier — onto random free spawn cells until the budget is spent or the zone fills. Amphibious
 * enemies bias toward water columns.
 * @param columns [{ col, places:Set }] battlefield columns (from TableauData.battlefieldColumns).
 */
export function generateHost(era, bounds, spawnRows, columns, rng = Math.random, difficulty = 1) {
  if (!bounds || columns.length === 0 || spawnRows <= 0) return { type: 'mixed', units: [] }
  const scale = Math.pow(1.25, era)
  const budget = waveBudget(era, difficulty)

  // Weighted (type × domain) combos for this era.
  const combos = []
  let totalW = 0
  for (const t of Object.values(ENEMY_TYPES)) {
    for (const d of Object.values(ENEMY_DOMAINS)) {
      const w = d.weight(era)
      if (w <= 0) continue
      combos.push({ t, d, w })
      totalW += w
    }
  }
  if (!combos.length) return { type: 'mixed', units: [] }
  const pick = () => {
    let r = rng() * totalW
    for (const c of combos) { r -= c.w; if (r <= 0) return c }
    return combos[combos.length - 1]
  }

  // Free spawn cells, tagged by whether the column contains water (for amphibious biasing).
  const waterCols = new Set(columns.filter((c) => c.places?.has?.('sea') || c.places?.has?.('coast')).map((c) => c.col))
  const freeCells = []
  for (const c of columns) for (let k = 0; k < spawnRows; k++) freeCells.push({ col: c.col, row: bounds.maxRow + 1 + k, water: waterCols.has(c.col) })
  const takeCell = (preferWater) => {
    let idx = -1
    if (preferWater) {
      const waterIdxs = freeCells.map((c, i) => (c.water ? i : -1)).filter((i) => i >= 0)
      if (waterIdxs.length) idx = waterIdxs[Math.floor(rng() * waterIdxs.length)]
    }
    if (idx < 0) idx = Math.floor(rng() * freeCells.length)
    return freeCells.splice(idx, 1)[0]
  }

  const units = []
  let spentHp = 0, id = 0
  while (spentHp < budget && freeCells.length > 0) {
    const { t, d } = pick()
    const tier = rollTier(rng)
    const hp = Math.max(1, Math.round(Math.round(t.def * scale) * tier.mult))
    const atk = Math.max(1, Math.round((t.atk + 2 * era) * tier.mult))
    const cell = takeCell(d.domain === 'amphibious')
    units.push({
      id: id++, kind: 'unit', key: `${d.domain}_${t.type}`,
      name: tier.prefix + d.prefix + t.name,
      type: t.type, domain: d.domain, tier: tier.key, types: [t.type], level: 1,
      col: cell.col, row: cell.row,
      hp, maxHp: hp, atk, chip: 1, range: t.range(era), acts: t.acts,
      damaged: false, breached: false,
    })
    spentHp += hp
  }
  return { type: 'mixed', units }
}

// Lightweight def registry so `ENEMY_DEFS[key]` lookups (display cards, sims/verify) resolve for
// the 9 type×domain combos + the 7 bosses. Per-spawn specifics (tiered name, hp, range) live on
// the enemy OBJECT; these are the generic fallbacks.
export const ENEMY_DEFS = {}
for (const t of Object.values(ENEMY_TYPES)) {
  for (const d of Object.values(ENEMY_DOMAINS)) {
    const key = `${d.domain}_${t.type}`
    ENEMY_DEFS[key] = { key, name: d.prefix + t.name, types: [t.type], type: t.type, domain: d.domain }
  }
}
for (const [era, b] of Object.entries(BOSSES)) {
  ENEMY_DEFS[b.key] = { key: b.key, name: b.name, types: ['melee'], boss: true, era: Number(era) }
}
