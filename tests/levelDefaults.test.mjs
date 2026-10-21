// Explicit 0 must survive camera deserialize; omitted angles keep the old defaults.
// Run: node tests/levelDefaults.test.mjs
import assert from 'node:assert/strict';
import { installDomStubs } from './harness/domStub.mjs';

installDomStubs();
const { serializeLevel, deserializeLevel } = await import('../src/data/levels.js');

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('ok -', name); };

test('camera baseAngle 0 and sweepRange 0 deserialize to 0/0', () => {
    const cam = deserializeLevel({
        cameras: [{ x: 120, y: 40, baseAngle: 0, sweepRange: 0 }]
    }).cameras[0];
    assert.equal(cam.baseAngle, 0);
    assert.equal(cam.sweepRange, 0);
});

test('zero camera angle and sweep survive serializeLevel -> JSON -> deserializeLevel', () => {
    const setup = deserializeLevel({
        cameras: [{ x: 120, y: 40, baseAngle: 0, sweepRange: 0 }]
    });
    const json = JSON.parse(JSON.stringify(serializeLevel(setup)));
    assert.equal(json.cameras[0].baseAngle, 0);
    assert.equal(json.cameras[0].sweepRange, 0);
    const again = deserializeLevel(json).cameras[0];
    assert.equal(again.baseAngle, 0);
    assert.equal(again.sweepRange, 0);
});

test('missing camera angles still default to 0 and Math.PI/2', () => {
    const cam = deserializeLevel({
        cameras: [{ x: 120, y: 40 }]
    }).cameras[0];
    assert.equal(cam.baseAngle, 0);
    assert.equal(cam.sweepRange, Math.PI / 2);
});

console.log(`\n${passed} tests passed`);
