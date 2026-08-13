# AutoCiv v5 — Balance Targets & Enemy Formula

> Reference for **hand-authoring content**. These are *rough anchors*, not rules — a piece should
> land near its era's target for its output type, then earn a bump (or take a cut) from placement.
> All growth constants are exposed so you can retune globally.

---

## 1. Placement tiers (applies to every deployable)

Author the **average** number as the anchor, then let configuration move it:

| Tier | Multiplier | Meaning |
|---|:---:|---|
| Poor | **×0.6** | isolated / off-terrain — behind the curve |
| Average | **×1.0** | the published target |
| Good | **×1.3** | full adjacency + right terrain — slightly beats the curve |

So a piece whose base is the poor number and whose bonuses reach the good number is "correctly shaped."

---

## 2. Per-era targets

E = era index (0-based). Constants shown at the top of each column.

| E | Era | Prod cost¹ | Prog cost² | Upkeep³ | **Econ /turn**⁴ | **Combat scalar**⁵ |
|:-:|---|:-:|:-:|:-:|:-:|:-:|
| 0 | Stone | 1 | 1 | 1 | 2 | 8 |
| 1 | Bronze | 2 | 2 | 1 | 3 | 12 |
| 2 | Iron | 3 | 4 | 1 | 4 | 18 |
| 3 | Classical | 5 | 6 | 1 | 5 | 27 |
| 4 | Medieval | 7 | 9 | 2 | 8 | 41 |
| 5 | Renaissance | 9 | 13 | 3 | 11 | 61 |
| 6 | Exploration | 11 | 19 | 4 | 15 | 91 |
| 7 | Steam | 13 | 27 | 5 | 21 | 137 |
| 8 | Modern | 15 | 39 | 7 | 30 | 205 |
| 9 | Information | 18 | 56 | 10 | 41 | 308 |
| 10 | Solar | 21 | 81 | 14 | 58 | 461 |
| 11 | Exodus | 24 | 117 | 20 | 81 | 692 |
| 12 | Liminite | 27 | 168 | 28 | 113 | 1038 |
| 13 | Galactic | 31 | 242 | 40 | 159 | 1557 |
| 14 | Ascension | 35 | 349 | 56 | 222 | 2335 |

1. **Prod cost** = `round(1 + E + E²/10)` — mildly super-linear (ramps up faster than the old linear
   Sheet-1 column), for the *first* deployable of a type. **Same-type ramp is now accelerating:** the
   nth copy adds `1 + (n-2)(n-1)/2` → extra cost `+0, +1, +2, +4, +7, +11, +16, …` (2nd +1, 3rd +2,
   4th +4, 5th +7). This makes the quadratic count-scaling engines (Legion line, Temple) progressively
   more expensive to stack, so they can't run away for free.
2. **Prog cost /unlock** — hand-tuned early boost (**1,2,4,6,9**) then ~×1.44/era. Front-loaded because
   the rest of the economy scales fast, so early tech shouldn't be near-free. 4 unlocks → next era.
3. **Upkeep** = `round(0.5 · 1.4^E)`, min 1 — **accelerates** each era (same slope as economy) so
   gold becomes a real constraint late: you must dedicate part of the tableau to gold, not build
   freely. Matches seed data early (≈1; Medieval Longbowman ≈2) and climbs hard afterward.
4. **Econ /turn** = `round(2 · 1.4^E)` — target per-turn output of one *average-placed* economic
   building (food, gold, progress, production, **or legitimacy** — legit is just a defensive output type).
5. **Combat scalar** = `round(8 · 1.5^E)` — target *primary* scalar (attack **or** defense×2 **or**
   bombardment) of one *average-configured* unit. See §4 for how multi-scalar units split this.

### 2.1 Reading the tiers off the table

For any target `C` in the table: **poor = 0.6·C, good = 1.3·C.** E.g. a Medieval combat unit (C=41):
poor ≈ 25, avg ≈ 41, good ≈ 53. A Classical econ building (C=5): poor ≈ 3, avg ≈ 5, good ≈ 7.

### 2.2 The two dials

- **Combat slope `1.5`** vs **econ slope `1.4`** — combat outpaces economy slightly each era, so
  defense can't be ignored. Flatten combat toward 1.4 if waves feel too swingy.
- These are the only two exponents in the whole economy. Change them and the game re-tunes wholesale.

---

## 3. Costs that aren't era-scaled

- **Expansion (food)** = `terrainBaseCost + max(0, ringDistanceFromPalace − 1)`. Distance-based, era-
  independent. Terrain base: **1** plains/forest/hills/coast · **2** mountain/island · **3** desert/tundra ·
  **10** lunar/near-space · **12** mars · **15** asteroid/deep · **100** planet/star/singularity.
- **Progress reroll** = `5 + 5·(rerolls used this game)` (gold), as specified.
- **Legitimacy** starts **100**; net change per wave is emitted by the combat sim (§4), not a target.

---

## 4. Multi-value pieces (how to split a target)

A piece rarely gives one number. Split the era target across what it does, keeping the **total value**
near `C`:

- **Combat value accounting** (land-equivalent): `value = Σ raw(stat) × statWeight × domainPremium`
  - **domainPremium**: Land **1.0** · Sea **2.5** · Sky **5.0** · Space **13.0**
  - **statWeight**: Attack **1.0** · Defense **0.5** · Bombardment **0.8**
  - So a unit's total combat value should sit near `C(E)`. A pure-defense wall giving `2·C` raw defense
    is on-value (defense is half-worth). A Sea attacker giving `C/2.5` raw sea-attack is on-value.
- **Economy**: a building that outputs two resources should split so each stream is ~`C/2`, or lean one
  way and dip below on the other. Multi-turn snowball pieces (Ranch-style "+1/turn") should *start* well
  under `C` and cross it after N turns.

Design smell test: **sum a piece's value across everything it does; it should read poor/avg/good vs `C`.**

---

## 5. Enemy waves — era-independent formula

Waves fire every 3 turns; `w` = wave number (1,2,3,…). Difficulty is anchored to the **player's own
military**, so it's fair regardless of how fast you teched (era-independent by construction).

### 5.1 Budget (in land-equivalent points)

```
P        = player's total deployed military value            // §4 accounting, summed over all units
pressure = p0 · pr^(w-1)                                       // p0 = 0.85, pr = 1.05
floor    = f0 · fr^(w-1)                                       // f0 = 10,  fr = 1.30
B(w)     = max(P, floor) · pressure · (1 ± v)                 // v = 0.15  (±15% roll)
```

`pressure`: wave 1 ≈ 0.85× your army, +5%/wave compounding → wave 10 ≈ 1.3×, wave 20 ≈ 2.2×,
wave 30 ≈ 3.5×. Superlinear, matching the spec's "difficulty roughly doubles per half-step."
`floor` guarantees a rising threat even if you under-invest in military (can't turtle to zero).

### 5.2 Domain availability (don't hit a domain the player can't contest)

```
domain d unlocks at wave Wd:  Land 1 · Sea 4 · Sky 12 · Space 20      // or: unlock when player has vision/presence there
ramp_d = clamp((w - Wd + 1) / 3, 0, 1)                                 // fades in over 3 waves
```

### 5.3 Split budget across available domains

```
baseWeight:  Land 1.0 · Sea 0.5 · Sky 0.7 · Space 1.0        // higher domains, once online, are decisive
w_d      = baseWeight_d · ramp_d · (1 ± 0.25)                 // jitter for composition variance
f_d      = w_d / Σ w_d                                        // normalize
V_d      = f_d · B(w)                                         // land-equiv budget for domain d
```

Composition variance matters more than budget (per spec) — the ±25% domain jitter is the main knob.

### 5.4 Archetype → within-domain stat split (Atk / Def / Bomb)

| Archetype | Atk | Def | Bomb | Threatens |
|---|:-:|:-:|:-:|---|
| Rush | 70 | 15 | 15 | undefended attackers |
| Line | 45 | 35 | 20 | balanced tableaus |
| Siege | 30 | 25 | 45 | thin defense (bombard spills down) |
| Turtle | 20 | 55 | 25 | pure-attack players (nothing to kill) |

Weighted random pick; apply one archetype to all domains, or roll per-domain for chaos.

### 5.5 Convert value → raw scalars

```
raw(stat, d) = V_d · share_stat / (domainPremium_d · statWeight_stat)
```

### 5.6 Worked example — wave 6, player army P = 200, Line archetype, Sea online (ramp 0.67)

```
pressure = 0.85 · 1.05^5 = 1.08
B        = max(200, floor) · 1.08 · (+8% roll) ≈ 233
domains  → Land f≈0.75 (V=175), Sea f≈0.25 (V=58)
Land:  Atk 175·.45/(1·1)   = 79   Def 175·.35/(1·.5)   = 123   Bomb 175·.20/(1·.8)   = 44
Sea:   Atk  58·.45/(2.5·1) = 10   Def  58·.35/(2.5·.5) = 16    Bomb  58·.20/(2.5·.8) = 6
```
**Enemy card:** Land 79 / 123 / 44 · Sea 10 / 16 / 6. Legible as the same 12 scalars you use.

### 5.7 Alternative: fixed (wave-only) budget

If you'd rather difficulty *not* track the player: `B(w) = 14 · 1.32^(w-1) · (1 ± 0.15)`, then §5.2–5.5
unchanged. Simpler, but a strong player faces trivial waves and a weak one gets crushed — the
P-anchored version self-balances.

---

## 6. Constants summary (retune here)

| Constant | Symbol | Suggested | Governs |
|---|---|:-:|---|
| Econ output | — | `2 · 1.4^E` | building output target |
| Combat scalar | — | `8 · 1.5^E` | unit scalar target |
| Prod cost | — | `round(1 + E + E²/10)` | build cost (super-linear) |
| Progress cost | — | authored `1,2,4,6,9…` (~×1.44 late) | tech cost per era |
| Upkeep | — | `0.5 · 1.4^E` | per-deployable gold drain (accelerating) |
| Poor / Good tier | — | 0.6 / 1.3 | placement swing |
| Wave pressure base / slope | p0 / pr | 0.85 / 1.05 | wave difficulty ramp |
| Wave floor base / slope | f0 / fr | 10 / 1.30 | anti-turtle threat |
| Budget variance | v | 0.15 | wave size roll |
| Domain jitter | — | 0.25 | composition swing |
| Domain premium | — | 1 / 2.5 / 5 / 13 | Land / Sea / Sky / Space |
| Stat weight | — | 1 / 0.5 / 0.8 | Atk / Def / Bomb |
