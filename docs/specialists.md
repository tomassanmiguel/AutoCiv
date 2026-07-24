# Population & Specialists

Per-pop, per-tick output. The **Citizen** is the auto-unlocked generalist; specialists are unlocked as
advancements and you **spend gold to upgrade your pops up a chain** (Astrologer → Scholar → …), a
one-way conversion of that pop type. Each tier's output = `round(anchor · 1.18^E · lateBoost(E))`
(`anchor` = **3** for progress/production/food, **4.5** for gold — the same ×1.5 gold premium as
buildings). Numbers **`[proposed]`**.

> **Balance note:** specialists use anchor 3 (vs buildings' 3.5) because population is *not* tile-bound
> — you can field far more pops than buildings, so per-pop output sits a touch lower. This pop-count ↔
> per-pop-output balance is the main tuning knob here.

---

## Citizen (generalist, never scales)

**1 progress + 1 production + 1 food** per tick, flat. Starting population; the fallback that pop growth
produces when no specialist slot is chosen.

---

## Progress — Astrologer → … → Superintelligence

| Tier | Era | progress/t |
|---|--|--|
| Astrologer | Bronze (1) | 4 |
| Scholar | Late Medieval (5) | 7 |
| Scientist | Steam (9) | 13 |
| Mentat | Intelligence (15) | 54 |
| Superintelligence | Evolution (22) | 252 |

## Production — Builder → … → Nanomancer

| Tier | Era | production/t |
|---|--|--|
| Builder | Bronze (1) | 4 |
| Blacksmith | Early Medieval (4) | 6 |
| Inventor | Revolution (8) | 11 |
| Engineer | Silicon (13) | 34 |
| Nanomancer | Frontier (20) | 164 |

## Food — Farmer → … → Abioticist

| Tier | Era | food/t |
|---|--|--|
| Farmer | Stone (0) | 3 |
| Baker | Classical (3) | 5 |
| Doctor | Steam (9) | 13 |
| Geneticist | Intelligence (15) | 54 |
| Abioticist | Evolution (22) | 252 |

## Gold — Trader → … → Plutarch `[anchor 4.5]`

| Tier | Era | gold/t |
|---|--|--|
| Trader | Iron (2) | 6 |
| Merchant | Late Medieval (5) | 10 |
| Banker | Steam (9) | 20 |
| Statistician | Silicon (13) | 50 |
| Investor | Exodus (18) | 159 |
| Plutarch | Early Galactic (23) | 466 |

---

## Special populations

| Pop | Output | Growth | Notes |
|---|---|---|---|
| **Replicant** | 1 production + 1 gold + 1 progress /t (flat) | **does NOT grow with normal pop growth** — instead the replicant count **DOUBLES at each era end** (not counted as an "end-of-era effect", so Festivals/Cosmic Celebration don't double it again) | Gain 1 when first unlocked. Exponential *count* (not per-pop output) is the whole mechanic; Replicant Rights policy boosts their progress. |
| **Priest** | — (no per-tick) | normal | At the end of each era, **+1 legitimacy per Priest** — one of the few legitimacy income sources (fits the no-per-tick-legit rule). |
| **Soldier** | — (no per-tick) | normal | Every friendly **unit gains +1 attack per Soldier** you have (global, army-wide). A combat pop; scales linearly with Soldier count. |

---

## Population prefixes (mutually exclusive civ-defining techs)

Three exclusive techs each stamp a permanent prefix on **all non-robot** population, adding an output:

| Tech | Prefix | Adds (per pop, per tick) |
|---|---|---|
| Forced Evolution | **Evolved** | **+food** |
| Machine Synthesis | **Cyborg** | **+production** |
| Psychic Awakening | **Psychic** | **+progress** |

`[proposed]` magnitude: **+2** of the resource per non-robot pop, scaling with era like other output
(`round(1.5·1.18^E)`). This is civ-defining, so tell me the intended strength (flat small number vs. a
scaling amount vs. a % of the pop's existing output) and I'll pin it. Robot pops (e.g. Terminator-line,
Replicants?) are exempt — confirm which count as "robot".

---

## Modifiers that touch specialists (defined in their own docs)

- **Eiffel Tower** (wonder): all specialists **+50% effective**.
- **Specialization / Guilds / Unions / Purpose Engineering** (policies): all specialists **+1 / +2 / +3 / +5** output.
- **Replicant Rights** (policy, needs Replicants unlocked): boosts Replicant progress.

## Gold-upgrade cost `[proposed]`

Upgrading a pop type one tier up its chain costs gold — proposed `round(15·1.18^E)` per pop (or a bulk
per-type sum). Exact formula goes in a future `costs.md` with unit/building upgrade + mercenary + reroll costs.
