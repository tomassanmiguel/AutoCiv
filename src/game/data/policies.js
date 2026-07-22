// Policy definitions. A policy occupies one of the (generic) Policy slots once
// unlocked; policies are passive effects. Effects that depend on combat are inert
// until the battle phase exists.

export const POLICY_DEFS = {
  burial_rites: {
    key: 'burial_rites', name: 'Burial Rites', type: 'Policy',
    effect: 'Whenever a unit dies, gain :progress: equal to its :defense:.',
  },
}
