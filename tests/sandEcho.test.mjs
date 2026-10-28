import assert from 'node:assert/strict';
const S = await import('../src/systems/sandEcho.js');
const past = [];
assert.ok(S.pushEchoRun(past, [{x:1},{x:2}], 2));
assert.equal(past.length, 1);
S.pushEchoRun(past, [{x:3}], 2); S.pushEchoRun(past, [{x:4}], 2);
assert.equal(past.length, 2); assert.equal(past[0][0].x, 3, 'oldest dropped');
assert.equal(S.pushEchoRun(past, [], 2), false);
assert.equal(S.spawnEchoFromBuffer([1,2,3], 2).length, 2);
assert.equal(S.maxSandGhosts({ maxGhosts: 2, echoSlotBonus: 1 }), 3);
const buf = []; S.recordSandSample(buf, { x: 0 }); assert.equal(buf.length, 1);
const z = { x: 0, y: 0, w: 10, h: 10 };
assert.ok(S.rogueZoneClear([], { x: 2, y: 2, w: 4, h: 4 }, z));
assert.ok(!S.rogueZoneClear([{}], { x: 2, y: 2, w: 4, h: 4 }, z));
assert.ok(!S.rogueZoneClear([], { x: 50, y: 2, w: 4, h: 4 }, z));

// Short tap (hold < MIN) never commits a ghost — even if pending has many frames.
const tapPast = [];
const longBuf = Array.from({ length: 60 }, (_, i) => ({ x: i, y: 0 }));
assert.equal(S.commitSandEcho(tapPast, longBuf, 3, 5), false, '3-frame tap must not spawn');
assert.equal(tapPast.length, 0);
assert.equal(S.commitSandEcho(tapPast, longBuf.slice(0, 14), 14, 5), false, '14-frame hold must not spawn');
assert.equal(S.commitSandEcho(tapPast, longBuf.slice(0, 15), 15, 5), true, '15-frame hold spawns');
assert.equal(tapPast.length, 1);
assert.equal(S.commitSandEcho(tapPast, longBuf.slice(0, 20), 20, 5), true);
assert.equal(tapPast.length, 2);
console.log('sandEcho ok');
