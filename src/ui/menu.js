import { state, getCredits, getPlayerRank, saveState, getUnlockedAbilities } from '../core/state.js';
import { LEVELS, TUTORIAL_LEVEL_INDICES } from '../data/levels.js';
import { startGame } from '../main.js';
import { playMenuMusic, setGlobalMute, setDialogVoiceEnabled, setDialogVolume, setMusicVolume, applyAudioSettings, getDialogVoiceStatus, playDialogVoicePreview, preloadDialogVoice } from '../core/audio.js';

export function showSubMenu(menuId) {
    document.getElementById('tutorial-prompt').classList.add('hidden');
    document.getElementById('main-menu-nav').classList.add('hidden');
    document.getElementById('sub-levels').classList.add('hidden');
    document.getElementById('sub-tutorials').classList.add('hidden');
    document.getElementById('sub-shop').classList.add('hidden');
    document.getElementById('sub-settings').classList.add('hidden');
    if (menuId === 'main') document.getElementById('main-menu-nav').classList.remove('hidden');
    else document.getElementById('sub-' + menuId).classList.remove('hidden');
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

export function initMenu() {
    document.getElementById('title-screen').classList.remove('hidden');
    document.getElementById('app-layout').classList.add('hidden');
    document.getElementById('level-complete').classList.add('hidden');
    document.getElementById('game-over').classList.add('hidden');
    showSubMenu('main');
    
    let uiLevelGrid = document.getElementById('level-select-grid');
    uiLevelGrid.innerHTML = '';
    let uiTutorialGrid = document.getElementById('tutorial-select-grid');
    uiTutorialGrid.innerHTML = '';
    
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
    preloadDialogVoice().catch(() => {});
    
    LEVELS.forEach((lvl, idx) => {
        if (lvl.isTutorial) return;
        let isDev = document.getElementById('dev-mode-checkbox').checked;
        let unlocked = isDev || idx <= state.maxUnlockedLevel;
        let btn = document.createElement('button');
        btn.className = unlocked ? 'level-btn unlocked' : 'level-btn locked';
        
        let hasGold = state.challengesCompleted[idx] === true;
        let iconHtml = lockedHtml(unlocked, hasGold);
        
        btn.innerHTML = `${iconHtml} Level ${idx + 1}`;
        if (unlocked) btn.onclick = () => startGame(idx);
        uiLevelGrid.appendChild(btn);
    });

    TUTORIAL_LEVEL_INDICES.forEach((idx) => {
        let lvl = LEVELS[idx];
        let btn = document.createElement('button');
        btn.className = 'level-btn unlocked';
        btn.innerHTML = `Tutorial ${lvl.tutorialNumber}: ${lvl.name.replace(/^Tutorial \d+:\s*/, '')}`;
        btn.onclick = () => startGame(idx);
        uiTutorialGrid.appendChild(btn);
    });
    
    let shopDash = document.getElementById('shop-dash');
    if (state.abilitiesPurchased['dash']) { shopDash.innerText = 'DASH (OWNED)'; shopDash.style.opacity = '0.5'; shopDash.disabled = true; }
    else { shopDash.innerText = 'DASH ($150)'; shopDash.style.opacity = '1'; shopDash.disabled = false; }
    shopDash.onclick = () => { if (getCredits() >= 150) { state.abilitiesPurchased['dash'] = true; saveState(); initMenu(); } };
    
    let shopToss = document.getElementById('shop-toss');
    if (state.abilitiesPurchased['toss']) { shopToss.innerText = 'TOSS (OWNED)'; shopToss.style.opacity = '0.5'; shopToss.disabled = true; }
    else { shopToss.innerText = 'TOSS ($150)'; shopToss.style.opacity = '1'; shopToss.disabled = false; }
    shopToss.onclick = () => { if (getCredits() >= 150) { state.abilitiesPurchased['toss'] = true; saveState(); initMenu(); } };
    
    let shopCloak = document.getElementById('shop-cloak');
    if (state.abilitiesPurchased['cloak']) { shopCloak.innerText = 'CLOAK (OWNED)'; shopCloak.style.opacity = '0.5'; shopCloak.disabled = true; }
    else { shopCloak.innerText = 'CLOAK ($200)'; shopCloak.style.opacity = '1'; shopCloak.disabled = false; }
    shopCloak.onclick = () => { if (getCredits() >= 200) { state.abilitiesPurchased['cloak'] = true; saveState(); initMenu(); } };

    let shopGhostShield = document.getElementById('shop-ghost-shield');
    if (state.abilitiesPurchased['ghostShield']) { shopGhostShield.innerText = 'ECHO SHIELD (OWNED)'; shopGhostShield.style.opacity = '0.5'; shopGhostShield.disabled = true; }
    else { shopGhostShield.innerText = 'ECHO SHIELD ($200)'; shopGhostShield.style.opacity = '1'; shopGhostShield.disabled = false; }
    shopGhostShield.onclick = () => { if (getCredits() >= 200) { state.abilitiesPurchased['ghostShield'] = true; saveState(); initMenu(); } };
    
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
    document.getElementById('global-audio-toggle-btn').onclick = () => {
        setGlobalMute(!state.audioSettings.muted);
        saveState();
        document.getElementById('global-audio-toggle-btn').blur();
        initMenu();
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

function lockedHtml(unlocked, hasGold) {
    if (!unlocked) return 'LOCK';
    if (hasGold) return 'STAR';
    return '';
}
