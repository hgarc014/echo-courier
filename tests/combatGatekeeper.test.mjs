import assert from 'node:assert/strict';
import { installDomStubs } from './harness/domStub.mjs';

installDomStubs();
const { state } = await import('../src/core/state.js');
const {
    CombatGatekeeper, combatBossHud, GATEKEEPER_BEAM_DAMAGE,
    GATEKEEPER_BEAM_WINDUP, GATEKEEPER_COMBAT_HP
} = await import('../src/rogue/combatBosses.js');

state.gameState = 'PLAYING';
state.walls = [];
const boss = new CombatGatekeeper(100, 100);
const player = { x: 300, y: 115, w: 30, h: 30 };
assert.equal(boss.hp, GATEKEEPER_COMBAT_HP);
assert.equal(boss.hitByAttack('swing:1'), true);
assert.equal(boss.hitByAttack('swing:1'), false, 'one swing damages once');
assert.equal(boss.hp, GATEKEEPER_COMBAT_HP - 1);

boss.beamCooldownTicks = 0;
boss.update(player);
assert.equal(boss.beamWindupTicks, GATEKEEPER_BEAM_WINDUP, 'beam warns for a full second');
for (let i = 1; i < GATEKEEPER_BEAM_WINDUP; i++) assert.equal(boss.update(player), null);
const hit = boss.update(player);
assert.equal(hit.combatDamage, GATEKEEPER_BEAM_DAMAGE);
assert.ok(GATEKEEPER_BEAM_DAMAGE <= 2);

boss.beamCooldownTicks = 0;
boss.update(player);
player.y = 300;
for (let i = 0; i < GATEKEEPER_BEAM_WINDUP; i++) assert.equal(boss.update(player), null, 'locked beam can be dodged');

while (boss.hp > boss.maxHp / 2) boss.hitByAttack(`phase:${boss.hp}`);
assert.equal(combatBossHud(boss).phase, 2);
while (!boss.dead) boss.hitByAttack(`finish:${boss.hp}`);
assert.equal(combatBossHud(boss), null);

console.log('combat gatekeeper ok');
