import { beginAttack } from './combat.js';
import { weaponMove } from './weapons.js';

export const ECHO_ASSAULT_COOLDOWN = 72;
export const ECHO_RECALL_COOLDOWN = 150;
export const ECHO_COMMAND_LOCK_TICKS = 28;

function livingEnemies(enemies) {
    return (enemies || []).filter(enemy => enemy && !enemy.dead && enemy.hp !== 0);
}

function nearestEnemy(actor, enemies) {
    let best = null;
    let bestDistance = Infinity;
    const ax = actor.x + (actor.w || 30) / 2;
    const ay = actor.y + (actor.h || 30) / 2;
    for (const enemy of livingEnemies(enemies)) {
        const dx = enemy.x + (enemy.w || 30) / 2 - ax;
        const dy = enemy.y + (enemy.h || 30) / 2 - ay;
        const distance = dx * dx + dy * dy;
        if (distance < bestDistance) { best = enemy; bestDistance = distance; }
    }
    return best;
}

function faceTarget(actor, target) {
    const dx = target.x + (target.w || 30) / 2 - (actor.x + (actor.w || 30) / 2);
    const dy = target.y + (target.h || 30) / 2 - (actor.y + (actor.h || 30) / 2);
    if (Math.abs(dx) >= Math.abs(dy)) { actor.facingX = Math.sign(dx) || 1; actor.facingY = 0; }
    else { actor.facingX = 0; actor.facingY = Math.sign(dy) || 1; }
}

export function commandEchoAssault(ghosts, enemies, weaponId) {
    let commanded = 0;
    for (const ghost of ghosts || []) {
        if (!ghost?.isActive || ghost.vaporized) continue;
        const target = nearestEnemy(ghost, enemies);
        if (!target) continue;
        faceTarget(ghost, target);
        ghost.attackTicks = 0;
        ghost.weaponAction = 'quick';
        if (!beginAttack(ghost, weaponMove(weaponId, 'quick'))) continue;
        ghost.commandLockTicks = ECHO_COMMAND_LOCK_TICKS;
        ghost.commandFxTicks = ECHO_COMMAND_LOCK_TICKS;
        ghost.commandTarget = target;
        commanded++;
    }
    return commanded;
}

function blocked(x, y, ghost, walls) {
    return (walls || []).some(wall => x < wall.x + wall.w && x + ghost.w > wall.x && y < wall.y + wall.h && y + ghost.h > wall.y);
}

export function recallEchoes(ghosts, player, walls) {
    if (!player) return 0;
    const slots = [
        { x: -48, y: 8 }, { x: 48, y: 8 }, { x: 0, y: -48 },
        { x: -48, y: -40 }, { x: 48, y: -40 }, { x: 0, y: 52 }
    ];
    let recalled = 0;
    for (const ghost of ghosts || []) {
        if (!ghost?.isActive || ghost.vaporized) continue;
        const slot = slots[recalled % slots.length];
        let x = player.x + slot.x;
        let y = player.y + slot.y;
        if (blocked(x, y, ghost, walls)) { x = player.x; y = player.y; }
        const step = ghost.runData?.[Math.min(Math.floor(ghost.localTick || 0), Math.max(0, (ghost.runData?.length || 1) - 1))];
        ghost.replayOffsetX = x - (step?.x ?? ghost.x);
        ghost.replayOffsetY = y - (step?.y ?? ghost.y);
        ghost.x = x;
        ghost.y = y;
        ghost.commandLockTicks = 12;
        ghost.commandFxTicks = ECHO_COMMAND_LOCK_TICKS;
        ghost.commandTarget = null;
        recalled++;
    }
    return recalled;
}
