import assert from 'node:assert/strict';
import { buildRunSummary, chooseHubReaction, nextNarrativeState } from '../src/rogue/runNarrative.js';

const summary = buildRunSummary({
    deathCause: 'Mauled by a Tick Hound!',
    rogueRun: { weapon: 'chrono-baton', aspects: ['sand-tank'], lastBossReached: 'burrower', ruptureSeq: 2, echoesDeployed: 1 },
    runStats: { tosses: 1, cloaks: 0 }
});
assert.equal(summary.deathCause, 'Mauled by a Tick Hound!');
assert.equal(summary.weapon, 'chrono-baton');
assert.equal(summary.bossReached, 'burrower');
assert.equal(summary.bossDepth, 2);
assert.equal(summary.temporalEvent, 'time-rupture');
assert.equal(summary.policyViolations, 1);

const seen = [];
for (let run = 0; run < 5; run++) {
    const reaction = chooseHubReaction(summary, { runNumber: run, recentIds: seen });
    assert.ok(reaction.text.length > 0);
    assert.equal(seen.includes(reaction.id), false, 'recent dialogue does not repeat');
    seen.push(reaction.id);
}
assert.equal(new Set(seen).size, 5, 'five runs produce five distinct reactions');

let meta = { runs: 0, recentDialogueIds: [], auditorTrust: 0, relationshipUnlocked: false };
for (let i = 0; i < 3; i++) {
    const next = nextNarrativeState({ ...meta, runs: i }, summary);
    meta = { ...meta, ...next, lastReaction: next.reaction };
}
assert.equal(meta.relationshipUnlocked, true, 'three policy-breaking runs unlock the auditor relationship');
assert.ok(meta.recentDialogueIds.length <= 5);

console.log('run narrative ok');
