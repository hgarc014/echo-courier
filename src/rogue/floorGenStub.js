// TEMP stub until SWE B's src/data/floorGen.js lands on feat/roguelike-slice.
// Returns a deserializeLevel-compatible layout: 1 package, deliveryZone, walls, one plate + door.
export function generateFloor(seed = 1) {
    let s = (seed >>> 0) || 1;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const pkgY = 80 + Math.floor(rnd() * 400);
    return {
        player: { x: 60, y: 300 },
        deliveryZone: { x: 660, y: 250, w: 100, h: 100 },
        walls: [
            { x: 0, y: 0, w: 800, h: 20 }, { x: 0, y: 580, w: 800, h: 20 },
            { x: 0, y: 0, w: 20, h: 600 }, { x: 780, y: 0, w: 20, h: 600 },
            { x: 560, y: 20, w: 20, h: 200 }, { x: 560, y: 380, w: 20, h: 200 }
        ],
        doors: [{ id: 'd1', x: 560, y: 220, w: 20, h: 160 }],
        plates: [{ id: 'p1', x: 300, y: 500, linkedIds: ['d1'] }],
        packages: [{ id: 'pkg1', x: 420, y: pkgY }]
    };
}
