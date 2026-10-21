// Authoring script: drives Level 1 with a scripted controller (same steps as LEVEL1_DEMO)
// through the real sim while the in-game recorder captures frames, then prints solution JSON.
// Usage: node tests/harness/recordLevel1.mjs tests/solutions/level01.json
import { writeFileSync } from 'node:fs';
import { main, state, keys, loadLevel } from './replay.mjs';

loadLevel({ level: 0 });
function tick(dir = {}, extra = []) {
    for (const k of ['w', 'a', 's', 'd', 'space', 'r']) keys[k] = false;
    if (dir.x > 0) keys.d = true; if (dir.x < 0) keys.a = true;
    if (dir.y > 0) keys.s = true; if (dir.y < 0) keys.w = true;
    for (const k of extra) keys[k] = true;
    main.stepSimulation();
}
function moveTo(x, y, tol, max = 600) {
    for (let i = 0; i < max; i++) {
        const dx = x - state.player.x, dy = y - state.player.y;
        if (Math.abs(dx) <= tol && Math.abs(dy) <= tol) return;
        tick({ x: Math.abs(dx) > tol ? Math.sign(dx) : 0, y: Math.abs(dy) > tol ? Math.sign(dy) : 0 });
    }
    throw new Error(`moveTo(${x},${y}) timed out at ${state.player.x},${state.player.y}`);
}
const wait = n => { for (let i = 0; i < n; i++) tick(); };

moveTo(305, 255, 4); wait(20);
tick({}, ['r']); tick();
for (let i = 0; i < 240 && !state.doors.find(d => d.id === 'd1')?.isOpen; i++) tick();
moveTo(520, 250, 8);
moveTo(585, 265, 8);
tick({}, ['space']); tick();
moveTo(80, 250, 10);
tick({}, ['space']); wait(5);
if (state.gameState !== 'LEVEL_COMPLETE') throw new Error('scripted run did not complete level 1: ' + state.gameState);
const sol = JSON.parse(main.exportSolution());
const out = process.argv[2];
const text = JSON.stringify(sol, null, 1).replace(/\[\n\s+"([^"]*)",\n\s+(\d+)\n\s+\]/g, '["$1", $2]') + '\n';
if (out) writeFileSync(out, text); else process.stdout.write(text);
console.error(`recorded ${sol.loops.length} loops, completed in ${sol.completedLoops}`);
