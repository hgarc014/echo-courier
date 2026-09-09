import { state, saveState, getUnlockedAbilities, getPlayerRank } from './core/state.js';
import { keys, prevKeys, isKeyJustPressed, updatePrevKeys, initTouchControls, syncTouchUi, getMoveVector, consumeKey } from './core/input.js';
import { audioCtx, startMusic, scheduleMusic, SFX, playMenuMusic, speakDialog, stopDialogSpeech, unlockAudio, preloadDialogVoice } from './core/audio.js';
import { AABB, checkWallCollision, getDashDestination } from './core/physics.js';
import { getLevelSetup, LEVELS, deserializeLevel, CAMPAIGN_LEVEL_COUNT, TUTORIAL_LEVEL_INDICES, TUTORIAL_LEVEL_START } from './data/levels.js';
import { Ghost, PlayerEntity } from './entities/actors.js';
import { initMenu, showSubMenu, updateHUD } from './ui/menu.js';
import { initEditor, drawEditorOverlay } from './ui/editor.js';
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
    if (levelDef.isTutorial) return `T${levelDef.tutorialNumber}`;
    return `${levelIndex + 1}`;
}

function getNextLevelIndex(levelIndex) {
    const level = LEVELS[levelIndex];
    if (!level) return null;
    if (level.isTutorial) {
        const tutorialPos = TUTORIAL_LEVEL_INDICES.indexOf(levelIndex);
        return tutorialPos >= 0 && tutorialPos < TUTORIAL_LEVEL_INDICES.length - 1 ? TUTORIAL_LEVEL_INDICES[tutorialPos + 1] : null;
    }
    return levelIndex < CAMPAIGN_LEVEL_COUNT - 1 ? levelIndex + 1 : null;
}

function checkProjectedWallCollision(x, y, w, h, walls) {
    return walls.some(wall => AABB(x, y, w, h, wall.x, wall.y, wall.w, wall.h));
}

function buildProjectedEchoPath(runData) {
    if (!runData || runData.length === 0 || !state.player) return null;

    const firstStep = runData[0];
    let preview = {
        x: firstStep.x,
        y: firstStep.y,
        w: state.player.w,
        h: state.player.h,
        facingX: firstStep.facingX || 1,
        facingY: firstStep.facingY || 0
    };
    let points = [{ x: preview.x, y: preview.y }];

    for (let i = 1; i < runData.length; i++) {
        const step = runData[i];
        if (!step) continue;

        preview.facingX = step.facingX || preview.facingX || 1;
        preview.facingY = step.facingY || preview.facingY || 0;

        if (step.dash) {
            let dest = getDashDestination(preview.x, preview.y, preview.facingX, preview.facingY, 120, preview.w, preview.h);
            preview.x = dest.x;
            preview.y = dest.y;
        }

        let speed = 4;
        for (let z of state.statics) {
            if (AABB(preview.x, preview.y, preview.w, preview.h, z.x, z.y, z.w, z.h)) {
                speed = 2;
                break;
            }
        }

        let envVx = 0;
        let envVy = 0;
        for (let w of state.winds) {
            if (AABB(preview.x, preview.y, preview.w, preview.h, w.x, w.y, w.w, w.h)) {
                envVx += w.vx;
                envVy += w.vy;
            }
        }

        let moveX = step.moveX || 0;
        let moveY = step.moveY || 0;
        let magnitude = Math.hypot(moveX, moveY);
        if (magnitude > 1) {
            moveX /= magnitude;
            moveY /= magnitude;
        }

        let dx = envVx + moveX * speed;
        let dy = envVy + moveY * speed;

        if (!checkProjectedWallCollision(preview.x + dx, preview.y, preview.w, preview.h, state.walls)) {
            preview.x += dx;
        }
        if (!checkProjectedWallCollision(preview.x, preview.y + dy, preview.w, preview.h, state.walls)) {
            preview.y += dy;
        }

        points.push({ x: preview.x, y: preview.y });
    }

    const visiblePoints = points.slice(-PROJECTED_TRAIL_FRAMES);

    return {
        points: visiblePoints,
        final: preview
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
    if (level.isTutorial) {
        el.innerText = 'TRAINING MODULE';
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

export function startGame(levelIndex) {
    unlockAudio();
    preloadDialogVoice().catch(() => {});
    if (levelIndex >= LEVELS.length) { 
        showGameComplete();
        return; 
    }
    state.currentLevelIndex = levelIndex;
    state.currentLevelMeta = LEVELS[levelIndex];
    state.pendingBossIntro = state.currentLevelMeta?.bossIntro || null;
    startMusic();
    let maxLoops = LEVELS[levelIndex].maxGhosts + 1;
    document.getElementById('max-loops').innerText = maxLoops;
    let lv = LEVELS[levelIndex];
    state.levelAbilityOverrides = [...(lv.grants || [])];
    state.robots = []; state.projectiles = [];
    document.getElementById('level-display').innerText = getLevelDisplayLabel(levelIndex, lv); document.getElementById('objective-text').innerText = localizeControlHints(lv.obj); 
    
    let setupData = getLevelSetup(levelIndex);
    Object.assign(state, setupData);
    
    state.player.facingX=1; state.player.facingY=0; state.player.cloakTimer=0; state.player.dashCooldown=0;
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
    }
}

export function resetRun() {
    if (state.currentTick > 0) state.pastRuns.push([...state.currentRun]);
    state.currentRun = []; state.currentTick = 0; state.failTimer=0; state.failMessage=""; state.alarmState = false;
    clearLoopFx();
    if (LEVELS[state.currentLevelIndex].maxGhosts && state.pastRuns.length > LEVELS[state.currentLevelIndex].maxGhosts) state.pastRuns.shift();
    
    let setupData = getLevelSetup(state.currentLevelIndex);
    Object.assign(state, setupData);
    
    state.player.facingX=1; state.player.facingY=0; state.player.cloakTimer=0; state.player.dashCooldown=0;
    if (state.currentLevelMeta?.isBoss) engageBossEncounter(state.currentLevelMeta);
    state.activeGhosts = state.pastRuns.map((r, i) => new Ghost(i, r));
    document.getElementById('loop-count').innerText = state.pastRuns.length;
    updateDeliveryProgressUI();
    beginRewindJuice();
}

export function restartLevel() {
    let lv = LEVELS[state.currentLevelIndex];
    if (!lv) return;
    state.currentLevelMeta = lv;
    state.levelAbilityOverrides = [...(lv.grants || [])];
    let setupData = getLevelSetup(state.currentLevelIndex);
    Object.assign(state, setupData);
    state.player.facingX = 1; state.player.facingY = 0; state.player.cloakTimer = 0; state.player.dashCooldown = 0;
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
export function returnToMenu() { stopDialogSpeech(); state.gameState = 'MENU'; initMenu(); }

function update() {
    scheduleMusic();
    if (state.gameState === 'DIALOG') {
        if (isKeyJustPressed('esc')) { returnToMenu(); updatePrevKeys(); return; }
        // SPACE is reserved for GRAB; dialog advances on Enter / overlay tap / CONTINUE.
        if (isKeyJustPressed('enter')) {
            startMusic();
            hideLevelDialog();
            if (state.pendingBossIntro) startBossIntro(state.currentLevelMeta);
            else state.gameState = 'PLAYING';
            updatePrevKeys();
            consumeDialogConfirmKeys();
            return;
        }
        updatePrevKeys(); return;
    }
    if (state.gameState === 'BOSS_INTRO') {
        if (isKeyJustPressed('esc')) { returnToMenu(); updatePrevKeys(); return; }
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
    if (state.gameState !== 'PLAYING') { updatePrevKeys(); return; }

    tickLoopFx();
    
    if (state.failTimer > 0) {
        state.failTimer--;
        for (const p of state.packages) if (p.breakFx) p.update();
        if (state.failTimer === 0) resetRun();
        updatePrevKeys();
        return;
    }
    if (isKeyJustPressed('esc')) { returnToMenu(); return; }
    if (isKeyJustPressed('q')) { restartLevel(); updatePrevKeys(); return; }
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

    state.alarmState = false; state.cameras.forEach(c => c.update(state.player, state.packages));
    state.robots.forEach(r => r.update(state.player, state.activeGhosts, state.walls));
    for (let p of state.projectiles) {
        let fail = p.update(state.walls, state.activeGhosts, state.player, state.packages);
        if (fail) { levelFailed(fail); return; }
    }
    state.projectiles = state.projectiles.filter(p => p.active);

    let unlocked = getUnlockedAbilities();
    let hasDash = unlocked.includes('dash'); let hasToss = unlocked.includes('toss'); let hasCloak = unlocked.includes('cloak');

    let interactJustPressed = isKeyJustPressed('space');
    let tossJustPressed = hasToss && isKeyJustPressed('f');
    let dashJustPressed = hasDash && isKeyJustPressed('shift');
    let cloakJustPressed = hasCloak && isKeyJustPressed('c');

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
        }
    }
    if (state.player.dashCooldown > 0) state.player.dashCooldown--;
    state.dashTrails.forEach(t => t.life -= 0.1);
    state.dashTrails = state.dashTrails.filter(t => t.life > 0);

    let noiseSources = [];
    if (interactJustPressed || tossJustPressed) noiseSources.push({x: state.player.x, y: state.player.y});
    for(let g of state.activeGhosts) {
        let stateIndex = Math.floor(g.localTick); 
        if (stateIndex < g.runData.length && (g.runData[stateIndex].interact || g.runData[stateIndex].toss)) noiseSources.push({x: g.x, y: g.y});
    }

    for(let d of state.drones) { let fail = d.update(state.player, noiseSources); if (fail) { levelFailed(fail); return; } }

    state.plates.forEach(plate => {
        plate.update(allActors, state.packages);
        state.doors.filter(d => d.id === plate.linkedIds[0]).forEach(d => d.isOpen = plate.isPressed);
        state.lasers.filter(l => plate.linkedIds[0] === l.id).forEach(l => l.isOpen = plate.isPressed);
    });

    for(let g of state.guards) { let fail = g.update(state.player, state.activeGhosts); if (fail) { levelFailed(fail); return; } }
    for(let c of state.cracks) { let fail = c.update(allActors); if (fail) { levelFailed(fail); return; } }
    
    let envVx = 0, envVy = 0;
    for(let w of state.winds) if (AABB(state.player.x, state.player.y, state.player.w, state.player.h, w.x, w.y, w.w, w.h)) { envVx += w.vx; envVy += w.vy; }

    const baseSpeed = 4;
    let carried = state.packages.find(p => p.carriedBy === 'player');
    let currentSpeed = (carried && carried.type === 'heavy') ? baseSpeed * 0.5 : baseSpeed;

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

    if (tossJustPressed && carried) {
        SFX.toss();
        const fx = state.player.facingX || 0;
        const fy = state.player.facingY || 0;
        carried.carriedBy = null;
        carried.onToss(fx, fy);
        noiseSources.push({x: state.player.x, y: state.player.y}); state.runStats.tosses++;
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
                    r.hp--; r.hitFlicker = 30; SFX.laserHit();
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
    
    if (allDelivered && state.gameState === 'PLAYING') { 
        SFX.win(); state.gameState = 'LEVEL_COMPLETE'; uiLevelComplete.classList.remove('hidden'); 
        let chalMsg = document.getElementById('challenge-result');
        if (state.currentLevelMeta?.isTutorial) {
            state.tutorialProgress[state.currentLevelIndex] = true;
            saveState();
            if (chalMsg) { chalMsg.innerHTML = "Tutorial complete. You can replay this module any time from TRAINING."; chalMsg.style.color = '#00f3ff'; }
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
        }
        let nextIndex = getNextLevelIndex(state.currentLevelIndex);
        let nextBtn = document.getElementById('next-level-btn');
        nextBtn.innerText = state.currentLevelMeta?.isTutorial
            ? (nextIndex !== null ? "NEXT TUTORIAL" : "RETURN TO MENU")
            : (nextIndex !== null ? "NEXT LEVEL" : "FINISH SHIFT");
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
        toss: tossJustPressed,
        dash: dashJustPressed
    });
    state.currentTick++; updatePrevKeys();
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
    ctx.save();
    ctx.translate(shakeX, shakeY);

    state.statics.forEach(s => s.render(ctx)); state.winds.forEach(w => w.render(ctx)); state.cracks.forEach(c => c.render(ctx));
    state.deliveryZone.render(ctx); state.plates.forEach(p => p.render(ctx)); state.walls.forEach(w => w.render(ctx));
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
    state.cameras.forEach(c => c.render(ctx)); state.drones.forEach(d => d.render(ctx));
    if (state.failFx) drawBurst(ctx, state.failFx);
    if (state.rewindFx) drawBurst(ctx, state.rewindFx);

    ctx.restore();
    
    if (state.gameState === 'EDITOR') { drawEditorOverlay(ctx); return; }

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
        document.getElementById('title-screen').classList.add('hidden');
        document.getElementById('app-layout').classList.remove('hidden');
        document.getElementById('editor-overlay').classList.remove('hidden');
        document.getElementById('level-complete').classList.add('hidden');
        document.querySelector('.top-hud').classList.add('hidden');
        document.querySelector('.bottom-hud').classList.add('hidden');
        document.getElementById('mobile-controls')?.classList.add('hidden');
        state.resetRunData();
        
        if (jsonString) {
            let customSetup = deserializeLevel(JSON.parse(jsonString));
            Object.assign(state, customSetup);
        } else if (levelIndex !== null) {
            let setupData = getLevelSetup(levelIndex);
            Object.assign(state, setupData);
        } else {
            let customSetup = deserializeLevel({});
            Object.assign(state, customSetup);
        }
        
        if (!state.player) state.player = new PlayerEntity(50, 50, 30, 30, 'player');
    };

    window.showSubMenu = showSubMenu;
    window.startGame = startGame;
    window.restartLevel = restartLevel;
    window.initMenu = initMenu;
    window.returnToMenu = returnToMenu;
    
    document.getElementById('open-editor-btn').onclick = () => window.startEditorMode();
    document.getElementById('dev-mode-checkbox').onchange = () => initMenu();
    
    document.getElementById('next-level-btn').onclick = () => {
        let nextIndex = getNextLevelIndex(state.currentLevelIndex);
        if (nextIndex !== null) startGame(nextIndex);
        else if (state.currentLevelMeta?.isTutorial) initMenu();
        else showGameComplete();
    };
    document.getElementById('reset-save-btn').onclick = () => { localStorage.clear(); location.reload(); };
    
    document.body.addEventListener('click', () => {
        unlockAudio();
        if (state.gameState === 'MENU' || state.gameState === 'GAME_COMPLETE') playMenuMusic();
    });
    

    
    initMenu(); 
    requestAnimationFrame(loop);
};
