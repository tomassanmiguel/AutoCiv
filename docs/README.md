# AutoCiv v2 — Design Docs

The content + rules spec for the v2 tower-defense redesign (see the top-level `REDESIGN.md`
for the systems overview). These docs are the **authoring source of truth**; they get turned into
`src/game/data/*` when we implement. Numbers tagged **`[proposed]`** are my calibration guesses —
challenge them freely.

## Doc map (built in passes, checkpointed)

| Doc | Covers | Status |
|---|---|---|
| `SCALING.md` | The math: era growth, upgrade levels, legitimacy, terrain/threshold/reroll/wonder formulas, all schemas, the category + slot taxonomy | **draft (pass 1)** |
| `units.md` | Every unit: atk/def/range/pursuit/cooldown/deploy/move + ability, by category | **done (all 8 categories)** |
| `buildings.md` | Military (Traps/Command/Spawners/Walls) + Civilian (Progress/Production/Food/Gold/Legitimacy/Support) | **done** |
| `specialists.md` | Population + specialist chains + prefixes + special pops | **done** |
| `policies.md` | Policies + bonus/modifier advancements | not started |
| `wonders.md` | Wonders + build-cost (N) | not started |
| `enemies.md` | Enemy roster + wave/budget rules + bosses | not started |
| `terrain.md` | Terrain yields + combat modifiers | not started |
| `PROGRESSION.md` | The master advancement tree distributed across the 28 eras (~10/era, front-loaded) | not started (final pass) |

## Ratified decisions (locked with the user)

1. **Legitimacy: UNCAPPED, no per-tick production.** Gained only from building-completion, end-of-era
   effects, and policies; leveraged by legit-scaling buildings/wonders. (Reverses the old 100 cap.)
2. **E is 0-based** (Stone = 0 … Infinity = 27). Growth is `base · g^E`.
3. **Growth is `base·g^E`.** Building output base ≈ **3/tick** in Stone, growth **g = 1.15** (unit
   attack too). Enemy **HP** grows faster at **g = 1.25**; enemy legitimacy-damage **+1/era** (linear).
   So raw stats fall behind on purpose. **Thresholds are already coded** (`resources.js`) — food gentler
   than progress via per-resource `X`/`targetPerEra`, not a new exponent.
4. **Upgrade levels are ADDITIVE** (+25% per level to the stat the entity's upgrade targets). Some
   entities upgrade **output**, others **range** (declared per entity). "Effect level" = upgrade level.
   Power buildings / policies / wonders grant **free** upgrade levels (don't raise upgrade cost).
5. **Unit properties:** `atk`, `def` (= HP), `range`, `pursuit` (if an enemy is within `range+pursuit`,
   move toward it, then attack), `abilities`, `cooldown` (turns between attacks, usually 0).
6. **Terrain bonuses are FLAT** (no era scaling). Relevance comes from *availability* — the big
   bonuses (Exosea/Planet) only exist in the late eras you reach them in.
7. **Evolved / Cyborg / Psychic** population prefixes add **+food / +production / +progress** respectively.
8. **Multi-tile entities supported** (Great Wall 4×1, Death Star 2×2, Titan 2×2, Flagship 4×2, …).
9. **Target ~10 advancements/era** (more is fine), **front-loaded** (late eras lean on earlier
   unchosen picks). Not the old 20/era.
10. **Gold rerolls progress options** by default (exponential cost, resets each pick).
11. **Two building tabs:** **Military** (Traps / Command / **Spawners** / Walls) and **Civilian**
    (Progress / Production / Food / Gold / Legitimacy / Support). Wonders have their own slot.
    **Support units removed** (folded into command buildings).
12. **Wonders:** N = 3 builds-to-finish for all, rebalance later.

## Open TBDs (flagged inline as we hit them)

- Exact per-resource threshold-growth exponents (economy pass).
- Terrain-bonus re-basing for the very large late-terrain values.
- Per-wonder build-cost `N`.
- Enemy attack-vs-blocker scaling (flat base vs. era-scaled) and per-type legitimacy-damage.
