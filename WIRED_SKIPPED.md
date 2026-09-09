# Sprite sheet wiring (env / props / leftover characters)

Visual swap only. Gameplay, fail/rewind FX, dialog, gold-star, phone, shop, and levels are unchanged.
PNG fallbacks (`state.assets[name]`) remain when an atlas frame is missing.

Rects are occupancy-measured with a 4px pad. Props and env sheets are RGB with a light checkerboard; slices key near-white then `prepareLoadedAsset` (crop + keyBlack), matching the player atlas pipeline.

## Wired

### `echo-courier-props-hazards.png` → `state.worldAtlas`

| Frame | Rect | Draw path |
| --- | --- | --- |
| `package` | `{ x: 17, y: 22, w: 237, h: 235 }` | Package (standard / tinted types) |
| `heavy` | `{ x: 277, y: 21, w: 221, h: 230 }` | Package type `heavy` |
| `fragile` | `{ x: 526, y: 20, w: 229, h: 232 }` | Package type `fragile` |
| `plate` | `{ x: 1170, y: 300, w: 150, h: 93 }` | PressurePlate idle (dark yellow pad) |
| `platePressed` | `{ x: 1327, y: 301, w: 151, h: 92 }` | PressurePlate pressed (yellow pad) |
| `platePresent` | `{ x: 20, y: 529, w: 165, h: 115 }` | TemporalPlate `present` (green hex) |
| `plateFirst` | `{ x: 203, y: 528, w: 163, h: 116 }` | TemporalPlate `first` (purple hex) |
| `plateLast` | `{ x: 387, y: 528, w: 160, h: 116 }` | TemporalPlate `last` (blue hex) |
| `camera` | `{ x: 582, y: 515, w: 119, h: 104 }` | SweepCamera (right-facing cyan lens) |

### `echo-courier-environment-effects.png` → `state.worldAtlas`

| Frame | Rect | Draw path |
| --- | --- | --- |
| `crack` | `{ x: 334, y: 15, w: 105, h: 99 }` | CrackedFloor unbroken |
| `pit` | `{ x: 440, y: 15, w: 107, h: 99 }` | Pit, and CrackedFloor after break |
| `wall` | `{ x: 973, y: 235, w: 214, h: 147 }` | Wall tiled (X-brace panel, matches `wall.png`) |
| `door` | `{ x: 1198, y: 236, w: 260, h: 149 }` | Door / AlarmDoor / TimerDoor tiled (red grid, matches `door.png`) |
| `zone` | `{ x: 13, y: 397, w: 131, h: 127 }` | DeliveryZone tiled (H pad) |
| `static` | `{ x: 13, y: 545, w: 128, h: 99 }` | StaticZone tiled |
| `wind` | `{ x: 682, y: 534, w: 107, h: 60 }` | WindTunnel tiled (one flow frame; motion streaks kept) |
| `laser` | `{ x: 385, y: 680, w: 85, h: 88 }` | Laser tiled (dense red grid, matches `laser.png` usage) |

### `echo-courier-characters.png` → `state.playerAtlas` (sheet already loaded for the courier)

| Frame | Rect | Draw path |
| --- | --- | --- |
| `guard` | `{ x: 34, y: 340, w: 121, h: 160 }` | Guard idle front (flipX for facing, same as `guard.png`) |

Courier frames (`PLAYER_FRAME_RECTS`) were already wired in #8 and are unchanged.

## Skipped

### Props / hazards sheet

- **Purple crate, stasis/containment crate, red-core crate** — no dedicated entity. Contraband / decoy / timed still tint the standard package.
- **Three red circular crates** — look timed/explosive, but three near-identical frames and no one-to-one type.
- **Cyan closed door, open hallway, damaged/rubble door** — door art that matches `door.png` is the red grid on the env sheet; these are alternate styles / background.
- **Cyan plate pair** — extra pad color; yellow pair matches the existing yellow plate.
- **Camera angle / alarm / destroyed variants** — one canonical side camera is enough; sweep cone is still drawn in code.
- **Laser beams with emitter caps (vertical / horizontal / cross)** — Laser *tiles* a texture. Beams-with-caps would repeat emitter hardware. Env dense grid matches current `laser.png` tiling.
- **Laser emitters, bolt / projectile streak, spark burst** — projectile is a 4×4 rect; fail/rewind FX were not to be touched.
- **Siren, sparkles, debris piles** — no matching draw path; debris is not pit/crack.

### Environment / effects sheet

- **Plain floor tiles, grate floors, pipe/autotile connectors** — `floor.png` is unused; walls use the X-brace panel.
- **Small wall chunks, open door frames, side pillars** — not 1:1 with Wall or Door.
- **Zone frame strips, concentric-ring FX, empty/grate insets** — delivery zone is the H pad.
- **Extra static swirls, wind arrows, extra wind-flow frames** — one static tile and one wind frame; arrows would force a direction the entity already has as `vx/vy`.
- **Other laser glyphs (cross, bar, plus, coarse grid, reticle)** — dense grid is the `laser.png` match.
- **Expanding rings, cyan bolts, silhouette figures** — FX / not entities. Silhouettes are not the courier (already on the characters sheet).
- **Explosion sequence, spotlight cones** — fail/rewind FX out of scope.

### Characters sheet (beyond courier + guard idle)

- **Guard walk, 3/4, shoot, red-alert, downed** — packed; occupancy merged neighbors. Idle front + flipX matches the current PNG.
- **Drone strip** — occupancy merged adjacent drones; current drone is a canvas disc, not a PNG. Not an unambiguous single frame.
- **Tank / shooter-robot poses (idle, fire, damage, wreck)** — occupancy merged the row. ShooterRobot is custom canvas with rotation; no clean one-to-one idle crop.

## Draw fallback

`resolveSprite(state, name)` uses `worldAtlas[name]`, then `playerAtlas[name]` (guard), then `state.assets[name]`.
)