// Rogue Run blink (key b; f is toss) and E-release sand-echo glue.
// Run: node tests/rogueBlink.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { main, state, keys } from './harness/replay.mjs';
import { prevKeys } from '../src/core/input.js';
import { BLINK_COST, BLINK_FRAMES, BLINK_IFRAMES } from '../src/systems/sandRewind.js';
import { MIN_ECHO_SEGMENT } from '../src/systems/sandEcho.js';

function release() {
    for (const k of Object.keys(keys)) keys[k] = false;
}

function warmup(steps = 40) {
    release();
    main.startRogueRun(1);
    state.guards = [];
    for (let i = 0; i < steps; i++) main.stepSimulation();
    assert.equal(state.gameState, 'PLAYING');
    assert.equal(state.failTimer, 0);
}

const mainSrc = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
assert.match(mainSrc, /isKeyJustPressed\('f'\)/, 'toss keeps f');
assert.match(mainSrc, /isKeyJustPressed\('b'\)/);
assert.match(mainSrc, /commitSandEcho\(/);
assert.match(mainSrc, /Math\.max\(rogueStartSand\(meta\),\s*BLINK_COST\s*\+\s*0\.1\)/);

// A fresh run can pay for a blink before any shop upgrade.
{
    release();
    main.startRogueRun(1);
    assert.ok(state.sand.sand >= BLINK_COST, 'start sand covers a blink');
    assert.ok(state.sand.sand >= BLINK_COST + 0.1);
}

// Blink snaps, spends sand, grants iframes. Next tick decrements. Death is skipped until they expire.
{
    release();
    main.startRogueRun(1);
    state.guards = [];
    const p = state.player;
    const y = p.y;
    state.sand.history.length = 0;
    for (let i = 0; i < 30; i++) {
        state.sand.history.push({ x: i, y, facingX: 1, facingY: 0, vx: 0, vy: 0, cloakTimer: 0, dashCooldown: 0, tossCooldown: 0, carriedPackageId: null, tick: i });
    }
    p.x = 400;
    const sandBefore = state.sand.sand;
    keys.b = true;
    prevKeys.b = false;
    main.stepSimulation();
    keys.b = false;
    assert.equal(state.gameState, 'PLAYING');
    assert.equal(p.x, 7, 'oldest of the 24 popped frames (30 recorded + the tick push)');
    assert.equal(state.sand.history.length, 7);
    assert.ok(Math.abs(state.sand.sand - (sandBefore - BLINK_COST)) < 1e-9);
    assert.equal(p.invulnTicks, BLINK_IFRAMES);
    main.stepSimulation();
    assert.equal(p.invulnTicks, BLINK_IFRAMES - 1);
    const x = p.x;
    const sand = state.sand.sand;
    main.levelFailed('Caught by Guard!');
    assert.equal(state.failTimer, 0);
    assert.equal(state.gameState, 'PLAYING');
    assert.equal(p.x, x);
    assert.equal(state.sand.sand, sand);
    p.invulnTicks = 0;
    main.levelFailed('Fragile Package Destroyed!');
    assert.ok(state.failTimer > 0);
    assert.equal(BLINK_FRAMES, 24);
}

// Outside an active Rogue Run, b does not blink.
{
    release();
    main.startRogueRun(1);
    state.guards = [];
    state.sand.history.push({ x: 10, y: state.player.y, facingX: 1, facingY: 0, vx: 0, vy: 0, cloakTimer: 0, dashCooldown: 0, tossCooldown: 0, carriedPackageId: null, tick: 0 });
    state.player.x = 200;
    state.rogueRun.active = false;
    keys.b = true;
    prevKeys.b = false;
    main.stepSimulation();
    assert.equal(state.player.x, 200);
    assert.equal(state.player.invulnTicks, 0);
}

// E release commits an echo only when the hold lasted >= MIN_ECHO_SEGMENT.
{
    warmup();
    assert.equal(state.pastRuns.length, 0);
    keys.e = true;
    for (let i = 0; i < MIN_ECHO_SEGMENT - 1; i++) main.stepSimulation();
    keys.e = false;
    main.stepSimulation();
    assert.equal(state.pastRuns.length, 0, 'short tap must not spawn a ghost');

    warmup();
    keys.e = true;
    for (let i = 0; i < MIN_ECHO_SEGMENT; i++) main.stepSimulation();
    assert.equal(state.sandRewinding, true);
    keys.e = false;
    main.stepSimulation();
    assert.equal(state.pastRuns.length, 1, 'E release commits the sand echo');
    assert.equal(state.sandRewinding, false);
}

console.log('rogueBlink ok');
