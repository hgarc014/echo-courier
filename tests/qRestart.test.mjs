// Q restarts past story and boss-intro dialogs. Dash shows up once a level unlocks or grants it.
// Run: node tests/qRestart.test.mjs
import assert from 'node:assert/strict';
import { installDomStubs } from './harness/domStub.mjs';

installDomStubs();
const { main, state, keys, loadLevel } = await import('./harness/replay.mjs');
const { LEVELS } = await import('../src/data/levels.js');
const { getUnlockedAbilities } = await import('../src/core/state.js');

const elements = new Map();
function makeEl(id) {
    const classes = new Set();
    return {
        id,
        innerText: '',
        innerHTML: '',
        textContent: '',
        value: '',
        style: {},
        className: '',
        classList: {
            add(...xs) { for (const x of xs) classes.add(x); },
            remove(...xs) { for (const x of xs) classes.delete(x); },
            toggle(x, force) {
                const on = force === undefined ? !classes.has(x) : !!force;
                if (on) classes.add(x); else classes.delete(x);
                return on;
            },
            contains: (x) => classes.has(x)
        },
        addEventListener() {},
        removeEventListener() {},
        setAttribute() {},
        getAttribute: () => null,
        appendChild() {},
        getContext: () => new Proxy({}, { get: () => () => ({}) }),
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 })
    };
}
document.getElementById = (id) => {
    if (!elements.has(id)) elements.set(id, makeEl(id));
    return elements.get(id);
};
document.querySelector = (sel) => {
    if (sel === '.bottom-hud') return document.getElementById('bottom-hud');
    if (sel === '.top-hud') return document.getElementById('top-hud');
    return null;
};
document.querySelectorAll = () => [];

let failures = 0;
function check(name, fn) {
    try {
        fn();
        console.log(`  ok  ${name}`);
    } catch (err) {
        failures++;
        console.log(`  FAIL ${name}\n       ${err.stack || err.message}`);
    }
}

function release() {
    for (const k of Object.keys(keys)) keys[k] = false;
}

function tap(key) {
    release();
    if (key) keys[key] = true;
    main.stepSimulation();
    if (key) keys[key] = false;
    main.stepSimulation();
}

const sinkhole = LEVELS.findIndex(level => String(level.name).startsWith('W2-MB'));
const exterminator = LEVELS.findIndex(level => String(level.name).startsWith('Level 12'));

check('Q during the story skips the boss intro', () => {
    release();
    main.startGame(sinkhole);
    assert.equal(state.gameState, 'DIALOG');
    assert.match(document.getElementById('dialog-text').innerText, /subfloor/i);
    tap('q');
    assert.equal(state.gameState, 'PLAYING');
    assert.equal(state.pendingBossIntro, null);
    assert.equal(document.getElementById('dialog-text').innerText, '');
    assert.equal(document.getElementById('dialog-overlay').classList.contains('hidden'), true);
    tap('q');
    assert.equal(state.gameState, 'PLAYING');
    assert.equal(state.pendingBossIntro, null);
    assert.equal(document.getElementById('dialog-text').innerText, '');
    assert.notEqual(state.gameState, 'BOSS_INTRO');
    assert.notEqual(state.gameState, 'DIALOG');
});

check('Q during the boss intro skips it and still starts the encounter', () => {
    release();
    main.startGame(exterminator);
    assert.equal(state.gameState, 'DIALOG');
    tap('enter');
    assert.equal(state.gameState, 'BOSS_INTRO');
    assert.equal(state.robots[0].isEmerging, false);
    tap('q');
    assert.equal(state.gameState, 'PLAYING');
    assert.equal(state.pendingBossIntro, null);
    assert.equal(state.robots[0].isEmerging, true);
    assert.equal(document.getElementById('dialog-text').innerText, '');
    assert.equal(document.getElementById('dialog-overlay').classList.contains('hidden'), true);
});

check('Enter still walks story then boss intro into play', () => {
    release();
    main.startGame(sinkhole);
    tap('enter');
    assert.equal(state.gameState, 'BOSS_INTRO');
    tap('enter');
    assert.equal(state.gameState, 'PLAYING');
    assert.equal(state.pendingBossIntro, null);
});

check('controls list shows dash once the level unlocks it', () => {
    loadLevel({ level: sinkhole });
    assert.equal(getUnlockedAbilities().includes('dash'), true);
    const hud = document.getElementById('bottom-hud').innerHTML;
    assert.match(hud, /<kbd>SHIFT<\/kbd> Dash/);
    assert.equal(document.getElementById('touch-btn-dash').classList.contains('hidden'), false);
    const hint = document.getElementById('level-hint');
    assert.match(hint.innerText, /stun it once per loop/);
    assert.match(hint.innerText, /becomes an echo/);
    assert.equal(hint.classList.contains('hidden'), false);
});

check('dash stays off the controls list when the level did not unlock or grant it', () => {
    state.abilitiesPurchased = {};
    loadLevel({ level: 0 });
    assert.equal(LEVELS[0].unlocks.includes('dash'), false);
    assert.equal(getUnlockedAbilities().includes('dash'), false);
    const hud = document.getElementById('bottom-hud').innerHTML;
    assert.doesNotMatch(hud, /Dash/);
    assert.equal(document.getElementById('touch-btn-dash').classList.contains('hidden'), true);
});

process.exit(failures ? 1 : 0);
