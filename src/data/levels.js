import { state } from '../core/state.js';
import { PlayerEntity } from '../entities/actors.js';
import { Package, PressurePlate, TemporalPlate, Door, AlarmDoor, TimerDoor, Wall } from '../entities/interactables.js';
import { Laser, SweepCamera, Drone, Guard, WindTunnel, StaticZone, CrackedFloor, ShooterRobot, LaserProjectile, Pit } from '../entities/hazards.js';
import { DeliveryZone } from '../entities/zones.js';
import { DEFAULT_MAP_WIDTH, DEFAULT_MAP_HEIGHT } from '../core/camera.js';

let player, deliveryZone, walls, doors, plates, packages, lasers, guards, cameras, drones, winds, statics, cracks, robots, projectiles;

export function createBoundWalls(w, h, t = 20) {
    return [
        new Wall(0, 0, w, t),
        new Wall(0, h - t, w, t),
        new Wall(0, 0, t, h),
        new Wall(w - t, 0, t, h)
    ];
}

export function isBoundWall(wall, w, h, t = 20) {
    if (!wall) return false;
    if (wall.x === 0 && wall.y === 0 && wall.h === t && wall.w === w) return true;
    if (wall.x === 0 && wall.y === h - t && wall.h === t && wall.w === w) return true;
    if (wall.x === 0 && wall.y === 0 && wall.w === t && wall.h === h) return true;
    if (wall.x === w - t && wall.y === 0 && wall.w === t && wall.h === h) return true;
    return false;
}

function layoutMapSize(data, fallback) {
    const w = data?.width || data?.mapWidth || fallback?.mapWidth || DEFAULT_MAP_WIDTH;
    const h = data?.height || data?.mapHeight || fallback?.mapHeight || DEFAULT_MAP_HEIGHT;
    return { mapWidth: w, mapHeight: h };
}

function setupDevSandbox() {
    const W = 1600;
    const H = 1200;
    player = new PlayerEntity(80, 80, 30, 30, 'player');
    deliveryZone = new DeliveryZone(1420, 1000, 120, 120);
    walls = [
        ...createBoundWalls(W, H),
        new Wall(400, 20, 20, 480),
        new Wall(800, 20, 20, 480),
        new Wall(1200, 20, 20, 480),
        new Wall(400, 700, 20, 480),
        new Wall(800, 700, 20, 480),
        new Wall(1200, 700, 20, 480),
        new Wall(180, 180, 20, 200),
        new Wall(980, 180, 160, 20)
    ];
    doors = [
        new Door('sb_door', 180, 240, 20, 80),
        new TimerDoor('sb_timer', 400, 500, 80, 20, 90, 90),
        new AlarmDoor('sb_alarm', 980, 180, 80, 20)
    ];
    plates = [
        new PressurePlate('sb_plate', 80, 300, 'sb_door'),
        new PressurePlate('sb_laser_plate', 460, 80, 'sb_laser'),
        new TemporalPlate('sb_temporal', 250, 80, 'sb_door', 'present')
    ];
    packages = [
        new Package('sb_std', 140, 80, 'standard'),
        new Package('sb_heavy', 80, 820, 'heavy'),
        new Package('sb_fragile', 620, 200, 'fragile'),
        new Package('sb_timed', 860, 820, 'timed'),
        new Package('sb_contra', 920, 280, 'contraband'),
        new Package('sb_decoy', 1280, 820, 'decoy')
    ];
    lasers = [new Laser('sb_laser', 560, 40, 20, 440)];
    guards = [new Guard([{ x: 1280, y: 80 }, { x: 1480, y: 80 }, { x: 1480, y: 400 }, { x: 1280, y: 400 }])];
    cameras = [new SweepCamera(900, 40, Math.PI / 2, Math.PI / 4)];
    drones = [new Drone([{ x: 1280, y: 760 }, { x: 1480, y: 760 }, { x: 1480, y: 960 }, { x: 1280, y: 960 }])];
    winds = [new WindTunnel(450, 740, 80, 400, 0, 5)];
    statics = [new StaticZone(620, 760, 140, 200)];
    cracks = [];
    for (let i = 0; i < 6; i++) cracks.push(new CrackedFloor(80 + i * 40, 940, 40, 80));
    robots = [new ShooterRobot([{ x: 1320, y: 1040 }, { x: 1480, y: 1040 }])];
    robots[0].engaged = true;
    robots[0].fireCooldown = 90;
    projectiles = [];
}

export const LEVELS = [
    { name: "Level 1: The Basics", story: { speaker: "ChronoHaul Dispatch", text: "Courier 83-A, welcome to your shift. Route efficiency is down 4%. Deploy your Temporal Payload to generate a logistics artifact (Echo). Echoes are non-sentient and property of ChronoHaul." }, obj: "Deliver the package using an echo to hold the door.", challenge: { desc: "Finish in 2 loops or fewer", check: () => state.pastRuns.length <= 1 }, maxGhosts: 1, setup: () => { player=new PlayerEntity(100,450,30,30,'player'); deliveryZone=new DeliveryZone(50,50,100,100); walls=[new Wall(0,0,800,20),new Wall(0,580,800,20),new Wall(0,0,20,600),new Wall(780,0,20,600),new Wall(400,0,40,250),new Wall(400,330,40,270)]; doors=[new Door('d1',400,250,40,80)]; plates=[new PressurePlate('p1',250,450,'d1')]; packages=[new Package('pkg1',650,150)]; lasers=[]; guards=[]; cameras=[]; drones=[]; winds=[]; statics=[]; cracks=[]; robots=[]; projectiles=[]; } },
    { name: "Level 2: The Airlock", story: { speaker: "Local Hub Manager", text: "We’ve authorized a double-echo payload for this route. Remember, overlapping timelines are unstable. Don't think about it too much, just deliver the box." }, obj: "Two ghosts unlocked! Coordinate them to hold both doors.", challenge: { desc: "Finish in 3 loops or fewer", check: () => state.pastRuns.length <= 2 }, maxGhosts: 2, setup: () => { player=new PlayerEntity(50,300,30,30,'player'); deliveryZone=new DeliveryZone(50,450,100,100); walls=[new Wall(0,0,800,20),new Wall(0,580,800,20),new Wall(0,0,20,600),new Wall(780,0,20,600),new Wall(250,0,40,250),new Wall(250,330,40,270),new Wall(550,0,40,250),new Wall(550,330,40,270)]; doors=[new Door('d1',250,250,40,80),new Door('d2',550,250,40,80)]; plates=[new PressurePlate('p1',150,150,'d1'),new PressurePlate('p2',400,150,'d2')]; packages=[new Package('pkg1',650,300)]; lasers=[]; guards=[]; cameras=[]; drones=[]; winds=[]; statics=[]; cracks=[]; robots=[]; projectiles=[]; } },
    { name: "Level 3: Heavy Lifting", story: { speaker: "Local Hub Manager", text: "High-density cargo pending. It will severely slow your physical traversal. Build an echo timeline to handle the door systems so you can focus entirely on dragging the payload." }, obj: "Heavy packages cut your speed in half. Plan accordingly.", challenge: { desc: "Finish final loop in under 600 ticks", check: () => state.currentTick < 600 }, maxGhosts: 2, setup: () => { player=new PlayerEntity(100,300,30,30,'player'); deliveryZone=new DeliveryZone(650,300,100,100); walls=[new Wall(0,0,800,20),new Wall(0,580,800,20),new Wall(0,0,20,600),new Wall(780,0,20,600),new Wall(380,0,40,200),new Wall(380,400,40,200)]; doors=[new TimerDoor('td1',380,200,40,200,60,60)]; plates=[]; packages=[new Package('pkg1',200,300,'heavy')]; lasers=[]; guards=[]; cameras=[]; drones=[]; winds=[]; statics=[]; cracks=[]; robots=[]; projectiles=[]; } },
    { name: "Level 4: Gap Bypass", grants: ['dash'], story: { speaker: "Local Hub Manager", text: "We received funding for a cybernetic implant. The Dash Module. Teleports you seamlessly. But it's locked behind a paywall. You might have to sprint across this collapsing foundation if you can't afford it." }, obj: "Dash across the collapsing gap to reach the plate and the delivery zone.", challenge: { desc: "Finish in 2 loops or fewer", check: () => state.pastRuns.length <= 1 }, maxGhosts: 2, setup: () => { player=new PlayerEntity(50,300,30,30,'player'); deliveryZone=new DeliveryZone(650,300,100,100); walls=[new Wall(0,0,800,20),new Wall(0,580,800,20),new Wall(0,0,20,600),new Wall(780,0,20,600), new Wall(550,0,40,250), new Wall(550,330,40,270)]; cracks=[]; for(let i=20;i<580;i+=40) cracks.push(new CrackedFloor(380,i,40,40)); doors=[new Door('d1',550,250,40,80)]; plates=[new PressurePlate('p1',450,150,'d1')]; packages=[new Package('pkg1',100,300,'standard')]; lasers=[]; guards=[]; cameras=[]; drones=[]; winds=[]; statics=[]; robots=[]; projectiles=[]; } },
    
    { name: "Level 5: Fragile Handling", story: { speaker: "Local Hub Manager", text: "You’re handling Class-4 fragile tech. The security lasers in Transit Yard B will vaporize it instantly. Ensure the grid is disabled before you expose the cargo." }, obj: "Fragile packages break in lasers. Escort them with care.", challenge: { desc: "Finish in 3 loops or fewer", check: () => state.pastRuns.length <= 2 }, maxGhosts: 3, setup: () => { player=new PlayerEntity(50,300,30,30,'player'); deliveryZone=new DeliveryZone(50,50,100,100); walls=[new Wall(0,0,800,20),new Wall(0,580,800,20),new Wall(0,0,20,600),new Wall(780,0,20,600)]; lasers=[new Laser('ls1',300,20,20,560), new Laser('ls2',550,20,20,560)]; plates=[new PressurePlate('p1',150,300,'ls1'), new PressurePlate('p2',400,300,'ls2')]; packages=[new Package('pkg1',700,300,'fragile')]; doors=[]; guards=[]; cameras=[]; drones=[]; winds=[]; statics=[]; cracks=[]; robots=[]; projectiles=[]; } },
    { name: "Level 6: The Toss", grants: ['toss'], story: { speaker: "ChronoHaul Dispatch", text: "Delivery zone inaccessible by foot. Arm upgrade required. The Toss Protocol allows package projection across chasms. Again, if you're broke, try sprinting the collapsing walkway." }, obj: "Throw packages over the massive gap with Toss.", challenge: { desc: "Finish in 2 loops or fewer", check: () => state.pastRuns.length <= 1 }, maxGhosts: 2, setup: () => { player=new PlayerEntity(50,300,30,30,'player'); deliveryZone=new DeliveryZone(650,250,100,200); walls=[new Wall(0,0,800,20),new Wall(0,580,800,20),new Wall(0,0,20,600),new Wall(780,0,20,600), new Wall(550,20,40,230), new Wall(550,350,40,230)]; doors=[new Door('d1',550,250,40,100)]; cracks=[]; for(let i=20;i<580;i+=40) cracks.push(new CrackedFloor(380,i,120,40)); plates=[new PressurePlate('p1',150,150,'d1')]; packages=[new Package('pkg1',100,300,'standard')]; lasers=[]; guards=[]; cameras=[]; drones=[]; winds=[]; statics=[]; robots=[]; projectiles=[]; } },
    { name: "Level 7: Wind Tunnel", grants: ['dash'], story: { speaker: "Sector Surveillance", text: "Warning: Cross-ventilation active. Updrafts and downdrafts exceed 80 mph. Stepping into the air-stream will sweep you directly into the disposal lasers. Use your Dash module to bypass the streams entirely." }, obj: "Cross-winds sweep you away! Dash strictly over the air currents.", challenge: { desc: "Finish in 1 loop (No Ghosts)", check: () => state.pastRuns.length === 0 }, maxGhosts: 1, setup: () => { player=new PlayerEntity(50,300,30,30,'player'); deliveryZone=new DeliveryZone(650,250,100,100); walls=[new Wall(0,0,800,20),new Wall(0,580,800,20),new Wall(0,0,20,600),new Wall(780,0,20,600)]; winds=[new WindTunnel(200,20,80,560,0,8), new WindTunnel(450,20,80,560,0,-8)]; lasers=[new Laser('ls1',200,540,80,40), new Laser('ls2',450,20,80,40)]; plates=[]; packages=[new Package('pkg1',100,300,'standard')]; doors=[]; guards=[]; cameras=[]; drones=[]; statics=[]; cracks=[]; robots=[]; projectiles=[]; } },
    
    { name: "Level 8: The Panopticon", grants: ['cloak'], story: { speaker: "Unknown Hacker [Encrypted]", text: "Hey. You're moving Contraband now. ChronoHaul is using you to traffic illegal temporal drives. The cameras here will trigger alarms even if you use a Cloak. Be careful." }, obj: "Use Cloak carefully. Contraband triggers alarms if seen!", unlocks: ['cloak'], challenge: { desc: "Do NOT use Cloak", check: () => state.runStats.cloaks === 0 }, maxGhosts: 3, setup: () => { player=new PlayerEntity(50,500,30,30,'player'); deliveryZone=new DeliveryZone(650,50,100,100); walls=[new Wall(0,0,800,20),new Wall(0,580,800,20),new Wall(0,0,20,600),new Wall(780,0,20,600),new Wall(400,0,40,250),new Wall(400,330,40,270)]; doors=[new AlarmDoor('d1',400,250,40,80)]; cameras=[new SweepCamera(150,20,Math.PI/2,Math.PI/4)]; packages=[new Package('pkg1',100,100,'contraband')]; lasers=[]; guards=[]; drones=[]; plates=[]; winds=[]; statics=[]; cracks=[]; robots=[]; projectiles=[]; } },
    { name: "Level 9: Noise Complaint", grants: ['toss'], story: { speaker: "Local Hub Manager", text: "We've got security drones patrolling the Anomaly sector. They investigate loud noises. Use Decoy boxes to ping their audio sensors. Keep the real cargo hidden." }, obj: "Drones investigate drops. Toss Decoys (blue) to lure them.", challenge: { desc: "Finish in 2 loops or fewer", check: () => state.pastRuns.length <= 1 }, maxGhosts: 3, setup: () => { player=new PlayerEntity(50,300,30,30,'player'); deliveryZone=new DeliveryZone(650,300,100,100); walls=[new Wall(0,0,800,20),new Wall(0,580,800,20),new Wall(0,0,20,600),new Wall(780,0,20,600)]; drones=[new Drone([{x:400,y:100},{x:400,y:500}])]; packages=[new Package('pkg1',200,100,'decoy'),new Package('pkg2',50,500,'standard')]; doors=[]; plates=[]; lasers=[]; guards=[]; cameras=[]; winds=[]; statics=[]; cracks=[]; robots=[]; projectiles=[]; } },
    
    { name: "Level 10: Fast Shipping", grants: ['toss'], story: { speaker: "ChronoHaul Dispatch", text: "Critical: Package is highly unstable. Detonation sequence activates upon handling. The company expects immediate delivery. Do not fail." }, obj: "Timed packages explode! Toss them over the gap instantly.", challenge: { desc: "Do NOT use Dash", check: () => state.runStats.dashes === 0 }, maxGhosts: 2, setup: () => { player=new PlayerEntity(50,300,30,30,'player'); deliveryZone=new DeliveryZone(650,300,100,100); walls=[new Wall(0,0,800,20),new Wall(0,580,800,20),new Wall(0,0,20,600),new Wall(780,0,20,600)]; cracks=[]; for(let i=20;i<580;i+=40) cracks.push(new CrackedFloor(380,i,40,40)); packages=[new Package('pkg1',100,300,'timed')]; doors=[]; plates=[]; lasers=[]; guards=[]; cameras=[]; drones=[]; winds=[]; statics=[]; robots=[]; projectiles=[]; } },
    { name: "Level 11: Time Dilation", story: { speaker: "Unknown Hacker [Encrypted]", text: "They're trapping your discarded timelines in these Static Zones. The purple fields literally harvest temporal energy by slowing your echoes down. They're farming you." }, obj: "Static Zones slow ghost playback. Squeeze your execution.", challenge: { desc: "No Alarms Triggered", check: () => state.runStats.alarms === 0 }, maxGhosts: 3, setup: () => { player=new PlayerEntity(50,300,30,30,'player'); deliveryZone=new DeliveryZone(650,300,100,100); walls=[new Wall(0,0,800,20),new Wall(0,580,800,20),new Wall(0,0,20,600),new Wall(780,0,20,600), new Wall(450,20,40,180), new Wall(450,400,40,180), new Wall(550,20,40,180), new Wall(550,400,40,180)]; statics=[new StaticZone(200,20,200,560)]; doors=[new TimerDoor('td1',450,200,40,200,60,60)]; doors.push(new Door('d1', 550, 200, 40, 200)); plates=[new PressurePlate('p1', 300, 450, 'd1')]; packages=[new Package('pkg1',100,100)]; lasers=[]; guards=[]; cameras=[]; drones=[]; winds=[]; cracks=[]; robots=[]; projectiles=[]; } },
    { name: "Level 12: Echo Crunch", story: { speaker: "Local Hub Manager", text: "Temporal budget exhausted. You are restricted to ONE echo. Corporate says zero margin for error. Get it done or your contract is terminated." }, obj: "Maximum 1 Echo Limit. Present Timeline must hold the gate.", challenge: { desc: "No Dash and No Cloak", check: () => state.runStats.dashes === 0 && state.runStats.cloaks === 0 }, maxGhosts: 1, setup: () => { player=new PlayerEntity(100,450,30,30,'player'); deliveryZone=new DeliveryZone(50,450,100,100); walls=[new Wall(0,0,800,20),new Wall(0,580,800,20),new Wall(0,0,20,600),new Wall(780,0,20,600),new Wall(380,0,40,250),new Wall(380,330,40,270)]; doors=[new Door('d1',380,250,40,80)]; plates=[new TemporalPlate('p1',150,150,'d1', 'present')]; statics=[new StaticZone(100, 100, 100, 100)]; lasers=[]; guards=[]; cameras=[]; drones=[]; winds=[]; cracks=[]; packages=[new Package('pkg1',650,200,'fragile')]; robots=[]; projectiles=[]; } },
    { name: "Level 13: Danger Courier", isBoss: true, grants: ['toss'], bossIntro: { speaker: "EXTERMINATOR UNIT XR-9", text: "Unauthorized courier detected. Temporal theft in progress. Arena lockdown lifted. Commencing extermination sweep." }, bossIntroDoorId: 'boss_intro_door', story: { speaker: "Unknown Hacker [Encrypted]", text: "ChronoHaul deployed an Exterminator robot to stop you. It has kill authorization. Throw Heavy Packages to breach its armor (3 hits). Then deliver the final Fragile Artifact!" }, obj: "Defeat the Security Robot! Toss packages to damage it (3 Hits).", challenge: { desc: "Finish in 1 loop (No Ghosts!)", check: () => state.pastRuns.length === 0 }, maxGhosts: 2, setup: () => { player=new PlayerEntity(50,300,30,30,'player'); deliveryZone=new DeliveryZone(650,300,100,100); walls=[new Wall(0,0,800,20),new Wall(0,580,800,20),new Wall(0,0,20,600),new Wall(780,0,20,600),new Wall(550,0,40,250),new Wall(550,350,40,250),new Wall(320,20,40,120),new Wall(440,20,40,120),new Wall(320,20,160,40)]; doors=[new Door('boss_door',550,250,40,100),new Door('boss_intro_door',360,100,80,40)]; robots=[new ShooterRobot([{x:390,y:60},{x:390,y:220},{x:250,y:220},{x:250,y:450},{x:450,y:450},{x:450,y:220}])]; robots[0].engaged = false; robots[0].isEmerging = false; robots[0].emergeUntilPathIndex = 2; lasers=[]; plates=[]; guards=[]; cameras=[]; drones=[]; winds=[]; statics=[]; cracks=[]; packages=[new Package('ammo1',150,100,'heavy',false),new Package('ammo2',150,500,'heavy',false),new Package('ammo3',350,500,'heavy',false),new Package('pkg1',50,100,'fragile')]; projectiles=[]; } },
    { name: "Tutorial 1: First Loop", isTutorial: true, tutorialNumber: 1, story: { speaker: "ChronoHaul Dispatch", text: "Training sim online. First, move through the room and stand on the floor switch. Then reset the loop. Your echo will replay that path and keep the door open while you carry the parcel to the green zone." }, obj: "Walk to the pressure plate, reset the loop to create an echo, then use that echo to hold the door while you deliver the parcel.", challenge: { desc: "Training Module", check: () => false }, maxGhosts: 1, setup: () => { player=new PlayerEntity(80,450,30,30,'player'); deliveryZone=new DeliveryZone(650,80,100,100); walls=[new Wall(0,0,800,20),new Wall(0,580,800,20),new Wall(0,0,20,600),new Wall(780,0,20,600),new Wall(340,20,40,220),new Wall(340,320,40,260)]; doors=[new Door('t1_door',340,240,40,80)]; plates=[new PressurePlate('t1_plate',180,450,'t1_door')]; packages=[new Package('pkg1',90,500,'standard')]; lasers=[]; guards=[]; cameras=[]; drones=[]; winds=[]; statics=[]; cracks=[]; robots=[]; projectiles=[]; } },
    { name: "Tutorial 2: Package Handling", isTutorial: true, tutorialNumber: 2, story: { speaker: "Local Hub Manager", text: "Parcels do not levitate themselves. Pick up the first box, carry it through the open lane, then move the heavy crate. Heavy cargo slows you down, so leave yourself space to work." }, obj: "Pick up and drop parcels, then deliver the standard box and the heavy crate.", challenge: { desc: "Training Module", check: () => false }, maxGhosts: 1, setup: () => { player=new PlayerEntity(80,300,30,30,'player'); deliveryZone=new DeliveryZone(640,220,120,160); walls=[new Wall(0,0,800,20),new Wall(0,580,800,20),new Wall(0,0,20,600),new Wall(780,0,20,600),new Wall(380,20,40,180),new Wall(380,280,40,300)]; doors=[new Door('t2_door',380,200,40,80)]; plates=[new PressurePlate('t2_plate',200,300,'t2_door')]; packages=[new Package('pkg1',110,250,'standard'),new Package('pkg2',160,340,'heavy')]; lasers=[]; guards=[]; cameras=[]; drones=[]; winds=[]; statics=[]; cracks=[]; robots=[]; projectiles=[]; } },
    { name: "Tutorial 3: Courier Tools", isTutorial: true, tutorialNumber: 3, grants: ['dash', 'toss'], story: { speaker: "ChronoHaul Dispatch", text: "You are now cleared for field tools. Dash crosses fragile flooring instantly. Toss lets you fling cargo where your boots should not go. Use both to finish the route." }, obj: "Dash over the collapsing floor and toss the parcel into the delivery zone.", challenge: { desc: "Training Module", check: () => false }, maxGhosts: 1, setup: () => { player=new PlayerEntity(80,300,30,30,'player'); deliveryZone=new DeliveryZone(650,220,100,160); walls=[new Wall(0,0,800,20),new Wall(0,580,800,20),new Wall(0,0,20,600),new Wall(780,0,20,600),new Wall(560,20,40,180),new Wall(560,380,40,200)]; doors=[]; plates=[]; packages=[new Package('pkg1',120,300,'standard')]; lasers=[]; guards=[]; cameras=[]; drones=[]; winds=[]; statics=[]; cracks=[new CrackedFloor(320,260,60,80),new CrackedFloor(380,260,60,80),new CrackedFloor(440,260,60,80)]; robots=[]; projectiles=[]; } },
    { name: "Tutorial 4: Security Awareness", isTutorial: true, tutorialNumber: 4, grants: ['cloak', 'toss'], story: { speaker: "Sector Surveillance", text: "Security reacts to what it sees and hears. Cloak yourself to slip through the camera cone. Throw the decoy to drag the drone away from the route, and let an echo distract the guard." }, obj: "Cloak past the camera, toss the decoy to lure the drone, and use an echo to distract the guard while you deliver the parcel.", challenge: { desc: "Training Module", check: () => false }, maxGhosts: 2, setup: () => { player=new PlayerEntity(90,500,30,30,'player'); deliveryZone=new DeliveryZone(650,60,100,100); walls=[new Wall(0,0,800,20),new Wall(0,580,800,20),new Wall(0,0,20,600),new Wall(780,0,20,600),new Wall(360,20,40,180),new Wall(360,280,40,300),new Wall(520,20,40,240),new Wall(520,340,40,240)]; doors=[]; plates=[]; packages=[new Package('pkg1',110,520,'standard'),new Package('decoy1',220,520,'decoy')]; lasers=[]; guards=[new Guard([{x:590,y:260},{x:700,y:260}])]; cameras=[new SweepCamera(260,60,Math.PI/2,Math.PI/4)]; drones=[new Drone([{x:470,y:430},{x:700,y:430}])]; winds=[]; statics=[]; cracks=[]; robots=[]; projectiles=[]; } },
    { name: "Tutorial 5: Temporal Hazards", isTutorial: true, tutorialNumber: 5, grants: ['ghostShield'], story: { speaker: "Unknown Hacker [Encrypted]", text: "Final drill. Static zones slow echoes. Lasers destroy fragile goods. Your Echo Shield only blocks from the front, so face the security fire if you want your replay to cover you. Then finish the delivery." }, obj: "Guide an echo through static, face its shield into the robot fire, and deliver the fragile parcel without touching the laser.", challenge: { desc: "Training Module", check: () => false }, maxGhosts: 2, setup: () => { player=new PlayerEntity(70,480,30,30,'player'); deliveryZone=new DeliveryZone(670,70,90,90); walls=[new Wall(0,0,800,20),new Wall(0,580,800,20),new Wall(0,0,20,600),new Wall(780,0,20,600),new Wall(310,20,40,180),new Wall(310,280,40,300),new Wall(560,20,40,220),new Wall(560,320,40,260)]; doors=[]; plates=[]; packages=[new Package('pkg1',100,500,'fragile')]; lasers=[new Laser('t5_laser',430,20,20,220)]; guards=[]; cameras=[]; drones=[]; winds=[]; statics=[new StaticZone(150,360,120,140)]; cracks=[]; robots=[new ShooterRobot([{x:650,y:310},{x:710,y:310}])]; projectiles=[]; robots[0].hp = 99; robots[0].fireCooldown = 20; } },
    { name: "Dev Sandbox", isSandbox: true, mapWidth: 1600, mapHeight: 1200, grants: ['dash', 'toss', 'cloak', 'ghostShield'], story: { speaker: "CHRONOHAUL LAB", text: "Sandbox range online. Map is oversized — the camera follows you. Every tool is granted. Walk the hall to exercise doors, plates, packages, lasers, cameras, guards, drones, winds, static, cracks, and the robot." }, obj: "Dev sandbox: oversized map with a sample of every entity. Camera follows the courier.", challenge: { desc: "Sandbox", check: () => false }, maxGhosts: 3, setup: setupDevSandbox }
];

export const CAMPAIGN_LEVEL_COUNT = LEVELS.findIndex(level => level.isTutorial);
export const TUTORIAL_LEVEL_START = CAMPAIGN_LEVEL_COUNT;
export const TUTORIAL_LEVEL_INDICES = LEVELS.reduce((indices, level, index) => {
    if (level.isTutorial) indices.push(index);
    return indices;
}, []);
export const SANDBOX_LEVEL_INDEX = LEVELS.findIndex(level => level.isSandbox);

function withMapSize(entities, size) {
    return { ...entities, mapWidth: size.mapWidth, mapHeight: size.mapHeight };
}

export function serializeLevel(src = state) {
    const size = layoutMapSize(src, src);
    return {
        width: size.mapWidth,
        height: size.mapHeight,
        mapWidth: size.mapWidth,
        mapHeight: size.mapHeight,
        player: src.player ? { x: src.player.x, y: src.player.y } : { x: 50, y: 50 },
        deliveryZone: src.deliveryZone
            ? { x: src.deliveryZone.x, y: src.deliveryZone.y, w: src.deliveryZone.w, h: src.deliveryZone.h }
            : { x: 650, y: 300, w: 100, h: 100 },
        walls: (src.walls || []).map(w => ({ x: w.x, y: w.y, w: w.w, h: w.h })),
        doors: (src.doors || []).map(d => ({
            x: d.x, y: d.y, w: d.w, h: d.h, id: d.id,
            type: (d instanceof AlarmDoor) ? 'alarm' : (d instanceof TimerDoor) ? 'timer' : 'standard',
            openT: d.openT, closedT: d.closedT
        })),
        plates: (src.plates || []).map(p => ({
            x: p.x, y: p.y, linkedIds: p.linkedIds, id: p.id,
            type: (p instanceof TemporalPlate) ? 'temporal' : 'standard',
            requiredTimeline: p.requiredTimeline
        })),
        packages: (src.packages || []).map(p => ({
            x: p.startX ?? p.x, y: p.startY ?? p.y, id: p.id,
            packageType: p.type, requiredForDelivery: p.requiredForDelivery !== false
        })),
        lasers: (src.lasers || []).map(l => ({ x: l.x, y: l.y, w: l.w, h: l.h, id: l.id })),
        guards: (src.guards || []).map(g => ({ path: g.points || g.path || [{ x: g.x, y: g.y }] })),
        cameras: (src.cameras || []).map(c => ({ x: c.x, y: c.y, baseAngle: c.baseAngle, sweepRange: c.sweepRange })),
        drones: (src.drones || []).map(d => ({ path: d.points || d.path || [{ x: d.x, y: d.y }] })),
        winds: (src.winds || []).map(w => ({ x: w.x, y: w.y, w: w.w, h: w.h, vx: w.vx, vy: w.vy })),
        statics: (src.statics || []).map(s => ({ x: s.x, y: s.y, w: s.w, h: s.h })),
        cracks: (src.cracks || []).map(c => ({ x: c.x, y: c.y, w: c.w, h: c.h })),
        robots: (src.robots || []).map(r => ({ path: r.path || [{ x: r.x, y: r.y }] }))
    };
}

export function deserializeLevel(data) {
    data = data || {};
    const size = layoutMapSize(data);
    player = new PlayerEntity(data.player?.x || 50, data.player?.y || 50, 30, 30, 'player');
    deliveryZone = new DeliveryZone(data.deliveryZone?.x || 650, data.deliveryZone?.y || 300, data.deliveryZone?.w || 100, data.deliveryZone?.h || 100);
    
    walls = (data.walls||[]).map(w => new Wall(w.x, w.y, w.w, w.h));
    doors = (data.doors||[]).map(d => {
        if (d.type === 'alarm') return new AlarmDoor(d.id, d.x, d.y, d.w, d.h);
        if (d.type === 'timer') return new TimerDoor(d.id, d.x, d.y, d.w, d.h, d.openT || 60, d.closedT || 60);
        return new Door(d.id, d.x, d.y, d.w, d.h);
    });
    plates = (data.plates||[]).map(p => {
        if (p.type === 'temporal') return new TemporalPlate(p.id, p.x, p.y, p.linkedIds, p.requiredTimeline);
        return new PressurePlate(p.id, p.x, p.y, p.linkedIds);
    });
    packages = (data.packages||[]).map(p => new Package(p.id, p.x, p.y, p.packageType || 'standard', p.requiredForDelivery !== false));
    lasers = (data.lasers||[]).map(l => new Laser(l.id, l.x, l.y, l.w, l.h));
    guards = (data.guards||[]).map(g => {
        const path = g.path || g.points || [{ x: g.x, y: g.y }];
        return new Guard(path.length ? path : [{ x: 50, y: 50 }]);
    });
    cameras = (data.cameras||[]).map(c => new SweepCamera(c.x, c.y, c.baseAngle || 0, c.sweepRange || Math.PI/2));
    drones = (data.drones||[]).map(d => {
        const path = d.path || d.points || [{ x: d.x, y: d.y }];
        return new Drone(path.length ? path : [{ x: 50, y: 50 }]);
    });
    winds = (data.winds||[]).map(w => new WindTunnel(w.x, w.y, w.w, w.h, w.vx, w.vy));
    statics = (data.statics||[]).map(s => new StaticZone(s.x, s.y, s.w, s.h));
    cracks = (data.cracks||[]).map(c => new CrackedFloor(c.x, c.y, c.w, c.h));
    robots = (data.robots||[]).map(r => {
        const path = r.path || [{ x: r.x, y: r.y }];
        return new ShooterRobot(path.length ? path : [{ x: 50, y: 50 }]);
    });
    projectiles = [];
    
    return withMapSize({ player, deliveryZone, walls, doors, plates, packages, lasers, guards, cameras, drones, winds, statics, cracks, robots, projectiles }, size);
}

export function getLevelSetup(index) {
    if (!LEVELS[index]) return null;
    const level = LEVELS[index];
    const size = { mapWidth: level.mapWidth || DEFAULT_MAP_WIDTH, mapHeight: level.mapHeight || DEFAULT_MAP_HEIGHT };
    
    if (level.setup) {
        level.setup();
        return withMapSize({
            player, deliveryZone, walls, doors, plates, packages,
            lasers, guards, cameras, drones, winds, statics, cracks,
            robots, projectiles
        }, size);
    } else if (level.layout) {
        return deserializeLevel({ ...level.layout, ...size });
    }
}

export function loadCustomLevel(jsonString) {
    try {
        let layout = JSON.parse(jsonString);
        return deserializeLevel(layout);
    } catch(e) { console.error("Could not parse JSON map."); return null; }
}
