// Civilizations & difficulty (v2 pre-game selection). A civ grants a marquee policy
// (pre-filled in a policy slot) plus a special starting unit OR building (pre-unlocked in
// the roster). Difficulty scales the enemy wave budget. See REDESIGN §6.

// TEMP: the flavored civilizations are shelved for now — a single neutral "dummy" civ with the
// plain default start (a Warrior + a Totem, both pre-unlocked in CivilizationData) and NO marquee
// policy / special start / ability. Re-add flavored civs later by giving entries a marqueePolicy
// and a startUnit or startBuilding.
export const CIVILIZATIONS = {
  dummy: {
    key: 'dummy', name: 'Civilization',
    blurb: 'A fledgling people, starting from nothing but a Warrior and a Totem.',
  },
}

export const DEFAULT_CIV = 'dummy'

// budgetMult scales the enemy wave budget (waveBudget × mult) via generateHost.
export const DIFFICULTIES = [
  { key: 'peaceful', name: 'Peaceful', budgetMult: 0.6, blurb: 'Gentler hordes — learn the systems.' },
  { key: 'normal', name: 'Normal', budgetMult: 1.0, blurb: 'The intended balance.' },
  { key: 'brutal', name: 'Brutal', budgetMult: 1.6, blurb: 'Overwhelming waves for veterans.' },
]

export const DEFAULT_DIFFICULTY = 'normal'

export function difficultyMult(key) {
  return DIFFICULTIES.find((d) => d.key === key)?.budgetMult ?? 1
}
