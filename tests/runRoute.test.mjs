import assert from 'node:assert/strict';
import { BIOME_ORDER } from '../src/rogue/biomes.js';
import { CHAMBERS_PER_BIOME, ROUTE_NODE_TYPES, createRouteLedger, createRunRoute, ledgerChoices, nextRouteIndex, routeStage } from '../src/rogue/runRoute.js';

const route = createRunRoute(BIOME_ORDER, 42);
assert.equal(CHAMBERS_PER_BIOME, 3);
assert.equal(route.length, BIOME_ORDER.length * 4, 'three chambers plus one boss per biome');
assert.deepEqual(createRunRoute(BIOME_ORDER, 42), route, 'same seed produces the same route');

for (let biomeIndex = 0; biomeIndex < BIOME_ORDER.length; biomeIndex++) {
    const stages = route.filter(stage => stage.biomeIndex === biomeIndex);
    assert.deepEqual(stages.map(stage => stage.kind), ['chamber', 'chamber', 'chamber', 'boss']);
    assert.equal(new Set(stages.slice(0, 3).map(stage => stage.typeId)).size, 3, 'a biome route does not repeat chamber types');
    assert.ok(stages.slice(0, 3).every(stage => BIOME_ORDER[biomeIndex].chamberTypes.some(type => type.id === stage.typeId)));
}

assert.equal(routeStage(route, 0), route[0]);
assert.equal(nextRouteIndex(route, route.length - 2), route.length - 1);
assert.equal(nextRouteIndex(route, route.length - 1), null);
assert.equal(routeStage(route, route.length), null);

const ledger = createRouteLedger(BIOME_ORDER, 42);
assert.deepEqual(createRouteLedger(BIOME_ORDER, 42), ledger, 'ledger is deterministic');
assert.equal(ledger.length, BIOME_ORDER.length);
assert.equal(ROUTE_NODE_TYPES.length, 5);
for (const biome of ledger) {
    assert.equal(biome.layers.length, 3);
    assert.equal(biome.boss.type, 'boss');
    for (const choices of biome.layers) {
        assert.equal(choices.length, 2);
        assert.notEqual(choices[0].id, choices[1].id);
        assert.ok(choices.every(node => node.reward && Number.isInteger(node.risk)));
        assert.ok(choices.every(node => BIOME_ORDER[biome.biomeIndex].chamberTypes.some(type => type.id === node.chamberType)));
    }
}
assert.equal(ledgerChoices(ledger, 0, 0).length, 2);
assert.deepEqual(ledgerChoices(ledger, 99, 0), []);

const { main, state } = await import('./harness/replay.mjs');
main.startRogueRun(42, true);
assert.equal(state.rogueRun.ledgerEnabled, true);
assert.equal(state.rogueRun.routeDepth, 0);
assert.equal(state.rogueRun.routeHistory.length, 1);
state.rogueRun.routeDepth = 1;
const nextChoice = ledgerChoices(state.rogueRun.ledger, 0, 1)[1];
assert.equal(main.chooseRouteNode(nextChoice.id), true);
assert.equal(state.rogueRun.selectedRouteNode.id, nextChoice.id);
assert.equal(state.currentLevelMeta.chamberType, undefined, 'runtime metadata stays campaign-editor compatible');
assert.equal(state.rogueRun.routeHistory.at(-1), nextChoice.id);

main.startRogueLedgerRun(99);
assert.equal(state.gameState, 'ROUTE_LEDGER');
assert.equal(state.rogueRun.routeHistory.length, 0, 'the player chooses the opening future');
const openingChoice = ledgerChoices(state.rogueRun.ledger, 0, 0)[0];
assert.equal(main.chooseRouteNode(openingChoice.id), true);
assert.equal(state.gameState, 'PLAYING');
assert.deepEqual(state.rogueRun.routeHistory, [openingChoice.id]);

console.log('run route ok');
