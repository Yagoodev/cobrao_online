/**
 * Cobrinha - jogo da cobrinha em canvas 2D.
 * Grid fixo, passo em intervalo constante e render interpolado para o
 * movimento ficar suave mesmo com o passo lento.
 */
(() => {
  'use strict';

  const COLS = 21;
  const ROWS = 21;
  const BASE_STEP = 150;   // ms por passo no inicio
  const MIN_STEP = 70;     // limite de velocidade
  const STEP_DECAY = 4;    // ms a menos por comida
  const BEST_KEY = 'cobrinha:recorde';

  const DIRS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 }
  };

  const KEY_MAP = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', a: 'left', s: 'down', d: 'right',
    W: 'up', A: 'left', S: 'down', D: 'right'
  };

  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlayTitle');
  const overlayText = document.getElementById('overlayText');
  const playBtn = document.getElementById('playBtn');

  const state = {
    phase: 'ready',      // ready | running | paused | over
    snake: [],
    prev: [],            // posicoes do passo anterior (interpolacao)
    dir: DIRS.right,
    queue: [],           // direcoes bufferizadas do input
    food: { x: 0, y: 0 },
    score: 0,
    best: readBest(),
    step: BASE_STEP,
    acc: 0,
    last: 0,
    particles: [],
    shake: 0,
    time: 0
  };

  let cell = 0;

  /* ---------------------------------------------------------------- setup */

  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return;

    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);

    cell = rect.width / COLS;

    // Escrever width/height limpa o canvas e o transform, entao so mexe se mudou
    if (canvas.width === w && canvas.height === h) return;

    canvas.width = w;
    canvas.height = h;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function reset() {
    const cx = Math.floor(COLS / 2);
    const cy = Math.floor(ROWS / 2);

    state.snake = [
      { x: cx, y: cy },
      { x: cx - 1, y: cy },
      { x: cx - 2, y: cy }
    ];
    state.prev = state.snake.map(p => ({ ...p }));
    state.dir = DIRS.right;
    state.queue = [];
    state.score = 0;
    state.step = BASE_STEP;
    state.acc = 0;
    state.particles = [];
    state.shake = 0;
    placeFood();
    updateHud();
  }

  function placeFood() {
    const free = [];

    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (!state.snake.some(p => p.x === x && p.y === y)) free.push({ x, y });
      }
    }

    if (free.length) state.food = free[(Math.random() * free.length) | 0];
  }

  /* ----------------------------------------------------------- fluxo/HUD */

  function setPhase(phase) {
    state.phase = phase;

    if (phase === 'running') {
      overlay.hidden = true;
      return;
    }

    overlay.hidden = false;

    if (phase === 'ready') {
      overlayTitle.textContent = 'Pronto?';
      overlayText.textContent = 'Use as setas ou WASD para mover a cobrinha.';
      playBtn.textContent = 'Jogar';
    } else if (phase === 'paused') {
      overlayTitle.textContent = 'Pausado';
      overlayText.textContent = 'Respira fundo. O placar continua onde parou.';
      playBtn.textContent = 'Continuar';
    } else if (phase === 'over') {
      const recorde = state.score > 0 && state.score >= state.best;
      overlayTitle.textContent = recorde ? 'Novo recorde!' : 'Fim de jogo';
      overlayText.textContent = 'Você fez ' + state.score +
        (state.score === 1 ? ' ponto.' : ' pontos.');
      playBtn.textContent = 'Jogar de novo';
    }
  }

  function start() {
    reset();
    setPhase('running');
  }

  function togglePause() {
    if (state.phase === 'running') setPhase('paused');
    else if (state.phase === 'paused') setPhase('running');
  }

  function play() {
    if (state.phase === 'paused') setPhase('running');
    else start();
  }

  function die() {
    state.shake = 14;
    state.best = Math.max(state.best, state.score);
    writeBest(state.best);
    updateHud();
    setPhase('over');
  }

  function updateHud() {
    scoreEl.textContent = String(state.score);
    bestEl.textContent = String(state.best);
  }

  function readBest() {
    try {
      return Number(localStorage.getItem(BEST_KEY)) || 0;
    } catch (err) {
      return 0;
    }
  }

  function writeBest(value) {
    try {
      localStorage.setItem(BEST_KEY, String(value));
    } catch (err) {
      /* storage bloqueado: o recorde vale so nesta sessao */
    }
  }

  /* ---------------------------------------------------------------- input */

  function push(name) {
    const dir = DIRS[name];
    if (!dir) return;

    if (state.phase === 'ready' || state.phase === 'over') start();
    else if (state.phase === 'paused') setPhase('running');

    if (state.queue.length < 2) state.queue.push(dir);
  }

  document.addEventListener('keydown', e => {
    const name = KEY_MAP[e.key];

    if (name) {
      e.preventDefault();
      push(name);
      return;
    }

    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      if (state.phase === 'ready' || state.phase === 'over') start();
      else togglePause();
      return;
    }

    if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      start();
    }
  });

  playBtn.addEventListener('click', play);

  document.querySelectorAll('[data-dir]').forEach(btn => {
    btn.addEventListener('pointerdown', e => {
      e.preventDefault();
      push(btn.dataset.dir);
    });
  });

  // Swipe / toque no tabuleiro
  let touchStart = null;

  canvas.addEventListener('pointerdown', e => {
    touchStart = { x: e.clientX, y: e.clientY };
  });

  canvas.addEventListener('pointerup', e => {
    if (!touchStart) return;

    const dx = e.clientX - touchStart.x;
    const dy = e.clientY - touchStart.y;
    touchStart = null;

    if (Math.hypot(dx, dy) < 24) {
      if (state.phase !== 'running') play();
      return;
    }

    if (Math.abs(dx) > Math.abs(dy)) push(dx > 0 ? 'right' : 'left');
    else push(dy > 0 ? 'down' : 'up');
  });

  window.addEventListener('blur', () => {
    if (state.phase === 'running') setPhase('paused');
  });

  window.addEventListener('resize', resize);

  // O canvas muda de tamanho por layout, nao so por resize da janela
  if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);

  /* ----------------------------------------------------------- simulacao */

  function stepGame() {
    // Consome o input mais antigo que muda de fato a direcao
    while (state.queue.length) {
      const d = state.queue.shift();
      const same = d.x === state.dir.x && d.y === state.dir.y;
      const reverse = d.x === -state.dir.x && d.y === -state.dir.y;

      if (same || reverse) continue;
      state.dir = d;
      break;
    }

    const head = state.snake[0];
    const nx = head.x + state.dir.x;
    const ny = head.y + state.dir.y;

    if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) {
      die();
      return;
    }

    const eating = nx === state.food.x && ny === state.food.y;
    // A ponta da cauda sai da celula no mesmo passo, entao nao colide
    const body = eating ? state.snake : state.snake.slice(0, -1);

    if (body.some(p => p.x === nx && p.y === ny)) {
      die();
      return;
    }

    state.prev = state.snake.map(p => ({ ...p }));
    state.snake.unshift({ x: nx, y: ny });

    if (eating) {
      state.score += 1;
      state.step = Math.max(MIN_STEP, state.step - STEP_DECAY);
      state.shake = 4;
      burst(nx, ny);
      placeFood();
      updateHud();
    } else {
      state.snake.pop();
    }
  }

  function burst(x, y) {
    for (let i = 0; i < 14; i++) {
      const angle = (Math.PI * 2 * i) / 14 + Math.random() * 0.4;
      const speed = 0.04 + Math.random() * 0.07;

      state.particles.push({
        x: x + 0.5,
        y: y + 0.5,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1
      });
    }
  }

  function updateParticles(dt) {
    const f = dt / 16.67;

    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.x += p.vx * f;
      p.y += p.vy * f;
      p.vx *= 0.93;
      p.vy *= 0.93;
      p.life -= 0.03 * f;

      if (p.life <= 0) state.particles.splice(i, 1);
    }

    if (state.shake > 0) state.shake = Math.max(0, state.shake - 0.6 * f);
  }

  /* -------------------------------------------------------------- render */

  const lerp = (a, b, t) => a + (b - a) * t;

  function segmentPoints(t) {
    const points = [];

    for (let i = 0; i < state.snake.length; i++) {
      const to = state.snake[i];
      const from = state.prev[i] || state.prev[state.prev.length - 1] || to;

      points.push({
        x: (lerp(from.x, to.x, t) + 0.5) * cell,
        y: (lerp(from.y, to.y, t) + 0.5) * cell
      });
    }

    return points;
  }

  function drawGrid(w, h) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.016)';

    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if ((x + y) % 2 === 0) ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }

    ctx.strokeStyle = 'rgba(74, 222, 128, 0.10)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, w - 2, h - 2);
  }

  function drawFood() {
    const pulse = 1 + Math.sin(state.time / 220) * 0.08;
    const cx = (state.food.x + 0.5) * cell;
    const cy = (state.food.y + 0.5) * cell;
    const r = cell * 0.3 * pulse;

    ctx.save();
    ctx.shadowColor = 'rgba(251, 113, 133, 0.75)';
    ctx.shadowBlur = cell * 0.9;
    ctx.fillStyle = '#fb7185';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.beginPath();
    ctx.arc(cx - r * 0.3, cy - r * 0.35, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawSnake(t) {
    const points = segmentPoints(t);
    const head = points[0];
    const tail = points[points.length - 1];

    const gradient = ctx.createLinearGradient(head.x, head.y, tail.x, tail.y);
    gradient.addColorStop(0, '#86efac');
    gradient.addColorStop(1, '#22d3ee');

    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);

    // brilho externo
    ctx.strokeStyle = 'rgba(74, 222, 128, 0.16)';
    ctx.lineWidth = cell * 1.05;
    ctx.stroke();

    // corpo
    ctx.strokeStyle = gradient;
    ctx.lineWidth = cell * 0.76;
    ctx.stroke();
    ctx.restore();

    drawEyes(head);
  }

  function drawEyes(head) {
    const dx = state.dir.x;
    const dy = state.dir.y;
    const px = -dy;                 // perpendicular a direcao
    const py = dx;
    const offset = cell * 0.17;
    const forward = cell * 0.12;
    const r = cell * 0.085;

    ctx.fillStyle = '#07130c';

    for (const side of [-1, 1]) {
      const ex = head.x + px * offset * side + dx * forward;
      const ey = head.y + py * offset * side + dy * forward;

      ctx.beginPath();
      ctx.arc(ex, ey, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawParticles() {
    for (const p of state.particles) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = '#fb7185';
      ctx.beginPath();
      ctx.arc(p.x * cell, p.y * cell, cell * 0.09 * p.life, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
  }

  function draw() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !cell) return;

    ctx.clearRect(0, 0, w, h);
    ctx.save();

    if (state.shake > 0) {
      ctx.translate(
        (Math.random() - 0.5) * state.shake,
        (Math.random() - 0.5) * state.shake
      );
    }

    const t = state.phase === 'running' ? Math.min(state.acc / state.step, 1) : 1;

    drawGrid(w, h);
    drawFood();
    drawSnake(t);
    drawParticles();

    ctx.restore();
  }

  /* ----------------------------------------------------------- game loop */

  function loop(ts) {
    const dt = Math.min(ts - state.last, 100);
    state.last = ts;
    state.time += dt;

    if (state.phase === 'running') {
      state.acc += dt;

      while (state.acc >= state.step) {
        state.acc -= state.step;
        stepGame();

        if (state.phase !== 'running') {
          state.acc = 0;
          break;
        }
      }
    }

    updateParticles(dt);
    draw();
    requestAnimationFrame(loop);
  }

  resize();
  reset();
  setPhase('ready');
  state.last = performance.now();
  requestAnimationFrame(loop);
})();
