/**
 * Turboincidencias 3000 — arranque, estado global y cableado.
 */
import { hydrateIcons, icon } from './icons.js';
import { sound } from './sound.js';
import { parseDataset } from './parser.js';
import {
  defaultFilters, applyPreset, applyFilters, PRESETS, presetCounts, activeChips,
  describeFilter, PRESET_BY_ID
} from './filters.js';
import { computeStats } from './stats.js';
import { createWindowManager } from './windows.js';
import { createViews } from './views.js';
import { redrawAll } from './charts.js';
import {
  esc, num, dec, pct, fmtDate, todayISO, download, toCsv, nowTime, clockTime,
  clamp, formatBytes, monthLabel
} from './util.js';

/* ------------------------------------------------------------------ */
/* Referencias del DOM                                                 */
/* ------------------------------------------------------------------ */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const screenEl = $('#screen');
const glassEl = $('#glass');
const monitorEl = $('#monitor');
const workspaceEl = $('#workspace');
const layerEl = $('#winLayer');
const fileInput = $('#fileInput');
const toastsEl = $('#toasts');
const bootEl = $('#boot');
const bootLinesEl = $('#bootLines');
const standbyEl = $('#standby');
const ledEl = $('#led');

const SETTINGS_KEY = 'turbo3000.settings';
const DATASET_KEY = 'turbo3000.dataset';
const FILTERS_KEY = 'turbo3000.filters';

const DEFAULT_SETTINGS = {
  theme: 'amber',
  scanlines: true,
  tilt: true,
  sound: false,
  boot: true
};

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------------ */
/* Estado                                                              */
/* ------------------------------------------------------------------ */
const state = {
  dataset: null,
  filter: defaultFilters(),
  results: null,
  settings: loadSettings(),
  savedFilters: loadSavedFilters(),
  log: [],
  selectedRecord: null,
  booted: false
};

const ui = {
  page: 0,
  sort: { key: 'fecha', dir: 'desc' }
};

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return { ...DEFAULT_SETTINGS, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings)); } catch { /* */ }
}

function loadSavedFilters() {
  try {
    const raw = localStorage.getItem(FILTERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistSavedFilters() {
  try { localStorage.setItem(FILTERS_KEY, JSON.stringify(state.savedFilters)); } catch { /* */ }
}

/* ------------------------------------------------------------------ */
/* Log y avisos                                                        */
/* ------------------------------------------------------------------ */
function pushLog(level, text) {
  state.log.unshift({ time: nowTime(), level, text });
  if (state.log.length > 240) state.log.length = 240;
  if (wm.isOpen('registro')) wm.refresh('registro');
}

function toast(message, kind = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast--${kind}`;
  el.innerHTML = esc(message);
  toastsEl.appendChild(el);
  setTimeout(() => {
    el.classList.add('is-out');
    setTimeout(() => el.remove(), 320);
  }, 3400);
}

/* ------------------------------------------------------------------ */
/* Gestor de ventanas y vistas                                         */
/* ------------------------------------------------------------------ */
const wm = createWindowManager({
  layer: layerEl,
  workspace: workspaceEl,
  onChange: () => updateTaskbar()
});

const app = {
  state,
  ui,
  get wm() { return wm; },
  get results() { return state.results; },
  openView,
  openRecord,
  navigateRecord,
  setFilter,
  applyPreset: applyPresetById,
  resetFilter,
  toggleFacet,
  clearFacet,
  removeChip,
  addRule,
  updateRule,
  removeRule,
  saveCurrentFilter,
  applySavedFilter,
  deleteSavedFilter,
  loadDemo,
  requestFile,
  clearDataset,
  toast,
  log: pushLog,
  notify,
  setSetting,
  resetWindows,
  exportCsv,
  exportJson,
  exportSummary,
  exportReportTxt,
  exportReportHtml,
  exportLog,
  buildSummaryText,
  copyFallback
};

const views = createViews(app);

/* ------------------------------------------------------------------ */
/* Cálculo de resultados                                               */
/* ------------------------------------------------------------------ */
function computeResults() {
  if (!state.dataset) {
    state.results = {
      rows: [],
      total: 0,
      excluded: { invalidDate: 0, future: 0, noInfo: 0, duplicates: 0 },
      stats: null,
      presetCounts: Object.fromEntries(PRESETS.map((p) => [p.id, 0]))
    };
    return state.results;
  }
  const res = applyFilters(state.dataset, state.filter);
  res.stats = computeStats(res.rows);
  if (!state.dataset._presetCounts) state.dataset._presetCounts = presetCounts(state.dataset);
  res.presetCounts = state.dataset._presetCounts;
  res.quality = state.dataset.summary;
  state.results = res;

  if (ui.page > 0 && ui.page * 20 >= res.rows.length) {
    ui.page = Math.max(0, Math.ceil(res.rows.length / 20) - 1);
  }
  return res;
}

/* ------------------------------------------------------------------ */
/* Filtros                                                             */
/* ------------------------------------------------------------------ */
function focusSnapshot() {
  const active = document.activeElement;
  if (!active || !active.dataset || !active.dataset.focusKey) return null;
  return {
    key: active.dataset.focusKey,
    start: active.selectionStart ?? null,
    end: active.selectionEnd ?? null
  };
}

function restoreFocus(snap) {
  if (!snap) return;
  const el = document.querySelector(`[data-focus-key="${snap.key}"]`);
  if (!el) return;
  el.focus();
  if (snap.start !== null && typeof el.setSelectionRange === 'function') {
    try { el.setSelectionRange(snap.start, snap.end ?? snap.start); } catch { /* no soportado */ }
  }
}

function notify(onlyView = null) {
  const snap = focusSnapshot();
  computeResults();
  updateChrome();

  const targets = onlyView ? [onlyView] : ['analisis', 'filtros', 'informe', 'exportar', 'acerca', 'datos'];
  for (const id of targets) {
    if (wm.get(id) && !wm.get(id).el.classList.contains('is-min')) wm.refresh(id);
  }
  restoreFocus(snap);
}

function setFilter(patch, options = {}) {
  const { resetPage = true, preset } = options;
  state.filter = {
    ...state.filter,
    ...patch,
    preset: preset || 'custom',
    quality: { ...state.filter.quality, ...(patch.quality || {}) },
    date: { ...state.filter.date, ...(patch.date || {}) },
    facets: patch.facets ? { ...state.filter.facets, ...patch.facets } : state.filter.facets,
    rules: patch.rules ? { ...state.filter.rules, ...patch.rules } : state.filter.rules
  };
  if (resetPage) ui.page = 0;
  sound.play('tick');
  notify();
}

function applyPresetById(id) {
  state.filter = applyPreset(id);
  ui.page = 0;
  sound.play('apply');
  const preset = PRESET_BY_ID.get(id);
  pushLog('info', `Filtro aplicado: ${preset?.name || id}`);
  notify();
}

function resetFilter() {
  state.filter = defaultFilters();
  ui.page = 0;
  sound.play('click');
  pushLog('info', 'Filtros reiniciados');
  notify();
}

function toggleFacet(field, value) {
  const list = state.filter.facets[field] || [];
  const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  setFilter({ facets: { [field]: next } });
  sound.play('click');
}

function clearFacet(field) {
  setFilter({ facets: { [field]: [] } });
}

function removeChip(index) {
  const chips = activeChips(state.filter);
  const chip = chips[index];
  if (!chip) return;

  if (chip.kind === 'facet') {
    toggleFacet(chip.field, chip.value);
    return;
  }
  if (chip.kind === 'date') {
    const key = chip.label.startsWith('Desde') ? 'from' : 'to';
    setFilter({ date: { [key]: '' } });
    return;
  }
  if (chip.kind === 'search') {
    setFilter({ search: '' });
    return;
  }
  if (chip.kind === 'rule') {
    removeRule(chip.index);
    return;
  }
  if (chip.kind === 'only') {
    setFilter({ quality: { ...state.filter.quality, only: null } });
    return;
  }
  if (chip.kind === 'quality') {
    setFilter({ quality: { ...state.filter.quality, excludeDuplicates: false } });
    return;
  }
  if (chip.kind === 'preset') {
    const base = applyPreset('all');
    state.filter = { ...state.filter, preset: 'all', quality: base.quality };
    notify();
  }
}

function addRule() {
  const list = [...state.filter.rules.list, { field: 'tipo', op: 'contains', value: '' }];
  setFilter({ rules: { ...state.filter.rules, list } }, { resetPage: true });
  pushLog('info', 'Regla añadida');
}

function updateRule(index, patch, options = {}) {
  const list = state.filter.rules.list.map((rule, i) => (i === index ? { ...rule, ...patch } : rule));
  setFilter({ rules: { ...state.filter.rules, list } }, { resetPage: !options.quiet });
}

function removeRule(index) {
  const list = state.filter.rules.list.filter((_, i) => i !== index);
  setFilter({ rules: { ...state.filter.rules, list } });
}

function saveCurrentFilter(name) {
  const clean = String(name || '').trim();
  if (!clean) {
    toast('Ponle un nombre al filtro antes de guardar', 'warn');
    return;
  }
  const item = {
    id: `f${Date.now().toString(36)}`,
    name: clean.slice(0, 60),
    filter: JSON.parse(JSON.stringify({ ...state.filter, preset: state.filter.preset })),
    count: state.results?.rows.length || 0,
    created: Date.now()
  };
  state.savedFilters = [item, ...state.savedFilters].slice(0, 12);
  persistSavedFilters();
  pushLog('ok', `Filtro guardado: ${item.name}`);
  toast(`Filtro “${item.name}” guardado`);
  notify();
}

function applySavedFilter(id) {
  const item = state.savedFilters.find((s) => s.id === id);
  if (!item) return;
  state.filter = JSON.parse(JSON.stringify(item.filter));
  ui.page = 0;
  sound.play('apply');
  pushLog('info', `Filtro guardado aplicado: ${item.name}`);
  toast(`Filtro “${item.name}” aplicado`);
  notify();
}

function deleteSavedFilter(id) {
  state.savedFilters = state.savedFilters.filter((s) => s.id !== id);
  persistSavedFilters();
  notify('filtros');
  toast('Filtro eliminado');
}

/* ------------------------------------------------------------------ */
/* Datos                                                               */
/* ------------------------------------------------------------------ */
async function loadDemo(options = {}) {
  try {
    const res = await fetch('data/incidencies-demo.xml', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const dataset = loadText(text, { filename: 'incidencies-demo.xml', size: text.length }, options);
    if (!options.silent) toast('Dataset de demostración cargado');
    return dataset;
  } catch (error) {
    pushLog('error', `No se pudo cargar la demo: ${error.message}`);
    toast('No se pudo cargar el dataset de demostración', 'error');
    return null;
  }
}

function loadText(text, meta, options = {}) {
  const dataset = parseDataset(text, meta);
  state.dataset = dataset;
  state.filter = defaultFilters();
  state.selectedRecord = null;
  ui.page = 0;
  ui.sort = { key: 'fecha', dir: 'desc' };

  try {
    if (text.length < 3_600_000) {
      localStorage.setItem(DATASET_KEY, JSON.stringify({
        text,
        filename: dataset.filename,
        size: dataset.size,
        savedAt: Date.now()
      }));
    } else {
      localStorage.removeItem(DATASET_KEY);
    }
  } catch {
    try { localStorage.removeItem(DATASET_KEY); } catch { /* */ }
  }

  computeResults();
  renderAll();
  updateChrome();

  pushLog('ok', `Documento cargado: ${dataset.filename} · ${num(dataset.summary.total)} registros · ${num(dataset.summary.valid)} válidos`);
  if (dataset.warnings.length) dataset.warnings.forEach((w) => pushLog('warn', w));
  if (dataset.summary.excludedByQuality) {
    pushLog('warn', `${num(dataset.summary.excludedByQuality)} registros descartados por calidad de datos`);
  }

  document.title = `Turboincidencias 3000 — ${num(dataset.summary.total)} incidencias`;

  if (!options.silent) {
    sound.play('load');
    openView('analisis');
  }
  return dataset;
}

function clearDataset() {
  state.dataset = null;
  state.filter = defaultFilters();
  state.selectedRecord = null;
  try { localStorage.removeItem(DATASET_KEY); } catch { /* */ }
  computeResults();
  renderAll();
  updateChrome();
  document.title = 'Turboincidencias 3000 — Análisis de incidencias TI';
  pushLog('warn', 'Dataset eliminado de la sesión');
  toast('Datos eliminados');
}

function requestFile() {
  fileInput.value = '';
  fileInput.click();
}

async function handleFile(file) {
  if (!file) return;
  const isXml = /\.xml$/i.test(file.name) || /xml/.test(file.type);
  if (!isXml) {
    toast('El archivo debe ser XML', 'error');
    sound.play('error');
    return;
  }
  if (file.size > 30 * 1024 * 1024) {
    toast('El archivo supera los 30 MB', 'error');
    sound.play('error');
    return;
  }
  toast(`Leyendo ${file.name}…`);
  try {
    const buffer = await file.arrayBuffer();
    const head = new TextDecoder('latin1').decode(buffer.slice(0, 400));
    const declared = /encoding\s*=\s*["']([^"']+)["']/i.exec(head)?.[1]?.toLowerCase();
    let text;
    try {
      text = new TextDecoder(declared || 'utf-8').decode(buffer);
    } catch {
      text = new TextDecoder('utf-8').decode(buffer);
    }
    text = text.replace(/^\uFEFF/, '');
    loadText(text, { filename: file.name, size: file.size });
    toast(`${file.name} · ${formatBytes(file.size)} procesados`);
  } catch (error) {
    pushLog('error', `Error al leer ${file.name}: ${error.message}`);
    toast(`No se pudo leer el XML: ${error.message}`, 'error');
    sound.play('error');
  }
}

/* ------------------------------------------------------------------ */
/* Ventanas                                                            */
/* ------------------------------------------------------------------ */
function openView(id) {
  const config = views[id];
  if (!config) return;
  const win = wm.open(id, config);
  if (win) sound.play('open');
  updateTaskbar();
}

function openRecord(idx) {
  if (!state.dataset) return;
  const record = state.dataset.records.find((r) => r.idx === idx);
  if (!record) return;
  state.selectedRecord = record;
  const win = wm.open('detalle', views.detalle);
  if (win) {
    const titleEl = win.el.querySelector('.win__title span');
    if (titleEl) titleEl.textContent = record.id || `Registro #${idx + 1}`;
    const crumb = win.el.querySelector('.win__crumbs');
    if (crumb) {
      crumb.innerHTML = `<span>Desktop</span><span class="sep">/</span><span>Análisis</span><span class="sep">/</span><b>${esc(record.id || `#${idx + 1}`)}</b>`;
    }
    wm.refresh('detalle');
  }
  sound.play('open');
}

function navigateRecord(delta) {
  if (!state.selectedRecord) return;
  const rows = state.results.rows;
  const pos = rows.findIndex((r) => r.idx === state.selectedRecord.idx);
  if (pos < 0) return;
  const next = rows[clamp(pos + delta, 0, rows.length - 1)];
  if (next) openRecord(next.idx);
}

function updateTaskbar() {
  const tabsEl = $('#taskbarTabs');
  if (!tabsEl) return;
  const wins = wm.list();
  tabsEl.innerHTML = wins.map((win) => {
    const active = !win.el.classList.contains('is-min') && win.el.classList.contains('is-focused');
    return `<button class="taskbar__tab ${active ? 'is-active' : ''} ${win.el.classList.contains('is-min') ? 'is-min' : ''}" data-tab="${win.id}" title="${esc(win.config.title)}">
      ${win.config.icon ? icon(win.config.icon) : ''}
      <span>${esc(win.config.title)}</span>
    </button>`;
  }).join('');

  tabsEl.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => openView(btn.dataset.tab));
  });

  // raíl: marca la vista activa
  const activeWin = wins.filter((w) => w.el.classList.contains('is-focused') && !w.el.classList.contains('is-min')).pop();
  $$('.rail__btn').forEach((btn) => {
    btn.classList.toggle('is-active', Boolean(activeWin) && btn.dataset.open === activeWin.id);
  });
}

function updateChrome() {
  const dataset = state.dataset;
  const summary = dataset?.summary;
  const results = state.results;

  $('#hsTotal').textContent = summary ? num(summary.total) : '—';
  $('#hsValid').textContent = summary ? num(summary.valid) : '—';
  $('#hsQuality').textContent = summary ? `${dec(summary.coverage * 100, 1)}%` : '—';

  $('#homeDoc').textContent = dataset ? dataset.filename : 'sin documento';
  $('#homeDate').textContent = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });

  const badge = $('#railBadgeText');
  if (badge) badge.textContent = dataset ? `${num(dataset.summary.total)} reg.` : 'sin datos';

  const ticker = $('#tickerText');
  if (ticker) {
    if (dataset) {
      const off = summary.total - summary.valid;
      ticker.innerHTML = `<b>${num(summary.total)}</b> incidencias · <b>${dec(summary.coverage * 100, 1)}%</b> válidas · ${num(off)} descartadas · filtro: <b>${esc(describeFilter(state.filter))}</b> → <b>${num(results?.rows.length || 0)}</b> registros`;
    } else {
      ticker.innerHTML = 'Ningún documento cargado · pulsa <b>Cargar XML</b> o usa el dataset de demostración';
    }
  }
  const tickerRight = $('#tickerRight');
  if (tickerRight) {
    tickerRight.textContent = dataset
      ? `${dataset.dateFieldTag ? dataset.dateFieldTag.replace(/_/g, ' ').toLowerCase() : 'sin fecha'}`
      : 'v3.0';
  }

  updateTaskbar();
}

function renderAll() {
  // refresca las ventanas abiertas tras cargar datos
  ['analisis', 'datos', 'filtros', 'informe', 'exportar', 'acerca', 'detalle', 'registro'].forEach((id) => {
    if (wm.get(id)) wm.refresh(id);
  });
  if (state.selectedRecord && wm.get('detalle')) wm.refresh('detalle');
}

/* ------------------------------------------------------------------ */
/* Ajustes                                                             */
/* ------------------------------------------------------------------ */
function applySettings() {
  const s = state.settings;
  screenEl.dataset.theme = s.theme;
  screenEl.style.setProperty('--scan-opacity', s.scanlines ? '0.55' : '0');
  monitorEl.style.transform = (!s.tilt || reduceMotion) ? 'none' : '';
  $('#soundBtn')?.classList.toggle('is-on', s.sound);
  $('#soundBtn')?.classList.toggle('is-off', !s.sound);
  $('#soundBtn')?.setAttribute('title', s.sound ? 'Silenciar' : 'Activar sonido');
  $('#tiltBtn')?.classList.toggle('is-on', s.tilt);
  $('#tiltBtn')?.classList.toggle('is-off', !s.tilt);
  $('#tiltBtn')?.setAttribute('title', s.tilt ? 'Desactivar inclinación 3D' : 'Activar inclinación 3D');
  if (s.sound !== sound.enabled) sound.setEnabled(s.sound);
  redrawAll();
}

function setSetting(key, value) {
  state.settings[key] = value;
  saveSettings();
  applySettings();
  if (key === 'theme') {
    pushLog('info', `Tema del fósforo: ${value}`);
    redrawAll();
    screenEl.classList.add('is-degauss');
    setTimeout(() => screenEl.classList.remove('is-degauss'), 520);
  }
  if (key === 'sound') {
    pushLog('info', `Sonido ${value ? 'activado' : 'desactivado'}`);
  }
  if (key === 'tilt') {
    pushLog('info', `Inclinación 3D ${value ? 'activada' : 'desactivada'}`);
  }
  if (key === 'scanlines') {
    pushLog('info', `Scanlines ${value ? 'activadas' : 'desactivadas'}`);
  }
  if (wm.get('acerca')) wm.refresh('acerca');
}

function resetWindows() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith('turbo3000.win.'))
      .forEach((k) => localStorage.removeItem(k));
  } catch { /* */ }
  wm.list().forEach((win) => wm.close(win.id));
  toast('Posiciones de ventana restauradas');
  openView('analisis');
}

/* ------------------------------------------------------------------ */
/* Energía                                                             */
/* ------------------------------------------------------------------ */
let powered = true;

function powerOff() {
  powered = false;
  screenEl.classList.add('is-off');
  standbyEl.classList.add('is-on');
  ledEl.classList.add('is-off');
  sound.play('power');
  pushLog('info', 'Monitor apagado');
}

function powerOn() {
  powered = true;
  standbyEl.classList.remove('is-on');
  screenEl.classList.remove('is-off');
  ledEl.classList.remove('is-off');
  screenEl.classList.add('is-booting');
  sound.play('power');
  setTimeout(() => screenEl.classList.remove('is-booting'), 750);
  pushLog('info', 'Monitor encendido');
}

function togglePower() {
  if (powered) powerOff();
  else powerOn();
}

/* ------------------------------------------------------------------ */
/* Exportación                                                         */
/* ------------------------------------------------------------------ */
function baseName() {
  return (state.dataset?.filename || 'incidencies').replace(/\.xml$/i, '').replace(/[^\w.-]+/g, '-');
}

const EXPORT_COLUMNS = [
  ['id', 'ID'],
  ['fecha', 'Fecha'],
  ['tipo', 'Tipo_de_incidencia'],
  ['equipo', 'Tipo_de_equipo'],
  ['marca', 'Marca'],
  ['modeloPortatil', 'Modelo_portatil'],
  ['modeloSobremesa', 'Modelo_sobremesa'],
  ['clase', 'Clases'],
  ['prioridad', 'Prioridad'],
  ['estado', 'Estado'],
  ['tecnico', 'Tecnico'],
  ['ubicacion', 'Ubicacion'],
  ['origen', 'Origen'],
  ['horas', 'Horas_resolucion'],
  ['descripcion', 'Descripcion'],
  ['vacios', 'Campos_vacios'],
  ['valida', 'Valida'],
  ['duplicado', 'Duplicado']
];

function exportRows() {
  return state.results?.rows || [];
}

function exportCsv() {
  if (!state.dataset) { toast('No hay datos que exportar', 'warn'); return; }
  const rows = exportRows();
  const value = (r, key) => {
    if (key === 'valida') return r.esValida ? 'si' : 'no';
    if (key === 'duplicado') return r.flags.duplicado ? 'si' : 'no';
    if (key === 'fecha') return r.fecha || '';
    return r[key] ?? '';
  };
  const csv = toCsv(
    EXPORT_COLUMNS.map(([, label]) => label),
    rows.map((r) => EXPORT_COLUMNS.map(([key]) => value(r, key)))
  );
  download(`${baseName()}-${todayISO()}.csv`, `\uFEFF${csv}`, 'text/csv;charset=utf-8');
  pushLog('ok', `CSV exportado con ${num(rows.length)} registros`);
  toast(`CSV exportado (${num(rows.length)} registros)`);
  sound.play('ok');
}

function exportJson() {
  if (!state.dataset) { toast('No hay datos que exportar', 'warn'); return; }
  const payload = {
    generado: new Date().toISOString(),
    documento: {
      archivo: state.dataset.filename,
      raiz: state.dataset.rootTag,
      registro: state.dataset.recordTag,
      campoFecha: state.dataset.dateFieldTag,
      total: state.dataset.summary.total,
      validas: state.dataset.summary.valid
    },
    filtro: state.filter,
    resumen: state.dataset.summary,
    registros: exportRows().map((r) => ({
      id: r.id,
      fecha: r.fecha,
      fechaOriginal: r.fechaRaw,
      tipo: r.tipo,
      equipo: r.equipo,
      marca: r.marca,
      modeloPortatil: r.modeloPortatil,
      modeloSobremesa: r.modeloSobremesa,
      clase: r.clase,
      prioridad: r.prioridad,
      estado: r.estado,
      tecnico: r.tecnico,
      ubicacion: r.ubicacion,
      origen: r.origen,
      horas: r.horas,
      descripcion: r.descripcion,
      valida: r.esValida,
      duplicado: r.flags.duplicado,
      camposVacios: r.vacios,
      original: r.raw
    }))
  };
  download(`${baseName()}-${todayISO()}.json`, JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
  pushLog('ok', `JSON exportado con ${num(payload.registros.length)} registros`);
  toast('JSON exportado');
  sound.play('ok');
}

function buildSummaryText() {
  if (!state.dataset) return 'Sin documento cargado.';
  const d = state.dataset;
  const rows = exportRows();
  const stats = state.results.stats;
  const lines = [];
  lines.push(`TURBOINCIDENCIAS 3000 · ${new Date().toLocaleString('es-ES')}`);
  lines.push(`Documento: ${d.filename} (<${d.rootTag}> → <${d.recordTag}>)`);
  lines.push(`Registros: ${num(d.summary.total)} · válidos: ${num(d.summary.valid)} (${pct(d.summary.valid, d.summary.total)})`);
  lines.push(`Descartados: ${num(d.summary.excludedByQuality)} (fechas ${num(d.summary.invalidDate + d.summary.future)}, sin info ${num(d.summary.noInfo)})`);
  if (stats?.range.min) lines.push(`Rango de fechas: ${fmtDate(stats.range.min)} → ${fmtDate(stats.range.max)}`);
  lines.push(`Filtro actual: ${describeFilter(state.filter)} → ${num(rows.length)} registros`);
  lines.push('');
  lines.push('TOP TIPOS DE INCIDENCIA');
  (stats?.byTipo || []).slice(0, 5).forEach((t) => lines.push(`  ${t.key}: ${num(t.n)} (${pct(t.n, rows.length)})`));
  lines.push('TOP PRIORIDADES');
  (stats?.byPrioridad || []).slice(0, 4).forEach((t) => lines.push(`  ${t.key}: ${num(t.n)} (${pct(t.n, rows.length)})`));
  lines.push('TOP MARCAS');
  (stats?.byMarca || []).slice(0, 5).forEach((t) => lines.push(`  ${t.key}: ${num(t.n)} (${pct(t.n, rows.length)})`));
  return lines.join('\n');
}

function exportSummary() {
  download(`${baseName()}-resumen-${todayISO()}.txt`, buildSummaryText());
  toast('Resumen exportado');
  pushLog('ok', 'Resumen de texto exportado');
}

function reportHtml() {
  const d = state.dataset;
  const rows = exportRows();
  const stats = state.results.stats;
  const rowHtml = rows.map((r) => `<tr>
    <td>${esc(r.id || '')}</td><td>${esc(r.fecha || '')}</td><td>${esc(r.tipo)}</td>
    <td>${esc(r.equipo)}</td><td>${esc(r.marca)}</td><td>${esc(r.clase)}</td>
    <td>${esc(r.prioridad)}</td><td>${esc(r.estado)}</td><td>${esc(r.tecnico)}</td>
  </tr>`).join('');
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
  <title>Informe · ${esc(d.filename)}</title>
  <style>
    body{font-family:ui-monospace,Menlo,monospace;background:#f5f1e6;color:#241b0f;margin:2rem;line-height:1.5}
    h1{font-size:1.6rem;margin:0 0 .2rem}h2{font-size:1rem;margin:2rem 0 .5rem;border-bottom:1px solid #c9b98f;padding-bottom:.2rem}
    table{border-collapse:collapse;width:100%;font-size:.78rem}th,td{border:1px solid #d8cbb0;padding:.3rem .45rem;text-align:left}
    th{background:#efe7d4}small{color:#7a6a4d}.totals{display:flex;gap:1rem;flex-wrap:wrap;margin:.6rem 0}
    .totals div{border:1px solid #d8cbb0;padding:.5rem .8rem;background:#fbf8ef}
    .totals b{display:block;font-size:1.3rem}
  </style></head><body>
  <h1>Turboincidencias 3000</h1>
  <small>${esc(d.filename)} · generado el ${new Date().toLocaleString('es-ES')}</small>
  <div class="totals">
    <div><b>${num(d.summary.total)}</b>registros</div>
    <div><b>${num(d.summary.valid)}</b>válidos</div>
    <div><b>${num(d.summary.excludedByQuality)}</b>descartados</div>
    <div><b>${num(rows.length)}</b>en el filtro</div>
  </div>
  <h2>Resumen</h2>
  <pre>${esc(buildSummaryText())}</pre>
  <h2>Distribución por prioridad</h2>
  <table><thead><tr><th>Prioridad</th><th>Registros</th><th>%</th></tr></thead><tbody>
  ${(stats?.byPrioridad || []).map((p) => `<tr><td>${esc(p.key)}</td><td>${num(p.n)}</td><td>${pct(p.n, rows.length)}</td></tr>`).join('')}
  </tbody></table>
  <h2>Registros (${num(rows.length)})</h2>
  <table><thead><tr><th>ID</th><th>Fecha</th><th>Tipo</th><th>Equipo</th><th>Marca</th><th>Clase</th><th>Prioridad</th><th>Estado</th><th>Técnico</th></tr></thead>
  <tbody>${rowHtml}</tbody></table>
  <p><small>Generado en el navegador. Ningún dato se ha enviado a Internet.</small></p>
  </body></html>`;
}

function exportReportHtml() {
  if (!state.dataset) return;
  download(`${baseName()}-informe-${todayISO()}.html`, reportHtml(), 'text/html;charset=utf-8');
  toast('Informe HTML exportado');
  pushLog('ok', 'Informe HTML exportado');
}

function exportReportTxt() {
  if (!state.dataset) return;
  download(`${baseName()}-informe-${todayISO()}.txt`, buildSummaryText() + '\n\n' + buildTablesText(), 'text/plain;charset=utf-8');
  toast('Informe TXT exportado');
  pushLog('ok', 'Informe TXT exportado');
}

function buildTablesText() {
  const stats = state.results.stats;
  const rows = exportRows();
  const total = rows.length;
  const blocks = [
    ['TIPO DE INCIDENCIA', stats.byTipo],
    ['TIPO DE EQUIPO', stats.byEquipo],
    ['CLASES', stats.byClase],
    ['PRIORIDAD', stats.byPrioridad],
    ['MARCA', stats.byMarca],
    ['ESTADO', stats.byEstado]
  ];
  return blocks.map(([title, data]) => {
    const lines = [title];
    data.forEach((d) => {
      lines.push(`  ${String(d.key).padEnd(24).slice(0, 24)} ${String(d.n).padStart(6)}  ${pct(d.n, total).padStart(7)}  ${'█'.repeat(Math.round((d.n / Math.max(1, data[0]?.n || 1)) * 20))}`);
    });
    return lines.join('\n');
  }).join('\n\n');
}

function exportLog() {
  const text = state.log.slice().reverse().map((l) => `${l.time} [${l.level.toUpperCase()}] ${l.text}`).join('\n');
  download(`turbo3000-${todayISO()}.log`, text);
  toast('Registro exportado');
}

function copyFallback(text) {
  const area = document.createElement('textarea');
  area.value = text;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  try {
    document.execCommand('copy');
    toast('Copiado al portapapeles');
  } catch {
    toast('No se pudo copiar automáticamente', 'error');
  }
  area.remove();
}

/* ------------------------------------------------------------------ */
/* Secuencia de arranque                                               */
/* ------------------------------------------------------------------ */
const BOOT_LINES = [
  { text: 'TURBO-BIOS v3.00  ·  (C) 1998—2026 TURBO SYSTEMS', cls: '' },
  { text: 'CPU ............ PARSER-XML 66 MHz', cls: 'dim' },
  { text: 'MEMORIA ........ 640K OK', cls: 'dim' },
  { text: 'UNIDAD A: ...... XML READY', cls: 'dim' },
  { text: '', cls: '' },
  { text: 'CARGANDO TURBOINCIDENCIAS.SYS', cls: '' },
  { text: '  filtros de calidad ........ OK', cls: 'ok' },
  { text: '  motor de estadísticas .... OK', cls: 'ok' },
  { text: '  exportadores ............. OK', cls: 'ok' },
  { text: '  interfaz CRT ............. OK', cls: 'ok' },
  { text: '', cls: '' },
  { text: '> listo. pulsa un icono para empezar', cls: 'dim' }
];

let bootCancelled = false;

function skipBoot() {
  bootCancelled = true;
  finishBoot();
}

function finishBoot() {
  bootEl.classList.add('is-done');
  screenEl.classList.remove('is-booting');
  sound.play('boot');
  state.booted = true;
}

async function runBoot() {
  bootLinesEl.innerHTML = '';
  bootEl.classList.remove('is-done');

  if (!state.settings.boot || reduceMotion) {
    bootLinesEl.innerHTML = `<span class="boot__line">TURBO/OS 3.0 · cargando… <span class="boot__cursor"></span></span>`;
    await sleep(260);
    finishBoot();
    return;
  }

  for (const line of BOOT_LINES) {
    if (bootCancelled) return;
    const div = document.createElement('div');
    div.className = 'boot__line';
    bootLinesEl.appendChild(div);
    if (!line.text) {
      div.innerHTML = '&nbsp;';
      await sleep(50);
      continue;
    }
    const span = document.createElement('span');
    if (line.cls) span.className = line.cls;
    div.appendChild(span);
    for (let i = 0; i < line.text.length; i++) {
      if (bootCancelled) return;
      span.textContent += line.text[i];
      if (i % 3 === 0) sound.play('tick');
      await sleep(line.text[i] === ' ' ? 4 : 7);
    }
    await sleep(40);
  }
  if (bootCancelled) return;
  await sleep(320);
  finishBoot();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ------------------------------------------------------------------ */
/* Efectos: inclinación 3D, brillo, polvo, teclado                     */
/* ------------------------------------------------------------------ */
function initDust() {
  const host = $('#dust');
  if (!host) return;
  for (let i = 0; i < 22; i++) {
    const mote = document.createElement('i');
    const left = 4 + Math.random() * 55;
    const top = 30 + Math.random() * 70;
    const size = 1.5 + Math.random() * 2.5;
    mote.style.left = `${left}%`;
    mote.style.top = `${top}%`;
    mote.style.width = `${size}px`;
    mote.style.height = `${size}px`;
    mote.style.animationDuration = `${16 + Math.random() * 22}s`;
    mote.style.animationDelay = `${-Math.random() * 20}s`;
    host.appendChild(mote);
  }
}

function initKeyboard() {
  const keyboard = $('#keyboard');
  if (!keyboard) return;
  const rows = [
    ['w2', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 'w2'],
    ['w2', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 'w3'],
    ['w2', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 'w3'],
    ['w3', 1, 1, 1, 1, 1, 1, 1, 1, 1, 'w3'],
    ['w6', 1, 1, 1, 1, 'w6']
  ];
  keyboard.innerHTML = rows.map((row) => `<div class="krow">${row.map((key) =>
    `<i class="${key === 1 ? '' : key}"></i>`).join('')}</div>`).join('');
}

let pointerX = 0;
let pointerY = 0;
let targetRX = 0;
let targetRY = 0;
let currentRX = 0;
let currentRY = 0;
let lastPointer = 0;
let rafId = 0;

function initTilt() {
  if (reduceMotion || window.matchMedia('(max-width: 860px)').matches) return;
  const updateTarget = (event) => {
    if (!state.settings.tilt) return;
    const rect = monitorEl.getBoundingClientRect();
    const relX = clamp((event.clientX - rect.left) / rect.width, 0, 1) * 2 - 1;
    const relY = clamp((event.clientY - rect.top) / rect.height, 0, 1) * 2 - 1;
    pointerX = relX;
    pointerY = relY;
    targetRY = relX * 2.1;
    targetRX = -relY * 1.5;
    lastPointer = performance.now();
    const glare = $('#glare');
    if (glare) {
      glare.style.setProperty('--gx', `${Math.round((relX + 1) * 50)}%`);
      glare.style.setProperty('--gy', `${Math.round((relY + 1) * 45)}%`);
    }
  };

  window.addEventListener('pointermove', updateTarget, { passive: true });
  document.addEventListener('pointerleave', () => {
    targetRX = 0;
    targetRY = 0;
  });

  const loop = (now) => {
    const idle = now - lastPointer > 3500;
    const swayX = idle ? Math.sin(now / 2600) * 0.35 : 0;
    const swayY = idle ? Math.cos(now / 3400) * 0.45 : 0;
    const wantRX = state.settings.tilt ? targetRX : 0;
    const wantRY = state.settings.tilt ? targetRY : 0;
    currentRX += (wantRX + swayX - currentRX) * 0.07;
    currentRY += (wantRY + swayY - currentRY) * 0.07;
    if (state.settings.tilt) {
      monitorEl.style.setProperty('--tilt-x', `${currentRX.toFixed(3)}deg`);
      monitorEl.style.setProperty('--tilt-y', `${currentRY.toFixed(3)}deg`);
    } else {
      monitorEl.style.setProperty('--tilt-x', '0deg');
      monitorEl.style.setProperty('--tilt-y', '0deg');
    }
    rafId = requestAnimationFrame(loop);
  };
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(loop);
}

/* ------------------------------------------------------------------ */
/* Cableado global                                                     */
/* ------------------------------------------------------------------ */
function initGlobalEvents() {
  hydrateIcons();

  // Abrir ventanas desde el raíl, el escritorio y la barra de tareas
  document.addEventListener('click', (event) => {
    const opener = event.target.closest('[data-open]');
    if (opener && !opener.closest('.win')) {
      openView(opener.dataset.open);
      return;
    }
    const action = event.target.closest('[data-action]');
    if (!action || action.closest('.win')) return;
    const kind = action.dataset.action;
    if (kind === 'load') requestFile();
    else if (kind === 'demo') loadDemo();
    else if (kind === 'home') {
      wm.list().forEach((win) => wm.minimize(win.id));
    }
  });

  // Sonido sutil en cualquier botón
  document.addEventListener('pointerdown', (event) => {
    if (event.target.closest('button, .rail__btn, .preset, .facet-chip')) sound.play('click');
  }, { passive: true });

  // Archivos
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) handleFile(file);
  });

  const prevent = (event) => { event.preventDefault(); };
  ['dragenter', 'dragover'].forEach((type) => {
    window.addEventListener(type, (event) => {
      prevent(event);
      if (event.dataTransfer?.types?.includes('Files')) screenEl.classList.add('is-dragover');
    });
  });
  window.addEventListener('dragleave', (event) => {
    if (event.relatedTarget === null) screenEl.classList.remove('is-dragover');
  });
  window.addEventListener('drop', (event) => {
    prevent(event);
    screenEl.classList.remove('is-dragover');
    const file = event.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  });

  // Monitor
  $('#soundBtn')?.addEventListener('click', () => setSetting('sound', !state.settings.sound));
  $('#tiltBtn')?.addEventListener('click', () => setSetting('tilt', !state.settings.tilt));
  $('#powerBtn')?.addEventListener('click', togglePower);
  $('#powerBtnTray')?.addEventListener('click', togglePower);
  standbyEl.addEventListener('click', powerOn);
  $('#bootSkip')?.addEventListener('click', skipBoot);

  // Teclado
  document.addEventListener('keydown', (event) => {
    const tag = event.target.tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || event.target.isContentEditable;

    if (event.key === 'Escape') {
      if (!bootEl.classList.contains('is-done')) { skipBoot(); return; }
      if (screenEl.classList.contains('is-off')) { powerOn(); return; }
      const focused = wm.list().filter((w) => w.el.classList.contains('is-focused')).pop();
      if (focused) { wm.close(focused.id); sound.play('close'); }
      return;
    }
    if (typing) return;

    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      if (wm.isOpen('detalle')) {
        event.preventDefault();
        navigateRecord(event.key === 'ArrowUp' ? -1 : 1);
      }
      return;
    }

    const key = event.key.toLowerCase();
    if (key === 'f') { event.preventDefault(); setSetting('tilt', !state.settings.tilt); }
    else if (key === 'a') openView('analisis');
    else if (key === 'd') openView('datos');
    else if (key === 's') openView('filtros');
    else if (key === 'i') openView('informe');
    else if (key === 'r') openView('registro');
    else if (key === 'e') openView('exportar');
  });

  // Si la ventana cambia de tamaño, redibuja gráficas
  window.addEventListener('resize', () => redrawAll());

  // Reloj
  const clock = $('#clock');
  const tick = () => {
    if (clock) clock.textContent = clockTime();
  };
  tick();
  setInterval(tick, 15000);

  // Fecha del escritorio
  const dateEl = $('#homeDate');
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
  }
}

/* ------------------------------------------------------------------ */
/* Arranque de la aplicación                                           */
/* ------------------------------------------------------------------ */
async function boot() {
  hydrateIcons();
  initDust();
  initKeyboard();
  initGlobalEvents();
  applySettings();
  computeResults();
  updateChrome();
  initTilt();

  pushLog('ok', 'TURBO/OS 3.0 iniciado');
  pushLog('info', 'Parser XML listo · filtros de calidad activos');

  const bootPromise = runBoot();

  // Carga de datos: último dataset guardado o demo
  let restored = false;
  try {
    const raw = localStorage.getItem(DATASET_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved?.text) {
        loadText(saved.text, { filename: saved.filename || 'incidencies.xml', size: saved.size }, { silent: true });
        pushLog('info', 'Último documento restaurado desde este navegador');
        restored = true;
      }
    }
  } catch {
    try { localStorage.removeItem(DATASET_KEY); } catch { /* */ }
  }

  if (!restored) {
    await loadDemo({ silent: true });
    pushLog('info', 'Dataset de demostración cargado (sustitúyelo por tu XML)');
  }

  await bootPromise;

  // pequeña bienvenida
  if (!state.settings.booted) {
    setTimeout(() => {
      toast(`Bienvenido. ${state.dataset ? 'El dataset de demo ya está cargado.' : 'Carga tu XML para empezar.'}`);
    }, 700);
  }
  updateChrome();
}

boot();

// expuesto para depuración en consola
window.turbo = { state, wm, app, computeResults, loadText, loadDemo };
