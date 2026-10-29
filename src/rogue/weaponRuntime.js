function facing(actor) {
    let x = actor.facingX || 0;
    let y = actor.facingY || 0;
    if (!x && !y) x = 1;
    const length = Math.hypot(x, y) || 1;
    return { x: x / length, y: y / length };
}

function cutRect(actor, move, perpendicular = false) {
    const f = facing(actor);
    const fx = perpendicular ? -f.y : f.x;
    const fy = perpendicular ? f.x : f.y;
    const cx = actor.x + actor.w / 2 + fx * move.range / 2;
    const cy = actor.y + actor.h / 2 + fy * move.range / 2;
    return Math.abs(fx) >= Math.abs(fy)
        ? { x: cx - move.range / 2, y: cy - move.width / 2, w: move.range, h: move.width }
        : { x: cx - move.width / 2, y: cy - move.range / 2, w: move.width, h: move.range };
}

export function createWeaponEffects(actor, move, ownerId = 'player') {
    if (!actor || !move) return [];
    const f = facing(actor);
    const cx = actor.x + actor.w / 2;
    const cy = actor.y + actor.h / 2;
    if (move.effect === 'projectile-heavy') {
        return [{ kind: 'parcel', ownerId, x: cx - 10, y: cy - 10, w: 20, h: 20,
            vx: f.x * 8, vy: f.y * 8, ticks: Math.ceil(move.range / 8), damage: move.damage, hit: new WeakSet() }];
    }
    if (move.effect === 'projectile-decoy') {
        return [{ kind: 'decoy', ownerId, x: cx + f.x * 100 - 15, y: cy + f.y * 100 - 15,
            w: 30, h: 30, ticks: 180, isActive: true, isDecoy: true }];
    }
    if (move.effect === 'temporal-cut' || move.effect === 'temporal-crosscut') {
        const effects = [{ kind: 'cut', ownerId, ...cutRect(actor, move), ticks: 300, damage: move.damage, hit: new WeakSet() }];
        if (move.effect === 'temporal-crosscut') effects.push({ kind: 'cut', ownerId, ...cutRect(actor, move, true), ticks: 300, damage: move.damage, hit: new WeakSet() });
        return effects;
    }
    return [];
}

function overlaps(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function tickWeaponEffects(effects, enemies, hitEnemy, walls = []) {
    for (const effect of effects || []) {
        if (effect.kind === 'parcel') {
            const nx = effect.x + effect.vx;
            const ny = effect.y + effect.vy;
            if (walls.some(wall => overlaps({ ...effect, x: nx, y: ny }, wall))) effect.ticks = 0;
            else { effect.x = nx; effect.y = ny; }
        }
        if (effect.kind === 'parcel' || effect.kind === 'cut') {
            for (const enemy of enemies || []) {
                if (!enemy || enemy.dead || effect.hit.has(enemy) || !overlaps(effect, enemy)) continue;
                effect.hit.add(enemy);
                hitEnemy(enemy, `weapon:${effect.ownerId}:${effect.kind}:${effect.x}:${effect.y}`, effect.damage);
                if (effect.kind === 'parcel') effect.ticks = 0;
            }
        }
        effect.ticks--;
        if (effect.ticks <= 0 && effect.kind === 'decoy') effect.isActive = false;
    }
    return (effects || []).filter(effect => effect.ticks > 0);
}

export function syncEchoStrike(ghosts, origin, range = 180) {
    let advanced = 0;
    for (const ghost of ghosts || []) {
        if (!ghost?.isActive || Math.hypot(ghost.x - origin.x, ghost.y - origin.y) > range) continue;
        const start = Math.ceil(ghost.localTick || 0);
        const next = ghost.runData?.findIndex((frame, index) => index > start && frame.attack);
        if (next > start) { ghost.localTick = next; advanced++; }
    }
    return advanced;
}
