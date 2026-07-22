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
  midwivery: {
    key: 'midwivery', name: 'Midwivery', type: 'Policy',
    effect: 'Whenever you create a unit, gain :production: equal to its :defense:.',
  },
  ownership: {
    key: 'ownership', name: 'Ownership', type: 'Policy',
    effect: 'All buildings also produce +2 :gold: per tick.',
  },
  oral_tradition: {
    key: 'oral_tradition', name: 'Oral Tradition', type: 'Policy',
    effect: 'At the end of combat, gain :gold: and :progress: equal to your current :legitimacy:.',
  },
  hereditary_rule: {
    key: 'hereditary_rule', name: 'Hereditary Rule', type: 'Policy',
    effect: 'At the end of combat, all units and buildings permanently gain +1 :defense:.',
  },
  specialization: {
    key: 'specialization', name: 'Specialization', type: 'Policy',
    effect: 'Each specialist also produces +1 of its highest output.',
  },
  slavery: {
    key: 'slavery', name: 'Slavery', type: 'Policy',
    effect: 'All :production: outputs +10%, but all :progress: outputs −5%.',
  },
  caste_system: {
    key: 'caste_system', name: 'Caste System', type: 'Policy',
    effect: 'Upgraded units (level 2+) deal +25% :attack:.',
  },
  trade_networks: {
    key: 'trade_networks', name: 'Trade Networks', type: 'Policy',
    effect: 'Each Citizen also produces +2 :gold: per tick.',
  },
  hospitality_rites: {
    key: 'hospitality_rites', name: 'Hospitality Rites', type: 'Policy',
    effect: 'Hiring mercenaries costs 50% less :gold:.',
  },
  weights_and_measures: {
    key: 'weights_and_measures', name: 'Weights and Measures', type: 'Policy',
    effect: 'All :gold: outputs are increased by 50%.',
  },
  calendar: {
    key: 'calendar', name: 'Calendar', type: 'Policy',
    effect: "Each era's development lasts 5 more ticks.",
  },
  festivals: {
    key: 'festivals', name: 'Festivals', type: 'Policy',
    effect: 'End-of-combat effects (legitimacy, Ranch growth, Pier, etc.) trigger an additional time.',
  },
  composite_bows: {
    key: 'composite_bows', name: 'Composite Bows', type: 'Policy',
    effect: 'Ranged attacks deal 50% more damage (any unit that attacks at range).',
  },
  surveying: {
    key: 'surveying', name: 'Surveying', type: 'Policy',
    effect: 'At the end of each combat, a Road is laid on a random valid tile.',
  },
  code_of_laws: {
    key: 'code_of_laws', name: 'Code of Laws', type: 'Policy',
    effect: 'Unit and building repair costs are reduced by 75%.',
  },
  diplomatic_marriage: {
    key: 'diplomatic_marriage', name: 'Diplomatic Marriage', type: 'Policy',
    effect: 'Mercenaries are hired 3 upgrade levels higher.',
  },
  sacred_grounds: {
    key: 'sacred_grounds', name: 'Sacred Grounds', type: 'Policy',
    effect: 'Each empty land tile grants +1 :legitimacy: at the end of combat.',
  },

  // --- Classical era ---
  democracy: {
    key: 'democracy', name: 'Democracy', type: 'Policy',
    effect: 'All :progress: outputs +20%, but whenever you lose :legitimacy: you lose double.',
  },
}
