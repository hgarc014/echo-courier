# Art-direction targets

These images are preproduction targets for the Rogue Run visual rehaul. They are not runtime atlases.

- `second-hand-halls-combat-target.png`: target camera, palette, arena density, Echo readability, telegraphs, rift, and enemy scale.
- `courier-pose-target.png`: courier identity and authored pose language. The visible checkerboard is baked into the generated concept and deliberately disqualifies it from runtime slicing.

Both were generated with the built-in image-generation workflow using the current courier/environment art only as identity and subject references. Production rules and the normalized prompt intent are documented in [`docs/ART_DIRECTION.md`](../../docs/ART_DIRECTION.md).

Do not add these files to `src/core/atlas.js`. Runtime production assets must have real alpha, stable pivots, consistent construction, and machine-readable frame metadata.
