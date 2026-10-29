import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const source = readFileSync('src/buildInfo.js', 'utf8');
const stamped = source.match(/export const version = "([^"]+)"/)?.[1];
const versions = [pkg.version, lock.version, lock.packages?.['']?.version, stamped];
if (versions.some(version => version !== pkg.version)) {
    console.error(`release version mismatch: ${versions.join(' / ')}`);
    process.exit(1);
}
console.log(`release version v${pkg.version} is synchronized`);
