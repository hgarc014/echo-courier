import assert from 'node:assert/strict';
import { installDomStubs } from './harness/domStub.mjs';

installDomStubs();
const { state } = await import('../src/core/state.js');
const { EchoLeech } = await import('../src/entities/hazards.js');
const { Ghost } = await import('../src/entities/actors.js');
const { recallEchoes } = await import('../src/rogue/echoCommands.js');
const { SQUAD_PROFILES } = await import('../src/rogue/encounterComposition.js');

state.walls = []; state.doors = []; state.projectiles = [];
state.rogueRun = { active: true, weapon: 'chrono-baton' };
state.gameState = 'PLAYING';

const run = Array.from({ length: 240 }, () => ({ x: 100, y: 100, facingX: 1, facingY: 0 }));
const echo = new Ghost(1, run);
echo.spawnTtl = 0;
const player = { x: 400, y: 300, w: 30, h: 30, cloakTimer: 0 };
const leech = new EchoLeech([{ x: 135, y: 100 }, { x: 136, y: 100 }]);

for (let i = 0; i < 32; i++) leech.update(player, [echo]);
assert.equal(leech.siphonTarget, echo, 'Leech prioritizes an active Echo over the courier');
assert.ok(leech.siphonTicks > 0, 'close Echo enters the siphon state after a telegraph');
const tickBefore = echo.localTick;
for (let i = 0; i < 31; i++) leech.update(player, [echo]);
assert.ok(echo.localTick > tickBefore + 25, 'siphon accelerates the Echo through its remaining route');
assert.equal(echo.integrity, 2, 'siphon damages Echo integrity on a readable interval');

recallEchoes([echo], player, []);
leech.update(player, [echo]);
assert.equal(leech.siphonTicks, 0, 'Recall breaks a distant siphon tether');

const noEchoLeech = new EchoLeech([{ x: player.x, y: player.y }, { x: player.x + 1, y: player.y }]);
assert.deepEqual(noEchoLeech.update(player, []), { combatDamage: 1, reason: 'Caught by an Echo Leech!' });

const harvest = SQUAD_PROFILES.find(profile => profile.id === 'echo-harvest');
assert.deepEqual(harvest.roles, ['leech', 'chaser', 'sentry']);
assert.equal(harvest.threat, 6);

console.log('echo leech ok');
