import { state } from '../core/state.js';
import { LEVELS, serializeLevel, createBoundWalls, isBoundWall } from '../data/levels.js';
import { keys } from '../core/input.js';
import { panCamera, screenToWorld, getCamera, getMapSize, setMapSize, VIEW_WIDTH, VIEW_HEIGHT } from '../core/camera.js';
import { Wall, Door, PressurePlate, Package } from '../entities/interactables.js';
import { Laser, SweepCamera, Guard, WindTunnel, StaticZone } from '../entities/hazards.js';

export const EDITOR_SAVE_PREFIX = 'echoCourier_editorSave_';

export let selectedEntity = null;
let dragX = 0; let dragY = 0; let isDragging = false;
let isPanning = false;
let panLastX = 0; let panLastY = 0;
let mouseSX = 0; let mouseSY = 0;
let mouseOnCanvas = false;

const EDGE_PAN = 28;
const EDGE_SPEED = 8;
const KEY_PAN_SPEED = 12;

function canvasPoint(canvas, e) {
    const rect = canvas.getBoundingClientRect();
    return {
        sx: (e.clientX - rect.left) * (canvas.width / rect.width),
        sy: (e.clientY - rect.top) * (canvas.height / rect.height)
    };
}

function isTypingTarget() {
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
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
    refreshSaveSlotList();
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
        window.startEditorMode(null, idx);
    };

    document.getElementById('editor-map-apply')?.addEventListener('click', () => {
        const w = parseInt(document.getElementById('editor-map-w').value, 10);
        const h = parseInt(document.getElementById('editor-map-h').value, 10);
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
        let type = document.getElementById('editor-entity-type').value;
        let spawned = null;
        const cam = getCamera();
        let cx = Math.round((cam.x + VIEW_WIDTH / 2) / 10) * 10;
        let cy = Math.round((cam.y + VIEW_HEIGHT / 2) / 10) * 10;
        if (type === 'wall') { spawned = new Wall(cx, cy, 40, 40); state.walls.push(spawned); }
        else if (type === 'door') { spawned = new Door('d_'+Date.now(), cx, cy, 40, 80); state.doors.push(spawned); }
        else if (type === 'plate') { spawned = new PressurePlate('p_'+Date.now(), cx, cy, 'd_0'); state.plates.push(spawned); }
        else if (type === 'laser') { spawned = new Laser('l_'+Date.now(), cx, cy, 20, 80); state.lasers.push(spawned); }
        else if (type === 'package') { spawned = new Package('pkg_'+Date.now(), cx, cy, 'standard'); state.packages.push(spawned); }
        else if (type === 'guard') { spawned = new Guard([{x:cx,y:cy}, {x:cx+50,y:cy}]); state.guards.push(spawned); }
        else if (type === 'camera') { spawned = new SweepCamera(cx, cy, 0, Math.PI/2); state.cameras.push(spawned); }
        else if (type === 'wind') { spawned = new WindTunnel(cx, cy, 40, 80, 0, 5); state.winds.push(spawned); }
        else if (type === 'static') { spawned = new StaticZone(cx, cy, 80, 80); state.statics.push(spawned); }
        
        selectedEntity = spawned;
        updatePropertiesPanel();
    };

    function deleteSelectedEntity() {
        if (!selectedEntity) return;
        ['walls','doors','plates','lasers','packages','guards','cameras','winds','statics','cracks','robots','drones'].forEach(list => {
            state[list] = state[list].filter(e => e !== selectedEntity);
        });
        selectedEntity = null; updatePropertiesPanel();
    }

    document.getElementById('editor-delete-btn').onclick = () => deleteSelectedEntity();

    // Mac Delete key often emits Backspace; honor both when not typing in a field.
    window.addEventListener('keydown', (e) => {
        if (state.gameState !== 'EDITOR') return;
        if (e.key !== 'Delete' && e.key !== 'Backspace') return;
        const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
        if (tag === 'input' || tag === 'textarea' || (e.target && e.target.isContentEditable)) return;
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
                isDragging = true; dragX = world.x - ent.x; dragY = world.y - ent.y; break;
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

    const endPointer = () => { isDragging = false; isPanning = false; };
    canvas.addEventListener('mouseup', endPointer);
    canvas.addEventListener('mouseleave', () => { mouseOnCanvas = false; endPointer(); });
    canvas.addEventListener('auxclick', e => {
        if (state.gameState === 'EDITOR') e.preventDefault();
    });
    canvas.addEventListener('contextmenu', e => {
        if (state.gameState === 'EDITOR') e.preventDefault();
    });

    refreshSaveSlotList();
}

function updatePropertiesPanel() {
    let panel = document.getElementById('editor-properties');
    if (!selectedEntity) { panel.innerHTML = 'Click an entity on canvas to edit.'; return; }
    
    let html = `<label>X: <input type="number" id="prop-x" value="${selectedEntity.x}" style="width:60px"></label> `;
    html += `<label>Y: <input type="number" id="prop-y" value="${selectedEntity.y}" style="width:60px"></label><br>`;
    
    if (selectedEntity.w !== undefined) html += `<label>W: <input type="number" id="prop-w" value="${selectedEntity.w}" style="width:60px"></label> `;
    if (selectedEntity.h !== undefined) html += `<label>H: <input type="number" id="prop-h" value="${selectedEntity.h}" style="width:60px"></label><br>`;
    
    if (selectedEntity.id !== undefined && selectedEntity.assetName !== 'player') html += `<label>ID: <input type="text" id="prop-id" value="${selectedEntity.id}" style="width:100%"></label><br>`;
    if (selectedEntity.linkedIds !== undefined) html += `<label>Linked ID: <input type="text" id="prop-link" value="${selectedEntity.linkedIds[0] || ''}" style="width:100%"></label><br>`;
    
    html += `<button id="prop-save" class="secondary-btn" style="width:100%; margin-top:10px; border-color:#0ff; color:#0ff;">Apply</button>`;
    panel.innerHTML = html;
    
    document.getElementById('prop-save').onclick = () => {
        selectedEntity.x = parseFloat(document.getElementById('prop-x').value);
        selectedEntity.y = parseFloat(document.getElementById('prop-y').value);
        if (document.getElementById('prop-w')) selectedEntity.w = parseFloat(document.getElementById('prop-w').value);
        if (document.getElementById('prop-h')) selectedEntity.h = parseFloat(document.getElementById('prop-h').value);
        if (document.getElementById('prop-id')) selectedEntity.id = document.getElementById('prop-id').value;
        if (document.getElementById('prop-link')) selectedEntity.linkedIds = [document.getElementById('prop-link').value];
    };
}

export function drawEditorOverlay(ctx) {
    if (!selectedEntity) return;
    ctx.strokeStyle = '#39ff14'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]);
    ctx.strokeRect(selectedEntity.x - 2, selectedEntity.y - 2, (selectedEntity.w || 30) + 4, (selectedEntity.h || 30) + 4);
    ctx.setLineDash([]);
}
