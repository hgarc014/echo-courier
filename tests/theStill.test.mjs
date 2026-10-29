import assert from 'node:assert/strict';
import { installDomStubs } from './harness/domStub.mjs';

installDomStubs();
const { CHAMBER_TYPES, CLEAR_KINDS, STILL_NAME, generateChamber, pickChamberTypes } = await import('../src/data/theStill.js');
const { BIOME_ORDER, editorChamberOptions, generateForBiome, nextBiomeIndex, rogueChamberEditorLayout } = await import('../src/rogue/biomes.js');
const { CombatStillkeeper, STILLKEEPER_COMBAT_HP, combatBossHud } = await import('../src/rogue/combatBosses.js');
const { state } = await import('../src/core/state.js');
const { Ghost } = await import('../src/entities/actors.js');

assert.equal(STILL_NAME, 'The Still');
assert.deepEqual(CHAMBER_TYPES.map(type => type.clear).sort(), CLEAR_KINDS.slice().sort());
assert.deepEqual(pickChamberTypes(71), pickChamberTypes(71), 'same seed is stable');
assert.equal(new Set(pickChamberTypes(71, 3)).size, 3, 'one biome draw uses every chamber once');

for (const type of CHAMBER_TYPES) {
    const first = generateChamber(29, type.id);
    const second = generateChamber(29, type.id);
    assert.deepEqual(first, second, `${type.id} generation is deterministic`);
    assert.equal(first.meta.hall, STILL_NAME);
    assert.equal(first.meta.clear, type.clear);
    assert.equal(first.layout.packages.length, 0);
    assert.equal(first.layout.plates.length, 0);
    assert.ok(first.layout.guards.length >= 2);
    const editor = rogueChamberEditorLayout('the-still', type.id, 29);
    assert.equal(editor.meta.biome, 'the-still');
    assert.equal(editor.meta.chamberType, type.id);
}

assert.equal(BIOME_ORDER.at(-1).id, 'the-still');
assert.equal(nextBiomeIndex(BIOME_ORDER.length - 1), null);
assert.equal(generateForBiome('the-still', 9, 'last-route').info.type, 'last-route');
assert.equal(editorChamberOptions().filter(row => row.biomeId === 'the-still').length, 3);

state.gameState = 'PLAYING';
state.walls = [];
const boss = new CombatStillkeeper(100, 100);
assert.equal(boss.hp, STILLKEEPER_COMBAT_HP);
assert.equal(combatBossHud(boss).name, 'STILLKEEPER');
assert.equal(boss.hitByAttack('player:1'), true);
assert.equal(boss.hitByAttack('player:1'), false, 'one attack id cannot multi-hit');
while (!boss.dead) boss.hitByAttack(`finish:${boss.hp}`);
assert.equal(combatBossHud(boss), null);

const ghost = new Ghost(1, [{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 30, y: 10 }]);
ghost.spawnTtl = 0;
ghost.update([], [], [], 0.5);
assert.equal(ghost.localTick, 0.5, 'The Still playback rate advances Echoes at half speed');

console.log('the still ok');
