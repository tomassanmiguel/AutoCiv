# What the existing content still needs

Decisions still owed for content that **already exists**. Nothing here is about
techs yet to be invented.

Every item in `content.json` validates against the schema. **That means the
structure is legal, not that the intent is captured.**

Two passes produced this list:
- a mechanical scan for missing numbers, unresolved references and unparameterised rules
- a per-item audit of all 388 entries against [`design-brief.md`](design-brief.md),
  with a second agent per slice hunting what the first missed — **813 findings**
  (217 blocker · 512 important · 84 minor), in `scratchpad/gaps-all.json`

---

## RESOLVED — decisions taken, now in [`design.md`](design.md)

| was | decided |
|---|---|
| Five unit classes had no stat line | One unit per class; placeholder stat lines for all nine, siege blast 1, command radius 2 |
| "Create a melee unit" — which unit? | Place one more of the class; techs upgrade the whole class together |
| Combat cadence undefined | Era = tech pools only. Combat = wave, 30 of them, difficulty scales independently |
| Yield order of operations | `base × (1 + Σ percentages)`; percentages additive |
| Wonder system unspecified | Wonders are drafted techs; a :production: threshold builds the one you hold, instead of a city. Never offered a second while one is unbuilt |
| Food vs city founding | Food expands **automatically** (highest-yield outpost); cities come from :production: |
| Temple base yield | Defined by Monotheism/Polytheism; every other religion tech requires one of them |
| Outposts and citizens | Outposts have none. "Adjacent outposts or citizens" = adjacent outposts + population of adjacent cities |
| Vision techs | Removed. The Technology track reveals the map automatically, one notch per era |
| Caltrops / Moats "damage equal to def" | The **defender's** def |
| Liminite Reflection | The **attacker's** attack |
| Manhattan Project razing | Ordinary raze — a ruin gold can rebuild |
| Building placement | Multi-select list |
| Duplicate techs | Acknowledged; the designer will adjust |

---

## BLOCKERS — still open

### 1. 54 of the 98 "vs" pairs can never be offered against each other
Exclusivity is now a real field, and 44 pairs are wired. The other 54 have their
two halves in **different quadrants or different eras**, so with a
current-tier-only draft on four independent clocks the choice is never presented.
Full list in `scratchpad/unofferable-vs.json`. Examples:

- Leatherwork (military) **vs** Pottery (economy)
- Star Forts (military) **vs** Imperial Guard (society)
- Gunpowder (military/Renaissance) **vs** Fireworks (society/Medieval)
- Armor (military/Bronze) **vs** Steel (military/Medieval)

Each needs either a move so both halves share a pool, or a decision that the
pairing is abandoned.

### 2. Do flat bonuses to the same stat stack, or replace?
Bronze Working +3, Iron Working +6, Steel +12 are currently **additive (+21)**.
The old progress web modelled weapons as *tiers that replace*. Same question for
the fortification line (Masonry +5, Castles +10, Star Forts +20, Magnetic
Deflectors +40 — additive would be +75).

### 3. Where does a granted unit appear?
"Create a melee unit" appears ~40 times and nothing says where it is placed, or
what happens when there is no legal tile — Levee en Masse grants five at once.

### 4. Does a repaired casualty keep its accumulated bonuses?
Professional Army, Military Tribunals, Taj Mahal and Armory all grant *permanent*
per-unit bonuses. When a unit dies and gold rebuilds it, does it return with them
or at base? This is the single largest unanswered rule in combat.

### 5. Class membership for "ranged" bonuses
The brief's Concepts section calls **siege** and **astral** "ranged", and
**naval** "ranged or melee depending on selection". So every "ranged units get
+X" tech has an undecided membership question — does Ballistics buff siege?

### 6. Do class-wide drawbacks apply retroactively?
Kamikaze gives aerial units +20 attack **and** "die immediately after their first
attack". Encoded class-wide, it would cripple every aerial unit already on the
board. Intended?

---

## IMPORTANT — open

- **Do end-of-combat GRANTS count as "end of combat effects"?** Festivals,
  Colosseum and Cosmic Celebration each add a trigger repeat. Does Clone Armies
  ("receive a melee unit at the end of every combat") then grant three?
- **Megafarm's radius is never stated** — "produces food equal to all food
  produced in range". Every other building states one.
- **A building's era is a separate field from its unlocking tech's era.** Should
  it just *be* the tech's era?
- **34 of 47 buildings have no placement rule** — is "anywhere you control" right
  for all of them, or is the brief simply silent?
- **Skynet: "all thresholds increased by 10"** — 10 flat, or 10%?
- **Wonder tier ↔ era mapping is my assumption** (I→Bronze, II→Classical,
  III→Medieval, IV→Steam, V→Modern, VI→Information, VII→Solar, VIII→Exodus,
  IX→Galactic), as is every wonder's quadrant.
- **Every era number in the dataset is an assumption.** The brief assigns none.

### Magnitudes that are still my invention

| tech | brief says | encoded as |
|---|---|---|
| Foraging / Agriculture / Mining | "increases the yield of…" | +1 |
| Urbanization / Sanitation / Subways | "increases the growth rate of cities" | +10% |
| Terraforming | "increases output of Martian and planet tiles" | +2 |
| Consciousness Upload | "massively increases growth rate" | +100% |
| Mercenary Army | "reduces mercenary recruitment cost" | −25% |
| Megaton Explosives | "increase the radius of siege unit damage" | +1 blast |
| Hanging Gardens | "massively increased growth rate" | +100% |
| Statue of Liberty | "significantly increases city growth rate" | +50% |

**Timbering is the tell** — the only terrain-yield tech that states its number
("by 1"), which suggests +1 is right for its siblings. Inference, not
instruction.

### Encoding errors found and fixed
Recorded so the class of mistake is recognisable, not because they are still open:
- **Building radii were being dropped entirely** and encoded in the wrong
  direction (`in_range_of` = "the subject is near something", instead of "things
  near this building"). 30 effects across the building set were wrong. Fixed.
- **Dressage** — "+1 atk for every tile they've moved" had become "+1 per turn".
- **Metallurgy** — "units in range 1" had become "in range of any building".
- **Scorched Earth** — "they take damage" had become *all* enemies rather than
  the one that razed.
- **Plasma Beams** — the target-selection rule ("the target that hits the most
  enemies, total remaining defence as tiebreaker") is carried by no effect and is
  **still missing**.
