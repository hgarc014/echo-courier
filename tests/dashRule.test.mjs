// Dash turns on at W2-L3 Heavy Going and stays on for every later world >= 2 level.
// No W1 level and no earlier W2 level has dash. Unlock All and ?dev=1 (checkbox on)
// follow the same rule. Resolution is the game's own startGame / restartLevel /
// playtest path (getUnlockedAbilities + the controls HUD).
// Run: node tests/dashRule.test.mjs
import assert from 'node:assert/strict';
import { installDomStubs } from './harness/domStub.mjs';

installDomStubs();
const { main, state } = await import('./harness/replay.mjs');
const { LEVELS, WORLDS } = await import('../src/data/levels.js');
const { getUnlockedAbilities, setUnlockAll, isDevMode } = await import('../src/core/state.js');

const elements = new Map();
function makeEl(id) {
    const classes = new Set();
    return {
        id,
        innerText: '',
        innerHTML: '',
        textContent: '',
        value: '',
        checked: false,
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
    return document.getElementById('qs:' + sel);
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

// Spec, not the implementation: world id, then position inside that world, anchored on Heavy Going.
function specDash(level) {
    if (!level || level.isSandbox || level.world == null) return null;
    const worldId = Number(level.world);
    if (worldId < 2) return false;
    if (worldId > 2) return true;
    const w2 = WORLDS.find(w => w.id === 2);
    const seq = (w2?.levels || []).map(i => LEVELS[i]).filter(Boolean);
    const marker = seq.findIndex(l => String(l.name).includes('Heavy Going'));
    const pos = seq.indexOf(level);
    if (marker < 0) throw new Error('W2-L3 Heavy Going is missing from world 2');
    if (pos < 0) throw new Error(`${level.name} is world 2 but not in that world's level list`);
    return pos >= marker;
}

function controlsShowDash() {
    const hud = document.getElementById('bottom-hud').innerHTML;
    const touchHidden = document.getElementById('touch-btn-dash').classList.contains('hidden');
    return { hud, touchHidden, listed: /<kbd>SHIFT<\/kbd> Dash/.test(hud) };
}

function freshShop() {
    state.abilitiesPurchased = {};
}

check('Heavy Going is the only dashFrom marker', () => {
    const marked = LEVELS.filter(l => l.dashFrom === true);
    assert.equal(marked.length, 1);
    assert.match(marked[0].name, /Heavy Going/);
    assert.equal(marked[0].world, 2);
});

check('campaign levels: dash off before Heavy Going, on from it through later worlds', () => {
    freshShop();
    for (let i = 0; i < LEVELS.length; i++) {
        const level = LEVELS[i];
        const expected = specDash(level);
        if (expected == null) continue;
        main.startGame(i);
        const on = getUnlockedAbilities().includes('dash');
        const controls = controlsShowDash();
        assert.equal(on, expected, `${level.name} (world ${level.world})`);
        assert.equal(controls.listed, expected, `${level.name} controls list`);
        assert.equal(controls.touchHidden, !expected, `${level.name} touch dash`);
        if (!expected) assert.doesNotMatch(controls.hud, /Dash/, `${level.name} hud`);
        console.log(`       ${expected ? 'ON ' : 'off'}  ${level.name}`);
    }
});

check('sandbox keeps dash from its own grants', () => {
    freshShop();
    const i = LEVELS.findIndex(l => l.isSandbox);
    assert.ok(i >= 0);
    main.startGame(i);
    assert.equal(specDash(LEVELS[i]), null);
    assert.equal(getUnlockedAbilities().includes('dash'), true);
    assert.equal(controlsShowDash().listed, true);
    assert.equal(controlsShowDash().touchHidden, false);
});

check('old Levels 3-5 do not get dash from a copied unlocks list', () => {
    freshShop();
    for (const name of ['Level 3: Sweep Coverage', 'Level 4: Overlapping Watch', 'Level 5: Unstable Deck']) {
        const level = LEVELS.find(l => l.name === name);
        assert.ok(level, name);
        assert.equal((level.grants || []).includes('dash'), false, name);
        assert.equal((level.unlocks || []).includes('dash'), false, name);
        assert.equal(specDash(level), true, name);
        main.startGame(LEVELS.indexOf(level));
        assert.equal(getUnlockedAbilities().includes('dash'), true, name);
    }
});

check('a purchased dash and a dash unlock do not turn dash on before Heavy Going', () => {
    const early = [
        LEVELS.findIndex(l => l.world === 1),
        LEVELS.findIndex(l => String(l.name).includes('Thin Ice'))
    ];
    for (const i of early) {
        const level = LEVELS[i];
        const unlocks = level.unlocks;
        const grants = level.grants;
        level.unlocks = ['dash'];
        level.grants = ['dash'];
        state.abilitiesPurchased = { dash: true };
        try {
            main.startGame(i);
            assert.equal(getUnlockedAbilities().includes('dash'), false, level.name);
            assert.equal(controlsShowDash().listed, false, level.name);
            assert.equal(controlsShowDash().touchHidden, true, level.name);
            main.restartLevel();
            assert.equal(getUnlockedAbilities().includes('dash'), false, level.name + ' restart');
        } finally {
            level.unlocks = unlocks;
            level.grants = grants;
            freshShop();
        }
    }
});

check('dash stays on after Heavy Going even with empty grants and unlocks', () => {
    freshShop();
    const names = ['W2-L3: Heavy Going', 'W2-L4: Sinking Freight', 'Level 12: Danger Courier'];
    for (const name of names) {
        const i = LEVELS.findIndex(l => l.name === name);
        const level = LEVELS[i];
        const unlocks = level.unlocks;
        const grants = level.grants;
        level.unlocks = [];
        level.grants = [];
        try {
            main.startGame(i);
            assert.equal(getUnlockedAbilities().includes('dash'), true, name);
            assert.equal(controlsShowDash().listed, true, name);
            main.restartLevel();
            assert.equal(getUnlockedAbilities().includes('dash'), true, name + ' restart');
        } finally {
            level.unlocks = unlocks;
            level.grants = grants;
        }
    }
});

check('playtest uses world and name, not the LEVELS object', () => {
    freshShop();
    state.editorLevelMeta = {
        name: 'First Shift',
        world: 1,
        grants: ['dash'],
        unlocks: ['dash'],
        obj: 'play',
        maxGhosts: 1
    };
    main.startPlaytestFromEditor();
    assert.equal(getUnlockedAbilities().includes('dash'), false);
    assert.equal(controlsShowDash().listed, false);

    freshShop();
    state.abilitiesPurchased = { dash: true };
    state.editorLevelMeta = {
        name: 'W2-L2: Footprints',
        world: 2,
        grants: ['dash'],
        unlocks: ['dash'],
        obj: 'play',
        maxGhosts: 1
    };
    main.startPlaytestFromEditor();
    assert.equal(getUnlockedAbilities().includes('dash'), false, 'footprints playtest');

    freshShop();
    state.editorLevelMeta = {
        name: 'W2-L3: Heavy Going',
        world: 2,
        grants: [],
        unlocks: [],
        obj: 'play',
        maxGhosts: 1
    };
    main.startPlaytestFromEditor();
    assert.equal(getUnlockedAbilities().includes('dash'), true, 'heavy going playtest');
    assert.equal(controlsShowDash().listed, true);
    assert.equal(controlsShowDash().touchHidden, false);

    state.editorLevelMeta = {
        name: 'Level 8: Timed Gate',
        world: 4,
        grants: [],
        unlocks: ['ghostShield'],
        obj: 'play',
        maxGhosts: 1
    };
    main.startPlaytestFromEditor();
    assert.equal(getUnlockedAbilities().includes('dash'), true, 'later world playtest');
    assert.equal(controlsShowDash().touchHidden, false);
});

// Dev mode still grants toss, cloak, and ghost shield. Dash follows Heavy Going.
function assertDevDashFollowsRule(label) {
    freshShop();
    const earlyNames = ['First Shift', 'Thin Ice', 'Footprints'];
    let sawEarly = 0;
    let sawHeavy = false;
    for (let i = 0; i < LEVELS.length; i++) {
        const level = LEVELS[i];
        const expected = specDash(level);
        if (expected == null) continue;
        main.startGame(i);
        const got = getUnlockedAbilities();
        const controls = controlsShowDash();
        assert.equal(got.includes('dash'), expected, `${label} ${level.name}`);
        assert.equal(controls.listed, expected, `${label} ${level.name} controls`);
        assert.equal(controls.touchHidden, !expected, `${label} ${level.name} touch`);
        assert.equal(got.includes('toss'), true, `${label} ${level.name} toss`);
        assert.equal(got.includes('cloak'), true, `${label} ${level.name} cloak`);
        assert.equal(got.includes('ghostShield'), true, `${label} ${level.name} shield`);
        assert.deepEqual(state.abilitiesPurchased, {}, `${label} ${level.name} shop`);
        if (!expected) assert.doesNotMatch(controls.hud, /Dash/, `${label} ${level.name} hud`);
        if (earlyNames.some(name => String(level.name).includes(name))) {
            assert.equal(expected, false, `${label} ${level.name} should be before Heavy Going`);
            sawEarly++;
        }
        if (String(level.name).includes('Heavy Going')) {
            assert.equal(expected, true, `${label} Heavy Going`);
            sawHeavy = true;
        }
    }
    assert.equal(sawEarly, earlyNames.length, `${label} early levels`);
    assert.equal(sawHeavy, true, `${label} Heavy Going`);
    const sandbox = LEVELS.findIndex(l => l.isSandbox);
    main.startGame(sandbox);
    assert.equal(getUnlockedAbilities().includes('dash'), true, `${label} sandbox grants`);
}

check('Unlock All respects Heavy Going: no dash on W1 or W2-L1/L2, dash from Heavy Going on', () => {
    const early = [
        LEVELS.findIndex(l => l.name === 'First Shift'),
        LEVELS.findIndex(l => String(l.name).includes('Thin Ice')),
        LEVELS.findIndex(l => String(l.name).includes('Footprints'))
    ];
    const heavy = LEVELS.findIndex(l => String(l.name).includes('Heavy Going'));
    try {
        setUnlockAll(true);
        assert.equal(isDevMode(), true);
        assertDevDashFollowsRule('Unlock All');
    } finally {
        setUnlockAll(false);
        freshShop();
    }
    for (const i of early) {
        main.startGame(i);
        assert.equal(getUnlockedAbilities().includes('dash'), false, `${LEVELS[i].name} after Unlock All off`);
        assert.equal(controlsShowDash().listed, false, LEVELS[i].name);
        assert.equal(controlsShowDash().touchHidden, true, LEVELS[i].name);
    }
    main.startGame(heavy);
    assert.equal(getUnlockedAbilities().includes('dash'), true, 'Heavy Going still has dash');
    assert.equal(controlsShowDash().listed, true);
    assert.equal(controlsShowDash().touchHidden, false);
});

// ?dev=1 is the same isDevMode() path once the checkbox is on. Nothing treats it
// as an ability override, so the dash rule applies there too.
check('?dev=1 with the dev checkbox respects Heavy Going the same way', () => {
    const box = document.getElementById('dev-mode-checkbox');
    const prevSearch = location.search;
    try {
        setUnlockAll(false);
        location.search = '?dev=1';
        box.checked = true;
        assert.equal(isDevMode(), true);
        assertDevDashFollowsRule('?dev=1');
    } finally {
        location.search = prevSearch;
        box.checked = false;
        setUnlockAll(false);
        freshShop();
    }
    assert.equal(isDevMode(), false);
});

process.exit(failures ? 1 : 0);
