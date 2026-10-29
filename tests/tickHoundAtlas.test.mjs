import assert from 'node:assert/strict';
import { installDomStubs } from './harness/domStub.mjs';

installDomStubs();
const { buildTickHoundAtlas, buildVfxAtlas, buildModernPropsAtlas, buildCourierActionAtlas, buildRogueBossAtlas, pickCourierActionFrame, pickTickHoundFrame, TICK_HOUND_SHEET_PATH, VFX_SHEET_PATH, VFX_FRAME_GRID, MODERN_PROPS_SHEET_PATH, MODERN_PROPS_FRAME_GRID, COURIER_ACTIONS_SHEET_PATH, ROGUE_BOSSES_SHEET_PATH } = await import('../src/core/atlas.js');

assert.equal(TICK_HOUND_SHEET_PATH, 'assets/sprite-sheets/tick-hound-v2.png');
const atlas = buildTickHoundAtlas({ width: 1536, height: 1152 });
assert.equal(atlas.ready, true);
assert.equal(atlas.runRight.length, 4);
assert.ok(atlas.idleFront && atlas.idleBack && atlas.dead && atlas.lunge);

assert.equal(pickTickHoundFrame(atlas, { dead: true }, 0).img, atlas.dead);
assert.equal(pickTickHoundFrame(atlas, { hurtTicks: 4 }, 0).img, atlas.hit);
assert.equal(pickTickHoundFrame(atlas, { lungeTelegraphTicks: 4 }, 0).img, atlas.windup);
assert.equal(pickTickHoundFrame(atlas, { state: 'chase', facingAngle: Math.PI }, 6).flipX, true);
assert.equal(pickTickHoundFrame(atlas, { state: 'idle', facingAngle: -Math.PI / 2 }, 0).img, atlas.idleBack);

assert.equal(VFX_SHEET_PATH, 'assets/sprite-sheets/echo-courier-vfx-v2.png');
const vfx = buildVfxAtlas({ width: 1600, height: 1200 });
assert.equal(vfx.cellW, 400);
assert.equal(vfx.cellH, 400);
assert.deepEqual(Object.keys(VFX_FRAME_GRID), Object.keys(vfx).filter(key => !['ready', 'cellW', 'cellH'].includes(key)));

assert.equal(MODERN_PROPS_SHEET_PATH, 'assets/sprite-sheets/echo-courier-props-v2.png');
const props = buildModernPropsAtlas({ width: 1600, height: 1200 });
assert.equal(props.cellW, 400);
assert.equal(props.cellH, 400);
assert.deepEqual(Object.keys(MODERN_PROPS_FRAME_GRID), Object.keys(props).filter(key => !['ready', 'cellW', 'cellH'].includes(key)));

assert.equal(COURIER_ACTIONS_SHEET_PATH, 'assets/sprite-sheets/echo-courier-actions-v2.png');
const actions = buildCourierActionAtlas({ width: 1600, height: 1200 });
assert.equal(pickCourierActionFrame(actions, { attackTicks: 18, attackTotalTicks: 20, attackActiveFrom: 5, attackActiveTo: 10, weaponAction: 'quick' }).img, actions.quickWindup);
assert.equal(pickCourierActionFrame(actions, { attackTicks: 13, attackTotalTicks: 20, attackActiveFrom: 5, attackActiveTo: 10, weaponAction: 'quick' }).img, actions.quickStrike);
assert.equal(pickCourierActionFrame(actions, { attackTicks: 18, attackTotalTicks: 20, attackActiveFrom: 5, attackActiveTo: 10, weaponAction: 'heavy' }).img, actions.heavyWindup);
assert.equal(pickCourierActionFrame(actions, { attackTicks: 12, attackTotalTicks: 20, attackActiveFrom: 5, attackActiveTo: 10, weaponAction: 'heavy' }).img, actions.heavyStrike);

assert.equal(ROGUE_BOSSES_SHEET_PATH, 'assets/sprite-sheets/echo-courier-rogue-bosses-v2.png');
const bosses = buildRogueBossAtlas({ width: 1600, height: 1200 });
assert.ok(bosses.gatekeeperIdle && bosses.burrowerEmerge && bosses.prismHurt);

console.log('tick hound atlas ok');
