import { state, getUnlockedAbilities, getPlayerRank, isDevMode, applyDevModeUi, isDevUrlEnabled, setDevToolsEnabled, applyLevelAbilityOverrides, wipeProgress, setUnlockAll, recordLevelClear, markTutorialProgress, reloadProgressFromStorage, isLevelUnlocked } from './core/state.js';
import { keys, prevKeys, isKeyJustPressed, updatePrevKeys, initTouchControls, syncTouchUi, getMoveVector, consumeKey } from './core/input.js';
import { audioCtx, startMusic, scheduleMusic, SFX, playMenuMusic, speakDialog, stopDialogSpeech, unlockAudio, preloadDialogVoice } from './core/audio.js';
import { pickLoopRingCenter, loopRingKeyRects, LOOP_RING_R } from './ui/loopRing.js';
import { worldLabelsFor, drawWorldLabels } from './ui/worldLabels.js';
import { AABB, checkWallCollision, checkCourierCollision, getDashDestination, PLAYER_MOVE_SPEED, HEAVY_SPEED_MULT } from './core/physics.js';
import { applyCamera, followWorldPoint, setMapSize, getMapSize, setCamera, DEFAULT_MAP_WIDTH, DEFAULT_MAP_HEIGHT, VIEW_WIDTH, VIEW_HEIGHT } from './core/camera.js';
import { getLevelSetup, LEVELS, deserializeLevel, serializeLevel, createBoundWalls, CAMPAIGN_LEVEL_COUNT, SANDBOX_LEVEL_INDEX, cloneDemo, getWorldUnlockedAbilities, getWorldUnlockedAbilitiesForWorld, normalizeWorldId, normalizeLoopTime, normalizePar, copyBossMeta, getChallengeByRef, normalizePitKillFraction, nextCampaignLevelIndex, firstSelectableLevel } from './data/levels.js';
import { Ghost, PlayerEntity } from './entities/actors.js';
import { tickEchoFellFx, renderEchoFellFx } from './entities/hazards.js';
import { findEchoesEndingOnCracks } from './validation/echoValidation.js';
import { initMenu, showSubMenu, updateHUD, refreshLevelSelectGrid, refreshShopButtons } from './ui/menu.js';
import { initEditor, drawEditorOverlay, tickEditor, syncEditorUi, setEditorLevelMetaFromLevel } from './ui/editor.js';
import { isDemoActive, isPopupDemo, canSkipDemo, startDemo, stopDemo, tickDemo, skipDemo, hasSeenDemo, demoStorageKey, initDemoPlayback, getActiveDemoSteps, setPopupDemoWorld, clearPopupDemoWorld, getPopupDemoWorld } from './systems/demoPlayback.js';
import { drawSprite } from './core/sprites.js';
import { beginRecording, recordFrame, markLoopBoundary, getRecording } from './systems/inputRecorder.js';
import { pickCourierFrame } from './core/atlas.js';
import { collectWires, drawWires } from './systems/wires.js';
import { glyphsForGhost } from './systems/temporalPlate.js';
import { sampleRun, predictEchoHazards } from './systems/preview.js';
import { collectShieldSlabs, laserThreatens, shieldSlab, shieldShadowRects, laserEmitterRect, plateBeamEdges } from './systems/laserShield.js';
import { TemporalPlate, drawTemporalGlyph } from './entities/interactables.js';
import { burrowerHud, crackEdgeWarning } from './core/bossHud.js';
import { installLayoutFit } from './ui/fitLayout.js';
import { displayedLoopNumber, finishLoopLine, plannedLoopBudget, loopHudState, formatCampaignClearMessage } from './core/loopDisplay.js';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
initEditor(canvas, ctx);

const RECORDED_TRAIL_SECONDS = 2.5;
const PROJECTED_TRAIL_SECONDS = 3;
const RECORDED_TRAIL_FRAMES = Math.floor(RECORDED_TRAIL_SECONDS * 60);
const PROJECTED_TRAIL_FRAMES = Math.floor(PROJECTED_TRAIL_SECONDS * 60);
const FAIL_HOLD_FRAMES = 120;
// Caption on the first red frame. The loop clock freezes on death, so a late
// caption looked like an unlabeled full-screen flash at whatever second you died.
const FAIL_TEXT_DELAY = 0;
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
    state.ghostFellFx = [];
    state.shakeTimer = 0;
    state.shakeMax = 0;
    state.shakeMag = 0;
    state.rewindFreeze = 0;
}

function tickLoopFx() {
    if (state.shakeTimer > 0) state.shakeTimer--;
    if (state.failFx) state.failFx = tickBurst(state.failFx);
    if (state.rewindFx) state.rewindFx = tickBurst(state.rewindFx);
    tickEchoFellFx();
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
    return nextCampaignLevelIndex(levelIndex);
}

function buildProjectedEchoPath(runData) {
    if (!runData || runData.length === 0 || !state.player) return null;

    const points = [];
    for (let i = 0; i < runData.length; i++) {
        const step = runData[i];
        if (!step) continue;
        points.push({ x: step.x, y: step.y, facingX: step.facingX || 0, facingY: step.facingY || 0 });
    }
    if (points.length === 0) return null;

    const visiblePoints = points.slice(-PROJECTED_TRAIL_FRAMES);
    const last = visiblePoints[visiblePoints.length - 1];

    return {
        points: visiblePoints,
        final: last
    };
}

function drawFacingChevron(target, x, y, w, h, facingX, facingY) {
    const fx = facingX || 0;
    const fy = facingY || 0;
    if (fx === 0 && fy === 0 || !target) return;
    const len = Math.hypot(fx, fy) || 1;
    const ux = fx / len;
    const uy = fy / len;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const tipX = cx + ux * (Math.max(w, h) * 0.72);
    const tipY = cy + uy * (Math.max(w, h) * 0.72);
    const bx = cx + ux * (Math.max(w, h) * 0.28);
    const by = cy + uy * (Math.max(w, h) * 0.28);
    const px = -uy * 6;
    const py = ux * 6;
    target.save();
    target.fillStyle = '#ffdd00';
    target.strokeStyle = '#041018';
    target.lineWidth = 2;
    target.beginPath();
    target.moveTo(tipX, tipY);
    target.lineTo(bx + px, by + py);
    target.lineTo(bx - px, by - py);
    target.closePath();
    target.fill();
    target.stroke();
    target.restore();
}

function hasCompletedTutorialTrack() {
    return true;
}

function getRequiredPackages() {
    return state.packages.filter(p => p.requiredForDelivery !== false);
}

function isPackageDelivered(pkg) {
    return !pkg.isDestroyed && !pkg.carriedBy && AABB(state.deliveryZone.x, state.deliveryZone.y, state.deliveryZone.w, state.deliveryZone.h, pkg.x, pkg.y, pkg.w, pkg.h);
}

// F7: standing on a plate while the body already hangs over a crack.
function drawCrackEdgeWarning(ctx) {
    const p = state.player;
    const hits = crackEdgeWarning(p, state.plates, state.cracks);
    if (!hits.length) return;
    ctx.save();
    ctx.strokeStyle = '#ff9a2e';
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 3]);
    for (const c of hits) ctx.strokeRect(c.x + 1, c.y + 1, c.w - 2, c.h - 2);
    ctx.setLineDash([]);
    ctx.font = 'bold 11px "Space Grotesk", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(p.x + p.w / 2 - 44, p.y - 22, 88, 15);
    ctx.fillStyle = '#ffb060';
    ctx.fillText('⚠ crack edge', p.x + p.w / 2, p.y - 11);
    ctx.restore();
}

// Parcel pickup feedback: a ring around the courier and a "PARCEL PICKED UP" tag.
export const PICKUP_FLASH_TICKS = 45;
export function notePickupFeedback(pkg) {
    state.pickupFlash = { ticks: PICKUP_FLASH_TICKS, fragile: pkg && pkg.packageType === 'fragile' };
}
function drawPickupFeedback(ctx) {
    const f = state.pickupFlash;
    if (!f || f.ticks <= 0) return;
    const p = state.player;
    const t = 1 - f.ticks / PICKUP_FLASH_TICKS;
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - t);
    ctx.strokeStyle = '#7dffb0';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, 18 + t * 22, 0, Math.PI * 2);
    ctx.stroke();
    const text = f.fragile ? 'PARCEL PICKED UP · fragile' : 'PARCEL PICKED UP';
    ctx.font = 'bold 12px "Space Grotesk", sans-serif';
    ctx.textAlign = 'center';
    const w = ctx.measureText ? Math.max(120, ctx.measureText(text).width + 12) : 150;
    const y = p.y - 30 - t * 10;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(cx - w / 2, y - 11, w, 16);
    ctx.fillStyle = '#9dffc4';
    ctx.fillText(text, cx, y + 1);
    ctx.restore();
}

let bossHudKey = '';
function syncBossHud() {
    const el = document.getElementById('boss-progress');
    const boss = (state.burrowers || [])[0];
    const required = state.deliveryZone ? getRequiredPackages() : [];
    const delivered = required.length > 0 && required.every(isPackageDelivered);
    const hud = burrowerHud(boss, { delivered });
    const key = hud ? `${hud.progress}|${hud.goal}` : '';
    if (key === bossHudKey) return;
    bossHudKey = key;
    if (el) {
        el.innerText = hud ? hud.progress : '';
        el.classList.toggle('hidden', !hud);
    }
    const obj = document.getElementById('objective-text');
    if (obj && hud) obj.innerText = hud.goal || localizeControlHints(state.currentLevelMeta?.obj || '');
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
    document.getElementById('sub-tutorials')?.classList.add('hidden');
    document.getElementById('sub-shop').classList.add('hidden');
    document.getElementById('sub-settings').classList.add('hidden');
    document.getElementById('tutorial-prompt')?.classList.remove('hidden');
}

function hideTutorialPrompt() {
    document.getElementById('tutorial-prompt')?.classList.add('hidden');
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

// Story and boss intro share one panel so a single Enter (or tap) starts play.
function introBeats(level, levelIndex) {
    const beats = [];
    if (level?.story?.text) {
        beats.push({
            speaker: level.story.speaker || 'Briefing',
            text: level.story.text,
            color: '#39ff14',
            clipKey: level.voiceKey || (levelIndex != null ? `level-${levelIndex}-story` : null)
        });
    }
    if (level?.bossIntro?.text) {
        beats.push({
            speaker: level.bossIntro.speaker || 'Boss',
            text: level.bossIntro.text,
            color: '#ff5555',
            clipKey: level.bossVoiceKey || (levelIndex != null ? `level-${levelIndex}-boss-intro` : null)
        });
    }
    return beats;
}

function showIntroDialog(level, levelIndex) {
    const beats = introBeats(level, levelIndex);
    if (!beats.length) return false;
    const speaker = beats.length === 1 ? beats[0].speaker : beats.map(b => b.speaker).join(' · ');
    const text = beats.length === 1 ? beats[0].text : beats.map(b => `${b.speaker}: ${b.text}`).join('\n\n');
    showLevelDialog(speaker, text, beats[0].color, beats[0].clipKey);
    state.pendingBossIntro = null;
    state.gameState = 'DIALOG';
    return true;
}

function confirmLevelIntro() {
    const lv = state.currentLevelMeta;
    hideLevelDialog();
    state.pendingBossIntro = null;
    if (lv?.isBoss) beginBossEncounter(lv);
    state.gameState = 'PLAYING';
    maybeStartDemo();
}

function hideLevelDialog() {
    let ov = document.getElementById('dialog-overlay'); if (ov) ov.classList.add('hidden');
    let ds = document.getElementById('dialog-speaker'); if (ds) ds.innerText = '';
    let dt = document.getElementById('dialog-text'); if (dt) dt.innerText = '';
    stopDialogSpeech();
}

// maxGhosts is the echo budget, not a loop cap. Extra rewinds drop the oldest echo
// (resetRun) while the loop index keeps climbing, so the HUD must not read as "Loop N / Max".
function echoBudgetLabel(maxGhosts) {
    const n = Number(maxGhosts);
    if (!Number.isFinite(n) || n < 0) return '∞';
    return String(Math.floor(n));
}

function syncLoopCountUI() {
    const maxGhosts = state.currentLevelMeta?.maxGhosts;
    const hud = loopHudState(state.loopNumber, maxGhosts);
    const el = document.getElementById('loop-count');
    if (el) el.innerText = String(hud.n);
    const usedEl = document.getElementById('echo-count');
    if (usedEl) usedEl.innerText = String((state.pastRuns || []).length);
    const maxEl = document.getElementById('max-echoes');
    if (maxEl) maxEl.innerText = echoBudgetLabel(maxGhosts);
    const budgetEl = document.getElementById('loop-budget');
    if (budgetEl) budgetEl.innerText = hud.budget == null ? '' : String(hud.budget);
    const ofEl = document.getElementById('loop-of');
    if (ofEl) ofEl.classList.toggle('hidden', hud.budget == null || hud.over);
    const overEl = document.getElementById('loop-over');
    if (overEl) overEl.classList.toggle('hidden', !hud.over);
    const parEl = document.getElementById('loop-par');
    if (parEl) parEl.innerText = hud.over ? String(hud.budget) : '';
}

function applyLevelHint(level) {
    const el = document.getElementById('level-hint');
    if (!el) return;
    const text = (level?.hintLine || '').trim();
    el.innerText = text;
    el.classList.toggle('hidden', !text);
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
    if (!Array.isArray(state.burrowers)) state.burrowers = [];
    if (!Array.isArray(state.gatekeepers)) state.gatekeepers = [];
    if (!Array.isArray(state.prisms)) state.prisms = [];
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
    const bossKey = level.bossVoiceKey || `level-${state.currentLevelIndex}-boss-intro`;
    showLevelDialog(level.bossIntro.speaker, level.bossIntro.text, '#ff5555', bossKey);
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



let hintDemoSnapshot = null; // unused for popup isolation (kept null)
let hintFrozenCanvas = null; // unused — live canvas stays live
let hintAnchor = null;
let miniCanvas = null;
let miniCtx = null;
let hintReopenGateUntil = 0;
let hintWasStanding = new Set();
let hintPinnedScreen = null;
let activeHintId = null;
let hintDemoJustClosed = false;
let hintDismissing = false;

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

function standingHintIds() {
    const ids = new Set();
    for (const hint of state.hints || []) {
        if (playerOverlapsHint(hint)) ids.add(hint.id);
    }
    return ids;
}

function clearHintPopupChrome() {
    hintFrozenCanvas = null;
    hintAnchor = null;
    hintPinnedScreen = null;
    const panel = document.getElementById('demo-popup-panel');
    if (panel) {
        panel.style.left = '';
        panel.style.top = '';
        panel.style.width = '';
        panel.style.minWidth = '';
        panel.style.maxWidth = '';
        panel.style.transform = '';
        panel.style.transformOrigin = '';
        panel.classList.remove('tail-above', 'tail-below');
    }
    const mini = document.getElementById('demo-mini-canvas');
    if (mini) mini.classList.add('hidden');
}

function dismissHintDemo() {
    if (hintDismissing) return;
    hintDismissing = true;
    try {
        if (isDemoActive()) stopDemo({ markSeen: false, skipped: true, invokeDismiss: false });
        clearPopupDemoWorld();
        clearHintPopupChrome();
        activeHintId = null;
        hintDemoSnapshot = null;
        hintReopenGateUntil = (state.currentTick || 0) + 45;
        hintDemoJustClosed = true;
        hintWasStanding = standingHintIds();
        // Live world was never mutated for popup demos — nothing to restore.
        if (state.gameState !== 'PLAYING' && state.gameState !== 'LEVEL_COMPLETE' && state.gameState !== 'EDITOR' && state.gameState !== 'BOSS_INTRO' && state.gameState !== 'DIALOG') {
            /* leave other states alone */
        }
    } finally {
        hintDismissing = false;
    }
}

function buildPopupDemoWorld() {
    let bag = null;
    if (state.playtesting && state.customLayout) {
        bag = deserializeLevel({ ...state.customLayout });
    } else {
        bag = loadCurrentEntities();
    }
    if (!bag?.player) return null;
    return {
        player: bag.player,
        doors: bag.doors || [],
        plates: bag.plates || [],
        packages: bag.packages || [],
        activeGhosts: [],
        walls: bag.walls || [],
        deliveryZone: bag.deliveryZone || null,
        hints: bag.hints || [],
        statics: bag.statics || [],
        winds: bag.winds || [],
        cracks: bag.cracks || [],
        guards: bag.guards || [],
        cameras: bag.cameras || [],
        drones: bag.drones || [],
        robots: bag.robots || [],
        gatekeepers: bag.gatekeepers || [],
        lasers: bag.lasers || [],
        projectiles: [],
        currentTick: 0
    };
}

function computeDemoBBox(demo, hint) {
    const pts = [];
    const steps = demo?.steps || [];
    for (const step of steps) {
        if (step && step.type === 'move-to' && Number.isFinite(step.x) && Number.isFinite(step.y)) {
            pts.push(step.x, step.y);
        }
    }
    if (hint) pts.push(hint.x + (hint.w || 0) / 2, hint.y + (hint.h || 0) / 2);
    const demoPlayer = getPopupDemoWorld()?.player;
    if (pts.length < 2 && demoPlayer) pts.push(demoPlayer.x + demoPlayer.w / 2, demoPlayer.y + demoPlayer.h / 2);
    if (pts.length < 2) return { x: 0, y: 0, w: 480, h: 320 };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < pts.length; i += 2) {
        minX = Math.min(minX, pts[i]);
        maxX = Math.max(maxX, pts[i]);
        minY = Math.min(minY, pts[i + 1]);
        maxY = Math.max(maxY, pts[i + 1]);
    }
    const pad = 70;
    minX -= pad; minY -= pad; maxX += pad; maxY += pad;
    return { x: minX, y: minY, w: Math.max(160, maxX - minX), h: Math.max(120, maxY - minY) };
}

function ensureMiniCanvas() {
    if (!miniCanvas) miniCanvas = document.getElementById('demo-mini-canvas');
    if (miniCanvas && !miniCtx) miniCtx = miniCanvas.getContext('2d');
    return miniCtx;
}

function drawMiniDemo() {
    const world = getPopupDemoWorld();
    const mctx = ensureMiniCanvas();
    if (!mctx || !miniCanvas || !world) return;
    const box = computeDemoBBox({ steps: getActiveDemoSteps() }, hintAnchor);
    const mw = miniCanvas.width;
    const mh = miniCanvas.height;
    mctx.setTransform(1, 0, 0, 1, 0, 0);
    mctx.clearRect(0, 0, mw, mh);
    mctx.fillStyle = '#10151c';
    mctx.fillRect(0, 0, mw, mh);
    const scale = Math.min(mw / box.w, mh / box.h);
    const ox = (mw - box.w * scale) / 2 - box.x * scale;
    const oy = (mh - box.h * scale) / 2 - box.y * scale;
    mctx.setTransform(scale, 0, 0, scale, ox, oy);
    const paint = (ent) => { if (ent && typeof ent.render === 'function') ent.render(mctx); };
    const tick = world.currentTick || 0;
    (world.statics || []).forEach(paint);
    (world.winds || []).forEach(paint);
    (world.cracks || []).forEach(paint);
    paint(world.deliveryZone);
    (world.hints || []).forEach(paint);
    (world.walls || []).forEach(paint);
    (world.lasers || []).forEach(paint);
    (world.plates || []).forEach(paint);
    (world.doors || []).forEach(d => {
        if (d && typeof d.render === 'function' && d.render.length > 1) d.render(mctx, tick);
        else paint(d);
    });
    (world.packages || []).forEach(paint);
    (world.activeGhosts || []).forEach(paint);
    paint(world.player);
    (world.guards || []).forEach(paint);
    (world.robots || []).forEach(paint);
    (world.gatekeepers || []).forEach(paint);
    (world.cameras || []).forEach(paint);
    (world.drones || []).forEach(d => { if (d && d.alive !== false) paint(d); });
    mctx.setTransform(1, 0, 0, 1, 0, 0);
}

function applyHintPinnedScreen(panel) {
    panel = panel || document.getElementById('demo-popup-panel');
    if (!panel || !hintPinnedScreen) return;
    panel.style.left = `${hintPinnedScreen.left}px`;
    panel.style.top = `${hintPinnedScreen.top}px`;
    if (hintPinnedScreen.width) {
        panel.style.minWidth = '0px';
        panel.style.maxWidth = 'none';
        panel.style.width = `${hintPinnedScreen.width}px`;
    }
    const scale = hintPinnedScreen.scale;
    panel.style.transformOrigin = 'top left';
    panel.style.transform = (scale && scale !== 1) ? `scale(${scale})` : 'none';
    panel.classList.toggle('tail-below', !!hintPinnedScreen.placeAbove);
    panel.classList.toggle('tail-above', !hintPinnedScreen.placeAbove);
}

// L1 corridor walls sit at world y=180 and y=340. The hint bubble is pinned in
// the empty band above y=180 (top of the canvas), scaled so the tail stays clear.
const HINT_CORRIDOR_TOP = 180;
const HINT_WORLD_GAP = 4;
const HINT_TAIL_PX = 10;
const HINT_BUBBLE_W = 236;
let hintFontPinned = false;

function scheduleHintFontPin() {
    if (hintFontPinned || !document.fonts?.ready) return;
    hintFontPinned = true;
    document.fonts.ready.then(() => {
        if (hintAnchor && isPopupDemo()) positionHintPopup();
    });
}

function canvasContentScreenRect() {
    const rect = canvas.getBoundingClientRect();
    const ox = canvas.offsetWidth || rect.width || 1;
    const oy = canvas.offsetHeight || rect.height || 1;
    const sx = rect.width / ox;
    const sy = rect.height / oy;
    const clientW = canvas.clientWidth || ox;
    const clientH = canvas.clientHeight || oy;
    return {
        left: rect.left + (canvas.clientLeft || 0) * sx,
        top: rect.top + (canvas.clientTop || 0) * sy,
        width: clientW * sx,
        height: clientH * sy,
        cssW: clientW,
        cssH: clientH
    };
}

function worldPointToScreen(wx, wy, content) {
    const camX = hintAnchor?.camX || 0;
    const camY = hintAnchor?.camY || 0;
    return {
        x: content.left + ((wx - camX) / VIEW_WIDTH) * content.width,
        y: content.top + ((wy - camY) / VIEW_HEIGHT) * content.height
    };
}

function positionHintPopup() {
    const panel = document.getElementById('demo-popup-panel');
    const overlay = document.getElementById('demo-overlay');
    if (!panel || !overlay || !hintAnchor) return;

    panel.style.transform = 'none';
    panel.style.transformOrigin = 'top left';
    panel.style.minWidth = '0px';
    panel.style.maxWidth = 'none';
    panel.style.width = `${HINT_BUBBLE_W}px`;
    panel.style.height = 'auto';
    panel.style.maxHeight = 'none';
    const layoutW = panel.offsetWidth || HINT_BUBBLE_W;
    const layoutH = panel.offsetHeight || 1;

    const content = canvasContentScreenRect();
    const overlayRect = overlay.getBoundingClientRect();
    const ow = overlay.offsetWidth || overlayRect.width || 1;
    const oh = overlay.offsetHeight || overlayRect.height || 1;
    const localScaleX = overlayRect.width / ow;
    const localScaleY = overlayRect.height / oh;
    const worldPerCssX = VIEW_WIDTH / (content.cssW || 1);
    const worldPerCssY = VIEW_HEIGHT / (content.cssH || 1);

    const camX = hintAnchor.camX || 0;
    const camY = hintAnchor.camY || 0;
    const topWorld = camY + HINT_WORLD_GAP;
    const roomWorld = Math.max(0, HINT_CORRIDOR_TOP - HINT_WORLD_GAP - topWorld);
    // +1 CSS px absorbs subpixel rounding so the scaled tail stays above y=180.
    const layoutWorldH = (layoutH + HINT_TAIL_PX + 1) * worldPerCssY;
    const layoutWorldW = layoutW * worldPerCssX;
    let scale = 1;
    if (layoutWorldH > roomWorld && layoutWorldH > 0) scale = roomWorld / layoutWorldH;
    const maxWorldW = Math.max(1, VIEW_WIDTH - HINT_WORLD_GAP * 2);
    if (layoutWorldW * scale > maxWorldW) scale = Math.min(scale, maxWorldW / layoutWorldW);
    if (!(scale > 0)) scale = 1;
    scale = Math.min(1, scale);

    const worldW = layoutWorldW * scale;
    const worldX = camX + (VIEW_WIDTH - worldW) / 2;
    const screenTopLeft = worldPointToScreen(worldX, topWorld, content);
    const left = (screenTopLeft.x - overlayRect.left) / (localScaleX || 1);
    const top = (screenTopLeft.y - overlayRect.top) / (localScaleY || 1);

    hintPinnedScreen = { left, top, placeAbove: true, scale, width: HINT_BUBBLE_W };
    applyHintPinnedScreen(panel);
    scheduleHintFontPin();
}

try { installLayoutFit(); } catch (_) { /* headless test DOM */ }

window.addEventListener('resize', () => {
    if (!hintAnchor || !isPopupDemo()) return;
    positionHintPopup();
});

function openHintDemo(hint) {
    if (!hint) return false;
    if (isDemoActive()) {
        stopDemo({ markSeen: false, skipped: true, invokeDismiss: false });
        clearPopupDemoWorld();
        clearHintPopupChrome();
        activeHintId = null;
    }
    const demo = resolveHintDemo(hint);
    if (!demo?.steps?.length) return false;
    const world = buildPopupDemoWorld();
    if (!world) return false;
    activeHintId = hint.id;
    hintDemoSnapshot = null; // no live-state snapshot/restore for popup
    hintFrozenCanvas = null;
    hintAnchor = {
        x: hint.x, y: hint.y, w: hint.w || 40, h: hint.h || 40,
        camX: state.camX || 0,
        camY: state.camY || 0
    };
    setPopupDemoWorld(world);
    const title = hint.title || 'Hint Demo';
    const ok = startDemo(demo, {
        mode: 'popup',
        title,
        persistKey: null,
        onDismiss: () => dismissHintDemo()
    });
    if (!ok) {
        clearPopupDemoWorld();
        clearHintPopupChrome();
        activeHintId = null;
        return false;
    }
    const mini = document.getElementById('demo-mini-canvas');
    if (mini) mini.classList.remove('hidden');
    positionHintPopup();
    drawMiniDemo();
    return true;
}

function playerOverlapsHint(hint) {
    if (!state.player || !hint) return false;
    return AABB(state.player.x, state.player.y, state.player.w, state.player.h, hint.x, hint.y, hint.w, hint.h);
}

function updateHintPlates(interactPressed) {
    if (state.gameState !== 'PLAYING') return;
    const hints = state.hints || [];
    const nowStanding = new Set();
    let firstStanding = null;
    let activeHint = null;
    for (const hint of hints) {
        if (!playerOverlapsHint(hint)) continue;
        nowStanding.add(hint.id);
        if (!firstStanding) firstStanding = hint;
        if (hint.id === activeHintId) activeHint = hint;
    }

    // Leave-plate dismiss while popup is open (player keeps full live control).
    if (isPopupDemo() && activeHintId) {
        if (!nowStanding.has(activeHintId)) {
            dismissHintDemo();
        } else {
            applyHintPinnedScreen();
        }
        hintWasStanding = nowStanding;
        return;
    }

    // Overlay demos still block hint opens.
    if (isDemoActive()) return;

    const tick = state.currentTick || 0;
    const gated = tick < hintReopenGateUntil;
    let toOpen = null;
    for (const hint of hints) {
        if (nowStanding.has(hint.id) && !hintWasStanding.has(hint.id)) {
            toOpen = hint;
            break;
        }
    }
    if (!toOpen && interactPressed && firstStanding && !gated) toOpen = firstStanding;
    hintWasStanding = nowStanding;
    if (toOpen) openHintDemo(toOpen);
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
    hintWasStanding.clear();
    hintReopenGateUntil = 0;
    hintDemoJustClosed = false;
    state.currentLevelIndex = levelIndex;
    state.currentLevelMeta = LEVELS[levelIndex];
    state.pendingBossIntro = null;
    startMusic();
    let lv = LEVELS[levelIndex];
    applyLevelAbilityOverrides(lv);
    state.worldUnlockedAbilities = getWorldUnlockedAbilities(levelIndex);
    state.robots = []; state.burrowers = []; state.gatekeepers = []; state.prisms = []; state.projectiles = [];
    state.bossCheckpoint = null;
    state.bossCheckpointLive = false;
    clearGatekeeperCheckpoint();
    state.playtesting = false;
    state.customLayout = null;
    state.editorReturnLayout = null;
    document.getElementById('playtest-return-btn')?.classList.add('hidden');
    document.getElementById('level-display').innerText = getLevelDisplayLabel(levelIndex, lv);
    document.getElementById('objective-text').innerText = localizeControlHints(lv.obj);
    applyLevelHint(lv); 
    
    applyLoadedLevel(getLevelSetup(levelIndex));
    updateHUD(); state.runStats = { tosses: 0, dashes: 0, cloaks: 0, alarms: 0 };
    updateDeliveryProgressUI();
    applyChallengeHud(lv, levelIndex);
    state.pastRuns = []; state.lastRunFailed = false; state.loopFails = 0; state.loopNumber = 1; state.currentRun = []; state.currentTick = 0; state.activeGhosts = []; state.failTimer=0; state.failMessage=""; state.alarmState = false;
    clearLoopFx();
    uiTitleScreen.classList.add('hidden'); uiLevelComplete.classList.add('hidden'); uiGameOver.classList.add('hidden');
    uiAppLayout.classList.remove('hidden'); syncLoopCountUI(); Object.assign(prevKeys, keys);
    document.getElementById('mobile-controls')?.classList.remove('hidden');
    syncTouchUi();
    
    beginRecording({ level: levelIndex, levelName: lv.name });
    if (!showIntroDialog(lv, levelIndex)) {
        state.gameState = 'PLAYING';
        hideLevelDialog();
        maybeStartDemo();
    }
}

function loopRecordCap() {
    const seconds = normalizeLoopTime(state.currentLevelMeta?.loopTime);
    if (seconds == null) return null;
    const ticksPerSecond = state.TICK_RATE > 0 ? (1000 / state.TICK_RATE) : (state.FPS || 60);
    const ticks = Math.round(seconds * ticksPerSecond);
    return ticks > 0 ? ticks : null;
}

function loopTimeExpired() {
    const cap = loopRecordCap();
    if (cap == null) return false;
    return state.currentTick >= cap || state.currentRun.length >= cap;
}

// Broken Gatekeeper shields survive R (resetRun). A new attempt clears this.
function clearGatekeeperCheckpoint() {
    state.gatekeeperCheckpoint = {};
}

function warnEchoesEndingOnCracks() {
    const meta = state.currentLevelMeta;
    const devPlay = !!(state.playtesting || meta?.isPlaytest || meta?.isSandbox);
    if (!devPlay) return;
    const w = state.player?.w || 30;
    const h = state.player?.h || 30;
    const echoEndPositions = (state.pastRuns || []).map((run, id) => {
        const step = run && run.length ? run[run.length - 1] : {};
        return { id, x: step.x, y: step.y, w, h };
    });
    const offenders = findEchoesEndingOnCracks({
        cracks: (state.cracks || []).map(c => ({ x: c.x, y: c.y, w: c.w, h: c.h }))
    }, echoEndPositions);
    if (offenders.length) console.warn('[echo-validation] echo ends on a cracked floor', offenders);
}

export function resetRun() {
    markLoopBoundary();
    // A run that ended in a death is not kept as an echo: it would replay the
    // fall and could push a good echo out of the maxGhosts buffer.
    const failedRun = !!state.lastRunFailed;
    state.lastRunFailed = false;
    state.pickupFlash = null;
    const recorded = state.currentTick > 0 && !failedRun;
    if (recorded) {
        const cap = loopRecordCap();
        const run = (cap != null && state.currentRun.length > cap) ? state.currentRun.slice(0, cap) : state.currentRun;
        state.pastRuns.push([...run]);
        state.loopNumber = displayedLoopNumber(state.loopNumber) + 1;
    }
    state.currentRun = []; state.currentTick = 0; state.failTimer=0; state.failMessage=""; state.alarmState = false;
    clearLoopFx();
    const loopLevel = state.currentLevelMeta || LEVELS[state.currentLevelIndex];
    if (loopLevel && loopLevel.maxGhosts != null && state.pastRuns.length > loopLevel.maxGhosts) state.pastRuns.shift();

    state.bossCheckpointLive = true;
    applyLoadedLevel(loadCurrentEntities());
    state.bossCheckpointLive = false;
    // gatekeeperCheckpoint intentionally kept so broken shields survive this loop reset.
    if (state.currentLevelMeta?.isBoss) engageBossEncounter(state.currentLevelMeta);
    state.activeGhosts = state.pastRuns.map((r, i) => new Ghost(i, r));
    if (recorded) warnEchoesEndingOnCracks();
    syncLoopCountUI();
    updateDeliveryProgressUI();
    bossHudKey = '';
    syncBossHud();
    beginRewindJuice();
}

export function restartLevel() {
    if (isDemoActive()) stopDemo({ markSeen: false, invokeDismiss: false });
    hintDemoSnapshot = null;
    activeHintId = null;
    hintWasStanding.clear();
    hintReopenGateUntil = 0;
    let lv = state.playtesting ? state.currentLevelMeta : LEVELS[state.currentLevelIndex];
    if (!lv) return;
    state.currentLevelMeta = lv;
    applyLevelAbilityOverrides(lv);
    state.worldUnlockedAbilities = state.playtesting ? getPlaytestWorldUnlocks(lv) : getWorldUnlockedAbilities(state.currentLevelIndex);
    state.bossCheckpoint = null;
    state.bossCheckpointLive = false;
    clearGatekeeperCheckpoint();
    applyLoadedLevel(loadCurrentEntities());
    state.pastRuns = []; state.lastRunFailed = false; state.loopFails = 0; state.loopNumber = 1; state.currentRun = []; state.currentTick = 0; state.activeGhosts = [];
    state.failTimer = 0; state.failMessage = ""; state.alarmState = false; state.runStats = { tosses: 0, dashes: 0, cloaks: 0, alarms: 0 };
    clearLoopFx();
    syncLoopCountUI();
    updateDeliveryProgressUI();
    applyChallengeHud(lv, state.currentLevelIndex);
    document.getElementById('objective-text').innerText = localizeControlHints(lv.obj);
    applyLevelHint(lv);
    hideLevelDialog();
    // Q restarts straight into the fight. Story and boss intro stay on the first entry only.
    state.pendingBossIntro = null;
    beginRecording(state.playtesting
        ? { level: null, levelName: lv.name, layout: state.editorReturnLayout, meta: editorMetaForRecording() }
        : { level: state.currentLevelIndex, levelName: lv.name });
    if (lv.isBoss) beginBossEncounter(lv);
    state.gameState = 'PLAYING';
    updateHUD();
    Object.assign(prevKeys, keys);
}

export function levelFailed(reason) {
    if (state.failTimer > 0) return;
    state.lastRunFailed = true;
    state.loopFails = (state.loopFails || 0) + 1;
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

// Editor playtest: gate purchased abilities by the edited level's world (+ its unlocks), like the campaign.
function getPlaytestWorldUnlocks(meta) {
    const worldId = normalizeWorldId(meta?.world);
    if (worldId == null) return null;
    return getWorldUnlockedAbilitiesForWorld(worldId, meta.unlocks || []);
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
        challenge: getChallengeByRef(em.challengeRef) || { desc: 'Playtest', check: () => false },
        maxGhosts: em.maxGhosts ?? 3,
        crackSpeed: em.crackSpeed === 'fast' ? 'fast' : 'normal',
        grants: Array.isArray(em.grants) && (em.grants.length || normalizeWorldId(em.world) != null) ? [...em.grants] : ['dash', 'toss', 'cloak', 'ghostShield'],
        world: normalizeWorldId(em.world) ?? undefined,
        unlocks: Array.isArray(em.unlocks) ? [...em.unlocks] : undefined,
        isPlaytest: true,
        ...copyBossMeta(em, {}),
        demo: cloneDemo(em.demo)
    };
    const playtestLoopTime = normalizeLoopTime(em.loopTime);
    if (playtestLoopTime != null) state.currentLevelMeta.loopTime = playtestLoopTime;
    const playtestHint = (em.hintLine || '').trim();
    if (playtestHint) state.currentLevelMeta.hintLine = playtestHint;
    const playtestPit = normalizePitKillFraction(em.pitKillFraction);
    if (playtestPit != null) state.currentLevelMeta.pitKillFraction = playtestPit;
    const playtestPar = normalizePar(em.par);
    if (playtestPar != null) state.currentLevelMeta.par = playtestPar;
    applyLevelAbilityOverrides(state.currentLevelMeta);
    state.worldUnlockedAbilities = getPlaytestWorldUnlocks(state.currentLevelMeta);
    state.bossCheckpoint = null;
    state.bossCheckpointLive = false;
    state.pendingBossIntro = null;
    document.getElementById('level-display').innerText = getLevelDisplayLabel(0, state.currentLevelMeta);
    document.getElementById('objective-text').innerText = state.currentLevelMeta.obj;
    applyLevelHint(state.currentLevelMeta);

    clearGatekeeperCheckpoint();
    applyLoadedLevel(deserializeLevel(layout));
    beginRecording({ level: null, levelName: state.currentLevelMeta.name, layout, meta: editorMetaForRecording() });
    updateHUD();
    state.runStats = { tosses: 0, dashes: 0, cloaks: 0, alarms: 0 };
    updateDeliveryProgressUI();
    applyChallengeHud(state.currentLevelMeta, state.currentLevelIndex);
    state.pastRuns = []; state.lastRunFailed = false; state.loopNumber = 1; state.currentRun = []; state.currentTick = 0; state.activeGhosts = [];
    state.failTimer = 0; state.failMessage = ""; state.alarmState = false;
    clearLoopFx();
    uiLevelComplete.classList.add('hidden');
    uiGameOver.classList.add('hidden');
    syncLoopCountUI();
    if (!showIntroDialog(state.currentLevelMeta, null)) {
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
        if (isKeyJustPressed('q')) { restartLevel(); updatePrevKeys(); return; }
        // SPACE is reserved for GRAB; dialog advances on Enter / overlay tap / CONTINUE.
        if (isKeyJustPressed('enter')) {
            startMusic();
            confirmLevelIntro();
            updatePrevKeys();
            consumeDialogConfirmKeys();
            return;
        }
        updatePrevKeys(); return;
    }
    if (state.gameState === 'BOSS_INTRO') {
        if (isKeyJustPressed('esc')) { handleEscape(); updatePrevKeys(); return; }
        if (isKeyJustPressed('q')) { restartLevel(); updatePrevKeys(); return; }
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

    recordFrame(keys);
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
            // Popup: Esc dismisses without touching live state. Overlay: skip if allowed.
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
        if (isPopupDemo()) {
            // Popup: isolated mini-demo only — keep running live gameplay below.
            if (demoResult?.done) {
                dismissHintDemo();
            }
            // fall through to live player update
        } else if (demoResult?.done || !isDemoActive()) {
            if (hintDemoJustClosed) {
                hintDemoJustClosed = false;
            } else {
                restartLevel();
            }
            updatePrevKeys();
            return;
        } else {
            // Overlay demo still hijacks live input via stick inject; continue into movement.
        }
    } else if (isKeyJustPressed('esc')) {
        handleEscape();
        updatePrevKeys();
        return;
    }

    if (!isDemoActive() && isKeyJustPressed('q')) { restartLevel(); updatePrevKeys(); return; }
    if (isKeyJustPressed('r') || loopTimeExpired()) { resetRun(); updatePrevKeys(); return; }
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

    const demoWasActive = isDemoActive();
    const popupWasActive = isPopupDemo();
    let interactJustPressed = isKeyJustPressed('space');
    updateHintPlates(interactJustPressed);
    // Opening a popup must not steal the frame's live movement — only suppress
    // treating the same Space as package pickup. Overlay demos still abort.
    if (!demoWasActive && isDemoActive() && !isPopupDemo()) { updatePrevKeys(); return; }
    if (!popupWasActive && isPopupDemo()) {
        interactJustPressed = false;
    }
    let tossJustPressed = hasToss && isKeyJustPressed('f');
    let dashJustPressed = hasDash && isKeyJustPressed('shift');
    let cloakJustPressed = hasCloak && isKeyJustPressed('c');
    let dashFired = false;

    if (state.player.cloakTimer > 0) state.player.cloakTimer--;
    if (cloakJustPressed && state.player.cloakTimer <= 0) { SFX.cloak(); state.player.cloakTimer = 120; state.runStats.cloaks++; }
    if (dashJustPressed && state.player.dashCooldown <= 0) {
        // Dash along this tick's held direction; facing is only updated later in the tick,
        // so using it alone dashed along last tick's heading (B6: west press -> 120px south).
        const held = getMoveVector();
        const dfx = held.x ? Math.sign(held.x) : (held.y ? 0 : state.player.facingX);
        const dfy = held.y ? Math.sign(held.y) : (held.x ? 0 : state.player.facingY);
        let dest = getDashDestination(state.player.x, state.player.y, dfx, dfy, 120, state.player.w, state.player.h);
        if (dest.x !== state.player.x || dest.y !== state.player.y) { 
            SFX.dash(); 
            state.dashTrails.push({ sx: state.player.x, sy: state.player.y, ex: dest.x, ey: dest.y, life: 1.0 });
            // B8: remember the swept box so the laser check below burns a dash that crosses
            // a live beam, exactly as walking into it would. Dashes are axis-aligned, so the
            // union of start and end boxes is the full swept path; no thin beam can be skipped.
            const p0 = state.player;
            state.dashSweep = { x: Math.min(p0.x, dest.x), y: Math.min(p0.y, dest.y),
                w: Math.abs(dest.x - p0.x) + p0.w, h: Math.abs(dest.y - p0.y) + p0.h };
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

    for (const door of state.doors) {
        if (typeof door.update === 'function') door.update(allActors, state.packages);
    }

    for (const gk of state.gatekeepers || []) {
        if (typeof gk.update === 'function') gk.update(state.currentTick, state.plates, state.doors);
    }
    // Lock wins over the plate assignment and door.update above for the rest of this loop.
    for (const door of state.doors || []) {
        if (door && door.gateLocked) door.isOpen = false;
    }

    for(let g of state.guards) { let fail = g.update(state.player, state.activeGhosts); if (fail) { levelFailed(fail); return; } }
    for (const burrower of state.burrowers || []) burrower.update(allActors);
    syncBossHud();
    for(let c of state.cracks) { let fail = c.update(allActors); if (fail) { levelFailed(fail); return; } }
    // The floor resolves after the strike decision. Drop a mark that the crack
    // update just invalidated so the drawn telegraph is never a broken tile.
    for (const burrower of state.burrowers || []) {
        if (!burrower || burrower.defeated) continue;
        burrower.validateLock();
    }
    for (const g of state.activeGhosts) if (g.isActive) g._crackFell = false;
    
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
    let pCanMoveX = !checkCourierCollision(nextPlayerX.x, nextPlayerX.y, nextPlayerX.w, nextPlayerX.h);
    let pCanMoveY = !checkCourierCollision(nextPlayerY.x, nextPlayerY.y, nextPlayerY.w, nextPlayerY.h);
    if (pCanMoveX) state.player.x += dx;
    if (pCanMoveY) state.player.y += dy;

    state.activeGhosts.forEach(g => {
        if (!g.isActive) return;
        let gDx = g.intendedDx || 0; let gDy = g.intendedDy || 0;
        if (gDx === 0 && gDy === 0) return;
        let nextGhostX = { x: g.x + gDx, y: g.y, w: g.w, h: g.h };
        let nextGhostY = { x: g.x, y: g.y + gDy, w: g.w, h: g.h };
        let gCanMoveX = !checkCourierCollision(nextGhostX.x, nextGhostX.y, nextGhostX.w, nextGhostX.h);
        let gCanMoveY = !checkCourierCollision(nextGhostY.x, nextGhostY.y, nextGhostY.w, nextGhostY.h);
        state.activeGhosts.forEach(otherG => {
            if (otherG !== g && otherG.isActive) {
                if (AABB(nextGhostX.x, nextGhostX.y, nextGhostX.w, nextGhostX.h, otherG.x, otherG.y, otherG.w, otherG.h) && ghostShieldBlocks(otherG, nextGhostX)) gCanMoveX = false;
                if (AABB(nextGhostY.x, nextGhostY.y, nextGhostY.w, nextGhostY.h, otherG.x, otherG.y, otherG.w, otherG.h) && ghostShieldBlocks(otherG, nextGhostY)) gCanMoveY = false;
            }
        });
        if (gCanMoveX) g.x += gDx;
        if (gCanMoveY) g.y += gDy;
    });

    const shieldOn = getUnlockedAbilities().includes('ghostShield');
    const slabs = collectShieldSlabs(state.player, state.activeGhosts, shieldOn);
    const dashSweep = state.dashSweep; state.dashSweep = null;
    for (const l of state.lasers) {
        if (state.player.cloakTimer <= 0 && (laserThreatens(l, state.player, slabs) || (dashSweep && laserThreatens(l, dashSweep, slabs)))) { levelFailed("Burned by Laser Grid!"); return; }
        for (const p of state.packages) {
            if (!p.isDestroyed && p.type === 'fragile' && laserThreatens(l, p, slabs)) {
                p.breakApart('vapor'); SFX.break(); SFX.laserHit(); levelFailed("Fragile Package Destroyed!"); return;
            }
        }
    }
    for (const prism of state.prisms || []) {
        const fail = prism.update({
            player: state.player,
            ghosts: state.activeGhosts,
            packages: state.packages,
            walls: state.walls,
            slabs
        });
        if (fail) { levelFailed(fail); return; }
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
                    notePickupFeedback(p);
                    break;
                }
            }
        }
    }

    if (state.pickupFlash && state.pickupFlash.ticks > 0) state.pickupFlash.ticks--;
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
                    // XR-9 armour: a crate from the front stops dead where it hit.
                    const pcx = p.x + p.w / 2 - (p.vx || 0) * 2;
                    const pcy = p.y + p.h / 2 - (p.vy || 0) * 2;
                    if (typeof r.isBehind === 'function' && !r.isBehind(pcx, pcy)) {
                        p.tossTicks = 0; p.vx = 0; p.vy = 0;
                        break;
                    }
                    r.takeHit();
                    if (p.requiredForDelivery !== false) p.reset();
                    else p.breakApart('shatter');
                    if (r.hp <= 0) {
                        let bossDoor = state.doors.find(d => d.id === (r.defeatDoorId || 'boss_door'));
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
        const loopLine = finishLoopLine(state.loopNumber, state.currentLevelMeta?.par);
        if (state.playtesting || state.currentLevelMeta?.isPlaytest) {
            if (chalMsg) { chalMsg.innerHTML = `Playtest complete.<br>${loopLine}`; chalMsg.style.color = '#00f3ff'; }
            nextBtn.innerText = "RETURN TO EDITOR";
            if (menuBtn) menuBtn.innerText = "RETURN TO EDITOR";
        } else if (state.currentLevelMeta?.isSandbox) {
            if (chalMsg) { chalMsg.innerHTML = `Sandbox delivery complete.<br>${loopLine}`; chalMsg.style.color = '#00f3ff'; }
            nextBtn.innerText = "RETURN TO MENU";
            if (menuBtn) menuBtn.innerText = "LEVEL SELECT";
        } else if (state.currentLevelMeta?.isTutorial) {
            markTutorialProgress(state.currentLevelIndex);
            if (chalMsg) { chalMsg.innerHTML = `Tutorial complete. You can replay this module any time from TRAINING.<br>${loopLine}`; chalMsg.style.color = '#00f3ff'; }
            let nextIndex = getNextLevelIndex(state.currentLevelIndex);
            nextBtn.innerText = nextIndex !== null ? "NEXT LEVEL" : "RETURN TO MENU";
            if (menuBtn) menuBtn.innerText = "LEVEL SELECT";
        } else {
            const levelIndex = state.currentLevelIndex;
            const isFirstTimeLevel = levelIndex == state.maxUnlockedLevel;
            const chalSuccess = !state.challengesCompleted[levelIndex] && LEVELS[levelIndex].challenge.check();
            const previouslyDone = !!state.challengesCompleted[levelIndex];
            const message = formatCampaignClearMessage({
                loopLine,
                firstClear: isFirstTimeLevel,
                challengePassed: chalSuccess,
                previouslyDone,
                devMode: isDevMode()
            });
            if (chalMsg) {
                chalMsg.innerHTML = message.html;
                chalMsg.style.color = message.color;
            }
            recordLevelClear(levelIndex, { challengePassed: chalSuccess, campaignLevelCount: CAMPAIGN_LEVEL_COUNT });
            if (chalSuccess) applyChallengeHud(LEVELS[levelIndex], levelIndex);
            let nextIndex = getNextLevelIndex(levelIndex);
            nextBtn.innerText = nextIndex !== null ? "NEXT LEVEL" : "FINISH SHIFT";
            if (menuBtn) menuBtn.innerText = "LEVEL SELECT";
        }
    }
    
    const recordCap = loopRecordCap();
    if (recordCap == null || state.currentRun.length < recordCap) {
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
    }
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

// Lit "safe shadow" strip in each beam a shielded actor is cutting (W5-L4 clarity).
function drawShieldShadows(target) {
    if (!getUnlockedAbilities().includes('ghostShield') || !state.lasers.length) return;
    const actors = [state.player, ...(state.activeGhosts || []).filter(g => g.isActive)];
    const pulse = 0.5 + 0.5 * Math.abs(Math.sin((state.currentTick || 0) * 0.1));
    target.save();
    for (const a of actors) {
        const slab = shieldSlab(a);
        if (!slab) continue;
        for (const r of shieldShadowRects(state.lasers, slab)) {
            target.fillStyle = `rgba(0, 243, 255, ${0.16 + 0.12 * pulse})`;
            target.fillRect(r.x, r.y, r.w, r.h);
            target.strokeStyle = 'rgba(0, 243, 255, 0.85)';
            target.lineWidth = 2; target.setLineDash([5, 4]);
            target.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
            target.setLineDash([]);
        }
    }
    target.restore();
}

// W5-L4 cold clarity: emitter housing at each beam's source, and beam-side edges on plates
// that sit inside a beam, so it reads that the plate cannot be reached from the side.
function drawBeamFixtures(target) {
    target.save();
    for (const l of state.lasers) {
        const e = laserEmitterRect(l);
        if (!e) continue;
        target.fillStyle = '#2a1416'; target.fillRect(e.x, e.y, e.w, e.h);
        target.fillStyle = l.isOpen ? '#553333' : '#ff5050';
        if (e.w > e.h) target.fillRect(e.x + e.w / 2 - 5, e.y + e.h - 4, 10, 4);
        else target.fillRect(e.x + e.w - 4, e.y + e.h / 2 - 5, 4, 10);
        target.strokeStyle = '#ff8080'; target.lineWidth = 1; target.strokeRect(e.x + 0.5, e.y + 0.5, e.w - 1, e.h - 1);
    }
    for (const b of plateBeamEdges(state.plates, state.lasers.filter(l => !l.isOpen))) {
        target.fillStyle = 'rgba(255, 70, 70, 0.95)';
        if (b.axis === 'y') {
            target.fillRect(b.x1 - 3, b.y, 3, b.h); target.fillRect(b.x2, b.y, 3, b.h);
            target.font = 'bold 9px monospace'; target.textAlign = 'right'; target.textBaseline = 'middle';
            target.fillText('IN BEAM: NO SIDE ENTRY', b.x1 - 8, b.y + b.h / 2);
        } else {
            target.fillRect(b.x, b.y1 - 3, b.w, 3); target.fillRect(b.x, b.y2, b.w, 3);
            target.font = 'bold 9px monospace'; target.textAlign = 'center'; target.textBaseline = 'bottom';
            target.fillText('IN BEAM: NO SIDE ENTRY', b.x + b.w / 2, b.y1 - 6);
        }
    }
    target.restore();
}

const loopRingCache = new WeakMap();
function loopRingCenter() {
    const meta = state.currentLevelMeta;
    if (meta && loopRingCache.has(meta)) return loopRingCache.get(meta);
    const src = meta?.layout || state;
    const c = pickLoopRingCenter(loopRingKeyRects(src), state.mapWidth || 800, state.mapHeight || 600);
    if (meta) loopRingCache.set(meta, c);
    return c;
}

function drawLoopCountdown(target) {
    if (state.gameState !== 'PLAYING') return;
    const cap = loopRecordCap();
    if (cap == null) return;
    const ticksPerSecond = state.TICK_RATE > 0 ? (1000 / state.TICK_RATE) : (state.FPS || 60);
    const left = Math.max(0, cap - (state.currentTick || 0));
    const frac = left / cap;
    const secondsLeft = left / ticksPerSecond;
    const label = String(Math.ceil(secondsLeft - 1e-6));
    const { x: cx, y: cy } = loopRingCenter();
    const r = LOOP_RING_R;
    const color = secondsLeft <= 2 ? '#ff3355' : (secondsLeft <= 5 ? '#ffdd00' : '#00f3ff');
    target.save();
    target.globalAlpha = 1;
    target.beginPath();
    target.arc(cx, cy, r, 0, Math.PI * 2);
    target.fillStyle = '#05070a';
    target.fill();
    target.lineWidth = 5;
    target.strokeStyle = 'rgba(0, 243, 255, 0.28)';
    target.stroke();
    target.beginPath();
    target.strokeStyle = color;
    target.lineWidth = 5;
    target.lineCap = 'butt';
    target.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac, false);
    target.stroke();
    target.fillStyle = color;
    target.font = 'bold 18px "Space Grotesk", sans-serif';
    target.textAlign = 'center';
    target.textBaseline = 'middle';
    target.fillText(label, cx, cy + 1);
    target.font = 'bold 10px "Space Grotesk", sans-serif';
    target.fillText('SEC', cx, cy + r + 14);
    target.restore();
}

function drawEchoEndMarkers(target) {
    if (state.gameState === 'EDITOR') return;
    const ghosts = state.activeGhosts;
    if (!ghosts || !ghosts.length) return;
    for (const ghost of ghosts) {
        const run = ghost.runData;
        if (!run || !run.length) continue;
        const end = run[run.length - 1];
        if (!end || !Number.isFinite(end.x) || !Number.isFinite(end.y)) continue;
        const w = ghost.w || state.player?.w || 30;
        const h = ghost.h || state.player?.h || 30;
        const facingX = end.facingX || 0;
        const facingY = end.facingY || 0;
        const picked = pickCourierFrame(state.playerAtlas, {
            cloaking: false, dashing: false, carrying: false, moving: false,
            facingX, facingY, tick: 0
        });
        const img = picked?.img || state.assets.player;
        const flipX = picked ? !!picked.flipX : facingX < 0;
        const tint = state.playerColor || '#ff7b00';
        let drew = false;
        if (img) {
            drew = drawSprite(target, img, end.x, end.y, w, h, {
                tint, tintAlpha: 1, alpha: 1, flipX, valign: 'bottom', scanlines: false
            });
        }
        if (!drew) {
            target.save();
            target.globalAlpha = 1;
            target.fillStyle = tint;
            target.fillRect(end.x, end.y, w, h);
            target.restore();
        }
        drawFacingChevron(target, end.x, end.y, w, h, facingX, facingY);
    }
}

function drawEchoEndMarkerBadges(target) {
    if (state.gameState === 'EDITOR') return;
    const ghosts = state.activeGhosts;
    if (!ghosts || !ghosts.length) return;
    const placed = [];
    for (const ghost of ghosts) {
        const run = ghost.runData;
        if (!run || !run.length) continue;
        const end = run[run.length - 1];
        if (!end || !Number.isFinite(end.x) || !Number.isFinite(end.y)) continue;
        const w = ghost.w || state.player?.w || 30;
        const h = ghost.h || state.player?.h || 30;
        const label = String((ghost.id ?? 0) + 1);
        const cx = end.x + w / 2;
        let cy = end.y - 14;
        while (placed.some((badge) => Math.abs(badge.x - cx) < 26 && Math.abs(badge.y - cy) < 26)) {
            cy -= 24;
        }
        placed.push({ x: cx, y: cy });
        target.save();
        target.globalAlpha = 1;
        target.beginPath();
        target.arc(cx, cy, 11, 0, Math.PI * 2);
        target.fillStyle = state.playerColor || '#ff7b00';
        target.fill();
        target.lineWidth = 3;
        target.strokeStyle = '#041018';
        target.stroke();
        target.font = 'bold 15px "Space Grotesk", sans-serif';
        target.textAlign = 'center';
        target.textBaseline = 'middle';
        target.lineWidth = 3;
        target.strokeStyle = '#041018';
        target.fillStyle = '#ffffff';
        target.strokeText(label, cx, cy);
        target.fillText(label, cx, cy);
        target.restore();
    }
}

// ==== PR4: TemporalPlate head legends, echo hazard flashes, timeline scrubber ====
function temporalModesInLevel() {
    const set = new Set();
    for (const p of state.plates || []) if (p instanceof TemporalPlate) set.add(p.requiredTimeline);
    return set;
}

function drawTemporalHeadLegends(target) {
    const modes = temporalModesInLevel();
    if (!modes.size || state.gameState === 'EDITOR') return;
    const ghosts = state.activeGhosts || [];
    for (const g of ghosts) {
        if (!g.isActive) continue;
        const gl = glyphsForGhost(g.id, ghosts, modes);
        gl.forEach((m, i) => drawTemporalGlyph(target, m, g.x + g.w / 2 + (i - (gl.length - 1) / 2) * 20, g.y - 12, 8));
    }
    if (modes.has('present') && state.player) drawTemporalGlyph(target, 'present', state.player.x + state.player.w / 2, state.player.y - 12, 8);
}

let echoHazardCache = { tick: -1, hits: [] };
function currentEchoHazards() {
    if (state.gameState !== 'PLAYING') return [];
    const t = state.currentTick;
    if (echoHazardCache.tick < 0 || t < echoHazardCache.tick || t - echoHazardCache.tick >= 6) {
        echoHazardCache = {
            tick: t,
            hits: predictEchoHazards(state.activeGhosts, state.cameras, state.lasers, {
                shield: getUnlockedAbilities().includes('ghostShield')
            })
        };
    }
    return echoHazardCache.hits;
}

function drawEchoHazardFlashes(target) {
    const hits = currentEchoHazards();
    if (!hits.length) return;
    const blink = 0.35 + 0.65 * Math.abs(Math.sin(state.currentTick * 0.25));
    target.save();
    for (const h of hits) {
        const cx = h.x + 15, cy = h.y + 15;
        target.globalAlpha = blink;
        target.strokeStyle = '#ff2a2a';
        target.lineWidth = 3;
        target.beginPath(); target.arc(cx, cy, 18, 0, Math.PI * 2); target.stroke();
        target.beginPath(); target.moveTo(cx - 8, cy - 8); target.lineTo(cx + 8, cy + 8); target.moveTo(cx + 8, cy - 8); target.lineTo(cx - 8, cy + 8); target.stroke();
        target.globalAlpha = 1;
        target.fillStyle = '#ff6b6b';
        target.font = 'bold 11px "Space Grotesk", sans-serif';
        target.textAlign = 'center';
        target.fillText(h.kind === 'laser' ? 'LASER' : 'SEEN', cx, cy + 30);
    }
    target.restore();
}

const SCRUB_BAR = { x: 140, y: 574, w: 520, h: 14 };
let scrubTick = null;
function scrubHorizon() {
    let max = 0;
    for (const g of state.activeGhosts || []) max = Math.max(max, g.runData?.length || 0);
    return max;
}
function scrubberVisible() {
    return state.gameState === 'PLAYING' && (state.activeGhosts || []).length > 0 && scrubHorizon() > 1;
}
function scrubEventToCanvas(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (canvas.width / (r.width || 1)), y: (e.clientY - r.top) * (canvas.height / (r.height || 1)) };
}
function scrubSet(e) {
    const p = scrubEventToCanvas(e);
    const u = Math.max(0, Math.min(1, (p.x - SCRUB_BAR.x) / SCRUB_BAR.w));
    scrubTick = Math.round(u * (scrubHorizon() - 1));
}
if (canvas && canvas.addEventListener) {
    canvas.addEventListener('pointerdown', e => {
        if (!scrubberVisible()) return;
        const p = scrubEventToCanvas(e);
        if (p.x < SCRUB_BAR.x - 8 || p.x > SCRUB_BAR.x + SCRUB_BAR.w + 8 || p.y < SCRUB_BAR.y - 10 || p.y > SCRUB_BAR.y + SCRUB_BAR.h + 10) return;
        scrubSet(e);
        canvas.setPointerCapture?.(e.pointerId);
        e.preventDefault();
    });
    canvas.addEventListener('pointermove', e => { if (scrubTick != null) scrubSet(e); });
    const end = () => { scrubTick = null; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
}

function drawScrubPreviewGhosts(target) {
    if (scrubTick == null || !scrubberVisible()) return;
    target.save();
    for (const g of state.activeGhosts) {
        const s = sampleRun(g.runData, scrubTick);
        if (!s) continue;
        const w = g.w || 30, h = g.h || 30;
        target.globalAlpha = 0.55;
        target.strokeStyle = '#7df9ff';
        target.setLineDash([4, 3]);
        target.lineWidth = 2;
        target.strokeRect(s.x, s.y, w, h);
        target.setLineDash([]);
        target.fillStyle = 'rgba(125,249,255,0.25)';
        target.fillRect(s.x, s.y, w, h);
        target.globalAlpha = 1;
        target.fillStyle = '#7df9ff';
        target.font = 'bold 12px "Space Grotesk", sans-serif';
        target.textAlign = 'center';
        target.fillText(String((g.id ?? 0) + 1), s.x + w / 2, s.y - 4);
        drawFacingChevron(target, s.x, s.y, w, h, s.facingX, s.facingY);
    }
    target.restore();
}

function drawPreviewScrubber(target) {
    if (!scrubberVisible()) return;
    const horizon = scrubHorizon();
    const b = SCRUB_BAR;
    const toX = t => b.x + (Math.max(0, Math.min(horizon - 1, t)) / Math.max(1, horizon - 1)) * b.w;
    target.save();
    target.globalAlpha = scrubTick != null ? 0.95 : 0.7;
    target.fillStyle = 'rgba(4,16,24,0.8)';
    target.fillRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8);
    target.strokeStyle = 'rgba(125,249,255,0.6)';
    target.lineWidth = 1;
    target.strokeRect(b.x, b.y, b.w, b.h);
    for (const g of state.activeGhosts) {
        const ex = toX((g.runData?.length || 1) - 1);
        target.fillStyle = state.playerColor || '#ff7b00';
        target.fillRect(ex - 1, b.y, 2, b.h);
    }
    for (const hz of currentEchoHazards()) {
        target.fillStyle = '#ff2a2a';
        target.fillRect(toX(hz.tick) - 2, b.y - 2, 4, b.h + 4);
    }
    const nowX = toX(state.currentTick);
    target.fillStyle = 'rgba(255,255,255,0.85)';
    target.fillRect(nowX - 1, b.y - 3, 2, b.h + 6);
    if (scrubTick != null) {
        const sx = toX(scrubTick);
        target.fillStyle = '#7df9ff';
        target.beginPath(); target.arc(sx, b.y + b.h / 2, 7, 0, Math.PI * 2); target.fill();
        target.font = 'bold 11px "Space Grotesk", sans-serif';
        target.textAlign = 'center';
        target.fillText(`t=${(scrubTick / (state.FPS || 60)).toFixed(1)}s`, sx, b.y - 8);
    } else {
        target.fillStyle = 'rgba(125,249,255,0.75)';
        target.font = '10px "Space Grotesk", sans-serif';
        target.textAlign = 'left';
        target.fillText('DRAG TO PREVIEW ECHOES', b.x, b.y - 7);
    }
    target.restore();
}

function draw() {
    // Popup demos no longer freeze the main canvas — live world always draws.
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
    state.deliveryZone.render(ctx); drawWires(ctx, collectWires(state.plates, state.doors, state.lasers), state.currentTick); (state.hints||[]).forEach(h => h.render(ctx)); state.walls.forEach(w => w.render(ctx));
    // Plates draw over beams so a plate under a laser column (W5-L4) stays readable.
    state.lasers.forEach(l => l.render(ctx)); drawShieldShadows(ctx); drawBeamFixtures(ctx); state.plates.forEach(p => p.render(ctx)); state.doors.forEach(d => { if (d.render.length > 1) d.render(ctx, state.currentTick); else d.render(ctx); });
    drawEchoEndMarkers(ctx);
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
            drawFacingChevron(ctx, projectedEcho.final.x, projectedEcho.final.y, state.player.w, state.player.h, projectedEcho.final.facingX, projectedEcho.final.facingY);
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
    
    state.guards.forEach(g => g.render(ctx)); state.robots.forEach(r => r.render(ctx)); (state.burrowers || []).forEach(b => b.render(ctx)); drawCrackEdgeWarning(ctx); drawPickupFeedback(ctx); (state.gatekeepers || []).forEach(g => g.render(ctx)); (state.prisms || []).forEach(p => p.render(ctx)); state.projectiles.forEach(p => p.render(ctx));
    state.cameras.forEach(c => c.render(ctx)); state.drones.forEach(d => { if (d.alive !== false) d.render(ctx); });
    drawTemporalHeadLegends(ctx);
    if (state.gameState !== 'EDITOR') drawWorldLabels(ctx, worldLabelsFor(state, { shield: getUnlockedAbilities().includes('ghostShield') }), state.mapWidth || 800, state.mapHeight || 600);
    drawEchoHazardFlashes(ctx);
    drawScrubPreviewGhosts(ctx);
    if (state.failFx) drawBurst(ctx, state.failFx);
    if (state.rewindFx) drawBurst(ctx, state.rewindFx);
    renderEchoFellFx(ctx);
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
            ctx.font = '16px "Space Grotesk"'; ctx.fillStyle = '#ffd0d0'; ctx.fillText('Rewinding — this run will NOT become an echo.', 400, 335);
            ctx.fillText(`Failed loops this level: ${state.loopFails || 1}`, 400, 360);
            ctx.textAlign = 'left';
        }
    }

    drawLoopCountdown(ctx);

    // End-marker badges must render after (on top of) the loop countdown ring
    // so a badge near the top-left is never hidden beneath it.
    ctx.save();
    applyCamera(ctx, shakeX, shakeY);
    drawEchoEndMarkerBadges(ctx);
    ctx.restore();
    drawPreviewScrubber(ctx);

    if (isPopupDemo()) {
        drawMiniDemo();
        applyHintPinnedScreen();
    }
}

function editorMetaForRecording() {
    const em = state.editorLevelMeta || {};
    return { name: em.name, maxGhosts: em.maxGhosts, grants: em.grants, crackSpeed: em.crackSpeed, loopTime: em.loopTime };
}

/** Headless seam: one fixed 60 Hz simulation tick, no rendering (used by tests/harness/replay.mjs). */
export function stepSimulation() {
    update();
}

/** Dev tool: current run's input log as a solution JSON (paste into tests/solutions/). */
export function exportSolution() {
    const recording = getRecording();
    if (!recording) return null;
    if (state.gameState === 'LEVEL_COMPLETE') recording.completedLoops = displayedLoopNumber(state.loopNumber);
    return JSON.stringify(recording);
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
    applyDevModeUi();
    window.startNextAvailableLevel = () => {
        let lvl = isDevMode() ? 0 : firstSelectableLevel(state.maxUnlockedLevel, isLevelUnlocked);
        startGame(lvl);
    };
    window.startTutorialTrack = () => startGame(0);
    window.startTutorialTrackFromPrompt = () => {
        hideTutorialPrompt();
        startGame(0);
    };
    window.skipTutorialPrompt = () => {
        hideTutorialPrompt();
        let lvl = firstSelectableLevel(state.maxUnlockedLevel, isLevelUnlocked);
        startGame(lvl);
    };
    window.SANDBOX_LEVEL_INDEX = SANDBOX_LEVEL_INDEX;
    
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
                    maxGhosts: 3,
                    crackSpeed: 'normal'
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
    window.exportSolution = () => {
        const json = exportSolution();
        if (!json) { console.warn('[solution] nothing recorded yet'); return null; }
        console.log('[solution] copy into tests/solutions/<name>.json:\n' + json);
        try { navigator.clipboard?.writeText(json); } catch (_) {}
        return json;
    };
    window.exportSolutionToFile = () => {
        const json = window.exportSolution();
        if (!json) return;
        const lvl = state.playtesting ? 'editor' : `level${state.currentLevelIndex + 1}`;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([json + '\n'], { type: 'application/json' }));
        a.download = `${lvl}.solution.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    const exportBtn = document.getElementById('export-solution-btn');
    if (exportBtn) exportBtn.hidden = !isDevUrlEnabled();
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
    const devModeCheckbox = document.getElementById('dev-mode-checkbox');
    devModeCheckbox.onchange = () => {
        if (!devModeCheckbox.checked) reloadProgressFromStorage();
        refreshLevelSelectGrid();
        refreshShopButtons();
    };
    const devToolsToggle = document.getElementById('dev-tools-toggle');
    if (devToolsToggle) {
        devToolsToggle.onchange = () => {
            if (!isDevUrlEnabled()) setDevToolsEnabled(devToolsToggle.checked);
            applyDevModeUi();
        };
    }
    const unlockAllBox = document.getElementById('unlock-all-checkbox');
    if (unlockAllBox) {
        unlockAllBox.onchange = () => {
            setUnlockAll(unlockAllBox.checked);
            initMenu();
            showSubMenu('settings');
        };
    }
    
    document.getElementById('next-level-btn').onclick = () => window.nextLevel();
    document.getElementById('menu-btn')?.addEventListener('click', (e) => {
        if (state.playtesting || state.currentLevelMeta?.isPlaytest) {
            e.preventDefault();
            e.stopPropagation();
            returnToEditor();
        }
    });
    document.getElementById('reset-save-btn').onclick = () => {
        if (!confirm('Wipe all campaign progress? Level editor saves and settings are kept.')) return;
        wipeProgress();
        initMenu();
    };
    
    document.body.addEventListener('click', () => {
        unlockAudio();
        if (state.gameState === 'MENU' || state.gameState === 'GAME_COMPLETE') playMenuMusic();
    });
    

    
    initMenu(); 
    requestAnimationFrame(loop);
};
