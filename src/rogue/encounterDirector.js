export const MAX_ALIVE = 6;
export const SPAWN_TELEGRAPH_TICKS = 45;
export const WAVE_BREATHER_TICKS = 90;
export const PRESSURE_INTERVAL_TICKS = 180;

const WAVE_COUNTS = {
    'second-hand-halls': [3, 4],
    'hourglass-warrens': [3, 4, 5],
    'echo-courts': [4, 5, 6]
};

export function waveCountsFor(biome) {
    return [...(WAVE_COUNTS[biome] || WAVE_COUNTS['second-hand-halls'])];
}

export function seededSpawnOrder(seed, points) {
    const pool = (points || []).map(p => ({ x: p.x, y: p.y }));
    const out = [];
    // Factoradic selection makes adjacent small seeds distinct (up to n!) while
    // retaining deterministic wraparound for arbitrary 32-bit run seeds.
    let code = seed >>> 0;
    while (pool.length) {
        const index = code % pool.length;
        out.push(pool.splice(index, 1)[0]);
        code = Math.floor(code / Math.max(1, pool.length + 1));
    }
    return out;
}

export function createEncounterDirector({ biome, seed, spawnPoints }) {
    return {
        kind: 'waves',
        waves: waveCountsFor(biome), waveIndex: 0, queued: waveCountsFor(biome)[0],
        telegraphs: [], breather: 0, cursor: 0,
        spawnPoints: seededSpawnOrder(seed, spawnPoints), done: false
    };
}

export function createPressureDirector({ seed, spawnPoints, interval = PRESSURE_INTERVAL_TICKS, initialDelay = 0 }) {
    return {
        kind: 'pressure', telegraphs: [], cursor: 0, interval, nextIn: initialDelay,
        spawnPoints: seededSpawnOrder(seed, spawnPoints), done: false
    };
}

function pointFarEnough(point, avoid, minDistance) {
    if (!avoid) return true;
    return Math.hypot(point.x + 15 - avoid.x, point.y + 15 - avoid.y) >= minDistance;
}

function takeSafePoint(director, avoid, minDistance = 200) {
    for (let i = 0; i < director.spawnPoints.length; i++) {
        const point = director.spawnPoints[director.cursor++ % director.spawnPoints.length];
        if (pointFarEnough(point, avoid, minDistance)) return point;
    }
    return null;
}

export function tickEncounterDirector(director, alive, avoid = null) {
    if (!director || director.done) return [];
    const spawned = [];
    for (const mark of director.telegraphs) {
        mark.ticks--;
        if (mark.ticks <= 0) {
            if (pointFarEnough(mark.point, avoid, 200)) spawned.push(mark.point);
            else {
                const safe = takeSafePoint(director, avoid);
                if (safe) { mark.point = safe; mark.ticks = SPAWN_TELEGRAPH_TICKS; }
                else mark.ticks = 1;
            }
        }
    }
    director.telegraphs = director.telegraphs.filter(m => m.ticks > 0);

    const occupied = alive + spawned.length + director.telegraphs.length;
    while (director.queued > 0 && occupied + director.telegraphs.length < MAX_ALIVE && director.spawnPoints.length) {
        const point = takeSafePoint(director, avoid);
        if (!point) break;
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

export function tickPressureDirector(director, alive, avoid = null, active = true) {
    if (!director || director.done) return [];
    const spawned = [];
    for (const mark of director.telegraphs) {
        mark.ticks--;
        if (mark.ticks <= 0) {
            if (pointFarEnough(mark.point, avoid, 200)) spawned.push(mark.point);
            else {
                const safe = takeSafePoint(director, avoid);
                if (safe) { mark.point = safe; mark.ticks = SPAWN_TELEGRAPH_TICKS; }
                else mark.ticks = 1;
            }
        }
    }
    director.telegraphs = director.telegraphs.filter(mark => mark.ticks > 0);
    if (!active) return spawned;
    director.nextIn--;
    const occupied = alive + spawned.length + director.telegraphs.length;
    if (director.nextIn <= 0 && occupied < MAX_ALIVE) {
        const point = takeSafePoint(director, avoid);
        if (point) {
            director.telegraphs.push({ point, ticks: SPAWN_TELEGRAPH_TICKS });
            director.nextIn = director.interval;
        }
    }
    return spawned;
}

export function encounterRemaining(director, alive) {
    if (!director) return alive;
    const later = director.waves.slice(director.waveIndex + 1).reduce((a, b) => a + b, 0);
    return alive + director.queued + director.telegraphs.length + later;
}
