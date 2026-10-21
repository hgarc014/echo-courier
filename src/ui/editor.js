import { state } from '../core/state.js';
import { LEVELS, serializeLevel, deserializeLevel, createBoundWalls, isBoundWall, cloneDemo, normalizeLoopTime, normalizePar, normalizeWorldId, WORLDS, copyBossMeta } from '../data/levels.js';
import { keys } from '../core/input.js';
import { panCamera, screenToWorld, getCamera, getMapSize, setMapSize, VIEW_WIDTH, VIEW_HEIGHT } from '../core/camera.js';
import { Wall, Door, AlarmDoor, TimerDoor, PressurePlate, TemporalPlate, Package, HintPlate } from '../entities/interactables.js';
import { Laser, SweepCamera, Guard, Drone, WindTunnel, StaticZone, CrackedFloor, ShooterRobot } from '../entities/hazards.js';
import { Burrower } from '../entities/bosses/Burrower.js';
import { Gatekeeper } from '../entities/bosses/gatekeeper.js';
import { DeliveryZone } from '../entities/zones.js';
import { PlayerEntity } from '../entities/actors.js';
import { normalizeTimeline } from '../systems/temporalPlate.js';
import { getWaypoints, moveEntityTo, addWaypoint, removeWaypoint, applyInspectorEdits, applyBurrowerConfig, degToRad, radToDeg, addAudit, removeAudit, applyGatekeeperEdits } from './editorInspector.js';

export const EDITOR_SAVE_PREFIX = 'echoCourier_editorSave_';

export let selectedEntity = null;
let dragX = 0; let dragY = 0; let isDragging = false;
let isPanning = false;
let panLastX = 0; let panLastY = 0;
let mouseSX = 0; let mouseSY = 0;
let mouseOnCanvas = false;
let dragStartSnapshot = null;
let dragStartX = 0;
let dragStartY = 0;

const EDGE_PAN = 28;
const EDGE_SPEED = 8;
const KEY_PAN_SPEED = 12;
const UNDO_CAP = 50;
const PASTE_OFFSET = 20;
const ENTITY_LISTS = [
    ['walls', 'wall'],
    ['doors', 'door'],
    ['plates', 'plate'],
    ['hints', 'hint'],
    ['packages', 'package'],
    ['lasers', 'laser'],
    ['guards', 'guard'],
    ['cameras', 'camera'],
    ['drones', 'drone'],
    ['winds', 'wind'],
    ['statics', 'static'],
    ['cracks', 'crack'],
    ['robots', 'robot'],
    ['burrowers', 'burrower'],
    ['gatekeepers', 'gatekeeper']
];

const DEFAULT_EDITOR_META = () => ({
    name: 'Editor Level',
    story: { speaker: '', text: '' },
    obj: '',
    grants: [],
    maxGhosts: 3,
    crackSpeed: 'normal',
    demo: undefined
});

function normalizeCrackSpeed(speed) {
    return speed === 'fast' ? 'fast' : 'normal';
}

function applyCrackSpeedToWorld(speed) {
    const normalized = normalizeCrackSpeed(speed);
    for (const crack of state.cracks || []) {
        if (crack && typeof crack.setCrackSpeed === 'function') crack.setCrackSpeed(normalized);
    }
    return normalized;
}

export function ensureEditorLevelMeta() {
    if (!state.editorLevelMeta) state.editorLevelMeta = DEFAULT_EDITOR_META();
    return state.editorLevelMeta;
}

export function setEditorLevelMetaFromLevel(level) {
    if (!level) {
        state.editorLevelMeta = DEFAULT_EDITOR_META();
        return state.editorLevelMeta;
    }
    state.editorLevelMeta = {
        name: level.name || 'Editor Level',
        story: {
            speaker: level.story?.speaker || '',
            text: level.story?.text || ''
        },
        obj: level.obj || '',
        grants: [...(level.grants || [])],
        maxGhosts: level.maxGhosts ?? 3,
        crackSpeed: normalizeCrackSpeed(level.crackSpeed),
        demo: cloneDemo(level.demo)
    };
    const loopTime = normalizeLoopTime(level.loopTime);
    if (loopTime != null) state.editorLevelMeta.loopTime = loopTime;
    const par = normalizePar(level.par);
    if (par != null) state.editorLevelMeta.par = par;
    const worldId = normalizeWorldId(level.world);
    if (worldId != null) state.editorLevelMeta.world = worldId;
    if (Array.isArray(level.unlocks)) state.editorLevelMeta.unlocks = [...level.unlocks];
    copyBossMeta(level, state.editorLevelMeta);
    if (level.challenge && !level.isPlaytest) state.editorLevelMeta.challengeRef = level.name;
    return state.editorLevelMeta;
}

function populateWorldSelect(sel) {
    if (!sel || sel.dataset.populated) return;
    sel.dataset.populated = '1';
    sel.innerHTML = '<option value="">None (no world gate)</option>' + WORLDS.map(w =>
        `<option value="${w.id}">${w.id}: ${escapeAttr(w.name)}${w.unlocks.length ? ' (' + w.unlocks.join(', ') + ')' : ''}</option>`).join('');
}

function syncLevelConfigForm() {
    const meta = ensureEditorLevelMeta();
    const speaker = document.getElementById('editor-meta-speaker');
    const text = document.getElementById('editor-meta-text');
    const obj = document.getElementById('editor-meta-obj');
    const maxG = document.getElementById('editor-meta-maxghosts');
    const loopEl = document.getElementById('editor-meta-looptime');
    if (speaker) speaker.value = meta.story?.speaker || '';
    if (text) text.value = meta.story?.text || '';
    if (obj) obj.value = meta.obj || '';
    if (maxG) maxG.value = meta.maxGhosts ?? 3;
    if (loopEl) loopEl.value = meta.loopTime != null ? String(meta.loopTime) : '';
    const parEl = document.getElementById('editor-meta-par');
    if (parEl) parEl.value = meta.par != null ? String(meta.par) : '';
    const speedEl = document.getElementById('editor-meta-crackspeed');
    if (speedEl) speedEl.value = meta.crackSpeed === 'fast' ? 'fast' : 'normal';
    const worldEl = document.getElementById('editor-meta-world');
    populateWorldSelect(worldEl);
    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    const bossEl = document.getElementById('editor-meta-boss');
    if (bossEl) bossEl.checked = !!meta.isBoss;
    setVal('editor-meta-boss-speaker', meta.bossIntro?.speaker || '');
    setVal('editor-meta-boss-text', meta.bossIntro?.text || '');
    setVal('editor-meta-boss-door', meta.bossIntroDoorId || '');
    setVal('editor-meta-challenge', meta.challengeRef || '');
    if (worldEl) worldEl.value = meta.world != null ? String(meta.world) : '';
    const unlockSet = new Set(meta.unlocks || []);
    for (const id of ['dash', 'toss', 'cloak', 'ghostShield']) {
        const el = document.getElementById('editor-meta-unlock-' + id);
        if (el) el.checked = unlockSet.has(id);
    }
    const grants = new Set(meta.grants || []);
    for (const id of ['dash', 'toss', 'cloak', 'ghostShield']) {
        const el = document.getElementById('editor-meta-' + id);
        if (el) el.checked = grants.has(id);
    }
    const demo = meta.demo;
    const autoEl = document.getElementById('editor-meta-demo-autoplay');
    const skipEl = document.getElementById('editor-meta-demo-skippable');
    const stepsEl = document.getElementById('editor-meta-demo-steps');
    if (autoEl) autoEl.checked = demo ? demo.autoPlayOnFirstEnter !== false : true;
    if (skipEl) skipEl.checked = demo ? demo.skippable !== false : true;
    if (stepsEl) {
        stepsEl.value = demo?.steps?.length ? JSON.stringify(demo.steps, null, 2) : '';
    }
}

function parseDemoFromForm() {
    const raw = document.getElementById('editor-meta-demo-steps')?.value?.trim() || '';
    const autoPlayOnFirstEnter = document.getElementById('editor-meta-demo-autoplay')?.checked !== false;
    const skippable = document.getElementById('editor-meta-demo-skippable')?.checked !== false;
    if (!raw) return undefined;
    let steps;
    try { steps = JSON.parse(raw); }
    catch (err) {
        throw new Error('Demo steps JSON is invalid');
    }
    if (!Array.isArray(steps)) throw new Error('Demo steps must be a JSON array');
    return cloneDemo({ autoPlayOnFirstEnter, skippable, steps });
}

function applyLevelConfigForm() {
    const grants = [];
    for (const id of ['dash', 'toss', 'cloak', 'ghostShield']) {
        if (document.getElementById('editor-meta-' + id)?.checked) grants.push(id);
    }
    let demo;
    try {
        demo = parseDemoFromForm();
    } catch (err) {
        setSaveStatus(err.message || 'Demo JSON invalid', false);
        return;
    }
    const loopTime = normalizeLoopTime(document.getElementById('editor-meta-looptime')?.value);
    const loopEl = document.getElementById('editor-meta-looptime');
    if (loopEl && loopTime == null) loopEl.value = '';
    const par = normalizePar(document.getElementById('editor-meta-par')?.value);
    const parEl = document.getElementById('editor-meta-par');
    if (parEl && par == null) parEl.value = '';
    state.editorLevelMeta = {
        name: ensureEditorLevelMeta().name || 'Editor Level',
        story: {
            speaker: document.getElementById('editor-meta-speaker')?.value || '',
            text: document.getElementById('editor-meta-text')?.value || ''
        },
        obj: document.getElementById('editor-meta-obj')?.value || '',
        grants,
        maxGhosts: parseInt(document.getElementById('editor-meta-maxghosts')?.value, 10) || 0,
        crackSpeed: applyCrackSpeedToWorld(document.getElementById('editor-meta-crackspeed')?.value),
        demo
    };
    if (loopTime != null) state.editorLevelMeta.loopTime = loopTime;
    if (par != null) state.editorLevelMeta.par = par;
    const worldId = normalizeWorldId(document.getElementById('editor-meta-world')?.value);
    if (worldId != null) state.editorLevelMeta.world = worldId;
    const unlocks = ['dash', 'toss', 'cloak', 'ghostShield']
        .filter(id => document.getElementById('editor-meta-unlock-' + id)?.checked);
    if (worldId != null || unlocks.length) state.editorLevelMeta.unlocks = unlocks;
    const val = id => document.getElementById(id)?.value?.trim() || '';
    copyBossMeta({
        isBoss: !!document.getElementById('editor-meta-boss')?.checked,
        bossIntro: { speaker: val('editor-meta-boss-speaker'), text: val('editor-meta-boss-text') },
        bossIntroDoorId: val('editor-meta-boss-door'),
        challengeRef: val('editor-meta-challenge')
    }, state.editorLevelMeta);
    setSaveStatus('Level config applied');
}

let crackSpeedControlBound = false;
function bindCrackSpeedControl() {
    if (crackSpeedControlBound) return;
    const speedEl = document.getElementById('editor-meta-crackspeed');
    if (!speedEl) return;
    crackSpeedControlBound = true;
    speedEl.addEventListener('change', () => {
        const speed = applyCrackSpeedToWorld(speedEl.value);
        ensureEditorLevelMeta().crackSpeed = speed;
    });
}



let undoStack = [];
let redoStack = [];
let clipboard = null;

function canvasPoint(canvas, e) {
    const rect = canvas.getBoundingClientRect();
    return {
        sx: (e.clientX - rect.left) * (canvas.width / rect.width),
        sy: (e.clientY - rect.top) * (canvas.height / rect.height)
    };
}

function isTypingTarget() {
    const el = document.activeElement;
    if (!el) return false;
    const tag = (el.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    return !!el.isContentEditable;
}

function sanitizeSlotName(name) {
    const cleaned = String(name || 'default').trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32);
    return cleaned || 'default';
}

function setSaveStatus(msg, ok = true) {
    const el = document.getElementById('editor-save-status');
    if (!el) return;
    el.innerText = msg || '';
    el.style.color = ok ? '#39ff14' : '#ff5555';
}

function listEditorSaves() {
    const names = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(EDITOR_SAVE_PREFIX)) names.push(key.slice(EDITOR_SAVE_PREFIX.length));
    }
    names.sort();
    return names;
}

function refreshSaveSlotList() {
    const select = document.getElementById('editor-save-slots');
    if (!select) return;
    const current = sanitizeSlotName(document.getElementById('editor-save-name')?.value);
    const names = listEditorSaves();
    select.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.innerText = names.length ? 'Saved slots…' : 'No saves yet';
    select.appendChild(placeholder);
    for (const name of names) {
        const opt = document.createElement('option');
        opt.value = name;
        opt.innerText = name;
        if (name === current) opt.selected = true;
        select.appendChild(opt);
    }
}

function currentLayoutJson() {
    return JSON.stringify(serializeLevel(state));
}

function findEntityKind(ent) {
    if (!ent) return null;
    if (ent === state.player) return { list: null, type: 'player' };
    if (ent === state.deliveryZone) return { list: null, type: 'deliveryZone' };
    for (const [list, type] of ENTITY_LISTS) {
        if ((state[list] || []).includes(ent)) return { list, type };
    }
    return null;
}

function pushUndo(snapshot) {
    undoStack.push(snapshot !== undefined ? snapshot : currentLayoutJson());
    if (undoStack.length > UNDO_CAP) undoStack.shift();
    redoStack.length = 0;
}

function restoreLayout(json) {
    let parsed;
    try { parsed = typeof json === 'string' ? JSON.parse(json) : json; }
    catch { return; }
    const setupData = deserializeLevel(parsed);
    Object.assign(state, setupData);
    setMapSize(setupData.mapWidth, setupData.mapHeight);
    selectedEntity = null;
    updatePropertiesPanel();
    syncEditorUi();
}

function editorUndo() {
    if (!undoStack.length) return;
    redoStack.push(currentLayoutJson());
    restoreLayout(undoStack.pop());
}

function editorRedo() {
    if (!redoStack.length) return;
    undoStack.push(currentLayoutJson());
    if (undoStack.length > UNDO_CAP) undoStack.shift();
    restoreLayout(redoStack.pop());
}

function copySelected() {
    if (!selectedEntity) return;
    const kind = findEntityKind(selectedEntity);
    if (!kind) return;
    const snapshot = serializeLevel(state);
    let data;
    if (kind.list) {
        const idx = state[kind.list].indexOf(selectedEntity);
        if (idx < 0) return;
        data = snapshot[kind.list][idx];
    } else {
        data = snapshot[kind.type];
    }
    clipboard = { type: kind.type, list: kind.list, data: JSON.parse(JSON.stringify(data)) };
}

function offsetClipData(data, dx, dy) {
    const next = JSON.parse(JSON.stringify(data));
    if (next.x !== undefined) next.x += dx;
    if (next.y !== undefined) next.y += dy;
    if (Array.isArray(next.path)) next.path = next.path.map(p => ({ ...p, x: p.x + dx, y: p.y + dy }));
    return next;
}

function pasteClipboard() {
    if (!clipboard || !clipboard.list) return;
    pushUndo();
    const data = offsetClipData(clipboard.data, PASTE_OFFSET, PASTE_OFFSET);
    if (clipboard.list === 'doors') data.id = 'd_' + Date.now();
    else if (clipboard.list === 'plates') data.id = 'p_' + Date.now();
    else if (clipboard.list === 'packages') data.id = 'pkg_' + Date.now();
    else if (clipboard.list === 'lasers') data.id = 'l_' + Date.now();
    else if (clipboard.list === 'burrowers') data.id = 'burrower_' + Date.now();
    else if (clipboard.list === 'gatekeepers') data.id = 'gk_' + Date.now();
    const spawned = (deserializeLevel({ [clipboard.list]: [data] })[clipboard.list] || [])[0];
    if (!spawned) return;
    if (clipboard.list === 'cracks' && typeof spawned.setCrackSpeed === 'function') {
        spawned.setCrackSpeed(ensureEditorLevelMeta().crackSpeed);
    }
    state[clipboard.list].push(spawned);
    selectedEntity = spawned;
    updatePropertiesPanel();
    clipboard = { ...clipboard, data };
}

function applyEditorMapSize(w, h) {
    const prev = getMapSize();
    state.walls = (state.walls || []).filter(wall => !isBoundWall(wall, prev.w, prev.h));
    const size = setMapSize(w, h);
    state.walls.unshift(...createBoundWalls(size.w, size.h));
    const wEl = document.getElementById('editor-map-w');
    const hEl = document.getElementById('editor-map-h');
    if (wEl) wEl.value = size.w;
    if (hEl) hEl.value = size.h;
    return size;
}

export function syncEditorUi() {
    const { w, h } = getMapSize();
    const wEl = document.getElementById('editor-map-w');
    const hEl = document.getElementById('editor-map-h');
    if (wEl) wEl.value = w;
    if (hEl) hEl.value = h;
    const applyBtn = document.getElementById('editor-meta-apply');
    if (applyBtn) applyBtn.onclick = () => applyLevelConfigForm();
    ensureEditorLevelMeta();
    syncLevelConfigForm();
    bindCrackSpeedControl();
    window.refreshEditorLevelConfigForm = syncLevelConfigForm;

    refreshSaveSlotList();
}

export function refreshEditorLevelConfigForm() {
    syncLevelConfigForm();
}


export function tickEditor() {
    if (state.gameState !== 'EDITOR') return;
    if (!isTypingTarget()) {
        let dx = 0, dy = 0;
        if (keys.a) dx -= KEY_PAN_SPEED;
        if (keys.d) dx += KEY_PAN_SPEED;
        if (keys.w) dy -= KEY_PAN_SPEED;
        if (keys.s) dy += KEY_PAN_SPEED;
        if (dx || dy) panCamera(dx, dy);
    }
    if (mouseOnCanvas && !isDragging && !isPanning) {
        let edx = 0, edy = 0;
        if (mouseSX < EDGE_PAN) edx -= EDGE_SPEED;
        if (mouseSX > VIEW_WIDTH - EDGE_PAN) edx += EDGE_SPEED;
        if (mouseSY < EDGE_PAN) edy -= EDGE_SPEED;
        if (mouseSY > VIEW_HEIGHT - EDGE_PAN) edy += EDGE_SPEED;
        if (edx || edy) panCamera(edx, edy);
    }
}

export function initEditor(canvas, ctx) {
    document.getElementById('editor-exit-btn').onclick = () => {
        document.getElementById('editor-overlay').classList.add('hidden');
        window.returnToMenu();
    };

    let loadSelect = document.getElementById('editor-load-level');
    loadSelect.innerHTML = '';
    for (let i = 0; i < LEVELS.length; i++) {
        let opt = document.createElement('option');
        opt.value = i; opt.innerText = LEVELS[i].name;
        loadSelect.appendChild(opt);
    }

    document.getElementById('editor-load-btn').onclick = () => {
        let idx = parseInt(document.getElementById('editor-load-level').value);
        setEditorLevelMetaFromLevel(LEVELS[idx]);
        window.startEditorMode(null, idx);
        syncLevelConfigForm();
    };

    document.getElementById('editor-map-apply')?.addEventListener('click', () => {
        const w = parseInt(document.getElementById('editor-map-w').value, 10);
        const h = parseInt(document.getElementById('editor-map-h').value, 10);
        pushUndo();
        applyEditorMapSize(w, h);
        setSaveStatus(`Map size ${getMapSize().w}×${getMapSize().h}`);
    });

    document.getElementById('editor-play-btn')?.addEventListener('click', () => {
        window.startPlaytestFromEditor();
    });

    document.getElementById('editor-save-btn')?.addEventListener('click', () => {
        const name = sanitizeSlotName(document.getElementById('editor-save-name')?.value);
        const nameEl = document.getElementById('editor-save-name');
        if (nameEl) nameEl.value = name;
        try {
            localStorage.setItem(EDITOR_SAVE_PREFIX + name, currentLayoutJson());
            refreshSaveSlotList();
            setSaveStatus(`Saved "${name}"`);
        } catch (err) {
            setSaveStatus('Save failed', false);
        }
    });

    document.getElementById('editor-load-save-btn')?.addEventListener('click', () => {
        const name = sanitizeSlotName(document.getElementById('editor-save-name')?.value);
        const raw = localStorage.getItem(EDITOR_SAVE_PREFIX + name);
        if (!raw) {
            setSaveStatus(`No save named "${name}"`, false);
            return;
        }
        window.startEditorMode(raw);
        setSaveStatus(`Loaded "${name}"`);
    });

    document.getElementById('editor-save-slots')?.addEventListener('change', (e) => {
        if (!e.target.value) return;
        const nameEl = document.getElementById('editor-save-name');
        if (nameEl) nameEl.value = e.target.value;
    });

    document.getElementById('editor-spawn-btn').onclick = () => {
        pushUndo();
        let type = document.getElementById('editor-entity-type').value;
        let spawned = null;
        const cam = getCamera();
        let cx = Math.round((cam.x + VIEW_WIDTH / 2) / 10) * 10;
        let cy = Math.round((cam.y + VIEW_HEIGHT / 2) / 10) * 10;
        const id = Date.now();
        if (type === 'wall') { spawned = new Wall(cx, cy, 40, 40); state.walls.push(spawned); }
        else if (type === 'door') { spawned = new Door('d_'+id, cx, cy, 40, 80); state.doors.push(spawned); }
        else if (type === 'door_alarm') { spawned = new AlarmDoor('d_'+id, cx, cy, 40, 80); state.doors.push(spawned); }
        else if (type === 'door_timer') { spawned = new TimerDoor('d_'+id, cx, cy, 40, 80, 60, 60); state.doors.push(spawned); }
        else if (type === 'plate') { spawned = new PressurePlate('p_'+id, cx, cy, 'd_0'); state.plates.push(spawned); }
        else if (type === 'hint') { spawned = new HintPlate('hint_'+id, cx, cy, { demoId: 'intro', title: 'Hint Demo', autoOpen: false }); if (!state.hints) state.hints=[]; state.hints.push(spawned); }
        else if (type === 'plate_temporal' || type === 'plate_temporal_first' || type === 'plate_temporal_last') {
            const mode = type === 'plate_temporal_first' ? 'first' : type === 'plate_temporal_last' ? 'last' : 'present';
            spawned = new TemporalPlate('p_'+id, cx, cy, 'd_0', mode); state.plates.push(spawned);
        }
        else if (type === 'package') { spawned = new Package('pkg_'+id, cx, cy, 'standard'); state.packages.push(spawned); }
        else if (type === 'package_heavy') { spawned = new Package('pkg_'+id, cx, cy, 'heavy'); state.packages.push(spawned); }
        else if (type === 'package_fragile') { spawned = new Package('pkg_'+id, cx, cy, 'fragile'); state.packages.push(spawned); }
        else if (type === 'package_timed') { spawned = new Package('pkg_'+id, cx, cy, 'timed'); state.packages.push(spawned); }
        else if (type === 'package_decoy') { spawned = new Package('pkg_'+id, cx, cy, 'decoy'); state.packages.push(spawned); }
        else if (type === 'package_contraband') { spawned = new Package('pkg_'+id, cx, cy, 'contraband'); state.packages.push(spawned); }
        else if (type === 'laser') { spawned = new Laser('l_'+id, cx, cy, 20, 80); state.lasers.push(spawned); }
        else if (type === 'guard') { spawned = new Guard([{x:cx,y:cy}, {x:cx+50,y:cy}]); state.guards.push(spawned); }
        else if (type === 'camera') { spawned = new SweepCamera(cx, cy, 0, Math.PI/2); state.cameras.push(spawned); }
        else if (type === 'drone') { spawned = new Drone([{x:cx,y:cy}, {x:cx+60,y:cy}]); state.drones.push(spawned); }
        else if (type === 'wind') { spawned = new WindTunnel(cx, cy, 40, 80, 0, 5); state.winds.push(spawned); }
        else if (type === 'static') { spawned = new StaticZone(cx, cy, 80, 80); state.statics.push(spawned); }
        else if (type === 'crack') { spawned = new CrackedFloor(cx, cy, 40, 40, ensureEditorLevelMeta().crackSpeed); state.cracks.push(spawned); }
        else if (type === 'robot') { spawned = new ShooterRobot([{x:cx,y:cy}, {x:cx+40,y:cy}]); state.robots.push(spawned); }
        else if (type === 'burrower') {
            if (!state.burrowers) state.burrowers = [];
            spawned = new Burrower(cx, cy, { id: 'burrower_' + id, hp: 3, surfaceInterval: 3, telegraphTime: 1, stunTime: 2, corePlateIds: [], defeatDoorId: 'boss_door' });
            state.burrowers.push(spawned);
        }
        else if (type === 'gatekeeper') {
            spawned = new Gatekeeper('gk_'+id, cx, cy, { audits: [], vaultDoorId: '' });
            if (!state.gatekeepers) state.gatekeepers = [];
            state.gatekeepers.push(spawned);
        }
        else if (type === 'player') {
            if (!state.player) state.player = new PlayerEntity(cx, cy, 30, 30, 'player');
            else { state.player.x = cx; state.player.y = cy; }
            spawned = state.player;
        }
        else if (type === 'delivery') {
            if (!state.deliveryZone) state.deliveryZone = new DeliveryZone(cx, cy, 100, 100);
            else { state.deliveryZone.x = cx; state.deliveryZone.y = cy; }
            spawned = state.deliveryZone;
        }

        selectedEntity = spawned;
        updatePropertiesPanel();
    };

    function deleteSelectedEntity() {
        if (!selectedEntity) return;
        pushUndo();
        ['walls','doors','plates','hints','lasers','packages','guards','cameras','winds','statics','cracks','robots','burrowers','drones','gatekeepers'].forEach(list => {
            state[list] = state[list].filter(e => e !== selectedEntity);
        });
        selectedEntity = null; updatePropertiesPanel();
    }

    document.getElementById('editor-delete-btn').onclick = () => deleteSelectedEntity();

    // Mac Delete key often emits Backspace; honor both when not typing in a field.
    window.addEventListener('keydown', (e) => {
        if (state.gameState !== 'EDITOR') return;
        if (isTypingTarget()) return;
        const mod = e.metaKey || e.ctrlKey;
        if (mod && e.code === 'KeyC') {
            e.preventDefault();
            if (!e.repeat) copySelected();
            return;
        }
        if (mod && e.code === 'KeyV') {
            e.preventDefault();
            if (!e.repeat) pasteClipboard();
            return;
        }
        if (mod && e.code === 'KeyZ') {
            e.preventDefault();
            if (e.shiftKey) editorRedo();
            else editorUndo();
            return;
        }
        if (mod && e.code === 'KeyY') {
            e.preventDefault();
            editorRedo();
            return;
        }
        if (e.key !== 'Delete' && e.key !== 'Backspace') return;
        e.preventDefault();
        deleteSelectedEntity();
    });

    document.getElementById('editor-export').onclick = () => {
        document.getElementById('editor-json').value = currentLayoutJson();
    };

    document.getElementById('editor-import').onclick = () => {
        let str = document.getElementById('editor-json').value;
        if(str) window.startEditorMode(str);
    };

    canvas.addEventListener('mousedown', e => {
        if (state.gameState !== 'EDITOR') return;
        const { sx, sy } = canvasPoint(canvas, e);
        mouseSX = sx; mouseSY = sy; mouseOnCanvas = true;
        if (e.button === 1) {
            isPanning = true;
            isDragging = false;
            panLastX = sx;
            panLastY = sy;
            e.preventDefault();
            return;
        }
        if (e.button !== 0) return;
        const world = screenToWorld(sx, sy);
        selectedEntity = null;
        
        let allEntities = [state.player, state.deliveryZone, ...state.walls, ...state.doors, ...state.plates, ...(state.hints||[]), ...state.packages, ...state.lasers, ...state.guards, ...state.cameras, ...state.winds, ...state.statics, ...state.cracks, ...state.robots, ...(state.burrowers||[]), ...(state.gatekeepers||[]), ...state.drones];
        
        for (let i = allEntities.length - 1; i >= 0; i--) {
            let ent = allEntities[i];
            let ew = ent.w || 30; let eh = ent.h || 30;
            if (world.x >= ent.x && world.x <= ent.x + ew && world.y >= ent.y && world.y <= ent.y + eh) {
                selectedEntity = ent;
                isDragging = true; dragX = world.x - ent.x; dragY = world.y - ent.y;
                dragStartSnapshot = currentLayoutJson();
                dragStartX = ent.x; dragStartY = ent.y;
                break;
            }
        }
        updatePropertiesPanel();
    });

    canvas.addEventListener('mousemove', e => {
        if (state.gameState !== 'EDITOR') return;
        const { sx, sy } = canvasPoint(canvas, e);
        mouseSX = sx; mouseSY = sy; mouseOnCanvas = true;
        if (isPanning) {
            panCamera(panLastX - sx, panLastY - sy);
            panLastX = sx;
            panLastY = sy;
            return;
        }
        if (!isDragging || !selectedEntity) return;
        const world = screenToWorld(sx, sy);
        const nx = Math.round((world.x - dragX)/10)*10;
        const ny = Math.round((world.y - dragY)/10)*10;
        if (getWaypoints(selectedEntity)) moveEntityTo(selectedEntity, nx, ny);
        else {
            selectedEntity.x = nx; selectedEntity.y = ny;
            if (selectedEntity.startX !== undefined) { selectedEntity.startX = selectedEntity.x; selectedEntity.startY = selectedEntity.y; }
        }
    });

    const endPointer = () => {
        if (isDragging && selectedEntity && dragStartSnapshot &&
            (selectedEntity.x !== dragStartX || selectedEntity.y !== dragStartY)) {
            pushUndo(dragStartSnapshot);
        }
        isDragging = false;
        isPanning = false;
        dragStartSnapshot = null;
    };
    canvas.addEventListener('mouseup', endPointer);
    canvas.addEventListener('mouseleave', () => { mouseOnCanvas = false; endPointer(); });
    canvas.addEventListener('auxclick', e => {
        if (state.gameState === 'EDITOR') e.preventDefault();
    });
    canvas.addEventListener('contextmenu', e => {
        if (state.gameState === 'EDITOR') e.preventDefault();
    });

    
    ensureEditorLevelMeta();
    syncLevelConfigForm();
    bindCrackSpeedControl();

    refreshSaveSlotList();
}

function escapeAttr(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;');
}

function readLinkedIdsFromSelect(select) {
    return [...select.selectedOptions].map(opt => opt.value).filter(Boolean);
}

function updatePropertiesPanel() {
    let panel = document.getElementById('editor-properties');
    if (!panel) return;
    if (!selectedEntity) { panel.innerHTML = 'Click an entity on canvas to edit.'; return; }
    
    let html = `<label>X: <input type="number" id="prop-x" value="${selectedEntity.x}" style="width:60px"></label> `;
    html += `<label>Y: <input type="number" id="prop-y" value="${selectedEntity.y}" style="width:60px"></label><br>`;
    
    const fixedSize = selectedEntity instanceof Gatekeeper;
    if (!fixedSize && selectedEntity.w !== undefined) html += `<label>W: <input type="number" id="prop-w" value="${selectedEntity.w}" style="width:60px"></label> `;
    if (!fixedSize && selectedEntity.h !== undefined) html += `<label>H: <input type="number" id="prop-h" value="${selectedEntity.h}" style="width:60px"></label><br>`;
    
    if (selectedEntity.id !== undefined && selectedEntity.assetName !== 'player') {
        html += `<label>ID: <input type="text" id="prop-id" value="${escapeAttr(selectedEntity.id)}" style="width:100%"></label><br>`;
    }

    if (selectedEntity.linkedIds !== undefined) {
        const linked = new Set(selectedEntity.linkedIds || []);
        const doors = state.doors || [];
        const lasers = state.lasers || [];
        html += `<div style="margin-top:8px;">Linked doors</div>`;
        if (!doors.length && !lasers.length) {
            html += `<div style="color:#7d8590; font-size:0.8rem;">No doors in this level.</div>`;
        } else {
            const count = doors.length + lasers.length;
            html += `<select id="prop-links" multiple size="${Math.min(6, Math.max(2, count))}" style="width:100%; background:#000; color:var(--text-main); border:1px solid #444;">`;
            for (const door of doors) {
                const id = door.id || '';
                html += `<option value="${escapeAttr(id)}" ${linked.has(id) ? 'selected' : ''}>${escapeAttr(id)}</option>`;
            }
            for (const laser of lasers) {
                const id = laser.id || '';
                html += `<option value="${escapeAttr(id)}" ${linked.has(id) ? 'selected' : ''}>${escapeAttr(id)} (laser)</option>`;
            }
            html += `</select>`;
            html += `<div style="color:#7d8590; font-size:0.75rem;">Ctrl/Cmd-click to link multiple.</div>`;
        }
    }

    if (selectedEntity.assetName === 'door' || selectedEntity instanceof Door || selectedEntity instanceof AlarmDoor || selectedEntity instanceof TimerDoor) {
        const doorId = selectedEntity.id;
        const plates = (state.plates || []).filter(p => (p.linkedIds || []).includes(doorId));
        html += `<div style="margin-top:8px;">Plates linked to this door</div>`;
        if (!plates.length) html += `<div style="color:#7d8590; font-size:0.8rem;">None</div>`;
        else html += `<ul style="margin:4px 0 0 16px; padding:0;">${plates.map(p => `<li>${escapeAttr(p.id || '(unnamed)')}</li>`).join('')}</ul>`;
    }

    if (selectedEntity instanceof Package) {
        const pt = selectedEntity.type || 'standard';
        html += `<label>Package type: <select id="prop-pkg-type" style="width:100%; background:#000; color:var(--text-main); border:1px solid #444;">`;
        for (const opt of ['standard','heavy','fragile','timed','decoy','contraband']) {
            html += `<option value="${opt}" ${pt===opt?'selected':''}>${opt}</option>`;
        }
        html += `</select></label><br>`;
    }
    if (selectedEntity instanceof Door || selectedEntity instanceof AlarmDoor || selectedEntity instanceof TimerDoor) {
        const dt = selectedEntity instanceof AlarmDoor ? 'alarm' : selectedEntity instanceof TimerDoor ? 'timer' : 'standard';
        html += `<label>Door type: <select id="prop-door-type" style="width:100%; background:#000; color:var(--text-main); border:1px solid #444;">`;
        for (const [v,lab] of [['standard','standard'],['alarm','alarm/flashing'],['timer','timer']]) {
            html += `<option value="${v}" ${dt===v?'selected':''}>${lab}</option>`;
        }
        html += `</select></label><br>`;
        if (selectedEntity instanceof TimerDoor) {
            html += `<label>Open T: <input type="number" id="prop-openT" value="${selectedEntity.openT||60}" style="width:60px"></label> `;
            html += `<label>Closed T: <input type="number" id="prop-closedT" value="${selectedEntity.closedT||60}" style="width:60px"></label><br>`;
        }
    }
    
    if (selectedEntity instanceof ShooterRobot) {
        html += `<label><input type="checkbox" id="prop-robot-engaged" ${selectedEntity.engaged?'checked':''}> Engaged at start</label><br>`;
        html += `<label><input type="checkbox" id="prop-robot-emerging" ${selectedEntity.isEmerging?'checked':''}> Emerging at start</label><br>`;
        html += `<label>Emerge until path idx: <input type="number" min="0" id="prop-robot-emerge-idx" value="${selectedEntity.emergeUntilPathIndex||0}" style="width:60px"></label><br>`;
        html += `<label>HP: <input type="number" min="1" id="prop-robot-hp" value="${selectedEntity.hp??3}" style="width:60px"></label> `;
        html += `<label>Fire cooldown: <input type="number" min="0" id="prop-robot-cooldown" value="${selectedEntity.fireCooldown||0}" style="width:60px"></label><br>`;
    }

    if (selectedEntity instanceof Burrower) {
        html += `<label>HP: <input type="number" min="1" id="prop-burrower-hp" value="${selectedEntity.maxHp ?? selectedEntity.hp ?? 3}" style="width:60px"></label><br>`;
        html += `<label>Surface interval (sec): <input type="number" min="0.05" step="0.05" id="prop-burrower-surface" value="${selectedEntity.surfaceInterval ?? 3}" style="width:70px"></label><br>`;
        html += `<label>Telegraph (sec): <input type="number" min="0.05" step="0.05" id="prop-burrower-telegraph" value="${selectedEntity.telegraphTime ?? 1}" style="width:70px"></label><br>`;
        html += `<label>Stun (sec): <input type="number" min="0" step="0.05" id="prop-burrower-stun" value="${selectedEntity.stunTime ?? 2}" style="width:70px"></label><br>`;
        html += `<label title="Blank = unlimited. After this many stuns the burrower stays down until rewind.">Max stuns / loop: <input type="number" min="1" step="1" id="prop-burrower-maxstuns" placeholder="unlimited" value="${selectedEntity.maxStunsPerLoop ?? ''}" style="width:70px"></label><br>`;
        html += `<label>Core plate ids: <input type="text" id="prop-burrower-cores" value="${escapeAttr((selectedEntity.corePlateIds || []).join(', '))}" style="width:100%"></label><br>`;
        html += `<label>Defeat door id: <input type="text" id="prop-burrower-door" value="${escapeAttr(selectedEntity.defeatDoorId || 'boss_door')}" style="width:100%"></label><br>`;
    }

    if (selectedEntity instanceof HintPlate) {
        html += `<label>Title: <input type="text" id="prop-hint-title" value="${escapeAttr(selectedEntity.title||'')}" style="width:100%"></label><br>`;
        html += `<label>Demo ID: <input type="text" id="prop-hint-demoId" value="${escapeAttr(selectedEntity.demoId||'')}" style="width:100%"></label><br>`;
        html += `<label><input type="checkbox" id="prop-hint-autoOpen" ${selectedEntity.autoOpen?'checked':''}> Auto-open on step</label><br>`;
        html += `<label>Inline demo JSON<textarea id="prop-hint-demo" rows="6" style="box-sizing:border-box; max-width:100%; width:100%; resize:vertical; overflow:auto; font-family:monospace; font-size:0.75rem;">${escapeAttr(selectedEntity.demo?.steps ? JSON.stringify(selectedEntity.demo, null, 2) : '')}</textarea></label><br>`;
    }

    if (selectedEntity instanceof PressurePlate) {
        const pt = selectedEntity instanceof TemporalPlate ? 'temporal' : 'standard';
        html += `<label>Plate type: <select id="prop-plate-type" style="width:100%; background:#000; color:var(--text-main); border:1px solid #444;">`;
        html += `<option value="standard" ${pt==='standard'?'selected':''}>standard</option>`;
        html += `<option value="temporal" ${pt==='temporal'?'selected':''}>temporal</option>`;
        html += `</select></label><br>`;
        if (selectedEntity instanceof TemporalPlate) {
            const tl = normalizeTimeline(selectedEntity.requiredTimeline);
            html += `<label>Timeline (who can press): <select id="prop-timeline" style="width:100%; background:#000; color:var(--text-main); border:1px solid #444;">`;
            for (const [v, lab] of [['present', '\u25B6 present (live courier)'], ['first', '1 first (oldest echo)'], ['last', 'L last (newest echo)']]) {
                html += `<option value="${v}" ${tl===v?'selected':''}>${lab}</option>`;
            }
            html += `</select></label><br>`;
        }
    }

    if (selectedEntity instanceof Gatekeeper) {
        const vault = selectedEntity.vaultDoorId || '';
        const doorIds = (state.doors || []).map(d => d.id).filter(id => id != null && id !== '');
        if (vault && !doorIds.includes(vault)) doorIds.unshift(vault);
        html += `<label>Vault door <select id="prop-gk-vault" style="width:100%; background:#000; color:var(--text-main); border:1px solid #444;">`;
        html += `<option value="" ${vault === '' ? 'selected' : ''}>(none)</option>`;
        for (const id of doorIds) {
            html += `<option value="${escapeAttr(id)}" ${id === vault ? 'selected' : ''}>${escapeAttr(id)}</option>`;
        }
        html += `</select></label><br>`;
        const shieldVal = selectedEntity.maxShields ?? selectedEntity.shields ?? 0;
        html += `<label>Shields: <input type="number" min="0" step="1" id="prop-gk-shields" value="${shieldVal}" style="width:60px"></label><br>`;
        html += `<div style="margin-top:8px;">Audits (plate + tick)</div>`;
        const plateIds = (state.plates || []).map(p => p.id).filter(id => id != null && id !== '');
        (selectedEntity.audits || []).forEach((a, i) => {
            const options = plateIds.slice();
            if (a.plateId && !options.includes(a.plateId)) options.unshift(a.plateId);
            html += `<div class="prop-gk-row">${i}: <select class="prop-gk-plate" data-i="${i}" style="max-width:46%; background:#000; color:var(--text-main); border:1px solid #444;">`;
            html += `<option value="" ${!a.plateId ? 'selected' : ''}>(plate)</option>`;
            for (const id of options) {
                html += `<option value="${escapeAttr(id)}" ${id === a.plateId ? 'selected' : ''}>${escapeAttr(id)}</option>`;
            }
            html += `</select> <input type="number" class="prop-gk-tick" data-i="${i}" value="${Number(a.tick)}" style="width:72px"> <button class="prop-gk-del secondary-btn" data-i="${i}" title="Remove audit">✕</button></div>`;
        });
        html += `<button id="prop-gk-add" class="secondary-btn" style="width:100%; margin-top:4px;">+ Add audit</button><br>`;
    }

    const wps = getWaypoints(selectedEntity);
    if (wps) {
        html += `<div style="margin-top:8px;">Waypoints (X/Y moves the whole route)</div>`;
        wps.forEach((p, i) => {
            html += `<div class="prop-wp-row">${i}: <input type="number" class="prop-wp-x" data-i="${i}" value="${p.x}" style="width:56px"> <input type="number" class="prop-wp-y" data-i="${i}" value="${p.y}" style="width:56px"> <button class="prop-wp-del secondary-btn" data-i="${i}" ${wps.length <= 2 ? 'disabled' : ''} title="Remove waypoint">✕</button></div>`;
        });
        html += `<button id="prop-wp-add" class="secondary-btn" style="width:100%; margin-top:4px;">+ Add waypoint</button><br>`;
    }
    if (selectedEntity instanceof SweepCamera) {
        html += `<label>Angle°: <input type="number" id="prop-cam-angle" step="5" value="${radToDeg(selectedEntity.baseAngle)}" style="width:60px"></label> `;
        html += `<label>Sweep°: <input type="number" id="prop-cam-sweep" step="5" min="0" value="${radToDeg(selectedEntity.sweepRange)}" style="width:60px"></label><br>`;
    }

    html += `<button id="prop-save" class="secondary-btn" style="width:100%; margin-top:10px; border-color:#0ff; color:#0ff;">Apply</button>`;
    panel.innerHTML = html;
    
    const linkSelect = document.getElementById('prop-links');
    if (linkSelect) {
        linkSelect.onchange = () => {
            selectedEntity.linkedIds = readLinkedIdsFromSelect(linkSelect);
        };
    }

    const readGkAudits = () => [...panel.querySelectorAll('.prop-gk-plate')].map(el => {
        const tick = Number(panel.querySelector(`.prop-gk-tick[data-i="${el.dataset.i}"]`)?.value);
        return { plateId: el.value, tick: Number.isFinite(tick) ? tick : 0 };
    });
    const readGkEdits = () => ({
        id: document.getElementById('prop-id')?.value,
        vaultDoorId: document.getElementById('prop-gk-vault')?.value ?? '',
        shields: document.getElementById('prop-gk-shields')?.value,
        audits: readGkAudits()
    });
    const syncShieldsToAudits = (before) => {
        if (selectedEntity.maxShields !== before) return;
        selectedEntity.maxShields = selectedEntity.audits.length;
        selectedEntity.shields = selectedEntity.maxShields;
    };
    const gkAdd = document.getElementById('prop-gk-add');
    if (gkAdd) gkAdd.onclick = () => {
        pushUndo();
        applyGatekeeperEdits(selectedEntity, readGkEdits());
        const before = selectedEntity.audits.length;
        const last = before ? selectedEntity.audits[before - 1].tick : 0;
        const plateId = (state.plates && state.plates[0] && state.plates[0].id) || '';
        addAudit(selectedEntity, { plateId, tick: last + 60 });
        syncShieldsToAudits(before);
        updatePropertiesPanel();
    };
    panel.querySelectorAll('.prop-gk-del').forEach(btn => {
        btn.onclick = () => {
            pushUndo();
            applyGatekeeperEdits(selectedEntity, readGkEdits());
            const before = selectedEntity.audits.length;
            removeAudit(selectedEntity, parseInt(btn.dataset.i, 10));
            syncShieldsToAudits(before);
            updatePropertiesPanel();
        };
    });

    const origX = selectedEntity.x; const origY = selectedEntity.y;
    const readWaypointInputs = () => [...panel.querySelectorAll('.prop-wp-x')].map(el => ({
        x: parseFloat(el.value),
        y: parseFloat(panel.querySelector(`.prop-wp-y[data-i="${el.dataset.i}"]`).value)
    }));
    const wpAdd = document.getElementById('prop-wp-add');
    if (wpAdd) wpAdd.onclick = () => {
        pushUndo();
        applyInspectorEdits(selectedEntity, { waypoints: readWaypointInputs() });
        addWaypoint(selectedEntity);
        updatePropertiesPanel();
    };
    panel.querySelectorAll('.prop-wp-del').forEach(btn => {
        btn.onclick = () => {
            pushUndo();
            applyInspectorEdits(selectedEntity, { waypoints: readWaypointInputs() });
            removeWaypoint(selectedEntity, parseInt(btn.dataset.i, 10));
            updatePropertiesPanel();
        };
    });

    document.getElementById('prop-save').onclick = () => {
        pushUndo();
        const nx = parseFloat(document.getElementById('prop-x').value);
        const ny = parseFloat(document.getElementById('prop-y').value);
        if (wps) {
            const edits = { waypoints: readWaypointInputs() };
            if (nx !== origX || ny !== origY) { edits.x = nx; edits.y = ny; }
            applyInspectorEdits(selectedEntity, edits);
        } else {
            selectedEntity.x = nx;
            selectedEntity.y = ny;
        }
        if (document.getElementById('prop-cam-angle')) {
            applyInspectorEdits(selectedEntity, {
                baseAngle: degToRad(parseFloat(document.getElementById('prop-cam-angle').value)),
                sweepRange: degToRad(parseFloat(document.getElementById('prop-cam-sweep').value))
            });
        }
        if (document.getElementById('prop-w')) selectedEntity.w = parseFloat(document.getElementById('prop-w').value);
        if (document.getElementById('prop-h')) selectedEntity.h = parseFloat(document.getElementById('prop-h').value);
        if (document.getElementById('prop-id') && !(selectedEntity instanceof Gatekeeper)) selectedEntity.id = document.getElementById('prop-id').value;
        if (selectedEntity instanceof Gatekeeper) applyGatekeeperEdits(selectedEntity, readGkEdits());
        if (linkSelect) selectedEntity.linkedIds = readLinkedIdsFromSelect(linkSelect);
        if (document.getElementById('prop-pkg-type')) selectedEntity.type = document.getElementById('prop-pkg-type').value;
        if (document.getElementById('prop-openT')) selectedEntity.openT = parseInt(document.getElementById('prop-openT').value, 10) || 60;
        if (document.getElementById('prop-closedT')) selectedEntity.closedT = parseInt(document.getElementById('prop-closedT').value, 10) || 60;
        if (document.getElementById('prop-timeline')) selectedEntity.requiredTimeline = normalizeTimeline(document.getElementById('prop-timeline').value);

        if (document.getElementById('prop-robot-engaged')) {
            selectedEntity.engaged = document.getElementById('prop-robot-engaged').checked;
            selectedEntity.isEmerging = document.getElementById('prop-robot-emerging').checked;
            selectedEntity.emergeUntilPathIndex = Math.max(0, parseInt(document.getElementById('prop-robot-emerge-idx').value, 10) || 0);
            selectedEntity.hp = Math.max(1, parseInt(document.getElementById('prop-robot-hp').value, 10) || 3);
            selectedEntity.fireCooldown = Math.max(0, parseInt(document.getElementById('prop-robot-cooldown').value, 10) || 0);
        }
        if (document.getElementById('prop-burrower-hp')) {
            applyBurrowerConfig(selectedEntity, {
                hp: document.getElementById('prop-burrower-hp').value,
                surfaceInterval: document.getElementById('prop-burrower-surface').value,
                telegraphTime: document.getElementById('prop-burrower-telegraph').value,
                stunTime: document.getElementById('prop-burrower-stun').value,
                maxStunsPerLoop: document.getElementById('prop-burrower-maxstuns').value,
                corePlateIds: document.getElementById('prop-burrower-cores').value,
                defeatDoorId: document.getElementById('prop-burrower-door').value
            });
        }
        if (document.getElementById('prop-hint-title')) selectedEntity.title = document.getElementById('prop-hint-title').value || 'Hint Demo';
        if (document.getElementById('prop-hint-demoId')) selectedEntity.demoId = document.getElementById('prop-hint-demoId').value || null;
        if (document.getElementById('prop-hint-autoOpen')) selectedEntity.autoOpen = document.getElementById('prop-hint-autoOpen').checked;
        if (document.getElementById('prop-hint-demo')) {
            const raw = document.getElementById('prop-hint-demo').value.trim();
            if (!raw) selectedEntity.demo = null;
            else {
                try {
                    const parsed = JSON.parse(raw);
                    selectedEntity.demo = parsed.steps ? cloneDemo(parsed) : cloneDemo({ skippable: true, steps: parsed });
                } catch (err) {
                    setSaveStatus('Hint demo JSON invalid', false);
                    return;
                }
            }
        }

        if (document.getElementById('prop-door-type')) {
            const want = document.getElementById('prop-door-type').value;
            const cur = selectedEntity instanceof AlarmDoor ? 'alarm' : selectedEntity instanceof TimerDoor ? 'timer' : 'standard';
            if (want !== cur) {
                const idx = state.doors.indexOf(selectedEntity);
                let replacement;
                if (want === 'alarm') replacement = new AlarmDoor(selectedEntity.id, selectedEntity.x, selectedEntity.y, selectedEntity.w, selectedEntity.h);
                else if (want === 'timer') replacement = new TimerDoor(selectedEntity.id, selectedEntity.x, selectedEntity.y, selectedEntity.w, selectedEntity.h, selectedEntity.openT || 60, selectedEntity.closedT || 60);
                else replacement = new Door(selectedEntity.id, selectedEntity.x, selectedEntity.y, selectedEntity.w, selectedEntity.h);
                if (idx >= 0) state.doors[idx] = replacement;
                selectedEntity = replacement;
            }
        }
        if (document.getElementById('prop-plate-type')) {
            const want = document.getElementById('prop-plate-type').value;
            const cur = selectedEntity instanceof TemporalPlate ? 'temporal' : 'standard';
            if (want !== cur) {
                const idx = state.plates.indexOf(selectedEntity);
                let replacement;
                if (want === 'temporal') replacement = new TemporalPlate(selectedEntity.id, selectedEntity.x, selectedEntity.y, selectedEntity.linkedIds, selectedEntity.requiredTimeline || 'present');
                else replacement = new PressurePlate(selectedEntity.id, selectedEntity.x, selectedEntity.y, selectedEntity.linkedIds);
                if (idx >= 0) state.plates[idx] = replacement;
                selectedEntity = replacement;
            }
        }
        if (selectedEntity.startX !== undefined) { selectedEntity.startX = selectedEntity.x; selectedEntity.startY = selectedEntity.y; }
        updatePropertiesPanel();
    };
}

export function drawEditorOverlay(ctx) {
    if (!selectedEntity) return;
    ctx.strokeStyle = '#39ff14'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]);
    ctx.strokeRect(selectedEntity.x - 2, selectedEntity.y - 2, (selectedEntity.w || 30) + 4, (selectedEntity.h || 30) + 4);
    ctx.setLineDash([]);
}
