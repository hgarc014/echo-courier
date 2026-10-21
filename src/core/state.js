import { prepareLoadedAsset } from './sprites.js';
import { PLAYER_SHEET_PATH, PROPS_SHEET_PATH, ENV_SHEET_PATH, buildPlayerAtlas, buildWorldAtlas } from './atlas.js';

function loadAudioSettings() {
    const raw = localStorage.getItem('echoCourier_audio');
    if (!raw) {
        return { muted: false, dialogVoiceEnabled: true, dialogVolume: 0.9, musicVolume: 0.7 };
    }

    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return { muted: false, dialogVoiceEnabled: true, dialogVolume: 0.9, musicVolume: 0.7 };
    }

    const settings = {
        muted: !!parsed.muted,
        dialogVoiceEnabled: parsed.dialogVoiceEnabled !== false,
        dialogVolume: typeof parsed.dialogVolume === 'number' ? parsed.dialogVolume : 0.9,
        musicVolume: typeof parsed.musicVolume === 'number' ? parsed.musicVolume : 0.7
    };

    const isLegacyDefault =
        settings.muted === false &&
        settings.dialogVoiceEnabled === true &&
        settings.dialogVolume === 0.8 &&
        settings.musicVolume === 0.8;

    if (isLegacyDefault) {
        settings.dialogVolume = 0.9;
        settings.musicVolume = 0.7;
    }

    return settings;
}

export const state = {
    maxUnlockedLevel: 0,
    playerColor: localStorage.getItem('echoCourier_suit') || '#ff7b00',
    challengesCompleted: {},
    abilitiesPurchased: {},
    tutorialProgress: {},
    audioSettings: loadAudioSettings(),
    runStats: { tosses: 0, dashes: 0, cloaks: 0, alarms: 0 },
    
    FPS: 60,
    TICK_RATE: 1000 / 60,
    assets: {},
    assetsLoaded: 0,
    assetNames: ['player', 'package', 'plate', 'door', 'wall', 'zone', 'guard', 'laser', 'camera', 'heavy', 'fragile'],
    playerAtlas: null,
    worldAtlas: null,
    
    pastRuns: [],
    loopNumber: 1,
    currentRun: [],
    currentTick: 0,
    activeGhosts: [],
    gameState: 'MENU',
    currentLevelIndex: 0,
    failTimer: 0,
    failMessage: "",
    failFx: null,
    rewindFx: null,
    ghostFellFx: [],
    shakeTimer: 0,
    shakeMax: 0,
    shakeMag: 0,
    rewindFreeze: 0,
    alarmState: false,
    levelAbilityOverrides: [],
    worldUnlockedAbilities: null,
    clearedLevels: {},
    currentLevelMeta: null,
    pendingBossIntro: null,
    
    walls: [], doors: [], plates: [], hints: [], packages: [], lasers: [], guards: [], cameras: [], drones: [], winds: [], statics: [], cracks: [], robots: [], burrowers: [], wardens: [], gatekeepers: [], prisms: [], projectiles: [], dashTrails: [],
    gatekeeperCheckpoint: {},
    noiseEvents: [],
    alarmWasOn: false,
    deliveryZone: null, player: null,
    bossCheckpoint: null,
    bossCheckpointLive: false,
    mapWidth: 800, mapHeight: 600,
    camX: 0, camY: 0,
    playtesting: false,
    customLayout: null,
    editorReturnLayout: null,
    
    resetRunData: function() {
        this.walls=[]; this.doors=[]; this.plates=[]; this.hints=[]; this.packages=[]; this.lasers=[]; this.guards=[]; this.cameras=[]; this.drones=[]; this.winds=[]; this.statics=[]; this.cracks=[]; this.robots=[]; this.burrowers=[]; this.wardens=[]; this.gatekeepers=[]; this.prisms=[]; this.projectiles=[]; this.dashTrails=[]; this.deliveryZone=null; this.player=null;
        this.noiseEvents=[]; this.alarmWasOn=false;
        this.failTimer=0; this.failMessage=""; this.failFx=null; this.rewindFx=null; this.ghostFellFx=[]; this.shakeTimer=0; this.shakeMax=0; this.shakeMag=0; this.rewindFreeze=0;
        this.camX=0; this.camY=0;
    }
};

const CROP_ASSETS = new Set(['player', 'package', 'guard', 'camera', 'heavy', 'fragile']);

state.assetNames.forEach(name => {
    const img = new Image();
    img.src = `assets/${name}.png`;
    img.onload = () => {
        state.assets[name] = prepareLoadedAsset(img, { crop: CROP_ASSETS.has(name), keyBlack: true });
        state.assetsLoaded++;
    };
    state.assets[name] = img;
});

const playerSheet = new Image();
playerSheet.src = PLAYER_SHEET_PATH;
playerSheet.onload = () => {
    try {
        state.playerAtlas = buildPlayerAtlas(playerSheet);
    } catch {
        state.playerAtlas = null;
    }
};
playerSheet.onerror = () => {
    state.playerAtlas = null;
};

const propsSheet = new Image();
const envSheet = new Image();
function tryBuildWorldAtlas() {
    const propsOk = propsSheet.complete && (propsSheet.naturalWidth || propsSheet.width);
    const envOk = envSheet.complete && (envSheet.naturalWidth || envSheet.width);
    if (!propsOk && !envOk) return;
    try {
        state.worldAtlas = buildWorldAtlas(
            propsOk ? propsSheet : null,
            envOk ? envSheet : null
        );
    } catch {
        state.worldAtlas = null;
    }
}
propsSheet.onload = tryBuildWorldAtlas;
envSheet.onload = tryBuildWorldAtlas;
propsSheet.onerror = tryBuildWorldAtlas;
envSheet.onerror = tryBuildWorldAtlas;
propsSheet.src = PROPS_SHEET_PATH;
envSheet.src = ENV_SHEET_PATH;

export function getCredits() {
    let earned = (state.maxUnlockedLevel * 50) + (Object.keys(state.challengesCompleted).length * 50);
    let spent =
        (state.abilitiesPurchased['dash'] ? 150 : 0) +
        (state.abilitiesPurchased['toss'] ? 150 : 0) +
        (state.abilitiesPurchased['cloak'] ? 200 : 0) +
        (state.abilitiesPurchased['ghostShield'] ? 200 : 0);
    return earned - spent;
}

export const PROGRESS_KEYS = [
    'echoCourier_maxLevel',
    'echoCourier_challenges',
    'echoCourier_abilities',
    'echoCourier_tutorials',
    'echoCourier_cleared'
];

// Tutorial "seen" flags (echoCourier_demoSeen_*) are progress; only markDemoSeen writes them.
export const DEMO_SEEN_KEY_PREFIX = 'echoCourier_demoSeen_';

export const UNLOCK_ALL_KEY = 'echoCourier_unlockAll';

export function isDevUrlEnabled() {
    try {
        return new URLSearchParams(location.search).get('dev') === '1';
    } catch {
        return false;
    }
}

export function isUnlockAll() {
    if (typeof localStorage === 'undefined') return false;
    try {
        return localStorage.getItem(UNLOCK_ALL_KEY) === '1';
    } catch {
        return false;
    }
}

export function setUnlockAll(enabled) {
    if (typeof localStorage === 'undefined') return;
    try {
        localStorage.setItem(UNLOCK_ALL_KEY, enabled ? '1' : '0');
    } catch {
        /* private mode / quota */
    }
    if (!enabled) reloadProgressFromStorage();
}

export function isDevMode() {
    // Settings "Unlock All Levels (Dev/Testing)" is full dev mode, same as ?dev=1
    // with the dev checkbox: every level, rank 4, and the shop. Toss, cloak, and
    // ghost shield stay granted. Dash does not: Heavy Going still applies last.
    if (isUnlockAll()) return true;
    if (!isDevUrlEnabled()) return false;
    if (typeof document === 'undefined' || typeof document.getElementById !== 'function') return false;
    const el = document.getElementById('dev-mode-checkbox');
    return !!(el && el.checked);
}

// levels.js registers these after WORLDS is built. Null keeps the linear index rule
// (settings tests import state.js alone).
let worldUnlockProbe = null;
let levelClearHandler = null;

export function setWorldUnlockProbe(fn) {
    worldUnlockProbe = typeof fn === 'function' ? fn : null;
}

export function setLevelClearHandler(fn) {
    levelClearHandler = typeof fn === 'function' ? fn : null;
}

export function isLevelUnlocked(idx, lvl) {
    if (isDevMode()) return true;
    if (lvl && lvl.isPendingCampaign) return true;
    if (worldUnlockProbe) {
        const verdict = worldUnlockProbe(idx, lvl);
        if (verdict === true || verdict === false) return verdict;
    }
    return idx <= state.maxUnlockedLevel;
}

export function applyDevModeUi() {
    if (typeof document === 'undefined' || typeof document.getElementById !== 'function') return;
    const allowed = isDevUrlEnabled();
    const box = document.getElementById('dev-mode-controls');
    if (box) box.hidden = !allowed;
    if (!allowed) {
        const cb = document.getElementById('dev-mode-checkbox');
        if (cb) cb.checked = false;
    }
}

export function getPlayerRank() {
    if (isDevMode()) return 4;
    if (state.maxUnlockedLevel >= 11) return 4;
    if (state.maxUnlockedLevel >= 9) return 3;
    if (state.maxUnlockedLevel >= 6) return 2;
    if (state.maxUnlockedLevel >= 3) return 1;
    return 0;
}

// levels.js registers this after WORLDS exists. state.js must not import levels.js (that import is already the other way).
let dashUnlockedByProgression = () => null;
export function registerDashProgression(fn) {
    if (typeof fn === 'function') dashUnlockedByProgression = fn;
}

function applyDashProgression(set, level) {
    const flag = dashUnlockedByProgression(level);
    if (flag === true) set.add('dash');
    else if (flag === false) set.delete('dash');
}

// unlocks is a synonym of grants (GAME_REFERENCE) for dash, toss, and cloak.
// ghostShield in unlocks only lets a purchase work on that level; grants still gives it.
function abilitiesListedAsGrants(level) {
    const granted = new Set(level?.grants || []);
    for (const ability of level?.unlocks || []) {
        if (ability !== 'ghostShield') granted.add(ability);
    }
    return granted;
}

export function applyLevelAbilityOverrides(level) {
    // Dash itself follows dashUnlockedByProgression, so a copied world unlock list cannot grant it early.
    const granted = abilitiesListedAsGrants(level);
    applyDashProgression(granted, level);
    state.levelAbilityOverrides = [...granted];
}

export function getUnlockedAbilities() {
    // Dev mode (Unlock All, or ?dev=1 with the checkbox) grants toss, cloak, and
    // ghost shield. There is no within-world gate for those three — only the shop's
    // world list, which dev mode still bypasses. Dash is applied last by
    // dashUnlockedByProgression, so W1 and W2 before Heavy Going never have it.
    let unlocks = new Set();
    if (isDevMode()) {
        unlocks.add('toss');
        unlocks.add('cloak');
        unlocks.add('ghostShield');
    }
    const gate = state.worldUnlockedAbilities;
    const allowPurchased = (ability) => gate == null || gate.includes(ability);
    if (state.abilitiesPurchased['dash'] && allowPurchased('dash')) unlocks.add('dash');
    if (state.abilitiesPurchased['toss'] && allowPurchased('toss')) unlocks.add('toss');
    if (state.abilitiesPurchased['cloak'] && allowPurchased('cloak')) unlocks.add('cloak');
    // Shop Echo Shield only works on a level that lists it. World-chain inheritance
    // (dash/toss/cloak) does not carry the shield into W4-L1/L2 or later worlds.
    if (state.abilitiesPurchased['ghostShield'] && purchasedShieldAllowed(allowPurchased)) unlocks.add('ghostShield');
    for (let ability of state.levelAbilityOverrides) unlocks.add(ability);
    const meta = state.currentLevelMeta;
    if (meta) {
        for (let ability of abilitiesListedAsGrants(meta)) unlocks.add(ability);
    }
    applyDashProgression(unlocks, meta);
    return Array.from(unlocks);
}

function purchasedShieldAllowed(allowPurchased) {
    const meta = state.currentLevelMeta;
    if (!meta) return allowPurchased('ghostShield');
    if (Array.isArray(meta.unlocks)) return meta.unlocks.includes('ghostShield');
    return allowPurchased('ghostShield');
}

function readProgressObject(key) {
    try {
        const parsed = JSON.parse(localStorage.getItem(key) || '{}');
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
        return parsed;
    } catch {
        return {};
    }
}

export function reloadProgressFromStorage() {
    const maxLevel = parseInt(localStorage.getItem('echoCourier_maxLevel') || '0', 10);
    state.maxUnlockedLevel = Number.isFinite(maxLevel) ? maxLevel : 0;
    state.challengesCompleted = readProgressObject('echoCourier_challenges');
    state.abilitiesPurchased = readProgressObject('echoCourier_abilities');
    state.tutorialProgress = readProgressObject('echoCourier_tutorials');
    state.clearedLevels = readProgressObject('echoCourier_cleared');
}

function writeProgress() {
    localStorage.setItem('echoCourier_maxLevel', state.maxUnlockedLevel);
    localStorage.setItem('echoCourier_challenges', JSON.stringify(state.challengesCompleted));
    localStorage.setItem('echoCourier_abilities', JSON.stringify(state.abilitiesPurchased));
    localStorage.setItem('echoCourier_tutorials', JSON.stringify(state.tutorialProgress));
    localStorage.setItem('echoCourier_cleared', JSON.stringify(state.clearedLevels || {}));
}

// Persists campaign progress. No-op while dev mode is on so Unlock All / ?dev=1 cannot clobber a real save.
export function saveProgress() {
    if (isDevMode()) return;
    writeProgress();
}

export function saveState() {
    saveProgress();
    localStorage.setItem('echoCourier_audio', JSON.stringify(state.audioSettings));
    localStorage.setItem('echoCourier_suit', state.playerColor);
}

// idx is a campaign level index. campaignLevelCount caps the unlock bump (last level does not advance past itself).
export function recordLevelClear(idx, options = {}) {
    if (isDevMode()) return;
    const levelIndex = Number(idx);
    if (!Number.isInteger(levelIndex) || levelIndex < 0) return;
    const cap = Number.isFinite(options.campaignLevelCount) ? options.campaignLevelCount : Infinity;
    // Out-of-band worlds (W4 sits past the linear cursor) record their own clears
    // so the cursor does not jump over every index in between.
    const handled = levelClearHandler ? levelClearHandler(levelIndex, cap) === true : false;
    if (!handled && levelIndex >= state.maxUnlockedLevel && levelIndex < cap - 1) {
        state.maxUnlockedLevel = levelIndex + 1;
    }
    if (options.challengePassed && !state.challengesCompleted[levelIndex]) {
        state.challengesCompleted[levelIndex] = true;
    }
    saveProgress();
}

export function purchaseAbility(name) {
    if (isDevMode() || !name) return false;
    state.abilitiesPurchased[name] = true;
    saveProgress();
    return true;
}

export function markTutorialProgress(idx) {
    if (isDevMode()) return;
    if (idx === undefined || idx === null) return;
    state.tutorialProgress[idx] = true;
    saveProgress();
}

export function markDemoSeen(key) {
    if (!key || isDevMode()) return;
    try { localStorage.setItem(key, '1'); }
    catch { /* ignore quota / private mode */ }
}

function removeDemoSeenKeys() {
    if (typeof localStorage === 'undefined' || typeof localStorage.key !== 'function') return;
    const count = localStorage.length;
    if (typeof count !== 'number') return;
    const doomed = [];
    for (let i = 0; i < count; i++) {
        const key = localStorage.key(i);
        if (typeof key === 'string' && key.startsWith(DEMO_SEEN_KEY_PREFIX)) doomed.push(key);
    }
    for (const key of doomed) localStorage.removeItem(key);
}

export function wipeProgress() {
    if (typeof localStorage !== 'undefined') {
        for (const key of PROGRESS_KEYS) {
            try { localStorage.removeItem(key); } catch { /* private mode */ }
        }
        removeDemoSeenKeys();
    }
    state.maxUnlockedLevel = 0;
    state.challengesCompleted = {};
    state.abilitiesPurchased = {};
    state.tutorialProgress = {};
    state.clearedLevels = {};
}

reloadProgressFromStorage();
