// Campaign sim — plays the whole loop headlessly.
//
//   node sims/campaign.mjs [eras] [--trace]
//
// This is the instrument for the question the economy sim cannot answer: does
// the assembled game SURVIVE, and does the progress web actually reach the
// player? It plays eras end to end — development ticks, progress offers,
// expansions, placements, and the wave that closes each era — then reports what
// happened.
//
// The AI is deliberately simple and greedy. It is a load-bearing floor, not a
// good player: if a competent-but-dumb strategy dies in era 2, the tuning is
// wrong regardless of what a human could do.

import { GameManager } from '../src/game/GameManager.js'
import { buildingYield } from '../src/game/data/buildings.js'
import { UNIT_DEFS, weaponTier, armorTier } from '../src/game/data/units.js'
import { terrainOf } from '../src/game/world/terrain.js'
import { foodAround, tileYield } from '../src/game/world/territory.js'

const ERAS = Number(process.argv[2]) || 4
const TRACE = process.argv.includes('--trace')
const SEEDS = [3, 11, 29, 47, 61]

const sum = (o) => o.food + o.production + o.gold + o.progress

// --- the greedy player ------------------------------------------------------

/** Prefer nodes that grant something placeable, then whatever is on offer. */
function pickOffer(game, offers) {
  const score = (n) => {
    let s = 1
    for (const f of n.effects) {
      if (f.kind === 'unit') s += 6 * f.grant          // stay alive first
      else if (f.kind === 'building') s += 4 * f.grant
      else if (f.kind === 'weapon' || f.kind === 'armor') s += 4
      else if (f.kind === 'mult') s += 3
      else if (f.kind === 'terrain') s += 2
      else s += 2
    }
    return s
  }
  return offers.slice().sort((a, b) => score(b) - score(a))[0]
}

/** Buildings go where they pay most; units ring the palace at the front. */
function pickPlacement(game, item, targets) {
  if (!targets.length) return null
  if (item.kind === 'building') {
    let best = null
    let bestV = -1
    for (const t of targets) {
      // Score the tile AS IF the building were already on it.
      const v = sum(buildingYield(game.world, { ...t, building: { key: item.key } }))
      if (v > bestV) { bestV = v; best = t }
    }
    return best
  }
  // Every enemy follows a flow field INWARD, so the palace ring is the one
  // chokepoint every attacker must cross. Units that cannot move — walls and
  // ranged — are worthless anywhere else, and even mobile ones do better
  // starting where the fighting will be. So: closest to the palace, always.
  return targets.slice().sort((a, b) => a.d - b.d)[0]
}

/**
 * Spend gold, in priority order:
 *   1. repair destroyed units — the army only shrinks otherwise
 *   2. rebuild razed ground — it produces nothing while it is a ruin
 *   3. upgrade the cheapest thing available — a flat sink for the surplus
 *
 * Repair before upgrade is not obviously right, but it is the safe floor: a
 * strategy that upgrades while its army lies in ruins should lose to this one.
 */
function spendGold(g, st) {
  let acted = true
  let guard = 0
  while (acted && guard++ < 200) {
    acted = false
    const { units, tiles } = g.repairTargets
    for (const t of units) if (g.doTileAction(t, 'repair-unit')) { acted = true; st.repairs = (st.repairs ?? 0) + 1 }
    for (const t of tiles) if (g.doTileAction(t, 'rebuild')) { acted = true; st.rebuilds = (st.rebuilds ?? 0) + 1 }
    if (acted) continue

    // Cheapest upgrade on the board, so the surplus goes as far as it can.
    let best = null
    for (const t of g.world.terr.controlled) {
      for (const a of g.tileActions(t)) {
        if (!a.kind.startsWith('upgrade') || !a.afford) continue
        if (!best || a.cost < best.a.cost) best = { t, a }
      }
    }
    if (best && g.doTileAction(best.t, best.a.kind)) { acted = true; st.upgrades = (st.upgrades ?? 0) + 1 }
  }
}

/** Every 4th expansion is a city — the winner of the strategy sweep. */
function pickExpansion(game, targets, st) {
  st.n = (st.n ?? 0) + 1
  const cityTurn = st.n % 4 === 0
  if (cityTurn && targets.city.length) {
    return { tile: targets.city.slice().sort((a, b) => foodAround(game.world, b) - foodAround(game.world, a))[0], mode: 'city' }
  }
  if (targets.improve.length) {
    const score = (t) => {
      const y = terrainOf(t.terrain).yields
      // A tile with a camp on it is worth taking for the camp alone.
      return y.food + y.production + y.gold + y.progress + (t.encampment ? 12 : 0)
    }
    return { tile: targets.improve.slice().sort((a, b) => score(b) - score(a))[0], mode: 'improve' }
  }
  if (targets.city.length) return { tile: targets.city[0], mode: 'city' }
  return null
}

// --- one run ----------------------------------------------------------------

function run(seed, eras) {
  const g = new GameManager(seed, {})
  const st = {}
  const waves = []
  let guard = 0
  let cumulative = 0

  while (g.era < eras && !g.defeated && guard++ < 400000) {
    if (g.selection) {
      const sel = g.selection
      // Count every time the clock stops for the player — the real measure of
      // whether the game is asking too much.
      st.prompts = (st.prompts ?? 0) + 1
      st[`prompt_${sel.type}`] = (st[`prompt_${sel.type}`] ?? 0) + 1
      if (sel.type === 'progress') {
        const p = pickOffer(g, sel.offers)
        if (p) g.chooseOffer(p); else g.skipSelection()
      } else if (sel.type === 'placement') {
        const t = pickPlacement(g, sel.item, g.placementTargets)
        if (t) g.placeGrant(t); else g.skipSelection()
      } else {
        const mv = pickExpansion(g, g.expansionTargets, st)
        if (mv) g.expandOnto(mv.tile, mv.mode); else g.skipSelection()
      }
      continue
    }
    if (g.combat.active) {
      const era = g.era
      const before = g.combat.enemies.length
      if (!g.combat.result) g.resolveCombat()
      const c = g.combat
      waves.push({
        era, wave: c.wave, enemies: before, result: c.result,
        razed: c.razed, breaches: c.breaches,
        palace: Math.round((c.palace.hp / c.palace.maxHp) * 100),
        defenders: c.units.length,
      })
      // endCombat (inside _resolveWave) is what tallies casualties.
      g._resolveWave()
      waves[waves.length - 1].losses = g.combat.losses ?? 0
      // Rebuild between eras, while the board is quiet.
      spendGold(g, st)
      continue
    }
    cumulative += sum(g.output)
    g.gameTick()
  }

  const s = g.stats
  const out = {
    seed, defeated: g.defeated, era: g.era, waves, cumulative,
    rate: sum(g.output), output: g.output,
    ...s,
    nodes: g.progress.size,
    units: [...g.world.terr.controlled].filter((t) => t.unit && !t.unit.destroyed).length,
    gold: Math.floor(g.resources.gold.value),
    prompts: st.prompts ?? 0,
    pProgress: st.prompt_progress ?? 0,
    pExpansion: st.prompt_expansion ?? 0,
    pPlacement: st.prompt_placement ?? 0,
    repairs: st.repairs ?? 0, rebuilds: st.rebuilds ?? 0, upgrades: st.upgrades ?? 0,
    grantsQueued: g.grants.length,
    mods: g.mods,
  }
  g.stop()
  return out
}

// --- report -----------------------------------------------------------------

console.log(`\n=== campaign: ${SEEDS.length} seeds × ${ERAS} eras ===\n`)
const runs = SEEDS.map((s) => run(s, ERAS))

console.log('  seed  end  survived  tiles  cities  pop  bldg  units  nodes    rate  cumulative | repairs rebuilds upgrades   gold')
for (const r of runs) {
  console.log(
    `  ${String(r.seed).padStart(4)} ${String(r.era).padStart(4)}` +
    `  ${(r.defeated ? 'DIED' : 'yes').padStart(8)}` +
    ` ${String(r.controlled).padStart(6)} ${String(r.cities).padStart(7)} ${String(r.pop).padStart(4)}` +
    ` ${String(r.buildings).padStart(5)} ${String(r.units).padStart(6)}` +
    ` ${String(r.nodes).padStart(6)} ${String(Math.round(r.rate)).padStart(7)} ${Math.round(r.cumulative).toLocaleString().padStart(11)} |` +
    ` ${String(r.repairs).padStart(7)} ${String(r.rebuilds).padStart(8)} ${String(r.upgrades).padStart(8)}` +
    ` ${r.gold.toLocaleString().padStart(6)}`)
}

// How often the clock stops for the player — the pacing measure that matters.
console.log('\n=== prompts (times the clock stopped) ===')
console.log('  seed   total  per era |  progress  expansion  placement')
for (const r of runs) {
  console.log(
    `  ${String(r.seed).padStart(4)} ${String(r.prompts).padStart(7)}` +
    ` ${(r.prompts / Math.max(1, r.era)).toFixed(1).padStart(8)} |` +
    ` ${String(r.pProgress).padStart(9)} ${String(r.pExpansion).padStart(10)} ${String(r.pPlacement).padStart(10)}`)
}

console.log('\n=== waves ===')
console.log('  era  wave  enemies  defenders  result      palace%  losses  razed  breaches')
const byEra = new Map()
for (const r of runs) {
  for (const w of r.waves) {
    if (!byEra.has(w.era)) byEra.set(w.era, [])
    byEra.get(w.era).push(w)
  }
}
const avg = (xs, f) => xs.reduce((a, b) => a + f(b), 0) / (xs.length || 1)
for (const [era, ws] of [...byEra.entries()].sort((a, b) => a[0] - b[0])) {
  const wins = ws.filter((w) => w.result === 'won').length
  console.log(
    `  ${String(era).padStart(3)} ${String(ws[0].wave).padStart(5)}` +
    ` ${avg(ws, (w) => w.enemies).toFixed(1).padStart(8)}` +
    ` ${avg(ws, (w) => w.defenders).toFixed(1).padStart(10)}` +
    `  ${`${wins}/${ws.length} won`.padEnd(11)}` +
    ` ${avg(ws, (w) => w.palace).toFixed(0).padStart(7)}` +
    ` ${avg(ws, (w) => w.losses ?? 0).toFixed(1).padStart(7)}` +
    ` ${avg(ws, (w) => w.razed).toFixed(1).padStart(6)}` +
    ` ${avg(ws, (w) => w.breaches).toFixed(1).padStart(9)}`)
}

console.log('\n=== what the web handed out (seed 3) ===')
const m = runs[0].mods
console.log(`  units unlocked    : ${[...m.units].join(', ') || 'none'}`)
console.log(`  buildings unlocked: ${[...m.buildings].join(', ') || 'none'}`)
console.log(`  weapons           : ${weaponTier(m.weapon).name} (+${weaponTier(m.weapon).atk} :melee:/:cavalry: atk)`)
console.log(`  armour            : ${armorTier(m.armor).name} (+${armorTier(m.armor).hp} hp)`)
console.log(`  per-type mods     : ${Object.entries(m.unitMod).filter(([, v]) => Object.keys(v).length).map(([t, v]) => `${t} ${Object.entries(v).map(([k, n]) => `+${n}${k}`).join('')}`).join(', ') || 'none'}`)
console.log(`  multipliers       : ${Object.entries(m.mult).filter(([, v]) => v).map(([k, v]) => `${k} +${Math.round(v * 100)}%`).join(', ') || 'none'}`)
console.log(`  thresholds        : ${Object.entries(m.threshold).filter(([, v]) => v !== 1).map(([k, v]) => `${k} ×${v.toFixed(2)}`).join(', ') || 'none'}`)
console.log(`  terrain bonuses   : ${Object.entries(m.terrain).map(([k, y]) => `${k} ${Object.entries(y).filter(([, v]) => v).map(([r, v]) => `+${v}${r[0]}`).join('')}`).join(', ') || 'none'}`)
console.log(`  roads             : ${m.roads ? `yes (${Object.entries(m.roadYield).filter(([, v]) => v).map(([r, v]) => `+${v} ${r}`).join(' ')})` : 'no'}`)
console.log(`  settle unlocked   : ${[...m.settle].join(', ') || 'none'}`)

if (TRACE) {
  console.log('\n=== output composition (seed 3) ===')
  const g = new GameManager(3, {})
  void g
  const r = runs[0]
  console.log(`  final per tick: ${Object.entries(r.output).map(([k, v]) => `${k} ${Math.round(v)}`).join(' · ')}`)
}
console.log()
