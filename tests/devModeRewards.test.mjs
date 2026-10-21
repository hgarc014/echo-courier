// Dev mode must not credit rewards, and shop buys stay disabled with the same note.
// Run: node tests/devModeRewards.test.mjs
import assert from 'node:assert/strict';
import { installDomStubs } from './harness/domStub.mjs';

installDomStubs();

const { state, setUnlockAll, isDevMode, getCredits } = await import('../src/core/state.js');
const { refreshShopButtons, levelSelectTitle } = await import('../src/ui/menu.js');
const { formatCampaignClearMessage, DEV_PROGRESS_NOTE, finishLoopLine } = await import('../src/core/loopDisplay.js');
const { LEVELS, normalizePar } = await import('../src/data/levels.js');

const NOTE = 'Dev mode: progress not saved';
assert.equal(DEV_PROGRESS_NOTE, NOTE);

function classList(initial = []) {
    const set = new Set(initial);
    return {
        add(c) { set.add(c); },
        remove(c) { set.delete(c); },
        toggle(c, on) {
            if (on === undefined) {
                if (set.has(c)) set.delete(c);
                else set.add(c);
            } else if (on) set.add(c);
            else set.delete(c);
        },
        contains(c) { return set.has(c); }
    };
}

function makeEl(initialClass) {
    return {
        disabled: false,
        hidden: false,
        innerText: '',
        textContent: '',
        title: '',
        style: {},
        classList: classList(initialClass ? [initialClass] : []),
        onclick: null
    };
}

const nodes = {
    'shop-dash': makeEl(),
    'shop-toss': makeEl(),
    'shop-cloak': makeEl(),
    'shop-ghost-shield': makeEl(),
    'shop-dev-note': makeEl('hidden')
};
nodes['shop-dev-note'].hidden = true;
document.getElementById = (id) => nodes[id] || null;

const loopLine = finishLoopLine(2, 2);

const earned = formatCampaignClearMessage({
    loopLine,
    firstClear: true,
    challengePassed: true,
    previouslyDone: false,
    devMode: false
});
assert.match(earned.html, /Level Clear: \+\$50/);
assert.match(earned.html, /Challenge Passed! \(\+\$50\)/);
assert.equal(earned.html.includes(NOTE), false);
assert.equal(earned.color, 'gold');

const devPass = formatCampaignClearMessage({
    loopLine,
    firstClear: true,
    challengePassed: true,
    previouslyDone: false,
    devMode: true
});
assert.equal(devPass.html.includes('+$'), false);
assert.equal(devPass.html.includes('Challenge Passed'), false);
assert.ok(devPass.html.includes(NOTE));
assert.ok(devPass.html.includes(loopLine));
assert.notEqual(devPass.color, 'gold');

const devFail = formatCampaignClearMessage({
    loopLine,
    firstClear: true,
    challengePassed: false,
    previouslyDone: false,
    devMode: true
});
assert.equal(devFail.html.includes('+$'), false);
assert.equal(devFail.html.includes('Level Clear'), false);
assert.ok(devFail.html.includes(NOTE));
assert.match(devFail.html, /Challenge Failed/);

localStorage.setItem('echoCourier_maxLevel', '20');
localStorage.setItem('echoCourier_challenges', '{}');
localStorage.setItem('echoCourier_abilities', '{}');
localStorage.setItem('echoCourier_tutorials', '{}');
setUnlockAll(false);
assert.equal(isDevMode(), false);
assert.equal(state.maxUnlockedLevel, 20);
state.abilitiesPurchased = {};
refreshShopButtons();

const buyIds = ['shop-dash', 'shop-toss', 'shop-cloak', 'shop-ghost-shield'];
for (const id of buyIds) {
    const btn = nodes[id];
    assert.equal(btn.disabled, false, id);
    assert.equal(btn.style.opacity, '1', id);
    assert.equal(btn.classList.contains('shop-locked'), false, id);
    assert.equal(btn.title, '', id);
}
assert.equal(nodes['shop-dev-note'].hidden, true);
assert.equal(nodes['shop-dev-note'].classList.contains('hidden'), true);

setUnlockAll(true);
assert.equal(isDevMode(), true);
assert.ok(getCredits() >= 200);
refreshShopButtons();

for (const id of buyIds) {
    const btn = nodes[id];
    assert.equal(btn.disabled, true, `${id} should be disabled in dev mode`);
    assert.ok(Number(btn.style.opacity) <= 0.5, `${id} opacity ${btn.style.opacity}`);
    assert.equal(btn.style.cursor, 'not-allowed', id);
    assert.equal(btn.classList.contains('shop-locked'), true, id);
    assert.equal(btn.title, NOTE, id);
    btn.onclick();
}
assert.deepEqual(state.abilitiesPurchased, {});
assert.equal(nodes['shop-dev-note'].hidden, false);
assert.equal(nodes['shop-dev-note'].classList.contains('hidden'), false);
assert.equal(nodes['shop-dev-note'].textContent, NOTE);

const restrictions = ['Do NOT use Dash', 'No Alarms Triggered', 'Finish in 1 loop (No Ghosts!)'];
for (const desc of restrictions) {
    const lvl = LEVELS.find(l => l.challenge?.desc === desc);
    assert.ok(lvl, desc);
    const title = levelSelectTitle(lvl, { unlocked: true, hasGold: false });
    assert.equal(title.startsWith('Par:'), false, title);
    assert.equal(title, `Challenge: ${desc}`);
}
const parLvl = LEVELS.find(l => l.name === 'First Shift');
assert.equal(levelSelectTitle(parLvl, { unlocked: true, hasGold: false }), 'Par: Finish in 2 loops or fewer');

const noParFinish = LEVELS.filter(l =>
    normalizePar(l.par) == null && /^Finish in \d+ loops?/i.test(l.challenge?.desc || ''));
assert.ok(noParFinish.some(l => l.name.includes('Sweep Coverage')));
assert.ok(noParFinish.some(l => l.name.includes('Fragile Grid')));
for (const lvl of noParFinish) {
    const title = levelSelectTitle(lvl, { unlocked: true, hasGold: false });
    assert.equal(title.startsWith('Par:'), false, `${lvl.name}: ${title}`);
    assert.equal(title, `Challenge: ${lvl.challenge.desc}`, lvl.name);
}

console.log('ok - dev mode results and shop');
