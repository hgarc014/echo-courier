import assert from 'node:assert/strict';
import {
    PLAYER_MAX_HP, PLAYER_HIT_IFRAMES, TICK_HOUND_HP,
    beginAttack, tickAttack, attackIsActive, attackBox, applyCombatDamage
} from '../src/rogue/combat.js';

const player = { x: 100, y: 100, w: 30, h: 30, facingX: 1, facingY: 0, hp: PLAYER_MAX_HP, invulnTicks: 0, attackTicks: 0, attackId: 0 };
assert.equal(beginAttack(player), true);
assert.equal(beginAttack(player), false, 'recovery prevents attack spam');
for (let i = 0; i < 5; i++) tickAttack(player);
assert.equal(attackIsActive(player), true, 'swing becomes active after its wind-up');
assert.deepEqual(attackBox(player), { x: 115, y: 92, w: 48, h: 46 });

assert.equal(TICK_HOUND_HP, 3, 'baseline hound takes three one-damage hits');
assert.equal(applyCombatDamage(player), true);
assert.equal(player.hp, 4);
assert.equal(player.invulnTicks, PLAYER_HIT_IFRAMES);
assert.equal(applyCombatDamage(player), false, 'iframes suppress repeated contact damage');
player.invulnTicks = 0;
for (let i = 0; i < 4; i++) {
    applyCombatDamage(player);
    player.invulnTicks = 0;
}
assert.equal(player.hp, 0, 'five separated hits exhaust baseline integrity');

console.log('rogue combat v1 ok');
