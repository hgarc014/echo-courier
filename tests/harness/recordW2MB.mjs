// Scripted 'Loudest wins' Sinkhole (W2-MB) solution. Drives the real sim and writes
// tests/solutions/w2-mb.json via the same exporter as the in-game dev export.
// Usage: node tests/harness/recordW2MB.mjs [out.json]
//
// Each stun spends the lit core plate and lights the next (c3, then c2, then c1),
// so every stun needs its own stamp, recorded in the loop before. Par 4, 3 echoes:
//   Loop 1  stamp c3's north crack ~20 ticks before the 481 strike (echo 1).
//   Loop 2  hold c3 -> stun 1. Then go up the east side and stamp c2's south crack
//           just before the 720 strike (echo 2).
//   Loop 3  hold c2 through 720 -> stun 2. Then cross to c1 and stamp its south
//           crack just before the 1200 strike (echo 3).
//   Loop 4  grab the parcel, hold c1 through 1200 -> stun 3, door opens; deliver.
// Waiting spots step aside whenever a player-mode strike is locked on the courier.
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { main, state, keys, loadLevel, LEVELS } from './replay.mjs';

const idx = LEVELS.findIndex(l => l.name === 'W2-MB: Sinkhole');
function tick(dir = {}, extra = []) {
  for (const k of ['w','a','s','d','space','r','shift','f','c']) keys[k] = false;
  if (dir.x > 0) keys.d = true; if (dir.x < 0) keys.a = true; if (dir.y > 0) keys.s = true; if (dir.y < 0) keys.w = true;
  for (const k of extra) keys[k] = true;
  main.stepSimulation();
  if (state.failMessage) throw new Error(`failed: ${state.failMessage} at ${Math.round(state.player.x)},${Math.round(state.player.y)} tick ${state.currentTick} loop ${state.pastRuns.length + 1}`);
}
export function moveTo(x, y, tol = 2, max = 900) {
  for (let i = 0; i < max; i++) { if (state.gameState === 'LEVEL_COMPLETE') return;
    const dx = x - state.player.x, dy = y - state.player.y; if (Math.abs(dx) <= tol && Math.abs(dy) <= tol) return;
    const sx = Math.abs(dx) > tol ? Math.sign(dx) : 0; const sy = sx === 0 && Math.abs(dy) > tol ? Math.sign(dy) : 0; tick({ x: sx, y: sy }); }
  throw new Error(`moveTo(${x},${y}) stuck at ${Math.round(state.player.x)},${Math.round(state.player.y)} tick ${state.currentTick}`);
}
export function waitUntilTick(t) { while (state.currentTick < t) tick(); }
export function pressR() { tick({}, ['r']); for (let i = 0; i < 40 && state.rewindFreeze > 0; i++) tick(); }
export const hp = () => state.burrowers[0].hp;
export function loop1() {
  loadLevel({ level: idx });
  moveTo(445, 450); waitUntilTick(180); moveTo(445, 215); waitUntilTick(452); moveTo(470, 215); moveTo(470, 232); waitUntilTick(486); moveTo(470, 215); moveTo(445, 215); waitUntilTick(510);
  pressR();
}
export function holdC3() { moveTo(530, 450); waitUntilTick(230); moveTo(485, 450); moveTo(485, 285); waitUntilTick(490); }
// After a stun: go east of the plate column, then wait east of a target crack and stamp it.
export function stampC2(T) { moveTo(525, 285); moveTo(525, 105); waitUntilTick(T); moveTo(490, 105); waitUntilTick(T + 60); moveTo(525,105); }
export function holdC2(A, hold=120) { waitDodge(150,[560,450],[560,450]); moveTo(560,450); waitUntilTick(185); moveTo(525, 285); moveTo(525, 65); waitDodge(A,[525,65],[570,65]); moveTo(485, 65); waitUntilTick(A + hold); }
// Wait until tick t, but step between two spots so a player-mode strike never
// lands on the tile under the courier.
export function waitDodge(t, a, b2) {
  let at = a;
  while (state.currentTick < t) {
    const bw = state.burrowers[0];
    const tile = bw.lockedTile;
    const c = { x: state.player.x + 15, y: state.player.y + 15 };
    if (bw.phase === 'telegraph' && bw.playerMode && tile && c.x >= tile.x - 4 && c.x < tile.x + tile.w + 4 && c.y >= tile.y - 4 && c.y < tile.y + tile.h + 4) {
      at = at === a ? b2 : a; moveTo(at[0], at[1]); continue;
    }
    tick();
  }
}
export function loop2() { holdC3(); stampC2(690); waitUntilTick(770); pressR(); }
export function stampC1(T) { moveTo(525, 65); moveTo(525, 180); moveTo(125, 180); moveTo(125, 125); waitDodge(T, [125,125],[125,180]); moveTo(85, 125); waitUntilTick(T + 60); moveTo(125, 125); }
export function holdC1(A, hold) { moveTo(240, 470); moveTo(335, 455); tick({}, ['space']); tick();
  if (!state.packages.some(p => p.carriedBy === 'player')) throw new Error('grab failed');
  moveTo(125, 455); moveTo(125, 180); waitDodge(A, [125,180],[125,230]); moveTo(125,85); moveTo(85, 85); waitUntilTick(A + hold); }
export function solve() {
    const gs = full();
    if (gs !== 'LEVEL_COMPLETE') throw new Error('not delivered: ' + gs);
    return JSON.parse(main.exportSolution());
}
export function full() {
  loop1(); loop2(); holdC2(630, 160); if (hp() !== 1) throw new Error('no stun2');
  stampC1(1170); waitUntilTick(1250); pressR(); holdC1(1110, 130);
  if (hp() !== 0) throw new Error('no stun3');
  moveTo(125, 85); moveTo(125, 470); const z = state.deliveryZone; moveTo(z.x + 20, 470);
  tick({}, ['space']); for (let i = 0; i < 10 && state.gameState !== 'LEVEL_COMPLETE'; i++) tick();
  return state.gameState;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const sol = solve();
    const text = JSON.stringify(sol, null, 1).replace(/\[\n\s+"([^"]*)",\n\s+(\d+)\n\s+\]/g, '["$1", $2]') + '\n';
    const out = process.argv[2] || new URL('../solutions/w2-mb.json', import.meta.url).pathname;
    writeFileSync(out, text);
    console.error(`recorded ${sol.levelName}: ${sol.loops.length} loops, completed in ${sol.completedLoops}`);
}
