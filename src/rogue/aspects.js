export const COMBAT_ASPECTS = Object.freeze([
    Object.freeze({ id: 'recoil-echo', family: 'echo', label: 'Recoil Echo', detail: 'Echo strikes launch enemies farther.' }),
    Object.freeze({ id: 'second-strike', family: 'attack', label: 'Second Strike', detail: 'Your melee swing repeats once after a short delay.' }),
    Object.freeze({ id: 'afterimage-blade', family: 'blink', label: 'Afterimage Blade', detail: 'Blink afterimages deal double damage.' }),
    Object.freeze({ id: 'wide-rupture', family: 'rupture', label: 'Wide Rupture', detail: 'Time Rupture catches a wider area.' }),
    Object.freeze({ id: 'hourglass-heart', family: 'survival', label: 'Hourglass Heart', detail: '+1 maximum Integrity and heal 1.' }),
    Object.freeze({ id: 'sand-leech', family: 'sand', label: 'Sand Leech', detail: 'Kills restore a small amount of sand.' }),
    Object.freeze({ id: 'echo-chorus', family: 'echo', label: 'Echo Chorus', detail: 'Echo attacks deal +1 damage.' }),
    Object.freeze({ id: 'stillstep', family: 'movement', label: 'Stillstep', detail: 'Standing still briefly empowers your next strike.' })
]);

function mix(seed) {
    let value = seed >>> 0;
    value ^= value >>> 16;
    value = Math.imul(value, 0x7feb352d);
    value ^= value >>> 15;
    value = Math.imul(value, 0x846ca68b);
    return (value ^ (value >>> 16)) >>> 0;
}

export function pickAspectChoices(seed, held = [], count = 3) {
    const owned = new Set(held || []);
    const pool = COMBAT_ASPECTS.filter(aspect => !owned.has(aspect.id));
    const choices = [];
    let code = seed >>> 0;
    while (pool.length && choices.length < count) {
        code = mix(code + choices.length * 7919 + 17);
        choices.push(pool.splice(code % pool.length, 1)[0]);
    }
    return choices;
}

export function hasAspect(run, id) {
    return !!run?.aspects?.includes(id);
}

export function aspectModifiers(run) {
    return {
        stillstepDamage: hasAspect(run, 'stillstep') ? 2 : 1,
        echoDamage: hasAspect(run, 'echo-chorus') ? 2 : 1,
        echoKnockback: hasAspect(run, 'recoil-echo') ? 24 : 12,
        blinkDamage: hasAspect(run, 'afterimage-blade') ? 2 : 1,
        ruptureRadius: hasAspect(run, 'wide-rupture') ? 230 : 160,
        maxHpBonus: hasAspect(run, 'hourglass-heart') ? 1 : 0,
        sandOnKill: hasAspect(run, 'sand-leech') ? 0.25 : 0,
        secondStrike: hasAspect(run, 'second-strike')
    };
}
