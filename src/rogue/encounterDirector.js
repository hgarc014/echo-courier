export const MAX_ALIVE = 6;
export const SPAWN_TELEGRAPH_TICKS = 45;
export const WAVE_BREATHER_TICKS = 90;

const WAVE_COUNTS = {
    'second-hand-halls': [3, 4],
    'hourglass-warrens': [3, 4, 5],
    'echo-courts': [4, 5, 6]
};

function rng(seed) {
    let x = (seed >>> 0) || 1;
    return () => {
        x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
        return (x >>> 0) / 4294967296;
    };
}

export function waveCountsFor(biome) {
    return [...(WAVE_COUNTS[biome] || WAVE_COUNTS['second-hand-halls'])];
}

export function seededSpawnOrder(seed, points) {
    const out = (points || []).map(p => ({ x: p.x, y: p.y }));
    const random = rng(seed);
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

export function createEncounterDirector({ biome, seed, spawnPoints }) {
    return {
        waves: waveCountsFor(biome), waveIndex: 0, queued: waveCountsFor(biome)[0],
        telegraphs: [], breather: 0, cursor: 0,
        spawnPoints: seededSpawnOrder(seed, spawnPoints), done: false
    };
}

export function tickEncounterDirector(director, alive) {
    if (!director || director.done) return [];
    const spawned = [];
    for (const mark of director.telegraphs) {
        mark.ticks--;
        if (mark.ticks <= 0) spawned.push(mark.point);
    }
    director.telegraphs = director.telegraphs.filter(m => m.ticks > 0);

    const occupied = alive + spawned.length + director.telegraphs.length;
    while (director.queued > 0 && occupied + director.telegraphs.length < MAX_ALIVE && director.spawnPoints.length) {
        const point = director.spawnPoints[director.cursor++ % director.spawnPoints.length];
        director.telegraphs.push({ point, ticks: SPAWN_TELEGRAPH_TICKS });
        director.queued--;
    }

    if (alive + spawned.length === 0 && director.queued === 0 && director.telegraphs.length === 0) {
        if (director.waveIndex >= director.waves.length - 1) director.done = true;
        else if (++director.breather >= WAVE_BREATHER_TICKS) {
            director.waveIndex++;
            director.queued = director.waves[director.waveIndex];
            director.breather = 0;
        }
    } else director.breather = 0;
    return spawned;
}

export function encounterRemaining(director, alive) {
    if (!director) return alive;
    const later = director.waves.slice(director.waveIndex + 1).reduce((a, b) => a + b, 0);
    return alive + director.queued + director.telegraphs.length + later;
}
