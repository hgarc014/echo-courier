import assert from 'node:assert/strict';
import { trainingMetrics, validateWeaponCatalog, WEAPON_FAMILIES, WEAPON_INPUTS, weaponMove } from '../src/rogue/weapons.js';

assert.deepEqual(Object.keys(WEAPON_FAMILIES), ['chrono-baton', 'parcel-driver', 'route-cutter']);
assert.deepEqual(validateWeaponCatalog(), []);
for (const weapon of Object.values(WEAPON_FAMILIES)) {
    assert.deepEqual(Object.keys(weapon.moves), ['quick', 'heavy', 'special']);
    assert.ok(weapon.rewindInteraction.length > 20);
    assert.equal(weapon.builds.length, 2);
    for (const build of weapon.builds) assert.equal(build.aspects.length, 2);
    const metrics = trainingMetrics(weapon.id);
    assert.ok(metrics.quickDps > 0);
    assert.ok(metrics.safetyRange >= weapon.moves.quick.range);
    assert.ok(metrics.readabilityFrames >= 5);
}
assert.equal(weaponMove('parcel-driver', 'heavy').effect, 'projectile-heavy');
assert.equal(weaponMove('route-cutter', 'special').effect, 'temporal-crosscut');
for (const action of ['quick', 'heavy', 'special']) {
    assert.ok(WEAPON_INPUTS[action].keyboard.length >= 1);
    assert.ok(WEAPON_INPUTS[action].controller.length >= 1);
    assert.ok(WEAPON_INPUTS[action].mobile);
}

console.log('weapon catalog ok');
