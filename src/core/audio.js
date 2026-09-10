import { state } from './state.js';
import { DIALOG_VOICE_CLIPS } from '../data/dialogVoiceManifest.js';

const AudioContext = window.AudioContext || window.webkitAudioContext;
export const audioCtx = new AudioContext();
const masterGain = audioCtx.createGain(); masterGain.gain.value = 0.3; masterGain.connect(audioCtx.destination);
const sfxGain = audioCtx.createGain(); sfxGain.gain.value = 1.0; sfxGain.connect(masterGain);
const BASE_MASTER_VOLUME = 0.3;
const BASE_MENU_VOLUME = 0.5;
const BASE_TRACK_VOLUME = 0.4;
const BASE_BOSS_VOLUME = 0.5;

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
    pickup: () => playTone(520, 'triangle', 0.12, 0.28, 760),
    drop: () => playTone(280, 'sine', 0.1, 0.25, 140),
    break: () => { playTone(180, 'sawtooth', 0.25, 0.45, 60); setTimeout(() => playTone(90, 'square', 0.15, 0.2), 80); },
    toss: () => playTone(300, 'triangle', 0.2, 0.4, 100),
    dash: () => playTone(800, 'square', 0.15, 0.3, 200),
    cloak: () => playTone(200, 'sine', 0.5, 0.4, 100),
    laserHit: () => playTone(150, 'sawtooth', 0.4, 0.5, 50),
    alarm: () => { playTone(800, 'square', 0.3, 0.2); setTimeout(()=>playTone(600, 'square', 0.3, 0.2), 300); },
    robotShoot: () => playTone(900, 'sawtooth', 0.2, 0.3, 400),
    bossPhase: () => {
        playTone(160, 'sawtooth', 0.28, 0.5, 50);
        setTimeout(() => playTone(90, 'square', 0.35, 0.36, 40), 70);
        setTimeout(() => playTone(420, 'triangle', 0.22, 0.3, 180), 140);
        setTimeout(() => playTone(720, 'square', 0.16, 0.2, 260), 230);
    },
    fail: () => {
        playTone(240, 'sawtooth', 0.28, 0.42, 90);
        setTimeout(() => playTone(150, 'square', 0.35, 0.3, 55), 80);
        setTimeout(() => playTone(70, 'sawtooth', 0.45, 0.22, 28), 160);
    },
    rewind: () => {
        playTone(90, 'sine', 0.2, 0.34, 380);
        setTimeout(() => playTone(220, 'triangle', 0.18, 0.26, 640), 60);
        setTimeout(() => playTone(540, 'sine', 0.22, 0.2, 980), 130);
    },
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
