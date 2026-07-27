// Civilizations & difficulty (v3 pre-game selection).
//
// PLACEHOLDER: v3's content is not authored yet, so this is a single neutral civ
// and the v2 difficulty ladder, kept only so the pre-game screen has something
// real to select. Difficulty currently has no effect (no combat yet).

export const CIVILIZATIONS = {
  dummy: {
    key: 'dummy',
    name: 'Civilization',
    blurb: 'A fledgling people, founding their palace at the centre of the world.',
  },
}

export const DEFAULT_CIV = 'dummy'

export const DIFFICULTIES = [
  { key: 'peaceful', name: 'Peaceful', budgetMult: 0.6, blurb: 'Gentler hordes — learn the systems.' },
  { key: 'normal', name: 'Normal', budgetMult: 1.0, blurb: 'The intended balance.' },
  { key: 'brutal', name: 'Brutal', budgetMult: 1.6, blurb: 'Overwhelming waves for veterans.' },
]

export const DEFAULT_DIFFICULTY = 'normal'

export function difficultyMult(key) {
  return DIFFICULTIES.find((d) => d.key === key)?.budgetMult ?? 1
}
