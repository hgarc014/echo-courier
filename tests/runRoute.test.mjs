import assert from 'node:assert/strict';
import { BIOME_ORDER } from '../src/rogue/biomes.js';
import { CHAMBERS_PER_BIOME, createRunRoute, nextRouteIndex, routeStage } from '../src/rogue/runRoute.js';

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

console.log('run route ok');
