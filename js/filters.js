/**
 * Motor de filtros y combinaciones rápidas.
 * El preset "Válidas" reproduce el criterio del script de Python.
 */
import { addDays, fmtDate, isBlank, normVal, todayISO, weekdayOf, WEEKDAYS } from './util.js';

export const FACETS = [
  { key: 'tipo', label: 'Tipo de incidencia' },
  { key: 'equipo', label: 'Tipo de equipo' },
  { key: 'clase', label: 'Clases' },
  { key: 'prioridad', label: 'Prioridad' },
  { key: 'estado', label: 'Estado' },
  { key: 'marca', label: 'Marca / modelo' },
  { key: 'tecnico', label: 'Técnico' },
  { key: 'ubicacion', label: 'Ubicación' }
];

export const RULE_FIELDS = [
  { key: 'tipo', label: 'Tipo de incidencia', type: 'text' },
  { key: 'equipo', label: 'Tipo de equipo', type: 'text' },
  { key: 'clase', label: 'Clase', type: 'text' },
  { key: 'prioridad', label: 'Prioridad', type: 'text' },
  { key: 'estado', label: 'Estado', type: 'text' },
  { key: 'marca', label: 'Marca / modelo', type: 'text' },
  { key: 'tecnico', label: 'Técnico', type: 'text' },
  { key: 'ubicacion', label: 'Ubicación', type: 'text' },
  { key: 'id', label: 'ID', type: 'text' },
  { key: 'descripcion', label: 'Descripción', type: 'text' },
  { key: 'fecha', label: 'Fecha', type: 'date' },
  { key: 'horas', label: 'Horas de resolución', type: 'number' },
  { key: 'dia', label: 'Día de la semana', type: 'weekday' }
];

export const RULE_OPS = [
  { key: 'contains', label: 'contiene', types: ['text'] },
  { key: 'equals', label: 'es igual a', types: ['text', 'number', 'weekday'] },
  { key: 'not', label: 'no es / no contiene', types: ['text', 'weekday'] },
  { key: 'startsWith', label: 'empieza por', types: ['text'] },
  { key: 'gt', label: 'es mayor que', types: ['number'] },
  { key: 'lt', label: 'es menor que', types: ['number'] },
  { key: 'between', label: 'está entre', types: ['number'] },
  { key: 'before', label: 'es anterior a', types: ['date'] },
  { key: 'after', label: 'es posterior a', types: ['date'] },
  { key: 'last', label: 'en los últimos (días)', types: ['date'] },
  { key: 'blank', label: 'está vacío', types: ['text'] },
  { key: 'notBlank', label: 'tiene valor', types: ['text'] }
];

export function defaultFilters() {
  return {
    preset: 'valid',
    search: '',
    quality: {
      excludeInvalidDate: true,
      excludeFuture: true,
      excludeSinInfo: true,
      excludeDuplicates: false,
      only: null // 'duplicates' | 'problems'
    },
    date: { from: '', to: '' },
    facets: {
      tipo: [], equipo: [], clase: [], prioridad: [],
      estado: [], marca: [], tecnico: [], ubicacion: []
    },
    rules: { join: 'AND', list: [] }
  };
}

/** Definición de las combinaciones de un clic. */
export const PRESETS = [
  {
    id: 'valid',
    name: 'Válidas',
    icon: 'check',
    desc: 'El criterio del script: fuera fechas imposibles, futuras y registros vacíos.',
    build: () => ({})
  },
  {
    id: 'all',
    name: 'Todo el XML',
    icon: 'grid',
    desc: 'Sin filtros de calidad. Para ver el dato tal y como llega.',
    build: () => ({ quality: { excludeInvalidDate: false, excludeFuture: false, excludeSinInfo: false, excludeDuplicates: false, only: null } })
  },
  {
    id: 'critical',
    name: 'Críticas abiertas',
    icon: 'warn',
    desc: 'Prioridad crítica o alta que todavía no se ha resuelto.',
    build: () => ({
      facets: { tipo: [], equipo: [], clase: [], prioridad: ['Crítica', 'Alta'], estado: ['Abierta', 'En curso', 'Pendiente usuario'], marca: [], tecnico: [], ubicacion: [] }
    })
  },
  {
    id: 'unresolved',
    name: 'Sin resolver',
    icon: 'clock',
    desc: 'Todo lo que no está cerrado, de cualquier prioridad.',
    build: () => ({
      facets: { tipo: [], equipo: [], clase: [], prioridad: [], estado: ['Abierta', 'En curso', 'Pendiente usuario'], marca: [], tecnico: [], ubicacion: [] }
    })
  },
  {
    id: 'portatiles',
    name: 'Portátiles',
    icon: 'pc',
    desc: 'Sólo equipos portátiles.',
    build: () => ({ facets: { tipo: [], equipo: ['Portátil'], clase: [], prioridad: [], estado: [], marca: [], tecnico: [], ubicacion: [] } })
  },
  {
    id: 'sobremesas',
    name: 'Sobremesas',
    icon: 'monitor',
    desc: 'Sólo equipos de sobremesa.',
    build: () => ({ facets: { tipo: [], equipo: ['Sobremesa'], clase: [], prioridad: [], estado: [], marca: [], tecnico: [], ubicacion: [] } })
  },
  {
    id: 'hardware',
    name: 'Hardware',
    icon: 'grid',
    desc: 'Incidencias de hardware sobre el parque de equipos.',
    build: () => ({ facets: { tipo: ['Hardware'], equipo: [], clase: [], prioridad: [], estado: [], marca: [], tecnico: [], ubicacion: [] } })
  },
  {
    id: 'red',
    name: 'Red',
    icon: 'tag',
    desc: 'Conectividad: Wi-Fi, VPN, DNS y cableado.',
    build: () => ({ facets: { tipo: ['Red'], equipo: [], clase: [], prioridad: [], estado: [], marca: [], tecnico: [], ubicacion: [] } })
  },
  {
    id: 'recent',
    name: 'Últimos 30 días',
    icon: 'clock',
    desc: 'El último mes de actividad, con el criterio de calidad activo.',
    build: () => ({ date: { from: addDays(todayISO(), -30), to: '' } })
  },
  {
    id: 'year',
    name: 'Este año',
    icon: 'doc',
    desc: 'Del 1 de enero a hoy.',
    build: () => ({ date: { from: `${new Date().getFullYear()}-01-01`, to: '' } })
  },
  {
    id: 'slow',
    name: 'Resolución lenta',
    icon: 'clock',
    desc: 'Incidencias resueltas que tardaron más de 48 horas.',
    build: () => ({ rules: { join: 'AND', list: [{ field: 'horas', op: 'gt', value: '48' }] } })
  },
  {
    id: 'weekend',
    name: 'Fin de semana',
    icon: 'warn',
    desc: 'Incidencias registradas en sábado o domingo.',
    build: () => ({ rules: { join: 'AND', list: [{ field: 'dia', op: 'equals', value: 'sábado' }, { field: 'dia', op: 'equals', value: 'domingo' }], joinOverride: 'OR' } })
  },
  {
    id: 'duplicates',
    name: 'Duplicados',
    icon: 'floppy',
    desc: 'Registros repetidos detectados por contenido, aunque tengan fechas raras.',
    build: () => ({ quality: { ...defaultFilters().quality, excludeInvalidDate: false, excludeFuture: false, excludeSinInfo: false, excludeDuplicates: false, only: 'duplicates' } })
  },
  {
    id: 'problems',
    name: 'Datos problemáticos',
    icon: 'warn',
    desc: 'Fechas imposibles, registros vacíos o muy incompletos.',
    build: () => ({ quality: { ...defaultFilters().quality, excludeInvalidDate: false, excludeFuture: false, excludeSinInfo: false, excludeDuplicates: false, only: 'problems' } })
  }
];

export const PRESET_BY_ID = new Map(PRESETS.map((p) => [p.id, p]));

/** Aplica un preset sobre una base limpia y devuelve el estado completo. */
export function applyPreset(presetId) {
  const preset = PRESET_BY_ID.get(presetId);
  const base = defaultFilters();
  if (!preset) return base;
  const patch = preset.build();
  const next = {
    ...base,
    ...patch,
    quality: { ...base.quality, ...(patch.quality || {}) },
    date: { ...base.date, ...(patch.date || {}) },
    facets: { ...base.facets, ...(patch.facets || {}) },
    rules: patch.rules ? { ...base.rules, ...patch.rules } : base.rules,
    preset: preset.id
  };
  // El preset de fin de semana necesita OR entre sus reglas
  if (preset.id === 'weekend') next.rules = { join: 'OR', list: [...preset.build().rules.list] };
  return next;
}

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

export function valueOf(record, field) {
  if (field === 'dia') {
    const d = record.fecha ? weekdayOf(record.fecha) : null;
    return d === null ? '' : WEEKDAYS[d];
  }
  if (field === 'fecha') return record.fecha || '';
  if (field === 'horas') return record.horas;
  const value = record[field];
  if (field === 'marca') return value || '(vacío)';
  if (value === undefined || value === null || value === '') return '(vacío)';
  return value;
}

export function facetOptions(records, field) {
  const map = new Map();
  for (const r of records) {
    const v = valueOf(r, field);
    if (v === null || v === undefined || v === '') continue;
    const key = String(v);
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'))
    .map(([value, n]) => ({ value, n }));
}

/** Comprueba un registro contra una regla avanzada. */
export function testRule(record, rule) {
  const raw = valueOf(record, rule.field);
  const value = rule.value ?? '';
  const op = rule.op;

  if (op === 'blank') return isBlank(raw);
  if (op === 'notBlank') return !isBlank(raw);
  if (op === 'last') {
    const days = Number(value);
    if (!record.fecha || !Number.isFinite(days)) return false;
    return record.fecha >= addDays(todayISO(), -days);
  }
  if (op === 'before') return Boolean(record.fecha) && record.fecha < value;
  if (op === 'after') return Boolean(record.fecha) && record.fecha > value;

  if (rule.field === 'horas') {
    const n = record.horas;
    if (n === null || n === undefined) return false;
    const v = Number(value);
    if (op === 'gt') return n > v;
    if (op === 'lt') return n < v;
    if (op === 'equals') return n === v;
    if (op === 'between') {
      const [a, b] = String(value).split(/[,;|]/).map(Number);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
      return n >= Math.min(a, b) && n <= Math.max(a, b);
    }
    return false;
  }

  if (rule.field === 'dia') {
    const v = normVal(value);
    if (!v) return false;
    const recordDay = normVal(raw);
    return op === 'not' ? recordDay !== v : recordDay === v;
  }

  const haystack = normVal(raw);
  const needle = normVal(value);

  switch (op) {
    case 'contains': return haystack.includes(needle);
    case 'equals': return haystack === needle;
    case 'not': return !haystack.includes(needle);
    case 'startsWith': return haystack.startsWith(needle);
    default: return false;
  }
}

/**
 * Aplica todos los filtros.
 * @returns {{rows: object[], excluded: object, total: number, duplicates: number}}
 */
export function applyFilters(dataset, filter) {
  if (!dataset) return { rows: [], total: 0, excluded: { invalidDate: 0, future: 0, noInfo: 0, duplicates: 0 } };

  const all = dataset.records;
  const excluded = { invalidDate: 0, future: 0, noInfo: 0, duplicates: 0 };
  const q = filter.quality;

  let rows = all;

  if (q.excludeInvalidDate || q.excludeFuture || q.excludeSinInfo || q.excludeDuplicates) {
    rows = rows.filter((r) => {
      if (q.excludeInvalidDate && r.flags.fechaInvalida) { excluded.invalidDate++; return false; }
      if (q.excludeFuture && r.flags.fechaFutura) { excluded.future++; return false; }
      if (q.excludeSinInfo && r.flags.sinInformacion) { excluded.noInfo++; return false; }
      if (q.excludeDuplicates && r.flags.duplicado) { excluded.duplicates++; return false; }
      return true;
    });
  }

  if (q.only === 'duplicates') rows = rows.filter((r) => r.flags.duplicado);
  if (q.only === 'problems') {
    rows = rows.filter((r) => r.flags.fechaInvalida || r.flags.fechaFutura ||
      r.flags.sinInformacion || r.vacios >= 5);
  }

  // facetas
  const activeFacets = Object.entries(filter.facets).filter(([, list]) => list.length);
  if (activeFacets.length) {
    rows = rows.filter((r) => activeFacets.every(([field, list]) => list.includes(valueOf(r, field))));
  }

  // rango de fechas
  if (filter.date.from) rows = rows.filter((r) => r.fecha && r.fecha >= filter.date.from);
  if (filter.date.to) rows = rows.filter((r) => r.fecha && r.fecha <= filter.date.to);

  // búsqueda libre
  const tokens = filter.search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length) {
    rows = rows.filter((r) => tokens.every((t) => r.searchBlob.includes(t)));
  }

  // reglas avanzadas
  const rules = filter.rules.list.filter((rule) => {
    if (rule.op === 'blank' || rule.op === 'notBlank') return true;
    return String(rule.value ?? '').trim() !== '';
  });
  if (rules.length) {
    const useOr = filter.rules.join === 'OR';
    rows = rows.filter((r) => {
      const results = rules.map((rule) => testRule(r, rule));
      return useOr ? results.some(Boolean) : results.every(Boolean);
    });
  }

  return {
    rows,
    total: all.length,
    excluded,
    duplicates: all.filter((r) => r.flags.duplicado).length
  };
}

/** Contadores de calidad independientes del resto de filtros. */
export function qualityCounts(dataset) {
  if (!dataset) return { invalidDate: 0, future: 0, noInfo: 0, duplicates: 0, total: 0 };
  const r = dataset.records;
  return {
    total: r.length,
    invalidDate: r.filter((x) => x.flags.fechaInvalida).length,
    future: r.filter((x) => x.flags.fechaFutura).length,
    noInfo: r.filter((x) => x.flags.sinInformacion).length,
    duplicates: r.filter((x) => x.flags.duplicado).length
  };
}

/** Cuántos registros devuelve cada preset (para las tarjetas del panel). */
export function presetCounts(dataset) {
  const out = {};
  if (!dataset) {
    PRESETS.forEach((p) => { out[p.id] = 0; });
    return out;
  }
  for (const preset of PRESETS) {
    const filter = applyPreset(preset.id);
    out[preset.id] = applyFilters(dataset, filter).rows.length;
  }
  return out;
}

/** Etiquetas de los filtros activos (para los chips). */
export function activeChips(filter) {
  const chips = [];
  const preset = PRESET_BY_ID.get(filter.preset);
  if (preset && preset.id !== 'all') {
    chips.push({ kind: 'preset', label: preset.name, remove: () => ({ preset: 'all', ...applyPreset('all') }) });
  }
  for (const [field, list] of Object.entries(filter.facets)) {
    for (const value of list) {
      chips.push({
        kind: 'facet',
        field,
        value,
        label: `${FACETS.find((f) => f.key === field)?.label || field}: ${value}`
      });
    }
  }
  if (filter.date.from) chips.push({ kind: 'date', label: `Desde ${fmtDate(filter.date.from)}` });
  if (filter.date.to) chips.push({ kind: 'date', label: `Hasta ${fmtDate(filter.date.to)}` });
  if (filter.search.trim()) chips.push({ kind: 'search', label: `Busca: “${filter.search.trim()}”` });
  filter.rules.list.forEach((rule, i) => {
    const field = RULE_FIELDS.find((f) => f.key === rule.field)?.label || rule.field;
    const op = RULE_OPS.find((o) => o.key === rule.op)?.label || rule.op;
    chips.push({
      kind: 'rule',
      index: i,
      label: `${field} ${op} ${rule.value || '—'}`
    });
  });
  if (filter.quality.only === 'duplicates') chips.push({ kind: 'only', label: 'Sólo duplicados' });
  if (filter.quality.only === 'problems') chips.push({ kind: 'only', label: 'Sólo datos problemáticos' });
  if (filter.quality.excludeDuplicates) chips.push({ kind: 'quality', label: 'Duplicados fuera' });
  return chips;
}

/** Resumen corto del estado de filtros. */
export function describeFilter(filter) {
  const parts = [];
  const preset = PRESET_BY_ID.get(filter.preset);
  if (preset) parts.push(preset.name);
  const facetCount = Object.values(filter.facets).reduce((n, l) => n + l.length, 0);
  if (facetCount) parts.push(`${facetCount} faceta${facetCount > 1 ? 's' : ''}`);
  if (filter.date.from || filter.date.to) parts.push('rango de fechas');
  if (filter.search.trim()) parts.push('búsqueda');
  if (filter.rules.list.length) parts.push(`${filter.rules.list.length} regla${filter.rules.list.length > 1 ? 's' : ''}`);
  return parts.join(' · ') || 'Sin filtros';
}

/** ¿Hay algún filtro más allá del preset? */
export function hasManualFilters(filter) {
  return Boolean(filter.search.trim()) ||
    Object.values(filter.facets).some((l) => l.length) ||
    Boolean(filter.date.from || filter.date.to) ||
    filter.rules.list.length > 0;
}
