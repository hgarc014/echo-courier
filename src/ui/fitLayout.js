// Desktop fit: scale #app-layout by its real height, not an assumed 860px.
// The boss HUD and long objectives make the panel taller than that, and with
// body overflow hidden the controls line fell off the bottom (QA: 950px window).
// Phones (<=700px wide) and touch layouts keep their CSS rules.
export function fitScale(layoutW, layoutH, viewW, viewH) {
    if (!(layoutW > 0) || !(layoutH > 0)) return 1;
    return Math.min(1, viewH / layoutH, viewW / layoutW);
}

export function installLayoutFit(doc = globalThis.document, win = globalThis.window) {
    if (!doc || !win) return;
    const el = doc.getElementById('app-layout');
    if (!el) return;
    const apply = () => {
        if (doc.body.classList.contains('touch-ui') || win.innerWidth <= 700) { el.style.transform = ''; return; }
        const s = fitScale(el.offsetWidth + 8, el.offsetHeight + 8, win.innerWidth, win.innerHeight);
        el.style.transform = `scale(${s})`;
    };
    apply();
    win.addEventListener('resize', apply);
    if (typeof win.ResizeObserver === 'function') new win.ResizeObserver(apply).observe(el);
}
