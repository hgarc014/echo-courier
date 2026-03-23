# Echo Courier Game Reference

This document describes the current implemented game structure in the repo as of this revision. It is meant to be a practical design and production reference rather than a marketing summary.

## Core Loop

- You control a courier in a top-down puzzle/action level.
- The main objective is to get the required package cargo into the green delivery zone.
- Press `R` to reset the loop and create an echo from your recorded run.
- Echoes replay prior input and can hold plates, carry packages, trigger systems, distract guards, and interact with hazards.
- Press `Q` to restart the whole level from scratch with no prior echoes.
- Multiple levels are built around planning routes across several loops.

## Controls

- `WASD` or arrow keys: move
- `SPACE`: pick up / drop package, acknowledge dialog
- `R`: reset loop and spawn a ghost from the current run
- `Q`: restart current level
- `ESC`: return to menu
- `SHIFT`: dash, if available
- `F`: toss package, if available
- `C`: cloak, if available

## Progression and Meta Systems

- Campaign: 13 main levels
- Training: 5 standalone tutorial levels
- Developer mode: unlocks all campaign levels and all abilities
- Credits are earned from first-time level clears and challenge clears
- Suit colors unlock by rank progression
- Shop abilities:
  - `dash` costs `$150`
  - `toss` costs `$150`
  - `cloak` costs `$200`
  - `ghostShield` costs `$200`

## Ability Rules

- `dash`
  - Teleports the player in the facing direction.
  - Mainly used to bypass cracked floors and reposition quickly.
- `toss`
  - Throws carried packages.
  - Used for gap crossing, decoy noise, and boss damage.
- `cloak`
  - Temporarily hides the player from some detection sources.
  - Cameras can still trigger alarms via contraband visibility.
- `ghostShield`
  - Makes a ghost block from the direction it is facing.
  - Current live player does not physically collide with ghost shield bodies.
- Level grants
  - `grants` are temporary level-specific ability overrides and are active in that level.
  - Current tutorial levels use `grants` to teach abilities without requiring purchase.
- Important implementation note
  - Level 8 contains an `unlocks: ['cloak']` field in level data, but `unlocks` is not currently used by the gameplay logic.
  - In practice, only purchased abilities, developer mode, and `grants` affect active abilities.

## Core Systems and Entities

- Echo timeline
  - The current run records movement intent and actions.
  - Ghosts replay input, not just positions, so they can continue through doors that open later.
- Delivery requirements
  - Only packages marked as `requiredForDelivery !== false` count toward level completion.
  - Boss ammo crates are optional and do not count toward delivery completion.
- Delivery progress HUD
  - Levels with more than one required package show a `Delivery x / y` counter.
- Package types
  - `standard`: normal cargo
  - `heavy`: slows movement, now rendered as a bronze/gold heavy crate
  - `fragile`: breaks in lasers
  - `contraband`: interacts with alarms/cameras
  - `decoy`: used for noise distraction, does not count for delivery
  - `timed`: explodes after pickup if not delivered in time
- Doors
  - `Door`: opens from linked plates
  - `AlarmDoor`: closes when alarm is active
  - `TimerDoor`: cycles open and closed on a timer
- Plates
  - `PressurePlate`: activated by player, ghosts, or packages
  - `TemporalPlate`: activated only by a specific timeline role such as `present`, `first`, or `last`
- Hazards and threats
  - Lasers
  - Sweep cameras
  - Drones
  - Guards
  - Wind tunnels
  - Static zones
  - Cracked floors / pits
  - Shooter robot boss / turrets
- Boss-specific rules
  - Intro dialog overlays on top of the live level
  - The boss emerges from its room before beginning live fire
  - Required-delivery cargo respawns to its spawn point if used to hit the boss, so the level cannot soft-lock that way

## Level Reference

For each level:
- `Expected abilities` means what the level is clearly designed around.
- `Granted` means the level gives the ability temporarily via `grants`.
- `Purchased` means the player must already own it, unless developer mode is active.
- `None` means no special ability is expected beyond normal movement, package handling, and echoes.

### Campaign

1. Level 1: The Basics
   - Objective: deliver the package using an echo to hold a door.
   - Main mechanics: first echo usage, pressure plate, basic door timing.
   - Expected abilities: none
   - Echo expectation: required
   - Max ghosts: 1

2. Level 2: The Airlock
   - Objective: coordinate two doors with multiple echoes.
   - Main mechanics: multi-loop planning, two pressure plates.
   - Expected abilities: none
   - Echo expectation: required, multi-echo
   - Max ghosts: 2

3. Level 3: Heavy Lifting
   - Objective: move a heavy package through a timer door setup.
   - Main mechanics: heavy cargo movement penalty, timer door, route planning.
   - Expected abilities: none
   - Echo expectation: strongly expected
   - Max ghosts: 2

4. Level 4: Gap Bypass
   - Objective: get across cracked flooring and complete delivery.
   - Main mechanics: cracked floor hazard, plate-held door.
   - Expected abilities: `dash` expected
   - Availability: purchased, not granted
   - Echo expectation: useful / expected
   - Max ghosts: 2

5. Level 5: Fragile Handling
   - Objective: keep a fragile package out of laser beams.
   - Main mechanics: fragile cargo, laser shutdown via plates.
   - Expected abilities: none
   - Echo expectation: expected for laser routing
   - Max ghosts: 3

6. Level 6: The Toss
   - Objective: throw a package across a large gap.
   - Main mechanics: toss, cracked floors, door support from plate.
   - Expected abilities: `toss` expected
   - Availability: purchased, not granted
   - Echo expectation: useful / expected
   - Max ghosts: 2

7. Level 7: Wind Tunnel
   - Objective: cross wind tunnels without being blown into lasers.
   - Main mechanics: wind push, laser punish, no-ghost challenge framing.
   - Expected abilities: `dash` strongly expected
   - Availability: purchased, not granted
   - Echo expectation: minimal
   - Max ghosts: 1

8. Level 8: The Panopticon
   - Objective: deliver contraband through camera/alarm space.
   - Main mechanics: cameras, alarm door, contraband visibility.
   - Expected abilities: `cloak` is clearly intended by design text
   - Availability: currently must be purchased; `unlocks` field is present in data but not wired to gameplay
   - Echo expectation: optional
   - Max ghosts: 3

9. Level 9: Noise Complaint
   - Objective: use decoys to misdirect a drone while delivering the real package.
   - Main mechanics: drone audio investigation, decoy package.
   - Expected abilities: `toss` strongly expected
   - Availability: purchased, not granted
   - Echo expectation: optional but useful
   - Max ghosts: 3

10. Level 10: Fast Shipping
   - Objective: deliver a timed package before it detonates.
   - Main mechanics: timed cargo, gap crossing, speed pressure.
   - Expected abilities: `toss` expected
   - Availability: purchased, not granted
   - Echo expectation: useful
   - Max ghosts: 2

11. Level 11: Time Dilation
   - Objective: work around static zones that slow echoes.
   - Main mechanics: static zone slowdown, timer door, standard door, echo timing precision.
   - Expected abilities: none
   - Echo expectation: required
   - Max ghosts: 3

12. Level 12: Echo Crunch
   - Objective: solve the route with a single echo and a `present` timeline gate.
   - Main mechanics: one-echo limit, temporal plate keyed to current player, static zone.
   - Expected abilities: none
   - Echo expectation: required, strict
   - Max ghosts: 1

13. Level 13: Danger Courier
   - Objective: damage the boss with heavy crates, then deliver the final fragile artifact.
   - Main mechanics: boss intro dialog, emerging robot, shooter boss, optional ammo crates, boss door unlock on defeat.
   - Expected abilities: `toss` strongly expected
   - Availability: purchased, not granted
   - Echo expectation: optional
   - Max ghosts: 2
   - Special delivery rule: only the fragile artifact is required for level completion

### Training

Tutorial levels are separate from campaign progression and can be replayed from the Training menu.

T1. Tutorial 1: First Loop
   - Teaches: movement, pressure plate usage, loop reset, first ghost creation.
   - Expected abilities: none
   - Granted: none
   - Echo expectation: required
   - Max ghosts: 1

T2. Tutorial 2: Package Handling
   - Teaches: pickup/drop, carrying, heavy package slowdown, multi-package delivery.
   - Expected abilities: none
   - Granted: none
   - Echo expectation: helpful
   - Max ghosts: 1

T3. Tutorial 3: Courier Tools
   - Teaches: dash and toss in a controlled setup.
   - Expected abilities: `dash`, `toss`
   - Granted: `dash`, `toss`
   - Echo expectation: low
   - Max ghosts: 1

T4. Tutorial 4: Security Awareness
   - Teaches: cloak, decoy tossing, drone distraction, guard distraction via echoes.
   - Expected abilities: `cloak`, `toss`
   - Granted: `cloak`, `toss`
   - Echo expectation: expected
   - Max ghosts: 2

T5. Tutorial 5: Temporal Hazards
   - Teaches: static zones, lasers, robot fire, fragile handling, directional ghost shield.
   - Expected abilities: `ghostShield`
   - Granted: `ghostShield`
   - Echo expectation: expected
   - Max ghosts: 2

## Feature Checklist

Implemented and visible in the current codebase:

- Campaign menu
- Separate training menu
- Level select
- Developer mode
- Shop and credit economy
- Suit color selection
- Loop reset and full level restart
- Dialogue overlays rendered on top of the live level
- Echo replay system using recorded movement intent
- Ghost projection preview
- Recent recorded trail preview
- Delivery counter for multi-package objectives
- Multiple package types
- Multiple door types
- Pressure and temporal plates
- Cameras, guards, drones, lasers, wind, static, cracked floors
- Boss fight with staged intro
- Mobile touch controls
- Level editor

## Useful Design Notes

- Level design currently uses campaign levels to imply some abilities before those abilities are guaranteed. This is especially true for `dash`, `toss`, and `cloak`.
- Training levels are the clearest place to see the intended mechanics in isolation.
- If the project goal is “every campaign level should be beatable with only abilities the player definitely has by that point,” Level 4, Level 6, Level 7, Level 8, Level 9, Level 10, and Level 13 are the most important levels to audit.
