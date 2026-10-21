// Runs every tests/*.test.mjs in its own Node process. New test files are picked up automatically.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(dir).filter(f => f.endsWith('.test.mjs')).sort();
let failed = 0;
for (const f of files) {
    console.log(`\n▶ ${f}`);
    const r = spawnSync(process.execPath, [join(dir, f)], { stdio: 'inherit' });
    if (r.status !== 0) { failed++; console.log(`✗ ${f} (exit ${r.status})`); }
}
console.log(`\n${files.length - failed}/${files.length} test files passed`);
process.exit(failed ? 1 : 0);
