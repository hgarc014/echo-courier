// Hint line edits land in level meta without pressing Apply Level Config.
// Run: node tests/editorHint.test.mjs
import assert from 'node:assert/strict';
import { installDomStubs } from './harness/domStub.mjs';

installDomStubs();

const elements = new Map();
function makeEl(id) {
    const listeners = {};
    return {
        id,
        value: '',
        innerText: '',
        style: {},
        checked: false,
        dataset: {},
        classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
        addEventListener(type, fn) { listeners[type] = fn; },
        _listeners: listeners
    };
}
document.getElementById = (id) => {
    if (!elements.has(id)) elements.set(id, makeEl(id));
    return elements.get(id);
};
document.querySelector = () => null;
document.querySelectorAll = () => [];

const { state } = await import('../src/core/state.js');
const { LEVELS } = await import('../src/data/levels.js');
const { setEditorLevelMetaFromLevel, commitEditorHintLine, bindEditorHintAutosave, flushEditorLevelConfig } = await import('../src/ui/editor.js');

const sinkhole = LEVELS.find(level => String(level.name).startsWith('W2-MB'));
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

check('typing a hint updates meta without Apply Level Config', () => {
    setEditorLevelMetaFromLevel(sinkhole);
    const hint = document.getElementById('editor-meta-hint');
    hint.value = sinkhole.hintLine;
    bindEditorHintAutosave();
    const typed = 'Hold the plate. A surfacing on the touching crack stuns it once per loop.';
    hint.value = typed;
    assert.equal(typeof hint._listeners.input, 'function');
    hint._listeners.input();
    assert.equal(state.editorLevelMeta.hintLine, typed);
    hint.value = '   ';
    hint._listeners.change();
    assert.equal(state.editorLevelMeta.hintLine, undefined);
    commitEditorHintLine(typed);
    assert.equal(state.editorLevelMeta.hintLine, typed);
});

check('playtest flush copies a hint that was never Applied', () => {
    setEditorLevelMetaFromLevel(sinkhole);
    const hint = document.getElementById('editor-meta-hint');
    const typed = 'Flush me before playtest. Stuns once per loop, then the run becomes an echo.';
    hint.value = typed;
    state.editorLevelMeta.hintLine = 'stale hint that was never replaced';
    const ok = flushEditorLevelConfig();
    assert.notEqual(ok, false);
    assert.equal(state.editorLevelMeta.hintLine, typed);
});

process.exit(failures ? 1 : 0);
