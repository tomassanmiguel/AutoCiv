// Campaign sim — plays the whole loop headlessly.
//
//   node sims/campaign.mjs [waves] [--trace]
//
// The instrument for one question: does the assembled game SURVIVE, and does the
// content layer actually reach the player? It plays waves end to end —
// development ticks, the automatic :food: expansion, :production: cities and
// wonders, :progress: drafts, placements, and the wave that closes each cycle —
// then reports what happened.
//
// ⚠️ It counts in WAVES, not eras. The two clocks are independent now: an era is
// a tech pool advanced only by drafting, and the report shows how far the three
// branches actually got, which is the thing the content layer is judged on.
//
// The AI is deliberately simple and greedy. It is a load-bearing floor, not a
// good player: if a competent-but-dumb strategy dies on wave 2, the tuning is
// wrong regardless of what a human could do.

import { GameManager } from '../src/game/GameManager.js'
import { buildingYield } from '../src/game/data/buildings.js'
import { foodAround } from '../src/game/world/territory.js'
import { QUADRANTS, describeEffects } from '../src/game/data/schema.js'

const WAVES = Number(process.argv[2]) || 4
const TRACE = process.argv.includes('--trace')
const SEEDS = [3, 11, 29, 47, 61]

const sum = (o) => o.food + o.production + o.gold + o.progress

// --- the greedy player ------------------------------------------------------

/**
 * Prefer rows that DO something the engine can run, then anything else.
 *
 * Most of the pool is written down but unwired while mechanics are added one at
 * a time, so a scorer that only looked at effects would treat the whole draft as
 * a coin flip. Unwired rows still count: taking them advances the branch.
 */
function pickOffer(game, offers) {
  const score = (row) => {
    let s = row.isWonder ? 2 : 1
    for (const f of row.effects ?? []) {
      if (f.kind === 'unit_atk_base_pct' || f.kind === 'unit_def_base_pct') s += 4 + (f.amount ?? 0) / 100
      else s += 3
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

/** A city site, best food in reach — the only thing that grows population. */
const pickCity = (g) => {
  const sites = g.cityTargets
  if (!sites.length) return null
  return sites.slice().sort((a, b) => foodAround(g.world, b) - foodAround(g.world, a))[0]
}

// --- one run ----------------------------------------------------------------

function run(seed, waveCount) {
  const g = new GameManager(seed, {})
  const st = {}
  const waves = []
  let guard = 0
  let cumulative = 0

  while (g.wave < waveCount && !g.defeated && guard++ < 400000) {
    if (g.selection) {
      const sel = g.selection
      // Count every time the clock stops for the player — the real measure of
      // whether the game is asking too much. (:food: never appears here: it
      // expands on its own, which is precisely the point of the rule.)
      st.prompts = (st.prompts ?? 0) + 1
      st[`prompt_${sel.type}`] = (st[`prompt_${sel.type}`] ?? 0) + 1
      if (sel.type === 'progress') {
        const p = pickOffer(g, sel.offers)
        if (p) g.chooseOffer(p); else g.skipSelection()
      } else if (sel.type === 'placement') {
        const t = pickPlacement(g, sel.item, g.placementTargets)
        if (t) g.placeGrant(t); else g.skipSelection()
      } else if (sel.type === 'city') {
        const t = pickCity(g)
        if (t) g.foundCityAt(t); else g.skipSelection()
      } else if (sel.type === 'wonder') {
        const t = g.wonderTargets[0]
        if (t) g.buildWonderAt(t); else g.skipSelection()
      } else {
        g.skipSelection()
      }
      continue
    }
    // Prep is a held phase: the greedy AI does not reposition, it just begins.
    if (g.phase === 'prep') { g.beginWave(); continue }
    if (g.combat.active) {
      const wave = g.wave
      const before = g.combat.enemies.length
      if (!g.combat.result) g.resolveCombat()
      const c = g.combat
      waves.push({
        wave, enemies: before, result: c.result,
        razed: c.razed, breaches: c.breaches,
        palace: Math.round((c.palace.hp / c.palace.maxHp) * 100),
        defenders: c.units.length,
      })
      // endCombat (inside _resolveWave) is what tallies casualties.
      g._resolveWave()
      waves[waves.length - 1].losses = g.combat.losses ?? 0
      // Rebuild between waves, while the board is quiet.
      spendGold(g, st)
      continue
    }
    cumulative += sum(g.output)
    g.gameTick()
  }

  const s = g.stats
  const out = {
    seed, defeated: g.defeated, wave: g.wave, waves, cumulative,
    rate: sum(g.output), output: g.output,
    ...s,
    taken: g.draft.taken.size,
    branches: g.branches,
    heldWonder: g.heldWonder?.name ?? null,
    units: [...g.world.terr.controlled].filter((t) => t.unit && !t.unit.destroyed).length,
    gold: Math.floor(g.resources.gold.value),
    prompts: st.prompts ?? 0,
    pProgress: st.prompt_progress ?? 0,
    pCity: (st.prompt_city ?? 0) + (st.prompt_wonder ?? 0),
    pPlacement: st.prompt_placement ?? 0,
    repairs: st.repairs ?? 0, rebuilds: st.rebuilds ?? 0, upgrades: st.upgrades ?? 0,
    grantsQueued: g.grants.length,
    mods: g.mods,
    takenRows: g.takenRows,
  }
  g.stop()
  return out
}

// --- report -----------------------------------------------------------------

console.log(`\n=== campaign: ${SEEDS.length} seeds × ${WAVES} waves ===\n`)
const runs = SEEDS.map((s) => run(s, WAVES))

console.log('  seed  wave  survived  tiles  cities  pop  bldg  units  techs    rate  cumulative | repairs rebuilds upgrades   gold')
for (const r of runs) {
  console.log(
    `  ${String(r.seed).padStart(4)} ${String(r.wave).padStart(4)}` +
    `  ${(r.defeated ? 'DIED' : 'yes').padStart(8)}` +
    ` ${String(r.controlled).padStart(6)} ${String(r.cities).padStart(7)} ${String(r.pop).padStart(4)}` +
    ` ${String(r.buildings).padStart(5)} ${String(r.units).padStart(6)}` +
    ` ${String(r.taken).padStart(6)} ${String(Math.round(r.rate)).padStart(7)} ${Math.round(r.cumulative).toLocaleString().padStart(11)} |` +
    ` ${String(r.repairs).padStart(7)} ${String(r.rebuilds).padStart(8)} ${String(r.upgrades).padStart(8)}` +
    ` ${r.gold.toLocaleString().padStart(6)}`)
}

// How often the clock stops for the player — the pacing measure that matters.
console.log('\n=== prompts (times the clock stopped) ===')
console.log('  seed   total per wave |  progress  build  placement')
for (const r of runs) {
  console.log(
    `  ${String(r.seed).padStart(4)} ${String(r.prompts).padStart(7)}` +
    ` ${(r.prompts / Math.max(1, r.wave)).toFixed(1).padStart(8)} |` +
    ` ${String(r.pProgress).padStart(9)} ${String(r.pCity).padStart(6)} ${String(r.pPlacement).padStart(10)}`)
}

// THE CONTENT MEASURE. A branch that never leaves era 0 has an empty pool, not a
// cautious player — that is the number to watch while the pool is rebuilt.
console.log('\n=== how far each branch got ===')
console.log(`  seed  ${QUADRANTS.map((q) => q.padEnd(24)).join('')}`)
for (const r of runs) {
  console.log(`  ${String(r.seed).padStart(4)}  ` + r.branches.map((b) =>
    `${b.eraName} ${b.have}/${b.need || '—'}${b.stalled ? ' STALLED' : ''}`.padEnd(24)).join(''))
}

console.log('\n=== waves ===')
console.log('  wave  enemies  defenders  result      palace%  losses  razed  breaches')
const byWave = new Map()
for (const r of runs) {
  for (const w of r.waves) {
    if (!byWave.has(w.wave)) byWave.set(w.wave, [])
    byWave.get(w.wave).push(w)
  }
}
const avg = (xs, f) => xs.reduce((a, b) => a + f(b), 0) / (xs.length || 1)
for (const [wave, ws] of [...byWave.entries()].sort((a, b) => a[0] - b[0])) {
  const wins = ws.filter((w) => w.result === 'won').length
  console.log(
    `  ${String(wave + 1).padStart(4)}` +
    ` ${avg(ws, (w) => w.enemies).toFixed(1).padStart(8)}` +
    ` ${avg(ws, (w) => w.defenders).toFixed(1).padStart(10)}` +
    `  ${`${wins}/${ws.length} won`.padEnd(11)}` +
    ` ${avg(ws, (w) => w.palace).toFixed(0).padStart(7)}` +
    ` ${avg(ws, (w) => w.losses ?? 0).toFixed(1).padStart(7)}` +
    ` ${avg(ws, (w) => w.razed).toFixed(1).padStart(6)}` +
    ` ${avg(ws, (w) => w.breaches).toFixed(1).padStart(9)}`)
}

console.log('\n=== what research handed out (seed 3) ===')
const r0 = runs[0]
const m = r0.mods
for (const row of r0.takenRows) {
  console.log(`  ${row.name.padEnd(22)} ${row.quadrant.padEnd(9)} ${describeEffects(row) || '(written down, not wired)'}`)
}
if (!r0.takenRows.length) console.log('  nothing — the draft pool was empty')
console.log(`  ---`)
console.log(`  all units          : +${Math.round(m.unitAtkBasePct * 100)}% base atk, +${Math.round(m.unitDefBasePct * 100)}% base def`)
console.log(`  units unlocked     : ${[...m.units].join(', ') || 'none'}`)
console.log(`  buildings unlocked : ${[...m.buildings].join(', ') || 'none'}`)
console.log(`  wonder held unbuilt: ${r0.heldWonder ?? 'none'}`)
console.log(`  multipliers        : ${Object.entries(m.mult).filter(([, v]) => v).map(([k, v]) => `${k} +${Math.round(v * 100)}%`).join(', ') || 'none'}`)
console.log(`  settle unlocked    : ${[...m.settle].join(', ') || 'none'}`)

if (TRACE) {
  console.log('\n=== output composition (seed 3) ===')
  console.log(`  final per tick: ${Object.entries(r0.output).map(([k, v]) => `${k} ${Math.round(v)}`).join(' · ')}`)
}
console.log()
