// XR-9 rework (W5 boss): echo targeting, back-only damage, long telegraphs that stop
// at walls, phase checkpoints, in-world label, and editor/save/JSON round-trip.
// Run: node tests/xr9.test.mjs
import assert from 'node:assert/strict';
import { installDomStubs } from './harness/domStub.mjs';

installDomStubs();

const { state } = await import('../src/core/state.js');
const { serializeLevel, deserializeLevel } = await import('../src/data/levels.js');
const { ShooterRobot, ROBOT_XR9_DEFAULTS, normalizeRobotParams, wallRayDistance } = await import('../src/entities/hazards.js');
const { applyRobotConfig } = await import('../src/ui/editorInspector.js');

let failures = 0;
function check(name, fn) {
    try { fn(); console.log(`  ok  ${name}`); }
    catch (err) { failures++; console.log(`  FAIL ${name}\n       ${err.stack || err.message}`); }
}
function reset() {
    state.walls = []; state.doors = []; state.projectiles = []; state.packages = [];
    state.bossCheckpoint = null; state.bossCheckpointLive = false; state.currentTick = 0;
}
const player = (x, y) => ({ x, y, w: 30, h: 30, cloakTimer: 0 });
const ghost = (id, x, y) => ({ id, x, y, w: 30, h: 30, isActive: true, cloakActive: false });
const XR9 = { id: 'xr9', label: 'XR-9', targetEchoes: true, backArc: Math.PI / 3, backTouch: true, telegraphTime: 1.5, checkpoint: true, defeatDoorId: 'boss_door' };
function xr9(x = 400, y = 300) {
    const r = new ShooterRobot([{ x, y }]);
    r.configure(XR9);
    return r;
}

check('legacy robot keeps old defaults and serializes no new keys', () => {
    reset();
    const r = new ShooterRobot([{ x: 10, y: 10 }, { x: 50, y: 10 }]);
    for (const [k, v] of Object.entries(ROBOT_XR9_DEFAULTS)) assert.equal(r[k], v, k);
    assert.equal(r.isBehind(0, 0), true, 'no back arc = hit from any side');
    const json = serializeLevel({ player: { x: 0, y: 0, w: 30, h: 30 }, deliveryZone: { x: 0, y: 0, w: 10, h: 10 }, robots: [r] });
    assert.deepEqual(Object.keys(json.robots[0]).sort(), ['path']);
});

check('targets the nearest active echo over a visible courier', () => {
    reset();
    const r = xr9();
    const near = ghost(0, 500, 300); const far = ghost(1, 100, 300);
    assert.equal(r._pickTarget(player(420, 360), [far, near]), near);
    near.isActive = false;
    assert.equal(r._pickTarget(player(420, 360), [far, near]), far);
    far.isActive = false;
    const p = player(420, 360);
    assert.equal(r._pickTarget(p, [far, near]), p, 'courier only when no echo is in sight');
});

check('damage only from behind (±backArc around the back)', () => {
    reset();
    const r = xr9();
    r.facingAngle = 0; // facing east; back is west
    const c = r.center();
    assert.equal(r.isBehind(c.x - 60, c.y), true);
    assert.equal(r.isBehind(c.x - 60, c.y + 30), true, 'inside 60°');
    assert.equal(r.isBehind(c.x + 60, c.y), false, 'front');
    assert.equal(r.isBehind(c.x, c.y + 60), false, 'side (90°) is not the back');
});

check('back panel touch hits; front touch does not', () => {
    reset();
    const r = xr9();
    r.facingAngle = 0;
    state.doors = [{ id: 'boss_door', isOpen: false }];
    r.update(player(r.x + 30, r.y), [], []);
    assert.equal(r.hp, 3, 'front touch is not a hit');
    r.facingAngle = 0;
    r.update(player(r.x - 28, r.y), [], []);
    assert.equal(r.hp, 2, 'back touch is a hit');
    assert.ok(r.hitFlicker > 0, 'hit stun prevents repeat hits');
    r.update(player(r.x - 28, r.y), [], []);
    assert.equal(r.hp, 2);
});

check('telegraph is 1.5s of locked aim, and the shot follows the warned lane', () => {
    reset();
    const r = xr9();
    assert.equal(r.telegraphTicks(), 90);
    const g = ghost(0, 600, 300 - 2);
    r.fireCooldown = 0;
    r.update(player(-500, -500), [g], []);
    assert.equal(r.windingUp, true);
    const aim = r.facingAngle;
    let shots = 0; let ticks = 0;
    g.y = 100; // echo moves away; locked aim must not track it
    while (!state.projectiles.length && ticks < 200) { r.update(player(-500, -500), [g], []); ticks++; }
    shots = state.projectiles.length;
    assert.equal(shots, 1);
    assert.ok(ticks >= 88 && ticks <= 92, `fired after ${ticks} ticks`);
    const shot = state.projectiles[0];
    assert.ok(Math.abs(Math.atan2(shot.vy, shot.vx) - aim) < 1e-6, 'shot uses the telegraphed aim');
    assert.ok(normalizeRobotParams({ telegraphTime: 2 }).telegraphTime === 2);
});

check('telegraph lane stops at walls', () => {
    reset();
    state.walls = [{ x: 500, y: 0, w: 20, h: 600 }];
    const d = wallRayDistance(400, 300, 0, 320);
    assert.ok(d >= 96 && d <= 104, `lane length ${d}`);
    assert.equal(wallRayDistance(400, 300, Math.PI, 320), 320);
});

check('phase checkpoint: hp survives a rewind rebuild', () => {
    reset();
    const r = xr9();
    r.takeHit();
    assert.deepEqual(state.bossCheckpoint.xr9, { hp: 2 });
    state.bossCheckpointLive = true;
    const json = serializeLevel({ player: { x: 0, y: 0, w: 30, h: 30 }, deliveryZone: { x: 0, y: 0, w: 10, h: 10 }, robots: [xr9()] });
    const again = deserializeLevel(json);
    assert.equal(again.robots[0].hp, 2);
    state.bossCheckpointLive = false;
    assert.equal(deserializeLevel(json).robots[0].hp, 3, 'fresh load ignores the checkpoint');
});

check('every XR-9 param round-trips through inspector, save and JSON', () => {
    reset();
    const r = new ShooterRobot([{ x: 100, y: 100 }, { x: 200, y: 100 }]);
    applyRobotConfig(r, { id: 'boss', label: 'XR-9 Mk2', targetEchoes: true, backArc: '0.9', backTouch: true, telegraphTime: '1.75', checkpoint: true, defeatDoorId: 'exit' });
    assert.equal(r.backArc, 0.9); assert.equal(r.telegraphTime, 1.75);
    const json = JSON.parse(JSON.stringify(serializeLevel({ player: { x: 0, y: 0, w: 30, h: 30 }, deliveryZone: { x: 0, y: 0, w: 10, h: 10 }, robots: [r] })));
    const back = deserializeLevel(json).robots[0];
    for (const k of Object.keys(ROBOT_XR9_DEFAULTS)) assert.deepEqual(back[k], r[k], k);
    applyRobotConfig(back, { backArc: '', telegraphTime: '' });
    assert.equal(back.backArc, null); assert.equal(back.telegraphTime, null);
});

if (failures) { console.log(`${failures} XR-9 check(s) failed`); process.exit(1); }
console.log('all XR-9 checks passed');
