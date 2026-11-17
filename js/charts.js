/**
 * Gráficas en canvas dibujadas a mano, con estética de fósforo.
 * Sin librerías: líneas finas, relleno en degradado y rejilla discreta.
 */
import { monthLabel, num, fmtDateLong } from './util.js';

const DPR = () => Math.min(window.devicePixelRatio || 1, 2);

function sizeCanvas(canvas) {
  const dpr = DPR();
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

function colors(canvas) {
  const cs = getComputedStyle(canvas);
  return {
    phos: cs.getPropertyValue('--phos').trim() || '#f0a63c',
    hi: cs.getPropertyValue('--phos-hi').trim() || '#ffd08a',
    mid: cs.getPropertyValue('--phos-mid').trim() || '#c98a35',
    dim: cs.getPropertyValue('--phos-dim').trim() || '#8d6329',
    faint: cs.getPropertyValue('--phos-faint').trim() || '#5d4419',
    bg: cs.getPropertyValue('--bg').trim() || '#0a0805',
    rgb: cs.getPropertyValue('--phos-rgb').trim() || '240, 166, 60'
  };
}

function rgba(rgb, a) {
  return `rgba(${rgb}, ${a})`;
}

/* ------------------------------- tooltip ------------------------------- */

function tipFor(canvas) {
  const host = canvas.closest('.chartcard') || canvas.parentElement;
  if (!host) return null;
  host.style.position = 'relative';
  let tip = host.querySelector('.charttip');
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'charttip';
    host.appendChild(tip);
  }
  return tip;
}

function showTip(canvas, html, x, y) {
  const tip = tipFor(canvas);
  if (!tip) return;
  tip.innerHTML = html;
  tip.style.left = `${x}px`;
  tip.style.top = `${y}px`;
  tip.classList.add('is-on');
}

function hideTip(canvas) {
  const tip = canvas.closest('.chartcard')?.querySelector('.charttip');
  if (tip) tip.classList.remove('is-on');
}

/* ------------------------------- timeline ------------------------------ */

export function drawTimeline(canvas, points, opts = {}) {
  if (!canvas) return;
  const draw = (hoverIndex = -1) => {
    const { ctx, w, h } = sizeCanvas(canvas);
    const c = colors(canvas);
    ctx.clearRect(0, 0, w, h);
    if (!points.length) {
      ctx.fillStyle = c.faint;
      ctx.font = '10px "IBM Plex Mono", monospace';
      ctx.fillText('Sin datos en el rango', 10, h / 2);
      return;
    }

    const padL = 30;
    const padR = 20;
    const padT = 10;
    const padB = 20;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;
    const max = Math.max(1, ...points.map((p) => p.n));
    const stepX = points.length > 1 ? plotW / (points.length - 1) : 0;
    const xOf = (i) => padL + (points.length > 1 ? stepX * i : plotW / 2);
    const yOf = (n) => padT + plotH - (n / max) * plotH;

    // rejilla horizontal
    ctx.font = '9px "IBM Plex Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let g = 0; g <= 4; g++) {
      const value = Math.round((max / 4) * g);
      const y = Math.round(yOf(value)) + 0.5;
      ctx.strokeStyle = rgba(c.rgb, g === 0 ? 0.3 : 0.11);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();
      ctx.fillStyle = c.faint;
      ctx.fillText(num(value), padL - 5, y);
    }

    // área
    const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
    grad.addColorStop(0, rgba(c.rgb, 0.34));
    grad.addColorStop(0.6, rgba(c.rgb, 0.1));
    grad.addColorStop(1, rgba(c.rgb, 0.01));
    ctx.beginPath();
    ctx.moveTo(xOf(0), padT + plotH);
    points.forEach((p, i) => ctx.lineTo(xOf(i), yOf(p.n)));
    ctx.lineTo(xOf(points.length - 1), padT + plotH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // línea
    ctx.beginPath();
    points.forEach((p, i) => {
      const x = xOf(i);
      const y = yOf(p.n);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = c.phos;
    ctx.lineWidth = 1.6;
    ctx.shadowColor = rgba(c.rgb, 0.7);
    ctx.shadowBlur = 6;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // puntos
    const everyN = Math.ceil(points.length / 26);
    points.forEach((p, i) => {
      if (i % everyN !== 0 && i !== points.length - 1 && i !== hoverIndex) return;
      ctx.fillStyle = i === hoverIndex ? c.hi : c.phos;
      const s = i === hoverIndex ? 4 : 2;
      ctx.fillRect(Math.round(xOf(i) - s / 2), Math.round(yOf(p.n) - s / 2), s, s);
    });

    // etiquetas X
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = c.faint;
    const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(4, Math.floor(plotW / 52))));
    let lastLabelX = -Infinity;
    points.forEach((p, i) => {
      if (i % labelEvery !== 0 && i !== points.length - 1) return;
      const x = xOf(i);
      if (x - lastLabelX < 40) return;
      lastLabelX = x;
      ctx.fillText(monthLabel(p.key), x, padT + plotH + 5);
    });

    // hover
    if (hoverIndex >= 0 && points[hoverIndex]) {
      const x = xOf(hoverIndex);
      const y = yOf(points[hoverIndex].n);
      ctx.strokeStyle = rgba(c.rgb, 0.5);
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + plotH);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = c.hi;
      ctx.beginPath();
      ctx.arc(x, y, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  canvas._draw = draw;
  draw();
  if (canvas.dataset.hoverBound === '1') return;
  canvas.dataset.hoverBound = '1';

  const onMove = (event) => {
    if (!points.length) return;
    const rect = canvas.getBoundingClientRect();
    const padL = 30;
    const padR = 6;
    const plotW = rect.width - padL - padR;
    const stepX = points.length > 1 ? plotW / (points.length - 1) : plotW;
    const rel = event.clientX - rect.left - padL;
    const idx = Math.max(0, Math.min(points.length - 1, Math.round(rel / (stepX || 1))));
    draw(idx);
    const p = points[idx];
    showTip(canvas,
      `<b>${monthLabel(p.key, false)}</b><span>${num(p.n)} incidencia${p.n === 1 ? '' : 's'}</span>`,
      (event.clientX - rect.left) + 12,
      (event.clientY - rect.top) - 10);
  };
  canvas.addEventListener('mousemove', onMove);
  canvas.addEventListener('mouseleave', () => {
    draw();
    hideTip(canvas);
  });
}

/* -------------------------------- donut -------------------------------- */

export function drawDonut(canvas, parts, opts = {}) {
  if (!canvas) return;
  const draw = (hoverIndex = -1) => {
    const { ctx, w, h } = sizeCanvas(canvas);
    const c = colors(canvas);
    ctx.clearRect(0, 0, w, h);
    const total = parts.reduce((a, p) => a + p.n, 0);
    if (!total) {
      ctx.fillStyle = c.faint;
      ctx.font = '10px "IBM Plex Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Sin datos', w / 2, h / 2);
      return;
    }

    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.max(4, Math.min(w, h) / 2 - 6);
    const inner = Math.max(2, radius * 0.58);
    let angle = -Math.PI / 2;

    parts.forEach((p, i) => {
      const slice = (p.n / total) * Math.PI * 2;
      const alpha = hoverIndex === i ? 1 : 0.42 + (p.n / total) * 1.1;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, angle + 0.012, angle + slice - 0.012);
      ctx.arc(cx, cy, inner, angle + slice - 0.012, angle + 0.012, true);
      ctx.closePath();
      ctx.fillStyle = rgba(c.rgb, Math.min(1, alpha));
      ctx.fill();
      if (hoverIndex === i) {
        ctx.strokeStyle = c.hi;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      angle += slice;
    });

    // aro interior
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(1, inner - 2), 0, Math.PI * 2);
    ctx.strokeStyle = rgba(c.rgb, 0.22);
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = c.hi;
    ctx.font = 'bold 13px "IBM Plex Mono", monospace';
    ctx.fillText(num(total), cx, cy - 4);
    ctx.fillStyle = c.faint;
    ctx.font = '8px "IBM Plex Mono", monospace';
    ctx.fillText((opts.centerLabel || 'TOTAL').toUpperCase(), cx, cy + 9);

    // leyenda de porcentajes alrededor (sólo el mayor)
    const top = parts[0];
    if (top) {
      ctx.fillStyle = c.dim;
      ctx.font = '8px "IBM Plex Mono", monospace';
      ctx.fillText(`${Math.round((top.n / total) * 100)}% ${top.key}`.slice(0, 22), cx, cy + radius - 4);
    }
  };

  canvas._draw = draw;
  draw();
  if (canvas.dataset.hoverBound === '1') return;
  canvas.dataset.hoverBound = '1';

  canvas.addEventListener('mousemove', (event) => {
    const total = parts.reduce((a, p) => a + p.n, 0);
    if (!total) return;
    const rect = canvas.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const dx = event.clientX - rect.left - cx;
    const dy = event.clientY - rect.top - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const radius = Math.min(rect.width, rect.height) / 2 - 6;
    if (dist > radius || dist < radius * 0.55) {
      draw();
      hideTip(canvas);
      return;
    }
    let angle = Math.atan2(dy, dx) + Math.PI / 2;
    if (angle < 0) angle += Math.PI * 2;
    let acc = 0;
    let idx = -1;
    for (let i = 0; i < parts.length; i++) {
      acc += (parts[i].n / total) * Math.PI * 2;
      if (angle <= acc) { idx = i; break; }
    }
    if (idx < 0) return;
    draw(idx);
    const p = parts[idx];
    showTip(canvas,
      `<b>${p.key}</b><span>${num(p.n)} · ${Math.round((p.n / total) * 100)}%</span>`,
      event.clientX - rect.left + 12,
      event.clientY - rect.top - 10);
  });
  canvas.addEventListener('mouseleave', () => {
    draw();
    hideTip(canvas);
  });
}

/* ------------------------------ barras -------------------------------- */

export function drawWeekday(canvas, data) {
  if (!canvas) return;
  const { ctx, w, h } = sizeCanvas(canvas);
  const c = colors(canvas);
  ctx.clearRect(0, 0, w, h);
  if (!data.some((d) => d.n)) {
    ctx.fillStyle = c.faint;
    ctx.font = '10px "IBM Plex Mono", monospace';
    ctx.fillText('Sin datos', 8, h / 2);
    return;
  }
  const padT = 12;
  const padB = 16;
  const plotH = h - padT - padB;
  const max = Math.max(1, ...data.map((d) => d.n));
  const gap = 6;
  const bw = (w - gap * (data.length - 1)) / data.length;

  data.forEach((d, i) => {
    const x = i * (bw + gap);
    const bh = (d.n / max) * plotH;
    const y = padT + plotH - bh;
    const weekend = i === 0 || i === 6;
    ctx.fillStyle = rgba(c.rgb, weekend ? 0.28 : 0.62);
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(bw), Math.round(bh));
    ctx.fillStyle = weekend ? c.faint : c.phos;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(bw), 1.5);
    ctx.fillStyle = c.faint;
    ctx.font = '8px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(d.key, x + bw / 2, h - 4);
    if (d.n) {
      ctx.fillStyle = c.dim;
      ctx.font = '8px "IBM Plex Mono", monospace';
      ctx.fillText(num(d.n), x + bw / 2, y - 3);
    }
  });
}

/* ------------------------------- mini --------------------------------- */

export function drawSpark(canvas, values, opts = {}) {
  if (!canvas) return;
  const { ctx, w, h } = sizeCanvas(canvas);
  const c = colors(canvas);
  ctx.clearRect(0, 0, w, h);
  if (!values.length) return;
  const max = Math.max(1, ...values);
  ctx.beginPath();
  values.forEach((v, i) => {
    const x = (i / (values.length - 1 || 1)) * (w - 2) + 1;
    const y = h - 2 - (v / max) * (h - 4);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = opts.color || c.phos;
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

/** Redibuja todas las gráficas registradas (cambio de tema / tamaño). */
export function redrawAll(root = document) {
  root.querySelectorAll('canvas').forEach((canvas) => {
    if (typeof canvas._draw === 'function') canvas._draw();
  });
}

export { fmtDateLong };
