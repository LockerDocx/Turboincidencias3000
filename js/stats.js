/** Agregaciones y estadísticas sobre el conjunto filtrado. */
import { monthKey, parseISO, todayISO, addDays, weekdayOf, WEEKDAYS, WEEKDAYS_SHORT, dec } from './util.js';

export function countValues(rows, field) {
  const map = new Map();
  for (const r of rows) {
    const value = r[field];
    const key = value === null || value === undefined || value === '' ? '(vacío)' : String(value);
    map.set(key, (map.get(key) || 0) + 1);
  }
  const total = rows.length || 1;
  return [...map.entries()]
    .map(([key, n]) => ({ key, n, pct: n / total }))
    .sort((a, b) => b.n - a.n || a.key.localeCompare(b.key, 'es'));
}

export function timeline(rows, { fillGaps = true } = {}) {
  const map = new Map();
  for (const r of rows) {
    if (!r.fecha) continue;
    const key = monthKey(r.fecha);
    map.set(key, (map.get(key) || 0) + 1);
  }
  const keys = [...map.keys()].sort();
  if (!keys.length) return [];
  if (!fillGaps) return keys.map((key) => ({ key, n: map.get(key) }));

  const first = parseISO(`${keys[0]}-01`);
  const last = parseISO(`${keys[keys.length - 1]}-01`);
  const out = [];
  const cursor = new Date(first.getFullYear(), first.getMonth(), 1);
  let guard = 0;
  while (cursor <= last && guard++ < 400) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
    out.push({ key, n: map.get(key) || 0 });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return out;
}

export function weekdayCounts(rows) {
  const counts = new Array(7).fill(0);
  for (const r of rows) {
    const d = r.fecha ? weekdayOf(r.fecha) : null;
    if (d !== null) counts[d]++;
  }
  return WEEKDAYS.map((label, i) => ({ key: WEEKDAYS_SHORT[i], long: label, n: counts[i], i }));
}

export function hoursSummary(rows) {
  const values = rows.map((r) => r.horas).filter((n) => Number.isFinite(n) && n >= 0);
  if (!values.length) return { count: 0, mean: null, median: null, max: null, p90: null };
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const median = sorted[Math.floor(sorted.length / 2)];
  const p90 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))];
  return {
    count: values.length,
    mean,
    median,
    max: sorted[sorted.length - 1],
    p90
  };
}

export function heatmap(rows, rowField = 'tipo', colField = 'prioridad', maxRows = 7) {
  const rowCounts = new Map();
  for (const r of rows) {
    const key = r[rowField] || '(vacío)';
    rowCounts.set(key, (rowCounts.get(key) || 0) + 1);
  }
  const rowKeys = [...rowCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxRows)
    .map(([k]) => k);

  const colOrder = ['Crítica', 'Alta', 'Media', 'Baja'];
  const extraCols = [...new Set(rows.map((r) => r[colField] || '(vacío)'))]
    .filter((c) => !colOrder.includes(c))
    .sort((a, b) => a.localeCompare(b, 'es'));
  const colKeys = [...colOrder, ...extraCols].filter((c) =>
    rows.some((r) => (r[colField] || '(vacío)') === c));

  const matrix = rowKeys.map((rk) => colKeys.map((ck) =>
    rows.filter((r) => (r[rowField] || '(vacío)') === rk && (r[colField] || '(vacío)') === ck).length));

  const max = Math.max(1, ...matrix.flat());
  return { rowKeys, colKeys, matrix, max };
}

export function topCombos(rows, limit = 8) {
  const map = new Map();
  for (const r of rows) {
    const tipo = r.tipo || '(vacío)';
    const clase = r.clase || '(vacío)';
    const key = `${tipo} › ${clase}`;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()]
    .map(([key, n]) => ({ key, n, pct: rows.length ? n / rows.length : 0 }))
    .sort((a, b) => b.n - a.n)
    .slice(0, limit);
}

export function range(rows) {
  const dates = rows.map((r) => r.fecha).filter(Boolean).sort();
  if (!dates.length) return { min: null, max: null, days: 0 };
  const min = dates[0];
  const max = dates[dates.length - 1];
  const a = parseISO(min);
  const b = parseISO(max);
  const days = a && b ? Math.max(1, Math.round((b - a) / 86400000) + 1) : 0;
  return { min, max, days };
}

export function trend(rows, days = 30) {
  const today = todayISO();
  const from = addDays(today, -days + 1);
  const prevFrom = addDays(from, -days);
  const current = rows.filter((r) => r.fecha && r.fecha >= from && r.fecha <= today).length;
  const previous = rows.filter((r) => r.fecha && r.fecha >= prevFrom && r.fecha < from).length;
  const delta = previous === 0 ? null : (current - previous) / previous;
  return { current, previous, delta, days, from };
}

/** Resumen completo para el panel. */
export function computeStats(rows, groups = 6) {
  const total = rows.length;
  const byTipo = countValues(rows, 'tipo');
  const byEquipo = countValues(rows, 'equipo');
  const byClase = countValues(rows, 'clase');
  const byPrioridad = countValues(rows, 'prioridad');
  const byEstado = countValues(rows, 'estado');
  const byMarca = countValues(rows, 'marca');
  const byTecnico = countValues(rows, 'tecnico');
  const byUbicacion = countValues(rows, 'ubicacion');

  const crit = rows.filter((r) => r.prioridad === 'Crítica').length;
  const high = rows.filter((r) => r.prioridad === 'Alta').length;
  const open = rows.filter((r) => ['Abierta', 'En curso', 'Pendiente usuario'].includes(r.estado)).length;
  const resolved = rows.filter((r) => r.estado === 'Resuelta').length;

  return {
    total,
    byTipo, byEquipo, byClase, byPrioridad, byEstado, byMarca, byTecnico, byUbicacion,
    groups,
    months: timeline(rows),
    weekdays: weekdayCounts(rows),
    heat: heatmap(rows),
    combos: topCombos(rows),
    hours: hoursSummary(rows),
    range: range(rows),
    trend: trend(rows),
    kpi: {
      criticas: crit,
      altas: high,
      abiertas: open,
      resueltas: resolved,
      criticasPct: total ? crit / total : 0,
      abiertasPct: total ? open / total : 0,
      mediaDia: range(rows).days ? total / range(rows).days : 0,
      mediaSemana: range(rows).days ? (total / range(rows).days) * 7 : 0
    }
  };
}

export function pctLabel(n, total) {
  if (!total) return '0 %';
  return `${dec((n / total) * 100, 1)} %`;
}
