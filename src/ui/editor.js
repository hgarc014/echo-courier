import { state } from '../core/state.js';
import { LEVELS } from '../data/levels.js';
import { Wall, Door, PressurePlate, TemporalPlate, Package, AlarmDoor, TimerDoor } from '../entities/interactables.js';
import { Laser, SweepCamera, Guard, Drone, WindTunnel, StaticZone, CrackedFloor, ShooterRobot } from '../entities/hazards.js';

export let selectedEntity = null;
let dragX = 0; let dragY = 0; let isDragging = false;

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

    document.getElementById('editor-spawn-btn').onclick = () => {
        let type = document.getElementById('editor-entity-type').value;
        let spawned = null;
        let cx = 400; let cy = 300;
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

    document.getElementById('editor-delete-btn').onclick = () => {
        if (!selectedEntity) return;
        ['walls','doors','plates','lasers','packages','guards','cameras','winds','statics','cracks','robots','drones'].forEach(list => {
            state[list] = state[list].filter(e => e !== selectedEntity);
        });
        selectedEntity = null; updatePropertiesPanel();
    };

    document.getElementById('editor-export').onclick = () => {
        let layout = {
            player: { x: state.player.x, y: state.player.y },
            deliveryZone: { x: state.deliveryZone.x, y: state.deliveryZone.y, w: state.deliveryZone.w, h: state.deliveryZone.h },
            walls: state.walls.map(w => ({ x: w.x, y: w.y, w: w.w, h: w.h })),
            doors: state.doors.map(d => ({ x: d.x, y: d.y, w: d.w, h: d.h, id: d.id, type: (d instanceof AlarmDoor)?'alarm':(d instanceof TimerDoor)?'timer':'standard' })),
            plates: state.plates.map(p => ({ x: p.x, y: p.y, linkedIds: p.linkedIds, id: p.id, type: (p instanceof TemporalPlate)?'temporal':'standard', requiredTimeline: p.requiredTimeline })),
            packages: state.packages.map(p => ({ x: p.startX, y: p.startY, id: p.id, packageType: p.type })),
            lasers: state.lasers.map(l => ({ x: l.x, y: l.y, w: l.w, h: l.h, id: l.id })),
            guards: state.guards.map(g => ({ path: g.path })),
            cameras: state.cameras.map(c => ({ x: c.x, y: c.y, baseAngle: c.baseAngle, sweepRange: c.sweepRange })),
            drones: state.drones.map(d => ({ path: d.path })),
            winds: state.winds.map(w => ({ x: w.x, y: w.y, w: w.w, h: w.h, vx: w.vx, vy: w.vy })),
            statics: state.statics.map(s => ({ x: s.x, y: s.y, w: s.w, h: s.h })),
            cracks: state.cracks.map(c => ({ x: c.x, y: c.y, w: c.w, h: c.h })),
            robots: state.robots.map(r => ({ path: r.path }))
        };
        document.getElementById('editor-json').value = JSON.stringify(layout);
    };

    document.getElementById('editor-import').onclick = () => {
        let str = document.getElementById('editor-json').value;
        if(str) window.startEditorMode(str);
    };

    canvas.addEventListener('mousedown', e => {
        if (state.gameState !== 'EDITOR') return;
        let rect = canvas.getBoundingClientRect(); 
        let mx = (e.clientX - rect.left) * (canvas.width / rect.width); 
        let my = (e.clientY - rect.top) * (canvas.height / rect.height);
        selectedEntity = null;
        
        let allEntities = [state.player, state.deliveryZone, ...state.walls, ...state.doors, ...state.plates, ...state.packages, ...state.lasers, ...state.guards, ...state.cameras, ...state.winds, ...state.statics, ...state.cracks, ...state.robots, ...state.drones];
        
        for (let i = allEntities.length - 1; i >= 0; i--) {
            let ent = allEntities[i];
            let ew = ent.w || 30; let eh = ent.h || 30;
            if (mx >= ent.x && mx <= ent.x + ew && my >= ent.y && my <= ent.y + eh) {
                selectedEntity = ent;
                isDragging = true; dragX = mx - ent.x; dragY = my - ent.y; break;
            }
        }
        updatePropertiesPanel();
    });

    canvas.addEventListener('mousemove', e => {
        if (state.gameState !== 'EDITOR' || !isDragging || !selectedEntity) return;
        let rect = canvas.getBoundingClientRect(); 
        let mx = (e.clientX - rect.left) * (canvas.width / rect.width); 
        let my = (e.clientY - rect.top) * (canvas.height / rect.height);
        selectedEntity.x = Math.round((mx - dragX)/10)*10;
        selectedEntity.y = Math.round((my - dragY)/10)*10;
        if (selectedEntity.startX !== undefined) { selectedEntity.startX = selectedEntity.x; selectedEntity.startY = selectedEntity.y; }
    });

    canvas.addEventListener('mouseup', () => { isDragging = false; });
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
