import { state } from '../core/state.js';
import { LEVELS, serializeLevel, deserializeLevel, createBoundWalls, isBoundWall } from '../data/levels.js';
import { keys } from '../core/input.js';
import { panCamera, screenToWorld, getCamera, getMapSize, setMapSize, VIEW_WIDTH, VIEW_HEIGHT } from '../core/camera.js';
import { Wall, Door, AlarmDoor, TimerDoor, PressurePlate, TemporalPlate, Package } from '../entities/interactables.js';
import { Laser, SweepCamera, Guard, Drone, WindTunnel, StaticZone, CrackedFloor, ShooterRobot } from '../entities/hazards.js';
import { DeliveryZone } from '../entities/zones.js';
import { PlayerEntity } from '../entities/actors.js';

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
    ['packages', 'package'],
    ['lasers', 'laser'],
    ['guards', 'guard'],
    ['cameras', 'camera'],
    ['drones', 'drone'],
    ['winds', 'wind'],
    ['statics', 'static'],
    ['cracks', 'crack'],
    ['robots', 'robot']
];

const DEFAULT_EDITOR_META = () => ({
    name: 'Editor Level',
    story: { speaker: '', text: '' },
    obj: '',
    grants: [],
    maxGhosts: 3
});

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
        maxGhosts: level.maxGhosts ?? 3
    };
    return state.editorLevelMeta;
}

function syncLevelConfigForm() {
    const meta = ensureEditorLevelMeta();
    const speaker = document.getElementById('editor-meta-speaker');
    const text = document.getElementById('editor-meta-text');
    const obj = document.getElementById('editor-meta-obj');
    const maxG = document.getElementById('editor-meta-maxghosts');
    if (speaker) speaker.value = meta.story?.speaker || '';
    if (text) text.value = meta.story?.text || '';
    if (obj) obj.value = meta.obj || '';
    if (maxG) maxG.value = meta.maxGhosts ?? 3;
    const grants = new Set(meta.grants || []);
    for (const id of ['dash', 'toss', 'cloak', 'ghostShield']) {
        const el = document.getElementById('editor-meta-' + id);
        if (el) el.checked = grants.has(id);
    }
}

function applyLevelConfigForm() {
    const grants = [];
    for (const id of ['dash', 'toss', 'cloak', 'ghostShield']) {
        if (document.getElementById('editor-meta-' + id)?.checked) grants.push(id);
    }
    state.editorLevelMeta = {
        name: ensureEditorLevelMeta().name || 'Editor Level',
        story: {
            speaker: document.getElementById('editor-meta-speaker')?.value || '',
            text: document.getElementById('editor-meta-text')?.value || ''
        },
        obj: document.getElementById('editor-meta-obj')?.value || '',
        grants,
        maxGhosts: parseInt(document.getElementById('editor-meta-maxghosts')?.value, 10) || 0
    };
    setSaveStatus('Level config applied');
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
    const spawned = (deserializeLevel({ [clipboard.list]: [data] })[clipboard.list] || [])[0];
    if (!spawned) return;
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
    document.getElementById('editor-meta-apply')?.addEventListener('click', () => {
        applyLevelConfigForm();
    });
    ensureEditorLevelMeta();
    syncLevelConfigForm();
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
        else if (type === 'plate_temporal') { spawned = new TemporalPlate('p_'+id, cx, cy, 'd_0', 'present'); state.plates.push(spawned); }
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
        else if (type === 'crack') { spawned = new CrackedFloor(cx, cy, 40, 40); state.cracks.push(spawned); }
        else if (type === 'robot') { spawned = new ShooterRobot([{x:cx,y:cy}, {x:cx+40,y:cy}]); state.robots.push(spawned); }
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
        ['walls','doors','plates','lasers','packages','guards','cameras','winds','statics','cracks','robots','drones'].forEach(list => {
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
        
        let allEntities = [state.player, state.deliveryZone, ...state.walls, ...state.doors, ...state.plates, ...state.packages, ...state.lasers, ...state.guards, ...state.cameras, ...state.winds, ...state.statics, ...state.cracks, ...state.robots, ...state.drones];
        
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
        selectedEntity.x = Math.round((world.x - dragX)/10)*10;
        selectedEntity.y = Math.round((world.y - dragY)/10)*10;
        if (selectedEntity.startX !== undefined) { selectedEntity.startX = selectedEntity.x; selectedEntity.startY = selectedEntity.y; }
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
    
    if (selectedEntity.w !== undefined) html += `<label>W: <input type="number" id="prop-w" value="${selectedEntity.w}" style="width:60px"></label> `;
    if (selectedEntity.h !== undefined) html += `<label>H: <input type="number" id="prop-h" value="${selectedEntity.h}" style="width:60px"></label><br>`;
    
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
    if (selectedEntity instanceof PressurePlate) {
        const pt = selectedEntity instanceof TemporalPlate ? 'temporal' : 'standard';
        html += `<label>Plate type: <select id="prop-plate-type" style="width:100%; background:#000; color:var(--text-main); border:1px solid #444;">`;
        html += `<option value="standard" ${pt==='standard'?'selected':''}>standard</option>`;
        html += `<option value="temporal" ${pt==='temporal'?'selected':''}>temporal</option>`;
        html += `</select></label><br>`;
        if (selectedEntity instanceof TemporalPlate) {
            html += `<label>Timeline: <input type="text" id="prop-timeline" value="${selectedEntity.requiredTimeline||'present'}" style="width:100%"></label><br>`;
        }
    }

    html += `<button id="prop-save" class="secondary-btn" style="width:100%; margin-top:10px; border-color:#0ff; color:#0ff;">Apply</button>`;
    panel.innerHTML = html;
    
    const linkSelect = document.getElementById('prop-links');
    if (linkSelect) {
        linkSelect.onchange = () => {
            selectedEntity.linkedIds = readLinkedIdsFromSelect(linkSelect);
        };
    }

    document.getElementById('prop-save').onclick = () => {
        pushUndo();
        selectedEntity.x = parseFloat(document.getElementById('prop-x').value);
        selectedEntity.y = parseFloat(document.getElementById('prop-y').value);
        if (document.getElementById('prop-w')) selectedEntity.w = parseFloat(document.getElementById('prop-w').value);
        if (document.getElementById('prop-h')) selectedEntity.h = parseFloat(document.getElementById('prop-h').value);
        if (document.getElementById('prop-id')) selectedEntity.id = document.getElementById('prop-id').value;
        if (linkSelect) selectedEntity.linkedIds = readLinkedIdsFromSelect(linkSelect);
        if (document.getElementById('prop-pkg-type')) selectedEntity.type = document.getElementById('prop-pkg-type').value;
        if (document.getElementById('prop-openT')) selectedEntity.openT = parseInt(document.getElementById('prop-openT').value, 10) || 60;
        if (document.getElementById('prop-closedT')) selectedEntity.closedT = parseInt(document.getElementById('prop-closedT').value, 10) || 60;
        if (document.getElementById('prop-timeline')) selectedEntity.requiredTimeline = document.getElementById('prop-timeline').value || 'present';
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
