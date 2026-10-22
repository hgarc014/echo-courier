// In-world teaching labels (W5 clarity): plate rules and the shield-through-beam hint.
export const PLATE_CAPTIONS = { last: 'NEWEST ECHO', first: 'OLDEST ECHO' };
export const SHIELD_BEAM_LABEL = 'SHIELDED ECHO PASSES';

const isBeamColumn = (l) => Math.max(l.w || 0, l.h || 0) >= 200;

/** Labels for a layout (serialized or live). opts.shield: the echo shield is unlocked. */
export function worldLabelsFor(src, opts = {}) {
    const out = [];
    for (const p of (src.plates || [])) {
        const text = p.requiredTimeline ? PLATE_CAPTIONS[p.requiredTimeline] : null;
        if (text) out.push({ kind: 'plate', text, x: p.x + (p.w || 40) / 2, y: p.y - 8 });
    }
    if (opts.shield) {
        for (const l of (src.lasers || [])) {
            if (!isBeamColumn(l)) continue;
            const vertical = (l.h || 0) >= (l.w || 0);
            out.push(vertical
                ? { kind: 'shield', text: SHIELD_BEAM_LABEL, x: l.x + l.w / 2, y: l.y + l.h + 12 }
                : { kind: 'shield', text: SHIELD_BEAM_LABEL, x: l.x + l.w / 2, y: l.y + l.h + 12 });
        }
    }
    return out;
}

export function drawWorldLabels(ctx, labels, mapW = 800, mapH = 600) {
    ctx.save();
    ctx.font = 'bold 10px "Space Grotesk", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const l of labels) {
        const w = l.text.length * 6.4 + 10;
        const x = Math.max(w / 2 + 22, Math.min(mapW - w / 2 - 22, l.x));
        const y = Math.max(28, Math.min(mapH - 28, l.y));
        ctx.fillStyle = 'rgba(5,7,10,0.82)';
        ctx.fillRect(x - w / 2, y - 7, w, 14);
        ctx.fillStyle = l.kind === 'shield' ? '#7df9ff' : '#ffdd00';
        ctx.fillText(l.text, x, y + 0.5);
    }
    ctx.restore();
}
