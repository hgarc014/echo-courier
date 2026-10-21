// HUD loop index is 1-based and is not capped when the oldest echo is dropped.
// "Loop N of B" uses B = maxGhosts+1 (the planned budget). The echo budget is still
// echoes kept / max. Extra rewinds drop the oldest echo; they do not stop at "of B".
// Run: node tests/loopCount.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installDomStubs } from './harness/domStub.mjs';

installDomStubs();
const { main, state, keys, loadLevel, replaySolution } = await import('./harness/replay.mjs');
const { LEVELS } = await import('../src/data/levels.js');
const firstShift = LEVELS.findIndex(level => level.name === 'First Shift');
const { displayedLoopNumber, finishedWithinLoops, finishLoopLine, plannedLoopBudget } = await import('../src/core/loopDisplay.js');

const elements = new Map();
function makeEl(id) {
    return {
        id,
        innerText: '',
        innerHTML: '',
        textContent: '',
        value: '',
        style: {},
        className: '',
        hidden: false,
        classList: (() => {
            const set = new Set();
            return {
                add(...xs) { for (const x of xs) set.add(x); },
                remove(...xs) { for (const x of xs) set.delete(x); },
                toggle(x, force) {
                    const on = force === undefined ? !set.has(x) : !!force;
                    if (on) set.add(x); else set.delete(x);
                    return on;
                },
                contains: (x) => set.has(x)
            };
        })(),
        addEventListener() {},
        removeEventListener() {},
        setAttribute() {},
        getAttribute: () => null,
        appendChild() {},
        getContext: () => new Proxy({}, { get: () => () => ({}) }),
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 }),
        width: 800,
        height: 600
    };
}
document.getElementById = (id) => {
    if (!elements.has(id)) elements.set(id, makeEl(id));
    return elements.get(id);
};

const markup = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

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

check('displayed loop number is 1-based', () => {
    assert.equal(displayedLoopNumber(1), 1);
    assert.equal(displayedLoopNumber(3), 3);
    assert.equal(displayedLoopNumber(0), 1);
    assert.equal(displayedLoopNumber(undefined), 1);
    assert.equal(finishLoopLine(3, 3), 'Finished in 3 loops (par 3).');
    assert.equal(finishLoopLine(1, null), 'Finished in 1 loop.');
    assert.equal(finishedWithinLoops(3, 3), true);
    assert.equal(finishedWithinLoops(4, 3), false);
    assert.equal(finishedWithinLoops(1, 1), true);
    assert.equal(plannedLoopBudget(0), 1);
    assert.equal(plannedLoopBudget(1), 2);
    assert.equal(plannedLoopBudget(2), 3);
    assert.equal(plannedLoopBudget(2.9), 3);
    assert.equal(plannedLoopBudget(null), null);
    assert.equal(plannedLoopBudget(undefined), null);
    assert.equal(plannedLoopBudget(Infinity), null);
    assert.equal(plannedLoopBudget(-1), null);
});

function releaseKeys() {
    for (const k of Object.keys(keys)) keys[k] = false;
}

function rewind() {
    releaseKeys();
    keys.d = true;
    main.stepSimulation();
    keys.d = false;
    keys.r = true;
    main.stepSimulation();
    keys.r = false;
    for (let i = 0; i < 20; i++) main.stepSimulation();
}

function hudPhrase() {
    assert.match(markup, /<span id="loop-of"[^>]*>[\s\S]*?<span id="loop-budget"><\/span><\/span>/);
    assert.match(markup, /<span id="loop-over"[^>]*>[\s\S]*?<span id="loop-par"><\/span>\)<\/span>/);
    assert.match(markup, /id="loop-budget"/);
    assert.match(markup, /id="loop-par"/);
    const loop = document.getElementById('loop-count').innerText;
    const echoes = document.getElementById('echo-count').innerText;
    const max = document.getElementById('max-echoes').innerText;
    const ofEl = document.getElementById('loop-of');
    const overEl = document.getElementById('loop-over');
    const budget = document.getElementById('loop-budget').innerText;
    const par = document.getElementById('loop-par').innerText;
    const over = overEl && !overEl.classList.contains('hidden');
    const showOf = !over && ofEl && !ofEl.classList.contains('hidden') && budget !== '';
    const head = over ? `Loop ${loop} · over par (${par})` : (showOf ? `Loop ${loop} of ${budget}` : `Loop ${loop}`);
    return `${head} · Echoes ${echoes}/${max}`;
}

check('HUD shows the live loop, including after the echo buffer drops a run', () => {
    loadLevel({ level: firstShift });
    const hud = document.getElementById('loop-count');
    assert.equal(state.gameState, 'PLAYING');
    assert.equal(state.loopNumber, 1);
    assert.equal(hud.innerText, '1');
    assert.equal(document.getElementById('echo-count').innerText, '0');
    assert.equal(document.getElementById('max-echoes').innerText, '1');
    assert.equal(hudPhrase(), 'Loop 1 of 2 · Echoes 0/1');

    rewind();
    assert.equal(state.loopNumber, 2);
    assert.equal(hud.innerText, '2');
    assert.equal(document.getElementById('echo-count').innerText, '1');
    assert.equal(LEVELS[firstShift].challenge.check(), true);

    rewind();
    rewind();
    assert.equal(state.loopNumber, 4);
    assert.equal(state.pastRuns.length, 1);
    assert.equal(hud.innerText, '4');
    assert.equal(hudPhrase(), 'Loop 4 · over par (2) · Echoes 1/1');
    assert.doesNotMatch(hudPhrase(), / of /);
    assert.equal(LEVELS[firstShift].challenge.check(), false);

    main.restartLevel();
    assert.equal(state.loopNumber, 1);
    assert.equal(hud.innerText, '1');
    assert.equal(state.pastRuns.length, 0);
    assert.equal(hudPhrase(), 'Loop 1 of 2 · Echoes 0/1');
});

check('two rewinds on Level 1 keep going and do not read as Loop 3 / Max 2', () => {
    loadLevel({ level: firstShift });
    assert.equal(LEVELS[firstShift].maxGhosts, 1);
    rewind();
    rewind();
    assert.equal(state.loopNumber, 3);
    assert.equal(state.pastRuns.length, 1);
    assert.equal(hudPhrase(), 'Loop 3 · over par (2) · Echoes 1/1');
    assert.doesNotMatch(hudPhrase(), /Max/);
    assert.doesNotMatch(hudPhrase(), / of /);
    assert.notEqual(hudPhrase(), 'Loop 3 / Max 2');
    // Past the planned budget the HUD stops saying "N of B". Another rewind is still allowed.
    rewind();
    assert.equal(state.loopNumber, 4);
    assert.equal(state.pastRuns.length, LEVELS[firstShift].maxGhosts);
    assert.equal(hudPhrase(), 'Loop 4 · over par (2) · Echoes 1/1');
    assert.equal(document.getElementById('loop-of').classList.contains('hidden'), true);
    assert.equal(document.getElementById('loop-over').classList.contains('hidden'), false);
});

check('editor playtest starts on loop 1', () => {
    loadLevel({ level: firstShift });
    main.startPlaytestFromEditor();
    assert.equal(state.playtesting, true);
    assert.equal(state.loopNumber, 1);
    assert.equal(document.getElementById('loop-count').innerText, '1');
    assert.equal(document.getElementById('echo-count').innerText, '0');
    assert.equal(document.getElementById('max-echoes').innerText, String(state.currentLevelMeta.maxGhosts));
    assert.equal(document.getElementById('loop-budget').innerText, String(plannedLoopBudget(state.currentLevelMeta.maxGhosts)));
    assert.equal(hudPhrase(), `Loop 1 of ${plannedLoopBudget(3)} · Echoes 0/3`);
});

check('unlimited echoes do not invent a loop total', () => {
    loadLevel({ level: 0 });
    main.startPlaytestFromEditor();
    state.currentLevelMeta.maxGhosts = Infinity;
    main.restartLevel();
    assert.equal(document.getElementById('max-echoes').innerText, '∞');
    assert.equal(document.getElementById('loop-of').classList.contains('hidden'), true);
    assert.equal(hudPhrase(), 'Loop 1 · Echoes 0/∞');
    assert.doesNotMatch(hudPhrase(), / of /);
});

check('results text uses the same 1-based count as the HUD', () => {
    const thin = replaySolution(JSON.parse(readFileSync(new URL('./solutions/w2-l1.json', import.meta.url), 'utf8')));
    assert.equal(thin.completed, true);
    assert.equal(thin.loopsUsed, 1);
    assert.equal(state.loopNumber, 1);
    const thinMsg = document.getElementById('challenge-result').innerHTML;
    assert.match(thinMsg, /Finished in 1 loop \(par 1\)\./);

    // First Shift replaced the old no-par Level 1. Clear par for this replay so the
    // results panel still covers a 2-loop finish that must not mention par.
    const savedPar = LEVELS[firstShift].par;
    LEVELS[firstShift].par = undefined;
    try {
        const basics = replaySolution(JSON.parse(readFileSync(new URL('./solutions/w1-l1.json', import.meta.url), 'utf8')));
        assert.equal(basics.completed, true);
        assert.equal(basics.loopsUsed, 2);
        assert.equal(state.loopNumber, 2);
        const basicsMsg = document.getElementById('challenge-result').innerHTML;
        assert.match(basicsMsg, /Finished in 2 loops\./);
        assert.doesNotMatch(basicsMsg, /par /);
    } finally {
        LEVELS[firstShift].par = savedPar;
    }
});

check('menu par wording stays 1-based and the HUD markup starts at loop 1', () => {
    assert.match(markup, /id="loop-count">1</);
    assert.match(markup, /Loop&nbsp;/);
    assert.match(markup, /id="loop-of"/);
    assert.match(markup, /id="loop-budget"/);
    assert.match(markup, /Echoes&nbsp;<span id="echo-count">0<\/span>\/<span id="max-echoes">/);
    assert.doesNotMatch(markup, /id="max-loops"/);
    assert.doesNotMatch(markup, /Loop&nbsp;<span id="loop-count">1<\/span>&nbsp;\/&nbsp;Max/);
});

process.exit(failures ? 1 : 0);
