// W5-BOSS: the recorded par route must clear XR-9's perimeter sweep by a human margin:
// whenever the courier is within 12px of any sweep lane, the nearest sweep fire is at
// least 15 ticks away. Run: node tests/xr9SweepMargins.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadLevel, main, state, keys } from './harness/replay.mjs';

const MIN_PX = 12;
const MIN_TICKS = 15;
const ACTIVE = 8; // fire ticks per sweep (SWEEP_ACTIVE_TICKS)
const sol = JSON.parse(readFileSync(new URL('./solutions/w5-boss.json', import.meta.url), 'utf8'));

function gap(p, l) {
    const dx = Math.max(l.x - (p.x + p.w), p.x - (l.x + l.w), 0);
    const dy = Math.max(l.y - (p.y + p.h), p.y - (l.y + l.h), 0);
    return Math.max(dx, dy);
}
/** Ticks from `tick` to the nearest fire window [k*period, k*period + ACTIVE). */
function ticksToFire(tick, period) {
    let best = Infinity;
    for (let k = 1; k * period <= tick + period; k++) {
        const a = k * period; const b = a + ACTIVE - 1;
        best = Math.min(best, tick < a ? a - tick : tick > b ? tick - b : 0);
    }
    return best;
}

loadLevel(sol);
let minPxAtFire = Infinity; let minTicksWhenClose = Infinity; let fires = 0; let worst = null;
for (const loop of sol.loops) {
    for (const [frameKey, count] of loop) {
        for (let i = 0; i < count; i++) {
            if (state.gameState === 'LEVEL_COMPLETE') break;
            const on = new Set(frameKey ? frameKey.split('+') : []);
            for (const k of Object.keys(keys)) keys[k] = on.has(k);
            main.stepSimulation();
            const r = state.robots[0];
            if (!r || r.hp <= 0 || !r.sweepPeriodTicks() || r.sweepTick <= 0) continue;
            const g = Math.min(...r.sweepLanes().map(l => gap(state.player, l)));
            const t = ticksToFire(r.sweepTick, r.sweepPeriodTicks());
            if (t === 0) { fires++; minPxAtFire = Math.min(minPxAtFire, g); }
            if (g < MIN_PX && t < minTicksWhenClose) { minTicksWhenClose = t; worst = { tick: r.sweepTick, g, loop: state.loopNumber }; }
        }
    }
}
assert.equal(state.gameState, 'LEVEL_COMPLETE', 'recorded route no longer completes');
console.log(`  fire ticks observed: ${fires}; min courier gap at fire: ${minPxAtFire}px`);
console.log(`  min ticks to a fire while within ${MIN_PX}px of a lane: ${minTicksWhenClose}`);
assert.ok(fires > 0, 'route never saw a sweep');
assert.ok(minPxAtFire >= MIN_PX, `courier only ${minPxAtFire}px from a lane at a fire`);
assert.ok(minTicksWhenClose >= MIN_TICKS, `near-miss ${JSON.stringify(worst)}`);
console.log('  ok  recorded W5-BOSS route clears the sweep by >=12px / >=15 ticks');
