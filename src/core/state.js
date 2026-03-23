export const state = {
    maxUnlockedLevel: parseInt(localStorage.getItem('echoCourier_maxLevel') || '0'),
    playerColor: localStorage.getItem('echoCourier_suit') || '#ff7b00',
    challengesCompleted: JSON.parse(localStorage.getItem('echoCourier_challenges') || '{}'),
    abilitiesPurchased: JSON.parse(localStorage.getItem('echoCourier_abilities') || '{}'),
    tutorialProgress: JSON.parse(localStorage.getItem('echoCourier_tutorials') || '{}'),
    runStats: { tosses: 0, dashes: 0, cloaks: 0, alarms: 0 },
    
    FPS: 60,
    TICK_RATE: 1000 / 60,
    assets: {},
    assetsLoaded: 0,
    assetNames: ['player', 'package', 'plate', 'door', 'wall', 'zone', 'guard', 'laser', 'camera'],
    
    pastRuns: [],
    currentRun: [],
    currentTick: 0,
    activeGhosts: [],
    gameState: 'MENU',
    currentLevelIndex: 0,
    failTimer: 0,
    failMessage: "",
    alarmState: false,
    levelAbilityOverrides: [],
    currentLevelMeta: null,
    
    walls: [], doors: [], plates: [], packages: [], lasers: [], guards: [], cameras: [], drones: [], winds: [], statics: [], cracks: [], robots: [], projectiles: [], dashTrails: [],
    deliveryZone: null, player: null,
    
    resetRunData: function() {
        this.walls=[]; this.doors=[]; this.plates=[]; this.packages=[]; this.lasers=[]; this.guards=[]; this.cameras=[]; this.drones=[]; this.winds=[]; this.statics=[]; this.cracks=[]; this.robots=[]; this.projectiles=[]; this.dashTrails=[]; this.deliveryZone=null; this.player=null;
    }
};

state.assetNames.forEach(name => {
    const img = new Image(); img.src = `assets/${name}.png`;
    img.onload = () => { state.assetsLoaded++; }; state.assets[name] = img;
});

export function getCredits() {
    let earned = (state.maxUnlockedLevel * 50) + (Object.keys(state.challengesCompleted).length * 50);
    let spent =
        (state.abilitiesPurchased['dash'] ? 150 : 0) +
        (state.abilitiesPurchased['toss'] ? 150 : 0) +
        (state.abilitiesPurchased['cloak'] ? 200 : 0) +
        (state.abilitiesPurchased['ghostShield'] ? 200 : 0);
    return earned - spent;
}

export function getPlayerRank() {
    const devMode = document.getElementById('dev-mode-checkbox');
    if (devMode && devMode.checked) return 4;
    if (state.maxUnlockedLevel >= 11) return 4;
    if (state.maxUnlockedLevel >= 9) return 3;
    if (state.maxUnlockedLevel >= 6) return 2;
    if (state.maxUnlockedLevel >= 3) return 1;
    return 0;
}

export function getUnlockedAbilities() {
    const devMode = document.getElementById('dev-mode-checkbox');
    if (devMode && devMode.checked) return ['dash', 'toss', 'cloak', 'ghostShield'];
    let unlocks = new Set();
    if (state.abilitiesPurchased['dash']) unlocks.add('dash');
    if (state.abilitiesPurchased['toss']) unlocks.add('toss');
    if (state.abilitiesPurchased['cloak']) unlocks.add('cloak');
    if (state.abilitiesPurchased['ghostShield']) unlocks.add('ghostShield');
    for (let ability of state.levelAbilityOverrides) unlocks.add(ability);
    return Array.from(unlocks);
}

export function saveState() {
    localStorage.setItem('echoCourier_maxLevel', state.maxUnlockedLevel);
    localStorage.setItem('echoCourier_challenges', JSON.stringify(state.challengesCompleted));
    localStorage.setItem('echoCourier_abilities', JSON.stringify(state.abilitiesPurchased));
    localStorage.setItem('echoCourier_tutorials', JSON.stringify(state.tutorialProgress));
    localStorage.setItem('echoCourier_suit', state.playerColor);
}
