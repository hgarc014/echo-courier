// Pure HUD copy for the Sinkhole boss and the plate/crack step warning.
import { actorPressesPlate } from './hitZones.js';

export const DOOR_OPEN_GOAL = 'Door open! Carry the parcel to the green pad and drop it with SPACE.';

// "Stuns 1/3 · Door 33%" while the boss lives; the goal line once the door is open.
export function burrowerHud(boss, { delivered = false } = {}) {
    if (!boss) return null;
    const max = Math.max(1, Number(boss.maxHp) || 1);
    const stuns = Math.max(0, Math.min(max, max - (Number(boss.hp) || 0)));
    const doorPct = Math.round((stuns / max) * 100);
    const open = !!boss.defeated || stuns >= max;
    return {
        stuns,
        max,
        doorPct,
        open,
        progress: open ? `Stuns ${stuns}/${max} · Door OPEN` : `Stuns ${stuns}/${max} · Door ${doorPct}%`,
        goal: open && !delivered ? DOOR_OPEN_GOAL : null
    };
}

function overlaps(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// Intact cracks the actor's body already hangs over while it stands on a plate.
// Not lethal yet (the kill rule is centre-in-hole), but one more step is.
export function crackEdgeWarning(actor, plates, cracks) {
    if (!actor || actor.isActive === false) return [];
    const onPlate = (plates || []).some(p => p && actorPressesPlate(actor, p));
    if (!onPlate) return [];
    return (cracks || []).filter(c => c && !c.broken && overlaps(actor, c)
        && !(typeof c.overlapsPlate === 'function' && c.overlapsPlate()));
}
