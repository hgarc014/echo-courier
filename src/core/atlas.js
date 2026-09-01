import { prepareLoadedAsset } from './sprites.js';

export const PLAYER_SHEET_PATH = 'assets/sprite-sheets/echo-courier-characters.png';

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

const WALK_TICKS_PER_FRAME = 5;

function sliceRect(sheet, rect) {
    if (!rect) return null;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, rect.w);
    canvas.height = Math.max(1, rect.h);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(sheet, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
    return prepareLoadedAsset(canvas, { crop: true, keyBlack: true });
}

export function buildPlayerAtlas(sheet) {
    if (!sheet) return null;
    const iw = sheet.naturalWidth || sheet.width || 0;
    const ih = sheet.naturalHeight || sheet.height || 0;
    if (iw < 1536 || ih < 1024) return null;

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
        ready: true
    };
    return atlas;
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
