// Plate -> door/laser wire rendering (design principle 5: every plate shows its wire).
// Wires are derived from plate.linkedIds, so they need no extra level data and
// round-trip through serializeLevel/deserializeLevel with the plates.

function center(e) { return { x: e.x + (e.w || 0) / 2, y: e.y + (e.h || 0) / 2 }; }

export function collectWires(plates, doors, lasers) {
    const wires = [];
    for (const p of plates || []) {
        const ids = Array.isArray(p.linkedIds) ? p.linkedIds : [p.linkedIds];
        for (const id of ids) {
            if (id == null || id === '') continue;
            const targets = [
                ...(doors || []).filter(d => d.id === id).map(t => ['door', t]),
                ...(lasers || []).filter(l => l.id === id).map(t => ['laser', t])
            ];
            for (const [kind, t] of targets) {
                const a = center(p), b = center(t);
                wires.push({ plateId: p.id, targetId: id, kind, x1: a.x, y1: a.y, x2: b.x, y2: b.y, powered: !!p.isPressed });
            }
        }
    }
    return wires;
}

export function drawWires(ctx, wires, tick = 0) {
    if (!wires.length) return;
    ctx.save();
    ctx.lineCap = 'round';
    for (const w of wires) {
        // Orthogonal elbow route reads more like a circuit than a diagonal.
        const midX = w.x2;
        ctx.beginPath();
        ctx.moveTo(w.x1, w.y1);
        ctx.lineTo(midX, w.y1);
        ctx.lineTo(w.x2, w.y2);
        ctx.lineWidth = w.powered ? 7 : 4;
        ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        ctx.setLineDash([]);
        ctx.stroke();
        ctx.lineWidth = 2;
        if (w.powered) {
            // Held plate: bold glowing wire so it reads which door/gate this plate drives.
            ctx.lineWidth = 4; ctx.shadowColor = w.kind === 'laser' ? '#ff9a3c' : '#ffdd00'; ctx.shadowBlur = 8;
            ctx.strokeStyle = w.kind === 'laser' ? '#ff9a3c' : '#ffdd00';
            ctx.setLineDash([10, 6]);
            ctx.lineDashOffset = -(tick * 0.6) % 16;
            ctx.globalAlpha = 0.95;
        } else {
            ctx.strokeStyle = w.kind === 'laser' ? 'rgba(255,120,60,0.45)' : 'rgba(0,243,255,0.4)';
            ctx.setLineDash([4, 6]);
            ctx.lineDashOffset = 0;
            ctx.globalAlpha = 0.8;
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
        ctx.setLineDash([]);
        ctx.fillStyle = w.powered ? '#ffdd00' : '#0b2a33';
        ctx.beginPath(); ctx.arc(w.x2, w.y2, 3.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
}
