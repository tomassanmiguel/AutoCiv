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

  // ============================================================================
  // v2 policies (📜, slot: true) + bonuses (✦, slot: false) from PROGRESSION.md.
  // Structured effect fields (outputPct/doctrine/citizenOutput/thresholdMult/…) are
  // wired generically; `special`-tagged effects are wired incrementally. `description`
  // is the display text (readable via policyEffect()). Not yet registry-wired.
  // ============================================================================

  // --- Era 1: Bronze ---
  mining: { key: 'mining', name: 'Mining', era: 1, tech: 'Mining', slot: false, thresholdMult: { res: 'production', mult: 0.95 }, description: 'Reduce :production: threshold by 5%.' },
  writing: { key: 'writing', name: 'Writing', era: 1, tech: 'Writing', slot: false, thresholdMult: { res: 'progress', mult: 0.95 }, description: 'Reduce :progress: threshold by 5%.' },
  forestry: { key: 'forestry', name: 'Forestry', era: 1, tech: 'Forestry', slot: true, terrainDouble: 'forest', description: 'Double the forest terrain economy bonus.' },
  granaries: { key: 'granaries', name: 'Granaries', era: 1, tech: 'Granaries', slot: true, terrainDouble: 'plains', description: 'Double the plains terrain economy bonus.' },
  scriptoria: { key: 'scriptoria', name: 'Scriptoria', era: 1, tech: 'Scriptoria', slot: true, citizenOutput: { res: 'progress', amount: 1 }, description: 'Each Citizen also produces +1 :progress: per tick.' },

  // --- Era 2: Iron ---
  irrigation: { key: 'irrigation', name: 'Irrigation', era: 2, tech: 'Irrigation', slot: false, thresholdMult: { res: 'food', mult: 0.94 }, description: 'Reduce :food: threshold by 6%.' },
  mathematics: { key: 'mathematics', name: 'Mathematics', era: 2, tech: 'Mathematics', slot: false, instantBuilds: 2, description: 'On unlock, gain +2 free :production: builds.' },
  steel: { key: 'steel', name: 'Steel', era: 2, tech: 'Steel', slot: false, unitAtkPct: 0.15, description: 'All units deal +15% :attack:.' },
  alphabet: { key: 'alphabet', name: 'Alphabet', era: 2, tech: 'Alphabet', slot: true, special: 'free_progress_upgrade', description: 'When you build a :progress: building, upgrade it once for free.' },
  communal_granary: { key: 'communal_granary', name: 'Communal Granary', era: 2, tech: 'Communal Granary', slot: true, citizenOutput: { res: 'food', amount: 1 }, description: 'Each Citizen also produces +1 :food: per tick.' },
  compound_bow: { key: 'compound_bow', name: 'Compound Bow', era: 2, tech: 'Compound Bow', slot: true, doctrine: { role: 'ranged', pct: 0.50 }, description: ':ranged: units deal +50% :attack:.' },

  // --- Era 3: Classical ---
  cement: { key: 'cement', name: 'Cement', era: 3, tech: 'Cement', slot: false, buildingDefBonus: 1, description: 'All buildings gain +1 :defense:.' },
  philosophy: { key: 'philosophy', name: 'Philosophy', era: 3, tech: 'Philosophy', slot: false, thresholdMult: { res: 'progress', mult: 0.94 }, description: 'Reduce :progress: threshold by 6%.' },
  defensive_pact: { key: 'defensive_pact', name: 'Defensive Pact', era: 3, tech: 'Defensive Pact', slot: true, special: 'merc_def_bonus', description: 'Mercenaries gain +1 :defense:.' },
  optics: { key: 'optics', name: 'Optics', era: 3, tech: 'Optics', slot: true, doctrine: { role: 'naval', pct: 0.50 }, description: ':naval: units deal +50% :attack:.' },
  poetry: { key: 'poetry', name: 'Poetry', era: 3, tech: 'Poetry', slot: true, special: 'end_era_progress_from_atk', description: 'At the end of each era, gain :progress: equal to the total :attack: of surviving units.' },
  usury: { key: 'usury', name: 'Usury', era: 3, tech: 'Usury', slot: true, goldInterest: 0.10, description: 'At the end of each era, gain :gold: equal to 10% of your unspent :gold:.' },

  // --- Era 4: Early Medieval ---
  armor: { key: 'armor', name: 'Armor', era: 4, tech: 'Armor', slot: false, unitDefBonus: 1, description: 'All units gain +1 :defense:.' },
  crop_rotation: { key: 'crop_rotation', name: 'Crop Rotation', era: 4, tech: 'Crop Rotation', slot: false, thresholdMult: { res: 'food', mult: 0.93 }, description: 'Reduce :food: threshold by 7%.' },
  bushido: { key: 'bushido', name: 'Bushido', era: 4, tech: 'Bushido', slot: true, doctrine: { role: 'melee', pct: 0.50 }, description: ':melee: units deal +50% :attack:.' },
  feudalism: { key: 'feudalism', name: 'Feudalism', era: 4, tech: 'Feudalism', slot: true, outputPct: { food: 0.30, progress: -0.20 }, description: 'All :food: outputs +30%, but all :progress: outputs −20%.' },
  manorial_levy: { key: 'manorial_levy', name: 'Manorial Levy', era: 4, tech: 'Manorial Levy', slot: true, citizenOutput: { res: 'production', amount: 1 }, description: 'Each Citizen also produces +1 :production: per tick.' },
  pilgrimage: { key: 'pilgrimage', name: 'Pilgrimage', era: 4, tech: 'Pilgrimage', slot: true, wonderYieldMult: 1.5, description: 'Finished wonders yield ×1.5.' },
  theocracy: { key: 'theocracy', name: 'Theocracy', era: 4, tech: 'Theocracy', slot: true, legitPerEra: 25, description: 'At the end of each era, gain +25 :legitimacy:.' },

  // --- Era 5: Late Medieval ---
  branding: { key: 'branding', name: 'Metallurgy', era: 5, tech: 'Branding', slot: false, thresholdMult: { res: 'production', mult: 0.94 }, description: 'Reduce :production: threshold by 6%.' },
  dressage: { key: 'dressage', name: 'Dressage', era: 5, tech: 'Dressage', slot: true, doctrine: { role: 'cavalry', pct: 0.50 }, description: ':cavalry: units deal +50% :attack:.' },
  guilds: { key: 'guilds', name: 'Guilds', era: 5, tech: 'Guilds', slot: true, specialistOutput: 2, description: 'Every specialist produces +2 of its highest output.' },
  merchant_navy: { key: 'merchant_navy', name: 'Merchant Navy', era: 5, tech: 'Merchant Navy', slot: true, special: 'naval_gold_flat', description: ':naval: units also produce +2 :gold: per tick.' },
  schism: { key: 'schism', name: 'Schism', era: 5, tech: 'Schism', slot: true, endEraGoldFromLegit: 1, description: 'At the end of each era, gain :gold: equal to your :legitimacy:.' },
  state_alchemists: { key: 'state_alchemists', name: 'State Alchemists', era: 5, tech: 'State Alchemists', slot: true, freeRerolls: 1, description: 'Gain 1 free advancement reroll.' },

  // --- Era 6: Renaissance ---
  clocks: { key: 'clocks', name: 'Clocks', era: 6, tech: 'Clocks', slot: false, ticksPerEra: 6, description: "Each era's development lasts 6 more ticks." },
  engineering: { key: 'engineering', name: 'Engineering', era: 6, tech: 'Engineering', slot: false, instantBuilds: 2, description: 'On unlock, gain +2 free :production: builds.' },
  monumentality: { key: 'monumentality', name: 'Monumentality', era: 6, tech: 'Monumentality', slot: false, wonderCostReduce: 1, description: 'Wonders cost 1 fewer build to finish.' },
  printing_press: { key: 'printing_press', name: 'Printing Press', era: 6, tech: 'Printing Press', slot: false, thresholdMult: { res: 'progress', mult: 0.93 }, description: 'Reduce :progress: threshold by 7%.' },
  blueprints: { key: 'blueprints', name: 'Blueprints', era: 6, tech: 'Blueprints', slot: true, repairMult: 0.5, special: 'building_repair', description: 'Building repair costs 50% less :gold:.' },
  freedom_of_religion: { key: 'freedom_of_religion', name: 'Freedom of Religion', era: 6, tech: 'Freedom of Religion', slot: true, outputPct: { progress: 0.30 }, special: 'legit_loss_double', description: 'All :progress: outputs +30%, but :legitimacy: losses are doubled.' },
  maritime_law: { key: 'maritime_law', name: 'Maritime Law', era: 6, tech: 'Maritime Law', slot: true, special: 'water_gold_bonus', description: '+500% to the water-tile :gold: bonus.' },
  mercantilism: { key: 'mercantilism', name: 'Mercantilism', era: 6, tech: 'Mercantilism', slot: true, totalGoldPct: 0.25, description: 'Total :gold: output +25%.' },
  military_tradition: { key: 'military_tradition', name: 'Military Tradition', era: 6, tech: 'Military Tradition', slot: true, special: 'keep_upgrade_levels_unit', description: 'Overbuilding a unit keeps its upgrade levels.' },
  oligarchy: { key: 'oligarchy', name: 'Oligarchy', era: 6, tech: 'Oligarchy', slot: true, outputPct: { gold: 0.30, progress: -0.20 }, description: 'All :gold: outputs +30%, but all :progress: outputs −20%.' },
  siege_doctrine: { key: 'siege_doctrine', name: 'Siege Doctrine', era: 6, tech: 'Siege Doctrine', slot: true, doctrine: { role: 'siege', pct: 0.50 }, description: ':siege: units deal +50% :attack:.' },

  // --- Era 7: Exploration ---
  coffee: { key: 'coffee', name: 'Coffee', era: 7, tech: 'Coffee', slot: false, citizenOutput: { res: 'production', amount: 1 }, description: 'Each Citizen also produces +1 :production: per tick.' },
  colonialism: { key: 'colonialism', name: 'Colonialism', era: 7, tech: 'Colonialism', slot: true, special: 'new_world_levels', description: 'New-World units and buildings gain +2 upgrade levels.' },
  columbian_exchange: { key: 'columbian_exchange', name: 'Columbian Exchange', era: 7, tech: 'Columbian Exchange', slot: true, special: 'new_world_gold', description: 'New-World units and buildings also produce +6 :gold: per tick.' },
  embassies: { key: 'embassies', name: 'Embassies', era: 7, tech: 'Embassies', slot: true, mercLevels: 4, description: 'Mercenaries are hired 4 upgrade levels higher.' },
  evangelism: { key: 'evangelism', name: 'Evangelism', era: 7, tech: 'Evangelism', slot: true, special: 'evangelism', description: 'Each Priest produces +1 more :legitimacy: (requires Priest).' },
  mountaineering: { key: 'mountaineering', name: 'Mountaineering', era: 7, tech: 'Mountaineering', slot: true, terrainDouble: 'mountain', description: 'Double the mountain terrain economy bonus.' },

  // --- Era 8: Revolution ---
  bayonets: { key: 'bayonets', name: 'Bayonets', era: 8, tech: 'Bayonets', slot: false, special: 'melee_flat_atk', description: 'All :melee: units gain +5 :attack:.' },
  canning: { key: 'canning', name: 'Canning', era: 8, tech: 'Canning', slot: false, citizenOutput: { res: 'food', amount: 1 }, description: 'Each Citizen also produces +1 :food: per tick.' },
  gas_light: { key: 'gas_light', name: 'Gas Light', era: 8, tech: 'Gas Light', slot: false, special: 'building_production_flat', description: 'All buildings also produce +2 :production: per tick.' },
  newspaper: { key: 'newspaper', name: 'Public Schooling', era: 8, tech: 'Newspaper', slot: false, thresholdMult: { res: 'progress', mult: 0.92 }, description: 'Reduce :progress: threshold by 8%.' },
  paper_money: { key: 'paper_money', name: 'Paper Money', era: 8, tech: 'Paper Money', slot: false, citizenOutput: { res: 'gold', amount: 1 }, description: 'Each Citizen also produces +1 :gold: per tick.' },
  civil_rights: { key: 'civil_rights', name: 'Civil Rights', era: 8, tech: 'Civil Rights', slot: true, outputPct: { progress: 0.30, food: -0.20 }, description: 'All :progress: outputs +30%, but all :food: outputs −20%.' },
  guerilla_warfare: { key: 'guerilla_warfare', name: 'Guerilla Warfare', era: 8, tech: 'Guerilla Warfare', slot: true, special: 'trap_damage_plus', description: 'Trap buildings deal +100% damage.' },
  inoculation: { key: 'inoculation', name: 'Inoculation', era: 8, tech: 'Inoculation', slot: true, special: 'extra_pop_gains', description: 'Population gains yield +3 more pops.' },
  levee_en_masse: { key: 'levee_en_masse', name: 'Levee en Masse', era: 8, tech: 'Levee en Masse', slot: true, repairMult: 0.5, special: 'unit_repair', description: 'Unit repair costs 50% less :gold:.' },
  nationalism: { key: 'nationalism', name: 'Nationalism', era: 8, tech: 'Nationalism', slot: true, unitDeath: { res: 'gold' }, description: 'Whenever a unit dies, gain :gold: equal to its :attack:.' },
  native_collaboration: { key: 'native_collaboration', name: 'Native Collaboration', era: 8, tech: 'Native Collaboration', slot: true, special: 'new_world_mercs', description: 'Before combat, spawn 3 free random mercenaries in the New World.' },

  // --- Era 9: Steam ---
  combustion: { key: 'combustion', name: 'Combustion', era: 9, tech: 'Combustion', slot: false, special: 'bridge_ocean', description: 'Units may reposition bridging across ocean.' },
  industrial_agriculture: { key: 'industrial_agriculture', name: 'Industrial Agriculture', era: 9, tech: 'Industrial Agriculture', slot: false, thresholdMult: { res: 'food', mult: 0.92 }, description: 'Reduce :food: threshold by 8%.' },
  railroad: { key: 'railroad', name: 'Railroad', era: 9, tech: 'Railroad', slot: false, thresholdMult: { res: 'production', mult: 0.93 }, description: 'Reduce :production: threshold by 7%.' },
  telegram: { key: 'telegram', name: 'Telegram', era: 9, tech: 'Telegram', slot: false, rangedReach: 1, description: '+1 range to all :ranged: effects.' },
  architectural_tradition: { key: 'architectural_tradition', name: 'Architectural Tradition', era: 9, tech: 'Architectural Tradition', slot: true, special: 'keep_upgrade_levels_building', description: 'Overbuilding a building keeps its upgrade levels.' },
  gunboat_diplomacy: { key: 'gunboat_diplomacy', name: 'Gunboat Diplomacy', era: 9, tech: 'Gunboat Diplomacy', slot: true, special: 'gunboat_flat_atk', description: 'All :naval: units gain +15 base :attack:.' },

  // --- Era 10: Gilded ---
  automobile: { key: 'automobile', name: 'Automobile', era: 10, tech: 'Automobile', slot: false, special: 'pursuit_range', description: 'All units gain +1 pursuit range.' },
  skyscrapers: { key: 'skyscrapers', name: 'Skyscrapers', era: 10, tech: 'Skyscrapers', slot: false, special: 'city_levels', description: 'City buildings gain +5 upgrade levels (requires Urbanization).' },
  eugenics: { key: 'eugenics', name: 'Eugenics', era: 10, tech: 'Eugenics', slot: true, special: 'eugenics_atk', description: 'At the end of each era, all units permanently gain +2 :attack:.' },
  laissez_faire: { key: 'laissez_faire', name: 'Laissez-Faire', era: 10, tech: 'Laissez-Faire', slot: true, totalGoldPct: 0.40, description: 'Total :gold: output +40%.' },
  modernization: { key: 'modernization', name: 'Modernization', era: 10, tech: 'Modernization', slot: true, upgradeMult: 0.7, description: 'Upgrade costs 30% less :gold:.' },
  unions: { key: 'unions', name: 'Unions', era: 10, tech: 'Unions', slot: true, specialistOutput: 3, description: 'Every specialist produces +3 of its highest output.' },

  // --- Era 11: Modern ---
  composites: { key: 'composites', name: 'Composites', era: 11, tech: 'Composites', slot: false, unitAtkPct: 0.25, description: 'All units deal +25% :attack:.' },
  geneva_convention: { key: 'geneva_convention', name: 'Geneva Convention', era: 11, tech: 'Geneva Convention', slot: false, special: 'enemy_budget_reduce', description: 'Enemy host budget reduced by 5%.' },
  replaceable_parts: { key: 'replaceable_parts', name: 'Mass Production', era: 11, tech: 'Replaceable Parts', slot: false, instantBuilds: 2, description: 'On unlock, gain +2 free :production: builds.' },
  socialism: { key: 'socialism', name: 'Socialism', era: 11, tech: 'Socialism', slot: false, policySlots: 1, description: 'Unlock an 8th policy slot.' },
  communism: { key: 'communism', name: 'Communism', era: 11, tech: 'Communism', slot: true, outputPct: { production: 0.30, gold: -0.20 }, description: 'All :production: outputs +30%, but all :gold: outputs −20%.' },
  fascism: { key: 'fascism', name: 'Fascism', era: 11, tech: 'Fascism', slot: true, special: 'low_legit_atk', description: 'While :legitimacy: is below 50, all units deal +100% :attack:.' },
  prohibition: { key: 'prohibition', name: 'Prohibition', era: 11, tech: 'Prohibition', slot: true, special: 'prohibition', description: 'Each Citizen produces +2 to each non-:gold: output, but −1 :gold: per tick.' },
  propaganda: { key: 'propaganda', name: 'Propaganda', era: 11, tech: 'Propaganda', slot: true, legitPerEra: 25, description: 'At the end of each era, gain +25 :legitimacy:.' },
  tourism: { key: 'tourism', name: 'Tourism', era: 11, tech: 'Tourism', slot: true, wonderYieldMult: 2, description: 'Finished wonders yield ×2.' },
  united_nations: { key: 'united_nations', name: 'United Nations', era: 11, tech: 'United Nations', slot: true, mercCostMult: 0.4, description: 'Hiring mercenaries costs 60% less :gold:.' },

  // --- Era 12: Atomic ---
  game_theory: { key: 'game_theory', name: 'Game Theory', era: 12, tech: 'Game Theory', slot: false, special: 'extra_advancement_option', description: '+1 advancement option per :progress: pick.' },
  genome_mapping: { key: 'genome_mapping', name: 'Genome Mapping', era: 12, tech: 'Genome Mapping', slot: false, special: 'pop_on_unlock', description: 'On unlock, gain +20 population.' },
  internet: { key: 'internet', name: 'Internet', era: 12, tech: 'Internet', slot: false, citizenOutput: { res: 'gold', amount: 2 }, description: 'Each Citizen also produces +2 :gold: per tick.' },
  psychology: { key: 'psychology', name: 'Transhumanism', era: 12, tech: 'Psychology', slot: false, special: 'pop_highest_plus', description: "+1 to each pop's highest output." },
  relativity: { key: 'relativity', name: 'Relativity', era: 12, tech: 'Relativity', slot: false, ticksPerEra: 7, description: "Each era's development lasts 7 more ticks." },
  aerodynamics: { key: 'aerodynamics', name: 'Aerodynamics', era: 12, tech: 'Aerodynamics', slot: true, doctrine: { role: 'aerial', pct: 0.50 }, description: ':aerial: units deal +50% :attack:.' },
  ecology: { key: 'ecology', name: 'Ecology', era: 12, tech: 'Ecology', slot: true, terrainDouble: 'all', description: 'Double all terrain economy bonuses.' },
  quantitative_easing: { key: 'quantitative_easing', name: 'Quantitative Easing', era: 12, tech: 'Quantitative Easing', slot: true, goldInterest: 0.20, description: 'At the end of each era, gain :gold: equal to 20% of your unspent :gold:.' },

  // --- Era 13: Silicon ---
  cell_phones: { key: 'cell_phones', name: 'Cell Phones', era: 13, tech: 'Cell Phones', slot: false, thresholdMult: { res: 'production', mult: 0.92 }, description: 'Reduce :production: threshold by 8%.' },
  microprocessors: { key: 'microprocessors', name: 'Microprocessors', era: 13, tech: 'Microprocessors', slot: false, thresholdMult: { res: 'progress', mult: 0.90 }, description: 'Reduce :progress: threshold by 10%.' },
  semaglutides: { key: 'semaglutides', name: 'Semaglutides', era: 13, tech: 'Semaglutides', slot: false, special: 'extra_citizen_gains', description: 'Population gains yield +3 extra Citizens.' },
  video_games: { key: 'video_games', name: 'Video Games', era: 13, tech: 'Video Games', slot: false, special: 'citizen_progress_production_trade', description: 'Each Citizen produces +2 :progress: and −1 :production: per tick.' },
  firewall: { key: 'firewall', name: 'Firewall', era: 13, tech: 'Firewall', slot: true, special: 'enemy_atk_reduce', description: 'All enemy :attack: values reduced by 25%.' },

  // --- Era 14: Lunar ---
  alzheimers_cure: { key: 'alzheimers_cure', name: "Alzheimer's Cure", era: 14, tech: "Alzheimer's Cure", slot: false, popOutputFlat: { res: 'food', amount: 1 }, description: 'All pops also produce +1 :food: per tick.' },
  reuseable_rocketry: { key: 'reuseable_rocketry', name: 'Reuseable Rocketry', era: 14, tech: 'Reuseable Rocketry', slot: false, special: 'moon_earth_adjacent', description: 'All Moon tiles are adjacent to all Earth tiles for buildings.' },
  artificial_meat: { key: 'artificial_meat', name: 'Artificial Meat', era: 14, tech: 'Artificial Meat', slot: true, special: 'artificial_meat', description: ':food: buildings double their output and produce :production: instead of :food:.' },
  lunar_defense_stratagem: { key: 'lunar_defense_stratagem', name: 'Lunar Defense Stratagem', era: 14, tech: 'Lunar Defense Stratagem', slot: true, special: 'moon_atk', description: 'Moon units deal +100% :attack:.' },
  prediction_markets: { key: 'prediction_markets', name: 'Prediction Markets', era: 14, tech: 'Prediction Markets', slot: true, special: 'end_combat_gold_from_atk', description: 'At the end of combat, gain :gold: equal to the total :attack: of surviving units.' },
  universal_basic_income: { key: 'universal_basic_income', name: 'Universal Basic Income', era: 14, tech: 'Universal Basic Income', slot: true, outputPct: { gold: 0.50, production: -0.25 }, description: 'All :gold: outputs +50%, but all :production: outputs −25%.' },

  // --- Era 15: Intelligence ---
  marine_construction: { key: 'marine_construction', name: 'Marine Construction', era: 15, tech: 'Marine Construction', slot: false, special: 'build_on_water', description: 'Land buildings (with no other requirement) can be built on water.' },
  neural_interfaces: { key: 'neural_interfaces', name: 'Neural Interfaces', era: 15, tech: 'Neural Interfaces', slot: false, thresholdMult: { res: 'progress', mult: 0.88 }, description: 'Reduce :progress: threshold by 12%.' },
  p_np: { key: 'p_np', name: 'P=NP', era: 15, tech: 'P=NP', slot: false, special: 'projected_legit', description: 'Combat prep shows projected :legitimacy: loss.' },
  technocracy: { key: 'technocracy', name: 'Technocracy', era: 15, tech: 'Technocracy', slot: false, policySlots: 1, description: 'Unlock a 9th policy slot.' },
  autonomous_governance: { key: 'autonomous_governance', name: 'Autonomous Governance', era: 15, tech: 'Autonomous Governance', slot: true, freeRerolls: 2, description: 'Gain 2 free advancement rerolls.' },
  centralized_cryptocurrency: { key: 'centralized_cryptocurrency', name: 'Centralized Cryptocurrency', era: 15, tech: 'Centralized Cryptocurrency', slot: true, totalGoldPct: 0.60, description: 'Total :gold: output +60%.' },
  rapid_reconstruction: { key: 'rapid_reconstruction', name: 'Rapid Reconstruction', era: 15, tech: 'Rapid Reconstruction', slot: true, repairMult: 0, special: 'building_repair', description: 'Building repair is free.' },

  // --- Era 16: Solar ---
  jovian_life: { key: 'jovian_life', name: 'Hydroponics', era: 16, tech: 'Jovian Life', slot: false, thresholdMult: { res: 'food', mult: 0.90 }, description: 'Reduce :food: threshold by 10%.' },
  beltalowdas: { key: 'beltalowdas', name: 'Beltalowdas', era: 16, tech: 'Beltalowdas', slot: true, terrainDouble: 'asteroid', description: 'Triple the Asteroid terrain economy bonus.' },
  gravboots: { key: 'gravboots', name: 'Gravboots', era: 16, tech: 'Gravboots', slot: true, special: 'build_on_asteroid', description: 'Land buildings (with no other requirement) can be built on Asteroids.' },
  martian_freedom: { key: 'martian_freedom', name: 'Martian Freedom', era: 16, tech: 'Martian Freedom', slot: true, special: 'mars_levels', description: 'Mars units and buildings gain +3 upgrade levels.' },
  replicant_rights: { key: 'replicant_rights', name: 'Replicant Rights', era: 16, tech: 'Replicant Rights', slot: true, special: 'replicant_progress', description: 'Replicant :progress: +200% (requires Replicants).' },

  // --- Era 17: Invasion ---
  adaptive_strategy: { key: 'adaptive_strategy', name: 'Adaptive Strategy', era: 17, tech: 'Adaptive Strategy', slot: true, special: 'combat_atk_ramp', description: 'Units gain +5% :attack: per combat turn (resets each battle).' },
  reinforced_construction: { key: 'reinforced_construction', name: 'Reinforced Construction', era: 17, tech: 'Reinforced Construction', slot: true, buildingDefBonus: 2, description: 'All buildings gain +2 :defense:.' },

  // --- Era 18: Exodus ---
  mass_drivers: { key: 'mass_drivers', name: 'Mass Drivers', era: 18, tech: 'Mass Drivers', slot: false, special: 'bridge_space', description: 'Units may reposition bridging across space.' },
  occlusion: { key: 'occlusion', name: 'Occlusion', era: 18, tech: 'Occlusion', slot: false, unitDefBonus: 1, buildingDefBonus: 1, special: 'space_only', description: 'All units and buildings in space gain +1 :defense:.' },
  cosmic_myth: { key: 'cosmic_myth', name: 'Cosmic Myth', era: 18, tech: 'Cosmic Myth', slot: true, unitDeath: { res: 'legitimacy', flat: 1 }, description: 'Whenever a unit dies, gain +1 :legitimacy:.' },
  deepfaked_reality: { key: 'deepfaked_reality', name: 'Deepfaked Reality', era: 18, tech: 'Deepfaked Reality', slot: true, legitPerEra: 50, description: 'At the end of each era, gain +50 :legitimacy:.' },

  // --- Era 19: Frontier ---
  matter_compression: { key: 'matter_compression', name: 'Matter Compression', era: 19, tech: 'Matter Compression', slot: false, thresholdMult: { res: 'production', mult: 0.90 }, description: 'Reduce :production: threshold by 10%.' },
  tightbeams: { key: 'tightbeams', name: 'Tightbeams', era: 19, tech: 'Tightbeams', slot: false, rangedReach: 1, description: '+1 range to all :ranged: effects.' },
  neocolonialism: { key: 'neocolonialism', name: 'Neocolonialism', era: 19, tech: 'Neocolonialism', slot: true, special: 'exoplanet_gold', description: 'Exoplanet buildings produce +150% :gold:.' },
  perfect_trade: { key: 'perfect_trade', name: 'Perfect Trade', era: 19, tech: 'Perfect Trade', slot: true, goldInterest: 0.30, description: 'At the end of each era, gain :gold: equal to 30% of your unspent :gold:.' },

  // --- Era 20: Liminite ---
  liminism: { key: 'liminism', name: 'Liminism', era: 20, tech: 'Liminism', slot: false, ticksPerEra: 8, description: "Each era's development lasts 8 more ticks." },
  liminite: { key: 'liminite', name: 'Liminite', era: 20, tech: 'Liminite', slot: false, unitDefBonus: 1, unitAtkPct: 0.40, description: 'All units gain +1 :defense: and deal +40% :attack:.' },
  star_hopping: { key: 'star_hopping', name: 'Star Hopping', era: 20, tech: 'Star Hopping', slot: true, wonderYieldMult: 3, description: 'Finished wonders yield ×3.' },

  // --- Era 21: Xenotic ---
  chimeric_agriculture: { key: 'chimeric_agriculture', name: 'Chimeric Agriculture', era: 21, tech: 'Chimeric Agriculture', slot: false, thresholdMult: { res: 'food', mult: 0.88 }, description: 'Reduce :food: threshold by 12%.' },
  cortical_stacks: { key: 'cortical_stacks', name: 'Cortical Stacks', era: 21, tech: 'Cortical Stacks', slot: true, repairMult: 0, special: 'unit_repair', description: 'Unit repair is free.' },
  hive_mind: { key: 'hive_mind', name: 'Hive Mind', era: 21, tech: 'Hive Mind', slot: true, special: 'hive_mind_levels', description: 'Buildings gain +1 upgrade level per adjacent building.' },
  xenodiplomacy: { key: 'xenodiplomacy', name: 'Xenodiplomacy', era: 21, tech: 'Xenodiplomacy', slot: true, special: 'alien_ranged_mercs', description: 'Hire 6 alien :ranged: mercenaries.' },

  // --- Era 22: Evolution ---
  forced_evolution: { key: 'forced_evolution', name: 'Forced Evolution', era: 22, tech: 'Forced Evolution', slot: false, popOutputFlat: { res: 'food', amount: 4 }, special: 'non_robot_pop', description: 'Evolved prefix: +4 :food: per non-robot pop.' },
  machine_synthesis: { key: 'machine_synthesis', name: 'Machine Synthesis', era: 22, tech: 'Machine Synthesis', slot: false, popOutputFlat: { res: 'production', amount: 4 }, special: 'non_robot_pop', description: 'Cyborg prefix: +4 :production: per non-robot pop.' },
  psychic_awakening: { key: 'psychic_awakening', name: 'Psychic Awakening', era: 22, tech: 'Psychic Awakening', slot: false, popOutputFlat: { res: 'progress', amount: 4 }, special: 'non_robot_pop', description: 'Psychic prefix: +4 :progress: per non-robot pop.' },
  replication: { key: 'replication', name: 'Replication', era: 22, tech: 'Replication', slot: false, instantBuilds: 2, description: 'On unlock, gain +2 free :production: builds.' },
  cosmic_celebration: { key: 'cosmic_celebration', name: 'Cosmic Celebration', era: 22, tech: 'Cosmic Celebration', slot: true, extraEraEndTriggers: 2, description: 'End-of-era effects trigger 2 additional times (stacks additively with Festivals).' },
  futurization: { key: 'futurization', name: 'Futurization', era: 22, tech: 'Futurization', slot: true, upgradeMult: 0.4, description: 'Upgrade costs 60% less :gold:.' },

  // --- Era 23: Early Galactic ---
  ftl: { key: 'ftl', name: 'FTL', era: 23, tech: 'FTL', slot: false, special: 'bridge_deep_space', description: 'Units may reposition bridging across deep space.' },
  galactic_legion: { key: 'galactic_legion', name: 'Galactic Legion', era: 23, tech: 'Galactic Legion', slot: true, special: 'copy_unit_on_build', description: 'Producing a unit copies it onto a random adjacent tile.' },
  spaceflight_tactics: { key: 'spaceflight_tactics', name: 'Spaceflight Tactics', era: 23, tech: 'Spaceflight Tactics', slot: true, doctrine: { role: 'astral', pct: 0.50 }, description: ':astral: units deal +50% :attack:.' },

  // --- Era 24: Late Galactic ---
  antimatter: { key: 'antimatter', name: 'Antimatter', era: 24, tech: 'Antimatter', slot: false, unitAtkPct: 0.60, description: 'All units deal +60% :attack:.' },
  hyperquantum_computing: { key: 'hyperquantum_computing', name: 'Hyperquantum Computing', era: 24, tech: 'Hyperquantum Computing', slot: false, thresholdMult: { res: 'progress', mult: 0.86 }, description: 'Reduce :progress: threshold by 14%.' },
  megastructure_engineering: { key: 'megastructure_engineering', name: 'Megastructure Engineering', era: 24, tech: 'Megastructure Engineering', slot: false, wonderCostReduce: 2, description: 'Wonders cost 2 fewer builds to finish (floor 1).' },
  nanoswarms: { key: 'nanoswarms', name: 'Nanoswarms', era: 24, tech: 'Nanoswarms', slot: false, thresholdMult: { res: 'production', mult: 0.88 }, description: 'Reduce :production: threshold by 12%.' },
  empire_of_the_stars: { key: 'empire_of_the_stars', name: 'Empire of the Stars', era: 24, tech: 'Empire of the Stars', slot: true, special: 'space_levels', description: 'Space buildings gain +4 upgrade levels.' },
  omniplomacy: { key: 'omniplomacy', name: 'Omniplomacy', era: 24, tech: 'Omniplomacy', slot: true, mercLevels: 6, description: 'Mercenaries are hired 6 upgrade levels higher.' },

  // --- Era 25: Utopian ---
  biological_immortality: { key: 'biological_immortality', name: 'Biological Immortality', era: 25, tech: 'Biological Immortality', slot: true, special: 'double_pop_gains', description: 'Population gains are doubled.' },
  nanite_warfare: { key: 'nanite_warfare', name: 'Nanite Warfare', era: 25, tech: 'Nanite Warfare', slot: true, special: 'poison_on_start', description: 'At combat start, poison all enemies (5% max HP per turn).' },
  purpose_engineering: { key: 'purpose_engineering', name: 'Purpose Engineering', era: 25, tech: 'Purpose Engineering', slot: true, specialistOutput: 5, description: 'Every specialist produces +5 of its highest output.' },

  // --- Era 26: Time ---
  omnicracy: { key: 'omnicracy', name: 'Omnicracy', era: 26, tech: 'Omnicracy', slot: false, policySlots: 1, description: '+1 policy slot.' },
  time_travel: { key: 'time_travel', name: 'Time Travel', era: 26, tech: 'Time Travel', slot: false, ticksPerEra: 12, description: "Each era's development lasts 12 more ticks." },
  chronoscopy: { key: 'chronoscopy', name: 'Chronoscopy', era: 26, tech: 'Chronoscopy', slot: true, freeRerolls: 3, description: 'Gain 3 free advancement rerolls.' },

  // --- Era 27: Infinity ---
  elder_awareness: { key: 'elder_awareness', name: 'Elder Awareness', era: 27, tech: 'Elder Awareness', slot: true, special: 'azazoth_damage', description: '+50% damage vs Azazoth.' },
  entropic_reversal: { key: 'entropic_reversal', name: 'Entropic Reversal', era: 27, tech: 'Entropic Reversal', slot: true, special: 'double_upgrade_levels_unit', description: 'Units have double upgrade levels.' },
  multiversal_army: { key: 'multiversal_army', name: 'Multiversal Army', era: 27, tech: 'Multiversal Army', slot: true, mercCostMult: 0.25, description: 'Mercenary hire cost −75%.' },
}

/** Display text for a policy/bonus (new v2 entries use `description`; v1 uses `effect`). */
export function policyEffect(def) {
  return def?.effect ?? def?.description ?? ''
}
