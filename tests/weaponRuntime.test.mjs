import assert from 'node:assert/strict';
import { createWeaponEffects, syncEchoStrike, tickWeaponEffects } from '../src/rogue/weaponRuntime.js';
import { weaponMove } from '../src/rogue/weapons.js';

const actor = { x: 100, y: 100, w: 30, h: 30, facingX: 1, facingY: 0 };
const parcel = createWeaponEffects(actor, weaponMove('parcel-driver', 'heavy'));
assert.equal(parcel[0].kind, 'parcel');
const enemy = { x: 160, y: 105, w: 30, h: 30, dead: false };
let damage = 0;
let effects = parcel;
for (let i = 0; i < 10 && effects.length; i++) effects = tickWeaponEffects(effects, [enemy], (_target, _id, amount) => { damage += amount; }, []);
assert.equal(damage, 4);

const cuts = createWeaponEffects(actor, weaponMove('route-cutter', 'special'));
assert.equal(cuts.length, 2);
assert.ok(cuts.every(effect => effect.kind === 'cut' && effect.ticks === 300));

const decoy = createWeaponEffects(actor, weaponMove('parcel-driver', 'special'))[0];
assert.equal(decoy.isDecoy, true);
assert.equal(decoy.isActive, true);

const ghost = { isActive: true, x: 120, y: 100, localTick: 0, runData: [{}, {}, { attack: true }, {}] };
assert.equal(syncEchoStrike([ghost], actor, 180), 1);
assert.equal(ghost.localTick, 2);

console.log('weapon runtime ok');
