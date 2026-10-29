export function beginBossTelemetry(bossId, maxHp, startedAtTick = 0, verbSnapshot = {}) {
    return {
        bossId,
        maxHp: Math.max(1, Number(maxHp) || 1),
        startedAtTick,
        killedAtTick: null,
        durationTicks: null,
        durationSeconds: null,
        playerDamageTaken: 0,
        startVerbs: {
            dashes: verbSnapshot.dashes | 0,
            cloaks: verbSnapshot.cloaks | 0,
            tosses: verbSnapshot.tosses | 0,
            ruptures: verbSnapshot.ruptures | 0
        },
        verbsUsed: null
    };
}

export function noteBossDamage(entry, amount) {
    if (entry && entry.killedAtTick == null) entry.playerDamageTaken += Math.max(0, Number(amount) || 0);
    return entry;
}

export function completeBossTelemetry(entry, killedAtTick, verbSnapshot = {}) {
    if (!entry || entry.killedAtTick != null) return entry;
    entry.killedAtTick = killedAtTick;
    entry.durationTicks = Math.max(0, killedAtTick - entry.startedAtTick);
    entry.durationSeconds = Math.round(entry.durationTicks / 6) / 10;
    entry.verbsUsed = {
        dashes: Math.max(0, (verbSnapshot.dashes | 0) - entry.startVerbs.dashes),
        cloaks: Math.max(0, (verbSnapshot.cloaks | 0) - entry.startVerbs.cloaks),
        tosses: Math.max(0, (verbSnapshot.tosses | 0) - entry.startVerbs.tosses),
        ruptures: Math.max(0, (verbSnapshot.ruptures | 0) - entry.startVerbs.ruptures)
    };
    return entry;
}

export function bossDurationReport(entries = []) {
    return entries.map(entry => ({
        bossId: entry.bossId,
        seconds: entry.durationSeconds,
        inTargetBand: Number.isFinite(entry.durationSeconds) && entry.durationSeconds >= 60 && entry.durationSeconds <= 120,
        playerDamageTaken: entry.playerDamageTaken,
        verbsUsed: entry.verbsUsed
    }));
}
