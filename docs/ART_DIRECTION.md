# Echo Courier Art Direction

Status: visual target for the Rogue Run vertical slice. The current runtime sprites remain prototype material until the combat loop and this direction pass an actual-size playtest.

## North star

Echo Courier should read as a premium illustrated 2.5D action game: bold graphic silhouettes, shallow three-quarter depth, restrained surface detail, and exceptionally clear temporal effects. The player must be able to parse the present courier, three Echoes, six enemies, attack telegraphs, and the exit rift in a single glance.

Reference targets:

- [`second-hand-halls-combat-target.png`](../assets/art-direction/second-hand-halls-combat-target.png) establishes camera, arena density, palette, lighting, and maximum combat readability.
- [`courier-pose-target.png`](../assets/art-direction/courier-pose-target.png) establishes the courier silhouette, backpack, baton, and authored action-pose language. It is concept art, not a runtime atlas; the checkerboard is baked into the source image.

## Camera and scale

- Projection: fixed three-quarter top-down, with environment verticals visible but never blocking combatants.
- Target gameplay frame: 16:9, designed at 1536x864 and verified down to 1280x720.
- The courier should occupy approximately 7-9% of the viewport height in an ordinary arena.
- Standard enemies should occupy 4-7%; elites 10-14%.
- Keep the playable combat plane visually flat even when scenery uses shallow height.
- Foreground scenery may frame the arena, but must not cross the player's navigation or obscure telegraphs.

## Shape language

| Family | Shape language | Read at a glance |
| --- | --- | --- |
| Courier | Upright rounded armor, broad delivery pack, compact baton | Orange, human, forward-moving |
| Echo | Same silhouette with simplified internal detail and broken cyan edge | A recorded ally, never the live player |
| Tick Hound | Low quadruped, forward wedge, visible clock core | Fast melee pressure |
| Elite | Larger asymmetric silhouette and magenta core | Priority threat |
| ChronoHaul environment | Rectangular shipping modules, rails, crates | Industrial order |
| Sandfall/time fracture | Rings, arcs, broken concentric geometry | Time manipulation |

Do not solve readability with tiny labels or permanent health bars. Pose, scale, value, and color must carry the first read.

## Palette and value hierarchy

| Role | Color | Usage |
| --- | --- | --- |
| Environment base | `#101820` | Arena floor and negative space |
| Environment structure | `#26313a` | Walls, machines, crates |
| Courier | `#f46a1b` | Primary live-player identity |
| Time / Echo | `#30e7ff` | Rewind, Echoes, rifts, safe time effects |
| Threat | `#ff3a9d` | Elite attacks, temporal corruption |
| Immediate danger | `#ff4b45` | Contact and impact telegraphs |
| Clockwork accent | `#b68b3a` | Sparse mechanisms and navigation landmarks |

The arena should stay mostly in the bottom 35% of the value range. The live courier is the brightest warm object. Cyan is reserved for player-owned time effects and exits; hostile time effects shift toward magenta. Red is short-lived and predictive, not ambient decoration.

## Lighting and materials

- One consistent cool key from the upper left.
- A restrained warm rim may separate the courier from dark flooring.
- Shadows are soft, short, and anchored directly beneath actors; they communicate grounding rather than realism.
- Metal uses large painted value groups, not noisy texture at sprite scale.
- Emissive effects have a crisp core plus one controlled glow band. Avoid stacking bloom until silhouettes disappear.
- Wear and shipment markings belong on large environment modules only; never put unreadable microtext on gameplay sprites.

## Animation standard

The final courier set should include authored poses for:

- idle front/back/side
- eight-direction locomotion or a validated four-direction set with controlled mirroring
- quick attack chain
- committed heavy attack
- dash startup/travel/recovery
- hit recoil and knockdown
- rewind entry/hold/release
- Echo spawn/playback-end dissolve
- rupture cast

Runtime scale/bob can add secondary motion, but it cannot substitute for attack, turn, hit, or locomotion animation. Combat animation events must expose windup, active, recovery, hit, trail, and footstep markers to the simulation/presentation layer.

## Combat VFX hierarchy

1. Enemy lethal telegraph: highest contrast before impact.
2. Player hit confirmation: crisp, brief, local.
3. Live-player attack trail: orange-to-cyan core, short persistence.
4. Echo attack trail: cyan outline, lower fill opacity, distinct broken tail.
5. Rewind path: thin historical ribbon; it must not resemble an incoming attack.
6. Ambient time fractures: lowest contrast and slowest motion.

Screen shake, freeze frames, chromatic separation, and bloom all share a single intensity budget. A routine hit should use at most two; bosses may briefly use three.

## UI direction

- UI panels use dark translucent slabs, one-pixel cyan/brass rules, and large readable numerals.
- HP/stability and sand must be readable without looking away from the courier for long.
- Aspect cards use one iconic illustration, one behavior-changing headline, and a short mechanical sentence.
- Present/Past/Future/Paradox families need distinct motifs in addition to color for color-vision accessibility.
- Dialogue portraits may carry more detail than gameplay sprites but must use the same armor construction and lighting.

## Asset pipeline

1. Concept approval at actual gameplay scale.
2. Character turnaround with locked proportions and material callouts.
3. Animation keys on a shared footprint and pivot.
4. Clean transparent export; no checkerboard, keyed white, or keyed black backgrounds.
5. Machine-readable frame metadata rather than hand-measured rectangles in source code.
6. Automated validation for frame bounds, alpha, duplicate names, pivots, and atlas size.
7. Actual-size stress capture with three Echoes, six enemies, an elite, and overlapping telegraphs.

Suggested runtime manifest fields:

```json
{
  "image": "courier.png",
  "frames": {
    "attack_1": { "x": 0, "y": 0, "w": 192, "h": 192, "pivot": [96, 164], "events": [{ "tick": 4, "type": "active" }] }
  }
}
```

## AI-assisted art policy

Generated imagery is acceptable for target exploration and paint-over reference. It is not automatically production-ready. Final assets require consistent identity, transparent edges, fixed pivots, animation continuity, licensing review, and human cleanup. Generated sheets with baked checkerboards or inconsistent costume construction must never be sliced directly into the final runtime.

## Vertical-slice acceptance

- The present courier is identifiable within 250 ms in a still containing three Echoes and six enemies.
- All testers distinguish player-owned cyan effects from magenta/red threats without explanation.
- No enemy telegraph is fully hidden by an Echo or attack effect at target density.
- Courier proportions, backpack, helmet, and baton remain consistent across every authored pose.
- The room remains legible at 1280x720 and under reduced-saturation simulation.
- A production estimate exists for one character animation set, one enemy, one elite, and one modular room kit before expansion.

