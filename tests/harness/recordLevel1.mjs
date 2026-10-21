// W1-L1 recorder. Prefer tests/harness/recordW1.mjs (levels 0–4 → w1-l1 … w1-mb).
// Usage: node tests/harness/recordLevel1.mjs [tests/solutions/w1-l1.json]
import { recordLevel } from './recordW1.mjs';

const out = process.argv[2] || 'tests/solutions/w1-l1.json';
recordLevel(0, out);
