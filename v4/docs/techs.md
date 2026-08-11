# AutoCiv v4 — v1 Placeholder Progression & Upgrade Stubs

> ⚠️ **This is throwaway placeholder content**, not the real tech design. The real five-flavor
> tech trees and the real per-class upgrade trees are being designed **in parallel** and will be
> authored in the content editor and dropped in later. What's here exists only so v1 has *something*
> to draft and buy, and so the engine can exercise the **full win/lose cycle** (§9–§10 of
> `design.md`).
>
> **v1 = 5 eras** (0 Stone · 1 Bronze · 2 Iron · 3 Classical · 4 Medieval). The engine must scale
> to 15 eras by data alone. All numbers below are placeholders — make them reasonable, tune later.
>
> 🌱 **Living document — expect continued evolution.** This gets replaced wholesale once the real
> tech and upgrade trees are designed; until then it moves freely as we tune the loop.

---

## Progression — ONE deterministic option per flavor per era

Each flavor offers a **single** advancement in its current era; taking it advances that flavor one
era and applies the effect. Effects **scale slightly per era**. A flavor is **complete** once its
era-4 advancement is taken; **all five complete = win.**

| Flavor | Effect each pick | Per-era scaling (eras 0→4) |
|---|---|---|
| **Science** | +N progress **per citizen** (all cities) | N = `1 + ⌊era/2⌋` → **1, 1, 2, 2, 3** |
| **Military** | +atk/+def to **all units**, plus a class unlock in early eras, plus **+1 upgrade-level ceiling** | +def/+atk = **5, 5, 5, 5, 5** (cumulative); unlock **Ranged (e0) → Cavalry (e1) → Naval (e2)**; eras 3–4 stats only |
| **Culture** | +atk/+def to **all cities** | +20 each era → cumulative **20, 40, 60, 80, 100** |
| **Economy** | +gold to **every gold tile** | +5 each era → tiles yield base **+5, +10, +15, +20, +25** |
| **Expansion** | reveal the **next map notch** (grants its crossing permission) | e0 Nearby · e1 Distant · e2 Old World · e3 **Islands** · e4 *(cap — no further reveal in v1; treat as a small vision/no-op)* |

Notes:
- **Military doubles as the upgrade ceiling.** Five Military picks → ceiling **5**. Size the
  placeholder upgrade trees so a level-5 ceiling is meaningful (see below).
- **Expansion caps at Islands** in v1 by design; the New World / space / exo / galaxy notches
  light up only when the era count grows past 5.
- The **draft** offers whichever flavors' current-era cards it draws (need not be 3 distinct
  flavors, `design.md` §9). With one option per flavor this is just "pick an available track to
  advance."

---

## Upgrade trees — dead-simple v1 stub

Real per-class trees are TBD (designed separately). For v1:

- **Every unit class has exactly two trees: `attack` and `defense`.**
- A tree is a **sparse** vertical stack of nodes — **fewer nodes than levels, so nodes skip
  levels.** Placeholder node layout per tree (level → effect):

  | Node | Level | Effect (placeholder) |
  |---|---:|---|
  | I | 1 | +5 to the stat |
  | II | 3 | +10 to the stat |
  | III | 6 | +20 to the stat |

  (Levels 2, 4, 5 have no node — the engine and UI must handle gaps. The level **ceiling** from
  Military gates which nodes are reachable: ceiling 5 reaches nodes I and II but not III.)

- **Cost** rises with level — placeholder `cost(level) = 40 × level` gold.
- Buying a node applies to **all units of that class**, is **permanent**, and **survives unit
  death**.
- **Locked trees are hidden.** In v1 a class's trees appear the moment the class is unlocked; the
  hide-when-locked path still exists for the real content, where whole trees gate behind specific
  techs.

Cities reuse the same mechanism (an `attack`/`defense` pair) if/when city upgrades are exposed;
v1 may ship city upgrades as a single `defense` tree only.

---

## What the real content will replace

- Five flavors × 15 eras of **multi-option** tech pools (roguelike draft with real skips).
- Per-class **upgrade trees** with real named tiers, abilities, and tree-unlock gates.
- **Enemy-class** stat/behaviour definitions.

All authored in the re-scoped content editor; this file is deleted once real content lands.
