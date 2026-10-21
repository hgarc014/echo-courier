// Every src module: syntax (node --check), named imports resolve to exports,
// and no undeclared identifiers. Catches a shop that uses WORLDS without importing it.
// Run: node tests/moduleBindings.test.mjs
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { installDomStubs } from './harness/domStub.mjs';

installDomStubs();

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'src');

const GLOBALS = new Set(`
undefined NaN Infinity
isNaN isFinite parseInt parseFloat
decodeURI encodeURI decodeURIComponent encodeURIComponent
Object Function Array Boolean Number String Symbol BigInt
Math Date RegExp JSON Intl
Error EvalError RangeError ReferenceError SyntaxError TypeError URIError AggregateError
Promise Proxy Reflect
Map Set WeakMap WeakSet WeakRef FinalizationRegistry
ArrayBuffer SharedArrayBuffer DataView Atomics
Int8Array Uint8Array Uint8ClampedArray Int16Array Uint16Array
Int32Array Uint32Array Float32Array Float64Array BigInt64Array BigUint64Array
globalThis window self document navigator location history
localStorage sessionStorage console
alert confirm prompt
fetch Headers Request Response AbortController FormData
URL URLSearchParams Blob File FileReader
TextEncoder TextDecoder crypto atob btoa structuredClone queueMicrotask
performance requestAnimationFrame cancelAnimationFrame
setTimeout clearTimeout setInterval clearInterval
Image Audio AudioContext webkitAudioContext OfflineAudioContext AudioBuffer
speechSynthesis SpeechSynthesisUtterance
ImageData Path2D OffscreenCanvas HTMLCanvasElement CanvasRenderingContext2D
CustomEvent Event KeyboardEvent MouseEvent PointerEvent TouchEvent WheelEvent FocusEvent
MutationObserver ResizeObserver IntersectionObserver
matchMedia getComputedStyle
`.split(/\s+/).filter(Boolean));

function walkJs(dir, out = []) {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walkJs(p, out);
        else if (name.endsWith('.js')) out.push(p);
    }
    return out;
}

async function loadAcorn() {
    const candidates = [
        join(root, 'node_modules/acorn/dist/acorn.js'),
        '/usr/share/nodejs/acorn/dist/acorn.js'
    ];
    for (const file of candidates) {
        if (!existsSync(file)) continue;
        return import(pathToFileURL(file).href);
    }
    try { return await import('acorn'); } catch { return null; }
}

function childScope(parent) {
    return { parent, vars: new Set() };
}

function resolveName(scope, name) {
    for (let s = scope; s; s = s.parent) if (s.vars.has(name)) return true;
    return false;
}

function declarePattern(pat, scope, problems) {
    if (!pat) return;
    switch (pat.type) {
        case 'Identifier': scope.vars.add(pat.name); break;
        case 'RestElement': declarePattern(pat.argument, scope, problems); break;
        case 'AssignmentPattern': declarePattern(pat.left, scope, problems); break;
        case 'ArrayPattern':
            for (const el of pat.elements) declarePattern(el, scope, problems);
            break;
        case 'ObjectPattern':
            for (const prop of pat.properties) {
                if (prop.type === 'RestElement') declarePattern(prop.argument, scope, problems);
                else declarePattern(prop.value, scope, problems);
            }
            break;
        default: problems.push(`unknown pattern ${pat.type}`);
    }
}

function unwrap(stmt) {
    if (!stmt) return null;
    if ((stmt.type === 'ExportNamedDeclaration' || stmt.type === 'ExportDefaultDeclaration') && stmt.declaration?.type) {
        return stmt.declaration;
    }
    return stmt;
}

const FUNC = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
const SKIP_NEST = new Set([...FUNC, 'ClassDeclaration', 'ClassExpression']);

function collectVars(node, varScope, problems) {
    if (!node || typeof node.type !== 'string') return;
    if (SKIP_NEST.has(node.type)) return;
    if (node.type === 'VariableDeclaration' && node.kind === 'var') {
        for (const d of node.declarations) declarePattern(d.id, varScope, problems);
    }
    for (const key of Object.keys(node)) {
        if (key === 'type' || key === 'loc' || key === 'start' || key === 'end' || key === 'range') continue;
        const v = node[key];
        if (Array.isArray(v)) {
            for (const c of v) if (c && c.type) collectVars(c, varScope, problems);
        } else if (v && v.type) collectVars(v, varScope, problems);
    }
}

function prebind(statements, scope, problems) {
    for (const raw of statements) {
        const stmt = unwrap(raw);
        if (!stmt) continue;
        if ((stmt.type === 'FunctionDeclaration' || stmt.type === 'ClassDeclaration') && stmt.id) scope.vars.add(stmt.id.name);
        if (stmt.type === 'VariableDeclaration' && stmt.kind !== 'var') {
            for (const d of stmt.declarations) declarePattern(d.id, scope, problems);
        }
    }
}

function scanUndeclared(filename, source, parse) {
    const problems = [];
    let ast;
    try {
        ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
    } catch (err) {
        return [`${filename} parse: ${err.message}`];
    }
    const where = (node) => {
        const line = node.loc?.start?.line ?? '?';
        const col = (node.loc?.start?.column ?? 0) + 1;
        return `${filename}:${line}:${col}`;
    };
    const note = (node, msg) => problems.push(`${where(node)} ${msg}`);

    function walkPatternKeys(pat, scope) {
        if (!pat || pat.type !== 'ObjectPattern' && pat.type !== 'ArrayPattern' && pat.type !== 'AssignmentPattern' && pat.type !== 'RestElement') return;
        if (pat.type === 'AssignmentPattern') { walkPatternKeys(pat.left, scope); return; }
        if (pat.type === 'RestElement') { walkPatternKeys(pat.argument, scope); return; }
        if (pat.type === 'ArrayPattern') {
            for (const el of pat.elements) walkPatternKeys(el, scope);
            return;
        }
        for (const prop of pat.properties) {
            if (prop.type === 'RestElement') { walkPatternKeys(prop.argument, scope); continue; }
            if (prop.computed) walkExpr(prop.key, scope);
            walkPatternKeys(prop.value, scope);
        }
    }
    function walkPatternDefaults(pat, scope) {
        if (!pat) return;
        if (pat.type === 'AssignmentPattern') {
            walkPatternDefaults(pat.left, scope);
            walkExpr(pat.right, scope);
        } else if (pat.type === 'ArrayPattern') {
            for (const el of pat.elements) walkPatternDefaults(el, scope);
        } else if (pat.type === 'ObjectPattern') {
            for (const prop of pat.properties) {
                walkPatternDefaults(prop.type === 'RestElement' ? prop.argument : prop.value, scope);
            }
        } else if (pat.type === 'RestElement') walkPatternDefaults(pat.argument, scope);
    }
    function checkRef(node, scope) {
        if (!node || node.type !== 'Identifier') return;
        if (!resolveName(scope, node.name) && !GLOBALS.has(node.name)) note(node, `undeclared ${node.name}`);
    }
    function assignTarget(node, scope) {
        if (!node) return;
        if (node.type === 'Identifier') { checkRef(node, scope); return; }
        if (node.type === 'MemberExpression' || node.type === 'ChainExpression') { walkExpr(node, scope); return; }
        if (node.type === 'ObjectPattern' || node.type === 'ArrayPattern' || node.type === 'AssignmentPattern' || node.type === 'RestElement') {
            assignPattern(node, scope);
            return;
        }
        note(node, `unknown assign target ${node.type}`);
    }
    function assignPattern(pat, scope) {
        if (!pat) return;
        switch (pat.type) {
            case 'Identifier': checkRef(pat, scope); break;
            case 'RestElement': assignPattern(pat.argument, scope); break;
            case 'MemberExpression':
            case 'ChainExpression': walkExpr(pat, scope); break;
            case 'AssignmentPattern':
                assignPattern(pat.left, scope);
                walkExpr(pat.right, scope);
                break;
            case 'ArrayPattern':
                for (const el of pat.elements) if (el) assignPattern(el, scope);
                break;
            case 'ObjectPattern':
                for (const prop of pat.properties) {
                    if (prop.type === 'RestElement') { assignPattern(prop.argument, scope); continue; }
                    if (prop.computed) walkExpr(prop.key, scope);
                    assignPattern(prop.value, scope);
                }
                break;
            default: note(pat, `unknown assign pattern ${pat.type}`);
        }
    }
    function walkFunction(node, outer) {
        const fn = childScope(outer);
        if (node.type !== 'ArrowFunctionExpression') fn.vars.add('arguments');
        if (node.id) fn.vars.add(node.id.name);
        for (const p of node.params) {
            walkPatternKeys(p, fn);
            declarePattern(p, fn, problems);
            walkPatternDefaults(p, fn);
        }
        collectVars(node.body, fn, problems);
        if (node.body.type === 'BlockStatement') {
            prebind(node.body.body, fn, problems);
            for (const stmt of node.body.body) walkStmt(stmt, fn);
        } else walkExpr(node.body, fn);
    }
    function walkClass(node, scope) {
        if (node.superClass) walkExpr(node.superClass, scope);
        for (const el of node.body.body) {
            if (el.type !== 'MethodDefinition') { note(el, `unknown class element ${el.type}`); continue; }
            if (el.computed) walkExpr(el.key, scope);
            if (el.value) walkFunction(el.value, scope);
        }
    }
    function walkExpr(node, scope) {
        if (!node) return;
        switch (node.type) {
            case 'Identifier': checkRef(node, scope); break;
            case 'Literal':
            case 'TemplateElement':
            case 'ThisExpression':
            case 'Super':
                break;
            case 'ArrayExpression':
                for (const el of node.elements) if (el) walkExpr(el, scope);
                break;
            case 'ObjectExpression':
                for (const prop of node.properties) {
                    if (prop.type === 'SpreadElement') { walkExpr(prop.argument, scope); continue; }
                    if (prop.computed) walkExpr(prop.key, scope);
                    if (prop.shorthand) checkRef(prop.value, scope);
                    else walkExpr(prop.value, scope);
                }
                break;
            case 'TemplateLiteral':
                for (const e of node.expressions) walkExpr(e, scope);
                break;
            case 'MemberExpression':
                walkExpr(node.object, scope);
                if (node.computed) walkExpr(node.property, scope);
                break;
            case 'ChainExpression': walkExpr(node.expression, scope); break;
            case 'CallExpression':
            case 'NewExpression':
                walkExpr(node.callee, scope);
                for (const a of node.arguments) walkExpr(a, scope);
                break;
            case 'SpreadElement': walkExpr(node.argument, scope); break;
            case 'UnaryExpression': walkExpr(node.argument, scope); break;
            case 'UpdateExpression': assignTarget(node.argument, scope); break;
            case 'BinaryExpression':
            case 'LogicalExpression':
                walkExpr(node.left, scope);
                walkExpr(node.right, scope);
                break;
            case 'AssignmentExpression':
                assignTarget(node.left, scope);
                walkExpr(node.right, scope);
                break;
            case 'ConditionalExpression':
                walkExpr(node.test, scope);
                walkExpr(node.consequent, scope);
                walkExpr(node.alternate, scope);
                break;
            case 'SequenceExpression':
                for (const e of node.expressions) walkExpr(e, scope);
                break;
            case 'AwaitExpression': walkExpr(node.argument, scope); break;
            case 'ImportExpression': walkExpr(node.source, scope); break;
            case 'ArrowFunctionExpression':
            case 'FunctionExpression':
                walkFunction(node, scope);
                break;
            case 'ClassExpression': walkClass(node, scope); break;
            default: note(node, `unknown expr ${node.type}`);
        }
    }
    function walkStmt(node, scope) {
        if (!node) return;
        switch (node.type) {
            case 'EmptyStatement':
            case 'ImportDeclaration':
            case 'BreakStatement':
            case 'ContinueStatement':
                break;
            case 'BlockStatement': {
                const block = childScope(scope);
                prebind(node.body, block, problems);
                for (const stmt of node.body) walkStmt(stmt, block);
                break;
            }
            case 'ExpressionStatement': walkExpr(node.expression, scope); break;
            case 'ReturnStatement': if (node.argument) walkExpr(node.argument, scope); break;
            case 'ThrowStatement': walkExpr(node.argument, scope); break;
            case 'IfStatement':
                walkExpr(node.test, scope);
                walkStmt(node.consequent, scope);
                if (node.alternate) walkStmt(node.alternate, scope);
                break;
            case 'WhileStatement':
                walkExpr(node.test, scope);
                walkStmt(node.body, scope);
                break;
            case 'ForStatement': {
                if (node.init?.type === 'VariableDeclaration' && node.init.kind !== 'var') {
                    const loop = childScope(scope);
                    for (const d of node.init.declarations) {
                        walkPatternKeys(d.id, scope);
                        declarePattern(d.id, loop, problems);
                        walkPatternDefaults(d.id, loop);
                        if (d.init) walkExpr(d.init, loop);
                    }
                    if (node.test) walkExpr(node.test, loop);
                    if (node.update) walkExpr(node.update, loop);
                    walkStmt(node.body, loop);
                } else {
                    if (node.init?.type === 'VariableDeclaration') {
                        for (const d of node.init.declarations) if (d.init) walkExpr(d.init, scope);
                    } else if (node.init) walkExpr(node.init, scope);
                    if (node.test) walkExpr(node.test, scope);
                    if (node.update) walkExpr(node.update, scope);
                    walkStmt(node.body, scope);
                }
                break;
            }
            case 'ForOfStatement':
            case 'ForInStatement': {
                walkExpr(node.right, scope);
                if (node.left.type === 'VariableDeclaration' && node.left.kind !== 'var') {
                    const loop = childScope(scope);
                    for (const d of node.left.declarations) {
                        walkPatternKeys(d.id, scope);
                        declarePattern(d.id, loop, problems);
                        walkPatternDefaults(d.id, loop);
                    }
                    walkStmt(node.body, loop);
                } else if (node.left.type === 'VariableDeclaration') {
                    walkStmt(node.body, scope);
                } else {
                    assignTarget(node.left, scope);
                    walkStmt(node.body, scope);
                }
                break;
            }
            case 'SwitchStatement': {
                walkExpr(node.discriminant, scope);
                const block = childScope(scope);
                const stmts = node.cases.flatMap(c => c.consequent);
                prebind(stmts, block, problems);
                for (const c of node.cases) {
                    if (c.test) walkExpr(c.test, scope);
                    for (const stmt of c.consequent) walkStmt(stmt, block);
                }
                break;
            }
            case 'TryStatement':
                walkStmt(node.block, scope);
                if (node.handler) {
                    const caught = childScope(scope);
                    if (node.handler.param) declarePattern(node.handler.param, caught, problems);
                    walkStmt(node.handler.body, caught);
                }
                if (node.finalizer) walkStmt(node.finalizer, scope);
                break;
            case 'VariableDeclaration':
                for (const d of node.declarations) {
                    walkPatternKeys(d.id, scope);
                    walkPatternDefaults(d.id, scope);
                    if (d.init) walkExpr(d.init, scope);
                }
                break;
            case 'FunctionDeclaration': walkFunction(node, scope); break;
            case 'ClassDeclaration': walkClass(node, scope); break;
            case 'ExportNamedDeclaration':
                if (node.declaration) walkStmt(node.declaration, scope);
                else if (!node.source) for (const spec of node.specifiers) checkRef(spec.local, scope);
                break;
            case 'ExportDefaultDeclaration':
                if (node.declaration?.type === 'FunctionDeclaration' || node.declaration?.type === 'ClassDeclaration') walkStmt(node.declaration, scope);
                else walkExpr(node.declaration, scope);
                break;
            case 'ExportAllDeclaration': break;
            case 'DebuggerStatement': break;
            default: note(node, `unknown stmt ${node.type}`);
        }
    }

    const scope = childScope(null);
    for (const stmt of ast.body) {
        if (stmt.type === 'ImportDeclaration') {
            for (const spec of stmt.specifiers) scope.vars.add(spec.local.name);
        }
    }
    collectVars(ast, scope, problems);
    prebind(ast.body, scope, problems);
    for (const stmt of ast.body) walkStmt(stmt, scope);
    return problems;
}

function exportedName(spec) {
    if (!spec) return null;
    if (spec.type === 'Identifier') return spec.name;
    if (spec.type === 'Literal') return String(spec.value);
    return null;
}

const acorn = await loadAcorn();
assert.ok(acorn?.parse, 'acorn is required to scan for undeclared identifiers');

const fixture = scanUndeclared('fixture.js', "import { foo } from './x.js';\nexport function f(){ return WORLDS + foo; }\n", acorn.parse);
assert.deepEqual(fixture.map(line => line.match(/undeclared (\w+)/)?.[1]).filter(Boolean), ['WORLDS']);

const files = walkJs(srcDir).sort();
assert.ok(files.length > 20, `expected src modules, found ${files.length}`);
const problems = [];

for (const file of files) {
    const rel = file.slice(root.length + 1);
    const checked = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (checked.status !== 0) problems.push(`${rel} node --check failed\n${checked.stderr || checked.stdout}`);
    const source = readFileSync(file, 'utf8');
    for (const hit of scanUndeclared(rel, source, acorn.parse)) problems.push(hit);

    let ast;
    try { ast = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'module' }); }
    catch (err) { problems.push(`${rel} parse: ${err.message}`); continue; }

    for (const stmt of ast.body) {
        const specs = [];
        if (stmt.type === 'ImportDeclaration') {
            for (const spec of stmt.specifiers) {
                if (spec.type === 'ImportSpecifier') specs.push(exportedName(spec.imported));
                else if (spec.type === 'ImportDefaultSpecifier') specs.push('default');
            }
        } else if (stmt.type === 'ExportNamedDeclaration' && stmt.source) {
            for (const spec of stmt.specifiers) specs.push(exportedName(spec.local));
        } else if (stmt.type === 'ExportAllDeclaration') {
            specs.push(null);
        } else continue;

        const from = stmt.source.value;
        if (!from.startsWith('.')) {
            problems.push(`${rel} bare import ${from}`);
            continue;
        }
        const target = fileURLToPath(new URL(from, pathToFileURL(file)));
        let ns;
        try { ns = await import(pathToFileURL(target).href); }
        catch (err) { problems.push(`${rel} import ${from} failed: ${err.message}`); continue; }
        for (const name of specs) {
            if (name == null) continue;
            if (!Object.prototype.hasOwnProperty.call(ns, name)) problems.push(`${rel} imports ${name} but ${from} does not export it`);
        }
    }
}

if (problems.length) {
    for (const line of problems) console.log(`  FAIL ${line}`);
    console.log(`\n${problems.length} binding problems`);
    process.exit(1);
}
console.log(`ok - ${files.length} src modules: node --check, imports resolve, no undeclared identifiers`);
