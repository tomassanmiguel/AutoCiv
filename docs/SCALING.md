# Scaling, Schemas & Taxonomy

The shared math and structure every other doc builds on. **`[proposed]` = my number, tune it.**

---

## 1. Eras

`E` = **0-based era index**. The 28 eras:

| E | Era | E | Era | E | Era | E | Era |
|--|--|--|--|--|--|--|--|
| 0 | Stone | 7 | Exploration | 14 | Lunar | 21 | Xenotic |
| 1 | Bronze | 8 | Revolution | 15 | Intelligence | 22 | Evolution |
| 2 | Iron | 9 | Steam | 16 | Solar | 23 | Early Galactic |
| 3 | Classical | 10 | Gilded | 17 | Invasion | 24 | Late Galactic |
| 4 | Early Medieval | 11 | Modern | 18 | Exodus | 25 | Utopian |
| 5 | Late Medieval | 12 | Atomic | 19 | Frontier | 26 | Time |
| 6 | Renaissance | 13 | Silicon | 20 | Liminite | 27 | Infinity |

---

## 2. Core growth model

Everything era-scaled uses `value(E) = base · g^E`. An entity is authored with its **base at its
unlock era**, so a tier unlocked later is simply stronger; you rarely list more than the base.

| Domain | growth `g` | Notes |
|---|---|---|
| Building output (all resources) | **1.15** | ~3/tick Stone base; a building authored at era E has base `≈ 3·1.15^E` |
| Unit attack | **1.15** | tracks output so towers keep pace with the economy |
| **Enemy HP** | **1.25** | outpaces player attack on purpose |
| Enemy attack (vs blockers) | flat base `[proposed]` | plus per-type unit/building multipliers |
| Enemy legitimacy-damage (on breach) | **+1/era** (linear) | `legit = base_legit + E` |

**Thresholds are already defined in code** (`src/game/data/resources.js`) — don't re-invent them:
`threshold(N) = threshold(N-1) + X · 1.25^E · n · R`, per-resource `{T0, X, targetPerEra}` =
progress `{10, 5.6, 5}` · food `{15, 13.3, 3}` · production `{20, 7.4, 4}`. The per-resource *pace*
difference lives in `X` (jump size) and `targetPerEra` (levels expected per era), so **food is gentler**
(targetPerEra 3, big jumps) and **progress fastest** (targetPerEra 5) — no separate per-resource
exponent needed. Note thresholds grow at `1.25^E` while output grows at `1.15^E`, so requirements
pull ahead of raw per-tick output — more of the "keep investing" pressure. `TICKS_PER_ERA = 65` (base;
Calendar-line techs extend it).

**The central tension:** a same-tier unit's attack (`·1.15^E`) falls behind a same-era enemy's HP
(`·1.25^E`), so a **raw** unit needs more and more hits over time. Players close the gap with **upgrade
levels** (+25% each, additive), **command buildings** (+50%/+100% dmg), **terrain** (Planet +100% dmg),
**policies/wonders** (Skynet +75%, Caste, Tribalism…), and **replacing** old tiers with new ones.

**Calibration target** `[proposed]`: a unit that is ~2 tiers deep in its chain with +2 upgrade levels
and one command aura should **2–3-shot a same-era normal enemy** (Raider-class). Cannon-fodder
enemies (Thrall, 1 HP) die to anything; heavies (Juggernaut/Titan) take many hits by design.

Worked curve — `1.15^E`: E0 = 1.00 · E5 = 2.01 · E10 = 4.05 · E15 = 8.14 · E20 = 16.4 · E27 = 43.5.
`1.25^E`: E5 = 3.05 · E10 = 9.31 · E15 = 28.4 · E20 = 86.7 · E27 = 407.

---

## 3. Upgrade levels

- **Additive.** Level `L` (0 = as-built) scales the entity's upgrade stat by `(1 + 0.25·L)`.
- Each entity declares **what its upgrade targets**: units → **attack**; output buildings → **output**;
  some buildings → **range** (+1/level, e.g. Watchtower, Command Post) or **def**.
- **"Effect level" = upgrade level** (same thing).
- **Free levels** granted by Power buildings (Windmill +1 / Coal +2 / Fusion +3 in range), policies
  (Colonialism +2, Empire of the Stars +4), and wonders (Machu Picchu +2, Happy Valley +8) **do not
  raise upgrade cost** — they stack on top of purchased levels.
- Gold cost to buy a level: `[proposed]` `base · 1.15^E · (L+1)` (rises per level; refine in economy pass).
- Specialists upgrade **up their chain** for gold (Astrologer → Scholar → …), a one-way conversion of
  that pop type; unit/building tiers instead stay unlocked and are **cycled** at build time.

---

## 4. Legitimacy (uncapped, no production)

No cap, no per-tick output. **Sources** (all discrete): completing a Legitimacy building (Shrine +10 …
Elysium +50), end-of-era effects (Cathedral +5, Stonehenge +25, Priest +1, Theocracy…), and a few
policies. **Sinks/leverage:** Elysium (gold/tick = legitimacy), Monastery (progress/tick =
legitimacy/20), Organized Religion (end-era gold ∝ legitimacy), Hagia Sophia (doubles it). Because every
point is bought, legitimacy is a deliberate investment axis, not a passive trickle.

---

## 5. Terrain

**All terrain bonuses are FLAT — they do not scale with era.** The listed magnitudes are absolute
(Plains +1/tick … Exosea +100 … Planet +500). Relevance is preserved by *availability*, not scaling:
early terrains give small flat bonuses, and the huge ones (Exosea, Planet) only exist in the late
eras where you actually reach them.
- **Economy bonus:** flat per-tick output a building gains from its tile (by resource type).
- **Combat modifier:** flat too (Forest +1 def, Mountain +1 range, Planet +5 range / +100% dmg).

---

## 6. Reroll (progress options)

Spending gold rerolls the current advancement offer. Cost of the `k`-th reroll this pick:
`cost(k) = 25 · 1.15^E · 2^k` `[proposed]`, **resetting to k=0 after any pick is made**. Techs
(State Alchemists / Autonomous Governance / Chronoscopy) grant **1/2/3 free rerolls** per pick.

---

## 7. Wonders

A wonder occupies the dedicated **Wonder slot**, unlocks a placeable **incomplete** building, and needs
**N additional production-builds** to finish (does nothing until complete; only one wonder in flight;
destroyed → restart). **N = 3 for every wonder to start** (regardless of size); we rebalance per-wonder
later. Monumentality / Megastructure Engineering halve `N`; Pilgrimage / Tourism / Star Hopping boost
finished wonder yields.

---

## 8. Multi-tile entities `[proposed]`

An entity may occupy a `w×h` rectangle. Rules:
- **Anchor** at bottom-left; **occupies the building (or unit) slot of every covered tile**; placement
  requires all covered tiles valid + free in that slot.
- Acts as **one instance** with a shared HP pool; blocks/impedes across its whole **front row**; a
  ranged attacker in range of **any** covered tile can hit it.
- Used by Great Wall (4×1), Death Star (2×2), Hadron Collider (3×3 ring — must cover ≥1 land),
  and enemy Titan (2×2) / Flagship (4×2).

---

## 9. Unit schema & behaviors

Fields: **`atk`** · **`def`** (= HP) · **`range`** (Manhattan diamond) · **`pursuit`** (chase if an
enemy is within `range+pursuit`) · **`cooldown`** (turns between attacks, default 0) · **`abilities`**.
Targets the **lowest-HP enemy in range**. Turn order: bottom-to-top, left-to-right.

| Category | Behavior | def band | Notes |
|---|---|---|---|
| **Melee** | Attack only when enemy adjacent; never moves | 2–4 | frontline blocker |
| **Ranged** | Attack from afar when enemy in range | 1 | glass backline |
| **Cavalry** | Attack adjacent; pursue enemies within range+pursuit | 2–3 | mobile |
| **Siege** | Ranged + **splash**; **2-turn cooldown** after firing | 1 | AoE artillery |
| **Naval** | Usually ranged; **water only** | 1–4 | |
| **Aerial** | Fast melee w/ cavalry move; over water (later space); **flanks — won't engage from front unless forced** | 1 | |
| **Astral** | Ranged w/ cavalry move; **space only** | 1–4 | |
| **Auxiliary** | Unique-ability specials | varies | |

**Calibration anchors** `[proposed]`: era-0 attack anchor **Melee 5 · Ranged 4 · Cavalry 5**; a tier
unlocked at era E gets `atk = round(anchor · 1.15^E)`. `def` sits near the low end of its band, drifting
up ~1 across a chain. See `units.md`.

---

## 10. Building schema & the two tabs

Fields: **`def`** (= HP, low) · optional **`atk`/`range`** (towers only) · **`output`** (per-tick
resource) · **`upgradeTarget`** (output | range | def) · **`placement`** (terrain class / special) ·
**`footprint`** · **`effect`**. Buildings normally don't attack. Split into two UI tabs:

**Military infrastructure** (4 categories)
- **Traps** — manipulate/damage enemies (Caltrops, Powder Magazine, Decoy, Sea Mine, Discombobulator, Singularity)
- **Command** — buff allies (Command Post, Psy-Link, Watchtower, Radar, Chronobooster, Fort, Deflector Array, Armory)
- **Spawners** — periodically create your best unit of a type (Stables / Drydock / Aircraft Carrier / Spaceport)
- **Walls** — pure blockers (Mud Brick → Stone Wall → Castle → Shield Matrix; Great Wall)

**Civilian infrastructure** (6 categories, by output axis)
- **Progress** — Library → School → Laboratory → Space Telescope → Cogitorium → Black Hole Station
- **Production** — Workshop → Forge → Factory → 3D Printer → Vacuum Assembly → Dyson Sphere
- **Food** — Farm → Aqueduct → Hospital → Hydroponicist → Xenocultivator → Cloning Bay
- **Gold** — Market → Mint → Stock Exchange → Data Center → Asteroid Mine → Spice Extractor
- **Legitimacy** — Shrine → Temple → Monastery → Cathedral → Elysium
- **Support** — everything else: Power (Windmill/Coal/Fusion), Scaling (Cave Painting/Ranch/Glassworks),
  End-of-era (Arena/Theater) + multiples (Caravansary/Solar Array), Naval-economy (Pier/Harbor/Lighthouse/
  Artificial Island), Terrain-specific (Observatory/Lumber Mill), and Museum/Bank/City/Roads/Tleilaxu/Artificial Planet

**Wonders** get their own dedicated slot (see §7).

---

## 11. Population & specialists

Base **Citizen** = 1 progress / 1 production / 1 food per tick. Specialist chains upgrade with gold
(one-way). Prefix techs (mutually exclusive): **Evolved → +food**, **Cyborg → +production**,
**Psychic → +progress** on all non-robot population. Details in `specialists.md`.
