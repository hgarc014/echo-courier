import { state, saveState, getUnlockedAbilities, getPlayerRank } from './core/state.js';
import { keys, prevKeys, isKeyJustPressed, updatePrevKeys, initTouchControls, syncTouchUi, getMoveVector, consumeKey } from './core/input.js';
import { audioCtx, startMusic, scheduleMusic, SFX, playMenuMusic, speakDialog, stopDialogSpeech, unlockAudio, preloadDialogVoice } from './core/audio.js';
import { AABB, checkWallCollision, getDashDestination, PLAYER_MOVE_SPEED, HEAVY_SPEED_MULT } from './core/physics.js';
import { applyCamera, followWorldPoint, setMapSize, getMapSize, setCamera, DEFAULT_MAP_WIDTH, DEFAULT_MAP_HEIGHT } from './core/camera.js';
import { getLevelSetup, LEVELS, deserializeLevel, serializeLevel, createBoundWalls, CAMPAIGN_LEVEL_COUNT, TUTORIAL_LEVEL_INDICES, TUTORIAL_LEVEL_START, cloneDemo } from './data/levels.js';
import { Ghost, PlayerEntity } from './entities/actors.js';
import { initMenu, showSubMenu, updateHUD } from './ui/menu.js';
import { initEditor, drawEditorOverlay, tickEditor, syncEditorUi, setEditorLevelMetaFromLevel } from './ui/editor.js';
import { isDemoActive, isPopupDemo, canSkipDemo, startDemo, stopDemo, tickDemo, skipDemo, hasSeenDemo, demoStorageKey, initDemoPlayback } from './systems/demoPlayback.js';
import { drawSprite } from './core/sprites.js';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
initEditor(canvas, ctx);

const RECORDED_TRAIL_SECONDS = 2.5;
const PROJECTED_TRAIL_SECONDS = 3;
const RECORDED_TRAIL_FRAMES = Math.floor(RECORDED_TRAIL_SECONDS * 60);
const PROJECTED_TRAIL_FRAMES = Math.floor(PROJECTED_TRAIL_SECONDS * 60);
const FAIL_HOLD_FRAMES = 120;
const FAIL_TEXT_DELAY = 28;
const TOSS_COOLDOWN_TICKS = 24;

function failKindFromReason(reason) {
    const r = (reason || '').toLowerCase();
    if (r.includes('laser') || r.includes('burn') || r.includes('vapor')) return 'laser';
    if (r.includes('guard') || r.includes('spotted') || r.includes('drone') || r.includes('caught')) return 'guard';
    if (r.includes('pit') || r.includes('fell') || r.includes('crack')) return 'crack';
    if (r.includes('fragile') || r.includes('package') || r.includes('explod')) return 'package';
    return 'default';
}

function deathSite(reason) {
    const kind = failKindFromReason(reason);
    if (kind === 'package') {
        const pkg = state.packages.find(p => p.breakFx || p.isDestroyed);
        if (pkg) return { x: pkg.x + pkg.w / 2, y: pkg.y + pkg.h / 2 };
    }
    const p = state.player;
    if (p) return { x: p.x + p.w / 2, y: p.y + p.h / 2 };
    return { x: canvas.width / 2, y: canvas.height / 2 };
}

function failPalette(kind) {
    if (kind === 'laser') return { colors: ['#00f3ff', '#ffffff', '#ff3344'], glow: [180, 255, 255], vapor: true };
    if (kind === 'guard') return { colors: ['#ffdd00', '#ff3333', '#ff7b00'], glow: [255, 80, 40], vapor: false };
    if (kind === 'crack') return { colors: ['#c9893a', '#888888', '#ffaa66'], glow: [180, 120, 60], vapor: false };
    if (kind === 'package') return { colors: ['#ff6b6b', '#ffaa88', '#ffffff'], glow: [255, 120, 80], vapor: false };
    return { colors: ['#ff2244', '#00f3ff', '#ffffff'], glow: [255, 40, 70], vapor: false };
}

function spawnBurst(cx, cy, opts) {
    const particles = [];
    const n = opts.count;
    const inward = !!opts.inward;
    for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
        const speed = opts.speedMin + Math.random() * (opts.speedMax - opts.speedMin);
        const dir = inward ? -1 : 1;
        let x = cx;
        let y = cy;
        if (inward) {
            const radius = opts.radius || 34;
            x = cx + Math.cos(a) * radius;
            y = cy + Math.sin(a) * radius;
        }
        particles.push({
            x, y,
            vx: Math.cos(a) * speed * dir,
            vy: Math.sin(a) * speed * dir - (opts.lift || 0),
            life: opts.lifeMin + Math.random() * 10,
            size: opts.sizeMin + Math.random() * opts.sizeMax,
            rot: Math.random() * Math.PI,
            color: opts.colors[i % opts.colors.length]
        });
    }
    return { ttl: opts.ttl, max: opts.ttl, kind: opts.kind, particles, cx, cy, glow: opts.glow, vapor: !!opts.vapor };
}

function tickBurst(fx) {
    if (!fx) return null;
    fx.ttl--;
    const drag = fx.vapor || fx.kind === 'rewind';
    for (const s of fx.particles) {
        if (s.life <= 0) continue;
        s.x += s.vx;
        s.y += s.vy;
        if (drag) {
            s.vx *= 0.92;
            s.vy *= 0.92;
        } else {
            s.vy += 0.16;
            s.vx *= 0.99;
        }
        s.life--;
        s.rot += 0.2;
    }
    return fx.ttl <= 0 ? null : fx;
}

function drawBurst(target, fx) {
    if (!fx || fx.ttl <= 0) return;
    const life = fx.ttl / fx.max;
    const [gr, gg, gb] = fx.glow || [255, 40, 70];
    target.save();
    target.globalAlpha = 0.55 * life;
    const grd = target.createRadialGradient(fx.cx, fx.cy, 2, fx.cx, fx.cy, 16 + (1 - life) * 34);
    grd.addColorStop(0, `rgba(${gr},${gg},${gb},0.9)`);
    grd.addColorStop(0.45, `rgba(${gr},${gg},${gb},0.35)`);
    grd.addColorStop(1, `rgba(${gr},${gg},${gb},0)`);
    target.fillStyle = grd;
    target.beginPath();
    target.arc(fx.cx, fx.cy, 16 + (1 - life) * 34, 0, Math.PI * 2);
    target.fill();
    if (fx.kind === 'rewind') {
        target.globalAlpha = 0.7 * life;
        target.strokeStyle = `rgba(0,243,255,${0.85 * life})`;
        target.lineWidth = 2;
        target.beginPath();
        target.arc(fx.cx, fx.cy, 8 + (1 - life) * 40, 0, Math.PI * 2);
        target.stroke();
    }
    target.restore();
    for (const s of fx.particles) {
        if (s.life <= 0) continue;
        const a = Math.max(0, Math.min(1, s.life / 22));
        target.save();
        target.translate(s.x, s.y);
        target.rotate(s.rot);
        target.globalAlpha = a;
        target.fillStyle = s.color;
        if (fx.vapor) target.fillRect(-s.size * 0.4, -s.size * 1.4, s.size * 0.8, s.size * 2.8);
        else target.fillRect(-s.size / 2, -s.size / 2, s.size, s.size * 0.7);
        target.restore();
    }
}

function startShake(frames, mag) {
    state.shakeTimer = frames;
    state.shakeMax = frames;
    state.shakeMag = mag;
}

function spawnFailFx(reason) {
    const site = deathSite(reason);
    const kind = failKindFromReason(reason);
    const pal = failPalette(kind);
    state.failFx = spawnBurst(site.x, site.y, {
        count: 14,
        speedMin: kind === 'laser' ? 2.2 : 1.8,
        speedMax: kind === 'crack' ? 4.8 : 4.2,
        lift: pal.vapor ? 1.1 : 0.45,
        lifeMin: 18,
        sizeMin: 2.2,
        sizeMax: 3.2,
        ttl: 42,
        kind,
        colors: pal.colors,
        glow: pal.glow,
        vapor: pal.vapor
    });
}

function spawnRewindFx() {
    const p = state.player;
    const cx = p ? p.x + p.w / 2 : canvas.width / 2;
    const cy = p ? p.y + p.h / 2 : canvas.height / 2;
    state.rewindFx = spawnBurst(cx, cy, {
        count: 16,
        speedMin: 2.0,
        speedMax: 3.4,
        lift: 0,
        lifeMin: 16,
        sizeMin: 2,
        sizeMax: 2.4,
        ttl: 22,
        kind: 'rewind',
        colors: ['#00f3ff', '#7df9ff', '#ffffff'],
        glow: [0, 243, 255],
        vapor: true,
        inward: true,
        radius: 36
    });
}

function beginRewindJuice() {
    SFX.rewind();
    spawnRewindFx();
    startShake(18, 7);
    state.rewindFreeze = 16;
}

function clearLoopFx() {
    state.failFx = null;
    state.rewindFx = null;
    state.shakeTimer = 0;
    state.shakeMax = 0;
    state.shakeMag = 0;
    state.rewindFreeze = 0;
}

function tickLoopFx() {
    if (state.shakeTimer > 0) state.shakeTimer--;
    if (state.failFx) state.failFx = tickBurst(state.failFx);
    if (state.rewindFx) state.rewindFx = tickBurst(state.rewindFx);
}

let uiTitleScreen = document.getElementById('title-screen');
let uiAppLayout = document.getElementById('app-layout');
let uiLevelComplete = document.getElementById('level-complete');
let uiGameOver = document.getElementById('game-over');

function showGameComplete() {
    state.gameState = 'GAME_COMPLETE';
    uiAppLayout.classList.remove('hidden'); uiLevelComplete.classList.add('hidden'); uiGameOver.classList.remove('hidden');
    let ed = document.getElementById('ending-title'); if(ed) { ed.innerText = "CHRONOHAUL EXPOSED"; ed.style.color = '#39ff14'; ed.style.textShadow = '0 0 20px #39ff14'; }
    let eb = document.getElementById('retry-btn'); if(eb) { eb.innerText = "RETURN TO CITY"; eb.style.borderColor = '#39ff14'; eb.style.color = '#39ff14'; }
    document.getElementById('credits-display').parentElement.classList.add('hidden');
}

function getLevelDisplayLabel(levelIndex, levelDef) {
    if (levelDef.isSandbox) return 'SB';
    if (levelDef.isPlaytest) return 'ED';
    if (levelDef.isTutorial) return `T${levelDef.tutorialNumber}`;
    return `${levelIndex + 1}`;
}

function getNextLevelIndex(levelIndex) {
    const level = LEVELS[levelIndex];
    if (!level) return null;
    if (level.isSandbox || level.isPlaytest) return null;
    if (level.isTutorial) {
        const tutorialPos = TUTORIAL_LEVEL_INDICES.indexOf(levelIndex);
        return tutorialPos >= 0 && tutorialPos < TUTORIAL_LEVEL_INDICES.length - 1 ? TUTORIAL_LEVEL_INDICES[tutorialPos + 1] : null;
    }
    return levelIndex < CAMPAIGN_LEVEL_COUNT - 1 ? levelIndex + 1 : null;
}

function buildProjectedEchoPath(runData) {
    if (!runData || runData.length === 0 || !state.player) return null;

    const points = [];
    for (let i = 0; i < runData.length; i++) {
        const step = runData[i];
        if (!step) continue;
        points.push({ x: step.x, y: step.y });
    }
    if (points.length === 0) return null;

    const visiblePoints = points.slice(-PROJECTED_TRAIL_FRAMES);
    const last = visiblePoints[visiblePoints.length - 1];

    return {
        points: visiblePoints,
        final: last
    };
}

function hasCompletedTutorialTrack() {
    return TUTORIAL_LEVEL_INDICES.length > 0 && TUTORIAL_LEVEL_INDICES.every(index => state.tutorialProgress[index]);
}

function getRequiredPackages() {
    return state.packages.filter(p => p.requiredForDelivery !== false);
}

function isPackageDelivered(pkg) {
    return !pkg.isDestroyed && !pkg.carriedBy && AABB(state.deliveryZone.x, state.deliveryZone.y, state.deliveryZone.w, state.deliveryZone.h, pkg.x, pkg.y, pkg.w, pkg.h);
}

function updateDeliveryProgressUI() {
    const box = document.getElementById('delivery-progress-box');
    const label = document.getElementById('delivery-progress');
    if (!box || !label || !state.deliveryZone) return;
    const required = getRequiredPackages();
    if (required.length <= 1) {
        box.classList.add('hidden');
        return;
    }
    const delivered = required.filter(isPackageDelivered).length;
    label.innerText = `${delivered} / ${required.length}`;
    box.classList.remove('hidden');
}

function showTutorialPrompt() {
    document.getElementById('main-menu-nav').classList.add('hidden');
    document.getElementById('sub-levels').classList.add('hidden');
    document.getElementById('sub-tutorials').classList.add('hidden');
    document.getElementById('sub-shop').classList.add('hidden');
    document.getElementById('sub-settings').classList.add('hidden');
    document.getElementById('tutorial-prompt').classList.remove('hidden');
}

function hideTutorialPrompt() {
    document.getElementById('tutorial-prompt').classList.add('hidden');
}

function localizeControlHints(text) {
    if (!text || !document.body.classList.contains('touch-ui')) return text;
    return text
        .replace(/Use SPACE to pick up and drop parcels\./i, 'Use GRAB to pick up and drop parcels.')
        .replace(/press R to create an echo/i, 'press LOOP to create an echo')
        .replace(/Press F to toss\./i, 'Use TOSS to throw it.')
        .replace(/DASH UPGRADE \(Shift\)\./i, 'Use DASH.')
        .replace(/CLOAK UPGRADE \(C\)\./i, 'Use CLOAK.');
}

function showLevelDialog(speaker, text, accentColor = '#39ff14', clipKey = null) {
    let speakerUI = document.getElementById('dialog-speaker'); if (speakerUI) { speakerUI.innerText = speaker; speakerUI.style.color = accentColor; }
    let textUI = document.getElementById('dialog-text'); if (textUI) textUI.innerText = `"${text}"`;
    let ov = document.getElementById('dialog-overlay'); if (ov) ov.classList.remove('hidden');
    preloadDialogVoice().catch(() => {});
    speakDialog(speaker, text, clipKey);
}

function hideLevelDialog() {
    let ov = document.getElementById('dialog-overlay'); if (ov) ov.classList.add('hidden');
    let ds = document.getElementById('dialog-speaker'); if (ds) ds.innerText = '';
    let dt = document.getElementById('dialog-text'); if (dt) dt.innerText = '';
    stopDialogSpeech();
}

function applyChallengeHud(level, levelIndex) {
    const el = document.getElementById('challenge-text');
    if (!el) return;
    el.classList.remove('challenge-done', 'challenge-open', 'challenge-training');
    el.style.color = '';
    if (level.isTutorial || level.isSandbox || level.isPlaytest) {
        el.innerText = level.isPlaytest ? 'EDITOR PLAYTEST' : (level.isSandbox ? 'DEV SANDBOX' : 'TRAINING MODULE');
        el.classList.add('challenge-training');
        return;
    }
    const done = !!state.challengesCompleted[levelIndex];
    el.innerText = (done ? '⭐ ' : '☆ ') + 'Challenge: ' + level.challenge.desc;
    el.classList.add(done ? 'challenge-done' : 'challenge-open');
}

function consumeDialogConfirmKeys() {
    consumeKey('space');
    consumeKey('enter');
}

function resetPlayerLoopState() {
    if (!state.player) return;
    state.player.facingX = 1;
    state.player.facingY = 0;
    state.player.cloakTimer = 0;
    state.player.dashCooldown = 0;
    state.player.tossCooldown = 0;
}

function loadCurrentEntities() {
    if (state.playtesting && state.customLayout) return deserializeLevel(state.customLayout);
    return getLevelSetup(state.currentLevelIndex);
}

function applyLoadedLevel(setupData) {
    if (!setupData) return;
    Object.assign(state, setupData);
    if (!Array.isArray(state.hints)) state.hints = [];
    setMapSize(setupData.mapWidth || DEFAULT_MAP_WIDTH, setupData.mapHeight || DEFAULT_MAP_HEIGHT);
    resetPlayerLoopState();
    if (state.gameState !== 'EDITOR' && state.player) {
        followWorldPoint(state.player.x + state.player.w / 2, state.player.y + state.player.h / 2);
    }
}

function syncGameplayCamera() {
    if (state.gameState === 'EDITOR' || !state.player) return;
    followWorldPoint(state.player.x + state.player.w / 2, state.player.y + state.player.h / 2);
}

function startBossIntro(level) {
    if (!level?.bossIntro) return;
    state.pendingBossIntro = null;
    state.gameState = 'BOSS_INTRO';
    showLevelDialog(level.bossIntro.speaker, level.bossIntro.text, '#ff5555', `level-${state.currentLevelIndex}-boss-intro`);
}

function beginBossEncounter(level) {
    if (!level?.isBoss) return;
    if (level.bossIntroDoorId) {
        let introDoor = state.doors.find(d => d.id === level.bossIntroDoorId);
        if (introDoor) introDoor.isOpen = true;
    }
    state.robots.forEach(robot => {
        robot.engaged = false;
        robot.isEmerging = true;
        robot.fireCooldown = Math.max(robot.fireCooldown, 60);
    });
}

function engageBossEncounter(level) {
    if (!level?.isBoss) return;
    state.robots.forEach(robot => {
        robot.isEmerging = false;
        robot.engaged = true;
        robot.fireCooldown = Math.max(robot.fireCooldown, 30);
    });
}

function ghostShieldBlocks(defenderGhost, actorBox) {
    const unlocked = getUnlockedAbilities();
    if (!unlocked.includes('ghostShield') || !defenderGhost.isActive) return false;

    const fx = defenderGhost.facingX || 1;
    const fy = defenderGhost.facingY || 0;
    const ghostCx = defenderGhost.x + defenderGhost.w / 2;
    const ghostCy = defenderGhost.y + defenderGhost.h / 2;
    const actorCx = actorBox.x + actorBox.w / 2;
    const actorCy = actorBox.y + actorBox.h / 2;
    const dot = (actorCx - ghostCx) * fx + (actorCy - ghostCy) * fy;
    return dot > 0;
}

function getActiveDemoConfig() {
    const meta = state.currentLevelMeta;
    if (meta?.demo?.steps?.length) return meta.demo;
    if (state.playtesting && state.editorLevelMeta?.demo?.steps?.length) return state.editorLevelMeta.demo;
    const lv = LEVELS[state.currentLevelIndex];
    if (lv?.demo?.steps?.length) return lv.demo;
    return null;
}

function maybeStartDemo(opts = {}) {
    const demo = getActiveDemoConfig();
    if (!demo?.steps?.length) return;
    const playtest = !!(state.playtesting || state.currentLevelMeta?.isPlaytest);
    const persistKey = playtest ? null : demoStorageKey(state.currentLevelIndex, state.currentLevelMeta?.name);
    const force = !!opts.force;
    if (!force) {
        if (demo.autoPlayOnFirstEnter === false) return;
        if (!playtest && hasSeenDemo(persistKey)) return;
    }
    startDemo(demo, { persistKey });
}


let hintDemoSnapshot = null;
let hintReopenGateUntil = 0;
let hintAutoOpened = new Set();
let activeHintId = null;
let hintDemoJustClosed = false;

function resolveHintDemo(hint) {
    if (!hint) return null;
    if (hint.demo?.steps?.length) return cloneDemo(hint.demo);
    const demoId = hint.demoId;
    if (demoId && state.levelDemos?.[demoId]?.steps?.length) return cloneDemo(state.levelDemos[demoId]);
    const lv = state.currentLevelMeta || LEVELS[state.currentLevelIndex];
    if (demoId && lv?.demos?.[demoId]?.steps?.length) return cloneDemo(lv.demos[demoId]);
    if (lv?.demo?.steps?.length) return cloneDemo(lv.demo);
    if (state.currentLevelMeta?.demo?.steps?.length) return cloneDemo(state.currentLevelMeta.demo);
    return null;
}

function captureHintDemoSnapshot() {
    const layout = serializeLevel(state);
    // Preserve live package/player positions in the layout snapshot
    if (state.player) layout.player = { x: state.player.x, y: state.player.y };
    if (Array.isArray(state.packages)) {
        layout.packages = state.packages.map(p => ({
            x: p.x, y: p.y, id: p.id,
            packageType: p.type,
            requiredForDelivery: p.requiredForDelivery !== false
        }));
    }
    return {
        layout,
        pastRuns: JSON.parse(JSON.stringify(state.pastRuns || [])),
        currentRun: JSON.parse(JSON.stringify(state.currentRun || [])),
        currentTick: state.currentTick || 0,
        alarmState: !!state.alarmState,
        runStats: { ...(state.runStats || {}) },
        camX: state.camX, camY: state.camY,
        playerExtras: state.player ? {
            x: state.player.x, y: state.player.y,
            facingX: state.player.facingX, facingY: state.player.facingY,
            dashCooldown: state.player.dashCooldown || 0,
            cloakTimer: state.player.cloakTimer || 0,
            tossCooldown: state.player.tossCooldown || 0
        } : null,
        packageExtras: (state.packages || []).map(p => ({
            id: p.id, x: p.x, y: p.y, carriedBy: p.carriedBy, isDestroyed: !!p.isDestroyed,
            wasPickedUp: !!p.wasPickedUp, countdown: p.countdown, tossTicks: p.tossTicks,
            tossMax: p.tossMax, vx: p.vx, vy: p.vy
        })),
        doorStates: (state.doors || []).map(d => ({ id: d.id, isOpen: !!d.isOpen })),
        hints: (state.hints || []).map(h => ({ id: h.id, x: h.x, y: h.y }))
    };
}

function restoreHintDemoSnapshot(snap) {
    if (!snap) return;
    applyLoadedLevel(deserializeLevel(snap.layout));
    state.pastRuns = snap.pastRuns || [];
    state.currentRun = snap.currentRun || [];
    state.currentTick = snap.currentTick || 0;
    state.alarmState = !!snap.alarmState;
    state.runStats = { ...(snap.runStats || {}) };
    state.camX = snap.camX || 0;
    state.camY = snap.camY || 0;
    state.activeGhosts = (state.pastRuns || []).map((run, i) => new Ghost(i, run));
    if (snap.playerExtras && state.player) {
        Object.assign(state.player, snap.playerExtras);
    }
    if (Array.isArray(snap.packageExtras)) {
        for (const pe of snap.packageExtras) {
            const pkg = (state.packages || []).find(p => p.id === pe.id);
            if (!pkg) continue;
            Object.assign(pkg, pe);
        }
    }
    if (Array.isArray(snap.doorStates)) {
        for (const ds of snap.doorStates) {
            const door = (state.doors || []).find(d => d.id === ds.id);
            if (door) door.isOpen = ds.isOpen;
        }
    }
    // Keep hint positions stable
    if (Array.isArray(snap.hints) && Array.isArray(state.hints)) {
        for (const hs of snap.hints) {
            const hint = state.hints.find(h => h.id === hs.id);
            if (hint) { hint.x = hs.x; hint.y = hs.y; }
        }
    }
    document.getElementById('loop-count').innerText = state.pastRuns.length;
    updateDeliveryProgressUI();
    if (state.player) followWorldPoint(state.player.x + state.player.w / 2, state.player.y + state.player.h / 2);
}

function dismissHintDemo() {
    const snap = hintDemoSnapshot;
    hintDemoSnapshot = null;
    activeHintId = null;
    hintReopenGateUntil = (state.currentTick || 0) + 45;
    hintDemoJustClosed = true;
    if (snap) restoreHintDemoSnapshot(snap);
    state.gameState = 'PLAYING';
}

function openHintDemo(hint) {
    if (!hint || isDemoActive()) return false;
    const demo = resolveHintDemo(hint);
    if (!demo?.steps?.length) return false;
    hintDemoSnapshot = captureHintDemoSnapshot();
    activeHintId = hint.id;
    // Freeze player progress visually by restarting entities for a clean demo stage
    applyLoadedLevel(loadCurrentEntities());
    state.pastRuns = [];
    state.currentRun = [];
    state.currentTick = 0;
    state.activeGhosts = [];
    state.alarmState = false;
    state.failTimer = 0;
    clearLoopFx?.();
    const title = hint.title || 'Hint Demo';
    const ok = startDemo(demo, {
        mode: 'popup',
        title,
        persistKey: null,
        onDismiss: () => dismissHintDemo()
    });
    if (!ok) {
        restoreHintDemoSnapshot(hintDemoSnapshot);
        hintDemoSnapshot = null;
        activeHintId = null;
        return false;
    }
    return true;
}

function playerOverlapsHint(hint) {
    if (!state.player || !hint) return false;
    return AABB(state.player.x, state.player.y, state.player.w, state.player.h, hint.x, hint.y, hint.w, hint.h);
}

function updateHintPlates(interactPressed) {
    if (state.gameState !== 'PLAYING' || isDemoActive()) return;
    const tick = state.currentTick || 0;
    if (tick < hintReopenGateUntil) return;
    const hints = state.hints || [];
    let standing = null;
    for (const hint of hints) {
        if (playerOverlapsHint(hint)) { standing = hint; break; }
    }
    if (!standing) return;
    if (standing.autoOpen && !hintAutoOpened.has(standing.id)) {
        hintAutoOpened.add(standing.id);
        openHintDemo(standing);
        return;
    }
    if (interactPressed) {
        openHintDemo(standing);
    }
}


export function startGame(levelIndex) {
    unlockAudio();
    preloadDialogVoice().catch(() => {});
    if (levelIndex >= LEVELS.length) { 
        showGameComplete();
        return; 
    }
    if (isDemoActive()) stopDemo({ markSeen: false, invokeDismiss: false });
    hintDemoSnapshot = null;
    activeHintId = null;
    hintAutoOpened.clear();
    hintReopenGateUntil = 0;
    hintDemoJustClosed = false;
    state.currentLevelIndex = levelIndex;
    state.currentLevelMeta = LEVELS[levelIndex];
    state.pendingBossIntro = state.currentLevelMeta?.bossIntro || null;
    startMusic();
    let maxLoops = LEVELS[levelIndex].maxGhosts + 1;
    document.getElementById('max-loops').innerText = maxLoops;
    let lv = LEVELS[levelIndex];
    state.levelAbilityOverrides = [...(lv.grants || [])];
    state.robots = []; state.projectiles = [];
    state.playtesting = false;
    state.customLayout = null;
    state.editorReturnLayout = null;
    document.getElementById('playtest-return-btn')?.classList.add('hidden');
    document.getElementById('level-display').innerText = getLevelDisplayLabel(levelIndex, lv); document.getElementById('objective-text').innerText = localizeControlHints(lv.obj); 
    
    applyLoadedLevel(getLevelSetup(levelIndex));
    updateHUD(); state.runStats = { tosses: 0, dashes: 0, cloaks: 0, alarms: 0 };
    updateDeliveryProgressUI();
    applyChallengeHud(lv, levelIndex);
    state.pastRuns = []; state.currentRun = []; state.currentTick = 0; state.activeGhosts = []; state.failTimer=0; state.failMessage=""; state.alarmState = false;
    clearLoopFx();
    uiTitleScreen.classList.add('hidden'); uiLevelComplete.classList.add('hidden'); uiGameOver.classList.add('hidden');
    uiAppLayout.classList.remove('hidden'); document.getElementById('loop-count').innerText = state.pastRuns.length; Object.assign(prevKeys, keys);
    document.getElementById('mobile-controls')?.classList.remove('hidden');
    syncTouchUi();
    
    if (lv.story) {
        state.gameState = 'DIALOG';
        showLevelDialog(lv.story.speaker, lv.story.text, '#39ff14', `level-${levelIndex}-story`);
    } else {
        state.gameState = 'PLAYING';
        hideLevelDialog();
        if (state.pendingBossIntro) startBossIntro(lv);
        else maybeStartDemo();
    }
}

export function resetRun() {
    if (state.currentTick > 0) state.pastRuns.push([...state.currentRun]);
    state.currentRun = []; state.currentTick = 0; state.failTimer=0; state.failMessage=""; state.alarmState = false;
    clearLoopFx();
    const loopLevel = state.currentLevelMeta || LEVELS[state.currentLevelIndex];
    if (loopLevel?.maxGhosts && state.pastRuns.length > loopLevel.maxGhosts) state.pastRuns.shift();
    
    applyLoadedLevel(loadCurrentEntities());
    if (state.currentLevelMeta?.isBoss) engageBossEncounter(state.currentLevelMeta);
    state.activeGhosts = state.pastRuns.map((r, i) => new Ghost(i, r));
    document.getElementById('loop-count').innerText = state.pastRuns.length;
    updateDeliveryProgressUI();
    beginRewindJuice();
}

export function restartLevel() {
    if (isDemoActive()) stopDemo({ markSeen: false, invokeDismiss: false });
    hintDemoSnapshot = null;
    activeHintId = null;
    hintAutoOpened.clear();
    hintReopenGateUntil = 0;
    let lv = state.playtesting ? state.currentLevelMeta : LEVELS[state.currentLevelIndex];
    if (!lv) return;
    state.currentLevelMeta = lv;
    state.levelAbilityOverrides = [...(lv.grants || [])];
    applyLoadedLevel(loadCurrentEntities());
    state.pastRuns = []; state.currentRun = []; state.currentTick = 0; state.activeGhosts = [];
    state.failTimer = 0; state.failMessage = ""; state.alarmState = false; state.runStats = { tosses: 0, dashes: 0, cloaks: 0, alarms: 0 };
    clearLoopFx();
    document.getElementById('loop-count').innerText = 0;
    updateDeliveryProgressUI();
    applyChallengeHud(lv, state.currentLevelIndex);
    document.getElementById('objective-text').innerText = localizeControlHints(lv.obj);
    let ov = document.getElementById('dialog-overlay'); if (ov) ov.classList.add('hidden');
    stopDialogSpeech();
    state.pendingBossIntro = lv.bossIntro || null;
    if (lv.isBoss && state.pendingBossIntro) startBossIntro(lv);
    else state.gameState = 'PLAYING';
    updateHUD();
    Object.assign(prevKeys, keys);
}

export function levelFailed(reason) {
    if (state.failTimer > 0) return;
    SFX.fail();
    state.failMessage = reason;
    state.failTimer = FAIL_HOLD_FRAMES;
    spawnFailFx(reason);
    startShake(32, 10);
}
export function returnToMenu() {
    if (isDemoActive()) stopDemo({ markSeen: false });
    stopDialogSpeech();
    state.playtesting = false;
    state.customLayout = null;
    state.editorReturnLayout = null;
    document.getElementById('playtest-return-btn')?.classList.add('hidden');
    document.getElementById('editor-overlay')?.classList.add('hidden');
    state.gameState = 'MENU';
    initMenu();
}

function setPlaytestReturnVisible(on) {
    const btn = document.getElementById('playtest-return-btn');
    if (btn) btn.classList.toggle('hidden', !on);
}

function handleEscape() {
    if (state.playtesting) returnToEditor();
    else returnToMenu();
}

export function startPlaytestFromEditor() {
    const layout = serializeLevel(state);
    state.editorReturnLayout = layout;
    state.customLayout = layout;
    state.playtesting = true;
    document.getElementById('editor-overlay').classList.add('hidden');
    document.querySelector('.top-hud').classList.remove('hidden');
    document.querySelector('.bottom-hud').classList.remove('hidden');
    document.getElementById('mobile-controls')?.classList.remove('hidden');
    setPlaytestReturnVisible(true);

        const em = state.editorLevelMeta || {};
    state.currentLevelMeta = {
        name: em.name || 'Editor Playtest',
        story: em.story || null,
        obj: em.obj || 'Playtest the current editor layout.',
        challenge: { desc: 'Playtest', check: () => false },
        maxGhosts: em.maxGhosts ?? 3,
        grants: Array.isArray(em.grants) && em.grants.length ? [...em.grants] : ['dash', 'toss', 'cloak', 'ghostShield'],
        isPlaytest: true,
        demo: cloneDemo(em.demo)
    };
    state.levelAbilityOverrides = [...state.currentLevelMeta.grants];
    state.pendingBossIntro = null;
    document.getElementById('max-loops').innerText = state.currentLevelMeta.maxGhosts + 1;
    document.getElementById('level-display').innerText = getLevelDisplayLabel(0, state.currentLevelMeta);
    document.getElementById('objective-text').innerText = state.currentLevelMeta.obj;

    applyLoadedLevel(deserializeLevel(layout));
    updateHUD();
    state.runStats = { tosses: 0, dashes: 0, cloaks: 0, alarms: 0 };
    updateDeliveryProgressUI();
    applyChallengeHud(state.currentLevelMeta, state.currentLevelIndex);
    state.pastRuns = []; state.currentRun = []; state.currentTick = 0; state.activeGhosts = [];
    state.failTimer = 0; state.failMessage = ""; state.alarmState = false;
    clearLoopFx();
    uiLevelComplete.classList.add('hidden');
    uiGameOver.classList.add('hidden');
    document.getElementById('loop-count').innerText = '0';
    if (state.currentLevelMeta?.story?.text) {
        showLevelDialog(state.currentLevelMeta.story.speaker || 'Briefing', state.currentLevelMeta.story.text);
        state.gameState = 'DIALOG';
    } else {
        hideLevelDialog();
        state.gameState = 'PLAYING';
        startMusic();
        maybeStartDemo();
    }
    Object.assign(prevKeys, keys);
    syncTouchUi();
}

export function returnToEditor() {
    if (isDemoActive()) stopDemo({ markSeen: false });
    const snapshot = state.editorReturnLayout;
    state.playtesting = false;
    state.customLayout = null;
    uiLevelComplete.classList.add('hidden');
    hideLevelDialog();
    stopDialogSpeech();
    setPlaytestReturnVisible(false);
    const json = snapshot ? JSON.stringify(snapshot) : null;
    state.editorReturnLayout = null;
    window.startEditorMode(json);
}

function update() {
    scheduleMusic();
    if (state.gameState === 'DIALOG') {
        if (isKeyJustPressed('esc')) { handleEscape(); updatePrevKeys(); return; }
        // SPACE is reserved for GRAB; dialog advances on Enter / overlay tap / CONTINUE.
        if (isKeyJustPressed('enter')) {
            startMusic();
            hideLevelDialog();
            if (state.pendingBossIntro) startBossIntro(state.currentLevelMeta);
            else {
                state.gameState = 'PLAYING';
                maybeStartDemo();
            }
            updatePrevKeys();
            consumeDialogConfirmKeys();
            return;
        }
        updatePrevKeys(); return;
    }
    if (state.gameState === 'BOSS_INTRO') {
        if (isKeyJustPressed('esc')) { handleEscape(); updatePrevKeys(); return; }
        if (isKeyJustPressed('enter')) {
            hideLevelDialog();
            beginBossEncounter(state.currentLevelMeta);
            state.gameState = 'PLAYING';
            updatePrevKeys();
            consumeDialogConfirmKeys();
            return;
        }
        updatePrevKeys(); return;
    }
    if (state.gameState === 'EDITOR') {
        tickEditor();
        updatePrevKeys();
        return;
    }
    if (state.gameState !== 'PLAYING') { updatePrevKeys(); return; }

    tickLoopFx();
    
    if (state.failTimer > 0) {
        state.failTimer--;
        for (const p of state.packages) if (p.breakFx) p.update();
        if (state.failTimer === 0) resetRun();
        updatePrevKeys();
        return;
    }

    if (isDemoActive()) {
        if (isKeyJustPressed('esc')) {
            // Popup: Esc closes + restores. Full overlay: Esc skips if allowed.
            if (isPopupDemo()) {
                skipDemo() || stopDemo({ markSeen: false, skipped: true });
            } else if (canSkipDemo()) {
                skipDemo();
            } else {
                updatePrevKeys();
                return;
            }
        }
        const demoResult = tickDemo();
        if (demoResult?.done || !isDemoActive()) {
            if (hintDemoSnapshot) {
                dismissHintDemo();
            } else if (hintDemoJustClosed) {
                hintDemoJustClosed = false;
            } else {
                restartLevel();
            }
            updatePrevKeys();
            return;
        }
    } else if (isKeyJustPressed('esc')) {
        handleEscape();
        updatePrevKeys();
        return;
    }

    if (!isDemoActive() && isKeyJustPressed('q')) { restartLevel(); updatePrevKeys(); return; }
    if (isKeyJustPressed('r')) { resetRun(); updatePrevKeys(); return; }
    if (state.rewindFreeze > 0) {
        state.rewindFreeze--;
        updatePrevKeys();
        return;
    }

    let allActors = [state.player];
    for (let ghost of state.activeGhosts) {
        ghost.update(state.packages, state.statics, state.winds);
        if (ghost.isActive) allActors.push(ghost);
    }

    state.alarmState = false; state.cameras.forEach(c => c.update(state.player));
    state.robots.forEach(r => r.update(state.player, state.activeGhosts, state.walls));
    for (let p of state.projectiles) {
        let fail = p.update(state.walls, state.activeGhosts, state.player, state.packages);
        if (fail) { levelFailed(fail); return; }
    }
    state.projectiles = state.projectiles.filter(p => p.active);

    let unlocked = getUnlockedAbilities();
    let hasDash = unlocked.includes('dash'); let hasToss = unlocked.includes('toss'); let hasCloak = unlocked.includes('cloak');

    let interactJustPressed = isKeyJustPressed('space');
    updateHintPlates(interactJustPressed);
    if (isDemoActive()) { updatePrevKeys(); return; }
    let tossJustPressed = hasToss && isKeyJustPressed('f');
    let dashJustPressed = hasDash && isKeyJustPressed('shift');
    let cloakJustPressed = hasCloak && isKeyJustPressed('c');
    let dashFired = false;

    if (state.player.cloakTimer > 0) state.player.cloakTimer--;
    if (cloakJustPressed && state.player.cloakTimer <= 0) { SFX.cloak(); state.player.cloakTimer = 120; state.runStats.cloaks++; }
    if (dashJustPressed && state.player.dashCooldown <= 0) {
        let dest = getDashDestination(state.player.x, state.player.y, state.player.facingX, state.player.facingY, 120, state.player.w, state.player.h);
        if (dest.x !== state.player.x || dest.y !== state.player.y) { 
            SFX.dash(); 
            state.dashTrails.push({ sx: state.player.x, sy: state.player.y, ex: dest.x, ey: dest.y, life: 1.0 });
            state.player.x = dest.x; 
            state.player.y = dest.y; 
            state.player.dashCooldown = 60; 
            state.runStats.dashes++;
            dashFired = true;
        }
    }
    if (state.player.dashCooldown > 0) state.player.dashCooldown--;
    if (state.player.tossCooldown > 0) state.player.tossCooldown--;
    state.dashTrails.forEach(t => t.life -= 0.1);
    state.dashTrails = state.dashTrails.filter(t => t.life > 0);

    let noiseSources = [];
    if (interactJustPressed || tossJustPressed) noiseSources.push({x: state.player.x, y: state.player.y});
    for(let g of state.activeGhosts) {
        let stateIndex = g.lastStateIndex;
        if (stateIndex >= 0 && stateIndex < g.runData.length && (g.runData[stateIndex].interact || g.runData[stateIndex].toss)) noiseSources.push({x: g.x, y: g.y});
    }

    for(let d of state.drones) {
        if (d.alive === false) continue;
        let fail = d.update(state.player, noiseSources);
        if (fail) { levelFailed(fail); return; }
    }
    if (state.drones.some(d => d.alive === false)) state.drones = state.drones.filter(d => d.alive !== false);

    state.plates.forEach(plate => {
        plate.update(allActors, state.packages);
        for (const id of plate.linkedIds || []) {
            state.doors.filter(d => d.id === id).forEach(d => d.isOpen = plate.isPressed);
            state.lasers.filter(l => l.id === id).forEach(l => l.isOpen = plate.isPressed);
        }
    });

    for(let g of state.guards) { let fail = g.update(state.player, state.activeGhosts); if (fail) { levelFailed(fail); return; } }
    for(let c of state.cracks) { let fail = c.update(allActors); if (fail) { levelFailed(fail); return; } }
    
    let envVx = 0, envVy = 0;
    for(let w of state.winds) if (AABB(state.player.x, state.player.y, state.player.w, state.player.h, w.x, w.y, w.w, w.h)) { envVx += w.vx; envVy += w.vy; }

    let carried = state.packages.find(p => p.carriedBy === 'player');
    let currentSpeed = (carried && carried.type === 'heavy') ? PLAYER_MOVE_SPEED * HEAVY_SPEED_MULT : PLAYER_MOVE_SPEED;

    const move = getMoveVector();
    let mx = move.x;
    let my = move.y;
    const moveMag = Math.hypot(mx, my);
    if (moveMag > 1) { mx /= moveMag; my /= moveMag; }

    let dx = envVx + mx * currentSpeed;
    let dy = envVy + my * currentSpeed;

    if (dx !== envVx || dy !== envVy) {
        state.player.facingX = dx-envVx===0 ? 0 : (dx-envVx>0 ? 1 : -1);
        state.player.facingY = dy-envVy===0 ? 0 : (dy-envVy>0 ? 1 : -1);
    }
    state.player.moving = Math.abs(dx - envVx) + Math.abs(dy - envVy) > 0;
    state.player.carrying = !!carried;

    let nextPlayerX = { x: state.player.x + dx, y: state.player.y, w: state.player.w, h: state.player.h };
    let nextPlayerY = { x: state.player.x, y: state.player.y + dy, w: state.player.w, h: state.player.h };
    let pCanMoveX = !checkWallCollision(nextPlayerX.x, nextPlayerX.y, nextPlayerX.w, nextPlayerX.h);
    let pCanMoveY = !checkWallCollision(nextPlayerY.x, nextPlayerY.y, nextPlayerY.w, nextPlayerY.h);
    if (pCanMoveX) state.player.x += dx;
    if (pCanMoveY) state.player.y += dy;

    state.activeGhosts.forEach(g => {
        if (!g.isActive) return;
        let gDx = g.intendedDx || 0; let gDy = g.intendedDy || 0;
        if (gDx === 0 && gDy === 0) return;
        let nextGhostX = { x: g.x + gDx, y: g.y, w: g.w, h: g.h };
        let nextGhostY = { x: g.x, y: g.y + gDy, w: g.w, h: g.h };
        let gCanMoveX = !checkWallCollision(nextGhostX.x, nextGhostX.y, nextGhostX.w, nextGhostX.h);
        let gCanMoveY = !checkWallCollision(nextGhostY.x, nextGhostY.y, nextGhostY.w, nextGhostY.h);
        state.activeGhosts.forEach(otherG => {
            if (otherG !== g && otherG.isActive) {
                if (AABB(nextGhostX.x, nextGhostX.y, nextGhostX.w, nextGhostX.h, otherG.x, otherG.y, otherG.w, otherG.h) && ghostShieldBlocks(otherG, nextGhostX)) gCanMoveX = false;
                if (AABB(nextGhostY.x, nextGhostY.y, nextGhostY.w, nextGhostY.h, otherG.x, otherG.y, otherG.w, otherG.h) && ghostShieldBlocks(otherG, nextGhostY)) gCanMoveY = false;
            }
        });
        if (gCanMoveX) g.x += gDx;
        if (gCanMoveY) g.y += gDy;
    });

    for(let l of state.lasers) {
        if (!l.isOpen) {
            if (state.player.cloakTimer <= 0 && AABB(state.player.x, state.player.y, state.player.w, state.player.h, l.x, l.y, l.w, l.h)) { levelFailed("Burned by Laser Grid!"); return; }
            for(let p of state.packages) {
                if (!p.isDestroyed && AABB(p.x, p.y, p.w, p.h, l.x, l.y, l.w, l.h)) {
                    if (p.type === 'fragile') { p.breakApart('vapor'); SFX.break(); SFX.laserHit(); levelFailed("Fragile Package Destroyed!"); return; }
                }
            }
        }
    }

    if (interactJustPressed) {
        SFX.interact();
        if (carried) {
            SFX.drop();
            carried.carriedBy = null;
            carried.onDrop();
        } else {
            for (let p of state.packages) {
                if (!p.isDestroyed && (!p.carriedBy || p.carriedBy.startsWith('ghost_')) && AABB(state.player.x, state.player.y, state.player.w, state.player.h, p.x, p.y, p.w, p.h)) {
                    p.carriedBy = 'player';
                    p.onPickup();
                    SFX.pickup();
                    break;
                }
            }
        }
    }

    let tossFired = false;
    if (tossJustPressed && carried && state.player.tossCooldown <= 0) {
        SFX.toss();
        const fx = state.player.facingX || 0;
        const fy = state.player.facingY || 0;
        carried.carriedBy = null;
        carried.onToss(fx, fy);
        noiseSources.push({x: state.player.x, y: state.player.y}); state.runStats.tosses++;
        state.player.tossCooldown = TOSS_COOLDOWN_TICKS;
        tossFired = true;
    }

    for (let p of state.packages) {
        let fail = p.update(); if (fail) { levelFailed(fail); return; }
        if (p.isDestroyed) continue; // breakFx still advances inside update()
        
        let pEnvVx = 0, pEnvVy = 0;
        if (!p.carriedBy && p.tossTicks <= 0) {
            for(let w of state.winds) if (AABB(p.x, p.y, p.w, p.h, w.x, w.y, w.w, w.h)) { pEnvVx += w.vx; pEnvVy += w.vy; }
            p.x += pEnvVx; p.y += pEnvVy;
        }
        
        if (!p.carriedBy && p.tossTicks > 0) {
            for (let r of state.robots) {
                if (r.hp > 0 && AABB(p.x, p.y, p.w, p.h, r.x, r.y, r.w, r.h)) {
                    r.takeHit();
                    if (p.requiredForDelivery !== false) p.reset();
                    else p.breakApart('shatter');
                    if (r.hp <= 0) {
                        let bossDoor = state.doors.find(d => d.id === 'boss_door');
                        if (bossDoor) bossDoor.isOpen = true;
                    }
                    break;
                }
            }
        }

        if (p.carriedBy === 'player') { p.x = state.player.x + (state.player.w - p.w)/2; p.y = state.player.y + (state.player.h - p.h)/2; }
        else if (p.carriedBy && p.carriedBy.startsWith('ghost_')) {
            let ghostId = parseInt(p.carriedBy.split('_')[1]);
            let ghost = state.activeGhosts.find(ag => ag.id === ghostId);
            if (ghost && ghost.isActive) { p.x = ghost.x + (ghost.w - p.w)/2; p.y = ghost.y + (ghost.h - p.h)/2; }
            else { p.carriedBy = null; p.onDrop(); }
        }
    }

    updateDeliveryProgressUI();
    const requiredPackages = getRequiredPackages();
    let allDelivered = requiredPackages.length > 0 && requiredPackages.every(isPackageDelivered);
    
    if (allDelivered && state.gameState === 'PLAYING' && !isDemoActive()) { 
        SFX.win(); state.gameState = 'LEVEL_COMPLETE'; uiLevelComplete.classList.remove('hidden'); 
        let chalMsg = document.getElementById('challenge-result');
        let nextBtn = document.getElementById('next-level-btn');
        let menuBtn = document.getElementById('menu-btn');
        if (state.playtesting || state.currentLevelMeta?.isPlaytest) {
            if (chalMsg) { chalMsg.innerHTML = "Playtest complete."; chalMsg.style.color = '#00f3ff'; }
            nextBtn.innerText = "RETURN TO EDITOR";
            if (menuBtn) menuBtn.innerText = "RETURN TO EDITOR";
        } else if (state.currentLevelMeta?.isSandbox) {
            if (chalMsg) { chalMsg.innerHTML = "Sandbox delivery complete."; chalMsg.style.color = '#00f3ff'; }
            nextBtn.innerText = "RETURN TO MENU";
            if (menuBtn) menuBtn.innerText = "LEVEL SELECT";
        } else if (state.currentLevelMeta?.isTutorial) {
            state.tutorialProgress[state.currentLevelIndex] = true;
            saveState();
            if (chalMsg) { chalMsg.innerHTML = "Tutorial complete. You can replay this module any time from TRAINING."; chalMsg.style.color = '#00f3ff'; }
            let nextIndex = getNextLevelIndex(state.currentLevelIndex);
            nextBtn.innerText = nextIndex !== null ? "NEXT TUTORIAL" : "RETURN TO MENU";
            if (menuBtn) menuBtn.innerText = "LEVEL SELECT";
        } else {
            let isFirstTimeLevel = (state.currentLevelIndex == parseInt(localStorage.getItem('echoCourier_maxLevel') || '0'));
            if (state.currentLevelIndex >= state.maxUnlockedLevel && state.currentLevelIndex < CAMPAIGN_LEVEL_COUNT - 1) {
                state.maxUnlockedLevel = state.currentLevelIndex + 1; localStorage.setItem('echoCourier_maxLevel', state.maxUnlockedLevel);
            }
            let earnedMsg = isFirstTimeLevel ? "Level Clear: +$50<br><br>" : "Level Clear: +$0<br><br>";
            let chalSuccess = !state.challengesCompleted[state.currentLevelIndex] && LEVELS[state.currentLevelIndex].challenge.check();
            if (chalSuccess) {
                state.challengesCompleted[state.currentLevelIndex] = true;
                localStorage.setItem('echoCourier_challenges', JSON.stringify(state.challengesCompleted));
                applyChallengeHud(LEVELS[state.currentLevelIndex], state.currentLevelIndex);
                if (chalMsg) { chalMsg.innerHTML = earnedMsg + "⭐ Challenge Passed! (+$50) ⭐"; chalMsg.style.color = 'gold'; }
            } else {
                let previouslyDone = state.challengesCompleted[state.currentLevelIndex];
                if (chalMsg) { chalMsg.innerHTML = earnedMsg + (previouslyDone ? "⭐ Challenge Already Claimed ⭐" : "Challenge Failed (Try again!)"); chalMsg.style.color = previouslyDone ? 'gold' : '#888'; }
            }
            let nextIndex = getNextLevelIndex(state.currentLevelIndex);
            nextBtn.innerText = nextIndex !== null ? "NEXT LEVEL" : "FINISH SHIFT";
            if (menuBtn) menuBtn.innerText = "LEVEL SELECT";
        }
    }
    
    state.currentRun.push({
        x: state.player.x,
        y: state.player.y,
        moveX: mx,
        moveY: my,
        facingX: state.player.facingX,
        facingY: state.player.facingY,
        cloakTimer: state.player.cloakTimer,
        interact: interactJustPressed,
        toss: tossFired,
        dash: dashFired,
        heavy: !!(carried && carried.type === 'heavy')
    });
    state.currentTick++; updatePrevKeys();
}

function ticksToSeconds(ticks) {
    return (Math.max(0, ticks) / 60).toFixed(1);
}

function drawAbilityCooldowns(target) {
    if (state.gameState !== 'PLAYING' || !state.player) return;
    const unlocked = getUnlockedAbilities();
    const parts = [];
    if (unlocked.includes('dash') && state.player.dashCooldown > 0) {
        parts.push(`DASH ${ticksToSeconds(state.player.dashCooldown)}s`);
    }
    if (unlocked.includes('toss') && state.player.tossCooldown > 0) {
        parts.push(`TOSS ${ticksToSeconds(state.player.tossCooldown)}s`);
    }
    if (unlocked.includes('cloak') && state.player.cloakTimer > 0) {
        parts.push(`CLOAK ${ticksToSeconds(state.player.cloakTimer)}s`);
    }
    if (!parts.length) return;
    const text = parts.join('  |  ');
    target.save();
    target.font = 'bold 16px "Space Grotesk", sans-serif';
    target.textAlign = 'center';
    target.textBaseline = 'middle';
    const width = target.measureText(text).width + 28;
    const x = canvas.width / 2;
    const y = 22;
    target.fillStyle = 'rgba(5, 7, 10, 0.72)';
    target.fillRect(x - width / 2, y - 14, width, 28);
    target.strokeStyle = 'rgba(255, 221, 0, 0.55)';
    target.lineWidth = 1;
    target.strokeRect(x - width / 2, y - 14, width, 28);
    target.fillStyle = '#ffdd00';
    target.fillText(text, x, y);
    target.restore();
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (state.gameState !== 'PLAYING' && state.gameState !== 'LEVEL_COMPLETE' && state.gameState !== 'EDITOR' && state.gameState !== 'BOSS_INTRO' && state.gameState !== 'DIALOG') return;
    if (state.assetsLoaded < state.assetNames.length) { ctx.fillStyle = '#fff'; ctx.fillText("Loading Assets...", 400, 300); return; }

    let shakeX = 0, shakeY = 0;
    if (state.gameState === 'PLAYING' && state.shakeTimer > 0 && state.shakeMax > 0) {
        const mag = state.shakeMag * (state.shakeTimer / state.shakeMax);
        shakeX = (Math.random() * 2 - 1) * mag;
        shakeY = (Math.random() * 2 - 1) * mag;
    }
    syncGameplayCamera();

    ctx.save();
    applyCamera(ctx, shakeX, shakeY);

    const map = getMapSize();
    ctx.fillStyle = '#10151c';
    ctx.fillRect(0, 0, map.w, map.h);
    if (state.gameState === 'EDITOR') {
        ctx.save();
        ctx.strokeStyle = 'rgba(0, 243, 255, 0.08)';
        ctx.lineWidth = 1;
        for (let x = 0; x <= map.w; x += 40) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, map.h); ctx.stroke();
        }
        for (let y = 0; y <= map.h; y += 40) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(map.w, y); ctx.stroke();
        }
        ctx.restore();
    }

    state.statics.forEach(s => s.render(ctx)); state.winds.forEach(w => w.render(ctx)); state.cracks.forEach(c => c.render(ctx));
    state.deliveryZone.render(ctx); state.plates.forEach(p => p.render(ctx)); (state.hints||[]).forEach(h => h.render(ctx)); state.walls.forEach(w => w.render(ctx));
    state.lasers.forEach(l => l.render(ctx)); state.doors.forEach(d => { if (d.render.length > 1) d.render(ctx, state.currentTick); else d.render(ctx); });
    state.packages.forEach(p => p.render(ctx)); state.activeGhosts.forEach(g => g.render(ctx));

    if (state.gameState === 'PLAYING' && state.currentRun.length > 0) {
        const projectedEcho = buildProjectedEchoPath(state.currentRun);
        const recordedTrail = state.currentRun.slice(-RECORDED_TRAIL_FRAMES);
        ctx.save();
        ctx.strokeStyle = '#7df9ff';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.moveTo(recordedTrail[0].x + state.player.w / 2, recordedTrail[0].y + state.player.h / 2);
        for (let i = 1; i < recordedTrail.length; i++) {
            ctx.lineTo(recordedTrail[i].x + state.player.w / 2, recordedTrail[i].y + state.player.h / 2);
        }
        ctx.lineTo(state.player.x + state.player.w / 2, state.player.y + state.player.h / 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        if (projectedEcho && projectedEcho.points.length > 1) {
            ctx.save();
            ctx.strokeStyle = '#ffdd00';
            ctx.lineWidth = 3;
            ctx.globalAlpha = 0.45;
            ctx.beginPath();
            ctx.moveTo(projectedEcho.points[0].x + state.player.w / 2, projectedEcho.points[0].y + state.player.h / 2);
            for (let i = 1; i < projectedEcho.points.length; i++) {
                ctx.lineTo(projectedEcho.points[i].x + state.player.w / 2, projectedEcho.points[i].y + state.player.h / 2);
            }
            ctx.stroke();
            ctx.restore();

            if (state.assets.player) {
                drawSprite(ctx, state.assets.player, projectedEcho.final.x, projectedEcho.final.y, state.player.w, state.player.h, {
                    tint: '#ffdd00', tintAlpha: 0.22, alpha: 0.55, valign: 'bottom', scanlines: true
                });
            } else {
                ctx.fillStyle = '#ffdd00';
                ctx.fillRect(projectedEcho.final.x, projectedEcho.final.y, state.player.w, state.player.h);
            }
        } else {
            if (state.assets.player) {
                drawSprite(ctx, state.assets.player, state.player.x, state.player.y, state.player.w, state.player.h, {
                    tint: '#7df9ff', tintAlpha: 0.2, alpha: 0.4, valign: 'bottom', scanlines: true
                });
            } else {
                ctx.fillStyle = '#7df9ff';
                ctx.fillRect(state.player.x, state.player.y, state.player.w, state.player.h);
            }
        }
    }
    
    state.player.render(ctx);
    
    state.dashTrails.forEach(t => {
        ctx.save(); ctx.globalAlpha = t.life; ctx.strokeStyle = state.playerColor; ctx.lineWidth = state.player.w * 0.8;
        ctx.lineCap = 'round'; ctx.beginPath();
        ctx.moveTo(t.sx + state.player.w/2, t.sy + state.player.h/2); ctx.lineTo(t.ex + state.player.w/2, t.ey + state.player.h/2);
        ctx.stroke(); ctx.restore();
    });
    
    state.guards.forEach(g => g.render(ctx)); state.robots.forEach(r => r.render(ctx)); state.projectiles.forEach(p => p.render(ctx));
    state.cameras.forEach(c => c.render(ctx)); state.drones.forEach(d => { if (d.alive !== false) d.render(ctx); });
    if (state.failFx) drawBurst(ctx, state.failFx);
    if (state.rewindFx) drawBurst(ctx, state.rewindFx);
    if (state.gameState === 'EDITOR') drawEditorOverlay(ctx);

    ctx.restore();
    
    if (state.gameState === 'EDITOR') return;

    drawAbilityCooldowns(ctx);

    if (state.alarmState && state.currentTick % 60 === 0) SFX.alarm();
    if (state.alarmState) { ctx.fillStyle = 'rgba(255, 0, 0, 0.15)'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    if (state.rewindFx && state.rewindFx.ttl > 0) {
        const u = state.rewindFx.ttl / state.rewindFx.max;
        ctx.fillStyle = `rgba(0, 243, 255, ${0.2 * u})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    if (state.failTimer > 0) {
        const impact = state.failTimer > FAIL_HOLD_FRAMES - 8;
        const showText = state.failTimer <= FAIL_HOLD_FRAMES - FAIL_TEXT_DELAY;
        if (impact) {
            const flash = (state.failTimer - (FAIL_HOLD_FRAMES - 8)) / 8;
            ctx.fillStyle = `rgba(255, 220, 220, ${0.28 * flash})`;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        ctx.fillStyle = showText ? 'rgba(255, 0, 0, 0.4)' : 'rgba(255, 40, 40, 0.16)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        if (showText) {
            ctx.fillStyle = '#fff'; ctx.font = 'bold 36px "Space Grotesk"'; ctx.textAlign = 'center'; ctx.fillText("LOOP FAILED", 400, 250);
            ctx.font = '20px "Space Grotesk"'; ctx.fillText(state.failMessage, 400, 300);
            ctx.textAlign = 'left';
        }
    }
}

let lastTime = 0;
let accumulator = 0;
const tickRate = 1000 / 60;

function loop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    let dt = timestamp - lastTime;
    lastTime = timestamp;
    accumulator += dt;

    if (accumulator > 200) accumulator = 200;

    let updated = false;
    while (accumulator >= tickRate) {
        update();
        accumulator -= tickRate;
        updated = true;
    }
    if (updated) draw();
    
    requestAnimationFrame(loop); 
}

window.onload = () => {
    initTouchControls();
    initDemoPlayback();
    syncTouchUi();
    preloadDialogVoice().catch(() => {});
    document.body.addEventListener('pointerdown', () => { unlockAudio(); }, { passive: true });
    document.body.addEventListener('keydown', () => { unlockAudio(); });
    window.startNextAvailableLevel = () => {
        let devModeCheckbox = document.getElementById('dev-mode-checkbox');
        if (!devModeCheckbox.checked && !hasCompletedTutorialTrack()) {
            showTutorialPrompt();
            return;
        }
        let lvl = devModeCheckbox.checked ? 0 : Math.min(state.maxUnlockedLevel, CAMPAIGN_LEVEL_COUNT - 1);
        startGame(lvl);
    };
    window.startTutorialTrack = () => startGame(TUTORIAL_LEVEL_START);
    window.startTutorialTrackFromPrompt = () => {
        hideTutorialPrompt();
        startGame(TUTORIAL_LEVEL_START);
    };
    window.skipTutorialPrompt = () => {
        hideTutorialPrompt();
        let lvl = Math.min(state.maxUnlockedLevel, CAMPAIGN_LEVEL_COUNT - 1);
        startGame(lvl);
    };
    
    window.startEditorMode = (jsonString, levelIndex = null) => {
        state.gameState = 'EDITOR';
        state.playtesting = false;
        document.getElementById('title-screen').classList.add('hidden');
        document.getElementById('app-layout').classList.remove('hidden');
        document.getElementById('editor-overlay').classList.remove('hidden');
        document.getElementById('level-complete').classList.add('hidden');
        document.querySelector('.top-hud').classList.add('hidden');
        document.querySelector('.bottom-hud').classList.add('hidden');
        document.getElementById('mobile-controls')?.classList.add('hidden');
        document.getElementById('playtest-return-btn')?.classList.add('hidden');
        state.resetRunData();

        let setupData = null;
        if (jsonString) {
            const parsed = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;
            setupData = deserializeLevel(parsed);
        } else if (levelIndex !== null) {
            setupData = getLevelSetup(levelIndex);
            setEditorLevelMetaFromLevel(LEVELS[levelIndex]);
        } else {
            setupData = deserializeLevel({});
            if (!state.editorLevelMeta) {
                state.editorLevelMeta = {
                    name: 'Editor Level',
                    story: { speaker: '', text: '' },
                    obj: '',
                    grants: [],
                    maxGhosts: 3
                };
            }
        }
        applyLoadedLevel(setupData);
        try { window.refreshEditorLevelConfigForm?.(); } catch (_) {}
        if (!state.player) state.player = new PlayerEntity(50, 50, 30, 30, 'player');
        if (!state.walls || state.walls.length === 0) {
            const map = getMapSize();
            state.walls = createBoundWalls(map.w, map.h);
        }
        setCamera(0, 0);
        syncEditorUi();
    };

    window.showSubMenu = showSubMenu;
    window.startGame = startGame;
    window.restartLevel = restartLevel;
    window.initMenu = initMenu;
    window.returnToMenu = returnToMenu;
    window.startPlaytestFromEditor = startPlaytestFromEditor;
    window.returnToEditor = returnToEditor;
    window.nextLevel = () => {
        if (state.playtesting || state.currentLevelMeta?.isPlaytest) { returnToEditor(); return; }
        let nextIndex = getNextLevelIndex(state.currentLevelIndex);
        if (nextIndex !== null) startGame(nextIndex);
        else if (state.currentLevelMeta?.isTutorial || state.currentLevelMeta?.isSandbox) initMenu();
        else showGameComplete();
    };
    
    document.getElementById('open-editor-btn').onclick = () => window.startEditorMode();
    document.getElementById('open-sandbox-btn')?.addEventListener('click', () => {
        const { SANDBOX_LEVEL_INDEX } = window;
        startGame(typeof SANDBOX_LEVEL_INDEX === 'number' ? SANDBOX_LEVEL_INDEX : LEVELS.findIndex(l => l.isSandbox));
    });
    document.getElementById('playtest-return-btn')?.addEventListener('click', () => returnToEditor());
    document.getElementById('dev-mode-checkbox').onchange = () => initMenu();
    
    document.getElementById('next-level-btn').onclick = () => window.nextLevel();
    document.getElementById('menu-btn')?.addEventListener('click', (e) => {
        if (state.playtesting || state.currentLevelMeta?.isPlaytest) {
            e.preventDefault();
            e.stopPropagation();
            returnToEditor();
        }
    });
    document.getElementById('reset-save-btn').onclick = () => { localStorage.clear(); location.reload(); };
    
    document.body.addEventListener('click', () => {
        unlockAudio();
        if (state.gameState === 'MENU' || state.gameState === 'GAME_COMPLETE') playMenuMusic();
    });
    

    
    initMenu(); 
    requestAnimationFrame(loop);
};
