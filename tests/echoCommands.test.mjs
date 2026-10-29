import assert from 'node:assert/strict';

globalThis.localStorage = { getItem: () => null, setItem() {} };
globalThis.Image = class { set src(_value) {} };

const { commandEchoAssault, recallEchoes, ECHO_COMMAND_LOCK_TICKS } = await import('../src/rogue/echoCommands.js');

function ghost(x, y) {
    return {
        x, y, w: 30, h: 30, isActive: true, attackTicks: 0, attackId: 0,
        runData: [{ x, y }], localTick: 0, facingX: 1, facingY: 0
    };
}

const left = ghost(100, 100);
const right = ghost(300, 100);
const enemies = [
    { x: 40, y: 100, w: 30, h: 30, hp: 2 },
    { x: 380, y: 100, w: 30, h: 30, hp: 2 }
];
assert.equal(commandEchoAssault([left, right], enemies, 'chrono-baton'), 2);
assert.equal(left.facingX, -1, 'left echo faces its nearest target');
assert.equal(right.facingX, 1, 'right echo faces its nearest target');
assert.equal(left.commandLockTicks, ECHO_COMMAND_LOCK_TICKS);
assert.ok(left.attackTicks > 0, 'assault begins an immediate weapon attack');

const recalled = ghost(600, 500);
assert.equal(recallEchoes([recalled], { x: 200, y: 200 }, []), 1);
assert.deepEqual({ x: recalled.x, y: recalled.y }, { x: 152, y: 208 });
assert.equal(recalled.replayOffsetX, -448, 'recall offsets future replay frames instead of snapping back');

const blocked = ghost(600, 500);
assert.equal(recallEchoes([blocked], { x: 200, y: 200 }, [{ x: 140, y: 190, w: 60, h: 70 }]), 1);
assert.deepEqual({ x: blocked.x, y: blocked.y }, { x: 200, y: 200 }, 'blocked recall slot falls back to courier');

const dead = { ...ghost(0, 0), isActive: false };
assert.equal(commandEchoAssault([dead], enemies, 'chrono-baton'), 0);
assert.equal(recallEchoes([dead], { x: 0, y: 0 }, []), 0);

console.log('echo commands ok');
