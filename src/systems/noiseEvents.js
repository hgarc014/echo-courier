// Shared noise log for the Panopticon. Drones keep their own per-tick list.
// Guards (decoy landings only) and the Warden read this log. Cleared on every
// loop boundary so facing and lures restart with the tick counter.
import { state } from '../core/state.js';

export function resetNoiseEvents() {
    state.noiseEvents = [];
    state.alarmWasOn = false;
}

export function pushNoiseEvent(x, y, kind) {
    if (!Array.isArray(state.noiseEvents)) state.noiseEvents = [];
    const seq = state.noiseEvents.length;
    state.noiseEvents.push({
        x, y, kind,
        tick: state.currentTick || 0,
        seq
    });
}

// Latest event, optionally filtered by kind. Ties break toward the later seq.
export function latestNoise(events, kinds) {
    const list = events || [];
    let best = null;
    for (const e of list) {
        if (!e) continue;
        if (kinds && !kinds.includes(e.kind)) continue;
        if (!best || e.tick > best.tick || (e.tick === best.tick && e.seq > best.seq)) best = e;
    }
    return best;
}
