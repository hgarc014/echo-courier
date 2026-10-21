// HUD loop index is 1-based and is not capped when the oldest echo is dropped.
// Run: node tests/loopCount.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installDomStubs } from './harness/domStub.mjs';

installDomStubs();
const { main, state, keys, loadLevel, replaySolution } = await import('./harness/replay.mjs');
const { LEVELS } = await import('../src/data/levels.js');
const { displayedLoopNumber, finishedWithinLoops, finishLoopLine } = await import('../src/core/loopDisplay.js');

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
        classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
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

check('HUD shows the live loop, including after the echo buffer drops a run', () => {
    loadLevel({ level: 0 });
    const hud = document.getElementById('loop-count');
    assert.equal(state.gameState, 'PLAYING');
    assert.equal(state.loopNumber, 1);
    assert.equal(hud.innerText, '1');
    assert.equal(String(document.getElementById('max-loops').innerText), '2');

    rewind();
    assert.equal(state.loopNumber, 2);
    assert.equal(hud.innerText, '2');
    assert.equal(LEVELS[0].challenge.check(), true);

    rewind();
    rewind();
    assert.equal(state.loopNumber, 4);
    assert.equal(state.pastRuns.length, 1);
    assert.equal(hud.innerText, '4');
    assert.equal(LEVELS[0].challenge.check(), false);

    main.restartLevel();
    assert.equal(state.loopNumber, 1);
    assert.equal(hud.innerText, '1');
    assert.equal(state.pastRuns.length, 0);
});

check('editor playtest starts on loop 1', () => {
    loadLevel({ level: 0 });
    main.startPlaytestFromEditor();
    assert.equal(state.playtesting, true);
    assert.equal(state.loopNumber, 1);
    assert.equal(document.getElementById('loop-count').innerText, '1');
    const max = Number(document.getElementById('max-loops').innerText);
    assert.equal(max, (state.currentLevelMeta.maxGhosts ?? 0) + 1);
});

check('results text uses the same 1-based count as the HUD', () => {
    const thin = replaySolution(JSON.parse(readFileSync(new URL('./solutions/w2-l1.json', import.meta.url), 'utf8')));
    assert.equal(thin.completed, true);
    assert.equal(thin.loopsUsed, 1);
    assert.equal(state.loopNumber, 1);
    const thinMsg = document.getElementById('challenge-result').innerHTML;
    assert.match(thinMsg, /Finished in 1 loop \(par 1\)\./);

    const basics = replaySolution(JSON.parse(readFileSync(new URL('./solutions/level01.json', import.meta.url), 'utf8')));
    assert.equal(basics.completed, true);
    assert.equal(basics.loopsUsed, 2);
    assert.equal(state.loopNumber, 2);
    const basicsMsg = document.getElementById('challenge-result').innerHTML;
    assert.match(basicsMsg, /Finished in 2 loops\./);
    assert.doesNotMatch(basicsMsg, /par /);
});

const markup = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
check('menu par wording stays 1-based and the HUD markup starts at loop 1', () => {
    assert.match(markup, /id="loop-count">1</);
    assert.match(markup, /Loop&nbsp;/);
});

process.exit(failures ? 1 : 0);
