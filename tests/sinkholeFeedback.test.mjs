// Sinkhole feedback (PR #55): one locked target, broken tiles, spawn-tie lure,
// plate feedback, boss HUD, editor hint notice, crack-edge warning, deaths not recorded.
// Run: node tests/sinkholeFeedback.test.mjs
import assert from 'node:assert/strict';
import { main, state, keys, LEVELS } from './harness/replay.mjs';

const { Burrower } = await import('../src/entities/bosses/Burrower.js');
const { CrackedFloor } = await import('../src/entities/hazards.js');
const { PressurePlate, PRESS_FLASH_TICKS } = await import('../src/entities/interactables.js');
const { burrowerHud, crackEdgeWarning, DOOR_OPEN_GOAL } = await import('../src/core/bossHud.js');
const editor = await import('../src/ui/editor.js');

let failures = 0;
function check(name, fn) {
    try { fn(); console.log(`  ok  ${name}`); }
    catch (err) { failures++; console.log(`  FAIL ${name}\n       ${err.stack || err.message}`); }
}
function resetWorld() {
    state.bossCheckpoint = null; state.bossCheckpointLive = false; state.currentTick = 0;
    state.packages = []; state.doors = []; state.plates = []; state.cracks = []; state.burrowers = [];
}
const inside = (pt, t) => pt.x >= t.x && pt.x <= t.x + t.w && pt.y >= t.y && pt.y <= t.y + t.h;
const same = (a, b) => a && b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

check('item 1: arrow, ring, countdown and core plate name one locked tile from lock to surface, while the lure walks away', () => {
    resetWorld();
    state.plates = [new PressurePlate('c1', 40, 0, []), new PressurePlate('c2', 440, 0, [])];
    state.cracks = [new CrackedFloor(0, 0, 40, 40, 'fast'), new CrackedFloor(400, 0, 40, 40, 'fast')];
    const boss = new Burrower(100, 100, { surfaceInterval: 1, telegraphTime: 0.5, corePlateIds: ['c1', 'c2'] });
    state.burrowers = [boss];
    // The lure is an echo: its step onto the left crack is the noise, so the lock
    // goes to a crack (a courier lure would draw a strike on their own tile).
    const player = { x: 5, y: 5, w: 30, h: 30, id: 0, runData: [], isActive: true };
    let locked = null;
    let struck = false;
    for (let t = 0; t < 200 && !struck; t++) {
        // The lure walks from the left crack toward the right one during the countdown.
        player.x = Math.min(405, 5 + t * 4);
        boss.update([player]);
        if (state.cracks[0].collapsing) { struck = true; break; }
        const ui = boss.getUiState();
        if (ui.phase === 'burrow' || ui.phase === 'telegraph') {
            assert.ok(ui.targetTile, `tick ${t}: no target tile`);
            locked = locked || ui.targetTile;
            assert.ok(same(ui.targetTile, locked), `tick ${t}: target moved`);
            assert.ok(same(ui.ringTile, locked) && same(ui.countdownTile, locked), `tick ${t}: ring/countdown diverge`);
            assert.ok(inside(ui.arrowTo, locked), `tick ${t}: arrow ends off the tile`);
            assert.equal(ui.highlightPlateId, 'c1', `tick ${t}: wrong plate highlighted`);
        }
        if (state.cracks[0].collapsing) struck = true;
    }
    assert.ok(struck, 'locked tile surfaced');
    assert.equal(state.cracks[1].collapsing, false, 'the tile the lure walked to was not struck');
});

check('F5: a locked tile that breaks is never struck again; the mark moves to an intact crack', () => {
    resetWorld();
    state.cracks = [new CrackedFloor(0, 0, 40, 40, 'fast'), new CrackedFloor(200, 0, 40, 40, 'fast')];
    const boss = new Burrower(100, 100, { surfaceInterval: 0.5, telegraphTime: 0.25 });
    let starts = 0;
    for (const c of state.cracks) { const orig = c.startCollapse.bind(c); c.startCollapse = () => { if (c.broken || c.collapsing) throw new Error('struck a broken tile'); starts++; return orig(); }; }
    const actor = { x: 5, y: 5, w: 30, h: 30, id: 0, runData: [], isActive: true };
    boss.update([actor]);
    assert.ok(same(boss.getUiState().targetTile, state.cracks[0]));
    state.cracks[0].broken = true;
    for (let i = 0; i < 120; i++) {
        boss.update([actor]);
        const ui = boss.getUiState();
        if (ui.targetTile) assert.ok(!same(ui.targetTile, state.cracks[0]), 'marked a broken tile');
    }
    assert.ok(starts >= 1, 'it kept surfacing on the intact crack');
});

// F6 is superseded by 'Loudest wins' (the lowest-echo-id first-strike rule is gone):
// with no noise yet the live courier is hunted, even with an echo stacked on spawn.
check('F6 (Loudest wins): no noise yet means the live courier is hunted from the first lock', () => {
    resetWorld();
    state.cracks = [new CrackedFloor(0, 0, 40, 40, 'fast'), new CrackedFloor(400, 400, 40, 40, 'fast')];
    const boss = new Burrower(380, 380, { surfaceInterval: 3, telegraphTime: 1 });
    const player = { x: 200, y: 200, w: 30, h: 30 };
    const echo = { id: 0, runData: [], x: 200, y: 200, w: 30, h: 30, isActive: true };
    boss.update([player, echo]);
    const ui = boss.getUiState();
    assert.equal(ui.targetKind, 'player');
    assert.equal(ui.huntLabel, 'hunting YOU (no noise yet)');
    assert.ok(ui.targetTile, 'locked on the first update');
});

check('F1: a press plays the chime, flashes, and draws the pad pressed in', () => {
    resetWorld();
    const plate = new PressurePlate('p', 0, 0, []);
    plate.update([{ x: 5, y: 5, w: 30, h: 30 }], []);
    const vis = plate.pressVisual();
    assert.equal(vis.pressed, true);
    assert.ok(vis.insetPx > 0, 'pressed-in inset');
    assert.ok(vis.glowBlur > 12 && vis.flash, 'burst glow on the press');
    for (let i = 0; i < PRESS_FLASH_TICKS + 1; i++) plate.update([{ x: 5, y: 5, w: 30, h: 30 }], []);
    assert.equal(plate.pressVisual().flash, false);
    assert.equal(plate.pressVisual().glowBlur, 12, 'steady glow while held');
});

check('F2: boss HUD counts stuns and door progress, then shows the delivery goal', () => {
    assert.equal(burrowerHud({ maxHp: 3, hp: 3 }).progress, 'Stuns 0/3 · Door 0%');
    assert.equal(burrowerHud({ maxHp: 3, hp: 2 }).progress, 'Stuns 1/3 · Door 33%');
    const open = burrowerHud({ maxHp: 3, hp: 0, defeated: true });
    assert.equal(open.progress, 'Stuns 3/3 · Door OPEN');
    assert.equal(open.goal, DOOR_OPEN_GOAL);
    assert.match(DOOR_OPEN_GOAL, /green pad/);
    assert.match(DOOR_OPEN_GOAL, /SPACE/);
    assert.equal(burrowerHud({ maxHp: 3, hp: 0, defeated: true }, { delivered: true }).goal, null);
});

check('F4: an edited hint line is flagged unsaved until Save', () => {
    const sink = LEVELS.find(l => String(l.name).startsWith('W2-MB'));
    editor.setEditorLevelMetaFromLevel(sink);
    assert.equal(editor.editorHintUnsaved(), false);
    editor.commitEditorHintLine('New hint');
    assert.equal(editor.editorHintUnsaved(), true);
    editor.markEditorHintSaved('New hint');
    assert.equal(editor.editorHintUnsaved(), false);
    assert.match(editor.HINT_UNSAVED_NOTICE, /press Save/);
});

check('F7: standing on a plate with the body over an intact crack raises the step warning', () => {
    resetWorld();
    const plate = new PressurePlate('c3', 480, 280, []);
    const crack = new CrackedFloor(520, 280, 40, 40, 'fast');
    const onEdge = { x: 495, y: 285, w: 30, h: 30 };
    assert.equal(crackEdgeWarning(onEdge, [plate], [crack]).length, 1);
    assert.equal(crackEdgeWarning({ x: 485, y: 285, w: 30, h: 30 }, [plate], [crack]).length, 0);
    assert.equal(crackEdgeWarning({ x: 600, y: 285, w: 30, h: 30 }, [plate], [crack]).length, 0, 'off plate: no warning');
});

check('F8: a run that ends in a death is not kept as an echo and does not advance the loop', () => {
    const idx = LEVELS.findIndex(l => String(l.name).startsWith('W2-L2'));
    main.startGame(idx);
    for (let g = 0; g < 10 && state.gameState !== 'PLAYING'; g++) { keys.enter = true; main.stepSimulation(); keys.enter = false; main.stepSimulation(); }
    assert.equal(state.gameState, 'PLAYING');
    for (let i = 0; i < 30; i++) main.stepSimulation();
    main.resetRun();
    assert.equal(state.pastRuns.length, 1);
    assert.equal(state.loopNumber, 2);
    for (let i = 0; i < 30; i++) main.stepSimulation();
    main.levelFailed('test death');
    for (let i = 0; i < 400 && state.failTimer > 0; i++) main.stepSimulation();
    assert.equal(state.failTimer, 0);
    assert.equal(state.pastRuns.length, 1, 'death not recorded');
    assert.equal(state.loopNumber, 2, 'loop number unchanged');
});

if (failures) { console.log(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nall sinkhole feedback checks passed');
