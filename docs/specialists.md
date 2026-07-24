# Population & Specialists

Per-pop, per-tick output. The **Citizen** is the auto-unlocked generalist; specialists are unlocked as
advancements and you **spend gold to upgrade your pops up a chain** (Astrologer → Scholar → …), a
one-way conversion of that pop type.

**Per-pop output scales LINEARLY across tiers** (a flat step per tier, NOT era-scaled). The economy's
exponential growth comes from **population COUNT** — later-era food thresholds yield more pops per
crossing, so total output = (modest, linearly-rising per-pop output) × (fast-growing pop count).
Non-gold chains step by **+4/tier**; gold steps by **+6/tier** (the same ×1.5 gold premium). Numbers **`[proposed]`**.

---

## Citizen (generalist)

**1 progress + 1 production + 1 food** per tick, flat. Starting population and pop-growth fallback.

---

## Progress — Astrologer → … → Superintelligence

| Tier | Era | progress/t |
|---|--|--|
| Astrologer | Bronze (1) | 4 |
| Scholar | Late Medieval (5) | 8 |
| Scientist | Steam (9) | 12 |
| Mentat | Intelligence (15) | 16 |
| Superintelligence | Evolution (22) | 20 |

## Production — Builder → … → Nanomancer

| Tier | Era | production/t |
|---|--|--|
| Builder | Bronze (1) | 4 |
| Blacksmith | Early Medieval (4) | 8 |
| Inventor | Revolution (8) | 12 |
| Engineer | Silicon (13) | 16 |
| Nanomancer | Frontier (20) | 20 |

## Food — Farmer → … → Abioticist

| Tier | Era | food/t |
|---|--|--|
| Farmer | Stone (0) | 4 |
| Baker | Classical (3) | 8 |
| Doctor | Steam (9) | 12 |
| Geneticist | Intelligence (15) | 16 |
| Abioticist | Evolution (22) | 20 |

## Gold — Trader → … → Plutarch `[+6/tier]`

| Tier | Era | gold/t |
|---|--|--|
| Trader | Iron (2) | 6 |
| Merchant | Late Medieval (5) | 12 |
| Banker | Steam (9) | 18 |
| Statistician | Silicon (13) | 24 |
| Investor | Exodus (18) | 30 |
| Plutarch | Early Galactic (23) | 36 |

---

## Special populations

| Pop | Era | Output | Growth | Notes |
|---|--|---|---|---|
| **Priest** | Classical (3) | — | normal | End of each era: **+1 legitimacy per Priest** — a rare legit income (fits no-per-tick-legit). |
| **Soldier** | Late Medieval (5) | — | normal | Every friendly **unit gains +1 attack per Soldier** (global). Scales with Soldier count. |
| **Replicant** | Intelligence (15) | 1 production + 1 gold + 1 progress /t (flat) | **count DOUBLES each era end** (not a Festivals-doubled "end-of-era effect"); does NOT grow via normal pop growth | Gain 1 on unlock. The doubling *count* is the mechanic; Replicant Rights policy boosts their progress. Its unlock era bounds the doubling — tune it. |

---

## Population prefixes (mutually exclusive civ-defining techs)

Three exclusive techs each stamp a permanent prefix on **all non-robot** population, adding an output:

| Tech | Prefix | Adds (per pop, per tick) |
|---|---|---|
| Forced Evolution | **Evolved** | **+food** |
| Machine Synthesis | **Cyborg** | **+production** |
| Psychic Awakening | **Psychic** | **+progress** |

`[proposed]` magnitude: **+2** of the resource per non-robot pop (flat — scaling comes from pop count,
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
