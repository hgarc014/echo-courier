# Campaign → Roguelike migration plan

Draft 2026-10-28 for Henry / PM. Based on thin slice [#62](https://github.com/hgarc014/echo-courier/pull/62). **Play tip for raw.githack stays `624b5a7`.** Later commits (docs / camera) must not move that tip. **Do not merge #62 until Henry finishes playtest.**

## 1. Keep Level Select campaign vs sunset

**Recommendation: keep campaign as legacy for one more sprint, then soft-sunset.**

| Phase | What players see |
|---|---|
| Now (#62) | Title has **START SHIFT** (campaign) and **ROGUE RUN** side by side. Level Select unchanged. |
| Next | Rogue is the default primary button; campaign demoted to “Campaign (legacy)” under Level Select. |
| Later | Hide campaign behind Dev Mode / Settings once rogue floors cover every mechanic that campaign taught. |

Do **not** delete `LEVELS` / `WORLDS` data yet — they become the template library (see §2). Recorded campaign solutions stay as regression tests for those recipes.

## 2. Worlds → room templates / mechanic pools for `floorGen`

Today `generateFloor` (v0) builds plain doors + one echo airlock. Grow it by **mechanic pools**, one per world. v0 stays the fallback when a pool is empty.

| World | Mechanic pool (room recipes) |
|---|---|
| W1 Dispatch | plate doors, timer windows, Guard sight, Gatekeeper |
| W2 | wind corridors, crack floors / fast crack |
| W3 Panopticon | cameras, cloak windows, sight lines |
| W4 Beamworks | lasers, Echo Shield facing, Prism |
| W5 Overclock | TemporalPlate timelines, static slow, dual airlocks |

**Recipe / template schema** (one `ROOM_W`×`H` cell, local coords; IDs renamed `r{i}_{id}` when stitched):

```json
{
  "id": "w5-l1-airlock",
  "source": "world5Levels[0]",
  "world": 5,
  "tier": 3,
  "tags": ["airlock", "echo-required"],
  "entry": { "y": 240, "h": 120 },
  "exit":  { "y": 240, "h": 120 },
  "requiresEcho": true,
  "minEchoes": 1,
  "forbid": ["timerDoor"],
  "entities": { "walls": [], "plates": [], "doors": [], "guards": [], "lasers": [], "cracks": [], "cameras": [], "wires": [] }
}
```

**Extraction phases (SWE B):**
1. **Tag** campaign rooms with `{templateId, tier, tags}` — no behavior change.
2. **Extract** via `scripts/extractTemplates.js` → `src/data/roomTemplates.json`; fail if a link points outside the room or gaps misalign.
3. **Seed pools:** `floorGen.pickRooms(rng, depth)` by tier (d1–2 plates/doors; d3–4 guards/lasers/wires; d5+ temporal). Each floor still gets **exactly one** echo-required room. Early depths: no TimerDoor / hidden timing (Henry visibility rule).

Unlock order: W1 pool only at first; clear a run (or meta milestones) opens the next pool. Campaign worlds map 1:1 onto pools.

## 3. Bosses as run end bosses

| Boss | Source PR / level | Rogue role |
|---|---|---|
| Gatekeeper | W1-MB | Early-run optional elite (short room) |
| Burrower / Sinkhole | W2-ish + [#57](https://github.com/hgarc014/echo-courier/pull/57) loudest-wins | Mid-run boss when W2 pool unlocked |
| Prism | W4-MB | Mid/late elite |
| XR-9 | W5-BOSS + [#61](https://github.com/hgarc014/echo-courier/pull/61) sweep | Run finale when W5 pool unlocked |

**Rules:**
- Boss layouts are **hand-authored**, not procedural (telegraph / par / recorded solutions stay valid).
- Today (#62): one floor → Run Over.
- Next: **N recipe rooms + optional elite + one end boss**, still **one continuous layout** (or boss as a second load) so echoes stay coherent.
- Death budget stays **1** unless Henry asks otherwise.
- No new boss AI — reuse Gatekeeper / Burrower / Prism / XR-9 entities as-is. CI replays each boss's recorded solution under run loopTime / echo slots.

## 4. Unlock economy & progress wipe

**Current #62 economy** (`src/rogue/rogueMeta.js`):
- One claim per Run Over.
- First unlock = **+1 echo slot** (base 2 → 3).
- Later unlocks = **+30s** record on **60s** base, cap **+120s**.
- Key: `echoCourier_rogueMeta` — **survives** Wipe / Dev Mode / Unlock All (not in `PROGRESS_KEYS`).

| Store | Keys | Wipe / Dev Mode |
|---|---|---|
| Campaign progress | `echoCourier_maxLevel`, challenges, abilities, tutorials, cleared | Cleared by Wipe; blocked while Dev Mode / Unlock All |
| Rogue meta (#62) | `echoCourier_rogueMeta` | Survives Wipe and Dev Mode |

**Policy:**
- Wipe Progress = campaign only. Optional later: separate “Reset Rogue Unlocks” in Settings.
- Do **not** fold rogue meta into campaign save.
- Future pool / boss / cosmetic unlocks = separate `echoCourier_rogue*` keys, **not** campaign progress.
- Optional later: one-time seed of pool unlocks from campaign `maxUnlockedLevel` so veterans aren't re-gated.

## 5. Editor: author room recipes, not full levels

**Goal:** place a single ≈600×600 room, mark sockets (entry/exit/package/delivery), tag mechanics, playtest alone, export JSON recipe.

Minimum editor work:
1. “Room recipe” mode: fixed canvas, socket markers, tags (`world`, `requiresEcho`, `difficulty`, `forbid`).
2. Save/load + JSON round-trip (`serializeLevel` / `deserializeLevel`).
3. Playtest one recipe in isolation.
4. Warn when TimerDoor (or hidden-timer) appears in tier &lt; 3.
5. `floorGen` imports the recipe bank; `recordFloor(templateId)` + tests: recorded clear; echo-required fails solo; links stay inside template.

No new entity types for the first bank.

## 6. Camera / visibility (optional nit)

Airlock plates sit in opposite corners of a 600-wide room. **Landed after play tip** (commit after `624b5a7`): on rogue floors (`currentLevelMeta.isRogue`), `syncGameplayCamera` centers horizontally on the player's room so the whole cell stays in the 800×600 view. Campaign follow is unchanged. Future: if templates exceed 800 px, frame plates linked to the nearest door.

## 7. Open PR disposition (#57 / #60 / #61)

| PR | Disposition |
|---|---|
| [#57](https://github.com/hgarc014/echo-courier/pull/57) Loudest wins @ `f7068ef` | Keep open. Retarget after #62 / playtest → W2 boss recipe. Don't rewrite into #62. |
| [#60](https://github.com/hgarc014/echo-courier/pull/60) Panopticon WIP @ `ee1a78a` | Keep as WIP → **W3 template bank**, not linear campaign. Rebase after #62. |
| [#61](https://github.com/hgarc014/echo-courier/pull/61) XR-9 sweep @ `820f71f` | Keep draft. Land after #62 as **run finale** boss params. |

Do **not** pile these onto #62.

## 8. Ownership checklist

| Phase | Owner | Acceptance |
|---|---|---|
| Tag / extract / depth pools | SWE B | Catalog + tests; 1 echo-required/floor; no TimerDoor at early depth |
| Echo playability + recorded solutions | SWE B | Template solutions clear; solo fails on echo-required |
| Run hub / meta / unlock economy | SWE | Claims persist; `rogue*` keys only |
| Boss floors wired into run | SWE + SWE B | Hand-authored bosses; solutions replay under run settings |
| Verification | QA | Seed sweep; camera keeps airlock plates visible; campaign regression |

## Suggested next sprint order

1. Henry playtest #62 @ `624b5a7` on raw.githack → merge when he says go.
2. UX nits already partially done (room-frame camera); still: hide “EDITOR PLAYTEST” HUD in rogue, rename Q → “Restart Floor”.
3. Recipe schema + 3 W1 rooms in the editor; `floorGen` reads the bank.
4. Retarget/land #61 (XR-9 finale), then #57 (Burrower mid-boss).
5. #60 as W3 pool once recipe pipeline exists.
6. Soft-sunset campaign button when pools cover W1–W5.

## Out of scope for this draft

Multi-floor runs beyond the “N rooms + elite + boss” shape above, meta shop beyond +1 echo / longer record, Run Over polish, open-floor XR-9 threat.
