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
let dialogVoiceCache = [];
let selectedNarratorVoice = null;
let selectedRobotVoice = null;
let headTTS = null;
let headTTSInitPromise = null;
let headTTSReady = false;
let headTTSError = null;
let dialogSpeechToken = 0;
let currentDialogSource = null;
let currentDialogNodes = [];
let currentDialogOutputGain = null;
let pendingDialogRequest = null;
let currentDialogEngine = 'Idle';
let headTTSPreloadStarted = false;
let headTTSGenerationWarmPromise = null;
let headTTSGenerationWarmComplete = false;
const dialogClipBufferCache = new Map();
const dialogClipLoadPromises = new Map();
let dialogClipPreloadStarted = false;

const HEADTTS_CDN = 'https://cdn.jsdelivr.net/npm/@met4citizen/headtts@1.2';
const HEADTTS_DEFAULT_VOICE = 'am_fenrir';
let userHasInteractedWithAudio = false;

function scoreVoice(voice, role = 'narrator') {
    const name = (voice.name || '').toLowerCase();
    const lang = (voice.lang || '').toLowerCase();
    let score = 0;

    if (lang.startsWith('en-us')) score += 10;
    else if (lang.startsWith('en')) score += 6;

    if (voice.localService) score += 2;
    if (voice.default) score += 1;

    if (name.includes('natural') || name.includes('neural') || name.includes('enhanced')) score += 18;
    if (name.includes('online') || name.includes('premium') || name.includes('cloud')) score += 10;

    if (role === 'narrator') {
        if (name.includes('aria') || name.includes('jenny') || name.includes('guy') || name.includes('davis') || name.includes('daniel') || name.includes('samantha')) score += 12;
        if (name.includes('zira')) score += 6;
    }

    if (role === 'robot') {
        if (name.includes('natural') || name.includes('neural')) score += 8;
        if (name.includes('davis') || name.includes('daniel') || name.includes('guy') || name.includes('mark') || name.includes('david')) score += 10;
        if (name.includes('zira') || name.includes('aria')) score += 8;
    }

    if (name.includes('espeak') || name.includes('festival')) score -= 12;

    return score;
}

function loadSpeechVoices() {
    if (!('speechSynthesis' in window)) return;
    dialogVoiceCache = window.speechSynthesis.getVoices();
    if (dialogVoiceCache.length === 0) return;

    const englishVoices = dialogVoiceCache.filter(voice => (voice.lang || '').toLowerCase().startsWith('en'));
    const narratorPool = englishVoices.length > 0 ? englishVoices : dialogVoiceCache;
    const robotPool = englishVoices.length > 0 ? englishVoices : dialogVoiceCache;

    selectedNarratorVoice = [...narratorPool].sort((a, b) => scoreVoice(b, 'narrator') - scoreVoice(a, 'narrator'))[0] || null;
    selectedRobotVoice = [...robotPool].sort((a, b) => scoreVoice(b, 'robot') - scoreVoice(a, 'robot'))[0] || selectedNarratorVoice;
}

loadSpeechVoices();
if ('speechSynthesis' in window) window.speechSynthesis.onvoiceschanged = loadSpeechVoices;

function getDialogSpeechProfile(speaker = '') {
    const normalized = speaker.toLowerCase();
    if (normalized.includes('robot') || normalized.includes('xr-9') || normalized.includes('unit')) {
        return {
            voice: selectedRobotVoice,
            rate: 0.88,
            pitch: 0.72,
            volume: 0.9
        };
    }
    if (normalized.includes('dispatch') || normalized.includes('surveillance')) {
        return {
            voice: selectedNarratorVoice,
            rate: 0.93,
            pitch: 0.82,
            volume: 0.9
        };
    }
    return {
        voice: selectedNarratorVoice,
        rate: 0.95,
        pitch: 0.86,
        volume: 0.9
    };
}

function isRobotSpeaker(speaker = '') {
    const normalized = speaker.toLowerCase();
    return normalized.includes('robot') || normalized.includes('xr-9') || normalized.includes('unit');
}

function normalizeDialogSpeechText(text) {
    return text
        .replace(/\[Encrypted\]/gi, 'encrypted')
        .replace(/\bXR-9\b/g, 'X R 9')
        .replace(/\bChronoHaul\b/g, 'Chrono Haul')
        .replace(/\s+/g, ' ')
        .trim();
}

function disconnectDialogNodes() {
    currentDialogNodes.forEach(node => {
        try { node.disconnect(); } catch {}
    });
    currentDialogNodes = [];
    currentDialogOutputGain = null;
}

async function loadDialogClipBuffer(clipKey) {
    if (!clipKey || !DIALOG_VOICE_CLIPS[clipKey]) return null;
    if (dialogClipBufferCache.has(clipKey)) return dialogClipBufferCache.get(clipKey);
    if (dialogClipLoadPromises.has(clipKey)) return dialogClipLoadPromises.get(clipKey);

    const clipPath = DIALOG_VOICE_CLIPS[clipKey];
    const promise = fetch(clipPath)
        .then(response => {
            if (!response.ok) throw new Error(`Failed to fetch ${clipPath}: ${response.status}`);
            return response.arrayBuffer();
        })
        .then(arrayBuffer => audioCtx.decodeAudioData(arrayBuffer.slice(0)))
        .then(audioBuffer => {
            dialogClipBufferCache.set(clipKey, audioBuffer);
            dialogClipLoadPromises.delete(clipKey);
            return audioBuffer;
        })
        .catch(error => {
            dialogClipLoadPromises.delete(clipKey);
            console.warn(`[Voice] Failed to load dialog clip "${clipKey}".`, error);
            throw error;
        });

    dialogClipLoadPromises.set(clipKey, promise);
    return promise;
}

export function preloadDialogClips() {
    if (dialogClipPreloadStarted) {
        return Promise.allSettled(Object.keys(DIALOG_VOICE_CLIPS).map(loadDialogClipBuffer));
    }
    dialogClipPreloadStarted = true;
    currentDialogEngine = 'Loading Voice Clips';
    console.info('[Voice] Preloading dialog voice clips.');
    return Promise.allSettled(Object.keys(DIALOG_VOICE_CLIPS).map(loadDialogClipBuffer)).then((results) => {
        const successCount = results.filter(result => result.status === 'fulfilled').length;
        currentDialogEngine = successCount > 0 ? 'Voice Clips Ready' : 'Voice Clip Load Failed';
        console.info(`[Voice] Dialog voice clips ready: ${successCount}/${results.length}.`);
        return results;
    });
}

function stopHeadTTSAudio() {
    if (currentDialogSource) {
        try { currentDialogSource.stop(); } catch {}
        currentDialogSource = null;
    }
    disconnectDialogNodes();
}

function mergeAudioBuffers(buffers) {
    if (!buffers || buffers.length === 0) return null;
    if (buffers.length === 1) return buffers[0];

    const numberOfChannels = Math.max(...buffers.map(buffer => buffer.numberOfChannels));
    const sampleRate = buffers[0].sampleRate;
    const totalLength = buffers.reduce((sum, buffer) => sum + buffer.length, 0);
    const merged = audioCtx.createBuffer(numberOfChannels, totalLength, sampleRate);

    let offset = 0;
    for (const buffer of buffers) {
        for (let channel = 0; channel < numberOfChannels; channel++) {
            const output = merged.getChannelData(channel);
            const input = buffer.getChannelData(Math.min(channel, buffer.numberOfChannels - 1));
            output.set(input, offset);
        }
        offset += buffer.length;
    }

    return merged;
}

async function warmHeadTTSGeneration() {
    if (headTTSGenerationWarmComplete) return;
    if (headTTSGenerationWarmPromise) return headTTSGenerationWarmPromise;

    headTTSGenerationWarmPromise = ensureHeadTTS().then(async (client) => {
        currentDialogEngine = 'Priming Voice';
        console.info('[Voice] Priming HeadTTS generation pipeline.');
        await client.synthesize({
            input: 'Courier systems nominal.'
        });
        headTTSGenerationWarmComplete = true;
        currentDialogEngine = 'HeadTTS Ready';
        console.info('[Voice] HeadTTS generation warm-up complete.');
    }).catch((error) => {
        console.warn('[Voice] HeadTTS generation warm-up failed.', error);
        throw error;
    });

    return headTTSGenerationWarmPromise;
}

function playBufferedDialogAudio(audioBuffer, speaker) {
    stopHeadTTSAudio();

    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.playbackRate.value = isRobotSpeaker(speaker) ? 0.88 : 0.94;
    const chain = createDialogVoiceChain(speaker);
    source.connect(chain.input);
    currentDialogEngine = isRobotSpeaker(speaker) ? 'Voice Clip: Robot' : 'Voice Clip: Narrator';
    source.onended = () => {
        if (currentDialogSource === source) {
            currentDialogSource = null;
            disconnectDialogNodes();
        }
    };
    currentDialogSource = source;
    source.start();
}

async function ensureHeadTTS() {
    if (headTTSReady && headTTS) return headTTS;
    if (headTTSError) throw headTTSError;
    if (!headTTSInitPromise) {
        headTTSInitPromise = (async () => {
            const { HeadTTS } = await import(`${HEADTTS_CDN}/+esm`);
            const instance = new HeadTTS({
                endpoints: ['wasm'],
                audioCtx,
                workerModule: `${HEADTTS_CDN}/modules/worker-tts.mjs`,
                dictionaryURL: `${HEADTTS_CDN}/dictionaries/`,
                voices: [HEADTTS_DEFAULT_VOICE],
                defaultVoice: HEADTTS_DEFAULT_VOICE,
                defaultLanguage: 'en-us',
                defaultSpeed: 0.98,
                defaultAudioEncoding: 'wav',
                dtypeWasm: 'q4'
            });
            await instance.connect();
            await instance.setup({
                voice: HEADTTS_DEFAULT_VOICE,
                language: 'en-us',
                speed: 0.98,
                audioEncoding: 'wav'
            });
            headTTS = instance;
            headTTSReady = true;
            return instance;
        })().catch(error => {
            headTTSError = error;
            throw error;
        });
    }
    return headTTSInitPromise;
}

export function preloadDialogVoice() {
    if (state.audioSettings.dialogVoiceEnabled === false) {
        currentDialogEngine = 'Voice Disabled';
        return Promise.resolve(null);
    }
    return preloadDialogClips().catch((error) => {
        currentDialogEngine = 'Voice Clip Load Failed';
        console.warn('[Voice] Dialog clip preload failed.', error);
        return null;
    });
}

function createDialogVoiceChain(speaker = '') {
    const robotSpeaker = isRobotSpeaker(speaker);
    const hp = audioCtx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = robotSpeaker ? 340 : 240;

    const lp = audioCtx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = robotSpeaker ? 2250 : 3200;

    const midBand = audioCtx.createBiquadFilter();
    midBand.type = 'bandpass';
    midBand.frequency.value = robotSpeaker ? 1725 : 1450;
    midBand.Q.value = robotSpeaker ? 1.4 : 0.9;

    const presence = audioCtx.createBiquadFilter();
    presence.type = 'peaking';
    presence.frequency.value = robotSpeaker ? 1880 : 1650;
    presence.Q.value = robotSpeaker ? 1.9 : 1.3;
    presence.gain.value = robotSpeaker ? 7 : 5;

    const compressor = audioCtx.createDynamicsCompressor();
    compressor.threshold.value = robotSpeaker ? -31 : -28;
    compressor.knee.value = robotSpeaker ? 10 : 18;
    compressor.ratio.value = robotSpeaker ? 6 : 4;
    compressor.attack.value = 0.001;
    compressor.release.value = robotSpeaker ? 0.09 : 0.12;

    const dryGain = audioCtx.createGain();
    dryGain.gain.value = robotSpeaker ? 0.44 : 0.62;

    const wetGain = audioCtx.createGain();
    wetGain.gain.value = robotSpeaker ? 0.48 : 0.36;

    const distortion = audioCtx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < curve.length; i++) {
        const x = (i / (curve.length - 1)) * 2 - 1;
        curve[i] = Math.tanh(x * (robotSpeaker ? 3.4 : 2.1));
    }
    distortion.curve = curve;
    distortion.oversample = '2x';

    const tremoloGain = audioCtx.createGain();
    tremoloGain.gain.value = robotSpeaker ? 0.62 : 0.72;
    const tremoloOsc = audioCtx.createOscillator();
    const tremoloDepth = audioCtx.createGain();
    tremoloOsc.type = robotSpeaker ? 'sawtooth' : 'square';
    tremoloOsc.frequency.value = robotSpeaker ? 52 : 34;
    tremoloDepth.gain.value = robotSpeaker ? 0.34 : 0.22;
    tremoloOsc.connect(tremoloDepth);
    tremoloDepth.connect(tremoloGain.gain);
    tremoloOsc.start();

    const robotRingGain = audioCtx.createGain();
    const robotRingOsc = audioCtx.createOscillator();
    const robotRingDepth = audioCtx.createGain();
    robotRingGain.gain.value = 1;
    robotRingDepth.gain.value = robotSpeaker ? 0.22 : 0;
    robotRingOsc.type = 'square';
    robotRingOsc.frequency.value = 86;
    robotRingOsc.connect(robotRingDepth);
    robotRingDepth.connect(robotRingGain.gain);
    robotRingOsc.start();

    const delay = audioCtx.createDelay(0.08);
    delay.delayTime.value = robotSpeaker ? 0.034 : 0.028;
    const delayGain = audioCtx.createGain();
    delayGain.gain.value = robotSpeaker ? 0.2 : 0.14;

    const output = audioCtx.createGain();
    output.gain.value = 0.95 * (state.audioSettings.dialogVolume ?? 0.9) * (state.audioSettings.muted ? 0 : 1);

    hp.connect(lp);
    lp.connect(midBand);
    midBand.connect(presence);
    presence.connect(compressor);
    compressor.connect(dryGain);
    compressor.connect(distortion);
    distortion.connect(robotRingGain);
    robotRingGain.connect(tremoloGain);
    tremoloGain.connect(wetGain);
    tremoloGain.connect(delay);
    delay.connect(delayGain);
    dryGain.connect(output);
    wetGain.connect(output);
    delayGain.connect(output);
    output.connect(masterGain);

    currentDialogNodes = [hp, lp, midBand, presence, compressor, dryGain, distortion, robotRingGain, robotRingOsc, robotRingDepth, tremoloGain, tremoloOsc, tremoloDepth, wetGain, delay, delayGain, output];
    currentDialogOutputGain = output;
    return {
        input: hp,
        output
    };
}

export function applyAudioSettings() {
    const muted = !!state.audioSettings.muted;
    const musicVolume = state.audioSettings.musicVolume ?? 0.7;
    masterGain.gain.value = muted ? 0 : BASE_MASTER_VOLUME;
    menuMusic.volume = muted ? 0 : BASE_MENU_VOLUME * musicVolume;
    track1.volume = muted ? 0 : BASE_TRACK_VOLUME * musicVolume;
    track2.volume = muted ? 0 : BASE_TRACK_VOLUME * musicVolume;
    trackBoss.volume = muted ? 0 : BASE_BOSS_VOLUME * musicVolume;
    if (currentDialogOutputGain) currentDialogOutputGain.gain.value = 0.95 * (state.audioSettings.dialogVolume ?? 0.9) * (muted ? 0 : 1);
    if (muted) stopDialogSpeech();
}

export async function unlockAudio() {
    userHasInteractedWithAudio = true;
    if (audioCtx.state === 'suspended') {
        try { await audioCtx.resume(); } catch {}
    }
    if (currentTrack && currentTrack.paused && !state.audioSettings.muted) {
        try { await currentTrack.play(); } catch {}
    }
    preloadDialogVoice().catch(() => {});
    if (pendingDialogRequest && !state.audioSettings.muted && state.audioSettings.dialogVoiceEnabled !== false) {
        const request = pendingDialogRequest;
        pendingDialogRequest = null;
        speakDialog(request.speaker, request.text, request.clipKey);
    }
}

export function setGlobalMute(muted) {
    state.audioSettings.muted = !!muted;
    applyAudioSettings();
}

export function setDialogVoiceEnabled(enabled) {
    state.audioSettings.dialogVoiceEnabled = !!enabled;
    if (!enabled) stopDialogSpeech();
    if (enabled) preloadDialogVoice().catch(() => {});
    else currentDialogEngine = 'Voice Disabled';
}

export function setDialogVolume(volume) {
    state.audioSettings.dialogVolume = Math.max(0, Math.min(1, volume));
    applyAudioSettings();
}

export function setMusicVolume(volume) {
    state.audioSettings.musicVolume = Math.max(0, Math.min(1, volume));
    applyAudioSettings();
}

async function speakWithHeadTTS(speaker, text, token) {
    const client = await ensureHeadTTS();
    if (audioCtx.state === 'suspended') {
        try { await audioCtx.resume(); } catch {}
    }
    const messages = await client.synthesize({
        input: normalizeDialogSpeechText(text)
    });
    if (token !== dialogSpeechToken) return;

    const audioBuffers = messages
        .filter(message => message?.type === 'audio' && message?.data?.audio instanceof AudioBuffer)
        .map(message => message.data.audio);
    const mergedAudio = mergeAudioBuffers(audioBuffers);
    if (!mergedAudio) throw new Error('HeadTTS returned no audio buffer.');

    stopHeadTTSAudio();
    if (token !== dialogSpeechToken) return;

    const source = audioCtx.createBufferSource();
    source.buffer = mergedAudio;
    source.playbackRate.value = isRobotSpeaker(speaker) ? 0.88 : 0.94;
    const chain = createDialogVoiceChain(speaker);
    source.connect(chain.input);
    currentDialogEngine = isRobotSpeaker(speaker) ? 'HeadTTS: Robot' : 'HeadTTS: Narrator';
    console.info('[Voice] Speaking dialog with HeadTTS.');
    source.onended = () => {
        if (currentDialogSource === source) {
            currentDialogSource = null;
            disconnectDialogNodes();
        }
    };
    currentDialogSource = source;
    source.start();
}

export function stopDialogSpeech() {
    dialogSpeechToken++;
    stopHeadTTSAudio();
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
}

export function getDialogVoiceStatus() {
    return currentDialogEngine;
}

export function playDialogVoicePreview() {
    speakDialog('ChronoHaul Dispatch', 'Voice systems online. Courier channel check complete.', 'preview-dispatch');
}

export function speakDialog(speaker, text, clipKey = null) {
    if (!text) {
        console.warn('[Voice] Dialog speech skipped because no text was provided.');
        return;
    }
    if (state.audioSettings.muted) {
        console.info('[Voice] Dialog speech skipped because audio is muted.');
        return;
    }
    if (state.audioSettings.dialogVoiceEnabled === false) {
        console.info('[Voice] Dialog speech skipped because voice dialog is disabled.');
        return;
    }
    if (!userHasInteractedWithAudio) {
        pendingDialogRequest = { speaker, text, clipKey };
        currentDialogEngine = 'Awaiting Input';
        console.info('[Voice] Queued dialog speech until audio is unlocked.');
        return;
    }
    stopDialogSpeech();
    currentDialogEngine = 'Initializing Voice';
    const token = dialogSpeechToken;
    if (clipKey && DIALOG_VOICE_CLIPS[clipKey]) {
        loadDialogClipBuffer(clipKey).then((audioBuffer) => {
            if (token !== dialogSpeechToken) return;
            if (!audioBuffer) throw new Error(`Missing dialog clip for ${clipKey}`);
            console.info(`[Voice] Playing pre-rendered dialog clip "${clipKey}".`);
            playBufferedDialogAudio(audioBuffer, speaker);
        }).catch((clipError) => {
            console.warn('[Voice] Dialog clip playback unavailable, attempting TTS fallback.', clipError);
            return speakWithHeadTTS(speaker, text, token);
        }).catch((headTTSError) => {
            console.warn('[Voice] HeadTTS playback failed, attempting browser fallback.', headTTSError);
            if (!('speechSynthesis' in window) || token !== dialogSpeechToken) return;
            if (state.audioSettings.muted || state.audioSettings.dialogVoiceEnabled === false) return;
            if (audioCtx.state === 'suspended') {
                audioCtx.resume().catch(() => {});
            }
            loadSpeechVoices();
            const utterance = new SpeechSynthesisUtterance(normalizeDialogSpeechText(text));
            const profile = getDialogSpeechProfile(speaker);
            utterance.voice = profile.voice || null;
            utterance.rate = profile.rate;
            utterance.pitch = profile.pitch;
            utterance.volume = profile.volume * (state.audioSettings.dialogVolume ?? 0.9);
            utterance.onstart = () => console.info('[Voice] Browser speech fallback started.');
            utterance.onerror = (event) => console.error('[Voice] Browser speech fallback failed.', event.error || event);
            currentDialogEngine = utterance.voice ? `Browser Voice: ${utterance.voice.name}` : 'Browser Voice';
            console.warn('[Voice] Falling back to browser speech synthesis.');
            window.speechSynthesis.speak(utterance);
        }).catch(() => {
            currentDialogEngine = 'Voice Failed';
            console.error('[Voice] Dialog speech failed to initialize.');
        });
        return;
    }
    speakWithHeadTTS(speaker, text, token).catch((headTTSError) => {
        console.warn('[Voice] HeadTTS playback failed, attempting browser fallback.', headTTSError);
        if (!('speechSynthesis' in window) || token !== dialogSpeechToken) return;
        if (state.audioSettings.muted || state.audioSettings.dialogVoiceEnabled === false) return;
        if (audioCtx.state === 'suspended') {
            audioCtx.resume().catch(() => {});
        }
        loadSpeechVoices();
        const utterance = new SpeechSynthesisUtterance(normalizeDialogSpeechText(text));
        const profile = getDialogSpeechProfile(speaker);
        utterance.voice = profile.voice || null;
        utterance.rate = profile.rate;
        utterance.pitch = profile.pitch;
        utterance.volume = profile.volume * (state.audioSettings.dialogVolume ?? 0.9);
        utterance.onstart = () => console.info('[Voice] Browser speech fallback started.');
        utterance.onerror = (event) => console.error('[Voice] Browser speech fallback failed.', event.error || event);
        currentDialogEngine = utterance.voice ? `Browser Voice: ${utterance.voice.name}` : 'Browser Voice';
        console.warn('[Voice] Falling back to browser speech synthesis.');
        window.speechSynthesis.speak(utterance);
    }).catch(() => {
        currentDialogEngine = 'Voice Failed';
        console.error('[Voice] Dialog speech failed to initialize.');
    });
}

applyAudioSettings();

export function playMenuMusic() {
    if (currentTrack === menuMusic && !menuMusic.paused) return; // Already playing
    stopMusic();
    currentTrack = menuMusic;
    if (!userHasInteractedWithAudio || state.audioSettings.muted) return;
    currentTrack.play().catch(() => {});
}

export function startMusic() {
    let nextTrack;
    if (state.currentLevelMeta?.isBoss) nextTrack = trackBoss;
    else if (state.currentLevelIndex <= 5) nextTrack = track1;  // Levels 1 through 6
    else nextTrack = track2;                                    // Levels 7 through 12

    if (currentTrack === nextTrack && !currentTrack.paused) return; // Already playing correctly
    
    stopMusic();
    currentTrack = nextTrack;
    if (!userHasInteractedWithAudio || state.audioSettings.muted) return;
    currentTrack.play().catch(() => {});
}

export function stopMusic() {
    if (currentTrack && !currentTrack.paused) currentTrack.pause();
}

export function scheduleMusic() {
    // Nullified procedural generator placeholder. Real audio controls loop natively.
}
