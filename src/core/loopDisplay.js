// Live loop index is 1-based: the Nth loop shows N, matching "Finish in N loops".
// pastRuns.length is the kept-echo buffer (capped by maxGhosts), so it is not this number.

export function displayedLoopNumber(loopNumber) {
    const n = Math.floor(Number(loopNumber));
    if (!Number.isFinite(n) || n < 1) return 1;
    return n;
}

/** True when the live loop is within a 1-based par ("finish in maxLoops loops"). */
export function finishedWithinLoops(loopNumber, maxLoops) {
    const max = Math.floor(Number(maxLoops));
    if (!Number.isFinite(max) || max < 1) return false;
    return displayedLoopNumber(loopNumber) <= max;
}

/** Results copy. `par` is the level's 1-based par when the level defines one. */
export function finishLoopLine(loopNumber, par) {
    const n = displayedLoopNumber(loopNumber);
    const noun = n === 1 ? 'loop' : 'loops';
    const p = Math.floor(Number(par));
    if (Number.isFinite(p) && p >= 1) return `Finished in ${n} ${noun} (par ${p}).`;
    return `Finished in ${n} ${noun}.`;
}

export const DEV_PROGRESS_NOTE = 'Dev mode: progress not saved';

// Campaign results panel. Dev mode keeps the loop line and drops the credit.
export function formatCampaignClearMessage({ loopLine, firstClear, challengePassed, previouslyDone, devMode }) {
    const line = String(loopLine ?? '');
    if (devMode) {
        let html = `${line}<br>${DEV_PROGRESS_NOTE}`;
        if (!challengePassed) {
            html += previouslyDone ? '<br>⭐ Challenge Already Claimed ⭐' : '<br>Challenge Failed (Try again!)';
        }
        const color = !challengePassed && previouslyDone ? 'gold' : (challengePassed ? '#9fb0bd' : '#888');
        return { html, color };
    }
    const earnedMsg = firstClear ? 'Level Clear: +$50<br><br>' : '';
    const prefix = `${line}<br>` + earnedMsg;
    if (challengePassed) {
        return { html: prefix + '⭐ Challenge Passed! (+$50) ⭐', color: 'gold' };
    }
    return {
        html: prefix + (previouslyDone ? '⭐ Challenge Already Claimed ⭐' : 'Challenge Failed (Try again!)'),
        color: previouslyDone ? 'gold' : '#888'
    };
}
