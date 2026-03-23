import { state } from './state.js';

const AudioContext = window.AudioContext || window.webkitAudioContext;
export const audioCtx = new AudioContext();
const masterGain = audioCtx.createGain(); masterGain.gain.value = 0.3; masterGain.connect(audioCtx.destination);
const sfxGain = audioCtx.createGain(); sfxGain.gain.value = 1.0; sfxGain.connect(masterGain);

export function playTone(freq, type, duration, vol=0.5, slideFreq=null) {
    if (audioCtx.state === 'suspended') return;
    const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    if (slideFreq) osc.frequency.exponentialRampToValueAtTime(slideFreq, audioCtx.currentTime + duration);
    gain.gain.setValueAtTime(vol, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
    osc.connect(gain); gain.connect(sfxGain); osc.start(); osc.stop(audioCtx.currentTime + duration);
}

export const SFX = {
    interact: () => playTone(600, 'sine', 0.1, 0.3, 800),
    toss: () => playTone(300, 'triangle', 0.2, 0.4, 100),
    dash: () => playTone(800, 'square', 0.15, 0.3, 200),
    cloak: () => playTone(200, 'sine', 0.5, 0.4, 100),
    laserHit: () => playTone(150, 'sawtooth', 0.4, 0.5, 50),
    alarm: () => { playTone(800, 'square', 0.3, 0.2); setTimeout(()=>playTone(600, 'square', 0.3, 0.2), 300); },
    robotShoot: () => playTone(900, 'sawtooth', 0.2, 0.3, 400),
    fail: () => playTone(200, 'sawtooth', 1.0, 0.4, 50),
    win: () => { playTone(400, 'sine', 0.2, 0.3); setTimeout(()=>playTone(500, 'sine', 0.2, 0.3), 200); setTimeout(()=>playTone(600, 'sine', 0.4, 0.3), 400); },
    door: () => playTone(100, 'square', 0.1, 0.2, 50),
    droneAlert: () => {
        if(!audioCtx)return; let osc = audioCtx.createOscillator(); let g = audioCtx.createGain();
        osc.connect(g); g.connect(sfxGain);
        osc.frequency.setValueAtTime(800, audioCtx.currentTime); osc.frequency.exponentialRampToValueAtTime(1600, audioCtx.currentTime + 0.1);
        g.gain.setValueAtTime(0.3, audioCtx.currentTime); g.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
        osc.start(); osc.stop(audioCtx.currentTime + 0.2);
    },
    dronePursuit: () => {
        if(!audioCtx)return; let osc = audioCtx.createOscillator(); let g = audioCtx.createGain(); osc.type = 'sawtooth';
        osc.connect(g); g.connect(sfxGain);
        osc.frequency.setValueAtTime(400, audioCtx.currentTime);
        g.gain.setValueAtTime(0.1, audioCtx.currentTime); g.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        osc.start(); osc.stop(audioCtx.currentTime + 0.1);
    },
    droneScan: () => {
        if(!audioCtx)return; let osc = audioCtx.createOscillator(); let g = audioCtx.createGain(); osc.type = 'square';
        osc.connect(g); g.connect(sfxGain);
        osc.frequency.setValueAtTime(1000, audioCtx.currentTime); osc.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.15);
        g.gain.setValueAtTime(0.15, audioCtx.currentTime); g.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
        osc.start(); osc.stop(audioCtx.currentTime + 0.15);
    },
    dronePatrol: () => {
        if(!audioCtx)return; let osc = audioCtx.createOscillator(); let g = audioCtx.createGain(); osc.type = 'sine';
        osc.connect(g); g.connect(sfxGain);
        osc.frequency.setValueAtTime(200, audioCtx.currentTime);
        g.gain.setValueAtTime(0.1, audioCtx.currentTime); g.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
        osc.start(); osc.stop(audioCtx.currentTime + 0.2);
    }
};

export const menuMusic = new Audio('assets/Time-Loop Atrium.mp3');
menuMusic.loop = true; menuMusic.volume = 0.5;

export const track1 = new Audio('assets/Circuit Ghost.mp3');
track1.loop = true; track1.volume = 0.4;

export const track2 = new Audio('assets/Optimal Pathways.mp3');
track2.loop = true; track2.volume = 0.4;

export const trackBoss = new Audio("assets/Chronomancer's Grid.mp3");
trackBoss.loop = true; trackBoss.volume = 0.5;

let currentTrack = null;

export function playMenuMusic() {
    if (currentTrack === menuMusic && !menuMusic.paused) return; // Already playing
    stopMusic();
    currentTrack = menuMusic;
    currentTrack.play().catch(e => console.warn("Audio Context blocked: ", e));
}

export function startMusic() {
    let nextTrack;
    if (state.currentLevelMeta?.isBoss) nextTrack = trackBoss;
    else if (state.currentLevelIndex <= 5) nextTrack = track1;  // Levels 1 through 6
    else nextTrack = track2;                                    // Levels 7 through 12

    if (currentTrack === nextTrack && !currentTrack.paused) return; // Already playing correctly
    
    stopMusic();
    currentTrack = nextTrack;
    currentTrack.play().catch(e => console.warn("Audio Context blocked: ", e));
}

export function stopMusic() {
    if (currentTrack && !currentTrack.paused) currentTrack.pause();
}

export function scheduleMusic() {
    // Nullified procedural generator placeholder. Real audio controls loop natively.
}
