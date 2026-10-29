import assert from 'node:assert/strict';
import { installDomStubs } from './harness/domStub.mjs';

installDomStubs();
const { state } = await import('../src/core/state.js');
const { ChronoSentry, ChronoBolt } = await import('../src/entities/hazards.js');
const { SQUAD_PROFILES } = await import('../src/rogue/encounterComposition.js');

state.walls = [];
state.doors = [];
state.projectiles = [];
state.rogueRun = { active: true };
state.gameState = 'PLAYING';

const sentry = new ChronoSentry([{ x: 300, y: 200 }, { x: 301, y: 200 }]);
const player = { x: 80, y: 200, w: 30, h: 30, cloakTimer: 0 };
for (let i = 0; i < 126; i++) sentry.update(player, []);
assert.equal(state.projectiles.length, 1, 'Sentry fires after a readable charge');
assert.ok(state.projectiles[0] instanceof ChronoBolt);
assert.ok(state.projectiles[0].vx < 0, 'bolt travels toward the player');

const close = new ChronoSentry([{ x: 120, y: 200 }, { x: 121, y: 200 }]);
const before = close.x;
close.update(player, []);
assert.ok(close.x > before, 'Sentry retreats when the courier closes distance');

const bolt = new ChronoBolt(player.x, player.y, 0, 0);
assert.deepEqual(bolt.update([], [], player), { combatDamage: 1, reason: 'Struck by a Chrono Sentry bolt!' });
assert.equal(bolt.active, false);

const echo = { x: 10, y: 10, w: 30, h: 30, isActive: true, commandLockTicks: 0, commandFxTicks: 0 };
const echoBolt = new ChronoBolt(10, 10, 0, 0);
assert.equal(echoBolt.update([], [echo], player), null);
assert.equal(echo.commandLockTicks, 30, 'bolt disrupts Echo playback instead of deleting the ally');

const crossfire = SQUAD_PROFILES.find(profile => profile.id === 'sentry-crossfire');
assert.deepEqual(crossfire.roles, ['sentry', 'chaser', 'sentry']);
assert.equal(crossfire.threat, 5);

console.log('chrono sentry ok');
