export const PLAYER_MAX_HP = 5;
export const PLAYER_HIT_IFRAMES = 45;
export const ATTACK_TOTAL_TICKS = 20;
export const ATTACK_ACTIVE_FROM = 5;
export const ATTACK_ACTIVE_TO = 10;
export const TICK_HOUND_HP = 3;

export function beginAttack(actor, move = null) {
    if (!actor || (actor.attackTicks | 0) > 0) return false;
    const total = move ? move.windup + move.active + move.recovery : ATTACK_TOTAL_TICKS;
    actor.attackTotalTicks = total;
    actor.attackActiveFrom = move?.windup ?? ATTACK_ACTIVE_FROM;
    actor.attackActiveTo = actor.attackActiveFrom + (move?.active ?? (ATTACK_ACTIVE_TO - ATTACK_ACTIVE_FROM + 1)) - 1;
    actor.attackRange = move?.range ?? 48;
    actor.attackWidth = move?.width ?? 46;
    actor.attackDamage = move?.damage ?? 1;
    actor.weaponMove = move;
    actor.weaponEffectFired = false;
    actor.attackTicks = total;
    actor.attackId = (actor.attackId | 0) + 1;
    return true;
}

export function tickAttack(actor) {
    if (actor && actor.attackTicks > 0) actor.attackTicks--;
}

export function attackIsActive(actor) {
    const total = actor?.attackTotalTicks || ATTACK_TOTAL_TICKS;
    const elapsed = total - (actor?.attackTicks | 0);
    return elapsed >= (actor?.attackActiveFrom ?? ATTACK_ACTIVE_FROM) && elapsed <= (actor?.attackActiveTo ?? ATTACK_ACTIVE_TO);
}

export function attackBox(actor, range = actor?.attackRange || 48, width = actor?.attackWidth || 46) {
    const cx = actor.x + actor.w / 2;
    const cy = actor.y + actor.h / 2;
    let fx = actor.facingX || 0;
    let fy = actor.facingY || 0;
    if (!fx && !fy) fx = 1;
    if (Math.abs(fx) >= Math.abs(fy)) {
        return { x: fx >= 0 ? cx : cx - range, y: cy - width / 2, w: range, h: width };
    }
    return { x: cx - width / 2, y: fy >= 0 ? cy : cy - range, w: width, h: range };
}

export function applyCombatDamage(player, amount = 1) {
    if (!player || (player.invulnTicks | 0) > 0 || player.hp <= 0) return false;
    player.hp = Math.max(0, (player.hp ?? PLAYER_MAX_HP) - amount);
    player.invulnTicks = PLAYER_HIT_IFRAMES;
    return true;
}
