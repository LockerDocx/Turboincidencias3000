/** Utilidades compartidas: formato, fechas, DOM y descargas. */

export const BLANK_WORDS = new Set([
  '', 'n/a', 'na', 'null', 'none', 'nil', 'desconocido', 'desconocida',
  'sin datos', 's/d', 'sd', '-', '--', '---', '?', '??', 'pendiente',
  'no', 'undefined', 'false', '0'
]);

/** Escapa texto para insertarlo como HTML. */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

/** Número entero en castellano. */
export function num(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('es-ES').format(Math.round(n));
}

/** Número con decimales. */
export function dec(n, digits = 1) {
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(n);
}

/** Porcentaje legible. */
export function pct(part, total, digits = 1) {
  if (!total) return '0 %';
  return `${dec((part / total) * 100, digits)} %`;
}

/** Fecha ISO (YYYY-MM-DD) a dd/mm/aaaa. */
export function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return String(iso);
  return `${d}/${m}/${y}`;
}

/** Fecha ISO a "13 oct 2026". */
export function fmtDateLong(iso) {
  if (!iso) return '—';
  const d = parseISO(iso);
  if (!d) return String(iso);
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Hora local HH:MM. */
export function clockTime(date = new Date()) {
  return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function nowTime() {
  return new Date().toLocaleTimeString('es-ES', { hour12: false });
}

/** Fecha local de hoy en ISO. */
export function todayISO() {
  const d = new Date();
  return isoOf(d);
}

/** Convierte Date a YYYY-MM-DD (hora local). */
export function isoOf(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Parsea YYYY-MM-DD como fecha local (sin líos de zona horaria). */
export function parseISO(iso) {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function addDays(iso, days) {
  const d = parseISO(iso);
  if (!d) return iso;
  d.setDate(d.getDate() + days);
  return isoOf(d);
}

export function daysBetween(a, b) {
  const d1 = parseISO(a);
  const d2 = parseISO(b);
  if (!d1 || !d2) return null;
  return Math.round((d2 - d1) / 86400000);
}

/** Clave de mes YYYY-MM. */
export function monthKey(iso) {
  return iso ? iso.slice(0, 7) : null;
}

export function monthLabel(key, short = true) {
  if (!key) return '—';
  const [y, m] = key.split('-');
  const names = short
    ? ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
    : ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
       'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const idx = Number(m) - 1;
  if (!names[idx]) return key;
  return short ? `${names[idx]} ${String(y).slice(2)}` : `${names[idx]} ${y}`;
}

export const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export const WEEKDAYS_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

export function weekdayOf(iso) {
  const d = parseISO(iso);
  return d ? d.getDay() : null;
}

/** Limita un número a un rango. */
export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** Debounce simple. */
export function debounce(fn, wait = 180) {
  let t;
  return function debounced(...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

/** Agrupa y ordena por frecuencia. */
export function countSorted(items) {
  const map = new Map();
  for (const item of items) map.set(item, (map.get(item) || 0) + 1);
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), 'es'))
    .map(([key, n]) => ({ key, n }));
}

/** Quita duplicados. */
export function uniq(arr) {
  return [...new Set(arr)];
}

/** Descarga un archivo generado en el navegador. */
export function download(filename, content, mime = 'text/plain;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Genera CSV escapando comillas y separadores. */
export function toCsv(headers, rows, separator = ';') {
  const cell = (v) => {
    const s = String(v ?? '');
    return /["\n\r;,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    headers.map(cell).join(separator),
    ...rows.map((r) => r.map(cell).join(separator))
  ].join('\r\n');
}

/** Formatea bytes. */
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${dec(bytes / 1024, 0)} KB`;
  return `${dec(bytes / 1024 / 1024, 1)} MB`;
}

/** Normaliza un nombre de etiqueta XML: Tipo_de_Equipo → tipo_de_equipo. */
export function normKey(tag) {
  return String(tag || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Valor "vacío" según el criterio del script original. */
export function isBlank(value) {
  const s = String(value ?? '').trim().toLowerCase();
  return BLANK_WORDS.has(s) || s.length === 0;
}

/** Normaliza un valor para comparar (minúsculas, sin acentos). */
export function normVal(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

/** Formatea "hace X" a partir de una fecha ISO. */
export function relativeFrom(iso) {
  if (!iso) return '—';
  const diff = daysBetween(iso, todayISO());
  if (diff === null) return '—';
  if (diff === 0) return 'hoy';
  if (diff === 1) return 'ayer';
  if (diff > 1) return `hace ${num(diff)} días`;
  if (diff === -1) return 'mañana';
  return `en ${num(Math.abs(diff))} días`;
}

/** Reduce una lista a sus N valores más frecuentes + "Otros". */
export function topWithOther(items, limit = 8) {
  const counts = countSorted(items);
  if (counts.length <= limit) return counts;
  const head = counts.slice(0, limit);
  const rest = counts.slice(limit).reduce((acc, c) => acc + c.n, 0);
  if (rest > 0) head.push({ key: 'Otros', n: rest, isOther: true });
  return head;
}

/** Punto de entrada seguro para listeners. */
export function on(root, selector, event, handler) {
  root.addEventListener(event, (e) => {
    const target = e.target.closest(selector);
    if (target && root.contains(target)) handler(e, target);
  });
}
