#!/usr/bin/env node
/**
 * Generador del dataset de demostración.
 * Crea data/incidencies-demo.xml con datos sucios (fechas imposibles,
 * registros futuros, campos vacíos, duplicados...) para poder probar
 * todos los filtros de Turboincidencias 3000.
 *
 * Uso: node tools/gen-demo.js
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../data/incidencies-demo.xml');

// PRNG determinista (mulberry32) para que el dataset no cambie entre builds.
let seed = 0x1a2b3c4d;
function rnd() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const chance = (p) => rnd() < p;
const between = (a, b) => a + Math.floor(rnd() * (b - a + 1));

const TIPOS = [
  { v: 'Hardware', w: 34, clases: ['Placa base', 'Disco duro', 'Memoria RAM', 'Pantalla', 'Teclado', 'Batería', 'Ventilador', 'Puerto USB'] },
  { v: 'Software', w: 24, clases: ['Sistema operativo', 'Ofimática', 'Navegador', 'Antivirus', 'Actualización', 'Licencia'] },
  { v: 'Red', w: 15, clases: ['Wi-Fi', 'VPN', 'Cableado', 'DNS', 'Proxy', 'Impresora de red'] },
  { v: 'Impresora', w: 10, clases: ['Atasco de papel', 'Tóner', 'Controlador', 'Escáner'] },
  { v: 'Accesos', w: 9, clases: ['Contraseña', 'Permisos', 'Correo', 'Alta de usuario', 'Doble factor'] },
  { v: 'Telefonía', w: 5, clases: ['Softphone', 'Auriculares', 'Desvío de llamada'] },
  { v: 'Otros', w: 3, clases: ['Mobiliario', 'Traslado de puesto', 'Consulta'] }
];
const TIPO_BAG = TIPOS.flatMap((t) => Array.from({ length: t.w }, () => t.v));

const PRIORIDADES = [
  ['Crítica', 8],
  ['Alta', 22],
  ['Media', 45],
  ['Baja', 20],
  ['Sin prioridad', 5]
];
const PRIO_BAG = PRIORIDADES.flatMap(([v, w]) => Array.from({ length: w }, () => v));

const ESTADOS = [
  ['Resuelta', 68],
  ['En curso', 14],
  ['Abierta', 11],
  ['Pendiente usuario', 7]
];
const ESTADO_BAG = ESTADOS.flatMap(([v, w]) => Array.from({ length: w }, () => v));

const TECNICOS = ['M. Varga', 'A. Ferrer', 'L. Puig', 'J. Serra', 'N. Ortiz', 'R. Camps', 'S. Vidal', 'Unassigned'];
const UBICACIONES = ['Barcelona · Seu', 'Barcelona · 22@', 'Girona', 'Tarragona', 'Valencia', 'Madrid', 'Remoto'];

const LAPTOPS = ['ThinkPad T14 Gen 4', 'Latitude 5430', 'EliteBook 840 G9', 'MacBook Pro 14 M3', 'Aspire 5 A515', 'Yoga Slim 7', 'Precision 3571'];
const DESKTOPS = ['OptiPlex 7090', 'ProDesk 600 G6', 'ThinkCentre M70q', 'iMac 24 M1', 'Vostro 3020', 'NUC 12 Pro', 'Z2 Tower G9'];

const DESC = {
  Hardware: ['El equipo no arranca tras una actualización.', 'Ruido anómalo en el ventilador.', 'La pantalla parpadea de forma intermitente.', 'El teclado no responde en varias teclas.', 'La batería no carga al conectarse.', 'Disco con errores SMART, requiere sustitución.'],
  Software: ['La aplicación se cierra al abrir un documento.', 'Windows muestra error 0xc000021a al iniciar.', 'Actualización de Office bloqueada.', 'El antivirus detecta un falso positivo.', 'No se puede activar la licencia de Adobe.', 'Perfil de usuario corrupto.'],
  Red: ['Sin conexión Wi-Fi en la tercera planta.', 'La VPN rechaza las credenciales.', 'Latencia elevada al acceder al ERP.', 'El switch de planta no responde. ', 'DNS interno no resuelve los nombres.'],
  Impresora: ['Atasco recurrente en la bandeja 2.', 'El tóner se agota cada dos semanas.', 'La impresora de red desaparece del listado.', 'El escáner devuelve páginas en blanco.'],
  Accesos: ['Contraseña caducada y sin acceso al correo.', 'Permisos de escritura en la carpeta compartida.', 'Alta de usuario para nueva incorporación.', 'El doble factor no llega al teléfono.'],
  Telefonía: ['El softphone no registra la extensión.', 'Auriculares con micrófono defectuoso.', 'Desvío de llamada mal configurado.'],
  Otros: ['Traslado de puesto a otra planta.', 'Solicitud de segunda pantalla.', 'Silla con ruedas defectuosas. ', 'Consulta sobre política de uso.']
};

const MONTH_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const pad = (n) => String(n).padStart(2, '0');

function fmtDate(d, style) {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  switch (style) {
    case 'dmy': return `${pad(day)}/${pad(m)}/${y}`;
    case 'dmy-short': return `${pad(day)}/${pad(m)}/${String(y).slice(2)}`;
    case 'dash': return `${pad(day)}-${pad(m)}-${y}`;
    case 'iso': return `${y}-${pad(m)}-${pad(day)}`;
    case 'iso-time': return `${y}-${pad(m)}-${pad(day)}T${pad(between(8, 19))}:${pad(between(0, 59))}:00`;
    case 'long': return `${day} ${MONTH_ES[m - 1]} ${y}`;
    case 'us': return `${pad(m)}/${pad(day)}/${y}`;
    default: return `${y}-${pad(m)}-${pad(day)}`;
  }
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function makeDate(i, total) {
  // Distribución por meses desde enero 2024 hasta noviembre 2026, con
  // más volumen en los meses recientes (tendencia creciente).
  const start = Date.UTC(2024, 0, 1);
  const end = Date.UTC(2026, 10, 16);
  const x = Math.pow((i + 1) / total, 0.72); // sesgo hacia el presente
  const t = start + x * (end - start);
  const d = new Date(t);
  d.setUTCDate(between(1, 28));
  return d;
}

const TOTAL = 812;
const records = [];
let counter = 0;

for (let i = 0; i < TOTAL; i++) {
  const tipo = pick(TIPO_BAG);
  const tipoDef = TIPOS.find((t) => t.v === tipo);
  const clase = pick(tipoDef.clases);
  let prioridad = pick(PRIO_BAG);
  let estado = pick(ESTADO_BAG);

  // Coherencia: las críticas suelen estar abiertas/en curso
  if (prioridad === 'Crítica' && chance(0.55)) estado = pick(['Abierta', 'En curso']);
  if (estado === 'Resuelta' && chance(0.25) && (prioridad === 'Crítica' || prioridad === 'Alta')) prioridad = 'Media';

  const fecha = makeDate(i, TOTAL);
  const año = fecha.getUTCFullYear();
  counter++;
  const id = `INC-${año}-${String(counter).padStart(4, '0')}`;

  const esPortatil = chance(0.6);
  let equipo = esPortatil ? 'Portátil' : 'Sobremesa';

  // Suciedad controlada
  const dirty = {
    equipoVariant: chance(0.05),
    noModel: chance(0.04),
    future: chance(0.018),
    invalidDate: chance(0.012),
    emptyDate: chance(0.02),
    noInfo: chance(0.018),
    dirtyPriority: chance(0.07),
    dirtyId: chance(0.03)
  };

  if (dirty.equipoVariant) equipo = esPortatil ? pick(['Portatil', 'Laptop', 'Notebook']) : pick(['Desktop', 'Torre', 'PC sobremesa']);

  const portatilModel = chance(0.92) ? pick(LAPTOPS) : 'N/A';
  const sobremesaModel = chance(0.92) ? pick(DESKTOPS) : 'N/A';

  let fechaTexto;
  if (dirty.future) {
    const f = new Date(Date.UTC(2027, between(0, 5), between(1, 28)));
    fechaTexto = fmtDate(f, pick(['iso', 'dmy', 'iso-time']));
  } else if (dirty.invalidDate) {
    fechaTexto = pick(['31/02/2025', '2025-13-45', 'pendiente', '00/00/0000', '2026-11-31']);
  } else if (dirty.emptyDate) {
    fechaTexto = '';
  } else {
    fechaTexto = fmtDate(fecha, pick(['iso', 'iso', 'iso', 'dmy', 'dmy', 'iso-time', 'dash', 'long', 'us', 'dmy-short']));
  }

  // Fecha de cierre coherente cuando está resuelta
  let cierre = '';
  if (estado === 'Resuelta' && !dirty.future && !dirty.invalidDate) {
    const f = new Date(fecha.getTime() + between(1, 18) * 86400000);
    cierre = fmtDate(f, pick(['iso', 'iso-time', 'dmy']));
  }

  let estadoFinal = estado;
  let tecnico = estado === 'Abierta' && chance(0.4) ? 'Unassigned' : pick(TECNICOS);
  let ubicacion = pick(UBICACIONES);
  let descripcion = pick(DESC[tipo]);

  if (dirty.noInfo) {
    // Registro basura: toda la información relevante vacía o placeholder
    estadoFinal = pick(['', 'N/A', 'desconocido']);
    tecnico = pick(['', 'N/A', '-']);
    ubicacion = pick(['', 'N/A', 'sin datos']);
    descripcion = pick(['', 'N/A', '-']);
    prioridad = pick(['', 'N/A', 'desconocido']);
    equipo = pick(['', 'N/A', 'null']);
    cierre = '';
  }

  const dirtyPrioridad = dirty.dirtyPriority ? pick(['alta', 'Urgente', 'N/A', '', 'baja']) : prioridad;
  const idFinal = dirty.dirtyId ? pick([`inc-${counter}`, `${counter}`, '', `INC-${año}-${String(counter).padStart(4, '0')} `]) : id;

  records.push({
    id: idFinal,
    tipo: dirty.noInfo && chance(0.5) ? pick(['', 'N/A', '-']) : tipo,
    equipo,
    clase: dirty.noInfo ? pick(['', 'N/A', 'sin datos']) : clase,
    prioridad: dirty.noInfo ? prioridad : dirtyPrioridad,
    estado: estadoFinal,
    tecnico,
    ubicacion,
    descripcion,
    portatilModel: dirty.noModel ? '' : portatilModel,
    sobremesaModel: dirty.noModel ? '' : sobremesaModel,
    fechaTexto,
    cierre,
    horas: estado === 'Resuelta' ? between(1, 72) : '',
    origen: pick(['Soporte presencial', 'Portal web', 'Teléfono', 'Correo', 'Agente automático'])
  });
}

// Duplicados: se copia un registro previo con un ID nuevo.
const dups = [];
for (let i = 0; i < 14; i++) {
  const base = records[between(40, records.length - 40)];
  const copy = { ...base, id: `INC-DUP-${pad(i + 1)}` };
  dups.push(copy);
}
records.push(...dups);

// Orden cronológico aproximado (los inválidos al final no importan)
records.sort((a, b) => (a.fechaTexto > b.fechaTexto ? 1 : -1));

const lines = [];
lines.push('<?xml version="1.0" encoding="UTF-8"?>');
lines.push('<!-- Turboincidencias 3000 · dataset de demostración · generado con tools/gen-demo.js -->');
lines.push('<Incidencies>');
for (const r of records) {
  lines.push('  <Incidencia>');
  lines.push(`    <ID>${esc(r.id)}</ID>`);
  lines.push(`    <Tipo_de_incidencia>${esc(r.tipo)}</Tipo_de_incidencia>`);
  lines.push(`    <Tipo_de_equipo>${esc(r.equipo)}</Tipo_de_equipo>`);
  lines.push(`    <Clases>${esc(r.clase)}</Clases>`);
  lines.push(`    <Prioridad>${esc(r.prioridad)}</Prioridad>`);
  lines.push(`    <Estado>${esc(r.estado)}</Estado>`);
  lines.push(`    <Fecha_de_incidencia>${esc(r.fechaTexto)}</Fecha_de_incidencia>`);
  if (r.cierre) lines.push(`    <Fecha_cierre>${esc(r.cierre)}</Fecha_cierre>`);
  lines.push(`    <Modelo>${esc(r.portatilModel)}</Modelo>`);
  lines.push(`    <Modelo>${esc(r.sobremesaModel)}</Modelo>`);
  lines.push(`    <Tecnico>${esc(r.tecnico)}</Tecnico>`);
  lines.push(`    <Ubicacion>${esc(r.ubicacion)}</Ubicacion>`);
  lines.push(`    <Horas_resolucion>${esc(r.horas)}</Horas_resolucion>`);
  lines.push(`    <Origen>${esc(r.origen)}</Origen>`);
  lines.push(`    <Descripcion>${esc(r.descripcion)}</Descripcion>`);
  lines.push('  </Incidencia>');
}
lines.push('</Incidencies>');
lines.push('');

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, lines.join('\n'), 'utf8');
console.log(`✔ ${records.length} incidencias escritas en ${out}`);
