#!/usr/bin/env node
/**
 * Comprobaciones estáticas del proyecto: sintaxis de los módulos,
 * recursos referenciados, iconos y vistas enlazadas.
 *
 * Uso: node tools/check.js
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ICON_NAMES } from '../js/icons.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const info = [];

const read = (file) => readFileSync(join(root, file), 'utf8');

/* 1. sintaxis de los módulos ------------------------------------------------ */
for (const dir of ['js', 'tools']) {
  for (const file of readdirSync(join(root, dir))) {
    if (!file.endsWith('.js')) continue;
    const target = join(dir, file);
    const res = spawnSync(process.execPath, ['--check', join(root, target)], { encoding: 'utf8' });
    if (res.status !== 0) problems.push(`Sintaxis: ${target}\n${res.stderr.trim()}`);
  }
}
info.push('Sintaxis JS revisada');

/* 2. recursos referenciados en el HTML -------------------------------------- */
const html = read('index.html');
for (const match of html.matchAll(/(?:href|src)="([^"#]+)"/g)) {
  const ref = match[1];
  if (/^(https?:|data:|mailto:)/.test(ref)) continue;
  if (!existsSync(join(root, ref))) problems.push(`Recurso inexistente: ${ref}`);
}
info.push('Recursos del HTML revisados');

/* 3. iconos ---------------------------------------------------------------- */
const iconCalls = new Set();
for (const file of readdirSync(join(root, 'js'))) {
  if (!file.endsWith('.js')) continue;
  const code = read(join('js', file));
  for (const m of code.matchAll(/icon\(\s*'([a-z0-9-]+)'/g)) iconCalls.add(m[1]);
  for (const m of code.matchAll(/iconName:\s*'([a-z0-9-]+)'/g)) iconCalls.add(m[1]);
  for (const m of code.matchAll(/icon:\s*'([a-z0-9-]+)'/g)) iconCalls.add(m[1]);
}
for (const m of html.matchAll(/data-icon="([a-z0-9-]+)"/g)) iconCalls.add(m[1]);
for (const name of iconCalls) {
  if (!ICON_NAMES.includes(name)) problems.push(`Icono desconocido: "${name}"`);
}
info.push(`${iconCalls.size} iconos comprobados`);

/* 4. vistas enlazadas ------------------------------------------------------ */
const viewsCode = read('js/views.js');
const defined = new Set([...viewsCode.matchAll(/^    ([a-z]+): \{$/gm)].map((m) => m[1]));
for (const m of html.matchAll(/data-open="([a-z]+)"/g)) {
  if (!defined.has(m[1])) problems.push(`Vista enlazada inexistente: ${m[1]}`);
}
info.push(`Vistas definidas: ${[...defined].join(', ')}`);

/* 5. dataset de demostración ----------------------------------------------- */
const demo = read('data/incidencies-demo.xml');
const open = (demo.match(/<Incidencia>/g) || []).length;
const close = (demo.match(/<\/Incidencia>/g) || []).length;
if (open !== close) problems.push(`XML de demo descuadrado: ${open} aperturas / ${close} cierres`);
const bytes = statSync(join(root, 'data/incidencies-demo.xml')).size;
info.push(`Dataset demo: ${open} incidencias · ${(bytes / 1024).toFixed(0)} KB`);

/* 6. tamaño total de los recursos ------------------------------------------ */
let total = 0;
const walk = (dir) => {
  for (const entry of readdirSync(join(root, dir))) {
    if (entry === '.git' || entry === 'node_modules') continue;
    const full = join(root, dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) walk(join(dir, entry));
    else total += s.size;
  }
};
['css', 'js', 'data'].forEach(walk);
info.push(`Peso de la app: ${(total / 1024).toFixed(0)} KB`);

/* salida ------------------------------------------------------------------- */
console.log('TURBOINCIDENCIAS 3000 · comprobación\n');
info.forEach((line) => console.log(`  ✔ ${line}`));
if (problems.length) {
  console.log('\nProblemas:\n');
  problems.forEach((p) => console.log(`  ✖ ${p}`));
  process.exit(1);
}
console.log('\nTodo correcto.');
