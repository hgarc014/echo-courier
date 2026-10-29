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

// Shop: points, buy, caps, sand helpers
store.clear();
let m = M.loadRogueMeta();
assert.equal(m.shopPoints, 0);
assert.equal(M.rogueMaxSand(m), 3); assert.equal(M.rogueStartSand(m), 3);
assert.equal(M.buyRogueShop('sandTank'), null, 'no points');
assert.equal(M.recordRunEnd(false).shopPoints, 1, 'fail grants 1 Chrono Dust');
assert.equal(M.selectRogueWeapon('route-cutter').selectedWeapon, 'route-cutter');
assert.equal(M.loadRogueMeta().selectedWeapon, 'route-cutter');
assert.equal(M.selectRogueWeapon('unknown'), null);
assert.equal(M.recordRunEnd(true).shopPoints, 3, 'clear grants 2 Chrono Dust');
store.clear();
assert.equal(M.recordRunEnd(false).shopPoints, 1);
for (let i = 0; i < 20; i++) M.recordRunEnd(true);
m = M.loadRogueMeta(); assert.equal(m.shopPoints, 41); assert.equal(m.clears, 20);
m = M.buyRogueShop('sandTank'); assert.equal(m.sandTankLevel, 1); assert.equal(m.shopPoints, 40);
assert.equal(M.rogueMaxSand(m), 4); assert.equal(M.rogueStartSand(m), 3);
m = M.buyRogueShop('startSand'); m = M.buyRogueShop('startSand');
assert.equal(m.startSandLevel, 2); assert.equal(m.shopPoints, 37);
assert.equal(M.rogueStartSand(m), 4);
m = M.buyRogueShop('sandTank'); m = M.buyRogueShop('sandTank'); assert.equal(m.sandTankLevel, 3); assert.equal(m.shopPoints, 32);
assert.equal(M.buyRogueShop('sandTank'), null, 'maxed');
assert.equal(M.shopItems().find(x => x.id === 'sandTank').maxed, true);
assert.equal(M.shopItems().find(x => x.id === 'startSand').cost, 3);
assert.equal(M.buyRogueShop('bogus'), null);
const S = await import('../src/systems/sandRewind.js');
const st = S.createSandState({ maxSand: 4, sand: 5 }); assert.equal(st.maxSand, 4); assert.equal(st.sand, 4);
assert.equal(S.createSandState().sand, S.SAND_MAX);
console.log('rogueMeta shop ok');
