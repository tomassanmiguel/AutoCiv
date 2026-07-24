# Population & Specialists

Per-pop, per-tick output. The **Citizen** is the auto-unlocked generalist; specialists are unlocked as
advancements and you **spend gold to upgrade your pops up a chain** (Astrologer → Scholar → …), a
one-way conversion of that pop type. Each item lists its **unlocking tech** (which differs from the pop
name).

**Per-pop output scales LINEARLY across tiers** (a flat step per tier, NOT era-scaled). The economy's
exponential growth comes from **population COUNT** — later-era food thresholds yield more pops per
crossing, so total output = (modest, linearly-rising per-pop output) × (fast-growing pop count).
Non-gold chains step by **+4/tier**; gold steps by **+6/tier** (the same ×1.5 gold premium). Numbers **`[proposed]`**.

---

## Citizen (generalist)

**1 progress + 1 production + 1 food** per tick, flat. Starting population and pop-growth fallback.

---

## Progress — Astrologer → … → Superintelligence

| Tier | Era | Tech | progress/t |
|---|--|--|--|
| Astrologer | Bronze (1) | Astrology | 4 |
| Scholar | Late Medieval (5) | University | 8 |
| Scientist | Revolution (8) | Scientific Method | 12 |
| Mentat | Xenotic (21) | Neuropartitioning | 16 |
| Superintelligence | Evolution (22) | Superintelligence | 20 |

## Production — Builder → … → Nanomancer

| Tier | Era | Tech | production/t |
|---|--|--|--|
| Builder | Stone (0) | Tools | 4 |
| Blacksmith | Early Medieval (4) | Blacksmithing | 8 |
| Inventor | Steam (9) | Hydraulic Press | 12 |
| Software Engineer | Atomic (12) | Computers | 16 |
| Nanomancer | Xenotic (21) | Adamantium | 20 |

## Food — Farmer → … → Abioticist

| Tier | Era | Tech | food/t |
|---|--|--|--|
| Farmer | Stone (0) | Agriculture | 4 |
| Baker | Classical (3) | Baking | 8 |
| Doctor | Steam (9) | Germ Theory | 12 |
| Geneticist | Intelligence (15) | In-Vitro Editing | 16 |
| Abioticist | Evolution (22) | Abiogenesis | 20 |

## Gold — Trader → … → Plutarch `[+6/tier]`

| Tier | Era | Tech | gold/t |
|---|--|--|--|
| Trader | Iron (2) | Bartering | 6 |
| Merchant | Exploration (7) | Economics | 12 |
| Banker | Steam (9) | Income Tax | 18 |
| Statistician | Exploration (7) | Statistics | 24 |
| Investor | Silicon (13) | High Frequency Trading | 30 |
| Plutarch | Early Galactic (23) | Universal Currency | 36 |

> Note: Statistician (Exploration/7, Statistics) unlocks in the same era as Merchant but sits a tier
> higher in the chain; the per-tier output ordering (Trader → Merchant → Banker → Statistician →
> Investor → Plutarch) is preserved even though its unlock era precedes Banker's.

---

## Special populations

| Pop | Era | Tech | Output | Growth | Notes |
|---|--|--|---|---|---|
| **Priest** | Classical (3) | Monotheism | — | normal | End of each era: **+1 legitimacy per Priest** — a rare legit income (fits no-per-tick-legit). |
| **Soldier** | Classical (3) | Professional Soldiers | — | normal | Every friendly **unit gains +1 attack per Soldier** (global). Scales with Soldier count. |
| **Replicant** | Intelligence (15) | Robotic Labor | 1 production + 1 gold + 1 progress /t (flat) | **count DOUBLES each era end** (not a Festivals-doubled "end-of-era effect"); does NOT grow via normal pop growth | Gain 1 on unlock. The doubling *count* is the mechanic; Replicant Rights policy boosts their progress. Its unlock era bounds the doubling — tune it. |

---

## Population prefixes (mutually exclusive civ-defining techs)

Three exclusive techs each stamp a permanent prefix on **all non-robot** population, adding an output.
All three unlock at **Evolution (22)**:

| Tech | Era | Prefix | Adds (per pop, per tick) |
|---|--|---|---|
| Forced Evolution | Evolution (22) | **Evolved** | **+4 food** |
| Machine Synthesis | Evolution (22) | **Cyborg** | **+4 production** |
| Psychic Awakening | Evolution (22) | **Psychic** | **+4 progress** |

`[proposed]` magnitude: **+4** of the resource per non-robot pop (flat — scaling comes from pop count,
like the specialists). Tell me if you want it bigger/smaller or a %, and **which pops are "robot"**
(exempt — likely just the Replicant).

---

## Modifiers that touch specialists (defined in their own docs)

- **Eiffel Tower** (wonder): all specialists **+50% effective**.
- **Specialization / Guilds / Unions / Purpose Engineering** (policies): all specialists **+1 / +2 / +3 / +5** output.
- **Replicant Rights** (policy, needs Replicants): boosts Replicant progress.

## Gold-upgrade cost `[proposed]`

Upgrading a pop type one tier costs gold — proposed `round(15·1.18^E)` per pop (or a bulk per-type sum).
Final formula lands in a future `costs.md` alongside unit/building upgrade, mercenary, and reroll costs.
