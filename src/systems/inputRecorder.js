// Records gameplay key state per simulated tick so a run can be replayed headlessly
// (tests/harness/replay.mjs). Frames are run-length encoded and split into loops
// at every rewind (R press, loop timer, or fail reset).
export const RECORDED_KEYS = ['w', 'a', 's', 'd', 'space', 'j', 'k', 'l', 'r', 'shift', 'f', 'c'];

let rec = null;

export function frameKey(keys) {
    return RECORDED_KEYS.filter(k => keys[k]).join('+');
}

export function beginRecording(source) {
    rec = { source, loops: [[]] };
}

export function recordFrame(keys) {
    if (!rec) return;
    const loop = rec.loops[rec.loops.length - 1];
    const k = frameKey(keys);
    const last = loop[loop.length - 1];
    if (last && last[0] === k) last[1]++;
    else loop.push([k, 1]);
}

export function markLoopBoundary() {
    if (rec) rec.loops.push([]);
}

export function getRecording() {
    if (!rec) return null;
    const loops = rec.loops.filter(l => l.length);
    return { format: 'echo-courier-solution/v1', ...rec.source, loops };
}
