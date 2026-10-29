import { prepareLoadedAsset } from './sprites.js';

export const PLAYER_SHEET_PATH = 'assets/sprite-sheets/echo-courier-characters.png';
export const PROPS_SHEET_PATH = 'assets/sprite-sheets/echo-courier-props-hazards.png';
export const ENV_SHEET_PATH = 'assets/sprite-sheets/echo-courier-environment-effects.png';
export const TICK_HOUND_SHEET_PATH = 'assets/sprite-sheets/tick-hound-v2.png';
export const VFX_SHEET_PATH = 'assets/sprite-sheets/echo-courier-vfx-v2.png';
export const MODERN_PROPS_SHEET_PATH = 'assets/sprite-sheets/echo-courier-props-v2.png';
export const COURIER_ACTIONS_SHEET_PATH = 'assets/sprite-sheets/echo-courier-actions-v2.png';
export const ROGUE_BOSSES_SHEET_PATH = 'assets/sprite-sheets/echo-courier-rogue-bosses-v2.png';
export const BIOME_SCENERY_SHEET_PATH = 'assets/sprite-sheets/echo-courier-biome-scenery-v2.png';

export const VFX_FRAME_GRID = Object.freeze({
    playerSwing: [0, 0], echoSwing: [1, 0], playerImpact: [2, 0], enemyImpact: [3, 0],
    blinkDeparture: [0, 1], blinkArrival: [1, 1], rupture: [2, 1], echoSpawn: [3, 1],
    rewind: [0, 2], rift: [1, 2], enemyWarning: [2, 2], enemyDissolve: [3, 2]
});

export const MODERN_PROPS_FRAME_GRID = Object.freeze({
    package: [0, 0], heavy: [1, 0], fragile: [2, 0], sandRefill: [3, 0],
    sandMax: [0, 1], plate: [1, 1], platePressed: [2, 1], platePresent: [3, 1],
    plateFirst: [0, 2], plateLast: [1, 2], camera: [2, 2], timeShard: [3, 2]
});

export const COURIER_ACTION_FRAME_GRID = Object.freeze({
    quickWindup: [0, 0], quickStrike: [1, 0], quickRecovery: [2, 0], heavyWindup: [3, 0],
    heavyStrike: [0, 1], dashStart: [1, 1], dashTravel: [2, 1], dashRecovery: [3, 1],
    hurt: [0, 2], downed: [1, 2], rupture: [2, 2], rewind: [3, 2]
});

export const ROGUE_BOSS_FRAME_GRID = Object.freeze({
    gatekeeperIdle: [0, 0], gatekeeperCharge: [1, 0], gatekeeperHurt: [2, 0], gatekeeperDead: [3, 0],
    burrowerIdle: [0, 1], burrowerEmerge: [1, 1], burrowerHurt: [2, 1], burrowerDead: [3, 1],
    prismIdle: [0, 2], prismCharge: [1, 2], prismHurt: [2, 2], prismDead: [3, 2]
});

export const BIOME_SCENERY_FRAME_GRID = Object.freeze({
    hallsRack: [0, 0], hallsGearColumn: [1, 0], hallsRelay: [2, 0], hallsBarrier: [3, 0],
    warrensHourglass: [0, 1], warrensDebris: [1, 1], warrensVent: [2, 1], warrensObelisk: [3, 1],
    courtsPlinth: [0, 2], courtsShards: [1, 2], courtsArch: [2, 2], courtsTimeBloom: [3, 2]
});

// Occupancy-measured rects on echo-courier-characters.png (1536x1024).
// Top band y 0-196 (idle/carry/dash/cloak). Walk band y 196-340. 4px pad, bands do not overlap.
export const PLAYER_FRAME_RECTS = {
    idleFront: { x: 42, y: 2, w: 130, h: 194 },
    idleBack: { x: 197, y: 2, w: 132, h: 194 },
    idleRight: { x: 365, y: 4, w: 84, h: 188 },
    idleLeft: { x: 488, y: 3, w: 84, h: 193 },
    idleQtr: { x: 594, y: 2, w: 128, h: 194 },
    carry: { x: 773, y: 3, w: 110, h: 193 },
    dash: { x: 909, y: 21, w: 184, h: 175 },
    cloak: { x: 1141, y: 9, w: 140, h: 187 },
    walkFront: [
        { x: 75, y: 196, w: 97, h: 144 },
        { x: 183, y: 196, w: 98, h: 144 },
        { x: 299, y: 196, w: 97, h: 144 }
    ],
    walkSide: [
        { x: 401, y: 196, w: 104, h: 144 },
        { x: 525, y: 196, w: 86, h: 144 },
        { x: 632, y: 196, w: 84, h: 144 },
        { x: 729, y: 196, w: 88, h: 140 },
        { x: 835, y: 196, w: 83, h: 136 },
        { x: 938, y: 196, w: 89, h: 141 },
        { x: 1048, y: 196, w: 82, h: 141 },
        { x: 1152, y: 196, w: 87, h: 144 },
        { x: 1250, y: 196, w: 99, h: 141 },
        { x: 1351, y: 196, w: 108, h: 141 }
    ]
};

// Guard idle band y 340-500 on the same characters sheet. Walk/shoot/downed skipped (packed, ambiguous).
export const GUARD_FRAME_RECTS = {
    idleFront: { x: 34, y: 340, w: 121, h: 160 }
};

// Occupancy-measured rects on echo-courier-props-hazards.png (1536x1024, RGB checkerboard).
// 4px pad. Crates y 22-257. Pads y 300-393 / hex y 528-644. Camera y 515-619.
export const PROPS_FRAME_RECTS = {
    package: { x: 17, y: 22, w: 237, h: 235 },
    heavy: { x: 277, y: 21, w: 221, h: 230 },
    fragile: { x: 526, y: 20, w: 229, h: 232 },
    plate: { x: 1170, y: 300, w: 150, h: 93 },
    platePressed: { x: 1327, y: 301, w: 151, h: 92 },
    platePresent: { x: 20, y: 529, w: 165, h: 115 },
    plateFirst: { x: 203, y: 528, w: 163, h: 116 },
    plateLast: { x: 387, y: 528, w: 160, h: 116 },
    camera: { x: 582, y: 515, w: 119, h: 104 }
};

// Occupancy-measured rects on echo-courier-environment-effects.png (1536x1024, RGB checkerboard).
export const ENV_FRAME_RECTS = {
    crack: { x: 334, y: 15, w: 105, h: 99 },
    pit: { x: 440, y: 15, w: 107, h: 99 },
    wall: { x: 973, y: 235, w: 214, h: 147 },
    door: { x: 1198, y: 236, w: 260, h: 149 },
    zone: { x: 13, y: 397, w: 131, h: 127 },
    static: { x: 13, y: 545, w: 128, h: 99 },
    wind: { x: 682, y: 534, w: 107, h: 60 },
    laser: { x: 385, y: 680, w: 85, h: 88 }
};

const WALK_TICKS_PER_FRAME = 5;

function keyLightBackground(canvas) {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
        const mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
        if (mx >= 230 && mx - mn <= 18) d[i + 3] = 0;
        else if (mx >= 190 && mx - mn <= 12 && mn >= 180) d[i + 3] = 0;
    }
    ctx.putImageData(imageData, 0, 0);
    return canvas;
}

function sliceRect(sheet, rect, { keyLight = false } = {}) {
    if (!rect) return null;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, rect.w);
    canvas.height = Math.max(1, rect.h);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(sheet, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
    if (keyLight) keyLightBackground(canvas);
    return prepareLoadedAsset(canvas, { crop: true, keyBlack: true });
}

function sheetReady(sheet) {
    if (!sheet) return false;
    const iw = sheet.naturalWidth || sheet.width || 0;
    const ih = sheet.naturalHeight || sheet.height || 0;
    return iw >= 1536 && ih >= 1024;
}

export function buildTickHoundAtlas(sheet) {
    const iw = sheet?.naturalWidth || sheet?.width || 0;
    const ih = sheet?.naturalHeight || sheet?.height || 0;
    if (!iw || !ih) return null;
    const cellW = Math.floor(iw / 4);
    const cellH = Math.floor(ih / 3);
    const frame = (column, row) => sliceRect(sheet, { x: column * cellW, y: row * cellH, w: cellW, h: cellH });
    return {
        ready: true,
        idleFront: frame(0, 0), idleBack: frame(1, 0), idleRight: frame(2, 0), idleLeft: frame(3, 0),
        runRight: [0, 1, 2, 3].map(column => frame(column, 1)),
        windup: frame(0, 2), lunge: frame(1, 2), hit: frame(2, 2), dead: frame(3, 2)
    };
}

export function buildVfxAtlas(sheet) {
    const iw = sheet?.naturalWidth || sheet?.width || 0;
    const ih = sheet?.naturalHeight || sheet?.height || 0;
    if (!iw || !ih) return null;
    const cellW = Math.floor(iw / 4);
    const cellH = Math.floor(ih / 3);
    const atlas = { ready: true, cellW, cellH };
    for (const [name, [column, row]] of Object.entries(VFX_FRAME_GRID)) {
        atlas[name] = sliceRect(sheet, { x: column * cellW, y: row * cellH, w: cellW, h: cellH });
    }
    return atlas;
}

export function buildModernPropsAtlas(sheet) {
    const iw = sheet?.naturalWidth || sheet?.width || 0;
    const ih = sheet?.naturalHeight || sheet?.height || 0;
    if (!iw || !ih) return null;
    const cellW = Math.floor(iw / 4);
    const cellH = Math.floor(ih / 3);
    const atlas = { ready: true, cellW, cellH };
    for (const [name, [column, row]] of Object.entries(MODERN_PROPS_FRAME_GRID)) {
        atlas[name] = sliceRect(sheet, { x: column * cellW, y: row * cellH, w: cellW, h: cellH });
    }
    return atlas;
}

export function buildCourierActionAtlas(sheet) {
    const iw = sheet?.naturalWidth || sheet?.width || 0;
    const ih = sheet?.naturalHeight || sheet?.height || 0;
    if (!iw || !ih) return null;
    const cellW = Math.floor(iw / 4);
    const cellH = Math.floor(ih / 3);
    const atlas = { ready: true, cellW, cellH };
    for (const [name, [column, row]] of Object.entries(COURIER_ACTION_FRAME_GRID)) {
        atlas[name] = sliceRect(sheet, { x: column * cellW, y: row * cellH, w: cellW, h: cellH });
    }
    return atlas;
}

export function buildRogueBossAtlas(sheet) {
    const iw = sheet?.naturalWidth || sheet?.width || 0;
    const ih = sheet?.naturalHeight || sheet?.height || 0;
    if (!iw || !ih) return null;
    const cellW = Math.floor(iw / 4);
    const cellH = Math.floor(ih / 3);
    const atlas = { ready: true, cellW, cellH };
    for (const [name, [column, row]] of Object.entries(ROGUE_BOSS_FRAME_GRID)) {
        atlas[name] = sliceRect(sheet, { x: column * cellW, y: row * cellH, w: cellW, h: cellH });
    }
    return atlas;
}

export function buildBiomeSceneryAtlas(sheet) {
    const iw = sheet?.naturalWidth || sheet?.width || 0;
    const ih = sheet?.naturalHeight || sheet?.height || 0;
    if (!iw || !ih) return null;
    const cellW = Math.floor(iw / 4);
    const cellH = Math.floor(ih / 3);
    const atlas = { ready: true, cellW, cellH };
    for (const [name, [column, row]] of Object.entries(BIOME_SCENERY_FRAME_GRID)) {
        atlas[name] = sliceRect(sheet, { x: column * cellW, y: row * cellH, w: cellW, h: cellH });
    }
    return atlas;
}

export function pickCourierActionFrame(atlas, actor) {
    if (!atlas?.ready || !actor) return null;
    if ((actor.invulnTicks | 0) > 34 && atlas.hurt) return { img: atlas.hurt, kind: 'hurt' };
    if ((actor.attackTicks | 0) <= 0) return null;
    const total = actor.attackTotalTicks || 20;
    const elapsed = total - actor.attackTicks;
    const activeFrom = actor.attackActiveFrom ?? 5;
    const activeTo = actor.attackActiveTo ?? 10;
    if (actor.weaponAction === 'special' && atlas.rupture) return { img: atlas.rupture, kind: 'special' };
    const heavy = actor.weaponAction === 'heavy';
    if (elapsed < activeFrom) return { img: heavy ? atlas.heavyWindup : atlas.quickWindup, kind: 'windup' };
    if (elapsed <= activeTo) return { img: heavy ? atlas.heavyStrike : atlas.quickStrike, kind: 'active' };
    return { img: heavy ? atlas.quickRecovery : atlas.quickRecovery, kind: 'recovery' };
}

export function pickTickHoundFrame(atlas, hound, tick = 0) {
    if (!atlas?.ready) return null;
    if (hound?.dead) return { img: atlas.dead, flipX: false };
    if ((hound?.hurtTicks | 0) > 0) return { img: atlas.hit, flipX: false };
    if ((hound?.lungeTelegraphTicks | 0) > 0) return { img: atlas.windup, flipX: false };
    if (hound?.state === 'chase' || hound?.state === 'patrol') {
        return { img: atlas.runRight[Math.floor(tick / 5) % atlas.runRight.length], flipX: Math.cos(hound.facingAngle || 0) < 0 };
    }
    const fx = Math.cos(hound?.facingAngle || 0);
    const fy = Math.sin(hound?.facingAngle || 0);
    if (Math.abs(fx) >= Math.abs(fy)) return { img: fx < 0 ? atlas.idleLeft : atlas.idleRight, flipX: false };
    return { img: fy < 0 ? atlas.idleBack : atlas.idleFront, flipX: false };
}

export function buildPlayerAtlas(sheet) {
    if (!sheetReady(sheet)) return null;

    const R = PLAYER_FRAME_RECTS;
    const atlas = {
        idleFront: sliceRect(sheet, R.idleFront),
        idleBack: sliceRect(sheet, R.idleBack),
        idleRight: sliceRect(sheet, R.idleRight),
        idleLeft: sliceRect(sheet, R.idleLeft),
        idleQtr: sliceRect(sheet, R.idleQtr),
        carry: sliceRect(sheet, R.carry),
        dash: sliceRect(sheet, R.dash),
        cloak: sliceRect(sheet, R.cloak),
        walkFront: R.walkFront.map(r => sliceRect(sheet, r)).filter(Boolean),
        walkSide: R.walkSide.map(r => sliceRect(sheet, r)).filter(Boolean),
        guard: sliceRect(sheet, GUARD_FRAME_RECTS.idleFront),
        ready: true
    };
    return atlas;
}

export function buildWorldAtlas(propsSheet, envSheet) {
    const atlas = { ready: false };
    const keyLight = { keyLight: true };

    if (sheetReady(propsSheet)) {
        const R = PROPS_FRAME_RECTS;
        for (const name of Object.keys(R)) {
            atlas[name] = sliceRect(propsSheet, R[name], keyLight);
        }
    }

    if (sheetReady(envSheet)) {
        const R = ENV_FRAME_RECTS;
        for (const name of Object.keys(R)) {
            atlas[name] = sliceRect(envSheet, R[name], keyLight);
        }
    }

    atlas.ready = !!(atlas.package || atlas.wall || atlas.zone || atlas.laser || atlas.camera);
    return atlas.ready ? atlas : null;
}

export function resolveSprite(gameState, name) {
    if (!gameState || !name) return null;
    const modern = gameState.modernPropsAtlas;
    if (modern && modern.ready && modern[name]) return modern[name];
    const world = gameState.worldAtlas;
    if (world && world.ready && world[name]) return world[name];
    const player = gameState.playerAtlas;
    if (player && player.ready && player[name]) return player[name];
    return gameState.assets?.[name] || null;
}

function cycle(frames, tick) {
    if (!frames || !frames.length) return null;
    const i = Math.floor(Math.max(0, tick) / WALK_TICKS_PER_FRAME) % frames.length;
    return frames[i];
}

export function pickCourierFrame(atlas, { cloaking, dashing, carrying, moving, facingX, facingY, tick } = {}) {
    if (!atlas || !atlas.ready) return null;
    const fx = facingX || 0;
    const fy = facingY || 0;
    const flipLeft = fx < 0;
    const ax = Math.abs(fx);
    const ay = Math.abs(fy);

    if (cloaking && atlas.cloak) return { img: atlas.cloak, flipX: flipLeft, kind: 'cloak' };
    if (dashing && atlas.dash) return { img: atlas.dash, flipX: flipLeft, kind: 'dash' };
    if (carrying && atlas.carry) return { img: atlas.carry, flipX: flipLeft, kind: 'carry' };

    if (moving) {
        if (ay > ax && fy > 0) {
            const img = cycle(atlas.walkFront, tick);
            if (img) return { img, flipX: false, kind: 'walk' };
        }
        const img = cycle(atlas.walkSide, tick);
        if (img) return { img, flipX: flipLeft, kind: 'walk' };
    }

    if (ay > ax) {
        if (fy < 0 && atlas.idleBack) return { img: atlas.idleBack, flipX: false, kind: 'idle' };
        if (atlas.idleFront) return { img: atlas.idleFront, flipX: false, kind: 'idle' };
    }
    if (fx < 0 && atlas.idleLeft) return { img: atlas.idleLeft, flipX: false, kind: 'idle' };
    if (fx > 0 && atlas.idleRight) return { img: atlas.idleRight, flipX: false, kind: 'idle' };
    if (atlas.idleQtr) return { img: atlas.idleQtr, flipX: flipLeft, kind: 'idle' };
    if (atlas.idleFront) return { img: atlas.idleFront, flipX: flipLeft, kind: 'idle' };
    return null;
}
