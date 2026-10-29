const BIOME_PALETTES = Object.freeze({
    'second-hand-halls': Object.freeze({ base: '#071016', panel: '#0c1a21', panelAlt: '#0a151c', seam: '#17404a', accent: '#00d8e6', warm: '#ff8a2a' }),
    'hourglass-warrens': Object.freeze({ base: '#17110b', panel: '#24180f', panelAlt: '#1d140d', seam: '#5b361d', accent: '#ff9f43', warm: '#ffd166' }),
    'echo-courts': Object.freeze({ base: '#0e0b18', panel: '#171126', panelAlt: '#120f20', seam: '#43295f', accent: '#bb72ff', warm: '#ff5c8a' })
});

export function arenaPalette(biome = 'second-hand-halls') {
    return BIOME_PALETTES[biome] || BIOME_PALETTES['second-hand-halls'];
}

export function visualHash(x, y, salt = 0) {
    let n = (Math.imul(Math.floor(x), 374761393) + Math.imul(Math.floor(y), 668265263) + Math.imul(salt, 1442695041)) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function roundedRect(ctx, x, y, w, h, r = 8) {
    const radius = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
}

export function drawArenaBackdrop(ctx, map, biome = 'second-hand-halls') {
    const p = arenaPalette(biome);
    ctx.save();
    ctx.fillStyle = p.base;
    ctx.fillRect(0, 0, map.w, map.h);

    const plateW = 160, plateH = 120;
    for (let y = 0; y < map.h; y += plateH) {
        for (let x = 0; x < map.w; x += plateW) {
            const v = visualHash(x / plateW, y / plateH, 7);
            const inset = 5 + Math.floor(v * 5);
            roundedRect(ctx, x + inset, y + inset, plateW - inset * 2, plateH - inset * 2, 9);
            ctx.fillStyle = v > .48 ? p.panel : p.panelAlt;
            ctx.fill();
            ctx.strokeStyle = p.seam;
            ctx.globalAlpha = .48;
            ctx.lineWidth = 1.25;
            ctx.stroke();
            ctx.globalAlpha = 1;

            if (v > .68) {
                ctx.fillStyle = 'rgba(0,0,0,.32)';
                roundedRect(ctx, x + plateW * .33, y + plateH * .39, plateW * .34, plateH * .22, 5);
                ctx.fill();
                ctx.strokeStyle = `${p.accent}55`;
                ctx.stroke();
                for (let i = 0; i < 4; i++) {
                    ctx.fillStyle = 'rgba(180,220,225,.10)';
                    ctx.fillRect(x + plateW * .39 + i * 13, y + plateH * .44, 5, plateH * .12);
                }
            } else if (v < .22) {
                ctx.strokeStyle = `${p.warm}55`;
                ctx.lineWidth = 3;
                ctx.setLineDash([14, 9]);
                ctx.beginPath();
                ctx.moveTo(x + 25, y + plateH - 22);
                ctx.lineTo(x + plateW - 25, y + 22);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }
    }

    // Broad circulation lanes make the room read as architecture, not graph paper.
    ctx.fillStyle = 'rgba(0,0,0,.16)';
    ctx.fillRect(0, map.h * .47, map.w, 44);
    ctx.fillRect(map.w * .47, 0, 44, map.h);
    ctx.strokeStyle = `${p.accent}26`;
    ctx.lineWidth = 2;
    ctx.strokeRect(0, map.h * .47, map.w, 44);
    ctx.strokeRect(map.w * .47, 0, 44, map.h);

    const light = ctx.createRadialGradient(map.w * .5, map.h * .48, 35, map.w * .5, map.h * .48, Math.max(map.w, map.h) * .7);
    light.addColorStop(0, `${p.accent}16`);
    light.addColorStop(.58, 'rgba(0,0,0,0)');
    light.addColorStop(1, 'rgba(0,0,0,.54)');
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, map.w, map.h);
    ctx.restore();
}

export function drawArenaWall(ctx, wall, biome = 'second-hand-halls') {
    const p = arenaPalette(biome);
    const { x, y, w, h } = wall;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.48)';
    roundedRect(ctx, x + 10, y + 13, w, h, 6);
    ctx.fill();

    const body = ctx.createLinearGradient(x, y, x, y + h);
    body.addColorStop(0, '#26343b');
    body.addColorStop(.18, '#15242b');
    body.addColorStop(1, '#081116');
    roundedRect(ctx, x, y, w, h, 5);
    ctx.fillStyle = body;
    ctx.fill();
    ctx.strokeStyle = `${p.accent}99`;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = 'rgba(215,245,247,.12)';
    roundedRect(ctx, x + 5, y + 5, Math.max(0, w - 10), Math.min(12, h - 10), 3);
    ctx.fill();
    ctx.fillStyle = `${p.accent}55`;
    const horizontal = w >= h;
    const length = horizontal ? w : h;
    for (let pos = 18; pos < length - 10; pos += 42) {
        if (horizontal) ctx.fillRect(x + pos, y + 8, 14, 3);
        else ctx.fillRect(x + 8, y + pos, 3, 14);
    }
    ctx.restore();
}

