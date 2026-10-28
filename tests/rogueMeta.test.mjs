// Rogue meta unlocks: default state + localStorage grant. Run: node tests/rogueMeta.test.mjs
import assert from 'node:assert/strict';
const store = new Map();
globalThis.localStorage = { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
const M = await import('../src/rogue/rogueMeta.js');

assert.deepEqual(M.loadRogueMeta(), M.defaultRogueMeta());
assert.equal(M.rogueMaxGhosts(), M.BASE_ECHO_SLOTS);
assert.equal(M.rogueLoopTime(), M.BASE_LOOP_TIME_S);
assert.equal(M.nextUnlock().id, 'echoSlot');

M.grantUnlock();
assert.equal(JSON.parse(store.get(M.ROGUE_META_KEY)).echoSlotBonus, 1);
assert.equal(M.rogueMaxGhosts(), M.BASE_ECHO_SLOTS + 1);
assert.equal(M.nextUnlock().id, 'longerRecord');

M.grantUnlock();
assert.equal(M.rogueLoopTime(), M.BASE_LOOP_TIME_S + M.RECORD_BONUS_STEP_S);
assert.equal(M.rogueMaxGhosts(), M.BASE_ECHO_SLOTS + 1, 'echo slot stays at +1');

for (let i = 0; i < 3; i++) M.grantUnlock();
assert.equal(M.loadRogueMeta().recordBonusS, M.MAX_RECORD_BONUS_S);
// Sand unlocks come after record is maxed: tank, start, tank, start, ...
assert.equal(M.rogueMaxSand(), M.SAND_BASE_S); assert.equal(M.rogueStartSand(), M.SAND_BASE_S);
const order = [];
for (let i = 0; i < 10; i++) { const u = M.nextUnlock(); if (!u) break; order.push(u.id); M.grantUnlock(); }
assert.deepEqual(order, ['sandTank', 'startSand', 'sandTank', 'startSand', 'sandTank', 'startSand']);
assert.equal(M.nextUnlock(), null);
assert.equal(M.rogueMaxSand(), M.SAND_BASE_S + M.MAX_SAND_MAX_BONUS_S);
assert.equal(M.rogueStartSand(), M.rogueMaxSand());
assert.equal(M.rogueStartSand({ sandMaxBonus: 0, sandStartBonus: 3 }), M.SAND_BASE_S, 'start capped by max');

M.recordRunEnd(true); M.recordRunEnd(false);
assert.deepEqual([M.loadRogueMeta().runs, M.loadRogueMeta().clears], [2, 1]);

store.set(M.ROGUE_META_KEY, 'not json');
assert.deepEqual(M.loadRogueMeta(), M.defaultRogueMeta());

// Not a campaign progress key -> wipeProgress leaves it alone.
const { readFileSync } = await import('node:fs');
assert.ok(!readFileSync(new URL('../src/core/state.js', import.meta.url), 'utf8').includes('rogueMeta'));

store.set(M.ROGUE_META_KEY, JSON.stringify({ sandMaxBonus: 99, sandStartBonus: -5, echoSlotBonus: 7 }));
{ const m = M.loadRogueMeta(); assert.equal(m.sandMaxBonus, M.MAX_SAND_MAX_BONUS_S); assert.equal(m.sandStartBonus, 0); assert.equal(m.echoSlotBonus, 1); }
store.set(M.ROGUE_META_KEY, JSON.stringify({ sandMaxBonus: 'x' }));
assert.equal(M.loadRogueMeta().sandMaxBonus, 0);
console.log('rogueMeta ok');
