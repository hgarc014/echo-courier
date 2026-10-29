const REACTIONS = {
    dispatch: [
        { id: 'dispatch-fall', tags: ['fell'], text: 'Dispatch: The floor was documented as mostly present.' },
        { id: 'dispatch-hound', tags: ['hound'], text: 'Dispatch: Tick Hounds are not approved recipients.' },
        { id: 'dispatch-boss', tags: ['boss'], text: 'Dispatch: Management denies authorizing that boss.' },
        { id: 'dispatch-echo', tags: ['echo'], text: 'Dispatch: Your duplicate filed the cleaner route.' },
        { id: 'dispatch-default', tags: ['default'], text: 'Dispatch: Another failed route has been removed from the record.' }
    ],
    mechanic: [
        { id: 'mechanic-fall', tags: ['fell'], text: 'Mechanic: I fixed the boots before you broke them. Again.' },
        { id: 'mechanic-sand', tags: ['sand'], text: 'Mechanic: Your hourglass came back warm. That is usually expensive.' },
        { id: 'mechanic-boss', tags: ['boss'], text: 'Mechanic: Boss residue in the gears. Good—you reached something new.' },
        { id: 'mechanic-rupture', tags: ['rupture'], text: 'Mechanic: That rupture bent tomorrow out of alignment.' },
        { id: 'mechanic-default', tags: ['default'], text: 'Mechanic: Hold still. I have already repaired the damage you are about to show me.' }
    ],
    auditor: [
        { id: 'auditor-policy', tags: ['policy'], text: 'Auditor: Unauthorized technique observed. Privately, excellent work.' },
        { id: 'auditor-clear', tags: ['clear'], text: 'Auditor: A successful route creates a troubling amount of paperwork.' },
        { id: 'auditor-boss', tags: ['boss'], text: 'Auditor: Defeating management assets is a serious promotion risk.' },
        { id: 'auditor-echo', tags: ['echo'], text: 'Auditor: Your Echo has no employee number. I envy it.' },
        { id: 'auditor-default', tags: ['default'], text: 'Auditor: Your failure was procedurally fascinating.' }
    ]
};

const BOSS_DEPTH = ['gatekeeper', 'burrower', 'prism', 'stillkeeper'];

export function buildRunSummary({ cleared = false, deathCause = '', rogueRun = {}, runStats = {} } = {}) {
    const bossId = rogueRun.lastBossReached || rogueRun.currentBossId || null;
    const temporalEvent = (rogueRun.ruptureSeq | 0) > 0
        ? 'time-rupture'
        : ((rogueRun.echoesDeployed | 0) > 0 ? 'echo-deployed' : 'none');
    const aspects = Array.isArray(rogueRun.aspects) ? [...rogueRun.aspects] : [];
    const policyViolations = (runStats.tosses | 0) + (runStats.cloaks | 0);
    return {
        cleared: !!cleared,
        deathCause: cleared ? '' : String(deathCause || 'Timeline collapsed'),
        weapon: rogueRun.weapon || 'chrono-baton',
        aspects,
        bossReached: bossId,
        bossDepth: bossId ? BOSS_DEPTH.indexOf(bossId) + 1 : 0,
        temporalEvent,
        policyViolations
    };
}

function summaryTags(summary) {
    const cause = String(summary?.deathCause || '').toLowerCase();
    const tags = new Set(['default']);
    if (summary?.cleared) tags.add('clear');
    if (summary?.bossReached) tags.add('boss');
    if (summary?.temporalEvent === 'time-rupture') tags.add('rupture');
    if (summary?.temporalEvent === 'echo-deployed') tags.add('echo');
    if ((summary?.policyViolations | 0) > 0) tags.add('policy');
    if (cause.includes('fell') || cause.includes('pit')) tags.add('fell');
    if (cause.includes('hound') || cause.includes('mauled')) tags.add('hound');
    if (cause.includes('sand') || cause.includes('rewind')) tags.add('sand');
    return tags;
}

export function chooseHubReaction(summary, { runNumber = 0, recentIds = [] } = {}) {
    const speakers = ['dispatch', 'mechanic', 'auditor'];
    const speaker = speakers[Math.max(0, runNumber | 0) % speakers.length];
    const tags = summaryTags(summary);
    const lines = REACTIONS[speaker];
    const eligible = lines.filter(line => line.tags.some(tag => tag !== 'default' && tags.has(tag)));
    const pool = eligible.length ? eligible : lines.filter(line => line.tags.includes('default'));
    const fresh = pool.filter(line => !recentIds.includes(line.id));
    const selected = (fresh.length ? fresh : pool)[Math.max(0, runNumber | 0) % (fresh.length ? fresh.length : pool.length)];
    return { speaker, ...selected };
}

export function nextNarrativeState(meta, summary) {
    const recent = Array.isArray(meta.recentDialogueIds) ? meta.recentDialogueIds : [];
    const reaction = chooseHubReaction(summary, { runNumber: meta.runs | 0, recentIds: recent });
    const auditorTrust = Math.max(0, meta.auditorTrust | 0) + ((summary.policyViolations | 0) > 0 ? 1 : 0);
    return {
        reaction,
        recentDialogueIds: [...recent, reaction.id].slice(-5),
        auditorTrust,
        relationshipUnlocked: !!meta.relationshipUnlocked || auditorTrust >= 3
    };
}
