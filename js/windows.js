/**
 * Gestor de ventanas del escritorio: abrir, cerrar, arrastrar,
 * redimensionar, maximizar y minimizar. Guarda la geometría.
 */
import { icon } from './icons.js';
import { clamp, esc } from './util.js';

const STORE_PREFIX = 'turbo3000.win.';
const isMobile = () => window.matchMedia('(max-width: 860px)').matches;

function loadGeom(id) {
  if (isMobile()) return null;
  try {
    const raw = localStorage.getItem(STORE_PREFIX + id);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveGeom(id, geom) {
  if (isMobile()) return;
  try {
    localStorage.setItem(STORE_PREFIX + id, JSON.stringify(geom));
  } catch { /* almacenamiento lleno o modo privado */ }
}

export function createWindowManager({ layer, workspace, onChange }) {
  const wins = new Map();
  let z = 20;
  let cascade = 0;

  function bounds() {
    return { width: workspace.clientWidth, height: workspace.clientHeight };
  }

  function clampGeom(geom) {
    const { width, height } = bounds();
    const w = clamp(geom.w, Math.min(360, width), width);
    const h = clamp(geom.h, Math.min(260, height), height);
    return {
      x: clamp(geom.x, 0, Math.max(0, width - w)),
      y: clamp(geom.y, 0, Math.max(0, height - h)),
      w,
      h
    };
  }

  function applyGeom(win, geom) {
    const g = clampGeom(geom);
    win.el.style.setProperty('--x', `${g.x}px`);
    win.el.style.setProperty('--y', `${g.y}px`);
    win.el.style.setProperty('--w', `${g.w}px`);
    win.el.style.setProperty('--h', `${g.h}px`);
    win.geom = g;
  }

  function focus(id) {
    const win = wins.get(id);
    if (!win) return;
    z += 1;
    win.el.style.zIndex = String(z);
    wins.forEach((w) => w.el.classList.toggle('is-focused', w === win && !w.el.classList.contains('is-hidden')));
    win.el.classList.remove('is-hidden');
    win.el.classList.remove('is-min');
    if (win.config.onFocus) win.config.onFocus(win.body, win);
    onChange?.();
  }

  function setStatus(id, left, right) {
    const win = wins.get(id);
    if (!win) return;
    const leftEl = win.el.querySelector('[data-status-left]');
    const rightEl = win.el.querySelector('[data-status-right]');
    if (leftEl) leftEl.innerHTML = left ?? '';
    if (rightEl) rightEl.innerHTML = right ?? '';
  }

  function render(id) {
    const win = wins.get(id);
    if (!win) return;
    const scrollTop = win.body.scrollTop;
    win.body.querySelectorAll('canvas').forEach((canvas) => canvas._resizeObs?.disconnect());
    win.body.innerHTML = '';
    win.body.scrollTop = scrollTop;
    win.config.render(win.body, {
      win,
      setStatus: (left, right) => setStatus(id, left, right),
      manager: api
    });
  }

  function build(id, config) {
    const { width, height } = bounds();
    const defaultW = Math.min(width - 24, Math.round(width * (config.size?.w ?? 0.78)));
    const defaultH = Math.min(height - 24, Math.round(height * (config.size?.h ?? 0.8)));
    const offset = (cascade % 4) * 18;
    cascade += 1;

    const saved = config.remember === false ? null : loadGeom(id);
    const geom = saved
      ? { ...saved, w: Math.min(saved.w, width), h: Math.min(saved.h, height) }
      : {
          x: Math.round((width - defaultW) / 2) + offset,
          y: Math.round(Math.max(8, (height - defaultH) / 2 - 8)) + offset,
          w: defaultW,
          h: defaultH
        };

    const el = document.createElement('section');
    el.className = 'win';
    el.dataset.win = id;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', config.title);
    el.innerHTML = `
      <header class="win__bar" data-drag>
        <span class="win__title">${icon(config.icon || 'doc')}<span>${esc(config.title)}</span></span>
        <span class="win__ctrls">
          <button data-act="min" title="Minimizar" aria-label="Minimizar">${icon('minus')}</button>
          <button data-act="max" title="Maximizar" aria-label="Maximizar">${icon('square')}</button>
          <button data-act="close" title="Cerrar" aria-label="Cerrar">${icon('x')}</button>
        </span>
      </header>
      <div class="win__crumbs">${(config.breadcrumb || ['Desktop', config.title])
        .map((c, i, arr) => (i === arr.length - 1 ? `<b>${esc(c)}</b>` : `<span>${esc(c)}</span><span class="sep">/</span>`))
        .join('')}</div>
      <div class="win__body${config.flush ? ' win__body--flush' : ''}" tabindex="-1"></div>
      <footer class="win__status">
        <span data-status-left>${esc(config.statusLeft || 'listo')}</span>
        <span data-status-right>${esc(config.statusRight || '')}</span>
      </footer>
      <span class="win__grip" title="Redimensionar"></span>
    `;

    layer.appendChild(el);
    const win = {
      id,
      el,
      body: el.querySelector('.win__body'),
      config,
      geom
    };
    wins.set(id, win);
    applyGeom(win, geom);
    render(id);
    focus(id);
    bindDrag(win);
    bindResize(win);
    el.addEventListener('pointerdown', () => focus(id), true);
    el.querySelector('.win__bar').addEventListener('dblclick', (event) => {
      if (event.target.closest('button')) return;
      toggleMax(id);
    });

    el.querySelectorAll('[data-act]').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        const act = btn.dataset.act;
        if (act === 'close') close(id);
        else if (act === 'min') minimize(id);
        else if (act === 'max') toggleMax(id);
      });
    });

    if (config.onMount) config.onMount(win.body, win);
    return win;
  }

  function bindDrag(win) {
    const bar = win.el.querySelector('[data-drag]');
    let start = null;

    bar.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || event.target.closest('button')) return;
      if (win.el.classList.contains('is-max') || isMobile()) return;
      focus(win.id);
      const rect = win.el.getBoundingClientRect();
      const parent = workspace.getBoundingClientRect();
      start = {
        px: event.clientX,
        py: event.clientY,
        x: rect.left - parent.left,
        y: rect.top - parent.top
      };
      bar.setPointerCapture(event.pointerId);
      win.el.style.transition = 'none';
    });

    bar.addEventListener('pointermove', (event) => {
      if (!start) return;
      const { width, height } = bounds();
      const nx = clamp(start.x + (event.clientX - start.px), 0, width - win.geom.w);
      const ny = clamp(start.y + (event.clientY - start.py), 0, height - win.geom.h);
      win.el.style.setProperty('--x', `${nx}px`);
      win.el.style.setProperty('--y', `${ny}px`);
      win.geom.x = nx;
      win.geom.y = ny;
    });

    const end = () => {
      if (!start) return;
      start = null;
      win.el.style.transition = '';
      saveGeom(win.id, win.geom);
    };
    bar.addEventListener('pointerup', end);
    bar.addEventListener('pointercancel', end);
  }

  function bindResize(win) {
    const grip = win.el.querySelector('.win__grip');
    let start = null;
    grip.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      focus(win.id);
      start = {
        px: event.clientX,
        py: event.clientY,
        w: win.geom.w,
        h: win.geom.h
      };
      grip.setPointerCapture(event.pointerId);
    });
    grip.addEventListener('pointermove', (event) => {
      if (!start) return;
      const { width, height } = bounds();
      const w = clamp(start.w + (event.clientX - start.px), 320, width - win.geom.x);
      const h = clamp(start.h + (event.clientY - start.py), 220, height - win.geom.y);
      win.el.style.setProperty('--w', `${w}px`);
      win.el.style.setProperty('--h', `${h}px`);
      win.geom.w = w;
      win.geom.h = h;
      if (typeof win.el._onResize === 'function') win.el._onResize();
    });
    const end = () => {
      if (!start) return;
      start = null;
      saveGeom(win.id, win.geom);
      if (win.config.onResize) win.config.onResize(win.body, win);
    };
    grip.addEventListener('pointerup', end);
    grip.addEventListener('pointercancel', end);
  }

  function open(id, configOverride) {
    const config = configOverride || wins.get(id)?.config;
    if (!config) return null;
    const existing = wins.get(id);
    if (existing) {
      existing.el.classList.remove('is-min', 'is-hidden');
      focus(id);
      if (existing.config.onShow) existing.config.onShow(existing.body, existing);
      return existing;
    }
    if (isMobile()) {
      wins.forEach((w) => {
        w.el.classList.add('is-min');
        w.el.classList.remove('is-focused');
      });
    }
    return build(id, config);
  }

  function close(id) {
    const win = wins.get(id);
    if (!win) return;
    if (win.config.onClose) win.config.onClose(win.body, win);
    win.el.remove();
    wins.delete(id);
    const next = [...wins.values()].filter((w) => !w.el.classList.contains('is-min')).pop();
    if (next) focus(next.id);
    onChange?.();
  }

  function minimize(id) {
    const win = wins.get(id);
    if (!win) return;
    win.el.classList.add('is-min');
    win.el.classList.remove('is-focused');
    const next = [...wins.values()].filter((w) => !w.el.classList.contains('is-min')).pop();
    if (next) focus(next.id);
    onChange?.();
  }

  function toggleMax(id) {
    const win = wins.get(id);
    if (!win || isMobile()) return;
    const isMax = win.el.classList.toggle('is-max');
    win.el.classList.toggle('is-maximized', isMax);
    if (!isMax) applyGeom(win, win.geom);
    focus(id);
    if (win.config.onResize) win.config.onResize(win.body, win);
  }

  function refresh(id) {
    const win = wins.get(id);
    if (!win) return;
    render(id);
  }

  function isOpen(id) {
    const win = wins.get(id);
    return Boolean(win) && !win.el.classList.contains('is-min');
  }

  function get(id) {
    return wins.get(id);
  }

  const api = {
    open,
    close,
    focus,
    minimize,
    toggleMax,
    refresh,
    isOpen,
    get,
    setStatus,
    render,
    list: () => [...wins.values()],
    definitions: new Map()
  };

  // Recoloca las ventanas al cambiar el tamaño del workspace
  let raf = 0;
  const ro = new ResizeObserver(() => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      if (isMobile()) return;
      wins.forEach((win) => {
        if (win.el.classList.contains('is-max')) return;
        applyGeom(win, win.geom);
      });
    });
  });
  ro.observe(workspace);

  return api;
}
