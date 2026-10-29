import assert from 'node:assert/strict';
import { installDomStubs } from './harness/domStub.mjs';

installDomStubs();
const { RELICS, buyRelic, hasRelic, normalizeRelicState, relicModifiers, relicSlots, toggleRelic } = await import('../src/rogue/relics.js');
const M = await import('../src/rogue/rogueMeta.js');

assert.equal(RELICS.length, 5);
assert.equal(new Set(RELICS.map(relic => relic.id)).size, 5);
assert.equal(relicSlots({ runs: 9 }), 1);
assert.equal(relicSlots({ runs: 10 }), 2);
const dirty = normalizeRelicState({ runs: 0, relicsOwned: ['sand-funnel', 'sand-funnel', 'bad'], relicsEquipped: ['bad', 'sand-funnel', 'hound-tooth'] });
assert.deepEqual(dirty, { relicsOwned: ['sand-funnel'], relicsEquipped: ['sand-funnel'] });

let meta = { ...M.defaultRogueMeta(), shopPoints: 10 };
meta = buyRelic('cracked-pocketwatch', meta);
assert.equal(meta.shopPoints, 8);
assert.equal(buyRelic('cracked-pocketwatch', meta), null, 'owned relic cannot be bought twice');
meta = toggleRelic('cracked-pocketwatch', meta);
assert.equal(hasRelic(meta, 'cracked-pocketwatch'), true);
const withFunnel = buyRelic('sand-funnel', meta);
assert.equal(toggleRelic('sand-funnel', withFunnel), null, 'one-slot profile cannot over-equip');
const veteran = { ...withFunnel, runs: 10 };
assert.deepEqual(toggleRelic('sand-funnel', veteran).relicsEquipped, ['cracked-pocketwatch', 'sand-funnel']);

assert.deepEqual(relicModifiers({ runs: 10, relicsOwned: RELICS.map(r => r.id), relicsEquipped: ['cracked-pocketwatch', 'sand-funnel'] }), {
    maxHpBonus: 1, maxSandBonus: 0.5, echoCharges: 0, riftOpenTicks: 60, reachMultiplier: 1
});
assert.deepEqual(relicModifiers({ runs: 10, relicsOwned: RELICS.map(r => r.id), relicsEquipped: ['echo-locket', 'rift-key'] }), {
    maxHpBonus: 0, maxSandBonus: 0, echoCharges: 1, riftOpenTicks: 0, reachMultiplier: 1
});
assert.equal(relicModifiers({ relicsOwned: ['hound-tooth'], relicsEquipped: ['hound-tooth'] }).reachMultiplier, 1.1);

localStorage.removeItem(M.ROGUE_META_KEY);
M.saveRogueMeta({ ...M.defaultRogueMeta(), shopPoints: 10 });
M.buyRogueRelic('hound-tooth');
M.equipRogueRelic('hound-tooth');
assert.deepEqual(M.loadRogueMeta().relicsEquipped, ['hound-tooth'], 'buy/equip survives reload');

console.log('relics ok');
