// Policy definitions. A policy occupies one of the (generic) Policy slots once
// unlocked; policies are passive effects (some resolved in the economy tick, some
// in combat).

export const POLICY_DEFS = {
  burial_rites: {
    key: 'burial_rites', name: 'Burial Rites', type: 'Policy',
    effect: 'Whenever a unit dies, gain :progress: equal to its :defense:.',
  },
  coordination: {
    key: 'coordination', name: 'Coordination', type: 'Policy',
    effect: 'Each Citizen also produces +1 :progress: per tick.',
  },
  warband: {
    key: 'warband', name: 'Warband', type: 'Policy',
    effect: 'Each unit gains +1 :attack: and +1 :defense: for every other friendly unit of the same type on the board.',
  },
}
