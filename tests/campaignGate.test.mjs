// Fresh-profile world order, hidden placeholders, and Echo Shield scope.
// Run: node tests/campaignGate.test.mjs
import assert from 'node:assert/strict';
import { installDomStubs } from './harness/domStub.mjs';

installDomStubs();

const { state, isLevelUnlocked, recordLevelClear, getUnlockedAbilities, isDevMode, setUnlockAll } = await import('../src/core/state.js');
const {
    LEVELS, WORLDS, CAMPAIGN_LEVEL_COUNT,
    levelSelectEntries, nextCampaignLevelIndex, firstSelectableLevel,
    getWorldUnlockedAbilitiesForWorld, getShopUnlockedAbilities
} = await import('../src/data/levels.js');

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

function levelNamed(prefix) {
    const index = LEVELS.findIndex(level => String(level.name).startsWith(prefix));
    assert.ok(index >= 0, prefix);
    return { index, level: LEVELS[index] };
}

function restoreProgress() {
    setUnlockAll(false);
    state.maxUnlockedLevel = 0;
    state.clearedLevels = {};
    state.abilitiesPurchased = {};
    state.levelAbilityOverrides = [];
    state.worldUnlockedAbilities = null;
    state.currentLevelMeta = null;
    assert.equal(isDevMode(), false);
}

check('fresh profile keeps W4 locked until the previous world is complete', () => {
    restoreProgress();
    const beam = WORLDS.find(world => world.id === 4);
    const overclock = WORLDS.find(world => world.id === 5);
    const beamIndex = WORLDS.indexOf(beam);
    assert.ok(beamIndex > 0, 'W4 is not the first world');
    const prior = WORLDS[beamIndex - 1];
    assert.ok(prior.levels.length > 0);
    assert.notEqual(prior.id, 4);

    const first = beam.levels[0];
    const second = beam.levels[1];
    assert.equal(isLevelUnlocked(first, LEVELS[first]), false);
    assert.equal(isLevelUnlocked(second, LEVELS[second]), false);
    assert.equal(isLevelUnlocked(overclock.levels[0], LEVELS[overclock.levels[0]]), false);

    // Prior world complete via the linear cursor. W4's own indices stay ahead of it.
    state.maxUnlockedLevel = prior.levels[prior.levels.length - 1];
    assert.equal(getShopUnlockedAbilities(state.maxUnlockedLevel).includes('ghostShield'), false, 'Echo Shield stays off the counter until the previous world is finished');
    state.maxUnlockedLevel = prior.levels[prior.levels.length - 1] + 1;
    assert.ok(beam.levels[0] > state.maxUnlockedLevel, 'W4 still sits past the linear cursor');
    assert.ok(getShopUnlockedAbilities(state.maxUnlockedLevel).includes('ghostShield'), 'Echo Shield is for sale once Beamworks can be entered');
    assert.equal(isLevelUnlocked(first, LEVELS[first]), true, 'first W4 level opens after the prior world');
    assert.equal(isLevelUnlocked(second, LEVELS[second]), false, 'the rest of W4 stays locked');
    assert.equal(isLevelUnlocked(overclock.levels[0], LEVELS[overclock.levels[0]]), false, 'W5 waits for W4');

    const before = state.maxUnlockedLevel;
    recordLevelClear(first, { campaignLevelCount: CAMPAIGN_LEVEL_COUNT });
    assert.equal(state.maxUnlockedLevel, before, 'clearing W4 must not jump the linear cursor');
    assert.equal(isLevelUnlocked(second, LEVELS[second]), true);

    // The tested in-world jump still advances the cursor (clear 4 while max is 1).
    state.maxUnlockedLevel = 1;
    state.clearedLevels = {};
    recordLevelClear(4, { campaignLevelCount: CAMPAIGN_LEVEL_COUNT });
    assert.equal(state.maxUnlockedLevel, 5);

    // A synthetic pending level still short-circuits before the world probe.
    assert.equal(isLevelUnlocked(5, { isPendingCampaign: true }), true);
    restoreProgress();
});

check('next level follows WORLDS order and skips hidden placeholders', () => {
    const panopticon = WORLDS.find(world => world.id === 3);
    const beam = WORLDS.find(world => world.id === 4);
    const overclock = WORLDS.find(world => world.id === 5);
    const lastPanopticon = panopticon.levels[panopticon.levels.length - 1];
    assert.equal(nextCampaignLevelIndex(lastPanopticon), beam.levels[0]);
    const lastBeam = beam.levels[beam.levels.length - 1];
    // Overclock only holds hidden placeholders until W5 lands, so Beamworks is the end.
    const firstOverclock = overclock.levels.find(idx => !LEVELS[idx].hideFromSelect) ?? null;
    assert.equal(nextCampaignLevelIndex(lastBeam), firstOverclock);

    const names = levelSelectEntries().filter(entry => entry.type === 'level').map(entry => entry.lvl.name);
    assert.equal(names.includes('Level 9: Fragile Grid'), false);
    assert.equal(names.includes('Level 10: Fast Shipping'), false);
    assert.ok(names.includes('W4-L1: Glass'));
    assert.equal(names.includes('Level 11: Time Dilation'), false, 'old Overclock placeholder hidden');
    assert.equal(names.includes('Level 12: Danger Courier'), false, 'old Overclock placeholder hidden');
    const grid = LEVELS.find(level => level.name === 'Level 9: Fragile Grid');
    const fast = LEVELS.find(level => level.name === 'Level 10: Fast Shipping');
    assert.equal(grid.hideFromSelect, true);
    assert.equal(fast.hideFromSelect, true);
    assert.ok(LEVELS.includes(grid) && LEVELS.includes(fast), 'hidden levels stay in LEVELS for the editor');

    // Continue from a cursor parked on the hidden placeholder opens W4, not the placeholder.
    restoreProgress();
    state.maxUnlockedLevel = LEVELS.indexOf(grid);
    const opened = firstSelectableLevel(state.maxUnlockedLevel, isLevelUnlocked);
    assert.equal(opened, beam.levels[0]);
    restoreProgress();
});

check('purchased Echo Shield only works on levels that list it', () => {
    restoreProgress();
    state.abilitiesPurchased = { ghostShield: true };
    // Cumulative gate still contains the shield (W4 lists it). L1/L2 must ignore that.
    state.worldUnlockedAbilities = ['dash', 'toss', 'cloak', 'ghostShield'];
    state.levelAbilityOverrides = [];

    for (const prefix of ['W4-L1', 'W4-L2', 'Level 11: Time Dilation', 'Level 12: Danger Courier']) {
        const { level } = levelNamed(prefix);
        state.currentLevelMeta = level;
        state.levelAbilityOverrides = [];
        assert.equal(getUnlockedAbilities().includes('ghostShield'), false, prefix);
    }

    const l3 = levelNamed('W4-L3').level;
    state.currentLevelMeta = l3;
    state.levelAbilityOverrides = [];
    assert.equal(getUnlockedAbilities().includes('ghostShield'), true, 'L3 grants the shield');

    state.abilitiesPurchased = {};
    state.currentLevelMeta = { ...l3, grants: [], unlocks: ['ghostShield'] };
    state.levelAbilityOverrides = [];
    assert.equal(getUnlockedAbilities().includes('ghostShield'), false, 'listing it is not a grant');
    state.abilitiesPurchased = { ghostShield: true };
    assert.equal(getUnlockedAbilities().includes('ghostShield'), true, 'a level that lists it accepts the purchase');

    const w4 = getWorldUnlockedAbilitiesForWorld(4);
    const w5 = getWorldUnlockedAbilitiesForWorld(5);
    assert.ok(w4.includes('ghostShield'));
    assert.ok(w4.includes('dash') && w4.includes('toss') && w4.includes('cloak'));
    assert.equal(w5.includes('ghostShield'), false);
    assert.ok(w5.includes('dash') && w5.includes('toss') && w5.includes('cloak'));

    setUnlockAll(true);
    assert.equal(isDevMode(), true);
    const all = getUnlockedAbilities();
    for (const id of ['dash', 'toss', 'cloak', 'ghostShield']) {
        assert.ok(all.includes(id), id);
    }
    restoreProgress();
});

if (failures) {
    console.log(`\n${failures} failed`);
    process.exit(1);
}
console.log('ok - world order, hidden placeholders, and Echo Shield scope');
