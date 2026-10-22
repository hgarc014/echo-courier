// Headless solution replay: loads a level in Node (DOM stubbed, no rendering),
// feeds recorded per-tick key frames into the real update() loop, reports the outcome.
import { installDomStubs } from './domStub.mjs';

installDomStubs();
const main = await import('../../src/main.js');
const { state } = await import('../../src/core/state.js');
const { keys, updatePrevKeys } = await import('../../src/core/input.js');
const { LEVELS, deserializeLevel } = await import('../../src/data/levels.js');
const { displayedLoopNumber } = await import('../../src/core/loopDisplay.js');
const { RECORDED_KEYS } = await import('../../src/systems/inputRecorder.js');

export { main, state, keys, LEVELS };

/**
 * Resolve by levelName: a world inserted earlier shifts every index after it, so the
 * recorded index is only a hint. A name that matches no level is an error, never a
 * silent fallback to whatever now sits at that index.
 */
export function levelIndexForSolution(solution) {
    const name = solution && solution.levelName;
    if (typeof name === 'string' && name) {
        const idx = LEVELS.findIndex(level => level.name === name);
        if (idx < 0) throw new Error(`solution levelName "${name}" matches no level`);
        return idx;
    }
    return solution ? solution.level : undefined;
}

function setKeys(frameKey) {
    const on = new Set(frameKey ? frameKey.split('+') : []);
    for (const k of RECORDED_KEYS) keys[k] = on.has(k);
}

/** Load the solution's level and advance through story / boss-intro dialogs. */
export function loadLevel(solution) {
    for (const k of Object.keys(keys)) keys[k] = false;
    if (solution.layout) {
        state.editorLevelMeta = { ...(solution.meta || {}) };
        state.gameState = 'EDITOR';
        Object.assign(state, deserializeLevel(solution.layout));
        main.startPlaytestFromEditor();
    } else {
        main.startGame(levelIndexForSolution(solution));
    }
    for (let guard = 0; guard < 10 && state.gameState !== 'PLAYING'; guard++) {
        if (state.gameState !== 'DIALOG' && state.gameState !== 'BOSS_INTRO') break;
        keys.enter = true; main.stepSimulation();
        keys.enter = false; main.stepSimulation();
    }
    if (state.gameState !== 'PLAYING') throw new Error(`level did not reach PLAYING (state=${state.gameState})`);
}

/**
 * Replay a solution. Returns { completed, loopsUsed, ticks, failMessages, par }.
 * loopsUsed is the 1-based live loop (Nth loop is N), same number the HUD shows.
 */
export function replaySolution(solution, { extraTicks = 600, onTick = null } = {}) {
    loadLevel(solution);
    const failMessages = [];
    let ticks = 0;
    const observe = () => {
        if (state.failMessage && failMessages[failMessages.length - 1] !== state.failMessage) failMessages.push(state.failMessage);
    };
    outer: for (const loop of solution.loops) {
        for (const [frameKey, count] of loop) {
            for (let i = 0; i < count; i++) {
                if (state.gameState === 'LEVEL_COMPLETE') break outer;
                setKeys(frameKey);
                main.stepSimulation(); ticks++; observe(); if (onTick) onTick();
            }
        }
    }
    setKeys('');
    for (let i = 0; i < extraTicks && state.gameState === 'PLAYING'; i++) { main.stepSimulation(); ticks++; observe(); }
    const level = solution.layout ? null : LEVELS[levelIndexForSolution(solution)];
    return {
        completed: state.gameState === 'LEVEL_COMPLETE',
        loopsUsed: displayedLoopNumber(state.loopNumber),
        ticks,
        failMessages,
        par: level?.par ?? solution.par ?? null,
    };
}

export { updatePrevKeys };
