// Rogue Run combat loop: guards hunt, dash and blink stun, an echo stuns then kills.
// Wave clear counts dead guards, not distracted ones.
// Run: node tests/rogueCombat.test.mjs
import assert from 'node:assert/strict';
import { main, state, keys } from './harness/replay.mjs';
import { prevKeys } from '../src/core/input.js';
import { Guard, GUARD_STUN_TICKS } from '../src/entities/hazards.js';

function release() {
    for (const k of Object.keys(keys)) keys[k] = false;
    Object.assign(prevKeys, keys);
}

function begin() {
    release();
    main.startRogueRun(1);
    assert.equal(state.gameState, 'PLAYING');
    assert.equal(state.currentLevelMeta.name, 'Patrol Corridor');
    assert.equal(state.rogueChamber.type, 'wave');
    assert.ok(state.guards.length >= 6);
}

function snap(x, y) {
    return {
        x, y, facingX: 1, facingY: 0, vx: 0, vy: 0,
        cloakTimer: 0, dashCooldown: 0, tossCooldown: 0, carriedPackageId: null, tick: 0
    };
}

function echoAt(x, y) {
    return { isActive: true, x, y, w: 30, h: 30, id: 0, update() {} };
}

assert.equal(GUARD_STUN_TICKS, 45);

// Campaign guards still patrol, chase on sight, and get distracted. Cloak blocks detection.
{
    const walls = state.walls;
    const doors = state.doors;
    const run = state.rogueRun;
    const meta = state.currentLevelMeta;
    state.walls = [];
    state.doors = [];
    state.rogueRun = null;
    state.currentLevelMeta = { isRogue: false };
    try {
        const patrol = new Guard([{ x: 200, y: 200 }, { x: 400, y: 200 }]);
        const north = { x: 200, y: 100, w: 30, h: 30, cloakTimer: 0 };
        patrol.update(north, []);
        assert.equal(patrol.state, 'patrol', 'player outside the cone is not hunted');
        assert.ok(patrol.x > 200, 'patrol steps toward the next waypoint');

        const chase = new Guard([{ x: 200, y: 200 }, { x: 400, y: 200 }]);
        const south = { x: 200, y: 210, w: 30, h: 30, cloakTimer: 0 };
        assert.equal(chase.update(south, []), 'Caught by Guard!');
        assert.equal(chase.state, 'chase');

        const cloaked = new Guard([{ x: 200, y: 200 }, { x: 400, y: 200 }]);
        const hidden = { x: 200, y: 230, w: 30, h: 30, cloakTimer: 120 };
        assert.equal(cloaked.update(hidden, []), null);
        assert.equal(cloaked.state, 'patrol', 'cloak still breaks campaign detection');

        const distracted = new Guard([{ x: 200, y: 200 }, { x: 400, y: 200 }]);
        const ghost = { isActive: true, x: 200, y: 250, w: 30, h: 30 };
        const x0 = distracted.x;
        distracted.update(north, [ghost]);
        assert.equal(distracted.state, 'distracted');
        assert.equal(distracted.x, x0, 'a distracting echo still freezes the patrol');

        state.rogueRun = { active: true };
        const floorGuard = new Guard([{ x: 200, y: 200 }, { x: 400, y: 200 }]);
        floorGuard.update(north, []);
        assert.equal(floorGuard.state, 'patrol', 'a zone-clear floor is not a rogue combat room');

        state.currentLevelMeta = { isRogue: true };
        const hunter = new Guard([{ x: 200, y: 200 }, { x: 400, y: 200 }]);
        const hid = { x: 200, y: 100, w: 30, h: 30, cloakTimer: 120 };
        hunter.update(hid, [ghost]);
        assert.equal(hunter.state, 'chase', 'rogue guards hunt through cloak and echoes');
        assert.ok(hunter.y < 200, 'hunt steps toward the player, not the waypoint');
        assert.equal(hunter.stunTicks, 0);
        assert.equal(hunter.dead, false);

        const stunned = new Guard([{ x: 200, y: 200 }, { x: 280, y: 200 }]);
        stunned.stunTicks = 3;
        stunned.x = hid.x;
        stunned.y = hid.y;
        assert.equal(stunned.update(hid, []), null);
        assert.equal(stunned.stunTicks, 2);
        assert.equal(stunned.x, hid.x, 'a stunned guard does not move or catch');

        const corpse = new Guard([{ x: 200, y: 200 }, { x: 280, y: 200 }]);
        corpse.dead = true;
        corpse.x = hid.x;
        corpse.y = hid.y;
        assert.equal(corpse.update(hid, []), null);
        assert.equal(corpse.x, hid.x);
    } finally {
        state.walls = walls;
        state.doors = doors;
        state.rogueRun = run;
        state.currentLevelMeta = meta;
    }
}

// A live rogue room: cloaked courier, every guard still closes in.
{
    begin();
    state.player.cloakTimer = 120;
    const before = state.guards.map(g => g.x);
    main.stepSimulation();
    assert.equal(state.failTimer, 0);
    state.guards.forEach((g, i) => {
        assert.equal(g.state, 'chase');
        assert.ok(g.x < before[i], 'guard closes on the courier');
        assert.equal(g.dead, false);
    });
}

// Dash through a guard stuns it. The same dash outside a rogue run does not.
{
    begin();
    const g = new Guard([{ x: 460, y: 300 }, { x: 640, y: 300 }]);
    state.guards = [g];
    state.player.x = 400;
    state.player.y = 300;
    state.player.dashCooldown = 0;
    keys.d = true;
    keys.shift = true;
    prevKeys.shift = false;
    main.stepSimulation();
    assert.equal(state.failTimer, 0);
    assert.equal(state.gameState, 'PLAYING');
    assert.equal(g.dead, false);
    assert.equal(g.stunTicks, GUARD_STUN_TICKS - 1);
    assert.equal(g.x, 460, 'stun cancels the chase step');
    assert.ok(state.player.x > 460, 'dash crossed the guard');
}

{
    begin();
    state.rogueRun.active = false;
    const g = new Guard([{ x: 460, y: 300 }, { x: 640, y: 300 }]);
    state.guards = [g];
    state.player.x = 400;
    state.player.y = 300;
    state.player.dashCooldown = 0;
    keys.d = true;
    keys.shift = true;
    prevKeys.shift = false;
    main.stepSimulation();
    assert.equal(g.stunTicks, 0);
    assert.equal(g.dead, false);
    assert.equal(state.failTimer, 0);
}

// Blink stuns guards overlapping the courier at the start of the snap and at the landing.
{
    begin();
    const from = new Guard([{ x: 120, y: 300 }, { x: 200, y: 300 }]);
    const to = new Guard([{ x: 500, y: 300 }, { x: 620, y: 300 }]);
    state.guards = [from, to];
    state.player.x = 120;
    state.player.y = 300;
    state.sand.history.length = 0;
    for (let i = 0; i < 30; i++) state.sand.history.push(snap(500, 300));
    keys.b = true;
    prevKeys.b = false;
    main.stepSimulation();
    assert.equal(state.player.x, 500);
    assert.equal(from.stunTicks, GUARD_STUN_TICKS - 1, 'shock at the blink start');
    assert.equal(to.stunTicks, GUARD_STUN_TICKS - 1, 'shock where the courier lands');
    assert.equal(from.dead, false);
    assert.equal(to.dead, false);
    assert.equal(state.failTimer, 0);
    assert.equal(state.gameState, 'PLAYING');
}

// An active echo stuns on the first overlap and kills on the next.
{
    begin();
    const g = new Guard([{ x: 400, y: 300 }, { x: 560, y: 300 }]);
    state.guards = [g];
    state.player.x = 48;
    state.player.y = 270;
    state.activeGhosts = [echoAt(g.x + 80, g.y)];
    main.stepSimulation();
    assert.equal(g.stunTicks, 0, 'a miss does not stun');
    assert.equal(g.dead, false);

    state.activeGhosts = [echoAt(g.x, g.y)];
    release();
    main.stepSimulation();
    assert.equal(g.dead, false);
    assert.equal(g.stunTicks, GUARD_STUN_TICKS - 1);
    assert.equal(state.rogueChamber.enemiesLeft, 1);
    main.stepSimulation();
    assert.equal(g.dead, true);
    assert.equal(state.rogueChamber.enemiesLeft, 0, 'a dead guard is not left in the wave');
    assert.equal(state.rogueChamber.type, 'rift', 'the cleared wave opens the exit rift');
    assert.equal(state.rogueChamber.aspectPending, false, 'the player must still enter the rift');
    state.player.x = state.deliveryZone.x;
    state.player.y = state.deliveryZone.y;
    release();
    main.stepSimulation();
    assert.equal(state.rogueChamber.aspectPending, true);
}

// Dash-stun, then one echo touch, kills. A dead guard on the player does not catch.
{
    begin();
    const g = new Guard([{ x: 460, y: 300 }, { x: 640, y: 300 }]);
    state.guards = [g];
    state.player.x = 400;
    state.player.y = 300;
    state.player.dashCooldown = 0;
    state.sand.sand = 0;
    keys.d = true;
    keys.shift = true;
    prevKeys.shift = false;
    main.stepSimulation();
    assert.equal(g.dead, false);
    assert.ok(g.stunTicks > 0);
    release();
    state.activeGhosts = [echoAt(g.x, g.y)];
    main.stepSimulation();
    assert.equal(g.dead, true);
    assert.equal(state.failTimer, 0);

    begin();
    const corpse = state.guards[0];
    state.guards = [corpse];
    corpse.dead = true;
    corpse.x = state.player.x;
    corpse.y = state.player.y;
    state.sand.sand = 0;
    main.stepSimulation();
    assert.equal(state.failTimer, 0, 'a dead guard does not catch');
    assert.equal(state.gameState, 'PLAYING');
}

console.log('rogueCombat ok');
