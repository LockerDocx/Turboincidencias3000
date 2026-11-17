/** Componentes HTML reutilizables del panel. */
import { icon } from './icons.js';
import { esc, num, pct, fmtDate, monthLabel } from './util.js';
import { PRESETS, PRESET_BY_ID, activeChips } from './filters.js';

const attr = (v) => esc(v).replace(/`/g, '&#96;');

/* ------------------------------- tablas -------------------------------- */

export function barTable({ title, iconName = 'grid', data, total, limit = 8, facet = null, note = '' }) {
  const rows = data.slice(0, limit);
  const hidden = data.length - rows.length;
  const max = Math.max(1, ...data.map((d) => d.n));
  const body = rows.map((row) => {
    const click = facet ? ` data-facet="${attr(facet)}" data-value="${attr(row.key)}"` : '';
    return `<tr${click}${facet ? ' class="is-clickable" title="Filtrar por ' + attr(row.key) + '"' : ''}>
      <td>${esc(row.key)}</td>
      <td class="num">${num(row.n)}</td>
      <td class="pct">${pct(row.n, total)}</td>
      <td><span class="bar"><i style="width:${Math.max(2, (row.n / max) * 100)}%"></i></span></td>
    </tr>`;
  }).join('');

  return `<div class="sec">
    <div class="sec__head">
      <h3>${icon(iconName)}${esc(title)}</h3>
      <span class="sub">${note || `${data.length} valores`}</span>
    </div>
    ${rows.length ? `<table class="btable">
      <thead><tr><th>Valor</th><th class="num">Cant.</th><th class="pct">%</th><th class="bar"></th></tr></thead>
      <tbody>${body}</tbody>
    </table>` : `<p class="muted" style="font-size:.78em;margin:.4em 0">Sin datos.</p>`}
    ${hidden > 0 ? `<p class="chartcard__note">+ ${num(hidden)} valores más · el informe los incluye todos</p>` : ''}
  </div>`;
}

/* -------------------------------- KPI ---------------------------------- */

export function kpi({ label, value, unit = '', foot = '', tone = '' }) {
  return `<div class="kpi ${tone ? `kpi--${tone}` : ''}">
    <div class="kpi__label">${esc(label)}</div>
    <div class="kpi__value">${esc(value)}${unit ? `<small>${esc(unit)}</small>` : ''}</div>
    <div class="kpi__foot">${foot}</div>
  </div>`;
}

/* ------------------------------ tarjetas ------------------------------- */

export function chartCard({ title, hint = '', canvas = '', height = '', footer = '', legend = '' }) {
  return `<div class="chartcard">
    <div class="chartcard__head">
      <h4>${esc(title)}</h4>
      <span>${esc(hint)}</span>
    </div>
    ${canvas}
    ${legend}
    ${footer ? `<div class="chartcard__note">${footer}</div>` : ''}
  </div>`;
}

export function heatmapTable(heat) {
  if (!heat.rowKeys.length) return `<p class="muted" style="font-size:.78em">Sin datos.</p>`;
  const head = `<tr><th>${esc(heat.rowFieldLabel || '')}</th>${heat.colKeys.map((c) => `<th>${esc(c)}</th>`).join('')}<th>Total</th></tr>`;
  const rows = heat.rowKeys.map((rk, i) => {
    const total = heat.matrix[i].reduce((a, b) => a + b, 0);
    return `<tr>
      <td class="rowhead">${esc(rk)}</td>
      ${heat.matrix[i].map((n, j) => {
        const intensity = n ? 0.1 + (n / heat.max) * 0.75 : 0;
        return `<td class="${n ? 'cell' : 'zero'}" style="--i:${intensity.toFixed(2)}">${n || '·'}</td>`;
      }).join('')}
      <td>${total}</td>
    </tr>`;
  }).join('');
  return `<div class="heat"><table><thead>${head}</thead><tbody>${rows}</tbody></table></div>`;
}

/* ----------------------------- barra filtros --------------------------- */

export function filterBar({ filter, results, dataset, showPresets = true }) {
  const presetIds = ['valid', 'all', 'critical', 'unresolved', 'portatiles', 'hardware', 'recent', 'year'];
  const counts = results.presetCounts || {};
  const chips = activeChips(filter);

  const presets = showPresets ? `<div class="presets">
    ${presetIds.map((id) => {
      const p = PRESET_BY_ID.get(id);
      if (!p) return '';
      return `<button class="preset ${filter.preset === id ? 'is-on' : ''}" data-preset="${id}" title="${attr(p.desc)}">
        ${icon(p.icon)}<span>${esc(p.name)}</span><span class="n">${counts[id] ?? 0}</span>
      </button>`;
    }).join('')}
    <button class="preset" data-open-filters>${icon('funnel')}<span>Todos los filtros</span></button>
  </div>` : '';

  return `<div class="filterbar">
    <div class="filterbar__row">
      <label class="search">
        ${icon('search')}
        <input class="input" type="search" placeholder="Buscar en todas las incidencias…" value="${attr(filter.search)}" data-search data-focus-key="search" autocomplete="off" spellcheck="false">
      </label>
      <div class="filterbar__count">
        <b>${num(results.rows.length)}</b> / ${num(results.total)} registros
      </div>
    </div>
    ${presets}
    <div class="chipbar">
      ${chips.length
        ? `<span class="chipbar__label">Filtros</span>${chips.map((chip, i) => `
            <span class="chip">${esc(chip.label)}
              <button data-chip="${i}" aria-label="Quitar filtro ${attr(chip.label)}">${icon('x')}</button>
            </span>`).join('')}
            <button class="chip chip--muted" data-chip-clear>${icon('x')} Limpiar todo</button>`
        : `<span class="chipbar__label">Sin filtros adicionales${dataset ? '' : ' · carga un XML para empezar'}</span>`}
    </div>
  </div>`;
}

/* ---------------------------- tabla registros -------------------------- */

const COLUMNS = [
  { key: 'id', label: 'ID', width: '' },
  { key: 'fecha', label: 'Fecha' },
  { key: 'tipo', label: 'Tipo' },
  { key: 'equipo', label: 'Equipo' },
  { key: 'marca', label: 'Marca' },
  { key: 'clase', label: 'Clase' },
  { key: 'prioridad', label: 'Prioridad' },
  { key: 'estado', label: 'Estado' },
  { key: 'tecnico', label: 'Técnico' }
];

function prioBadge(value) {
  if (!value) return '<span class="muted">—</span>';
  const cls = value === 'Crítica' ? 'critica' : value === 'Alta' ? 'alta' : value === 'Media' ? 'media' : 'baja';
  return `<span class="badge badge--${cls}">${esc(value)}</span>`;
}

export function recordsTable({ rows, page, perPage, sort, query }) {
  const sorted = [...rows].sort((a, b) => {
    const dir = sort.dir === 'asc' ? 1 : -1;
    let va = a[sort.key];
    let vb = b[sort.key];
    if (sort.key === 'fecha') { va = a.fecha || ''; vb = b.fecha || ''; }
    if (sort.key === 'id') { va = a.id || `#${a.idx}`; vb = b.id || `#${b.idx}`; }
    if (typeof va === 'string' || typeof vb === 'string') {
      return String(va || '').localeCompare(String(vb || ''), 'es') * dir;
    }
    return ((va || 0) - (vb || 0)) * dir;
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / perPage));
  const current = Math.min(page, totalPages - 1);
  const slice = sorted.slice(current * perPage, current * perPage + perPage);

  const thead = COLUMNS.map((c) => {
    const active = sort.key === c.key;
    return `<th class="${active ? 'sorted' : ''}" data-sort="${c.key}" scope="col">${esc(c.label)}${active ? `<span class="arrow">${sort.dir === 'asc' ? '▲' : '▼'}</span>` : ''}</th>`;
  }).join('');

  const body = slice.map((r) => {
    const classes = [r.esValida ? '' : 'is-bad', r.flags.duplicado ? 'is-dup' : ''].filter(Boolean).join(' ');
    const flags = [
      r.flags.fechaInvalida ? '<span class="badge badge--bad" title="Fecha imposible o vacía">fecha</span>' : '',
      r.flags.fechaFutura ? '<span class="badge badge--bad" title="Fecha futura">futuro</span>' : '',
      r.flags.sinInformacion ? '<span class="badge badge--warn" title="Sin información útil">vacío</span>' : '',
      r.flags.duplicado ? '<span class="badge badge--warn" title="Duplicado de otro registro">dup</span>' : ''
    ].filter(Boolean).join(' ');
    return `<tr class="${classes}" data-record="${r.idx}" title="Ver detalle">
      <td class="id">${esc(r.id || `#${r.idx + 1}`)} ${flags}</td>
      <td>${esc(fmtDate(r.fecha))}${!r.fecha && r.fechaRaw ? '<span class="muted" title="Valor original"> ⚠</span>' : ''}</td>
      <td>${esc(r.tipo || '—')}</td>
      <td>${esc(r.equipo || '—')}</td>
      <td title="${attr(r.marca)}">${esc(r.marca)}</td>
      <td title="${attr(r.clase)}">${esc(r.clase || '—')}</td>
      <td>${prioBadge(r.prioridad)}</td>
      <td>${esc(r.estado || '—')}</td>
      <td>${esc(r.tecnico || '—')}</td>
    </tr>`;
  }).join('');

  return `<div class="rtable-wrap thin-scroll">
    <table class="rtable">
      <thead><tr>${thead}</tr></thead>
      <tbody>${body || `<tr><td colspan="${COLUMNS.length}" class="muted" style="padding:1.4em;text-align:center">Ningún registro coincide con el filtro actual.</td></tr>`}</tbody>
    </table>
  </div>
  <div class="pager">
    <span class="pager__info">
      ${sorted.length ? `Mostrando <b>${num(current * perPage + 1)}–${num(Math.min(sorted.length, (current + 1) * perPage))}</b> de <b>${num(sorted.length)}</b>` : 'Sin resultados'}
      ${query ? ` · filtrados por “${esc(query)}”` : ''}
    </span>
    <span class="pager__btns">
      <button class="btn btn--sm btn--ghost" data-page="first" ${current === 0 ? 'disabled' : ''}>«</button>
      <button class="btn btn--sm btn--ghost" data-page="prev" ${current === 0 ? 'disabled' : ''}>‹ Anterior</button>
      <span class="muted" style="font-size:.95em">${current + 1} / ${totalPages}</span>
      <button class="btn btn--sm btn--ghost" data-page="next" ${current >= totalPages - 1 ? 'disabled' : ''}>Siguiente ›</button>
      <button class="btn btn--sm btn--ghost" data-page="last" ${current >= totalPages - 1 ? 'disabled' : ''}>»</button>
    </span>
  </div>`;
}

/* --------------------------- calidad / informe ------------------------- */

export function qualityPanel(summary) {
  const total = summary.total || 0;
  return `<div class="panel panel--accent">
    <div class="panel__head"><span>FILTRADO DE DATOS</span><span class="muted">criterio del script</span></div>
    <div class="panel__body">
      <ul class="line-list">
        <li><span>Incidencias originales</span><b>${num(total)}</b></li>
        <li><span>Incidencias válidas</span><b>${num(summary.valid)}</b></li>
        <li><span>Incidencias eliminadas</span><b>${num(summary.excludedByQuality)}</b></li>
        <li><span>· Fechas incorrectas o vacías</span><b>${num(summary.invalidDate)}</b></li>
        <li><span>· Fechas futuras</span><b>${num(summary.future)}</b></li>
        <li><span>· Sin información útil</span><b>${num(summary.noInfo)}</b></li>
        <li><span>Duplicados detectados (informativo)</span><b>${num(summary.duplicates)}</b></li>
      </ul>
    </div>
  </div>`;
}

export function emptyState({ title = 'Sin datos', text = '', action = '' }) {
  return `<div class="empty">
    ${icon('floppy')}
    <h4>${esc(title)}</h4>
    <p>${text}</p>
    ${action}
  </div>`;
}

/* --------------------------- etiquetas de preset ------------------------ */

export function presetCards({ counts, activeId }) {
  return `<div class="preset-grid">
    ${PRESETS.map((p) => `<button class="preset-card ${activeId === p.id ? 'is-on' : ''}" data-preset="${p.id}">
      <strong>${esc(p.name)} <em>${num(counts[p.id] ?? 0)}</em></strong>
      <span>${esc(p.desc)}</span>
    </button>`).join('')}
  </div>`;
}

export { monthLabel };
