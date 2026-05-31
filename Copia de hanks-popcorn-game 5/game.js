/* ══════════════════════════════════════════════════
   HANK'S POPCORN — game.js v4
   Caída vertical, audio XHR, botón mute, anillos
══════════════════════════════════════════════════ */
"use strict";

/* ══════════════════════════════════════════════════
   SCREENS
══════════════════════════════════════════════════ */
const Screens = {
  go(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById('screen-' + id);
    if (el) el.classList.add('active');
  }
};

/* ══════════════════════════════════════════════════
   SOUND MANAGER — mute global, XHR loading
══════════════════════════════════════════════════ */
const SoundMgr = (() => {
  let muted = false;
  const btns = [];

  function setMuted(val) {
    muted = val;
    btns.forEach(b => {
      if (b) {
        b.textContent = muted ? '🔇' : '🔊';
        b.classList.toggle('muted', muted);
      }
    });
  }

  function toggle() { setMuted(!muted); }
  function isMuted() { return muted; }

  function registerBtn(el) {
    if (!el) return;
    btns.push(el);
    el.addEventListener('click', e => { e.stopPropagation(); toggle(); });
    el.addEventListener('touchend', e => { e.preventDefault(); e.stopPropagation(); toggle(); }, { passive: false });
  }

  return { toggle, isMuted, registerBtn, setMuted };
})();

/* ══════════════════════════════════════════════════
   AUDIO ENGINE
   Usa XMLHttpRequest para compatibilidad file://
   El AudioContext se crea y desbloquea en primer gesto
══════════════════════════════════════════════════ */
const AudioEng = (() => {
  let ctx = null;
  const buffers = {};
  let musicNode = null;
  let musicGain = null;
  let ctxReady  = false;

  /* Crear contexto en primer gesto del usuario */
  function createCtx() {
    if (ctx) return ctx;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      ctxReady = true;
    } catch(e) { ctx = null; }
    return ctx;
  }

  function resume() {
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  }

  /* Carga con XHR (funciona en file://) */
  function loadSound(name, url) {
    return new Promise(resolve => {
      const c = createCtx();
      if (!c) { resolve(); return; }

      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.responseType = 'arraybuffer';
      xhr.onload = () => {
        c.decodeAudioData(
          xhr.response,
          decoded => { buffers[name] = decoded; resolve(); },
          err     => { console.warn('decode error', name, err); resolve(); }
        );
      };
      xhr.onerror = () => { console.warn('XHR error loading', url); resolve(); };
      xhr.send();
    });
  }

  async function loadAll() {
    createCtx();
    await Promise.all([
      loadSound('bg',   'assets/sounds/background.mp3'),
      loadSound('pop',  'assets/sounds/pop.mp3'),
      loadSound('cd',   'assets/sounds/countdown.mp3'),
      loadSound('win',  'assets/sounds/victory.mp3'),
      loadSound('lose', 'assets/sounds/lose.mp3'),
    ]);
  }

  function play(name, vol) {
    if (SoundMgr.isMuted()) return null;
    if (!ctx || !buffers[name]) return null;
    resume();
    try {
      const src  = ctx.createBufferSource();
      const gain = ctx.createGain();
      src.buffer      = buffers[name];
      gain.gain.value = (vol !== undefined) ? vol : CONFIG.SFX_VOLUME;
      src.connect(gain);
      gain.connect(ctx.destination);
      src.start(0);
      return src;
    } catch(e) { return null; }
  }

  function startMusic() {
    stopMusic();
    if (SoundMgr.isMuted()) return;
    if (!ctx || !buffers['bg']) return;
    resume();
    try {
      musicNode = ctx.createBufferSource();
      musicGain = ctx.createGain();
      musicNode.buffer     = buffers['bg'];
      musicNode.loop       = true;
      musicGain.gain.value = CONFIG.MUSIC_VOLUME;
      musicNode.connect(musicGain);
      musicGain.connect(ctx.destination);
      musicNode.start(0);
    } catch(e) { musicNode = null; }
  }

  function stopMusic() {
    if (musicNode) {
      try { musicNode.stop(); } catch(e) {}
      musicNode = null;
    }
  }

  /* Llamar en primer gesto para desbloquear iOS */
  function unlock() {
    createCtx();
    resume();
    /* Reproducir y pausar buffer silencioso para desbloquear */
    if (ctx && ctx.state !== 'closed') {
      const buf = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
    }
  }

  return { loadAll, play, startMusic, stopMusic, unlock };
})();

/* ══════════════════════════════════════════════════
   IMÁGENES
══════════════════════════════════════════════════ */
const Images = (() => {
  const cache = {};
  function load(name, src) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload  = () => { cache[name] = img; resolve(); };
      img.onerror = () => resolve();
      img.src = src;
    });
  }
  async function loadAll() {
    await Promise.all([
      load('logo',   'assets/images/logo.png'),
      load('bag',    'assets/images/bolsa.png'),
      load('bagSpe', 'assets/images/bolsa-dorada.png'),
    ]);
  }
  function get(name) { return cache[name] || null; }
  return { loadAll, get };
})();

/* ══════════════════════════════════════════════════
   ANILLOS GIRATORIOS
══════════════════════════════════════════════════ */
const Rings = (() => {
  const defs = [
    { cx:.5, cy:.38, baseR:.44, count:5, gap:28, speed: .016, dir:1,  phase:0   },
    { cx:.5, cy:.68, baseR:.30, count:4, gap:22, speed: .011, dir:-1, phase:1.1 },
    { cx:.5, cy:.14, baseR:.20, count:3, gap:18, speed: .019, dir:1,  phase:2.4 },
  ];
  let popcorn = false;
  let rafId   = null;

  function drawOn(canvas) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const spMult  = popcorn ? 2.0 : 1;
    const alMult  = popcorn ? 1.4 : 1;

    defs.forEach(d => {
      const cx = W * d.cx, cy = H * d.cy;
      const baseR = Math.min(W, H) * d.baseR;
      for (let i = 0; i < d.count; i++) {
        const r = baseR - i * d.gap;
        if (r < 8) continue;
        const a = Math.max(0, (.16 - i * .028) * alMult);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(d.phase + i * .28);
        ctx.strokeStyle = `rgba(200,149,42,${a.toFixed(3)})`;
        ctx.lineWidth = 1.4;
        ctx.shadowColor = 'rgba(200,149,42,.22)';
        ctx.shadowBlur  = popcorn ? 10 : 4;
        ctx.beginPath();
        ctx.ellipse(0, 0, r, r * .9, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    });
  }

  function tick() {
    rafId = requestAnimationFrame(tick);
    const spMult = popcorn ? 2.0 : 1;
    defs.forEach(d => { d.phase += d.speed * d.dir * spMult; });

    document.querySelectorAll('.rings-canvas').forEach(c => {
      /* solo dibujar si la pantalla está activa (visible) */
      const screen = c.closest('.screen');
      if (screen && screen.classList.contains('active')) {
        c.width  = c.offsetWidth  || window.innerWidth;
        c.height = c.offsetHeight || window.innerHeight;
        drawOn(c);
      }
    });
  }

  function init() {
    if (!rafId) tick();
    window.addEventListener('resize', () => {
      document.querySelectorAll('.rings-canvas').forEach(c => {
        c.width  = c.offsetWidth  || window.innerWidth;
        c.height = c.offsetHeight || window.innerHeight;
      });
    });
  }

  function setPopcorn(v) { popcorn = v; }

  return { init, setPopcorn };
})();

/* ══════════════════════════════════════════════════
   PARTÍCULAS
══════════════════════════════════════════════════ */
const Particles = (() => {
  let canvas, ctx, pts = [];

  function init() {
    canvas = document.getElementById('vfxCanvas');
    ctx    = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    loop();
  }

  function resize() {
    if (!canvas) return;
    canvas.width  = canvas.offsetWidth  || window.innerWidth;
    canvas.height = canvas.offsetHeight || window.innerHeight;
  }

  function burst(x, y, gold) {
    const cols = gold
      ? ['#f0b429','#ffe082','#c8952a','#fff','#ff8c00']
      : ['#f5e6c8','#c8952a','#fff','#f0b429'];
    const n = gold ? 22 : 14;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (Math.random() - .5) * .7;
      const s = 3 + Math.random() * 5.5;
      pts.push({
        x, y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s - 2.6,
        r:  gold ? 3.5 + Math.random() * 3.5 : 2 + Math.random() * 3,
        al: 1, col: cols[i % cols.length], grav: .29,
      });
    }
  }

  function loop() {
    requestAnimationFrame(loop);
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pts = pts.filter(p => p.al > .02 && p.r > .05);
    pts.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      p.vy += p.grav; p.vx *= .96;
      p.al -= .03; p.r -= .042;
      ctx.save();
      ctx.globalAlpha = p.al;
      ctx.fillStyle   = p.col;
      ctx.shadowColor = p.col;
      ctx.shadowBlur  = 5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0, p.r), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  return { init, burst, resize };
})();

/* ══════════════════════════════════════════════════
   CONFETTI
══════════════════════════════════════════════════ */
function launchConfetti(big) {
  const layer = document.getElementById('confettiLayer');
  layer.innerHTML = '';
  const cols = ['#f0b429','#c8952a','#f5e6c8','#fff','#e03010','#3d1608','#ff8c00'];
  const n = big ? 90 : 40;
  for (let i = 0; i < n; i++) {
    const el = document.createElement('div');
    el.className = 'cp';
    const sz = 6 + Math.random() * 9;
    el.style.cssText = `
      left:${Math.random()*100}%;
      width:${sz}px;height:${sz}px;
      background:${cols[i%cols.length]};
      border-radius:${Math.random()>.5?'50%':'3px'};
      animation-duration:${1.8+Math.random()*2.2}s;
      animation-delay:${Math.random()*1.3}s;
    `;
    layer.appendChild(el);
  }
}

/* ══════════════════════════════════════════════════
   BOLSAS DECORATIVAS (pantalla inicio)
══════════════════════════════════════════════════ */
function setupDecoBags() {
  const layer = document.getElementById('decoLayer');
  if (!layer) return;
  layer.innerHTML = '';
  const imgB = Images.get('bag');
  const imgS = Images.get('bagSpe');
  if (!imgB) return;
  for (let i = 0; i < 6; i++) {
    const el = document.createElement('img');
    el.className = 'deco-bag';
    el.src = (i % 5 === 0 && imgS) ? imgS.src : imgB.src;
    const sz  = 38 + Math.random() * 46;
    const rot = (Math.random() - .5) * 22;
    el.style.cssText = `
      left:${5 + Math.random()*88}%;
      width:${sz}px;height:auto;
      --rot:${rot}deg;
      animation-duration:${9+Math.random()*11}s;
      animation-delay:${-Math.random()*20}s;
    `;
    layer.appendChild(el);
  }
}

/* ══════════════════════════════════════════════════
   NÚCLEO DEL JUEGO
══════════════════════════════════════════════════ */
const Game = (() => {
  let score = 0, caught = 0, caughtSpe = 0;
  let timeLeft = 0, running = false;
  let popcornActive = false, popcornTriggered = false;
  let timerInterval = null, spawnTO = null, rafId = null, lastTs = 0;
  let bagId = 0;

  let fallArea, ptsLayer, gameScreen;
  let areaW = 0, areaH = 0;
  const bags = new Map(); // id → { el, vy, y, isSpe, rot }

  function measure() {
    const r = fallArea.getBoundingClientRect();
    areaW = r.width  || window.innerWidth;
    areaH = r.height || (window.innerHeight - 76);
  }

  /* ─── HUD ─────────────────────────────────────── */
  function refreshHUD() {
    const se = document.getElementById('scoreDisplay');
    se.textContent = score;
    se.classList.remove('pop'); void se.offsetWidth; se.classList.add('pop');
    document.getElementById('caughtDisplay').textContent = caught;
    document.getElementById('timerNum').textContent      = timeLeft;

    const circ = 182.2;
    const off  = circ * (1 - timeLeft / CONFIG.GAME_DURATION);
    const ring = document.getElementById('timerRing');
    ring.style.strokeDashoffset = off;
    ring.classList.toggle('danger', timeLeft <= 5);
  }

  /* ─── Spawn ───────────────────────────────────── */
  function spawnBag() {
    if (!running) return;
    measure();
    const maxB = popcornActive ? CONFIG.MAX_BAGS_POPCORN : CONFIG.MAX_BAGS_NORMAL;
    if (bags.size >= maxB) { scheduleSpawn(); return; }

    const isSpe = Math.random() < (popcornActive ? CONFIG.SPECIAL_PROB_POPCORN : CONFIG.SPECIAL_PROB_NORMAL);
    const imgEl = isSpe ? Images.get('bagSpe') : Images.get('bag');

    const bw     = Math.round(areaW * CONFIG.BAG_W_RATIO);
    const aspect = (imgEl && imgEl.naturalHeight) ? (imgEl.naturalHeight / imgEl.naturalWidth) : 1.6;
    const bh     = Math.round(bw * aspect);

    const x   = 8 + Math.random() * Math.max(1, areaW - bw - 16);
    const rot = (Math.random() - .5) * 2 * CONFIG.BAG_ROT_MAX_DEG;

    /* Velocidad: base + boost progresivo según tiempo transcurrido */
    let vMin = CONFIG.FALL_SPEED_MIN, vMax = CONFIG.FALL_SPEED_MAX;
    if (popcornActive) { vMin = CONFIG.FALL_SPEED_POPCORN_MIN; vMax = CONFIG.FALL_SPEED_POPCORN_MAX; }
    const elapsed = CONFIG.GAME_DURATION - timeLeft;
    const boost   = popcornActive ? 0 : Math.min(elapsed * 7, 100);
    const vy = vMin + boost + Math.random() * (vMax - vMin);

    const el = document.createElement('div');
    el.className = 'bag-item' + (isSpe ? ' is-special' : '');
    el.style.cssText = `
      width:${bw}px;height:${bh}px;
      left:${x}px;top:${-bh - 10}px;
      --rot:${rot}deg;
      transform:rotate(${rot}deg);
    `;

    const img = document.createElement('img');
    img.src = imgEl ? imgEl.src : ('assets/images/' + (isSpe ? 'bolsa-dorada.png' : 'bolsa.png'));
    img.alt = '';
    el.appendChild(img);
    fallArea.appendChild(el);

    const id = ++bagId;
    el.dataset.id = id;
    bags.set(id, { el, vy, y: -bh - 10, w: bw, h: bh, rot, isSpe });

    el.addEventListener('touchstart', onTap, { passive: false, once: true });
    el.addEventListener('mousedown',  onTap, { once: true });

    scheduleSpawn();
  }

  function scheduleSpawn() {
    if (!running) return;
    let ms;
    const elapsed = CONFIG.GAME_DURATION - timeLeft;
    if (popcornActive)   ms = CONFIG.SPAWN_MS_POPCORN;
    else if (elapsed < 10) ms = CONFIG.SPAWN_MS_PHASE1;
    else                   ms = CONFIG.SPAWN_MS_PHASE2;
    ms *= (.72 + Math.random() * .56);
    spawnTO = setTimeout(spawnBag, ms);
  }

  /* ─── Loop de física ──────────────────────────── */
  function animLoop(ts) {
    if (!running) return;
    rafId = requestAnimationFrame(animLoop);
    const dt = Math.min((ts - lastTs) / 1000, .055);
    lastTs = ts;

    bags.forEach((bag, id) => {
      bag.y += bag.vy * dt;
      bag.el.style.top = bag.y + 'px';
      if (bag.y > areaH + 30) removeBag(id, false);
    });
  }

  /* ─── Remover bolsa ───────────────────────────── */
  function removeBag(id, tapped) {
    const bag = bags.get(id);
    if (!bag) return;
    bags.delete(id);
    bag.el.removeEventListener('touchstart', onTap);
    bag.el.removeEventListener('mousedown',  onTap);
    if (tapped) {
      bag.el.classList.add('tapped');
      setTimeout(() => { if (bag.el.parentNode) bag.el.remove(); }, 250);
    } else {
      bag.el.remove();
    }
  }

  /* ─── Toque ───────────────────────────────────── */
  function onTap(e) {
    e.preventDefault();
    AudioEng.unlock();

    const el  = e.currentTarget;
    const id  = parseInt(el.dataset.id);
    const bag = bags.get(id);
    if (!bag) return;

    removeBag(id, true);

    const pts = bag.isSpe ? CONFIG.POINTS_SPECIAL : CONFIG.POINTS_NORMAL;
    score  += pts;
    caught += 1;
    if (bag.isSpe) caughtSpe += 1;
    refreshHUD();

    /* Coordenadas en el fall-area para partículas y puntos */
    const bagRect  = el.getBoundingClientRect();
    const areaRect = fallArea.getBoundingClientRect();
    const cx = bagRect.left - areaRect.left + bagRect.width  / 2;
    const cy = bagRect.top  - areaRect.top  + bagRect.height / 2;

    Particles.burst(cx, cy, bag.isSpe);
    showPoints(cx, cy, '+' + pts, bag.isSpe);

    /* Flash */
    const fl = document.createElement('div');
    fl.className = 'tap-flash';
    document.body.appendChild(fl);
    setTimeout(() => fl.remove(), 160);

    if (popcornActive) {
      const ho = document.createElement('div');
      ho.className = 'hot-overlay';
      document.body.appendChild(ho);
      setTimeout(() => ho.remove(), 320);
    }

    AudioEng.play('pop');
  }

  /* ─── Puntos flotantes ────────────────────────── */
  function showPoints(x, y, text, spe) {
    const el = document.createElement('span');
    el.className = 'float-pt' + (spe ? ' spe' : '');
    el.textContent = text;
    el.style.left = (x - 22) + 'px';
    el.style.top  = (y - 14) + 'px';
    ptsLayer.appendChild(el);
    setTimeout(() => { if (el.parentNode) el.remove(); }, 780);
  }

  /* ─── Modo Popcorn ────────────────────────────── */
  function triggerPopcorn() {
    if (popcornTriggered) return;
    popcornTriggered = true; popcornActive = true;
    Rings.setPopcorn(true);
    gameScreen.classList.add('popcorn-mode');

    const banner = document.getElementById('popcornBanner');
    banner.classList.add('show');
    setTimeout(() => banner.classList.remove('show'), 1300);

    AudioEng.play('cd');
    for (let i = 0; i < 3; i++) setTimeout(spawnBag, i * 160);
  }

  /* ─── Countdown ───────────────────────────────── */
  function runCountdown() {
    return new Promise(resolve => {
      const wrap = document.getElementById('countdownWrap');
      const num  = document.getElementById('countdownNum');
      wrap.classList.add('visible');
      const steps = ['3','2','1','¡YA!'];
      let i = 0;
      function next() {
        if (i >= steps.length) { wrap.classList.remove('visible'); resolve(); return; }
        num.textContent = steps[i++];
        num.style.animation = 'none'; void num.offsetWidth; num.style.animation = '';
        setTimeout(next, steps[i-1] === '¡YA!' ? 480 : 680);
      }
      next();
    });
  }

  /* ─── START ───────────────────────────────────── */
  async function start() {
    score = 0; caught = 0; caughtSpe = 0;
    timeLeft = CONFIG.GAME_DURATION;
    popcornActive = false; popcornTriggered = false;
    running = false;

    clearInterval(timerInterval); clearTimeout(spawnTO);
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }

    fallArea.innerHTML = '';
    ptsLayer.innerHTML = '';
    bags.clear();
    gameScreen.classList.remove('popcorn-mode');
    Rings.setPopcorn(false);
    document.getElementById('timerRing').classList.remove('danger');
    refreshHUD();
    Particles.resize();
    measure();
    Screens.go('game');

    await runCountdown();

    AudioEng.unlock();
    AudioEng.startMusic();
    running = true;
    lastTs  = performance.now();
    rafId   = requestAnimationFrame(animLoop);

    timerInterval = setInterval(() => {
      if (!running) return;
      timeLeft = Math.max(0, timeLeft - 1);
      refreshHUD();
      if (timeLeft === CONFIG.POPCORN_MODE_AT && !popcornTriggered) triggerPopcorn();
      if (timeLeft <= 0) endGame();
    }, 1000);

    spawnBag();
  }

  /* ─── FIN ─────────────────────────────────────── */
  function endGame() {
    running = false;
    clearInterval(timerInterval); clearTimeout(spawnTO);
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    AudioEng.stopMusic();
    Rings.setPopcorn(false);
    gameScreen.classList.remove('popcorn-mode');
    bags.forEach((bag) => { bag.el.classList.add('gone'); setTimeout(() => bag.el.remove(), 280); });
    bags.clear();
    setTimeout(showResult, 680);
  }

  /* ─── RESULTADO ───────────────────────────────── */
  function showResult() {
    const won = score >= CONFIG.WINNING_SCORE;
    document.getElementById('resultWin').style.display  = won  ? 'flex' : 'none';
    document.getElementById('resultLose').style.display = !won ? 'flex' : 'none';
    document.getElementById('prizeNameTxt').textContent = CONFIG.PRIZE_NAME;
    document.getElementById('finalScore').textContent   = score;
    document.getElementById('finalCaught').textContent  = caught;
    document.getElementById('finalSpecial').textContent = caughtSpe;
    Screens.go('result');
    launchConfetti(won);
    AudioEng.play(won ? 'win' : 'lose');
  }

  /* ─── Init ────────────────────────────────────── */
  function init() {
    fallArea   = document.getElementById('fallArea');
    ptsLayer   = document.getElementById('ptsLayer');
    gameScreen = document.getElementById('screen-game');
    measure();
    window.addEventListener('resize', () => { measure(); Particles.resize(); });
  }

  return { init, start };
})();

/* ══════════════════════════════════════════════════
   BOOTSTRAP
══════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {

  /* Bloquear scroll/zoom/context */
  document.addEventListener('touchmove',    e => e.preventDefault(), { passive: false });
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('contextmenu',  e => e.preventDefault());

  /* ── Registrar botones de sonido ─────────────── */
  SoundMgr.registerBtn(document.getElementById('soundBtnStart'));
  SoundMgr.registerBtn(document.getElementById('soundBtnGame'));
  SoundMgr.registerBtn(document.getElementById('soundBtnResult'));

  /* ── Pantalla de carga ───────────────────────── */
  Screens.go('loading');
  const bar = document.getElementById('loadBar');
  const lbl = document.getElementById('loadLabel');

  let pct = 0;
  const progInt = setInterval(() => {
    pct = Math.min(pct + 2.5, 84);
    bar.style.width = pct + '%';
  }, 35);

  await Promise.all([Images.loadAll(), AudioEng.loadAll()]);

  clearInterval(progInt);
  bar.style.width = '100%';
  lbl.textContent = '¡Listo!';
  await new Promise(r => setTimeout(r, 300));

  /* ── Textos dinámicos ────────────────────────── */
  document.getElementById('txtDuration').textContent = CONFIG.GAME_DURATION;
  document.getElementById('txtTarget').textContent   = CONFIG.WINNING_SCORE;
  document.getElementById('txtPrize').textContent    = CONFIG.PRIZE_NAME;

  /* ── Init módulos ────────────────────────────── */
  Game.init();
  Particles.init();
  Rings.init();
  setupDecoBags();

  Screens.go('start');

  /* ── Función arranque ────────────────────────── */
  function startGame() {
    AudioEng.unlock();
    try {
      const el = document.documentElement;
      (el.requestFullscreen || el.webkitRequestFullscreen || function(){}).call(el);
    } catch(e) {}
    Game.start();
  }

  document.getElementById('btnPlay').addEventListener('click', startGame);
  document.getElementById('btnRetry').addEventListener('click', () => {
    AudioEng.unlock();
    Game.start();
  });

  /* ── Wake lock ───────────────────────────────── */
  if ('wakeLock' in navigator) {
    navigator.wakeLock.request('screen').catch(() => {});
  }
});
