import assert from 'node:assert/strict';
import { createSandState, pushSnapshot, tickSand, applySnapshot, canRewind, HISTORY_CAP, SAND_MAX, refillSand, bumpMaxSand, applyPickup, PICKUP_REFILL, PICKUP_MAX_BONUS } from '../src/systems/sandRewind.js';

const mkPlayer = () => ({ x: 0, y: 0, w: 10, h: 10, facingX: 1, facingY: 0, cloakTimer: 0, dashCooldown: 0, tossCooldown: 0 });

// buffer cap
{ const s = createSandState(); for (let i = 0; i < 500; i++) pushSnapshot(s, { x: i, tick: i }); assert.equal(s.history.length, HISTORY_CAP); assert.equal(s.history.at(-1).x, 499); }

// record then rewind restores x/y and drains
{ const s = createSandState(); const p = mkPlayer(); const pk = [{ id: 'a', w: 4, h: 4 }];
  for (let t = 0; t < 30; t++) { p.x = t; p.y = t * 2; tickSand(s, { holding: false, player: p, packages: pk, tick: t }); }
  assert.equal(s.sand, SAND_MAX);
  p.x = 999;
  assert.equal(tickSand(s, { holding: true, player: p, packages: pk, tick: 30 }), true);
  assert.equal(p.x, 29); assert.equal(p.y, 58); assert.ok(s.sand < SAND_MAX); assert.ok(s.rewinding);
  for (let i = 0; i < 9; i++) tickSand(s, { holding: true, player: p, packages: pk, tick: 0 });
  assert.equal(p.x, 20); assert.ok(Math.abs(s.sand - (SAND_MAX - 10 / 60)) < 1e-9);
}

// cannot rewind at 0 sand
{ const s = createSandState(); s.sand = 0; const p = mkPlayer(); pushSnapshot(s, { x: 5, y: 5 });
  assert.equal(canRewind(s), false); p.x = 50;
  assert.equal(tickSand(s, { holding: true, player: p, packages: [], tick: 1 }), false); assert.equal(p.x, 50); }

// carried package reattached
{ const p = mkPlayer(); const pkg = { id: 'k', w: 4, h: 4, carriedBy: null };
  applySnapshot(p, [pkg], { x: 10, y: 10, carriedPackageId: 'k' }); assert.equal(pkg.carriedBy, 'player'); assert.equal(pkg.x, 13); }
// maxSand: bump raises cap, refill and tick respect it
{ const s = createSandState(); assert.equal(s.maxSand, SAND_MAX);
  s.sand = 1; bumpMaxSand(s, 1); assert.equal(s.maxSand, SAND_MAX + 1); assert.equal(s.sand, 2);
  refillSand(s, 10); assert.equal(s.sand, SAND_MAX + 1);
  s.sand = s.maxSand - 0.001; const p = mkPlayer();
  for (let i = 0; i < 60; i++) tickSand(s, { holding: false, player: p, packages: [], tick: i });
  assert.equal(s.sand, s.maxSand); }
// applyPickup
{ const s = createSandState(); s.sand = 0; assert.equal(applyPickup(s, 'sand_refill'), true); assert.equal(s.sand, PICKUP_REFILL);
  assert.equal(applyPickup(s, 'sand_max'), true); assert.equal(s.maxSand, SAND_MAX + PICKUP_MAX_BONUS); assert.equal(s.sand, PICKUP_REFILL + PICKUP_MAX_BONUS);
  assert.equal(applyPickup(s, 'nope'), false); }
console.log('sandRewind ok');

// death undo
{ const { canDeathUndo, applyDeathUndo, DEATH_UNDO_COST, DEATH_UNDO_FRAMES } = await import('../src/systems/sandRewind.js');
  const s = createSandState(); const p = mkPlayer();
  for (let t = 0; t < 120; t++) { p.x = t; tickSand(s, { holding: false, player: p, packages: [], tick: t }); }
  p.x = 999; const before = s.sand;
  assert.equal(canDeathUndo(s), true);
  const r = applyDeathUndo(s, p, []);
  assert.equal(r.ok, true); assert.equal(r.frames, DEATH_UNDO_FRAMES);
  assert.equal(p.x, 120 - DEATH_UNDO_FRAMES); assert.equal(s.history.length, 120 - DEATH_UNDO_FRAMES);
  assert.ok(Math.abs(s.sand - (before - DEATH_UNDO_COST)) < 1e-9); assert.equal(s.rewinding, false);
  // short sand fails, no change
  s.sand = DEATH_UNDO_COST - 0.01; p.x = 500;
  assert.equal(canDeathUndo(s), false); assert.equal(applyDeathUndo(s, p, []).ok, false); assert.equal(p.x, 500);
  // empty history fails
  const e = createSandState(); assert.equal(canDeathUndo(e), false);
}
