/**
 * Turboincidencias 3000 — detalles físicos, secretos y salvapantallas.
 * Todo vive en el navegador: ninguna de estas interacciones toca los datos.
 */

const THEMES = [
  ['amber', 'ámbar'],
  ['green', 'verde'],
  ['ice', 'azul'],
  ['bone', 'hueso']
];

const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];

export function initEaster({
  screen, monitor, glass, sound, toast, pushLog, getSettings, setSetting, isPowered
}) {
  const $ = (sel, root = document) => root.querySelector(sel);
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let turboTimer = 0;
  let degaussTimer = 0;

  /* ---------------- teclado físico ---------------- */
  const keyboard = $('#keyboard');
  const caps = new Map();
  keyboard?.querySelectorAll('i[data-key]').forEach((cap) => caps.set(cap.dataset.key, cap));

  const lightCap = (cap) => {
    if (!cap) return;
    cap.classList.add('is-lit', 'is-down');
    clearTimeout(cap._lit1);
    clearTimeout(cap._lit2);
    cap._lit1 = setTimeout(() => cap.classList.remove('is-down'), 90);
    cap._lit2 = setTimeout(() => cap.classList.remove('is-lit'), 180);
  };

  const capFor = (event) => {
    if (event.code === 'Space') return caps.get('espacio');
    if (event.key === 'Backspace') return caps.get('borrar');
    if (event.key === 'Tab') return caps.get('tab');
    if (event.key === 'Escape') return caps.get('esc');
    if (event.key === 'Enter') return caps.get('enter');
    if (event.key.length === 1) return caps.get(event.key.toLowerCase());
    return null;
  };

  document.addEventListener('keydown', (event) => {
    const cap = capFor(event);
    if (cap) {
      lightCap(cap);
      sound.play('key');
    }
  }, { passive: true });

  keyboard?.addEventListener('pointerdown', (event) => {
    const cap = event.target.closest('i');
    if (!cap) return;
    lightCap(cap);
    sound.play('key');
  });

  /* ---------------- ratón de la mesa ---------------- */
  const deskMouse = $('#deskMouse');
  deskMouse?.addEventListener('click', () => {
    deskMouse.classList.add('is-click');
    setTimeout(() => deskMouse.classList.remove('is-click'), 140);
    sound.play('click');
  });

  /* ---------------- degauss ---------------- */
  function degauss(quiet = false) {
    clearTimeout(degaussTimer);
    screen.classList.remove('is-degauss');
    void screen.offsetWidth;
    screen.classList.add('is-degauss');
    degaussTimer = setTimeout(() => screen.classList.remove('is-degauss'), 560);
    sound.play('degauss');
    if (!quiet) {
      toast('Degauss · máscara de sombra estabilizada');
      pushLog('info', 'Degauss aplicado al tubo');
    }
  }

  $('#brandPlate')?.addEventListener('click', () => degauss());
  monitor?.querySelector('.monitor__bezel')?.addEventListener('dblclick', (event) => {
    if (event.target.closest('.screen')) return;
    degauss();
  });

  /* ---------------- LED: cambia el fósforo ---------------- */
  $('#led')?.addEventListener('click', () => {
    const current = getSettings().theme;
    const index = Math.max(0, THEMES.findIndex(([id]) => id === current));
    const [next, label] = THEMES[(index + 1) % THEMES.length];
    setSetting('theme', next);
    toast(`Fósforo ${label} · P1`, 'ok');
  });

  /* ---------------- mandos del chasis ---------------- */
  $('#miniScan')?.addEventListener('click', () => {
    const value = !getSettings().scanlines;
    setSetting('scanlines', value);
    toast(value ? 'Scanlines activadas' : 'Scanlines desactivadas');
  });
  $('#miniSound')?.addEventListener('click', () => {
    const value = !getSettings().sound;
    setSetting('sound', value);
    toast(value ? 'Sonido del tubo activado' : 'Sonido silenciado');
  });

  /* ---------------- modo turbo (Konami) ---------------- */
  function turbo() {
    if (screen.classList.contains('is-turbo')) return;
    clearTimeout(turboTimer);
    screen.classList.add('is-turbo');
    const badge = document.createElement('div');
    badge.className = 'turbo-badge';
    badge.textContent = 'TURBO · 3000';
    screen.appendChild(badge);
    sound.play('turbo');
    toast('MODO TURBO · 3000 % de rendimiento', 'ok');
    pushLog('ok', 'Código Konami detectado: modo turbo');
    turboTimer = setTimeout(() => {
      screen.classList.remove('is-turbo');
      badge.remove();
    }, 9000);
  }

  let seq = 0;
  window.addEventListener('keydown', (event) => {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (key === KONAMI[seq]) {
      seq += 1;
      if (seq === KONAMI.length) {
        seq = 0;
        event.preventDefault();
        event.stopImmediatePropagation();
        turbo();
      }
    } else {
      seq = key === KONAMI[0] ? 1 : 0;
    }
  }, true);

  /* ---------------- salvapantallas de fósforo ---------------- */
  const saver = $('#saver');
  const canvas = $('#saverCanvas');
  const ctx = canvas?.getContext('2d');
  const bootDone = () => $('#boot')?.classList.contains('is-done');
  const IDLE_MS = 52000;

  let saverOn = false;
  let idleTimer = 0;
  let raf = 0;
  let lastFrame = 0;
  let stars = [];

  function sizeCanvas() {
    if (!canvas || !ctx) return { w: 0, h: 0 };
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(320, Math.round(rect.width * dpr));
    canvas.height = Math.max(240, Math.round(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    stars = Array.from({ length: 130 }, () => ({
      x: Math.random() * rect.width,
      y: Math.random() * rect.height,
      z: Math.random() * 0.85 + 0.15
    }));
    return { w: rect.width, h: rect.height };
  }

  function frame(now) {
    if (!saverOn) return;
    const dt = lastFrame ? Math.min(48, now - lastFrame) : 16;
    lastFrame = now;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.fillStyle = '#030201';
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    for (const star of stars) {
      star.z -= dt * 0.00016;
      if (star.z <= 0.06) {
        star.x = Math.random() * w;
        star.y = Math.random() * h;
        star.z = 1;
      }
      const k = 1 / star.z;
      const x = cx + (star.x - cx) * k;
      const y = cy + (star.y - cy) * k;
      if (x < -12 || x > w + 12 || y < -12 || y > h + 12) {
        star.x = Math.random() * w;
        star.y = Math.random() * h;
        star.z = 1;
        continue;
      }
      const size = Math.max(1, Math.min(3, (1 - star.z) * 3));
      ctx.fillStyle = `rgba(240, 166, 60, ${0.16 + (1 - star.z) * 0.7})`;
      ctx.fillRect(x | 0, y | 0, Math.round(size), Math.round(size));
    }

    const size = Math.max(15, Math.min(46, w * 0.046));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${size}px "Silkscreen", monospace`;
    ctx.fillStyle = 'rgba(240, 166, 60, .92)';
    ctx.fillText('TURBO/OS', cx, cy - size * 0.12);
    ctx.font = `${Math.max(8, Math.round(size * 0.34))}px "IBM Plex Mono", monospace`;
    ctx.fillStyle = 'rgba(240, 166, 60, .5)';
    ctx.fillText('SISTEMA EN ESPERA · v3.0', cx, cy + size * 0.82);

    raf = requestAnimationFrame(frame);
  }

  function startSaver() {
    if (saverOn || reduce || document.hidden || !isPowered()) return;
    if (!bootDone() || !canvas || !ctx) return;
    if (screen.classList.contains('is-off')) return;
    saver.classList.add('is-on');
    saverOn = true;
    sizeCanvas();
    lastFrame = 0;
    raf = requestAnimationFrame(frame);
  }

  function wakeSaver() {
    if (!saverOn) return;
    saverOn = false;
    saver.classList.remove('is-on');
    cancelAnimationFrame(raf);
  }

  let lastActivity = 0;
  function scheduleSaver() {
    clearTimeout(idleTimer);
    if (document.hidden || reduce) return;
    idleTimer = setTimeout(startSaver, IDLE_MS);
  }

  function onActivity() {
    if (saverOn) {
      wakeSaver();
      lastActivity = 0;
    }
    const now = performance.now();
    if (now - lastActivity > 1200) {
      lastActivity = now;
      scheduleSaver();
    }
  }

  ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'].forEach((type) => {
    window.addEventListener(type, onActivity, { passive: true });
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearTimeout(idleTimer);
    else scheduleSaver();
  });
  window.addEventListener('resize', () => {
    if (saverOn) sizeCanvas();
  });
  scheduleSaver();

  return {
    degauss,
    turbo,
    saver: { start: startSaver, wake: wakeSaver, schedule: scheduleSaver, get isOn() { return saverOn; } }
  };
}
