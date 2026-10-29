import { pushEchoRun, rogueZoneClear, commitSandEcho } from './systems/sandEcho.js';
import { chamberClearedByRift, chamberClearedByTimer, chamberClearedByWave } from './rogue/chamberClear.js';
import { state, getUnlockedAbilities, getPlayerRank, isDevMode, applyDevModeUi, isDevUrlEnabled, setDevToolsEnabled, applyLevelAbilityOverrides, wipeProgress, setUnlockAll, recordLevelClear, markTutorialProgress, reloadProgressFromStorage, isLevelUnlocked } from './core/state.js';
import { keys, prevKeys, isKeyJustPressed, updatePrevKeys, initTouchControls, syncTouchUi, getMoveVector, consumeKey, pollGamepad } from './core/input.js';
import { audioCtx, startMusic, scheduleMusic, SFX, playMenuMusic, speakDialog, stopDialogSpeech, unlockAudio, preloadDialogVoice } from './core/audio.js';
import { pickLoopRingCenter, loopRingKeyRects, LOOP_RING_R } from './ui/loopRing.js';
import { worldLabelsFor, drawWorldLabels } from './ui/worldLabels.js';
import { AABB, checkWallCollision, checkCourierCollision, getDashDestination, PLAYER_MOVE_SPEED, HEAVY_SPEED_MULT } from './core/physics.js';
import { applyCamera, followWorldPoint, setMapSize, getMapSize, setCamera, DEFAULT_MAP_WIDTH, DEFAULT_MAP_HEIGHT, VIEW_WIDTH, VIEW_HEIGHT } from './core/camera.js';
import { ROOM_W } from './data/floorGen.js';
import { drawArenaBackdrop } from './rogue/arenaVisuals.js';
import { BIOME_ORDER, nextBiomeIndex } from './rogue/biomes.js';
import { showAspectPick, hideAspectPick } from './ui/aspectPick.js';
import { loadRogueMeta, nextUnlock, grantUnlock, recordRunEnd, rogueMaxGhosts, rogueLoopTime, rogueMaxSand, rogueStartSand, buyRogueShop, shopItems, selectRogueWeapon, buyRogueRelic, equipRogueRelic } from './rogue/rogueMeta.js';
import { getLevelSetup, LEVELS, deserializeLevel, serializeLevel, createBoundWalls, CAMPAIGN_LEVEL_COUNT, SANDBOX_LEVEL_INDEX, cloneDemo, getWorldUnlockedAbilities, getWorldUnlockedAbilitiesForWorld, normalizeWorldId, normalizeLoopTime, normalizePar, copyBossMeta, getChallengeByRef, normalizePitKillFraction, nextCampaignLevelIndex, firstSelectableLevel } from './data/levels.js';
import { Ghost, PlayerEntity } from './entities/actors.js';
import { ChronoSentry, EliteTickHound, TickHound, tickEchoFellFx, renderEchoFellFx, stunGuardsOverlapping, applyEchoGuardTouches, rogueCombatActive } from './entities/hazards.js';
import { findEchoesEndingOnCracks } from './validation/echoValidation.js';
import { initMenu, showSubMenu, updateHUD, refreshLevelSelectGrid, refreshShopButtons } from './ui/menu.js';
import { initEditor, drawEditorOverlay, tickEditor, syncEditorUi, setEditorLevelMetaFromLevel } from './ui/editor.js';
import { isDemoActive, isPopupDemo, canSkipDemo, startDemo, stopDemo, tickDemo, skipDemo, hasSeenDemo, demoStorageKey, initDemoPlayback, getActiveDemoSteps, setPopupDemoWorld, clearPopupDemoWorld, getPopupDemoWorld } from './systems/demoPlayback.js';
import { drawSprite } from './core/sprites.js';
import { createSandState, tickSand, resetHistory, canRewind, applyPickup, canDeathUndo, applyDeathUndo, canBlinkRewind, applyBlinkRewind, BLINK_COST, BLINK_IFRAMES, bumpMaxSand, refillSand, canTimeRupture, timeRupture, TIME_RUPTURE_COOLDOWN, TIME_RUPTURE_FREEZE, TIME_RUPTURE_RADIUS } from './systems/sandRewind.js';
import { beginRecording, recordFrame, markLoopBoundary, getRecording } from './systems/inputRecorder.js';
import { pickCourierFrame } from './core/atlas.js';
import { collectWires, drawWires } from './systems/wires.js';
import { glyphsForGhost } from './systems/temporalPlate.js';
import { sampleRun, predictEchoHazards } from './systems/preview.js';
import { collectShieldSlabs, laserThreatens, shieldSlab, shieldShadowRects, laserEmitterRect, plateBeamEdges } from './systems/laserShield.js';
import { TemporalPlate, drawTemporalGlyph } from './entities/interactables.js';
import { burrowerHud, crackEdgeWarning } from './core/bossHud.js';
import { beginAttack, tickAttack, attackIsActive, attackBox, applyCombatDamage, PLAYER_MAX_HP } from './rogue/combat.js';
import { createEncounterDirector, createPressureDirector, encounterRemaining, tickEncounterDirector, tickPressureDirector } from './rogue/encounterDirector.js';
import { authoredShellWalls, composeEncounter } from './rogue/encounterComposition.js';
import { beginEncounterTelemetry, completeEncounterTelemetry } from './rogue/encounterTelemetry.js';
import { CombatBurrower, CombatGatekeeper, CombatPrism, CombatStillkeeper, combatBossHud } from './rogue/combatBosses.js';
import { buildRunSummary, nextNarrativeState } from './rogue/runNarrative.js';
import { beginBossTelemetry, completeBossTelemetry, noteBossDamage } from './rogue/bossTelemetry.js';
import { aspectModifiers, pickAspectChoices } from './rogue/aspects.js';
import { WEAPON_FAMILIES, weaponMove, weaponHudState } from './rogue/weapons.js';
import { createWeaponEffects, syncEchoStrike, tickWeaponEffects } from './rogue/weaponRuntime.js';
import { commandEchoAssault, recallEchoes, ECHO_ASSAULT_COOLDOWN, ECHO_RECALL_COOLDOWN } from './rogue/echoCommands.js';
import { RELICS, relicSlots, relicModifiers } from './rogue/relics.js';
import { createRouteLedger, ledgerChoices } from './rogue/runRoute.js';
import { installLayoutFit } from './ui/fitLayout.js';
import { syncCanvasResolution } from './core/canvasResolution.js';
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
    return { x: VIEW_WIDTH / 2, y: VIEW_HEIGHT / 2 };
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
    const cx = p ? p.x + p.w / 2 : VIEW_WIDTH / 2;
    const cy = p ? p.y + p.h / 2 : VIEW_HEIGHT / 2;
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
    const combatBoss = state.rogueChamber?.isBoss
        ? (state.guards || []).find(enemy => enemy && enemy.maxHp > 0 && !enemy.dead)
        : null;
    const hud = combatBoss ? combatBossHud(combatBoss) : burrowerHud(boss, { delivered });
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
    const portrait = document.getElementById('dialog-portrait');
    if (portrait) {
        const name = String(speaker || '').toLowerCase();
        const portraitKey = name.includes('gatekeeper') ? 'gatekeeper'
            : name.includes('burrow') || name.includes('sinkhole') ? 'burrower'
                : name.includes('prism') ? 'prism'
                    : name.includes('xr-9') || name.includes('overclock') ? 'xr9'
                        : name.includes('courier') ? 'courier' : 'dispatch';
        if (portrait.dataset) portrait.dataset.portrait = portraitKey;
        else portrait.setAttribute?.('data-portrait', portraitKey);
    }
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
    el.classList.toggle('hidden', !!level.isRogue);
    if (level.isRogue) return;
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
    state.player.invulnTicks = 0;
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
    if (state.currentLevelMeta?.isRogue) {
        // Frame the player's whole room (ROOM_W <= VIEW_WIDTH) so airlock plates in opposite corners stay on-screen.
        const room = Math.floor((state.player.x + state.player.w / 2) / ROOM_W);
        followWorldPoint(room * ROOM_W + ROOM_W / 2, state.player.y + state.player.h / 2);
        return;
    }
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
    const rogueHp = state.currentLevelMeta?.isRogue ? state.player?.hp : null;
    markLoopBoundary();
    // A run that ended in a death is not kept as an echo: it would replay the
    // fall and could push a good echo out of the maxGhosts buffer.
    const failedRun = !!state.lastRunFailed;
    state.lastRunFailed = false;
    state.pickupFlash = null;
    const recorded = state.currentTick > 0 && !failedRun;
    if (recorded) {
        pushEchoRun(state.pastRuns, state.currentRun, null, loopRecordCap());
        state.loopNumber = displayedLoopNumber(state.loopNumber) + 1;
    }
    state.currentRun = []; state.currentTick = 0; state.failTimer=0; state.failMessage=""; state.alarmState = false;
    if (state.sand) resetHistory(state.sand);
    clearLoopFx();
    const loopLevel = state.currentLevelMeta || LEVELS[state.currentLevelIndex];
    // rogue meta already folds echoSlotBonus into maxGhosts, so read it raw.
    if (loopLevel && loopLevel.maxGhosts != null) pushEchoRun(state.pastRuns, null, loopLevel.maxGhosts);

    state.bossCheckpointLive = true;
    applyLoadedLevel(loadCurrentEntities());
    if (rogueHp != null) {
        state.player.hp = Math.max(1, rogueHp);
        state.player.maxHp = PLAYER_MAX_HP;
        updateRogueHealthHud();
    }
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

function rogueInvulnerable() {
    return !!(state.rogueRun?.active && (state.player?.invulnTicks | 0) > 0);
}

/** Apply a fail and stop the frame. Iframes swallow it and let the tick continue. */
function failUnlessInvuln(reason) {
    if (!reason) return false;
    if (rogueInvulnerable()) return false;
    levelFailed(reason);
    return true;
}

function applyRogueContact(hit) {
    if (!hit?.combatDamage || !state.rogueRun?.active) return false;
    if (!applyCombatDamage(state.player, hit.combatDamage)) return false;
    if (state.rogueChamber?.isBoss) noteBossDamage(state.rogueChamber.bossTelemetry, hit.combatDamage);
    startShake(10, 5);
    updateRogueHealthHud();
    if (state.player.hp > 0) return false;
    levelFailed(hit.reason || 'Courier integrity lost!');
    return true;
}

function hitRogueEnemy(enemy, attackId, damage = 1, impulse = null) {
    if (!enemy || enemy.dead) return false;
    const wasDead = !!enemy.dead;
    const hit = enemy.hitByAttack?.(attackId, damage, impulse) || false;
    if (hit && !wasDead && enemy.dead) {
        const amount = aspectModifiers(state.rogueRun).sandOnKill;
        if (amount > 0 && state.sand) {
            refillSand(state.sand, amount);
            updateSandHud();
        }
    }
    return hit;
}

export function levelFailed(reason) {
    if (state.failTimer > 0) return;
    // Aspect picker is modal: a clear already happened, so a late hit must not fail the run.
    if (state.rogueRun?.active && state.rogueChamber?.aspectPending) return;
    // Blink iframes: the hit does not kill, and does not spend a death-undo.
    if (rogueInvulnerable()) return;
    // Rogue Run death-undo: spend sand to auto-rewind ~1s instead of dying.
    // Skipped when a package was destroyed (rewind restores only the player).
    if (state.rogueRun?.active && state.sand && !/destroyed/i.test(reason || '') && canDeathUndo(state.sand)) {
        const r = applyDeathUndo(state.sand, state.player, state.packages);
        if (r.ok) {
            state.player.hp = 1;
            state.sandRewinding = false;
            state.failTimer = 0; state.failMessage = "";
            SFX.rewind();
            startShake(10, 4);
            state.deathUndoFlash = 45; // HUD pulse + 'SAND SAVE' caption
            updateRogueHealthHud();
            return;
        }
    }
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
    state.rogueRun = null;
    state.rogueChamber = null;
    hideAspectPick();
    document.getElementById('run-over')?.classList.add('hidden');
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
    if (state.rogueRun?.active) showRunOver(false);
    else if (state.playtesting) returnToEditor();
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

// ---- Roguelike run loop (hand-edit) ----
// A run walks BIOME_ORDER (Second-hand Halls, Hourglass Warrens, Echo Courts, The Still).
// Campaign LEVELS stay off this path
// (playtest path / customLayout).
// Clear opens the aspect picker, then the next biome. The last biome ends at Run Over.
// Any death / ESC ends the run. Aspect bonuses are run-only and carry across biomes.
function rogueSpawnPoints(layout) {
    const player = layout.player || { x: 50, y: 300, w: 30, h: 30 };
    const width = layout.mapWidth || 800;
    const height = layout.mapHeight || 600;
    const raw = (layout.guards || []).map(g => g.points?.[0] || g.path?.[0]).filter(Boolean);
    raw.push(
        { x: 45, y: 45 }, { x: width - 75, y: 45 },
        { x: 45, y: height - 75 }, { x: width - 75, y: height - 75 },
        { x: width / 2 - 15, y: 45 }, { x: width / 2 - 15, y: height - 75 }
    );
    const walls = layout.walls || [];
    const pcx = player.x + (player.w || 30) / 2;
    const pcy = player.y + (player.h || 30) / 2;
    const unique = [];
    for (const point of raw) {
        if (Math.hypot(point.x + 15 - pcx, point.y + 15 - pcy) < 200) continue;
        if (walls.some(w => AABB(point.x, point.y, 30, 30, w.x, w.y, w.w, w.h))) continue;
        if (unique.some(p => Math.hypot(p.x - point.x, p.y - point.y) < 20)) continue;
        unique.push({ x: point.x, y: point.y });
    }
    return unique.slice(0, 6);
}

function enterRogueChamber(biomeIndex, fresh, bossMode = false) {
    const meta = loadRogueMeta();
    const relics = relicModifiers(meta);
    const carriedHp = fresh ? PLAYER_MAX_HP + relics.maxHpBonus : Math.max(1, state.player?.hp ?? PLAYER_MAX_HP);
    const biome = BIOME_ORDER[biomeIndex] || BIOME_ORDER[0];
    const bossId = bossMode === true ? 'gatekeeper' : (bossMode || null);
    // Opening room is the Halls kill wave so the run starts under guard pressure.
    const opening = fresh && biome.id === 'second-hand-halls';
    const selectedType = state.rogueRun.ledgerEnabled ? state.rogueRun.selectedRouteNode?.chamberType : null;
    const chamber = biome.generateChamber(state.rogueRun.seed + (state.rogueRun.routeDepth | 0) * 313, selectedType || (opening ? 'patrol-corridor' : undefined));
    const layout = chamber.layout;
    const cmeta = chamber.meta;
    const clear = bossMode ? 'boss' : cmeta.clear;
    const mapWidth = layout.mapWidth || 800;
    const mapHeight = layout.mapHeight || 600;
    const rawRift = layout.deliveryZone || { x: mapWidth - 110, y: mapHeight / 2 - 50, w: 80, h: 100 };
    const runtimeRift = rawRift.x < 0 || rawRift.y < 0
        ? { x: mapWidth - 110, y: mapHeight / 2 - 50, w: 80, h: 100 }
        : { ...rawRift };
    let spawnPoints = rogueSpawnPoints(layout);
    if (clear === 'rift' && layout.deliveryZone) {
        const rift = layout.deliveryZone;
        spawnPoints = spawnPoints.sort((a, b) =>
            Math.hypot(b.x - rift.x, b.y - rift.y) - Math.hypot(a.x - rift.x, a.y - rift.y));
    }
    const directorSeed = state.rogueRun.seed + biomeIndex * 7919;
    const encounter = clear === 'kill'
        ? composeEncounter({
            biome: biome.id,
            depth: biomeIndex,
            seed: directorSeed,
            previous: state.rogueRun.previousEncounterFamilies || {}
        })
        : null;
    if (encounter) {
        state.rogueRun.previousEncounterFamilies = {
            shellFamily: encounter.shell.family,
            squadFamily: encounter.squad.family,
            modifierFamily: encounter.modifier.family,
            objectiveFamily: encounter.objective.family,
            rewardFamily: encounter.reward.family
        };
        const cover = (opening ? [] : authoredShellWalls(encounter.shell.id, mapWidth, mapHeight)).filter(wall =>
            !AABB(wall.x, wall.y, wall.w, wall.h, layout.player.x - 40, layout.player.y - 40, 110, 110) &&
            !AABB(wall.x, wall.y, wall.w, wall.h, runtimeRift.x - 25, runtimeRift.y - 25, runtimeRift.w + 50, runtimeRift.h + 50) &&
            !spawnPoints.some(point => AABB(wall.x, wall.y, wall.w, wall.h, point.x - 35, point.y - 35, 100, 100))
        );
        layout.walls = [...(layout.walls || []), ...cover];
    }
    const director = clear === 'kill'
        ? createEncounterDirector({ biome: biome.id, seed: directorSeed, spawnPoints, encounter })
        : (clear === 'boss' ? null : createPressureDirector({ seed: directorSeed, spawnPoints, initialDelay: clear === 'rift' ? 90 : 0 }));
    state.rogueChamber = {
        type: clear === 'kill' ? 'wave' : clear,
        zone: runtimeRift,
        ticksLeft: clear === 'timer' ? 20 * 60 : null,
        enemiesLeft: clear === 'kill' ? cmeta.waveCount : null,
        aspectPending: false,
        riftOpen: clear === 'rift',
        isBoss: !!bossId,
        bossId,
        bossPending: !bossId && (state.rogueRun.ledgerEnabled
            ? (state.rogueRun.routeDepth | 0) >= 2
            : ['second-hand-halls', 'hourglass-warrens', 'echo-courts', 'the-still'].includes(biome.id)),
        encounter,
        // Chamber setup resets currentTick below, so every room telemetry clock starts at zero.
        telemetry: beginEncounterTelemetry(encounter, 0),
        director: spawnPoints.length ? director : null
    };
    if (fresh || !state.sand) {
        state.sand = createSandState({ maxSand: rogueMaxSand(meta) + relics.maxSandBonus, sand: Math.max(rogueStartSand(meta), BLINK_COST + 0.1) });
    } else {
        resetHistory(state.sand);
        state.deathUndoFlash = 0;
    }
    state.roguePickups = (layout.pickups || []).map(p => ({ ...p, collected: false }));
    state.blinkAfterimages = [];
    state.rogueWeaponEffects = [];
    state.editorReturnLayout = layout;
    state.customLayout = layout;
    state.playtesting = true;
    document.getElementById('run-over')?.classList.add('hidden');
    document.getElementById('title-screen')?.classList.add('hidden');
    uiAppLayout.classList.remove('hidden');
    document.querySelector('.top-hud')?.classList.remove('hidden');
    document.querySelector('.bottom-hud')?.classList.remove('hidden');
    document.getElementById('mobile-controls')?.classList.remove('hidden');
    setPlaytestReturnVisible(false);
    const baseGhosts = (cmeta.maxGhosts ?? 2) + meta.echoSlotBonus;
    const carriedGhosts = !fresh && state.currentLevelMeta ? Number(state.currentLevelMeta.maxGhosts) || 0 : 0;
    state.currentLevelMeta = {
        name: bossId === 'stillkeeper' ? 'The Perfect Route' : (bossId === 'prism' ? 'Prism Court' : (bossId === 'burrower' ? 'Burrower Den' : (bossId ? 'Gatekeeper Audit' : cmeta.name))),
        obj: bossId === 'stillkeeper'
            ? 'Break the Stillkeeper’s perfect route with Echoes, then restart time.'
            : (bossId === 'prism'
            ? 'Use Echoes to bend the Prism beam away, then shatter its core.'
            : (bossId === 'burrower'
            ? 'Lure the Burrower with Echoes, dodge its eruption, and strike while surfaced.'
            : (bossId ? 'Defeat the Gatekeeper with attacks, Echoes, and time verbs.' : cmeta.obj))),
        par: cmeta.par,
        hall: cmeta.hall,
        biome: biome.id,
        clear,
        challenge: { desc: 'Rogue run', check: () => false },
        maxGhosts: Math.max(baseGhosts, carriedGhosts),
        loopTime: rogueLoopTime(meta),
        crackSpeed: 'normal',
        grants: ['dash', 'toss', 'cloak', 'ghostShield'],
        isPlaytest: true,
        isRogue: true,
        hintLine: opening ? 'SPACE quick · K heavy · L special · hold E create · Q assault · R recall' : undefined
    };
    applyLevelAbilityOverrides(state.currentLevelMeta);
    state.worldUnlockedAbilities = null;
    state.bossCheckpoint = null; state.bossCheckpointLive = false; state.pendingBossIntro = null;
    document.getElementById('level-display').innerText = biome.name;
    document.getElementById('objective-text').innerText = state.currentLevelMeta.obj;
    applyLevelHint(state.currentLevelMeta);
    clearGatekeeperCheckpoint();
    applyLoadedLevel(deserializeLevel({ ...layout }));
    Object.assign(state.deliveryZone, runtimeRift);
    state.guards = [];
    if (bossId) {
        const candidates = [
            { x: mapWidth - 190, y: mapHeight / 2 - 30 },
            { x: mapWidth / 2 - 30, y: 90 },
            { x: mapWidth / 2 - 30, y: mapHeight - 150 }
        ];
        const spot = candidates.find(point => !(layout.walls || []).some(wall =>
            AABB(point.x, point.y, 60, 60, wall.x, wall.y, wall.w, wall.h))) || candidates[0];
        state.guards.push(bossId === 'stillkeeper'
            ? new CombatStillkeeper(spot.x, spot.y)
            : (bossId === 'prism' ? new CombatPrism(spot.x, spot.y)
            : (bossId === 'burrower' ? new CombatBurrower(spot.x, spot.y) : new CombatGatekeeper(spot.x, spot.y))));
        const boss = state.guards[0];
        state.rogueChamber.bossTelemetry = beginBossTelemetry(bossId, boss.maxHp, 0, {
            dashes: 0, cloaks: 0, tosses: 0,
            ruptures: state.rogueRun.ruptureSeq
        });
    }
    state.plates = []; state.doors = []; state.cameras = []; state.lasers = []; state.drones = []; state.packages = [];
    state.player.maxHp = PLAYER_MAX_HP + relics.maxHpBonus + aspectModifiers(state.rogueRun).maxHpBonus;
    state.player.hp = Math.min(state.player.maxHp, carriedHp);
    beginRecording({ level: null, levelName: state.currentLevelMeta.name, layout, meta: editorMetaForRecording() });
    updateHUD();
    state.runStats = { tosses: 0, dashes: 0, cloaks: 0, alarms: 0 };
    updateDeliveryProgressUI();
    applyChallengeHud(state.currentLevelMeta, state.currentLevelIndex);
    state.pastRuns = []; state.lastRunFailed = false; state.loopFails = 0; state.loopNumber = 1; state.currentRun = []; state.currentTick = 0; state.activeGhosts = [];
    state.failTimer = 0; state.failMessage = ""; state.alarmState = false;
    clearLoopFx();
    uiLevelComplete.classList.add('hidden');
    uiGameOver.classList.add('hidden');
    syncLoopCountUI();
    hideLevelDialog();
    startMusic();
    state.gameState = 'PLAYING';
    Object.assign(prevKeys, keys);
    syncTouchUi();
    updateRogueHealthHud();
    updateRogueWeaponHud();
}

export function startRogueRun(seed, ledgerEnabled = false, startBiomeIndex = 0) {
    seed = (seed ?? Math.floor(Math.random() * 1e9)) >>> 0;
    const biomeIndex = Math.max(0, Math.min(BIOME_ORDER.length - 1, startBiomeIndex | 0));
    hideAspectPick();
    const meta = loadRogueMeta();
    const relics = relicModifiers(meta);
    const ledger = ledgerEnabled ? createRouteLedger(BIOME_ORDER, seed) : null;
    const firstNode = ledgerEnabled ? ledgerChoices(ledger, biomeIndex, 0)[0] : null;
    state.rogueRun = { active: true, seed, outcome: null, unlockTaken: false, biomeIndex, ruptureCooldown: 0, ruptureSeq: 0,
        weapon: meta.selectedWeapon, aspects: [], lastBossReached: null, echoesDeployed: 0,
        echoCharges: relics.echoCharges, riftOpenTicks: relics.riftOpenTicks, reachMultiplier: relics.reachMultiplier,
        ledgerEnabled, ledger, routeDepth: 0, selectedRouteNode: firstNode, routeHistory: firstNode ? [firstNode.id] : [] };
    state.sandRewinding = false;
    enterRogueChamber(biomeIndex, true);
}

export function startRogueLedgerRun(seed) {
    startRogueRun(seed, true);
    state.rogueRun.selectedRouteNode = null;
    state.rogueRun.routeHistory = [];
    showRouteLedger();
}

// Hall from the chamber just cleared (meta.hall). Biome registry if that is missing.
function clearedBiomeKicker() {
    const hall = state.currentLevelMeta?.hall;
    if (typeof hall === 'string' && hall.trim()) return hall.trim();
    const biome = BIOME_ORDER[state.rogueRun?.biomeIndex ?? 0] || BIOME_ORDER[0];
    return biome?.name || '';
}

// Aspect pick on a cleared chamber. Returns false when this was the last biome.
function advanceRogueBiome() {
    const run = state.rogueRun;
    if (!run?.active) return false;
    if (run.ledgerEnabled && !state.rogueChamber?.isBoss && (run.routeDepth | 0) < 2) {
        run.routeDepth++;
        showRouteLedger();
        return true;
    }
    const next = nextBiomeIndex(run.biomeIndex ?? 0);
    if (next == null) return false;
    run.biomeIndex = next;
    run.routeDepth = 0;
    run.outcome = null;
    state.sandRewinding = false;
    if (run.ledgerEnabled) showRouteLedger();
    else enterRogueChamber(next, false);
    return true;
}

function showRouteLedger() {
    const run = state.rogueRun;
    const root = document.getElementById('route-ledger');
    const choicesRoot = document.getElementById('route-ledger-choices');
    if (!run?.ledgerEnabled || !root || !choicesRoot) return;
    const biome = BIOME_ORDER[run.biomeIndex] || BIOME_ORDER[0];
    const choices = ledgerChoices(run.ledger, run.biomeIndex, run.routeDepth);
    const progress = document.getElementById('route-ledger-progress');
    if (progress) progress.innerText = `${biome.name} · route ${run.routeDepth + 1} of 3`;
    choicesRoot.innerHTML = '';
    for (const node of choices) {
        const button = document.createElement('button');
        button.className = 'route-node';
        const room = biome.chamberTypes.find(type => type.id === node.chamberType)?.name || node.chamberType;
        button.innerHTML = `<span class="route-node-type">${node.label}</span><span class="route-node-room">${room}</span><span class="route-node-reward">${node.reward}</span><span class="route-node-risk">RISK ${'◆'.repeat(node.risk || 1)}</span>`;
        button.onclick = () => chooseRouteNode(node.id);
        choicesRoot.appendChild(button);
    }
    state.gameState = 'ROUTE_LEDGER';
    root.classList.remove('hidden');
}

export function chooseRouteNode(id) {
    const run = state.rogueRun;
    const node = ledgerChoices(run?.ledger, run?.biomeIndex, run?.routeDepth).find(choice => choice.id === id);
    if (!run?.active || !node) return false;
    run.selectedRouteNode = node;
    run.routeHistory.push(node.id);
    document.getElementById('route-ledger')?.classList.add('hidden');
    enterRogueChamber(run.biomeIndex, false);
    return true;
}

function enterRogueBossChamber() {
    const run = state.rogueRun;
    if (!run?.active) return false;
    const biome = BIOME_ORDER[run.biomeIndex ?? 0] || BIOME_ORDER[0];
    const bossId = biome.id === 'the-still' ? 'stillkeeper' : (biome.id === 'echo-courts' ? 'prism' : (biome.id === 'hourglass-warrens' ? 'burrower' : 'gatekeeper'));
    run.lastBossReached = bossId;
    enterRogueChamber(run.biomeIndex ?? 0, false, bossId);
    return true;
}

// Timer chambers count down. Wave chambers recount guards that are not dead.
// Rewind ticks and an open aspect picker do not advance either clock.
function tickRogueChamber() {
    if (!state.rogueRun?.active || state.sandRewinding) return;
    const chamber = state.rogueChamber;
    if (!chamber || chamber.aspectPending) return;
    const alive = (state.guards || []).filter(g => g && !g.dead).length;
    const playerCenter = state.player ? { x: state.player.x + state.player.w / 2, y: state.player.y + state.player.h / 2 } : null;
    const spawnHounds = points => {
        for (const point of points) {
            const path = [{ ...point }, { x: point.x + 1, y: point.y }];
            state.guards.push(point.role === 'elite' ? new EliteTickHound(path) : (point.role === 'sentry' ? new ChronoSentry(path) : new TickHound(path, point.role)));
        }
    };
    const openClearedRift = message => {
        chamber.type = 'rift';
        chamber.riftOpenTicks = Math.max(0, state.rogueRun.riftOpenTicks | 0);
        chamber.riftOpen = chamber.riftOpenTicks === 0;
        const objective = document.getElementById('objective-text');
        if (objective) objective.innerText = chamber.riftOpen ? message : `Rift stabilizing — ${(chamber.riftOpenTicks / 60).toFixed(1)}s`;
        chamber.riftMessage = message;
    };
    if (chamber.type === 'timer' && typeof chamber.ticksLeft === 'number') {
        chamber.ticksLeft -= 1;
        if (chamber.director?.kind === 'pressure') spawnHounds(tickPressureDirector(chamber.director, alive, playerCenter, chamber.ticksLeft > 0));
        if (chamber.ticksLeft <= 0) {
            openClearedRift('You survived — reach the open rift.');
        }
    } else if (chamber.type === 'rift') {
        if (!chamber.riftOpen && chamber.riftOpenTicks > 0) {
            chamber.riftOpenTicks--;
            if (chamber.riftOpenTicks <= 0) {
                chamber.riftOpen = true;
                const objective = document.getElementById('objective-text');
                if (objective) objective.innerText = chamber.riftMessage || 'Enter the open rift.';
            }
        } else if (chamber.director?.kind === 'pressure') spawnHounds(tickPressureDirector(chamber.director, alive, playerCenter, true));
    } else if (chamber.type === 'wave') {
        if (chamber.director) {
            spawnHounds(tickEncounterDirector(chamber.director, alive, playerCenter));
            chamber.enemiesLeft = encounterRemaining(chamber.director, (state.guards || []).filter(g => g && !g.dead).length);
        } else chamber.enemiesLeft = alive;
        if (chamber.enemiesLeft <= 0 && (!chamber.director || chamber.director.done)) {
            if (chamber.telemetry && chamber.telemetry.clearedAtTick == null) {
                completeEncounterTelemetry(chamber.telemetry, state.currentTick);
                state.rogueRun.encounterTelemetry = state.rogueRun.encounterTelemetry || [];
                state.rogueRun.encounterTelemetry.push({ ...chamber.telemetry });
            }
            openClearedRift('Wave cleared — enter the open rift.');
        }
    } else if (chamber.type === 'boss') {
        chamber.enemiesLeft = alive;
        if (alive <= 0) {
            if (chamber.bossTelemetry?.killedAtTick == null) {
                completeBossTelemetry(chamber.bossTelemetry, state.currentTick, {
                    ...state.runStats,
                    ruptures: state.rogueRun.ruptureSeq
                });
                state.rogueRun.bossTelemetry = state.rogueRun.bossTelemetry || [];
                state.rogueRun.bossTelemetry.push({ ...chamber.bossTelemetry });
            }
            const bossName = chamber.bossId === 'stillkeeper' ? 'Stillkeeper' : (chamber.bossId === 'prism' ? 'Prism' : (chamber.bossId === 'burrower' ? 'Burrower' : 'Gatekeeper'));
            openClearedRift(`${bossName} defeated — enter the open rift.`);
        }
    }
}

/** Run-only boons from the aspect picker. Does not write rogue meta. */
export function applyAspect(id) {
    if (!state.rogueRun?.active) return;
    if (!state.rogueRun.aspects) state.rogueRun.aspects = [];
    if (state.rogueRun.aspects.includes(id)) return;
    state.rogueRun.aspects.push(id);
    if (id === 'sand-tank') {
        if (state.sand) bumpMaxSand(state.sand, 1);
    } else if (id === 'start-sand') {
        if (state.sand) refillSand(state.sand, 0.5);
    } else if (id === 'echo-slot' && state.currentLevelMeta) {
        state.currentLevelMeta.maxGhosts = (Number(state.currentLevelMeta.maxGhosts) || 0) + 1;
    } else if (id === 'hourglass-heart' && state.player) {
        state.player.maxHp = (state.player.maxHp || PLAYER_MAX_HP) + 1;
        state.player.hp = Math.min(state.player.maxHp, (state.player.hp || 0) + 1);
    }
}

function showRunOver(cleared) {
    if (!state.rogueRun?.active) return;
    hideAspectPick();
    state.rogueRun.active = false;
    state.rogueRun.outcome = cleared ? 'cleared' : 'failed';
    state.rogueRun.echoesDeployed = Math.max(state.rogueRun.echoesDeployed | 0, state.activeGhosts?.length || 0, state.pastRuns?.length || 0);
    const summary = buildRunSummary({
        cleared,
        deathCause: state.failMessage,
        rogueRun: state.rogueRun,
        runStats: state.runStats
    });
    const meta = loadRogueMeta();
    const narrative = nextNarrativeState(meta, summary);
    state.rogueRun.summary = summary;
    state.rogueRun.reaction = narrative.reaction;
    state.sand = null; state.roguePickups = []; // run-only sand bonuses never leak
    state.failTimer = 0;
    state.gameState = 'RUN_OVER';
    recordRunEnd(cleared, meta, {
        lastRunSummary: summary,
        lastReaction: narrative.reaction,
        recentDialogueIds: narrative.recentDialogueIds,
        auditorTrust: narrative.auditorTrust,
        relationshipUnlocked: narrative.relationshipUnlocked
    });
    const el = document.getElementById('run-over');
    if (!el) return;
    const title = document.getElementById('run-over-title');
    if (title) { title.innerText = cleared ? 'FLOOR CLEARED' : 'RUN FAILED'; title.style.color = cleared ? '#00f3ff' : '#ff3366'; }
    const summaryEl = document.getElementById('run-over-summary');
    if (summaryEl) summaryEl.innerText = cleared
        ? `Route cleared · ${summary.weapon.replace('-', ' ')} · deepest boss ${summary.bossReached || 'none'}`
        : `${summary.deathCause} · deepest boss ${summary.bossReached || 'none'}`;
    const reactionEl = document.getElementById('run-over-reaction');
    if (reactionEl) reactionEl.innerText = narrative.reaction.text;
    syncRunOverUnlock();
    syncRogueShop();
    syncRogueRelics();
    el.classList.remove('hidden');
}

function syncRunOverUnlock() {
    const u = nextUnlock();
    const btn = document.getElementById('run-over-unlock-btn');
    const msg = document.getElementById('run-over-msg');
    const taken = !!state.rogueRun?.unlockTaken;
    if (btn) { btn.classList.toggle('hidden', !u || taken); if (u) btn.innerText = 'UNLOCK: ' + u.label; }
    if (msg) msg.innerText = taken ? 'Unlock saved.' : (u ? 'Claim one meta unlock:' : 'All rogue unlocks owned.');
}

export function claimRogueUnlock() {
    if (!state.rogueRun || state.rogueRun.active || state.rogueRun.unlockTaken) return;
    grantUnlock();
    state.rogueRun.unlockTaken = true;
    syncRunOverUnlock();
    syncRogueHub();
}

export function syncRogueHub() {
    const m = loadRogueMeta();
    const el = document.getElementById('rogue-meta-info');
    if (el) el.innerText = `Echo slots: ${rogueMaxGhosts(m)}  |  Record length: ${rogueLoopTime(m)}s  |  Runs: ${m.runs} (cleared ${m.clears})`;
    const reaction = document.getElementById('rogue-hub-reaction');
    if (reaction) reaction.innerText = m.lastReaction
        ? `${m.lastReaction.text}${m.relationshipUnlocked ? ' · Auditor relationship unlocked.' : ''}`
        : 'The temporal depot is quiet. For now.';
    const weapons = document.getElementById('rogue-weapon-list');
    if (weapons) {
        weapons.innerHTML = '';
        for (const weapon of Object.values(WEAPON_FAMILIES)) {
            const button = document.createElement('button');
            button.className = weapon.id === m.selectedWeapon ? 'primary-btn' : 'secondary-btn';
            button.innerText = weapon.name.toUpperCase();
            button.onclick = () => { selectRogueWeapon(weapon.id); syncRogueHub(); };
            weapons.appendChild(button);
        }
    }
    syncRogueRelics();
    syncRogueShop();
}

function syncRogueRelics() {
    const m = loadRogueMeta();
    document.querySelectorAll('.rogue-relic-list').forEach(relics => {
        relics.innerHTML = '';
        const equipped = new Set(m.relicsEquipped || []);
        const owned = new Set(m.relicsOwned || []);
        for (const relic of RELICS) {
            const button = document.createElement('button');
            button.className = equipped.has(relic.id) ? 'primary-btn' : 'secondary-btn';
            button.innerText = owned.has(relic.id)
                ? `${relic.name.toUpperCase()} — ${equipped.has(relic.id) ? 'EQUIPPED' : 'EQUIP'}`
                : `${relic.name.toUpperCase()} — COST ${relic.cost}`;
            button.title = relic.detail;
            button.disabled = !owned.has(relic.id) && m.shopPoints < relic.cost;
            button.onclick = () => {
                if (owned.has(relic.id)) equipRogueRelic(relic.id);
                else buyRogueRelic(relic.id);
                syncRogueRelics();
                syncRogueShop();
            };
            relics.appendChild(button);
        }
        const label = document.createElement('div');
        label.style.cssText = 'width:100%;font-size:.75rem;color:#aaa;';
        label.innerText = `RELIC SLOTS ${equipped.size}/${relicSlots(m)} · second slot at 10 runs`;
        relics.appendChild(label);
    });
}

/** Render sandTank/startSand shop into every .rogue-shop container (hub + Run Over). */
export function syncRogueShop() {
    if (typeof document === 'undefined') return;
    const m = loadRogueMeta();
    const items = shopItems(m);
    document.querySelectorAll('.rogue-shop').forEach(box => {
        const pts = box.querySelector('.rogue-shop-points');
        if (pts) pts.innerText = 'CHRONO DUST: ' + (m.shopPoints | 0);
        const list = box.querySelector('.rogue-shop-list');
        if (!list) return;
        list.innerHTML = '';
        for (const it of items) {
            const b = document.createElement('button');
            b.className = 'secondary-btn';
            b.style.cssText = 'display:block;margin:4px auto;min-width:260px;font-size:0.8rem;';
            b.dataset.shopId = it.id;
            b.innerText = `${it.label.toUpperCase()} ${it.level}/${it.maxLevel} — ` + (it.maxed ? 'MAXED' : `COST ${it.cost}`);
            b.disabled = it.maxed || !it.affordable;
            b.onclick = () => window.buyRogueShop?.(it.id);
            list.appendChild(b);
        }
    });
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

function updateSandHud() {
    const box = document.getElementById('sand-box');
    if (!box) return;
    const on = !!(state.rogueRun?.active && state.sand);
    box.classList.toggle('hidden', !on);
    if (!on) return;
    const pct = Math.max(0, Math.min(100, (state.sand.sand / state.sand.maxSand) * 100));
    const fill = document.getElementById('sand-fill');
    if (fill) fill.style.width = pct.toFixed(1) + '%';
    box.classList.toggle('sand-rewinding', !!state.sandRewinding);
    const label = document.getElementById('sand-text');
    const flash = (state.deathUndoFlash || 0) > 0;
    if (flash) state.deathUndoFlash--;
    box.classList.toggle('sand-save-flash', flash);
    if (label) label.textContent = flash ? 'SAND SAVE' : state.sand.sand.toFixed(1) + 's';
}

function updateRogueHealthHud() {
    const box = document.getElementById('rogue-health');
    const pips = document.getElementById('rogue-health-pips');
    const on = !!(state.rogueRun?.active && state.player);
    box?.classList.toggle('hidden', !on);
    if (!on || !pips) return;
    pips.replaceChildren(...Array.from({ length: state.player.maxHp || PLAYER_MAX_HP }, (_, i) => {
        const pip = document.createElement('span');
        pip.className = 'health-pip' + (i < state.player.hp ? ' is-full' : '');
        return pip;
    }));
}

function updateRogueWeaponHud() {
    const box = document.getElementById('rogue-weapon');
    const on = !!state.rogueRun?.active;
    box?.classList.toggle('hidden', !on);
    if (!on || !box) return;
    const hud = weaponHudState(state.rogueRun.weapon, state.rogueRun.weaponSpecialCooldown);
    const name = document.getElementById('rogue-weapon-name');
    const moves = document.getElementById('rogue-weapon-moves');
    const special = document.getElementById('rogue-weapon-special');
    if (name) name.textContent = hud.name;
    if (moves) moves.textContent = `J ${hud.quick}  ·  K ${hud.heavy}`;
    if (special) {
        special.textContent = hud.specialReady ? `L ${hud.special} READY` : `L ${hud.special} ${hud.specialSeconds}s`;
        special.classList.toggle('is-cooling', !hud.specialReady);
    }
}

function update() {
    pollGamepad();
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

    // Aspect UI is open: do not advance the world, and do not re-check win or fail.
    if (state.rogueRun?.active && state.rogueChamber?.aspectPending) {
        updatePrevKeys();
        return;
    }

    if (state.rogueRun?.active && state.player && state.player.invulnTicks > 0) state.player.invulnTicks--;

    // Sand rewind (Rogue Run only): while E held with sand, move player back and freeze the world.
    // Echoes commit on RELEASE (or sand empty) only if the hold lasted ≥ MIN_ECHO_SEGMENT frames.
    if (state.rogueRun?.active && state.sand && state.failTimer === 0) {
        const wasRewinding = !!state.sandRewinding;
        if (keys.e && !wasRewinding && canRewind(state.sand)) {
            // Rewind START: arm collector — do not spawn a ghost yet (short taps must create none).
            state.sandEchoPending = [];
            state.sandHoldTicks = 0;
        }
        const rewound = tickSand(state.sand, {
            holding: !!keys.e,
            player: state.player,
            packages: state.packages,
            tick: state.currentTick,
            costMultiplier: state.currentLevelMeta?.biome === 'the-still' ? 2 : 1
        });
        if (rewound) {
            if (state.currentRun.length) {
                const frame = state.currentRun.pop();
                if (!state.sandEchoPending) state.sandEchoPending = [];
                state.sandEchoPending.unshift(frame); // chronological: oldest undone first
                state.sandHoldTicks = (state.sandHoldTicks || 0) + 1;
            }
            state.sandRewinding = true;
            updateSandHud();
            updatePrevKeys();
            return;
        }
        if (wasRewinding) {
            // Hold ended (key up or sand empty): commit only if held long enough.
            if (commitSandEcho(state.pastRuns, state.sandEchoPending, state.sandHoldTicks, state.currentLevelMeta?.maxGhosts)) {
                if ((state.rogueRun.echoCharges | 0) > 0) {
                    state.rogueRun.echoCharges--;
                    refillSand(state.sand, state.sandHoldTicks / 60);
                }
                state.activeGhosts = state.pastRuns.map((r, i) => new Ghost(i, r));
            }
            state.sandEchoPending = null;
            state.sandHoldTicks = 0;
        }
        state.sandRewinding = false;
        updateSandHud();
    } else {
        state.sandRewinding = false;
        state.sandEchoPending = null;
        state.sandHoldTicks = 0;
        updateSandHud();
    }

    // Blink rewind. 'f' is toss (isKeyJustPressed); 'b' is free. Rogue Run only.
    // E-release above still commits a sand echo when the hold lasted >= MIN_ECHO_SEGMENT.
    if (state.rogueRun?.active && state.sand && state.player && state.failTimer === 0 && !state.sandRewinding
        && isKeyJustPressed('b') && canBlinkRewind(state.sand)) {
        const blinkFrom = { x: state.player.x, y: state.player.y, w: state.player.w, h: state.player.h };
        const frames = applyBlinkRewind(state.sand, state.player, state.packages);
        if (frames > 0) {
            if (rogueCombatActive()) {
                stunGuardsOverlapping(state.guards, blinkFrom);
                stunGuardsOverlapping(state.guards, { x: state.player.x, y: state.player.y, w: state.player.w, h: state.player.h });
            }
            state.player.invulnTicks = BLINK_IFRAMES;
            state.blinkAfterimageSeq = (state.blinkAfterimageSeq | 0) + 1;
            state.blinkAfterimages ??= [];
            state.blinkAfterimages.push({ ...blinkFrom, id: state.blinkAfterimageSeq, ticks: 20, hit: new WeakSet(),
                damage: aspectModifiers(state.rogueRun).blinkDamage });
            SFX.rewind();
            updateSandHud();
        }
    }

    if (state.rogueRun?.active && state.sand && state.player && state.failTimer === 0 && !state.sandRewinding) {
        if (state.rogueRun.ruptureCooldown > 0) state.rogueRun.ruptureCooldown--;
        if (isKeyJustPressed('v') && canTimeRupture(state.sand, state.rogueRun.ruptureCooldown)) {
            state.rogueRun.ruptureSeq = (state.rogueRun.ruptureSeq | 0) + 1;
            const cx = state.player.x + state.player.w / 2;
            const cy = state.player.y + state.player.h / 2;
            const ruptureRadius = aspectModifiers(state.rogueRun).ruptureRadius;
            const result = timeRupture(state.sand, { x: cx, y: cy }, state.guards, state.rogueRun.ruptureCooldown, state.rogueRun.ruptureSeq, ruptureRadius);
            if (result.ok) {
                state.rogueRun.ruptureCooldown = TIME_RUPTURE_COOLDOWN;
                state.ruptureFx = { x: cx, y: cy, ticks: TIME_RUPTURE_FREEZE, max: TIME_RUPTURE_FREEZE, radius: ruptureRadius };
                SFX.crack();
                updateSandHud();
            }
        }
    }

    // Run-only sand pickups: collect on touch (not while rewinding).
    if (state.rogueRun?.active && state.sand && !state.sandRewinding && state.failTimer === 0 && state.roguePickups?.length) {
        const pl = state.player;
        for (const pk of state.roguePickups) {
            if (pk.collected || !AABB(pl.x, pl.y, pl.w, pl.h, pk.x, pk.y, pk.w, pk.h)) continue;
            if (applyPickup(state.sand, pk.type)) { pk.collected = true; SFX.pickup(); updateSandHud(); }
        }
    }

    recordFrame(keys);
    tickLoopFx();
    
    if (state.failTimer > 0) {
        state.failTimer--;
        for (const p of state.packages) if (p.breakFx) p.update();
        if (state.failTimer === 0) { if (state.rogueRun?.active) showRunOver(false); else resetRun(); }
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

    if (rogueCombatActive()) {
        if (state.rogueRun.echoAssaultCooldown > 0) state.rogueRun.echoAssaultCooldown--;
        if (state.rogueRun.echoRecallCooldown > 0) state.rogueRun.echoRecallCooldown--;
        if (!isDemoActive() && isKeyJustPressed('q') && (state.rogueRun.echoAssaultCooldown | 0) <= 0) {
            const count = commandEchoAssault(state.activeGhosts, state.guards, state.rogueRun.weapon);
            if (count > 0) state.rogueRun.echoAssaultCooldown = ECHO_ASSAULT_COOLDOWN;
        }
        if (isKeyJustPressed('r') && (state.rogueRun.echoRecallCooldown | 0) <= 0) {
            const count = recallEchoes(state.activeGhosts, state.player, state.walls);
            if (count > 0) state.rogueRun.echoRecallCooldown = ECHO_RECALL_COOLDOWN;
        }
    } else {
        if (!isDemoActive() && isKeyJustPressed('q')) { restartLevel(); updatePrevKeys(); return; }
        if (isKeyJustPressed('r') || loopTimeExpired()) { resetRun(); updatePrevKeys(); return; }
    }
    if (state.rewindFreeze > 0) {
        state.rewindFreeze--;
        updatePrevKeys();
        return;
    }

    let allActors = [state.player];
    for (let ghost of state.activeGhosts) {
        ghost.update(state.packages, state.statics, state.winds, state.currentLevelMeta?.biome === 'the-still' ? 0.5 : 1);
        if (ghost.isActive) allActors.push(ghost);
    }

    state.alarmState = false; state.cameras.forEach(c => c.update(state.player));
    state.robots.forEach(r => r.update(state.player, state.activeGhosts, state.walls));
    for (let p of state.projectiles) {
        let fail = p.update(state.walls, state.activeGhosts, state.player, state.packages);
        if (fail?.combatDamage ? applyRogueContact(fail) : failUnlessInvuln(fail)) return;
    }
    state.projectiles = state.projectiles.filter(p => p.active);

    let unlocked = getUnlockedAbilities();
    let hasDash = unlocked.includes('dash'); let hasToss = unlocked.includes('toss'); let hasCloak = unlocked.includes('cloak');

    const demoWasActive = isDemoActive();
    const popupWasActive = isPopupDemo();
    if (rogueCombatActive() && state.player) {
        const intent = getMoveVector();
        if (intent.x || intent.y) state.player.stillstepTicks = 0;
        else state.player.stillstepTicks = Math.min(60, (state.player.stillstepTicks | 0) + 1);
    }
    let interactJustPressed = isKeyJustPressed('space');
    if (state.rogueRun?.weaponSpecialCooldown > 0) state.rogueRun.weaponSpecialCooldown--;
    if (rogueCombatActive()) updateRogueWeaponHud();
    const quickPressed = interactJustPressed || isKeyJustPressed('j');
    const heavyPressed = isKeyJustPressed('k');
    const specialPressed = isKeyJustPressed('l');
    const attackJustPressed = rogueCombatActive() && (quickPressed || heavyPressed || specialPressed);
    let weaponAction = specialPressed ? 'special' : (heavyPressed ? 'heavy' : 'quick');
    if (attackJustPressed) {
        const mods = aspectModifiers(state.rogueRun);
        const move = weaponMove(state.rogueRun.weapon, weaponAction);
        const specialReady = weaponAction !== 'special' || ((state.rogueRun.weaponSpecialCooldown | 0) <= 0 && (state.sand?.sand || 0) >= move.sandCost);
        const started = specialReady && beginAttack(state.player, move);
        if (started) {
            state.player.weaponAction = weaponAction;
            if (move.sandCost > 0) state.sand.sand = Math.max(0, state.sand.sand - move.sandCost);
            if (weaponAction === 'special') state.rogueRun.weaponSpecialCooldown = move.cooldown;
            const empowered = mods.stillstepDamage > 1 && (state.player.stillstepTicks | 0) >= 60;
            state.player.aspectAttackDamage = empowered ? mods.stillstepDamage : 1;
            if (empowered) state.player.stillstepTicks = 0;
            if (mods.secondStrike) {
                state.rogueRun.secondStrike = {
                    ticks: 12,
                    id: state.player.attackId,
                    actor: {
                        x: state.player.x, y: state.player.y, w: state.player.w, h: state.player.h,
                        facingX: state.player.facingX, facingY: state.player.facingY
                    }
                };
            }
        }
        if (quickPressed) interactJustPressed = false;
    }
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
            if (rogueCombatActive()) stunGuardsOverlapping(state.guards, state.dashSweep);
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
        if (failUnlessInvuln(fail)) return;
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

    if (rogueCombatActive()) applyEchoGuardTouches(state.guards, state.activeGhosts);
    tickAttack(state.player);
    if (rogueCombatActive() && attackIsActive(state.player)) {
        const box = attackBox(state.player, (state.player.attackRange || 48) * (state.rogueRun.reachMultiplier || 1));
        if ((state.player.weaponMove?.effect || 'melee').startsWith('melee')) {
            for (const enemy of state.guards) {
                if (!enemy?.dead && AABB(box.x, box.y, box.w, box.h, enemy.x, enemy.y, enemy.w, enemy.h)) {
                    const damage = (state.player.weaponMove?.damage || 1) + Math.max(0, (state.player.aspectAttackDamage || 1) - 1);
                    hitRogueEnemy(enemy, `player:${state.player.attackId}`, damage,
                        { x: (state.player.facingX || 0) * 12, y: (state.player.facingY || 0) * 12 });
                }
            }
        }
        if (!state.player.weaponEffectFired) {
            state.player.weaponEffectFired = true;
            if (state.player.weaponMove?.effect === 'echo-sync') {
                syncEchoStrike(state.activeGhosts, state.player, state.player.weaponMove.range);
            } else {
                state.rogueWeaponEffects.push(...createWeaponEffects(state.player, state.player.weaponMove, 'player'));
            }
        }
    }
    if (rogueCombatActive()) {
        for (const ghost of state.activeGhosts) {
            if (!ghost?.isActive || !attackIsActive(ghost)) continue;
            const box = attackBox(ghost);
            if ((ghost.weaponMove?.effect || 'melee').startsWith('melee')) {
                for (const enemy of state.guards) {
                    if (!enemy?.dead && AABB(box.x, box.y, box.w, box.h, enemy.x, enemy.y, enemy.w, enemy.h)) {
                        const mods = aspectModifiers(state.rogueRun);
                        const damage = (ghost.weaponMove?.damage || 1) + (mods.echoDamage - 1);
                        hitRogueEnemy(enemy, `echo:${ghost.id}:${ghost.attackId}`, damage,
                            { x: (ghost.facingX || 0) * mods.echoKnockback, y: (ghost.facingY || 0) * mods.echoKnockback });
                    }
                }
            }
            if (!ghost.weaponEffectFired) {
                ghost.weaponEffectFired = true;
                state.rogueWeaponEffects.push(...createWeaponEffects(ghost, ghost.weaponMove, `echo-${ghost.id}`));
            }
        }
    }
    const second = state.rogueRun?.secondStrike;
    if (rogueCombatActive() && second) {
        second.ticks--;
        if (second.ticks <= 0) {
            const box = attackBox(second.actor);
            for (const enemy of state.guards) {
                if (!enemy?.dead && AABB(box.x, box.y, box.w, box.h, enemy.x, enemy.y, enemy.w, enemy.h)) {
                    hitRogueEnemy(enemy, `second:${second.id}`, 1,
                        { x: (second.actor.facingX || 0) * 12, y: (second.actor.facingY || 0) * 12 });
                }
            }
            state.rogueRun.secondStrike = null;
        }
    }
    state.rogueWeaponEffects = tickWeaponEffects(state.rogueWeaponEffects || [], state.guards, hitRogueEnemy, state.walls);
    const weaponDecoys = state.rogueWeaponEffects.filter(effect => effect.kind === 'decoy' && effect.isActive);
    for(let g of state.guards) {
        if (g.ruptureTicks > 0) {
            g.ruptureTicks--;
            if (g.ruptureTicks <= 0 && g.rupturePendingId != null) {
                hitRogueEnemy(g, `rupture:${g.rupturePendingId}`);
                g.rupturePendingId = null;
            }
            continue;
        }
        const fail = g.update(state.player, [...state.activeGhosts, ...weaponDecoys]);
        if (applyRogueContact(fail)) return;
        if (typeof fail === 'string' && failUnlessInvuln(fail)) return;
    }
    if (rogueCombatActive() && state.blinkAfterimages?.length) {
        for (const image of state.blinkAfterimages) {
            for (const enemy of state.guards) {
                if (!enemy?.dead && !image.hit.has(enemy)
                    && AABB(image.x, image.y, image.w, image.h, enemy.x, enemy.y, enemy.w, enemy.h)) {
                    image.hit.add(enemy);
                    hitRogueEnemy(enemy, `blink:${image.id}`, image.damage || 1);
                }
            }
            image.ticks--;
        }
        state.blinkAfterimages = state.blinkAfterimages.filter(image => image.ticks > 0);
    }
    for (const burrower of state.burrowers || []) burrower.update(allActors);
    syncBossHud();
    for(let c of state.cracks) { let fail = c.update(allActors); if (failUnlessInvuln(fail)) return; }
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
        if (state.player.cloakTimer <= 0 && (laserThreatens(l, state.player, slabs) || (dashSweep && laserThreatens(l, dashSweep, slabs)))) {
            if (failUnlessInvuln("Burned by Laser Grid!")) return;
        }
        for (const p of state.packages) {
            if (!p.isDestroyed && p.type === 'fragile' && laserThreatens(l, p, slabs)) {
                if (rogueInvulnerable()) continue;
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
        if (failUnlessInvuln(fail)) return;
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
        let fail = p.update(); if (failUnlessInvuln(fail)) return;
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
    tickRogueChamber();
    const requiredPackages = getRequiredPackages();
    let allDelivered = requiredPackages.length > 0 && requiredPackages.every(isPackageDelivered);
    // Rogue floors with no packages clear by the player reaching the delivery zone.
    // A set rogueChamber replaces that exit with its own rule (rift / timer / wave).
    if (!allDelivered && state.rogueRun?.active && !state.rogueChamber?.aspectPending) {
        const chamber = state.rogueChamber;
        if (chamber) {
            if (chamber.type === 'rift') allDelivered = chamberClearedByRift(state.player, chamber.zone || state.deliveryZone);
            else if (chamber.type === 'timer') allDelivered = chamberClearedByTimer(chamber.ticksLeft);
            else if (chamber.type === 'wave') allDelivered = chamberClearedByWave(chamber.enemiesLeft);
        } else {
            allDelivered = rogueZoneClear(requiredPackages, state.player, state.deliveryZone);
        }
    }
    
    if (allDelivered && state.gameState === 'PLAYING' && !isDemoActive()) { 
        if (state.rogueRun?.active) {
            const chamber = state.rogueChamber;
            if (chamber?.aspectPending) { updatePrevKeys(); return; }
            if (chamber) {
                chamber.aspectPending = true;
                SFX.win();
                if (chamber.bossPending) {
                    enterRogueBossChamber();
                    updatePrevKeys();
                    return;
                }
                showAspectPick(id => {
                    applyAspect(id);
                    hideAspectPick();
                    if (!advanceRogueBiome()) showRunOver(true);
                }, clearedBiomeKicker(), pickAspectChoices(
                    state.rogueRun.seed + (state.rogueRun.aspects?.length || 0) * 7919 + (state.rogueRun.biomeIndex || 0) * 101,
                    state.rogueRun.aspects,
                    3
                ));
                updatePrevKeys();
                return;
            }
            SFX.win(); showRunOver(true); return;
        }
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
            attack: attackJustPressed,
            weaponAction: attackJustPressed ? weaponAction : null,
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
    if (state.rogueRun?.active && state.rogueRun.ruptureCooldown > 0) {
        parts.push(`RUPTURE ${ticksToSeconds(state.rogueRun.ruptureCooldown)}s`);
    }
    if (state.rogueRun?.active && state.rogueRun.echoCharges > 0) {
        parts.push(`FREE ECHO ${state.rogueRun.echoCharges}`);
    }
    if (!parts.length) return;
    const text = parts.join('  |  ');
    target.save();
    target.font = 'bold 16px "Space Grotesk", sans-serif';
    target.textAlign = 'center';
    target.textBaseline = 'middle';
    const width = target.measureText(text).width + 28;
    const x = VIEW_WIDTH / 2;
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
    return { x: (e.clientX - r.left) * (VIEW_WIDTH / (r.width || 1)), y: (e.clientY - r.top) * (VIEW_HEIGHT / (r.height || 1)) };
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

function drawRogueArenaBackdrop(target, map) {
    const biome = state.currentLevelMeta?.biome;
    drawArenaBackdrop(target, map, biome, biome === 'the-still' ? state.stillAtlas : state.biomeSceneryAtlas);
}

function drawRogueWallDepth(target) {
    target.save();
    for (const wall of state.walls || []) {
        target.fillStyle = 'rgba(0,0,0,.42)';
        target.fillRect(wall.x + 9, wall.y + 12, wall.w, wall.h);
    }
    target.restore();
}

function drawRogueWallHighlights(target) {
    target.save();
    for (const wall of state.walls || []) {
        const edge = target.createLinearGradient(wall.x, wall.y, wall.x, wall.y + Math.min(18, wall.h));
        edge.addColorStop(0, 'rgba(190,245,255,.34)');
        edge.addColorStop(1, 'rgba(0,243,255,0)');
        target.fillStyle = edge;
        target.fillRect(wall.x + 2, wall.y + 2, Math.max(0, wall.w - 4), Math.min(18, wall.h - 4));
        target.strokeStyle = 'rgba(3,8,12,.8)';
        target.lineWidth = 3;
        target.strokeRect(wall.x + 1.5, wall.y + 1.5, Math.max(0, wall.w - 3), Math.max(0, wall.h - 3));
    }
    target.restore();
}

function drawRogueWorldLighting(target, map) {
    if (!state.player) return;
    const cx = state.player.x + state.player.w / 2;
    const cy = state.player.y + state.player.h / 2;
    target.save();
    const shade = target.createRadialGradient(cx, cy, 90, cx, cy, 430);
    shade.addColorStop(0, 'rgba(0,0,0,0)');
    shade.addColorStop(.48, 'rgba(0,4,9,.08)');
    shade.addColorStop(1, 'rgba(0,2,7,.56)');
    target.fillStyle = shade;
    target.fillRect(0, 0, map.w, map.h);
    target.globalCompositeOperation = 'lighter';
    for (const actor of [state.player, ...(state.activeGhosts || []).filter(g => g?.isActive)]) {
        const x = actor.x + actor.w / 2;
        const y = actor.y + actor.h / 2;
        const glow = target.createRadialGradient(x, y, 0, x, y, actor === state.player ? 95 : 72);
        glow.addColorStop(0, actor === state.player ? 'rgba(255,125,20,.18)' : 'rgba(0,243,255,.16)');
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        target.fillStyle = glow;
        target.fillRect(x - 100, y - 100, 200, 200);
    }
    target.restore();
}

function drawRogueScreenVignette(target) {
    const vignette = target.createRadialGradient(VIEW_WIDTH / 2, VIEW_HEIGHT / 2, VIEW_HEIGHT * .18, VIEW_WIDTH / 2, VIEW_HEIGHT / 2, VIEW_WIDTH * .62);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(.72, 'rgba(0,0,0,.08)');
    vignette.addColorStop(1, 'rgba(0,2,7,.52)');
    target.save();
    target.fillStyle = vignette;
    target.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
    target.restore();
}

function drawVfx(target, image, cx, cy, size, { rotation = 0, alpha = 1, scaleX = 1, scaleY = 1 } = {}) {
    if (!image) return false;
    target.save();
    target.translate(cx, cy);
    target.rotate(rotation);
    target.scale(scaleX, scaleY);
    target.globalAlpha = alpha;
    target.drawImage(image, -size / 2, -size / 2, size, size);
    target.restore();
    return true;
}

function drawCombatArc(target, actor, color, alpha = 1) {
    const cx = actor.x + actor.w / 2;
    const cy = actor.y + actor.h / 2;
    const angle = Math.atan2(actor.facingY || 0, actor.facingX || 1);
    const active = attackIsActive(actor);
    const isEcho = actor !== state.player;
    if (active && drawVfx(target, isEcho ? state.vfxAtlas?.echoSwing : state.vfxAtlas?.playerSwing, cx, cy, (actor.attackRange || 48) * 2.35, {
        rotation: angle, alpha: alpha * (isEcho ? .68 : .9)
    })) return;
    target.save();
    target.globalAlpha = alpha * (active ? .95 : .38);
    target.strokeStyle = color;
    target.lineWidth = active ? 11 : 3;
    target.lineCap = 'round';
    target.shadowColor = color;
    target.shadowBlur = active ? 16 : 6;
    target.beginPath();
    target.arc(cx, cy, (actor.attackRange || 48) * .82, angle - .72, angle + .72);
    target.stroke();
    if (active) {
        target.globalAlpha *= .52;
        target.strokeStyle = '#fff4cf';
        target.lineWidth = 3;
        target.beginPath();
        target.arc(cx, cy, (actor.attackRange || 48) * .76, angle - .62, angle + .62);
        target.stroke();
        target.fillStyle = color;
        target.globalAlpha *= .7;
        target.beginPath();
        target.moveTo(cx + Math.cos(angle + .72) * (actor.attackRange || 48) * .82, cy + Math.sin(angle + .72) * (actor.attackRange || 48) * .82);
        target.lineTo(cx + Math.cos(angle + .92) * (actor.attackRange || 48) * .64, cy + Math.sin(angle + .92) * (actor.attackRange || 48) * .64);
        target.lineTo(cx + Math.cos(angle + .55) * (actor.attackRange || 48) * .62, cy + Math.sin(angle + .55) * (actor.attackRange || 48) * .62);
        target.closePath(); target.fill();
    }
    target.restore();
}

function draw() {
    // Popup demos no longer freeze the main canvas — live world always draws.
    syncCanvasResolution(canvas, ctx, VIEW_WIDTH, VIEW_HEIGHT);
    ctx.clearRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
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
    if (state.currentLevelMeta?.isRogue) drawRogueArenaBackdrop(ctx, map);
    else { ctx.fillStyle = '#10151c'; ctx.fillRect(0, 0, map.w, map.h); }
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
    if (!state.currentLevelMeta?.isRogue || state.rogueChamber?.riftOpen) state.deliveryZone.render(ctx);
    for (const mark of state.rogueChamber?.director?.telegraphs || []) {
        const p = mark.point;
        const u = 1 - mark.ticks / 45;
        drawVfx(ctx, state.vfxAtlas?.enemyWarning, p.x + 15, p.y + 15, 82 - u * 12, {
            rotation: state.currentTick * .006, alpha: .28 + u * .48, scaleY: .58
        });
        ctx.save();
        ctx.strokeStyle = `rgba(255,63,117,${0.35 + u * 0.6})`;
        ctx.lineWidth = 2 + u * 3;
        ctx.beginPath(); ctx.arc(p.x + 15, p.y + 15, 22 - u * 8, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = 'rgba(255,63,117,.12)'; ctx.fillRect(p.x, p.y, 30, 30);
        ctx.restore();
    }
    if (state.rogueChamber?.riftOpen && state.deliveryZone) {
        const z = state.deliveryZone;
        const pulse = 0.65 + Math.sin(state.currentTick * 0.15) * 0.2;
        drawVfx(ctx, state.vfxAtlas?.rift, z.x + z.w / 2, z.y + z.h / 2, Math.max(z.w, z.h) * 2.25, {
            rotation: state.currentTick * .004, alpha: .72 + pulse * .18
        });
        ctx.save();
        ctx.strokeStyle = `rgba(0,243,255,${pulse})`;
        ctx.fillStyle = 'rgba(72,30,130,.24)';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.ellipse(z.x + z.w / 2, z.y + z.h / 2, z.w * .36, z.h * .46, state.currentTick * .012, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#d8c7ff'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center';
        ctx.fillText('RIFT OPEN', z.x + z.w / 2, z.y - 8);
        ctx.restore();
    }
    for (const pk of (state.roguePickups || [])) {
        if (pk.collected) continue;
        const img = pk.type === 'sand_max' ? state.modernPropsAtlas?.sandMax : state.modernPropsAtlas?.sandRefill;
        const bob = Math.sin(state.currentTick * .08 + pk.x * .02) * 3;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const glow = ctx.createRadialGradient(pk.x + pk.w / 2, pk.y + pk.h / 2, 2, pk.x + pk.w / 2, pk.y + pk.h / 2, 36);
        glow.addColorStop(0, pk.type === 'sand_max' ? 'rgba(255,190,65,.38)' : 'rgba(48,231,255,.34)');
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow; ctx.fillRect(pk.x - 20, pk.y - 20, pk.w + 40, pk.h + 40);
        ctx.restore();
        if (!drawSprite(ctx, img, pk.x - 10, pk.y - 18, pk.w + 20, pk.h + 34, { valign: 'bottom', bob })) {
            ctx.save(); ctx.fillStyle = pk.type === 'sand_max' ? '#ffb347' : '#30e7ff'; ctx.globalAlpha = .9;
            ctx.beginPath(); ctx.arc(pk.x + pk.w / 2, pk.y + pk.h / 2, pk.w * .42, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        }
    }
    drawWires(ctx, collectWires(state.plates, state.doors, state.lasers), state.currentTick); (state.hints||[]).forEach(h => h.render(ctx));
    if (state.currentLevelMeta?.isRogue) drawRogueWallDepth(ctx);
    state.walls.forEach(w => w.render(ctx));
    if (state.currentLevelMeta?.isRogue) drawRogueWallHighlights(ctx);
    // Plates draw over beams so a plate under a laser column (W5-L4) stays readable.
    state.lasers.forEach(l => l.render(ctx)); drawShieldShadows(ctx); drawBeamFixtures(ctx); state.plates.forEach(p => p.render(ctx)); state.doors.forEach(d => { if (d.render.length > 1) d.render(ctx, state.currentTick); else d.render(ctx); });
    drawEchoEndMarkers(ctx);
    state.packages.forEach(p => p.render(ctx));
    state.activeGhosts.forEach(g => {
        g.render(ctx);
        if (rogueCombatActive() && attackIsActive(g)) {
            drawCombatArc(ctx, g, '#7df9ff', .72);
        }
    });

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
    if (state.ruptureFx?.ticks > 0) {
        const fx = state.ruptureFx;
        const u = 1 - fx.ticks / fx.max;
        const rendered = drawVfx(ctx, state.vfxAtlas?.rupture, fx.x, fx.y, (fx.radius || TIME_RUPTURE_RADIUS) * 2.25 * (0.45 + u * .55), {
            rotation: u * .35, alpha: .88 * (1 - u * .55)
        });
        ctx.save();
        ctx.globalAlpha = (rendered ? .3 : .75) * (1 - u * .65);
        ctx.strokeStyle = '#c8b7ff';
        ctx.fillStyle = 'rgba(110,100,150,.12)';
        ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(fx.x, fx.y, (fx.radius || TIME_RUPTURE_RADIUS) * (0.25 + u * .75), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.restore();
        fx.ticks--;
    }
    for (const image of state.blinkAfterimages || []) {
        const u = image.ticks / 20;
        const rendered = drawVfx(ctx, state.vfxAtlas?.blinkDeparture, image.x + image.w / 2, image.y + image.h / 2, 92, {
            alpha: .28 + u * .48, scaleY: .72 + u * .28
        });
        ctx.save();
        ctx.globalAlpha = rendered ? .16 : 0.2 + u * 0.45;
        ctx.strokeStyle = '#00f3ff';
        ctx.fillStyle = 'rgba(151,98,255,.24)';
        ctx.setLineDash([4, 4]);
        ctx.fillRect(image.x, image.y, image.w, image.h);
        ctx.strokeRect(image.x, image.y, image.w, image.h);
        ctx.restore();
    }
    if (rogueCombatActive() && state.player.attackTicks > 0) {
        drawCombatArc(ctx, state.player, attackIsActive(state.player) ? '#ffd65a' : '#00f3ff');
    }
    for (const effect of state.rogueWeaponEffects || []) {
        ctx.save();
        if (effect.kind === 'parcel') {
            ctx.fillStyle = '#ff9f43'; ctx.strokeStyle = '#fff2c2'; ctx.lineWidth = 2;
            ctx.fillRect(effect.x, effect.y, effect.w, effect.h); ctx.strokeRect(effect.x, effect.y, effect.w, effect.h);
        } else if (effect.kind === 'decoy') {
            ctx.globalAlpha = 0.75; ctx.fillStyle = '#00f3ff'; ctx.strokeStyle = '#ffffff';
            ctx.fillRect(effect.x, effect.y, effect.w, effect.h); ctx.strokeRect(effect.x, effect.y, effect.w, effect.h);
        } else if (effect.kind === 'cut') {
            ctx.globalAlpha = 0.55 + 0.25 * Math.sin(state.currentTick * 0.25);
            ctx.fillStyle = 'rgba(200,108,255,.35)'; ctx.strokeStyle = '#c86cff'; ctx.lineWidth = 3;
            ctx.fillRect(effect.x, effect.y, effect.w, effect.h); ctx.strokeRect(effect.x, effect.y, effect.w, effect.h);
        }
        ctx.restore();
    }
    
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
    if (state.failFx) {
        drawVfx(ctx, state.vfxAtlas?.enemyDissolve, state.failFx.cx, state.failFx.cy, 112, { alpha: Math.min(.82, state.failFx.ttl / state.failFx.max) });
        drawBurst(ctx, state.failFx);
    }
    if (state.rewindFx) {
        drawVfx(ctx, state.vfxAtlas?.rewind, state.rewindFx.cx, state.rewindFx.cy, 118, {
            rotation: (1 - state.rewindFx.ttl / state.rewindFx.max) * -.45,
            alpha: Math.min(.78, state.rewindFx.ttl / state.rewindFx.max)
        });
        drawBurst(ctx, state.rewindFx);
    }
    renderEchoFellFx(ctx);
    if (state.currentLevelMeta?.isRogue) drawRogueWorldLighting(ctx, map);
    if (state.gameState === 'EDITOR') drawEditorOverlay(ctx);

    ctx.restore();
    
    if (state.gameState === 'EDITOR') return;

    if (state.currentLevelMeta?.isRogue) drawRogueScreenVignette(ctx);

    drawAbilityCooldowns(ctx);

    if (state.alarmState && state.currentTick % 60 === 0) SFX.alarm();
    if (state.alarmState) { ctx.fillStyle = 'rgba(255, 0, 0, 0.15)'; ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT); }
    if (state.rewindFx && state.rewindFx.ttl > 0) {
        const u = state.rewindFx.ttl / state.rewindFx.max;
        ctx.fillStyle = `rgba(0, 243, 255, ${0.2 * u})`;
        ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
    }
    if (state.failTimer > 0) {
        const impact = state.failTimer > FAIL_HOLD_FRAMES - 8;
        const showText = state.failTimer <= FAIL_HOLD_FRAMES - FAIL_TEXT_DELAY;
        if (impact) {
            const flash = (state.failTimer - (FAIL_HOLD_FRAMES - 8)) / 8;
            ctx.fillStyle = `rgba(255, 220, 220, ${0.28 * flash})`;
            ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
        }
        ctx.fillStyle = showText ? 'rgba(255, 0, 0, 0.4)' : 'rgba(255, 40, 40, 0.16)';
        ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
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
    window.startRogueRun = () => startRogueRun();
    window.startRogueLedgerRun = () => startRogueLedgerRun();
    window.restartRogueRun = () => state.rogueRun?.ledgerEnabled ? startRogueLedgerRun() : startRogueRun();
    window.claimRogueUnlock = claimRogueUnlock;
    window.rogueShopItems = () => shopItems();
    window.syncRogueShop = syncRogueShop;
    window.buyRogueShop = (id) => {
        const m = buyRogueShop(id);
        if (m) { syncRogueHub(); syncRunOverUnlock(); window.syncRogueShop?.(); }
        return m;
    };
    window.openRogueHub = () => { syncRogueHub(); showSubMenu('rogue'); };
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
