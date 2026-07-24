// Civilizations & difficulty (v2 pre-game selection). A civ grants a marquee policy
// (pre-filled in a policy slot) plus a special starting unit OR building (pre-unlocked in
// the roster). Difficulty scales the enemy wave budget. See REDESIGN §6.

export const CIVILIZATIONS = {
  horde: {
    key: 'horde', name: 'The Horde',
    blurb: 'A warrior people who live for the charge. Begin with the Tribalism policy and a Wolf.',
    marqueePolicy: 'tribalism', startUnit: 'wolf',
  },
  guild: {
    key: 'guild', name: 'The Guild',
    blurb: 'Master traders who bankroll every campaign. Begin with the Ownership policy and a Market.',
    marqueePolicy: 'ownership', startBuilding: 'market',
  },
  academy: {
    key: 'academy', name: 'The Academy',
    blurb: 'Seekers of knowledge above all. Begin with the Language policy and a Cave Painting.',
    marqueePolicy: 'language', startBuilding: 'cave_painting',
  },
  faithful: {
    key: 'faithful', name: 'The Faithful',
    blurb: 'A devout order that turns loss into legend. Begin with Burial Rites and a Shrine.',
    marqueePolicy: 'burial_rites', startBuilding: 'shrine',
  },
  wanderers: {
    key: 'wanderers', name: 'The Wanderers',
    blurb: 'Restless nomads who multiply and skirmish. Begin with Midwivery and a Slinger.',
    marqueePolicy: 'midwivery', startUnit: 'slinger',
  },
}

export const DEFAULT_CIV = 'horde'

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
