import { state, getCredits, getPlayerRank, saveState, getUnlockedAbilities, isDevMode, applyDevModeUi } from '../core/state.js';
import { LEVELS, WORLDS, getShopUnlockedAbilities } from '../data/levels.js';
import { startGame } from '../main.js';
import { playMenuMusic, setGlobalMute, setDialogVoiceEnabled, setDialogVolume, setMusicVolume, applyAudioSettings, getDialogVoiceStatus, playDialogVoicePreview, preloadDialogVoice } from '../core/audio.js';

export function showSubMenu(menuId) {
    document.getElementById('tutorial-prompt')?.classList.add('hidden');
    document.getElementById('main-menu-nav').classList.add('hidden');
    document.getElementById('sub-levels').classList.add('hidden');
    document.getElementById('sub-tutorials')?.classList.add('hidden');
    document.getElementById('sub-shop').classList.add('hidden');
    document.getElementById('sub-settings').classList.add('hidden');
    if (menuId === 'main') document.getElementById('main-menu-nav').classList.remove('hidden');
    else document.getElementById('sub-' + menuId).classList.remove('hidden');
    const title = document.getElementById('title-screen');
    title.classList.toggle('submenu-open', menuId !== 'main');
    title.classList.toggle('settings-open', menuId === 'settings');
    if (menuId === 'settings') title.scrollTop = 0;
}

export function updateHUD() {
    let hud = document.querySelector('.bottom-hud');
    if (!hud) return;
    document.getElementById('touch-btn-dash')?.classList.add('hidden');
    document.getElementById('touch-btn-toss')?.classList.add('hidden');
    document.getElementById('touch-btn-cloak')?.classList.add('hidden');
    let html = `<div class="controls-hint" style="margin-bottom: 10px;">
                    <kbd>WASD</kbd> Move &nbsp;|&nbsp; <kbd>SPACE</kbd> Pick/Drop &nbsp;|&nbsp; 
                    <kbd>R</kbd> Reset Loop &nbsp;|&nbsp; <kbd>Q</kbd> Restart Level &nbsp;|&nbsp; <kbd>ESC</kbd> Menu
                </div>`;
    let unlocked = getUnlockedAbilities();
    let abilities = [];
    if (unlocked.includes('dash')) { abilities.push(`<kbd>SHIFT</kbd> Dash`); document.getElementById('touch-btn-dash')?.classList.remove('hidden'); }
    if (unlocked.includes('toss')) { abilities.push(`<kbd>F</kbd> Toss Package`); document.getElementById('touch-btn-toss')?.classList.remove('hidden'); }
    if (unlocked.includes('cloak')) { abilities.push(`<kbd>C</kbd> Camera Cloak`); document.getElementById('touch-btn-cloak')?.classList.remove('hidden'); }
    if (unlocked.includes('ghostShield')) { abilities.push(`Echo Shield Front`); }
    if (abilities.length > 0) {
        html += `<div class="controls-hint" style="color: #ffdd00;">` + abilities.join(' &nbsp;|&nbsp; ') + `</div>`;
    }
    hud.innerHTML = html;
}

export function refreshLevelSelectGrid() {
    const uiLevelGrid = document.getElementById('level-select-grid');
    if (!uiLevelGrid) return;
    uiLevelGrid.innerHTML = '';

    const placed = new Set();
    const appendLevelButton = (lvl, idx) => {
        let unlocked = isDevMode() || idx <= state.maxUnlockedLevel || !!lvl.isPendingCampaign;
        let btn = document.createElement('button');
        btn.className = unlocked ? 'level-btn unlocked' : 'level-btn locked';
        btn.type = 'button';
        btn.disabled = !unlocked;

        let hasGold = state.challengesCompleted[idx] === true;
        if (hasGold) btn.classList.add('gold-star');
        const label = lvl.isPendingCampaign ? lvl.name : `Level ${idx + 1}`;
        btn.innerHTML = `${levelSelectIconHtml(unlocked, hasGold)}<span class="level-num">${label}</span>`;
        btn.setAttribute('aria-label', hasGold
            ? `${label}, gold star challenge complete`
            : unlocked ? label : `${label}, locked`);
        if (hasGold) btn.title = 'Gold star challenge complete';
        else if (!unlocked) btn.title = 'Locked';
        else if (lvl.challenge?.desc) btn.title = `Par: ${lvl.challenge.desc}`;
        if (unlocked) btn.onclick = () => startGame(idx);
        uiLevelGrid.appendChild(btn);
    };

    for (const world of WORLDS) {
        const header = document.createElement('div');
        header.className = 'world-header';
        header.textContent = `World ${world.id} — ${world.name}`;
        uiLevelGrid.appendChild(header);
        for (const idx of world.levels) {
            const lvl = LEVELS[idx];
            if (!lvl || lvl.isTutorial || lvl.isSandbox) continue;
            placed.add(idx);
            appendLevelButton(lvl, idx);
        }
    }

    let pendingHeader = false;
    LEVELS.forEach((lvl, idx) => {
        if (lvl.isTutorial || lvl.isSandbox || placed.has(idx)) return;
        if (lvl.isPendingCampaign && !pendingHeader) {
            pendingHeader = true;
            const header = document.createElement('div');
            header.className = 'world-header';
            header.textContent = 'Subfloor routes (pending campaign order)';
            uiLevelGrid.appendChild(header);
        }
        appendLevelButton(lvl, idx);
    });
}

export function initMenu() {
    applyDevModeUi();
    document.getElementById('title-screen').classList.remove('hidden');
    document.getElementById('app-layout').classList.add('hidden');
    document.getElementById('level-complete').classList.add('hidden');
    document.getElementById('game-over').classList.add('hidden');
    showSubMenu('main');
    
    let uiTutorialGrid = document.getElementById('tutorial-select-grid');
    if (uiTutorialGrid) uiTutorialGrid.innerHTML = '';
    
    let rankData = ["Junior Courier", "Route Courier", "Security Courier", "Temporal Courier", "Loopmaster"];
    let displayRank = rankData[getPlayerRank()] || "Senior Courier";
    document.getElementById('player-rank-display').innerText = `Rank: ${displayRank}`;
    document.getElementById('credits-display').innerText = getCredits();
    document.getElementById('voice-dialog-checkbox').checked = state.audioSettings.dialogVoiceEnabled !== false;
    document.getElementById('dialog-volume-slider').value = Math.round((state.audioSettings.dialogVolume ?? 0.8) * 100);
    document.getElementById('dialog-volume-value').innerText = `${Math.round((state.audioSettings.dialogVolume ?? 0.8) * 100)}%`;
    document.getElementById('music-volume-slider').value = Math.round((state.audioSettings.musicVolume ?? 0.8) * 100);
    document.getElementById('music-volume-value').innerText = `${Math.round((state.audioSettings.musicVolume ?? 0.8) * 100)}%`;
    document.getElementById('global-audio-toggle-btn').innerText = state.audioSettings.muted ? 'Unmute Audio' : 'Mute Audio';
    document.getElementById('voice-engine-status').innerText = getDialogVoiceStatus();

    let hudAudioBtn = document.getElementById('hud-audio-toggle-btn');
    if (hudAudioBtn) {
        hudAudioBtn.classList.toggle('muted', state.audioSettings.muted);
        hudAudioBtn.title = state.audioSettings.muted ? 'Unmute audio' : 'Mute audio';
        hudAudioBtn.setAttribute('aria-label', state.audioSettings.muted ? 'Unmute audio' : 'Mute audio');
    }
    
    playMenuMusic();
    applyAudioSettings();
    refreshVoiceEngineStatus();
    preloadDialogVoice().finally(() => refreshVoiceEngineStatus());
    
    refreshLevelSelectGrid();
    refreshShopButtons();
    
    function updateSuitButtons() {
        document.querySelectorAll('.suit-btn').forEach((btn) => {
            let col = btn.getAttribute('data-color');
            if (col === state.playerColor) {
                btn.style.border = `2px solid ${col}`;
                btn.style.boxShadow = `0 0 15px ${col}`;
            } else {
                btn.style.border = '1px solid #444';
                btn.style.boxShadow = 'none';
            }
        });
    }

    document.querySelectorAll('.suit-btn').forEach((btn, index) => {
        btn.onclick = () => {
            if (getPlayerRank() >= index) { state.playerColor = btn.getAttribute('data-color'); saveState(); updateSuitButtons(); }
        };
        if (getPlayerRank() >= index) { btn.style.opacity = '1'; btn.style.cursor = 'pointer'; btn.innerHTML = ''; }
        else { btn.style.opacity = '0.4'; btn.style.cursor = 'not-allowed'; btn.innerHTML = 'LOCK'; btn.style.fontSize = '10px'; btn.style.lineHeight = '35px'; }
    });
    updateSuitButtons();

    document.getElementById('voice-dialog-checkbox').onchange = (e) => {
        setDialogVoiceEnabled(e.target.checked);
        saveState();
        document.getElementById('voice-engine-status').innerText = getDialogVoiceStatus();
    };
    document.getElementById('dialog-volume-slider').oninput = (e) => {
        let volume = parseInt(e.target.value, 10) / 100;
        setDialogVolume(volume);
        document.getElementById('dialog-volume-value').innerText = `${Math.round(volume * 100)}%`;
        saveState();
    };
    document.getElementById('music-volume-slider').oninput = (e) => {
        let volume = parseInt(e.target.value, 10) / 100;
        setMusicVolume(volume);
        document.getElementById('music-volume-value').innerText = `${Math.round(volume * 100)}%`;
        saveState();
    };
    document.getElementById('voice-test-btn').onclick = (e) => {
        playDialogVoicePreview();
        window.setTimeout(() => {
            document.getElementById('voice-engine-status').innerText = getDialogVoiceStatus();
        }, 50);
        e.currentTarget.blur();
    };
    document.getElementById('global-audio-toggle-btn').onclick = (e) => {
        setGlobalMute(!state.audioSettings.muted);
        saveState();
        syncMuteButtons();
        e.currentTarget.blur();
    };
    if (hudAudioBtn) {
        hudAudioBtn.onclick = (e) => {
            setGlobalMute(!state.audioSettings.muted);
            saveState();
            hudAudioBtn.classList.toggle('muted', state.audioSettings.muted);
            hudAudioBtn.title = state.audioSettings.muted ? 'Unmute audio' : 'Mute audio';
            hudAudioBtn.setAttribute('aria-label', state.audioSettings.muted ? 'Unmute audio' : 'Mute audio');
            e.currentTarget.blur();
        };
    }
}

export function refreshShopButtons() {
    const devShop = isDevMode();
    const shopUnlocked = getShopUnlockedAbilities(state.maxUnlockedLevel);
    const configureShopButton = (btn, abilityId, label, price) => {
        if (!btn) return;
        if (state.abilitiesPurchased[abilityId]) {
            btn.innerText = `${label} (OWNED)`;
            btn.style.opacity = '0.5';
            btn.disabled = true;
        } else if (!devShop && !shopUnlocked.includes(abilityId)) {
            const world = WORLDS.find(w => w.unlocks.includes(abilityId));
            btn.innerText = world ? `${label} (LOCKED — World ${world.id})` : `${label} (LOCKED)`;
            btn.style.opacity = '0.4';
            btn.disabled = true;
        } else {
            btn.innerText = `${label} ($${price})`;
            btn.style.opacity = '1';
            btn.disabled = false;
        }
        btn.onclick = () => { if (getCredits() >= price) { state.abilitiesPurchased[abilityId] = true; saveState(); initMenu(); } };
    };
    configureShopButton(document.getElementById('shop-dash'), 'dash', 'DASH', 150);
    configureShopButton(document.getElementById('shop-toss'), 'toss', 'TOSS', 150);
    configureShopButton(document.getElementById('shop-cloak'), 'cloak', 'CLOAK', 200);
    configureShopButton(document.getElementById('shop-ghost-shield'), 'ghostShield', 'ECHO SHIELD', 200);
}

function refreshVoiceEngineStatus() {
    const el = document.getElementById('voice-engine-status');
    if (el) el.innerText = getDialogVoiceStatus();
}

function syncMuteButtons() {
    const muted = !!state.audioSettings.muted;
    const settingsBtn = document.getElementById('global-audio-toggle-btn');
    if (settingsBtn) settingsBtn.innerText = muted ? 'Unmute Audio' : 'Mute Audio';
    const hudAudioBtn = document.getElementById('hud-audio-toggle-btn');
    if (hudAudioBtn) {
        hudAudioBtn.classList.toggle('muted', muted);
        hudAudioBtn.title = muted ? 'Unmute audio' : 'Mute audio';
        hudAudioBtn.setAttribute('aria-label', muted ? 'Unmute audio' : 'Mute audio');
    }
}

function levelSelectIconHtml(unlocked, hasGold) {
    if (!unlocked) return '<span class="level-lock" aria-hidden="true">🔒</span>';
    if (hasGold) return '<span class="level-star" aria-hidden="true">⭐</span>';
    return '<span class="level-star-slot" aria-hidden="true"></span>';
}
