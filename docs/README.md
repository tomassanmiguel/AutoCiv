# AutoCiv v2 — Design Docs

The content + rules spec for the v2 tower-defense redesign (see the top-level `REDESIGN.md`
for the systems overview). These docs are the **authoring source of truth**; they get turned into
`src/game/data/*` when we implement. Numbers tagged **`[proposed]`** are my calibration guesses —
challenge them freely.

## Doc map (built in passes, checkpointed)

| Doc | Covers | Status |
|---|---|---|
| `SCALING.md` | The math: era growth, upgrade levels, legitimacy, terrain/threshold/reroll/wonder formulas, all schemas, the category + slot taxonomy | **draft (pass 1)** |
| `units.md` | Every unit: base atk/def/range/pursuit/cooldown + ability, by category | **pass 1: Melee/Ranged/Cavalry done; rest stubbed** |
| `buildings.md` | Military + civilian buildings | not started |
| `specialists.md` | Population + specialist chains + prefixes | not started |
| `policies.md` | Policies + bonus/modifier advancements | not started |
| `wonders.md` | Wonders + build-cost (N) | not started |
| `enemies.md` | Enemy roster + wave/budget rules + bosses | not started |
| `terrain.md` | Terrain yields + combat modifiers | not started |
| `PROGRESSION.md` | The master advancement tree distributed across the 28 eras (~10/era, front-loaded) | not started (final pass) |

## Ratified decisions (locked with the user)

1. **Legitimacy: UNCAPPED, no per-tick production.** Gained only from building-completion, end-of-era
   effects, and policies; leveraged by legit-scaling buildings/wonders. (Reverses the old 100 cap.)
2. **E is 0-based** (Stone = 0 … Infinity = 27). Growth is `base · g^E`.
3. **Different domains scale at different rates** (e.g. food gentler than progress). Building output
   base ≈ **3/tick** in Stone, general growth **g = 1.15**. Enemy **HP** grows faster at **g = 1.25**;
   enemy legitimacy-damage grows **+1/era** (linear). So raw stats fall behind on purpose — players
   must compound upgrades + buffs + terrain + wonders.
4. **Upgrade levels are ADDITIVE** (+25% per level to the stat the entity's upgrade targets). Some
   entities upgrade **output**, others **range** (declared per entity). "Effect level" = upgrade level.
   Power buildings / policies / wonders grant **free** upgrade levels (don't raise upgrade cost).
5. **Unit properties:** `atk`, `def` (= HP), `range`, `pursuit` (if an enemy is within `range+pursuit`,
   move toward it, then attack), `abilities`, `cooldown` (turns between attacks, usually 0).
6. **Terrain flat bonuses scale with era** so they stay relevant (a late `+500` is big but not a step
   change).
7. **Evolved / Cyborg / Psychic** population prefixes add **+food / +production / +progress** respectively.
8. **Multi-tile entities supported** (Great Wall 4×1, Death Star 2×2, Titan 2×2, Flagship 4×2, …).
9. **Target ~10 advancements/era** (more is fine), **front-loaded** (late eras lean on earlier
   unchosen picks). Not the old 20/era.
10. **Gold rerolls progress options** by default (exponential cost, resets each pick).
11. **Two building tabs in the UI:** **Military** infrastructure vs **Civilian** infrastructure.
    **Support units removed** (folded into command buildings).

## Open TBDs (flagged inline as we hit them)

- Exact per-resource threshold-growth exponents (economy pass).
- Terrain-bonus re-basing for the very large late-terrain values.
- Per-wonder build-cost `N`.
- Enemy attack-vs-blocker scaling (flat base vs. era-scaled) and per-type legitimacy-damage.
