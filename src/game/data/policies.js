// Policy definitions. A policy occupies one of the (generic) Policy slots once
// unlocked; policies are passive effects (some resolved in the economy tick, some
// in combat). By convention a policy's NAME matches the advancement that unlocks it.

export const POLICY_DEFS = {
  burial_rites: {
    key: 'burial_rites', name: 'Burial Rites', type: 'Policy',
    effect: 'Whenever a unit dies, gain :progress: equal to its :defense:.',
  },
  // Unlocked by "Language".
  language: {
    key: 'language', name: 'Language', type: 'Policy',
    effect: 'Each Citizen also produces +1 :progress: per tick.',
  },
  // Unlocked by "Tribalism".
  tribalism: {
    key: 'tribalism', name: 'Tribalism', type: 'Policy',
    effect: 'Each unit gains +1 :attack: and +1 :defense: for every other friendly unit of the same type on the board.',
  },
  hunting: {
    key: 'hunting', name: 'Hunting', type: 'Policy',
    effect: 'Whenever your units deal unblocked damage, also gain that much :food:.',
  },
  ownership: {
    key: 'ownership', name: 'Ownership', type: 'Policy',
    effect: 'All buildings also produce +2 :gold: per tick.',
  },
  basket_weaving: {
    key: 'basket_weaving', name: 'Basket Weaving', type: 'Policy',
    effect: 'All :food: thresholds are 5% lower.',
  },
  // Sacred Grounds' true effect (empty land tiles grant legitimacy after combat) is
  // intentionally NOT described — the player discovers it by playing.
  sacred_grounds: {
    key: 'sacred_grounds', name: 'Sacred Grounds', type: 'Policy',
    effect: 'Ground consecrated in the quiet reverence of your people.',
  },
}
