export function beginEncounterTelemetry(encounter, startedAtTick = 0) {
    if (!encounter) return null;
    return {
        signature: encounter.signature,
        biome: encounter.biome,
        depth: encounter.depth,
        threat: encounter.threat,
        budget: encounter.budget,
        shellFamily: encounter.shell.family,
        squadFamily: encounter.squad.family,
        modifierFamily: encounter.modifier.family,
        objectiveFamily: encounter.objective.family,
        startedAtTick,
        clearedAtTick: null,
        durationTicks: null
    };
}

export function completeEncounterTelemetry(entry, clearedAtTick) {
    if (!entry || entry.clearedAtTick != null) return entry;
    entry.clearedAtTick = clearedAtTick;
    entry.durationTicks = Math.max(0, clearedAtTick - entry.startedAtTick);
    return entry;
}

export function summarizeEncounterTelemetry(entries = []) {
    const completed = entries.filter(entry => Number.isFinite(entry.durationTicks));
    const durations = completed.map(entry => entry.durationTicks);
    return {
        encounters: entries.length,
        completed: completed.length,
        averageDurationTicks: durations.length
            ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
            : 0,
        shortestDurationTicks: durations.length ? Math.min(...durations) : 0,
        longestDurationTicks: durations.length ? Math.max(...durations) : 0,
        uniqueSignatures: new Set(entries.map(entry => entry.signature)).size
    };
}
