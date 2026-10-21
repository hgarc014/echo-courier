// Minimal browser stubs so src/main.js and friends can be imported in Node.
// Every DOM element / canvas context is a permissive no-op proxy. Not a DOM emulator.
function noopProxy(name) {
    const store = {};
    const fn = function () { return noopProxy(name + '()'); };
    return new Proxy(fn, {
        get(t, k) {
            if (k in store) return store[k];
            if (k === Symbol.toPrimitive) return () => 0;
            if (k === 'then') return undefined;
            if (k === 'length') return 0;
            if (k === 'width') return 800;
            if (k === 'height') return 600;
            if (k === Symbol.iterator) return function* () {};
            if (k === 'getBoundingClientRect') return () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 });
            if (k === 'measureText') return () => ({ width: 0 });
            if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
            if (k === 'querySelectorAll' || k === 'getElementsByClassName') return () => [];
            return (store[k] = noopProxy(name + '.' + String(k)));
        },
        set(t, k, v) { store[k] = v; return true; },
        apply() { return noopProxy(name + '()'); },
        construct() { return noopProxy('new ' + name); },
    });
}

export function installDomStubs() {
    const g = globalThis;
    // Audio/voice preload logs are noise headless (fetch is disabled); drop them.
    for (const level of ['log', 'warn', 'info']) {
        const orig = console[level].bind(console);
        console[level] = (...args) => { if (typeof args[0] === 'string' && args[0].startsWith('[Voice]')) return; orig(...args); };
    }
    const ls = new Map();
    g.localStorage = {
        // Demos / hint popups count as "seen" so replays never get hijacked by tutorials.
        getItem: k => (ls.has(k) ? ls.get(k) : (String(k).startsWith('echoCourier_demoSeen_') ? '1' : null)),
        setItem: (k, v) => ls.set(k, String(v)),
        removeItem: k => ls.delete(k),
        clear: () => ls.clear(),
    };
    const doc = noopProxy('document');
    g.document = doc;
    g.window = g;
    g.location = { search: '', hash: '', href: 'http://localhost/', reload() {} };
    try { g.navigator = { userAgent: 'node', maxTouchPoints: 0 }; } catch { /* read-only in newer Node */ }
    g.Image = class { constructor() { this.complete = false; this.width = 0; this.height = 0; } };
    g.Audio = class { play() { return Promise.resolve(); } pause() {} addEventListener() {} load() {} };
    g.AudioContext = g.webkitAudioContext = function () { return noopProxy('audioCtx'); };
    g.speechSynthesis = noopProxy('speechSynthesis');
    g.SpeechSynthesisUtterance = function () { return noopProxy('utterance'); };
    g.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
    g.addEventListener = () => {};
    g.removeEventListener = () => {};
    g.requestAnimationFrame = () => 0;
    g.cancelAnimationFrame = () => {};
    g.fetch = () => Promise.reject(new Error('fetch disabled in harness'));
    g.HTMLCanvasElement = function () {};
    g.OffscreenCanvas = undefined;
}
