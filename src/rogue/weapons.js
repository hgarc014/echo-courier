export const WEAPON_INPUTS = Object.freeze({
    quick: Object.freeze({ keyboard: ['Space', 'J'], controller: ['X', 'R1'], mobile: 'ACTION' }),
    heavy: Object.freeze({ keyboard: ['K'], controller: ['Y', 'R2'], mobile: 'HEAVY' }),
    special: Object.freeze({ keyboard: ['L'], controller: ['B', 'L1'], mobile: 'SPECIAL' })
});

function move(id, values) {
    return Object.freeze({ id, ...values });
}

export const WEAPON_FAMILIES = Object.freeze({
    'chrono-baton': Object.freeze({
        id: 'chrono-baton', name: 'Chrono Baton', fantasy: 'Fast close-range tempo and synchronized Echo pressure.',
        moves: Object.freeze({
            quick: move('baton-snap', { windup: 5, active: 6, recovery: 9, damage: 1, range: 48, width: 46, cooldown: 0, sandCost: 0, effect: 'melee' }),
            heavy: move('baton-reversal', { windup: 18, active: 8, recovery: 22, damage: 3, range: 66, width: 58, cooldown: 0, sandCost: 0, effect: 'melee-knockback' }),
            special: move('baton-sync', { windup: 10, active: 1, recovery: 20, damage: 0, range: 180, width: 180, cooldown: 180, sandCost: 0.5, effect: 'echo-sync' })
        }),
        rewindInteraction: 'Echoes repeat the exact baton timing; Sync immediately advances nearby Echoes to their next recorded strike.',
        builds: Object.freeze([
            Object.freeze({ name: 'Chorus Tempo', aspects: ['echo-chorus', 'recoil-echo'] }),
            Object.freeze({ name: 'Still Reversal', aspects: ['stillstep', 'second-strike'] })
        ])
    }),
    'parcel-driver': Object.freeze({
        id: 'parcel-driver', name: 'Parcel Driver', fantasy: 'Launch temporal cargo as dangerous ammunition.',
        moves: Object.freeze({
            quick: move('driver-tap', { windup: 8, active: 5, recovery: 12, damage: 1, range: 54, width: 42, cooldown: 0, sandCost: 0, effect: 'melee' }),
            heavy: move('heavy-parcel', { windup: 24, active: 24, recovery: 26, damage: 4, range: 320, width: 34, cooldown: 0, sandCost: 0, effect: 'projectile-heavy' }),
            special: move('decoy-parcel', { windup: 12, active: 1, recovery: 18, damage: 0, range: 240, width: 40, cooldown: 150, sandCost: 0.75, effect: 'projectile-decoy' })
        }),
        rewindInteraction: 'Thrown parcels rewind to their launch point; Echoes replay the throw to create crossfire and decoy routes.',
        builds: Object.freeze([
            Object.freeze({ name: 'Afterimage Freight', aspects: ['afterimage-blade', 'sand-leech'] }),
            Object.freeze({ name: 'Double Dispatch', aspects: ['second-strike', 'echo-chorus'] })
        ])
    }),
    'route-cutter': Object.freeze({
        id: 'route-cutter', name: 'Route Cutter', fantasy: 'Cut delayed hazards into space and make timelines cross them.',
        moves: Object.freeze({
            quick: move('cutter-slice', { windup: 7, active: 6, recovery: 12, damage: 1, range: 58, width: 38, cooldown: 0, sandCost: 0, effect: 'melee' }),
            heavy: move('route-sever', { windup: 20, active: 1, recovery: 24, damage: 3, range: 130, width: 12, cooldown: 0, sandCost: 0, effect: 'temporal-cut' }),
            special: move('crosscut', { windup: 14, active: 1, recovery: 22, damage: 2, range: 170, width: 12, cooldown: 180, sandCost: 0.75, effect: 'temporal-crosscut' })
        }),
        rewindInteraction: 'Cuts persist through rewind and detonate when crossed by the courier, an enemy, or the Echo that repeats their placement.',
        builds: Object.freeze([
            Object.freeze({ name: 'Wide Fracture', aspects: ['wide-rupture', 'afterimage-blade'] }),
            Object.freeze({ name: 'Patient Route', aspects: ['stillstep', 'sand-leech'] })
        ])
    })
});

export function weaponDefinition(id) {
    return WEAPON_FAMILIES[id] || WEAPON_FAMILIES['chrono-baton'];
}

export function weaponMove(weaponId, action) {
    return weaponDefinition(weaponId).moves[action] || null;
}

export function trainingMetrics(weaponId) {
    const weapon = weaponDefinition(weaponId);
    const quick = weapon.moves.quick;
    const heavy = weapon.moves.heavy;
    const quickSeconds = (quick.windup + quick.active + quick.recovery) / 60;
    return {
        weaponId: weapon.id,
        quickDps: Math.round((quick.damage / quickSeconds) * 10) / 10,
        burstDamage: heavy.damage,
        safetyRange: Math.max(...Object.values(weapon.moves).map(entry => entry.range)),
        crowdControl: Object.values(weapon.moves).filter(entry => /knockback|decoy|cut|crosscut/.test(entry.effect)).length,
        readabilityFrames: Math.min(...Object.values(weapon.moves).map(entry => entry.windup))
    };
}

export function validateWeaponCatalog() {
    const errors = [];
    for (const weapon of Object.values(WEAPON_FAMILIES)) {
        for (const action of ['quick', 'heavy', 'special']) {
            const entry = weapon.moves[action];
            if (!entry) errors.push(`${weapon.id}: missing ${action}`);
            else if (entry.windup < 1 || entry.recovery < 1 || entry.damage < 0 || entry.range <= 0) errors.push(`${weapon.id}/${action}: invalid timings`);
        }
        if (!weapon.rewindInteraction) errors.push(`${weapon.id}: missing rewind interaction`);
        if (weapon.builds.length < 2 || weapon.builds.some(build => build.aspects.length < 2)) errors.push(`${weapon.id}: needs two builds`);
    }
    return errors;
}
