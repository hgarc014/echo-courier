# Campaign → Roguelike migration plan

Draft 2026-10-28 for Henry / PM. Based on thin slice [#62](https://github.com/hgarc014/echo-courier/pull/62) @ `624b5a7`. **Do not merge #62 until Henry finishes raw.githack playtest.**

## 1. Keep Level Select campaign vs sunset

**Recommendation: keep campaign as legacy for one more sprint, then soft-sunset.**

| Phase | What players see |
|---|---|
| Now (#62) | Title has **START SHIFT** (campaign) and **ROGUE RUN** side by side. Level Select unchanged. |
| Next | Rogue is the default primary button; campaign demoted to “Campaign (legacy)” under Level Select. |
| Later | Hide campaign behind Dev Mode / Settings once rogue floors cover every mechanic that campaign taught. |

Do **not** delete `LEVELS` / `WORLDS` data yet — they become the template library (see §2). Recorded campaign solutions stay as regression tests for those recipes.

## 2. Worlds → room templates / mechanic pools for `floorGen`

Today `generateFloor` builds plain doors + one echo airlock. Grow it by **mechanic pools**, one per world:

| World | Mechanic pool (room recipes) |
|---|---|
| W1 Dispatch | plate doors, timer windows, Guard sight, Gatekeeper |
| W2 | wind corridors, crack floors / fast crack |
| W3 Panopticon | cameras, cloak windows, sight lines |
| W4 Beamworks | lasers, Echo Shield facing, Prism |
| W5 Overclock | TemporalPlate timelines, static slow, dual airlocks |

**Shape:** each recipe is a small layout fragment (`{ walls, doors, plates, … }` + spawn/exit sockets) authored in the editor (see §5), tagged with `world`, `tags`, `requiresEcho`, `difficulty`. `floorGen` picks 3–5 recipes from unlocked pools, stitches them into one wide layout (same pattern as #62 — one level, echo playback stays coherent).

Unlock order: start with W1 pool only; clear a run (or meta milestones) opens the next pool. Campaign worlds map 1:1 onto pools so nothing is thrown away.

## 3. Bosses as run end bosses

| Boss | Source PR / level | Rogue role |
|---|---|---|
| Gatekeeper | W1-MB | Early-run optional elite (short room) |
| Burrower / Sinkhole | W2-ish + [#57](https://github.com/hgarc014/echo-courier/pull/57) loudest-wins | Mid-run boss floor when W2 pool unlocked |
| Prism | W4-MB | Mid/late elite |
| XR-9 | W5-BOSS + [#61](https://github.com/hgarc014/echo-courier/pull/61) sweep | Run finale when W5 pool unlocked |

**Rule:** a “run” = N normal rooms + optional elite + **one** end boss chosen from the highest unlocked boss tier. Boss rooms are fixed hand-authored layouts (not fully procedural) so telegraph / par / recorded solutions still work. `#62` already ends on floor clear; next step is “clear floor → boss floor → Run Over”.

## 4. Progress wipe vs `echoCourier_rogueMeta`

| Store | Keys | Wipe / Dev Mode |
|---|---|---|
| Campaign progress | `echoCourier_maxLevel`, challenges, abilities, tutorials, cleared | Cleared by Wipe; blocked while Dev Mode / Unlock All |
| Rogue meta (#62) | `echoCourier_rogueMeta` (echo slots, record bonus, runs, clears) | **Survives** Wipe and Dev Mode (not in `PROGRESS_KEYS`) |

**Policy going forward:**

- **Wipe Progress** = campaign only (current behavior). Add a separate “Reset Rogue Unlocks” button in Settings if Henry wants a hard reset.
- Do **not** fold rogue meta into campaign save — keeps playtest / Unlock All from nuking roguelike progression.
- Future meta (new pools, boss clears, cosmetics) stays under `echoCourier_rogue*` keys with the same survival rule.
- Optional later: one-time migration that seeds rogue pool unlocks from `maxUnlockedLevel` / world clears so campaign veterans aren’t gated behind the tutorial again.

## 5. Editor: author room recipes, not full levels

**Goal:** designers place a single room (≈600×600), mark sockets (entry gap, exit gap, package spawn, delivery), tag mechanics, playtest that room alone, export JSON recipe.

Minimum editor work:

1. “Room recipe” mode: fixed canvas size, socket markers, tag fields (`world`, `requiresEcho`, `difficulty`).
2. Save/load + JSON round-trip (same `serializeLevel` / `deserializeLevel` path; recipe is a clipped layout).
3. Playtest one recipe in isolation (already close to editor playtest).
4. `floorGen` imports the recipe bank instead of hardcoding walls.

Full campaign levels remain loadable for regression; new content prefers recipes. No new entity types required for the first bank (reuse plates/doors/guards/lasers/etc.).

## 6. Open PR disposition (#57 / #60 / #61)

Parked during the thin-slice window. Suggested fate:

| PR | Title | Disposition |
|---|---|---|
| [#57](https://github.com/hgarc014/echo-courier/pull/57) | Sinkhole “Loudest wins” @ `f7068ef` | **Keep open.** Retarget onto main after #62 lands (or after Henry’s playtest). Becomes W2 boss / Burrower room recipe behavior — don’t rewrite into #62. |
| [#60](https://github.com/hgarc014/echo-courier/pull/60) | World 3 Panopticon WIP @ `ee1a78a` | **Keep open as WIP.** Finish as the **W3 room-template bank** (cameras/cloak), not as a linear campaign world PR. Rebase after #62. |
| [#61](https://github.com/hgarc014/echo-courier/pull/61) | XR-9 perimeter sweep @ `820f71f` | **Keep open (draft).** Land after #62; folds into **run finale** boss params. Open-floor threat (still deferred) stays a follow-up. Retarget to main once #62 merges. |

Do **not** pile these onto #62. #62 stays the thin slice Henry is playtesting.

## Suggested next sprint order

1. Henry playtest #62 on raw.githack → merge when he says go.
2. Tiny UX nits (if not done this window): hide “EDITOR PLAYTEST” HUD in rogue, rename Q hint from “Restart Level” → “Restart Floor”, camera bias toward airlock plates.
3. Recipe schema + 3 W1 rooms in the editor; `floorGen` reads the bank.
4. Retarget/land #61 (XR-9 finale), then #57 (Burrower mid-boss).
5. #60 as W3 pool once recipe pipeline exists.
6. Soft-sunset campaign button when pools cover W1–W5.

## Out of scope for this draft

Death budget (currently 1 death = Run Over), multi-floor runs, meta shop beyond +1 echo / longer record, polish on Run Over panel.
