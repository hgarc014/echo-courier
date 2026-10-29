import assert from 'node:assert/strict';
import { aspectModifiers, COMBAT_ASPECTS, REPEATABLE_ASPECTS, hasAspect, isRepeatableAspect, pickAspectChoices } from '../src/rogue/aspects.js';

assert.equal(COMBAT_ASPECTS.length, 8);
assert.equal(new Set(COMBAT_ASPECTS.map(aspect => aspect.id)).size, 8);
const first = pickAspectChoices(42, [], 3);
assert.equal(first.length, 3);
assert.equal(new Set(first.map(aspect => aspect.id)).size, 3, 'draft contains distinct choices');
assert.deepEqual(first, pickAspectChoices(42, [], 3), 'same run seed produces the same draft');
assert.notDeepEqual(first, pickAspectChoices(43, [], 3), 'different seed varies the draft');
const held = first.map(aspect => aspect.id);
const next = pickAspectChoices(42, held, 3);
assert.equal(next.some(aspect => held.includes(aspect.id)), false, 'held Aspects are excluded');
const exhausted = pickAspectChoices(42, COMBAT_ASPECTS.map(aspect => aspect.id), 3);
assert.equal(exhausted.length, 3, 'an exhausted unique pool still offers three rewards');
assert.equal(new Set(exhausted.map(aspect => aspect.id)).size, 3, 'repeatable fallback choices stay distinct');
assert.equal(exhausted.every(aspect => aspect.repeatable && isRepeatableAspect(aspect.id)), true);
assert.deepEqual(exhausted, pickAspectChoices(42, COMBAT_ASPECTS.map(aspect => aspect.id), 3), 'fallback draft is deterministic');
assert.equal(REPEATABLE_ASPECTS.length, 3);
assert.equal(hasAspect({ aspects: held }, held[0]), true);
assert.equal(hasAspect({ aspects: held }, 'not-owned'), false);
assert.deepEqual(aspectModifiers({ aspects: [
    'recoil-echo', 'second-strike', 'afterimage-blade', 'wide-rupture',
    'hourglass-heart', 'sand-leech', 'echo-chorus', 'stillstep'
]}), {
    stillstepDamage: 2,
    echoDamage: 2,
    echoKnockback: 24,
    blinkDamage: 2,
    ruptureRadius: 230,
    maxHpBonus: 1,
    sandOnKill: 0.25,
    secondStrike: true
});

console.log('combat aspects ok');
