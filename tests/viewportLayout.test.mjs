import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const desktop = css.slice(css.indexOf('/* Desktop play is viewport-first'));

assert.match(desktop, /width:\s*100vw/);
assert.match(desktop, /height:\s*100dvh/);
assert.match(desktop, /width:\s*min\(100vw,\s*133\.333dvh\)/);
assert.match(desktop, /\.top-hud\s*\{[\s\S]*position:\s*absolute/);
assert.match(desktop, /\.bottom-hud\s*\{[\s\S]*opacity:\s*\.22/);
assert.match(css, /body\.touch-ui #gameCanvas\s*\{[\s\S]*max-width:\s*100%/);
assert.match(css, /body\.touch-ui \.bottom-hud\s*\{\s*display:\s*none/);

console.log('viewport layout ok');
