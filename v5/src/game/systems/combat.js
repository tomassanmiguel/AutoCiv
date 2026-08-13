// Abstract combat: the 12-scalar resolver + the era-independent enemy formula.
// Pure functions — the engine builds the player's aggregated scalars (which needs
// board/adjacency context) and hands them here.
import { DOMAINS, STATS, DOMAIN_PREMIUM, STAT_WEIGHT } from '../data/schema.js'

const ORDER = ['space', 'sky', 'sea', 'land'] // resolution order, top → down

export function emptyScalars() {
  const o = {}
  for (const d of DOMAINS) o[d] = { atk: 0, def: 0, bomb: 0 }
  return o
}
export function cloneScalars(s) {
  const o = {}
  for (const d of DOMAINS) o[d] = { atk: s[d].atk, def: s[d].def, bomb: s[d].bomb }
  return o
}
/** Total land-equivalent value of a scalar block (design §4). */
export function armyValue(s) {
  let v = 0
  for (const d of DOMAINS) for (const st of STATS) v += (s[d][st] || 0) * STAT_WEIGHT[st] * DOMAIN_PREMIUM[d]
  return v
}
export function domainHasForce(pool) { return pool.atk > 0 || pool.def > 0 || pool.bomb > 0 }
function totalPools(s) { let t = 0; for (const d of DOMAINS) t += s[d].atk + s[d].def + s[d].bomb; return t }

// Erode a pool in the fixed order def → atk → bomb; return leftover (excess).
function erode(pool, dmg) {
  for (const st of ['def', 'atk', 'bomb']) {
    if (dmg <= 0) break
    const take = Math.min(pool[st], dmg)
    pool[st] -= take
    dmg -= take
  }
  return dmg
}

// Run the rounds in place, calling onFrame(phase, domain) after each sub-step.
function runRounds(P, E, onFrame) {
  for (let round = 0; round < 8; round++) {
    const before = totalPools(P) + totalPools(E)
    let spillToP = 0
    let spillToE = 0
    for (const d of ORDER) {
      if (!domainHasForce(P[d]) && !domainHasForce(E[d])) continue
      if (spillToP > 0) spillToP = erode(P[d], spillToP)
      if (spillToE > 0) spillToE = erode(E[d], spillToE)
      const pb = P[d].bomb
      const eb = E[d].bomb
      spillToE += erode(E[d], pb)
      spillToP += erode(P[d], eb)
      onFrame && onFrame('bombard', d)
      erode(E[d], P[d].atk)
      erode(P[d], E[d].atk)
      onFrame && onFrame('attack', d)
    }
    if (totalPools(P) + totalPools(E) === before) break
  }
}

function scoreOutcome(P, E) {
  let goldGained = 0
  let legitimacyLost = 0
  const domains = []
  for (const d of DOMAINS) {
    goldGained += P[d].atk
    legitimacyLost += E[d].atk
    const pForce = domainHasForce(P[d])
    const eForce = domainHasForce(E[d])
    let result = 'stalemate'
    if (!eForce && pForce) result = 'win'
    else if (!pForce && eForce) result = 'loss'
    else if (!eForce && !pForce) result = 'clear'
    domains.push({ domain: d, player: P[d], enemy: E[d], result })
  }
  return {
    domains,
    goldGained: Math.floor(goldGained),
    legitimacyLost: Math.floor(legitimacyLost),
    won: domains.filter((x) => x.result === 'win').map((x) => x.domain),
    lost: domains.filter((x) => x.result === 'loss').map((x) => x.domain),
  }
}

/** Resolve a battle; returns the scored outcome. */
export function resolveCombat(playerScalars, enemyScalars) {
  const P = cloneScalars(playerScalars)
  const E = cloneScalars(enemyScalars)
  runRounds(P, E)
  return scoreOutcome(P, E)
}

/** Resolve a battle AND record a frame after every sub-step (for animation). */
export function resolveCombatTimeline(playerScalars, enemyScalars) {
  const P = cloneScalars(playerScalars)
  const E = cloneScalars(enemyScalars)
  const frames = []
  const push = (phase, domain) => frames.push({ phase, domain, P: cloneScalars(P), E: cloneScalars(E) })
  push('start', null)
  runRounds(P, E, push)
  const result = scoreOutcome(P, E)
  push('end', null)
  return { frames, result, start: { P: cloneScalars(playerScalars), E: cloneScalars(enemyScalars) } }
}

/**
 * Generate an enemy card for a given wave, anchored to the player's own military
 * value P (so difficulty tracks the player, era-independent). rand ∈ [0,1).
 */
export function generateEnemyCard(P, wave, cfg, rand) {
  const pressure = cfg.pressureBase * Math.pow(cfg.pressureSlope, wave - 1)
  const floor = cfg.floorBase * Math.pow(cfg.floorSlope, wave - 1)
  const base = Math.max(P, floor) * pressure
  const B = Math.max(1, base * (1 + (rand() * 2 - 1) * cfg.variance))

  const w = {}
  let totalW = 0
  for (const d of DOMAINS) {
    const unlockW = cfg.domainUnlockWave[d] ?? 1
    const ramp = Math.max(0, Math.min(1, (wave - unlockW + 1) / 3))
    const jitter = Math.max(0, 1 + (rand() * 2 - 1) * cfg.domainJitter)
    w[d] = (cfg.domainWeight[d] || 0) * ramp * jitter
    totalW += w[d]
  }
  if (totalW <= 0) { w.land = 1; totalW = 1 }

  const arch = cfg.archetypes[Math.floor(rand() * cfg.archetypes.length)]
  const scalars = emptyScalars()
  for (const d of DOMAINS) {
    const Vd = B * (w[d] / totalW)
    if (Vd <= 0) continue
    for (const st of STATS) {
      scalars[d][st] = Math.round((Vd * arch.split[st]) / (DOMAIN_PREMIUM[d] * STAT_WEIGHT[st]))
    }
  }
  return { scalars, archetype: arch.id, archetypeName: arch.name, budget: Math.round(B) }
}
