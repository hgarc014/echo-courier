import assert from 'node:assert/strict';
import { installDomStubs } from './harness/domStub.mjs';

installDomStubs();
const { buildTickHoundAtlas, pickTickHoundFrame, TICK_HOUND_SHEET_PATH } = await import('../src/core/atlas.js');

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

console.log('tick hound atlas ok');
