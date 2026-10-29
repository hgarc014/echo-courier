import assert from 'node:assert/strict';
import { installDomStubs } from './harness/domStub.mjs';

installDomStubs();
const { state } = await import('../src/core/state.js');
const {
    BURROWER_COMBAT_HP, BURROWER_EMERGE_WINDUP, CombatBurrower, combatBossHud
} = await import('../src/rogue/combatBosses.js');

state.gameState = 'PLAYING';
state.walls = [];
const boss = new CombatBurrower(100, 100);
const player = { x: 280, y: 100, w: 30, h: 30 };
const echo = { x: 180, y: 100, w: 30, h: 30, id: 2, isActive: true };
assert.equal(boss.hp, BURROWER_COMBAT_HP);
assert.equal(boss.hitByAttack('swing:1'), true);
assert.equal(boss.hitByAttack('swing:1'), false);

boss.exposedTicks = 1;
boss.update(player, [echo]);
assert.equal(boss.combatPhase, 'telegraph');
assert.equal(boss.emergeWindupTicks, BURROWER_EMERGE_WINDUP);
assert.deepEqual(boss.emergeTarget, { x: 195, y: 115 }, 'nearby Echo lures the emerge target');
assert.equal(boss.hitByAttack('swing:2'), false, 'boss is invulnerable underground');
echo.isActive = false;
for (let i = 1; i < BURROWER_EMERGE_WINDUP; i++) assert.equal(boss.update(player, [echo]), null);
assert.equal(boss.update(player, [echo]), null, 'locked Echo target can be dodged');
assert.equal(boss.combatPhase, 'exposed');

while (boss.hp > 0) boss.hitByAttack(`finish:${boss.hp}`);
assert.equal(boss.dead, true);
assert.equal(combatBossHud(boss), null);

console.log('combat burrower ok');
