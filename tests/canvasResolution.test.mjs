import assert from 'node:assert/strict';
import { backingStoreSize, syncCanvasResolution } from '../src/core/canvasResolution.js';

assert.deepEqual(backingStoreSize(800, 600, 1), { width: 800, height: 600, scale: 1 });
assert.deepEqual(backingStoreSize(1600, 1200, 1), { width: 1600, height: 1200, scale: 1 });
assert.deepEqual(backingStoreSize(800, 600, 2), { width: 1600, height: 1200, scale: 2 });
assert.deepEqual(backingStoreSize(2000, 1500, 2), { width: 2560, height: 1920, scale: 1.28 });

const calls = [];
const canvas = { width: 800, height: 600, getBoundingClientRect: () => ({ width: 1600, height: 1200 }) };
const ctx = { setTransform: (...args) => calls.push(args), imageSmoothingEnabled: false, imageSmoothingQuality: 'low' };
const result = syncCanvasResolution(canvas, ctx, 800, 600);
assert.equal(canvas.width, 1600);
assert.equal(canvas.height, 1200);
assert.deepEqual(calls.at(-1), [2, 0, 0, 2, 0, 0]);
assert.equal(ctx.imageSmoothingEnabled, true);
assert.equal(ctx.imageSmoothingQuality, 'high');
assert.equal(result.scaleX, 2);

console.log('canvas resolution ok');
