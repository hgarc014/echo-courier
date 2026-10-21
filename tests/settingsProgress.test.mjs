// Wipe campaign progress without editor saves, audio, or the unlock-all flag.
// Run: node tests/settingsProgress.test.mjs   (no dependencies)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function editorSavePrefix() {
    const src = readFileSync(new URL('../src/ui/editor.js', import.meta.url), 'utf8');
    const match = src.match(/export const EDITOR_SAVE_PREFIX = '([^']+)'/);
    if (!match) throw new Error('EDITOR_SAVE_PREFIX missing from src/ui/editor.js');
    return match[1];
}

function createMemoryStorage() {
    const store = new Map();
    return {
        getItem(key) {
            const k = String(key);
            return store.has(k) ? store.get(k) : null;
        },
        setItem(key, value) {
            store.set(String(key), String(value));
        },
        removeItem(key) {
            store.delete(String(key));
        },
        key(index) {
            const keys = [...store.keys()];
            return index >= 0 && index < keys.length ? keys[index] : null;
        },
        clear() {
            store.clear();
        },
        get length() {
            return store.size;
        }
    };
}

globalThis.localStorage = createMemoryStorage();
globalThis.Image = class { set src(_) {} };
globalThis.document = {
    createElement: () => ({ getContext: () => ({}) }),
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => []
};

const EDITOR_SAVE_PREFIX = editorSavePrefix();
const audioValue = JSON.stringify({ muted: true, dialogVoiceEnabled: false, dialogVolume: 0.4, musicVolume: 0.2 });
const suitValue = '#39ff14';
const editorKey = EDITOR_SAVE_PREFIX + 'draft';
const editorValue = '{"walls":[]}';

localStorage.setItem('echoCourier_maxLevel', '7');
localStorage.setItem('echoCourier_challenges', JSON.stringify({ 2: true }));
localStorage.setItem('echoCourier_abilities', JSON.stringify({ dash: true }));
localStorage.setItem('echoCourier_tutorials', JSON.stringify({ 0: true }));
localStorage.setItem('echoCourier_demoSeen_4', '1');
localStorage.setItem('echoCourier_demoSeen_Intro_Name', '1');
localStorage.setItem('echoCourier_audio', audioValue);
localStorage.setItem('echoCourier_suit', suitValue);
localStorage.setItem('echoCourier_unlockAll', '0');
localStorage.setItem(editorKey, editorValue);

const mod = await import('../src/core/state.js');

assert.equal(mod.state.maxUnlockedLevel, 7);
assert.deepEqual(mod.state.challengesCompleted, { 2: true });
assert.deepEqual(mod.state.abilitiesPurchased, { dash: true });
assert.deepEqual(mod.state.tutorialProgress, { 0: true });
assert.ok(mod.PROGRESS_KEYS.includes('echoCourier_maxLevel'));
assert.ok(mod.PROGRESS_KEYS.includes('echoCourier_challenges'));
assert.ok(mod.PROGRESS_KEYS.includes('echoCourier_abilities'));
assert.ok(mod.PROGRESS_KEYS.includes('echoCourier_tutorials'));

mod.wipeProgress();

for (const key of mod.PROGRESS_KEYS) {
    assert.equal(localStorage.getItem(key), null, `progress key still present: ${key}`);
}
assert.equal(localStorage.getItem('echoCourier_demoSeen_4'), null);
assert.equal(localStorage.getItem('echoCourier_demoSeen_Intro_Name'), null);
assert.equal(localStorage.getItem(editorKey), editorValue);
assert.equal(localStorage.getItem('echoCourier_audio'), audioValue);
assert.equal(localStorage.getItem('echoCourier_suit'), suitValue);
assert.equal(localStorage.getItem('echoCourier_unlockAll'), '0');
assert.equal(mod.state.maxUnlockedLevel, 0);
assert.deepEqual(mod.state.challengesCompleted, {});
assert.deepEqual(mod.state.abilitiesPurchased, {});
assert.deepEqual(mod.state.tutorialProgress, {});
assert.equal(mod.state.playerColor, suitValue);

mod.setUnlockAll(true);
assert.equal(localStorage.getItem('echoCourier_unlockAll'), '1');

const fresh = await import('../src/core/state.js?v=2');
assert.equal(fresh.isUnlockAll(), true);
assert.equal(fresh.isLevelUnlocked(20), true);
assert.equal(fresh.isLevelUnlocked(11, { isPendingCampaign: false }), true);
const abilities = fresh.getUnlockedAbilities();
for (const id of ['dash', 'toss', 'cloak', 'ghostShield']) {
    assert.ok(abilities.includes(id), `missing ability ${id}`);
}
assert.equal(fresh.getPlayerRank(), 4);
assert.equal(fresh.state.maxUnlockedLevel, 0);

const beforeOff = mod.PROGRESS_KEYS.map(key => localStorage.getItem(key));
fresh.setUnlockAll(false);
assert.equal(fresh.isUnlockAll(), false);
assert.equal(localStorage.getItem('echoCourier_unlockAll'), '0');
assert.equal(fresh.isLevelUnlocked(5), false);
assert.equal(fresh.state.maxUnlockedLevel, 0);
assert.deepEqual(mod.PROGRESS_KEYS.map(key => localStorage.getItem(key)), beforeOff);
assert.equal(localStorage.getItem(editorKey), editorValue);
assert.equal(localStorage.getItem('echoCourier_audio'), audioValue);
assert.equal(localStorage.getItem('echoCourier_suit'), suitValue);
assert.equal(fresh.isLevelUnlocked(5, { isPendingCampaign: true }), true);

const savedDocument = globalThis.document;
const savedLocation = globalThis.location;
try {
    delete globalThis.document;
    globalThis.location = { search: '?dev=1' };
    assert.equal(fresh.isDevMode(), false);
    fresh.setUnlockAll(true);
    assert.equal(fresh.isDevMode(), true);
    fresh.setUnlockAll(false);
    assert.equal(fresh.isDevMode(), false);
} finally {
    globalThis.document = savedDocument;
    if (savedLocation === undefined) delete globalThis.location;
    else globalThis.location = savedLocation;
}
for (const key of mod.PROGRESS_KEYS) {
    assert.equal(localStorage.getItem(key), null, `progress key touched: ${key}`);
}

console.log('ok - settings progress wipe and unlock-all');
