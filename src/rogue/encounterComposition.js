const BIOME_DEPTH = {
    'second-hand-halls': 0,
    'hourglass-warrens': 1,
    'echo-courts': 2
};

export const ROOM_SHELLS = [
    { id: 'crossroads', family: 'cross', tags: ['open', 'flank'], weight: 3 },
    { id: 'split-clock', family: 'lanes', tags: ['lanes', 'cover'], weight: 2 },
    { id: 'pendulum-ring', family: 'ring', tags: ['open', 'orbit'], weight: 2 },
    { id: 'broken-dial', family: 'islands', tags: ['cover', 'choke'], weight: 2 }
];

export const SQUAD_PROFILES = [
    { id: 'pursuit-pack', family: 'pursuit', roles: ['chaser', 'chaser', 'skirmisher'], threat: 3 },
    { id: 'hammer-anvil', family: 'formation', roles: ['bruiser', 'chaser', 'skirmisher'], threat: 4 },
    { id: 'clock-swarm', family: 'swarm', roles: ['skirmisher', 'skirmisher', 'chaser', 'chaser'], threat: 4 },
    { id: 'heavy-escort', family: 'escort', roles: ['bruiser', 'chaser', 'chaser'], threat: 5 }
];

export const MODIFIERS = [
    { id: 'none', family: 'plain', threat: 0, incompatibleTags: [] },
    { id: 'fast-clock', family: 'tempo', threat: 1, incompatibleTags: ['choke'] },
    { id: 'fractured-cover', family: 'terrain', threat: 1, incompatibleTags: ['open'] },
    { id: 'thin-time', family: 'attrition', threat: 1, incompatibleTags: ['lanes'] }
];

export const OBJECTIVES = [
    { id: 'break-the-pack', family: 'elimination', allowedSquads: ['pursuit', 'formation', 'swarm', 'escort'] },
    { id: 'hold-the-minute', family: 'survival', allowedSquads: ['pursuit', 'swarm'] },
    { id: 'reach-the-rift', family: 'escape', allowedSquads: ['formation', 'escort'] }
];

export const REWARDS = [
    { id: 'aspect-choice', family: 'build' },
    { id: 'sand-cache', family: 'resource' },
    { id: 'health-cache', family: 'recovery' }
];

export function authoredShellWalls(shellId, width = 800, height = 600) {
    const cx = Math.round(width / 2);
    const cy = Math.round(height / 2);
    const patterns = {
        crossroads: [
            { x: cx - 110, y: cy - 18, w: 70, h: 36 },
            { x: cx + 40, y: cy - 18, w: 70, h: 36 }
        ],
        'split-clock': [
            { x: cx - 18, y: 110, w: 36, h: 120 },
            { x: cx - 18, y: height - 230, w: 36, h: 120 }
        ],
        'pendulum-ring': [
            { x: cx - 125, y: cy - 95, w: 55, h: 30 },
            { x: cx + 70, y: cy + 65, w: 55, h: 30 }
        ],
        'broken-dial': [
            { x: cx - 125, y: cy - 90, w: 50, h: 50 },
            { x: cx + 75, y: cy - 90, w: 50, h: 50 },
            { x: cx - 25, y: cy + 55, w: 50, h: 50 }
        ]
    };
    return (patterns[shellId] || []).map(wall => ({ ...wall, style: 'rogue-cover' }));
}

function mix(seed) {
    let value = seed >>> 0;
    value ^= value >>> 16;
    value = Math.imul(value, 0x7feb352d);
    value ^= value >>> 15;
    value = Math.imul(value, 0x846ca68b);
    return (value ^ (value >>> 16)) >>> 0;
}

function choose(list, seed, previousFamily) {
    const eligible = list.filter(item => item.family !== previousFamily);
    const pool = eligible.length ? eligible : list;
    return pool[mix(seed) % pool.length];
}

export function threatBudgetFor(biome, depth = BIOME_DEPTH[biome] ?? 0) {
    return 4 + Math.max(0, depth);
}

export function composeEncounter({ seed, biome = 'second-hand-halls', depth, previous = {} }) {
    const resolvedDepth = depth ?? BIOME_DEPTH[biome] ?? 0;
    const budget = threatBudgetFor(biome, resolvedDepth);
    const shell = choose(ROOM_SHELLS, seed + 11, previous.shellFamily);
    const affordableSquads = SQUAD_PROFILES.filter(squad => squad.threat <= budget);
    const squad = choose(affordableSquads, seed + 23, previous.squadFamily);
    const compatibleModifiers = MODIFIERS.filter(modifier =>
        squad.threat + modifier.threat <= budget &&
        !modifier.incompatibleTags.some(tag => shell.tags.includes(tag))
    );
    const modifier = choose(compatibleModifiers, seed + 37, previous.modifierFamily);
    const validObjectives = OBJECTIVES.filter(objective => objective.allowedSquads.includes(squad.family));
    const objective = choose(validObjectives, seed + 53, previous.objectiveFamily);
    const reward = choose(REWARDS, seed + 71, previous.rewardFamily);
    return {
        seed: seed >>> 0,
        biome,
        depth: resolvedDepth,
        budget,
        threat: squad.threat + modifier.threat,
        shell,
        squad,
        modifier,
        objective,
        reward,
        signature: [shell.id, squad.id, modifier.id, objective.id, reward.id].join('/')
    };
}

export function sweepEncounterSeeds({ count = 20, seed = 1, biome = 'second-hand-halls', depth } = {}) {
    const encounters = [];
    let previous = {};
    for (let i = 0; i < count; i++) {
        const encounter = composeEncounter({ seed: seed + i, biome, depth, previous });
        encounters.push(encounter);
        previous = {
            shellFamily: encounter.shell.family,
            squadFamily: encounter.squad.family,
            modifierFamily: encounter.modifier.family,
            objectiveFamily: encounter.objective.family,
            rewardFamily: encounter.reward.family
        };
    }
    const invalid = encounters.filter(encounter =>
        encounter.threat > encounter.budget ||
        encounter.modifier.incompatibleTags.some(tag => encounter.shell.tags.includes(tag)) ||
        !encounter.objective.allowedSquads.includes(encounter.squad.family)
    );
    const adjacentRepeats = encounters.slice(1).filter((encounter, index) =>
        encounter.shell.family === encounters[index].shell.family ||
        encounter.squad.family === encounters[index].squad.family
    );
    return {
        encounters,
        uniqueSignatures: new Set(encounters.map(encounter => encounter.signature)).size,
        invalidCount: invalid.length,
        adjacentRepeatCount: adjacentRepeats.length
    };
}
