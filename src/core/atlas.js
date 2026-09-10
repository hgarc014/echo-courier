import { prepareLoadedAsset } from './sprites.js';

export const PLAYER_SHEET_PATH = 'assets/sprite-sheets/echo-courier-characters.png';
export const PROPS_SHEET_PATH = 'assets/sprite-sheets/echo-courier-props-hazards.png';
export const ENV_SHEET_PATH = 'assets/sprite-sheets/echo-courier-environment-effects.png';

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
