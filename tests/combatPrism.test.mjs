import assert from 'node:assert/strict';
import { installDomStubs } from './harness/domStub.mjs';

installDomStubs();
const { state } = await import('../src/core/state.js');
const { CombatPrism, combatBossHud, PRISM_BEAM_WINDUP, PRISM_COMBAT_HP } = await import('../src/rogue/combatBosses.js');

state.gameState = 'PLAYING';
state.walls = [];
const boss = new CombatPrism(100, 100);
const player = { x: 320, y: 114, w: 30, h: 30 };
const echo = { x: 220, y: 250, w: 30, h: 30, id: 1, isActive: true };
assert.equal(boss.hp, PRISM_COMBAT_HP);
assert.equal(boss.hitByAttack('swing:1'), true);
assert.equal(boss.hitByAttack('swing:1'), false);
boss.beamCooldownTicks = 0;
boss.update(player, [echo]);
assert.equal(boss.beamWindupTicks, PRISM_BEAM_WINDUP);
assert.deepEqual(boss.beamTarget, { x: 235, y: 265 }, 'nearer Echo pulls the locked beam away from the courier');
echo.isActive = false;
for (let i = 0; i < PRISM_BEAM_WINDUP; i++) assert.equal(boss.update(player, [echo]), null, 'Echo-lured beam misses the courier');

boss.beamCooldownTicks = 0;
boss.update(player, []);
for (let i = 1; i < PRISM_BEAM_WINDUP; i++) boss.update(player, []);
assert.equal(boss.update(player, []).combatDamage, 2);
while (!boss.dead) boss.hitByAttack(`finish:${boss.hp}`);
assert.equal(combatBossHud(boss), null);

console.log('combat prism ok');
