/**
 * Vistas del sistema: cada ventana del escritorio.
 * Reciben el estado desde `app` y devuelven el markup + cableado de eventos.
 */
import { icon } from './icons.js';
import {
  esc, num, dec, pct, fmtDate, fmtDateLong, formatBytes,
  WEEKDAYS, todayISO, addDays
} from './util.js';
import { barTable, kpi, chartCard, heatmapTable, filterBar, recordsTable,
  qualityPanel, emptyState, presetCards } from './components.js';
import {
  FACETS, RULE_FIELDS, RULE_OPS, facetOptions
} from './filters.js';
import { drawTimeline, drawDonut, drawWeekday } from './charts.js';

const attr = (v) => esc(v);
const PER_PAGE = 20;

export function createViews(app) {
  /* ================================================================== */
  /* utilidades internas                                                */
  /* ================================================================== */

  function datasetRequired(el, extra = '') {
    el.innerHTML = `<div class="view">${emptyState({
      title: 'No hay ningún documento cargado',
      text: 'Arrastra tu <code>incidencies.xml</code> a cualquier parte de la pantalla, pulsa <b>Cargar XML</b> o explora el dataset de demostración.<br><span class="muted">Nada sale de tu navegador: el XML no se sube a ningún servidor.</span>',
      action: `<div class="row" style="justify-content:center;margin-top:.4em">
        <button class="btn btn--primary" data-action="load">${icon('upload')} Cargar XML</button>
        <button class="btn" data-action="demo">${icon('floppy')} Usar demo</button>
      </div>`
    })}${extra}</div>`;
    el.querySelectorAll('[data-action="load"]').forEach((b) => b.addEventListener('click', () => app.requestFile()));
    el.querySelectorAll('[data-action="demo"]').forEach((b) => b.addEventListener('click', () => app.loadDemo()));
  }

  function animateNumbers(el) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    el.querySelectorAll('.kpi__value').forEach((node) => {
      const textNode = [...node.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
      if (!textNode) return;
      const raw = textNode.textContent.trim();
      const target = Number(raw.replace(/\./g, '').replace(',', '.'));
      if (!Number.isFinite(target)) return;
      const decimals = raw.includes(',') ? raw.split(',')[1].length : 0;
      const start = performance.now();
      const step = (now) => {
        const progress = Math.min(1, (now - start) / 520);
        const eased = 1 - Math.pow(1 - progress, 3);
        const value = target * eased;
        textNode.textContent = decimals
          ? value.toFixed(decimals).replace('.', ',')
          : new Intl.NumberFormat('es-ES').format(Math.round(value));
        if (progress < 1) requestAnimationFrame(step);
        else textNode.textContent = raw;
      };
      requestAnimationFrame(step);
    });
  }

  function drawCharts(el, stats) {
    const timelineCanvas = el.querySelector('[data-chart="timeline"]');
    if (timelineCanvas) drawTimeline(timelineCanvas, stats.months);
    const donutCanvas = el.querySelector('[data-chart="donut"]');
    if (donutCanvas) drawDonut(donutCanvas, stats.byPrioridad.slice(0, 5), { centerLabel: 'total' });
    const weekdayCanvas = el.querySelector('[data-chart="weekday"]');
    if (weekdayCanvas) drawWeekday(weekdayCanvas, stats.weekdays);

    // guarda los redibujados para cambios de tamaño
    el.querySelectorAll('canvas').forEach((canvas) => {
      if (!canvas._resizeObs) {
        canvas._resizeObs = new ResizeObserver(() => {
          if (typeof canvas._draw === 'function') canvas._draw();
        });
        canvas._resizeObs.observe(canvas.parentElement || canvas);
      }
    });
  }

  function wireFilterBar(el) {
    // búsqueda
    const search = el.querySelector('[data-search]');
    if (search) {
      let timer = 0;
      search.addEventListener('input', () => {
        clearTimeout(timer);
        const value = search.value;
        timer = setTimeout(() => app.setFilter({ search: value }, { resetPage: true }), 240);
      });
    }
    el.querySelectorAll('[data-preset]').forEach((btn) => {
      btn.addEventListener('click', () => app.applyPreset(btn.dataset.preset));
    });
    el.querySelectorAll('[data-open-filters]').forEach((btn) => {
      btn.addEventListener('click', () => app.openView('filtros'));
    });
    el.querySelectorAll('[data-facet]').forEach((btn) => {
      btn.addEventListener('click', () => app.toggleFacet(btn.dataset.facet, btn.dataset.value));
    });
    el.querySelectorAll('[data-chip]').forEach((btn) => {
      btn.addEventListener('click', () => app.removeChip(Number(btn.dataset.chip)));
    });
    const clear = el.querySelector('[data-chip-clear]');
    if (clear) clear.addEventListener('click', () => app.resetFilter());
  }

  /* ================================================================== */
  /* ANÁLISIS                                                           */
  /* ================================================================== */

  function renderAnalisis(el) {
    const { dataset, filter, results } = app.state;
    if (!dataset) { datasetRequired(el); return; }

    const rows = results.rows;
    const total = rows.length;
    const stats = results.stats;
    const summary = dataset.summary;
    const range = stats.range;
    const maxMonths = stats.months.slice(-18);
    const noData = total === 0;

    const body = `<div class="view">
      ${filterBar({ filter, results, dataset })}

      <div class="kpis">
        ${kpi({
          label: 'Registros en el filtro',
          value: num(total),
          foot: `de ${num(results.total)} · ${pct(total, results.total)} del XML`
        })}
        ${kpi({
          label: 'Calidad del documento',
          value: dec(summary.coverage * 100, 1),
          unit: '%',
          foot: `${num(summary.valid)} válidas · ${num(summary.excludedByQuality)} descartadas`
        })}
        ${kpi({
          label: 'Críticas + altas',
          value: num(stats.kpi.criticas + stats.kpi.altas),
          foot: `${pct(stats.kpi.criticas + stats.kpi.altas, total || 1)} · ${num(stats.kpi.abiertas)} sin cerrar`
        })}
        ${kpi({
          label: 'Media diaria',
          value: dec(stats.kpi.mediaDia, 1),
          foot: range.min ? `${fmtDate(range.min)} → ${fmtDate(range.max)}` : 'sin fechas válidas'
        })}
      </div>

      ${noData ? emptyState({
        title: 'El filtro no devuelve nada',
        text: 'Prueba con menos restricciones o vuelve al criterio de calidad del script.',
        action: `<button class="btn" data-preset="valid">${icon('check')} Volver a válidas</button>`
      }) : ''}

      ${!noData ? `
      ${chartCard({
        title: 'Evolución mensual',
        hint: `${num(maxMonths.length)} meses`,
        canvas: '<canvas data-chart="timeline"></canvas>',
        footer: range.min
          ? `Del ${fmtDateLong(range.min)} al ${fmtDateLong(range.max)} · ${num(range.days)} días · ${dec(stats.kpi.mediaSemana, 1)} incidencias/semana`
          : ''
      })}

      <div class="grid2" style="margin-top:1.1em">
        ${chartCard({
          title: 'Reparto por prioridad',
          hint: 'clic en la leyenda para filtrar',
          canvas: '<canvas data-chart="donut" class="short"></canvas>',
          legend: `<div class="legend">${stats.byPrioridad.slice(0, 5).map((p) => `<span data-facet="prioridad" data-value="${attr(p.key)}" class="is-clickable"><i style="opacity:${0.4 + (p.n / (stats.byPrioridad[0]?.n || 1)) * 0.6}"></i>${esc(p.key)} <b>${pct(p.n, total)}</b></span>`).join('')}</div>`
        })}
        ${chartCard({
          title: 'Por día de la semana',
          hint: 'fin de semana atenuado',
          canvas: '<canvas data-chart="weekday" class="short"></canvas>',
          footer: 'Sábados y domingos en tono apagado.'
        })}
      </div>

      <div class="grid2" style="margin-top:1.2em">
        ${barTable({ title: 'Tipo de incidencia', iconName: 'chart', data: stats.byTipo, total, facet: 'tipo', limit: 8, note: 'clic para filtrar' })}
        ${barTable({ title: 'Tipo de equipo', iconName: 'pc', data: stats.byEquipo, total, facet: 'equipo', limit: 8, note: 'clic para filtrar' })}
      </div>

      <div class="grid2">
        ${barTable({ title: 'Clases', iconName: 'grid', data: stats.byClase, total, facet: 'clase', limit: 10, note: 'clic para filtrar' })}
        ${barTable({ title: 'Prioridad', iconName: 'warn', data: stats.byPrioridad, total, facet: 'prioridad', limit: 6, note: 'clic para filtrar' })}
      </div>

      <div class="grid2">
        ${barTable({ title: 'Marca (según el equipo)', iconName: 'tag', data: stats.byMarca, total, facet: 'marca', limit: 9, note: 'portátil / sobremesa' })}
        ${barTable({ title: 'Estado', iconName: 'check', data: stats.byEstado, total, facet: 'estado', limit: 6, note: 'clic para filtrar' })}
      </div>

      <div class="sec">
        <div class="sec__head"><h3>${icon('grid')}Tipo × prioridad</h3><span class="sub">densidad</span></div>
        ${heatmapTable(stats.heat)}
      </div>

      <div class="grid2">
        ${barTable({ title: 'Técnicos', iconName: 'user', data: stats.byTecnico, total, facet: 'tecnico', limit: 6, note: 'carga por persona' })}
        ${barTable({ title: 'Ubicaciones', iconName: 'tag', data: stats.byUbicacion, total, facet: 'ubicacion', limit: 6, note: 'dónde se concentra' })}
      </div>

      <div class="sec">
        <div class="sec__head">
          <h3>${icon('doc')}Registros</h3>
          <span class="sub">${num(rows.length)} en el filtro · clic para abrir</span>
        </div>
        ${recordsTable({ rows, page: app.ui.page, perPage: PER_PAGE, sort: app.ui.sort, query: filter.search })}
        <div class="row" style="margin-top:.6em">
          <button class="btn btn--sm" data-export="csv">${icon('download')} CSV</button>
          <button class="btn btn--sm" data-export="json">${icon('download')} JSON</button>
          <button class="btn btn--sm" data-export="txt">${icon('doc')} Resumen</button>
          <button class="btn btn--sm btn--ghost" data-open-view="informe">${icon('terminal')} Informe completo</button>
        </div>
      </div>
      ` : ''}
    </div>`;

    el.innerHTML = body;
    wireFilterBar(el);

    el.querySelectorAll('[data-sort]').forEach((th) => {
      th.addEventListener('click', () => {
        const key = th.dataset.sort;
        if (app.ui.sort.key === key) {
          app.ui.sort.dir = app.ui.sort.dir === 'asc' ? 'desc' : 'asc';
        } else {
          app.ui.sort = { key, dir: key === 'fecha' ? 'desc' : 'asc' };
        }
        app.notify('analisis');
      });
    });

    el.querySelectorAll('[data-page]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.page;
        const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
        let page = app.ui.page;
        if (action === 'first') page = 0;
        else if (action === 'prev') page = Math.max(0, page - 1);
        else if (action === 'next') page = Math.min(pages - 1, page + 1);
        else if (action === 'last') page = pages - 1;
        app.ui.page = page;
        app.notify('analisis');
      });
    });

    el.querySelectorAll('[data-record]').forEach((tr) => {
      tr.addEventListener('click', () => app.openRecord(Number(tr.dataset.record)));
    });

    el.querySelectorAll('[data-export]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const kind = btn.dataset.export;
        if (kind === 'csv') app.exportCsv();
        else if (kind === 'json') app.exportJson();
        else app.exportSummary();
      });
    });

    el.querySelectorAll('[data-open-view]').forEach((btn) => {
      btn.addEventListener('click', () => app.openView(btn.dataset.openView));
    });

    if (!noData) drawCharts(el, stats);
  }

  /* ================================================================== */
  /* DATOS                                                              */
  /* ================================================================== */

  function renderDatos(el) {
    const { dataset } = app.state;
    const summary = dataset?.summary;

    const fieldRows = dataset ? dataset.fields.filter((f) => f.fill > 0).map((f) => `
      <tr>
        <td><code class="tag">${esc(f.tag)}</code></td>
        <td>${esc(f.roleLabel)}</td>
        <td class="num">${pct(f.coverage, 1)}</td>
        <td title="${attr(f.sample)}"><span class="muted">${esc(f.sample || '—')}</span></td>
      </tr>`).join('') : '';

    el.innerHTML = `<div class="view">
      <div class="sec">
        <div class="sec__head"><h3>${icon('upload')}Cargar documento</h3><span class="sub">XML local</span></div>
        <div class="drop" id="dropzone" tabindex="0" role="button" aria-label="Seleccionar archivo XML">
          <div class="drop__icon">${icon('floppy')}</div>
          <div class="drop__title">Arrastra el XML aquí</div>
          <div class="drop__hint">o <b>pulsa para elegir un archivo</b> · <code>.xml</code> · se procesa en tu navegador</div>
        </div>
        <div class="row" style="margin-top:.6em">
          <button class="btn btn--primary" data-action="load">${icon('upload')} Elegir archivo</button>
          <button class="btn" data-action="demo">${icon('floppy')} Dataset de demostración</button>
          ${dataset ? `<button class="btn btn--ghost btn--danger" data-action="clear">${icon('x')} Quitar datos</button>` : ''}
        </div>
      </div>

      ${dataset ? `
      <div class="sec">
        <div class="sec__head"><h3>${icon('doc')}Documento cargado</h3><span class="sub">${esc(dataset.filename)}</span></div>
        <div class="panel">
          <div class="panel__body">
            <dl class="kv">
              <dt>Archivo</dt><dd>${esc(dataset.filename)}</dd>
              <dt>Tamaño</dt><dd>${formatBytes(dataset.size)}</dd>
              <dt>Raíz</dt><dd>&lt;${esc(dataset.rootTag)}&gt;</dd>
              <dt>Registros</dt><dd>${num(summary.total)} &lt;${esc(dataset.recordTag)}&gt;</dd>
              <dt>Campo de fecha</dt><dd>${dataset.dateFieldTag ? `<code class="tag">${esc(dataset.dateFieldTag)}</code>` : '<em>no detectado</em>'}</dd>
              <dt>Campos</dt><dd>${num(dataset.fields.length)} etiquetas</dd>
              <dt>Rango</dt><dd>${summary.dateMin ? `${fmtDate(summary.dateMin)} → ${fmtDate(summary.dateMax)}` : '—'}</dd>
              <dt>Cargado</dt><dd>${esc(dataset.loadedAt.toLocaleString('es-ES'))}</dd>
            </dl>
          </div>
        </div>
        ${dataset.warnings.length ? `<ul class="note note--warn">${dataset.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
      </div>

      <div class="sec">
        <div class="sec__head"><h3>${icon('check')}Calidad del documento</h3><span class="sub">${pct(summary.coverage, 1)} válidas</span></div>
        ${qualityPanel(summary)}
      </div>

      <div class="sec">
        <div class="sec__head"><h3>${icon('grid')}Mapa de campos</h3><span class="sub">detección automática</span></div>
        <div class="rtable-wrap thin-scroll" style="max-height:20em">
          <table class="rtable">
            <thead><tr><th>Etiqueta XML</th><th>Se interpreta como</th><th class="num">Relleno</th><th>Ejemplo</th></tr></thead>
            <tbody>${fieldRows || `<tr><td colspan="4" class="muted">Sin campos.</td></tr>`}</tbody>
          </table>
        </div>
        <p class="chartcard__note">El parser reconoce sinónimos (fecha/date/data, prioridad/priority, técnico/agent…) y XML con espacios de nombres.</p>
      </div>
      ` : ''}

      <div class="sec">
        <div class="sec__head"><h3>${icon('info')}Cómo funciona</h3><span class="sub">criterio del script</span></div>
        <ul class="note">
          <li>Se descartan las fechas <b>vacías</b>, <b>imposibles</b> (31/02) o <b>futuras</b>.</li>
          <li>Se descartan los registros sin información en <b>tipo</b>, <b>equipo</b>, <b>clases</b> o <b>prioridad</b>.</li>
          <li>La marca se deduce del modelo: el primer <code>&lt;Modelo&gt;</code> para portátiles, el segundo para sobremesas.</li>
          <li>Todo el análisis se ejecuta en memoria: no hay subida de archivos ni llamadas externas.</li>
        </ul>
      </div>
    </div>`;

    const drop = el.querySelector('#dropzone');
    const pick = () => app.requestFile();
    if (drop) {
      drop.addEventListener('click', pick);
      drop.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); pick(); }
      });
    }
    el.querySelectorAll('[data-action="load"]').forEach((b) => b.addEventListener('click', pick));
    el.querySelectorAll('[data-action="demo"]').forEach((b) => b.addEventListener('click', () => app.loadDemo()));
    el.querySelectorAll('[data-action="clear"]').forEach((b) => b.addEventListener('click', () => app.clearDataset()));
  }

  /* ================================================================== */
  /* FILTROS                                                            */
  /* ================================================================== */

  function facetGroup(key, label, dataset, filter) {
    const options = facetOptions(dataset.records, key);
    const active = filter.facets[key] || [];
    if (!options.length) return '';
    return `<div class="facet-group">
      <div class="facet-group__head">
        <span>${esc(label)}</span>
        ${active.length ? `<button class="btn btn--sm btn--ghost" data-facet-clear="${key}">limpiar</button>` : ''}
      </div>
      <div class="facet-list thin-scroll">
        ${options.slice(0, 40).map((o) => `
          <label class="facet-chip ${active.includes(o.value) ? 'is-on' : ''}">
            <input type="checkbox" data-facet-check="${key}" value="${attr(o.value)}" ${active.includes(o.value) ? 'checked' : ''}>
            <span>${esc(o.value)}</span>
            <em>${num(o.n)}</em>
          </label>`).join('')}
      </div>
      ${options.length > 40 ? `<p class="chartcard__note">+${num(options.length - 40)} valores más</p>` : ''}
    </div>`;
  }

  function ruleRow(rule, index) {
    const field = RULE_FIELDS.find((f) => f.key === rule.field) || RULE_FIELDS[0];
    const ops = RULE_OPS.filter((op) => op.types.includes(field.type));
    const op = ops.find((o) => o.key === rule.op) || ops[0];
    const needsValue = op.key !== 'blank' && op.key !== 'notBlank';
    let input = '';
    if (needsValue) {
      if (field.type === 'date' && op.key !== 'last') {
        input = `<input class="input" type="date" data-rule-value="${index}" value="${attr(rule.value || '')}" data-focus-key="rule-${index}">`;
      } else if (field.type === 'weekday') {
        input = `<select class="select" data-rule-value="${index}">${WEEKDAYS.map((d) => `<option value="${d}" ${rule.value === d ? 'selected' : ''}>${d}</option>`).join('')}</select>`;
      } else {
        input = `<input class="input" type="${field.type === 'number' || op.key === 'last' ? 'number' : 'text'}" data-rule-value="${index}" value="${attr(rule.value || '')}" placeholder="${op.key === 'last' ? '30' : op.key === 'between' ? '10, 40' : 'valor'}" data-focus-key="rule-${index}">`;
      }
    } else {
      input = `<span class="muted" style="font-size:.72em;align-self:center">sin valor</span>`;
    }
    return `<div class="rule">
      <select class="select" data-rule-field="${index}">
        ${RULE_FIELDS.map((f) => `<option value="${f.key}" ${f.key === field.key ? 'selected' : ''}>${esc(f.label)}</option>`).join('')}
      </select>
      <select class="select" data-rule-op="${index}">
        ${ops.map((o) => `<option value="${o.key}" ${o.key === op.key ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
      </select>
      ${input}
      <button class="rule__del" data-rule-del="${index}" aria-label="Quitar regla">${icon('x')}</button>
    </div>`;
  }

  function renderFiltros(el) {
    const { dataset, filter, results } = app.state;
    if (!dataset) { datasetRequired(el); return; }
    const counts = results.presetCounts;
    const saved = app.state.savedFilters || [];

    el.innerHTML = `<div class="view">
      <div class="sec">
        <div class="sec__head"><h3>${icon('funnel')}Combinaciones de un clic</h3><span class="sub">éxito de filtros</span></div>
        ${presetCards({ counts, activeId: filter.preset })}
        <p class="chartcard__note">Cada botón redefine el filtro completo. A partir de ahí puedes afinar con facetas, fechas y reglas.</p>
      </div>

      <div class="sec">
        <div class="sec__head"><h3>${icon('check')}Calidad del dato</h3><span class="sub">como el script</span></div>
        <div class="panel">
          <div class="panel__body stack">
            <label class="switch">
              <input type="checkbox" data-quality="excludeInvalidDate" ${filter.quality.excludeInvalidDate ? 'checked' : ''}>
              <span class="track"></span>
              Ocultar fechas vacías o imposibles
            </label>
            <label class="switch">
              <input type="checkbox" data-quality="excludeFuture" ${filter.quality.excludeFuture ? 'checked' : ''}>
              <span class="track"></span>
              Ocultar fechas futuras
            </label>
            <label class="switch">
              <input type="checkbox" data-quality="excludeSinInfo" ${filter.quality.excludeSinInfo ? 'checked' : ''}>
              <span class="track"></span>
              Ocultar registros sin información útil
            </label>
            <label class="switch">
              <input type="checkbox" data-quality="excludeDuplicates" ${filter.quality.excludeDuplicates ? 'checked' : ''}>
              <span class="track"></span>
              Ocultar duplicados detectados
            </label>
            <div class="row" style="margin-top:.2em">
              <span class="muted" style="font-size:.7em;letter-spacing:.1em;text-transform:uppercase">Mostrar sólo</span>
              <div class="seg">
                <button class="${!filter.quality.only ? 'is-on' : ''}" data-only="">Todo</button>
                <button class="${filter.quality.only === 'problems' ? 'is-on' : ''}" data-only="problems">Problemáticos</button>
                <button class="${filter.quality.only === 'duplicates' ? 'is-on' : ''}" data-only="duplicates">Duplicados</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="sec">
        <div class="sec__head"><h3>${icon('clock')}Rango de fechas</h3><span class="sub">ambos incluidos</span></div>
        <div class="panel">
          <div class="panel__body stack">
            <div class="datepair">
              <div class="field">
                <label for="date-from">Desde</label>
                <input class="input" id="date-from" type="date" data-date="from" value="${attr(filter.date.from)}">
              </div>
              <div class="field">
                <label for="date-to">Hasta</label>
                <input class="input" id="date-to" type="date" data-date="to" value="${attr(filter.date.to)}">
              </div>
            </div>
            <div class="row">
              <button class="btn btn--sm" data-quick-date="7">7 días</button>
              <button class="btn btn--sm" data-quick-date="30">30 días</button>
              <button class="btn btn--sm" data-quick-date="90">90 días</button>
              <button class="btn btn--sm" data-quick-date="365">12 meses</button>
              <button class="btn btn--sm btn--ghost" data-quick-date="all">Todo el rango</button>
            </div>
            <p class="chartcard__note">Las incidencias sin fecha válida se excluyen al aplicar un rango.</p>
          </div>
        </div>
      </div>

      <div class="sec">
        <div class="sec__head"><h3>${icon('grid')}Facetas</h3><span class="sub">${num(results.total)} registros base</span></div>
        <div class="facet-groups">
          ${FACETS.map((f) => facetGroup(f.key, f.label, dataset, filter)).join('')}
        </div>
      </div>

      <div class="sec">
        <div class="sec__head"><h3>${icon('terminal')}Reglas avanzadas</h3><span class="sub">combinaciones a medida</span></div>
        <div class="panel">
          <div class="panel__body">
            <div class="rules">
              ${filter.rules.list.map((rule, i) => ruleRow(rule, i)).join('') || '<p class="muted" style="font-size:.78em;margin:0">Sin reglas. Añade una para combinar condiciones.</p>'}
            </div>
            <div class="rules__foot">
              <button class="btn btn--sm" data-rule-add>${icon('plus')} Añadir regla</button>
              ${filter.rules.list.length > 1 ? `<span class="muted" style="font-size:.7em">Combinar:</span>
                <div class="joinswitch">
                  <button class="${filter.rules.join === 'AND' ? 'is-on' : ''}" data-join="AND">Y</button>
                  <button class="${filter.rules.join === 'OR' ? 'is-on' : ''}" data-join="OR">O</button>
                </div>` : ''}
            </div>
          </div>
        </div>
      </div>

      <div class="sec">
        <div class="sec__head"><h3>${icon('floppy')}Guardar este filtro</h3><span class="sub">en este navegador</span></div>
        <div class="panel">
          <div class="panel__body stack">
            <div class="row">
              <input class="input" placeholder="Nombre del filtro (p. ej. Portátiles críticas)" data-saved-name data-focus-key="saved-name" style="flex:1">
              <button class="btn" data-saved-save>${icon('check')} Guardar</button>
            </div>
            ${saved.length ? `<ul class="saved-list">
              ${saved.map((s) => `<li>
                <button class="btn btn--sm btn--ghost" data-saved-apply="${s.id}">${icon('funnel')} ${esc(s.name)}</button>
                <span class="muted">${num(s.count)} reg.</span>
                <button class="rule__del" data-saved-del="${s.id}" aria-label="Borrar filtro guardado">${icon('x')}</button>
              </li>`).join('')}
            </ul>` : '<p class="chartcard__note">Todavía no has guardado ningún filtro. Se guardan en localStorage, nunca en un servidor.</p>'}
          </div>
        </div>
      </div>

      <div class="row" style="justify-content:space-between;border-top:1px solid var(--line);padding-top:.8em">
        <span class="muted" style="font-size:.74em">Resultado actual: <b class="hi">${num(results.rows.length)}</b> incidencias</span>
        <div class="row">
          <button class="btn btn--sm btn--ghost" data-filter-reset>${icon('x')} Reiniciar</button>
          <button class="btn btn--sm btn--primary" data-filter-apply>${icon('check')} Ver análisis</button>
        </div>
      </div>
    </div>`;

    el.querySelectorAll('[data-preset]').forEach((btn) => {
      btn.addEventListener('click', () => app.applyPreset(btn.dataset.preset));
    });

    // --- facetas ---
    el.querySelectorAll('[data-facet-check]').forEach((input) => {
      input.addEventListener('change', () => app.toggleFacet(input.dataset.facetCheck, input.value));
    });
    el.querySelectorAll('[data-facet-clear]').forEach((btn) => {
      btn.addEventListener('click', () => app.clearFacet(btn.dataset.facetClear));
    });

    // --- calidad ---
    el.querySelectorAll('[data-quality]').forEach((input) => {
      input.addEventListener('change', () => {
        app.setFilter({ quality: { ...app.state.filter.quality, [input.dataset.quality]: input.checked } });
      });
    });
    el.querySelectorAll('[data-only]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const only = btn.dataset.only || null;
        app.setFilter({ quality: { ...app.state.filter.quality, only } });
      });
    });

    // --- fechas ---
    el.querySelectorAll('[data-date]').forEach((input) => {
      input.addEventListener('change', () => {
        app.setFilter({ date: { ...app.state.filter.date, [input.dataset.date]: input.value } });
      });
    });
    el.querySelectorAll('[data-quick-date]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const days = btn.dataset.quickDate;
        if (days === 'all') app.setFilter({ date: { from: '', to: '' } });
        else app.setFilter({ date: { from: addDays(todayISO(), -Number(days)), to: '' } });
      });
    });

    // --- reglas ---
    el.querySelectorAll('[data-rule-field]').forEach((select) => {
      select.addEventListener('change', () => {
        const i = Number(select.dataset.ruleField);
        const field = RULE_FIELDS.find((f) => f.key === select.value);
        const ops = RULE_OPS.filter((op) => op.types.includes(field.type));
        app.updateRule(i, { field: field.key, op: ops[0].key, value: '' });
      });
    });
    el.querySelectorAll('[data-rule-op]').forEach((select) => {
      select.addEventListener('change', () => {
        app.updateRule(Number(select.dataset.ruleOp), { op: select.value });
      });
    });
    el.querySelectorAll('[data-rule-value]').forEach((input) => {
      let timer = 0;
      input.addEventListener('input', () => {
        clearTimeout(timer);
        const i = Number(input.dataset.ruleValue);
        const value = input.value;
        timer = setTimeout(() => app.updateRule(i, { value }, { quiet: true }), 260);
      });
      input.addEventListener('change', () => app.updateRule(Number(input.dataset.ruleValue), { value: input.value }));
    });
    el.querySelectorAll('[data-rule-del]').forEach((btn) => {
      btn.addEventListener('click', () => app.removeRule(Number(btn.dataset.ruleDel)));
    });
    el.querySelectorAll('[data-rule-add]').forEach((btn) => {
      btn.addEventListener('click', () => app.addRule());
    });
    el.querySelectorAll('[data-join]').forEach((btn) => {
      btn.addEventListener('click', () => {
        app.setFilter({ rules: { ...app.state.filter.rules, join: btn.dataset.join } });
      });
    });

    // --- filtros guardados ---
    const saveBtn = el.querySelector('[data-saved-save]');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        const input = el.querySelector('[data-saved-name]');
        app.saveCurrentFilter(input?.value || '');
      });
    }
    el.querySelectorAll('[data-saved-apply]').forEach((btn) => {
      btn.addEventListener('click', () => app.applySavedFilter(btn.dataset.savedApply));
    });
    el.querySelectorAll('[data-saved-del]').forEach((btn) => {
      btn.addEventListener('click', () => app.deleteSavedFilter(btn.dataset.savedDel));
    });

    // --- acciones finales ---
    el.querySelectorAll('[data-filter-reset]').forEach((btn) => {
      btn.addEventListener('click', () => app.resetFilter());
    });
    el.querySelectorAll('[data-filter-apply]').forEach((btn) => {
      btn.addEventListener('click', () => {
        app.openView('analisis');
        app.toast('Filtro aplicado');
      });
    });
  }

  /* ================================================================== */
  /* INFORME                                                            */
  /* ================================================================== */

  function xmlTree(dataset, total) {
    if (!dataset) return '';
    const first = dataset.records[0];
    const fields = Object.keys(first?.raw || {});
    const lines = [];
    lines.push(`<b>&lt;${esc(dataset.rootTag)}&gt;</b>`);
    lines.push(`└── <b>&lt;${esc(dataset.recordTag)}&gt;</b> <i>× ${num(total)}</i>`);
    fields.forEach((tag, i) => {
      const isLast = i === fields.length - 1;
      const coverage = dataset.records.filter((r) => (r.raw[tag] || []).some((v) => v && v.trim())).length;
      lines.push(`    ${isLast ? '└──' : '├──'} <i>${i + 1}.</i> ${esc(tag)} <i>(${pct(coverage, dataset.records.length)})</i>`);
    });
    return lines.join('\n');
  }

  function reportText(dataset, rows) {
    if (!dataset) return '';
    const lines = [];
    lines.push('FILTRADO DE DATOS');
    lines.push(`Incidencias originales: ${num(dataset.summary.total)}`);
    lines.push(`Incidencias en el filtro: ${num(rows.length)}`);
    lines.push(`Incidencias eliminadas por calidad: ${num(dataset.summary.excludedByQuality)}`);
    lines.push(`  Fechas incorrectas o vacías: ${num(dataset.summary.invalidDate)}`);
    lines.push(`  Fechas futuras: ${num(dataset.summary.future)}`);
    lines.push(`  Sin información útil: ${num(dataset.summary.noInfo)}`);
    lines.push('');
    lines.push('DOCUMENTO');
    lines.push(`${dataset.filename}`);
    lines.push(`<${dataset.rootTag}> contiene ${num(rows.length)} <${dataset.recordTag}>`);
    lines.push('');
    const fields = [
      ['Tipo_de_incidencia', (r) => r.tipo || '(vacío)'],
      ['Tipo_de_equipo', (r) => r.equipo || '(vacío)'],
      ['Clases', (r) => r.clase || '(vacío)'],
      ['Prioridad', (r) => r.prioridad || '(vacío)'],
      ['Marca (según el equipo)', (r) => r.marca]
    ];
    for (const [label, getter] of fields) {
      const counts = new Map();
      rows.forEach((r) => {
        const k = getter(r);
        counts.set(k, (counts.get(k) || 0) + 1);
      });
      lines.push(label.toUpperCase());
      [...counts.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, n]) => {
        const bars = '█'.repeat(Math.max(0, Math.round((n / Math.max(1, rows.length)) * 25)));
        lines.push(`  ${k.padEnd(22, ' ')} ${String(n).padStart(6)}  ${pct(n, rows.length)}  ${bars}`);
      });
      lines.push('');
    }
    return lines.join('\n');
  }

  function renderInforme(el) {
    const { dataset, results } = app.state;
    if (!dataset) { datasetRequired(el); return; }
    const rows = results.rows;
    const total = rows.length;
    const stats = results.stats;

    el.innerHTML = `<div class="view">
      <div class="row row--between mb">
        <div class="row">
          <button class="btn btn--sm" data-copy-report>${icon('doc')} Copiar salida</button>
          <button class="btn btn--sm" data-print-report>${icon('download')} Imprimir / PDF</button>
        </div>
        <span class="muted" style="font-size:.7em">equivalente a incidencias_basico.py</span>
      </div>

      ${qualityPanel(dataset.summary)}

      <div class="panel">
        <div class="panel__head"><span>DOCUMENTO</span><span class="muted">${esc(dataset.filename)}</span></div>
        <div class="panel__body">
          <p style="margin:0;font-size:.78em;line-height:1.7">
            <b class="hi">&lt;${esc(dataset.rootTag)}&gt;</b> contiene
            <b class="hi">${num(dataset.summary.total)}</b> &lt;${esc(dataset.recordTag)}&gt;
            · filtro actual: <b class="hi">${num(total)}</b> registros.
          </p>
        </div>
      </div>

      <div class="sec">
        <div class="sec__head"><h3>${icon('terminal')}Árbol XML</h3><span class="sub">primer registro + relleno</span></div>
        <pre class="tree">${xmlTree(dataset, dataset.summary.total)}</pre>
      </div>

      ${total === 0 ? emptyState({
        title: 'El filtro actual está vacío',
        text: 'El informe se genera con las incidencias que pasan el filtro. Vuelve a "Válidas" para ver el resultado completo.'
      }) : `
      <div class="sec">
        <div class="sec__head"><h3>${icon('chart')}Estadísticas del filtro</h3><span class="sub">${num(total)} registros · ${num(stats.byTipo.length)} tipos</span></div>
        <div class="panel"><div class="panel__body panel__body--flush">
          ${barTable({ title: 'Tipo_de_incidencia', iconName: 'chart', data: stats.byTipo, total, limit: 50 })}
          ${barTable({ title: 'Tipo_de_equipo', iconName: 'pc', data: stats.byEquipo, total, limit: 50 })}
          ${barTable({ title: 'Clases', iconName: 'grid', data: stats.byClase, total, limit: 50 })}
          ${barTable({ title: 'Prioridad', iconName: 'warn', data: stats.byPrioridad, total, limit: 50 })}
          ${barTable({ title: 'Marca (según el equipo)', iconName: 'tag', data: stats.byMarca, total, limit: 50 })}
        </div></div>
      </div>

      <div class="sec">
        <div class="sec__head"><h3>${icon('clock')}Tendencias</h3><span class="sub">contexto</span></div>
        <div class="grid2">
          ${chartCard({
            title: 'Volumen mensual',
            hint: 'filtro actual',
            canvas: '<canvas data-chart="timeline"></canvas>'
          })}
          ${chartCard({
            title: 'Día de la semana',
            hint: 'carga relativa',
            canvas: '<canvas data-chart="weekday" class="short"></canvas>',
            footer: `Tiempo medio de resolución: ${stats.hours.mean === null ? '—' : `${dec(stats.hours.mean, 1)} h`} · mediana ${stats.hours.median === null ? '—' : `${dec(stats.hours.median, 1)} h`}`
          })}
        </div>
      </div>
      `}

      <div class="sec">
        <div class="sec__head"><h3>${icon('info')}Notas</h3></div>
        <ul class="note">
          <li>Los porcentajes se calculan sobre <b>${num(total)}</b> registros del filtro actual.</li>
          <li>El árbol muestra la estructura del primer registro y el porcentaje de relleno de cada campo.</li>
          <li>“Copiar salida” genera un texto listo para pegar en un correo o en un ticket.</li>
        </ul>
      </div>
    </div>`;

    const copy = el.querySelector('[data-copy-report]');
    if (copy) {
      copy.addEventListener('click', async () => {
        const text = reportText(dataset, rows);
        try {
          await navigator.clipboard.writeText(text);
          app.toast('Informe copiado al portapapeles');
        } catch {
          app.copyFallback(text);
        }
      });
    }
    const print = el.querySelector('[data-print-report]');
    if (print) print.addEventListener('click', () => window.print());

    if (total) drawCharts(el, stats);
  }

  /* ================================================================== */
  /* REGISTRO (LOG)                                                     */
  /* ================================================================== */

  const LEVEL_CLASS = { info: 'dim', ok: 'hi', warn: 'warn', error: 'bad' };

  function renderRegistro(el) {
    const { log } = app.state;
    el.innerHTML = `<div class="view">
      <div class="sec">
        <div class="sec__head"><h3>${icon('terminal')}Registro del sistema</h3><span class="sub">${num(log.length)} eventos</span></div>
        <div class="logbox thin-scroll" id="logbox">
          ${log.length ? log.map((entry) => `<div class="logrow logrow--${LEVEL_CLASS[entry.level] || 'dim'}">
            <span class="logrow__time">${esc(entry.time)}</span>
            <span class="logrow__level">${esc(entry.level.toUpperCase())}</span>
            <span class="logrow__text">${esc(entry.text)}</span>
          </div>`).join('') : '<div class="logrow"><span class="logrow__text muted">Sin eventos todavía.</span></div>'}
        </div>
        <div class="row" style="margin-top:.6em">
          <button class="btn btn--sm" data-log-export>${icon('download')} Exportar .log</button>
          <button class="btn btn--sm btn--ghost" data-log-clear>${icon('x')} Vaciar</button>
        </div>
      </div>
      <div class="sec">
        <div class="sec__head"><h3>${icon('info')}Atajos</h3></div>
        <dl class="kv shortcuts">
          <dt><kbd>F</kbd></dt><dd>pantalla plana / inclinación 3D</dd>
          <dt><kbd>D</kbd></dt><dd>abrir Datos</dd>
          <dt><kbd>A</kbd></dt><dd>abrir Análisis</dd>
          <dt><kbd>S</kbd></dt><dd>abrir Filtros</dd>
          <dt><kbd>I</kbd></dt><dd>abrir Informe</dd>
          <dt><kbd>Esc</kbd></dt><dd>cerrar ventana activa</dd>
          <dt><kbd>↑ ↓</kbd></dt><dd>registro anterior / siguiente en el detalle</dd>
        </dl>
      </div>
    </div>`;

    const box = el.querySelector('#logbox');
    if (box) box.scrollTop = box.scrollHeight;
    el.querySelector('[data-log-export]')?.addEventListener('click', () => app.exportLog());
    el.querySelector('[data-log-clear]')?.addEventListener('click', () => {
      app.state.log = [];
      app.notify('registro');
      app.toast('Registro vaciado');
    });
  }

  /* ================================================================== */
  /* EXPORTAR                                                           */
  /* ================================================================== */

  function renderExportar(el) {
    const { dataset, filter, results } = app.state;
    if (!dataset) { datasetRequired(el); return; }
    const rows = results.rows;
    const base = (dataset.filename || 'incidencies').replace(/\.xml$/i, '');

    el.innerHTML = `<div class="view">
      <div class="sec">
        <div class="sec__head"><h3>${icon('download')}Exportar</h3><span class="sub">sin servidores</span></div>
        <div class="panel">
          <div class="panel__body stack">
            <p style="margin:0;font-size:.8em;line-height:1.7">
              Se exportan <b class="hi">${num(rows.length)}</b> registros del filtro actual
              de un total de <b class="hi">${num(results.total)}</b>.
            </p>
            <div class="row">
              <button class="btn btn--primary" data-export="csv">${icon('download')} CSV</button>
              <button class="btn" data-export="json">${icon('download')} JSON</button>
              <button class="btn" data-export="txt">${icon('doc')} Informe .txt</button>
              <button class="btn" data-export="html">${icon('pc')} Informe .html</button>
            </div>
            <p class="chartcard__note">El CSV usa punto y coma (Excel en español). Las columnas incluyen los campos normalizados y la marca deducida.</p>
          </div>
        </div>
      </div>

      <div class="sec">
        <div class="sec__head"><h3>${icon('doc')}Resumen para pegar</h3></div>
        <div class="panel">
          <div class="panel__body stack">
            <button class="btn btn--sm" data-copy-summary>${icon('doc')} Copiar resumen al portapapeles</button>
            <pre class="tree" style="max-height:12em" id="summaryPreview">${esc(app.buildSummaryText())}</pre>
          </div>
        </div>
      </div>

      <div class="sec">
        <div class="sec__head"><h3>${icon('info')}Qué se incluye</h3></div>
        <ul class="note">
          <li><b>CSV</b>: una fila por incidencia con fecha ISO, tipo, equipo, marca, clase, prioridad, estado, técnico, ubicación y horas.</li>
          <li><b>JSON</b>: incluye además los valores originales del XML, las marcas de calidad y la configuración del filtro.</li>
          <li><b>Informe</b>: mismo contenido que la ventana Informe, listo para archivar o enviar.</li>
        </ul>
      </div>
    </div>`;

    el.querySelectorAll('[data-export]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const kind = btn.dataset.export;
        if (kind === 'csv') app.exportCsv();
        else if (kind === 'json') app.exportJson();
        else if (kind === 'txt') app.exportReportTxt();
        else if (kind === 'html') app.exportReportHtml();
      });
    });
    el.querySelector('[data-copy-summary]')?.addEventListener('click', async () => {
      const text = app.buildSummaryText();
      try {
        await navigator.clipboard.writeText(text);
        app.toast('Resumen copiado');
      } catch {
        app.copyFallback(text);
      }
    });
    void filter; void base;
  }

  /* ================================================================== */
  /* ACERCA DE                                                          */
  /* ================================================================== */

  function settingRow({ title, text, control }) {
    return `<div class="setting">
      <div class="setting__txt"><b>${esc(title)}</b><span>${esc(text)}</span></div>
      ${control}
    </div>`;
  }

  function renderAcerca(el) {
    const s = app.state.settings;

    el.innerHTML = `<div class="view">
      <div class="about-hero">
        <h2>TURBO<span>INCIDENCIAS</span> 3000</h2>
        <p>Un analizador de incidencias disfrazado de monitor de 1998. Carga un XML, limpia el ruido y entiende qué está pasando con tu parque informático. Sin backend, sin cuentas, sin telemetría.</p>
        <div class="row">
          <span class="badge badge--ok">v3.0</span>
          <span class="badge">HTML + CSS + JS</span>
          <span class="badge">0 dependencias</span>
        </div>
      </div>

      <div class="sec">
        <div class="sec__head"><h3>${icon('pc')}Ajustes del monitor</h3><span class="sub">se guardan aquí</span></div>
        <div class="panel">
          <div class="panel__body">
            ${settingRow({
              title: 'Fósforo',
              text: 'Color del tubo',
              control: `<div class="themes">
                ${[['amber', '#f0a63c'], ['green', '#79ef9a'], ['ice', '#86d8ff'], ['bone', '#efe6d2']].map(([id, color]) =>
                  `<button class="theme-dot ${s.theme === id ? 'is-on' : ''}" style="--swatch:${color}" data-theme-set="${id}" title="${id}" aria-label="Tema ${id}"></button>`).join('')}
              </div>`
            })}
            ${settingRow({
              title: 'Líneas de barrido',
              text: 'Scanlines del CRT',
              control: `<label class="switch"><input type="checkbox" data-setting="scanlines" ${s.scanlines ? 'checked' : ''}><span class="track"></span></label>`
            })}
            ${settingRow({
              title: 'Inclinación 3D',
              text: 'El monitor sigue al cursor',
              control: `<label class="switch"><input type="checkbox" data-setting="tilt" ${s.tilt ? 'checked' : ''}><span class="track"></span></label>`
            })}
            ${settingRow({
              title: 'Sonido',
              text: 'Clics y bips sintetizados',
              control: `<label class="switch"><input type="checkbox" data-setting="sound" ${s.sound ? 'checked' : ''}><span class="track"></span></label>`
            })}
            ${settingRow({
              title: 'Secuencia de arranque',
              text: 'POST del BIOS al cargar',
              control: `<label class="switch"><input type="checkbox" data-setting="boot" ${s.boot ? 'checked' : ''}><span class="track"></span></label>`
            })}
            ${settingRow({
              title: 'Restaurar ventanas',
              text: 'Olvida posiciones y tamaños',
              control: `<button class="btn btn--sm" data-reset-windows>${icon('x')} Restaurar</button>`
            })}
          </div>
        </div>
      </div>

      <div class="sec">
        <div class="sec__head"><h3>${icon('user')}Atajos de teclado</h3></div>
        <dl class="kv shortcuts">
          <dt><kbd>F</kbd></dt><dd>alternar pantalla plana / 3D</dd>
          <dt><kbd>A</kbd> <kbd>D</kbd> <kbd>S</kbd> <kbd>I</kbd></dt><dd>análisis · datos · filtros · informe</dd>
          <dt><kbd>Esc</kbd></dt><dd>cerrar la ventana activa</dd>
          <dt><kbd>↑</kbd> <kbd>↓</kbd></dt><dd>registro anterior / siguiente</dd>
          <dt><kbd>Espacio</kbd></dt><dd>encender o apagar el monitor cuando está en standby</dd>
        </dl>
      </div>

      <div class="sec">
        <div class="sec__head"><h3>${icon('info')}Cómo se calculan los datos</h3></div>
        <ul class="note">
          <li><b>Fechas</b>: se aceptan ISO, dd/mm/aaaa, dd-mm-aaaa, “13 oct 2025”, ISO con hora y año suelto. Se rechazan fechas inexistentes y futuras.</li>
          <li><b>Información útil</b>: un registro se descarta si tipo, equipo, clase y prioridad están vacíos o son marcadores (<code>N/A</code>, <code>null</code>, <code>desconocido</code>…).</li>
          <li><b>Marca</b>: se toma el primer <code>&lt;Modelo&gt;</code> para portátiles y el segundo para sobremesas, igual que el script original.</li>
          <li><b>Duplicados</b>: se comparan tipo, equipo, clase, prioridad, fecha, técnico, descripción y marca.</li>
        </ul>
      </div>

      <div class="sec">
        <div class="sec__head"><h3>${icon('tag')}Créditos</h3></div>
        <ul class="note">
          <li>Port web de <code>incidencias_basico.py</code> (rich + ElementTree) a HTML/CSS/JS puro.</li>
          <li>Estética inspirada en el template <i>Nostalgia Computer</i> de Framer.</li>
          <li>Tipografías: Silkscreen, Pixelify Sans e IBM Plex Mono (Google Fonts).</li>
          <li>Privacidad: el XML se procesa en memoria y nunca se envía a Internet.</li>
        </ul>
      </div>
    </div>`;

    el.querySelectorAll('[data-theme-set]').forEach((btn) => {
      btn.addEventListener('click', () => app.setSetting('theme', btn.dataset.themeSet));
    });
    el.querySelectorAll('[data-setting]').forEach((input) => {
      input.addEventListener('change', () => app.setSetting(input.dataset.setting, input.checked));
    });
    el.querySelector('[data-reset-windows]')?.addEventListener('click', () => app.resetWindows());
  }

  /* ================================================================== */
  /* DETALLE DE REGISTRO                                                */
  /* ================================================================== */

  function renderDetalle(el) {
    const record = app.state.selectedRecord;
    if (!record) {
      el.innerHTML = `<div class="view">${emptyState({
        title: 'Ningún registro seleccionado',
        text: 'Haz clic en una fila de la tabla de registros para inspeccionarla.'
      })}</div>`;
      return;
    }

    const rows = app.state.results.rows;
    const position = rows.findIndex((r) => r.idx === record.idx);
    const flags = record.flags;
    const warnings = [
      flags.fechaInvalida ? `Fecha no válida (“${record.fechaRaw || 'vacía'}”)` : '',
      flags.fechaFutura ? `Fecha futura (“${record.fechaRaw}”)` : '',
      flags.sinInformacion ? 'Sin información útil en los campos principales' : '',
      flags.duplicado ? `Duplicado del registro #${(flags.dupOf ?? 0) + 1}` : ''
    ].filter(Boolean);

    const rawRows = Object.entries(record.raw).map(([tag, values]) => `
      <tr>
        <td><code class="tag">${esc(tag)}</code></td>
        <td>${values.map((v) => esc(v) || '<span class="muted">(vacío)</span>').join('<br>')}</td>
      </tr>`).join('');

    el.innerHTML = `<div class="view">
      <div class="row row--between mb">
        <div>
          <div class="detail-id">${esc(record.id || `#${record.idx + 1}`)}</div>
          <div class="row" style="gap:.35em;margin-top:.25em">
            ${record.prioridad ? `<span class="badge badge--${record.prioridad === 'Crítica' ? 'critica' : record.prioridad === 'Alta' ? 'alta' : record.prioridad === 'Media' ? 'media' : 'baja'}">${esc(record.prioridad)}</span>` : ''}
            <span class="badge">${esc(record.tipo || 'sin tipo')}</span>
            <span class="badge">${esc(record.equipo || 'sin equipo')}</span>
            <span class="badge">${esc(record.estado || 'sin estado')}</span>
          </div>
        </div>
        <div class="row">
          <button class="btn btn--sm btn--ghost" data-nav="-1" ${position <= 0 ? 'disabled' : ''}>‹ Anterior</button>
          <span class="muted" style="font-size:.7em">${position >= 0 ? `${num(position + 1)} / ${num(rows.length)}` : 'fuera del filtro'}</span>
          <button class="btn btn--sm btn--ghost" data-nav="1" ${position < 0 || position >= rows.length - 1 ? 'disabled' : ''}>Siguiente ›</button>
        </div>
      </div>

      ${warnings.length ? `<ul class="note note--warn">${warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : `<ul class="note note--ok"><li>Registro válido: pasa los filtros de calidad.</li></ul>`}

      <div class="sec">
        <div class="sec__head"><h3>${icon('doc')}Datos normalizados</h3></div>
        <div class="panel">
          <div class="panel__body">
            <dl class="kv">
              <dt>Fecha</dt><dd>${esc(fmtDateLong(record.fecha))} <em>${record.fechaRaw ? `· original: ${esc(record.fechaRaw)}` : ''}</em></dd>
              <dt>Cierre</dt><dd>${record.cierre ? esc(fmtDateLong(record.cierre)) : '<em>—</em>'}</dd>
              <dt>Tipo</dt><dd>${esc(record.tipo || '—')}</dd>
              <dt>Equipo</dt><dd>${esc(record.equipo || '—')} ${record.equipoKind !== 'otro' ? `<em>(${record.equipoKind})</em>` : ''}</dd>
              <dt>Marca</dt><dd>${esc(record.marca)}</dd>
              <dt>Modelo portátil</dt><dd>${esc(record.modeloPortatil || '—')}</dd>
              <dt>Modelo sobremesa</dt><dd>${esc(record.modeloSobremesa || '—')}</dd>
              <dt>Clase</dt><dd>${esc(record.clase || '—')}</dd>
              <dt>Prioridad</dt><dd>${esc(record.prioridad || '—')}</dd>
              <dt>Estado</dt><dd>${esc(record.estado || '—')}</dd>
              <dt>Técnico</dt><dd>${esc(record.tecnico || '—')}</dd>
              <dt>Ubicación</dt><dd>${esc(record.ubicacion || '—')}</dd>
              <dt>Origen</dt><dd>${esc(record.origen || '—')}</dd>
              <dt>Horas</dt><dd>${record.horas === null ? '—' : `${dec(record.horas, 1)} h`}</dd>
              <dt>Descripción</dt><dd>${esc(record.descripcion || '—')}</dd>
              <dt>Campos vacíos</dt><dd>${record.vacios} de 8</dd>
            </dl>
          </div>
        </div>
      </div>

      <div class="sec">
        <div class="sec__head"><h3>${icon('terminal')}Valores originales del XML</h3><span class="sub">${Object.keys(record.raw).length} etiquetas</span></div>
        <div class="rtable-wrap thin-scroll" style="max-height:18em">
          <table class="rtable">
            <thead><tr><th>Etiqueta</th><th>Valor</th></tr></thead>
            <tbody>${rawRows}</tbody>
          </table>
        </div>
      </div>
    </div>`;

    el.querySelectorAll('[data-nav]').forEach((btn) => {
      btn.addEventListener('click', () => app.navigateRecord(Number(btn.dataset.nav)));
    });
  }

  /* ================================================================== */
  /* definiciones                                                       */
  /* ================================================================== */

  return {
    analisis: {
      title: 'Análisis',
      icon: 'chart',
      breadcrumb: ['Desktop', 'Análisis'],
      size: { w: 0.95, h: 0.95 },
      render: renderAnalisis,
      statusLeft: 'panel de incidencias',
      statusRight: 'clic en una fila para el detalle'
    },
    datos: {
      title: 'Datos',
      icon: 'floppy',
      breadcrumb: ['Desktop', 'Datos'],
      size: { w: 0.88, h: 0.92 },
      render: renderDatos
    },
    filtros: {
      title: 'Filtros',
      icon: 'funnel',
      breadcrumb: ['Desktop', 'Filtros'],
      size: { w: 0.9, h: 0.93 },
      render: renderFiltros
    },
    informe: {
      title: 'Informe',
      icon: 'doc',
      breadcrumb: ['Desktop', 'Informe'],
      size: { w: 0.92, h: 0.94 },
      render: renderInforme
    },
    registro: {
      title: 'Registro',
      icon: 'terminal',
      breadcrumb: ['Desktop', 'Registro'],
      size: { w: 0.82, h: 0.86 },
      render: renderRegistro
    },
    exportar: {
      title: 'Exportar',
      icon: 'download',
      breadcrumb: ['Desktop', 'Exportar'],
      size: { w: 0.74, h: 0.85 },
      render: renderExportar
    },
    acerca: {
      title: 'Acerca de',
      icon: 'info',
      breadcrumb: ['Desktop', 'Acerca de'],
      size: { w: 0.72, h: 0.82 },
      render: renderAcerca
    },
    detalle: {
      title: 'Detalle',
      icon: 'doc',
      breadcrumb: ['Desktop', 'Análisis', 'Registro'],
      size: { w: 0.64, h: 0.9 },
      render: renderDetalle
    }
  };
}

