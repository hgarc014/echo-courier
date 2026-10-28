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

for (let i = 0; i < 10; i++) M.grantUnlock();
assert.equal(M.loadRogueMeta().recordBonusS, M.MAX_RECORD_BONUS_S);
assert.equal(M.nextUnlock(), null);

M.recordRunEnd(true); M.recordRunEnd(false);
assert.deepEqual([M.loadRogueMeta().runs, M.loadRogueMeta().clears], [2, 1]);

store.set(M.ROGUE_META_KEY, 'not json');
assert.deepEqual(M.loadRogueMeta(), M.defaultRogueMeta());

// Not a campaign progress key -> wipeProgress leaves it alone.
const { readFileSync } = await import('node:fs');
assert.ok(!readFileSync(new URL('../src/core/state.js', import.meta.url), 'utf8').includes('rogueMeta'));
console.log('rogueMeta ok');
