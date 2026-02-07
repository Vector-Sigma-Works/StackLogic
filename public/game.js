const COLS = 10;
const ROWS = 20;
const CELL = 30;

// Difficulty tuning
const LINES_PER_LEVEL = 10;
const MIN_DROP_MS = 80;
const START_DROP_MS = 800;
const DROP_DECREASE_PER_LEVEL = 60;

// High score tuning
const HIGHSCORE_MAX = 10;
const LOCAL_FALLBACK_KEY = 'stacklogic_highscores_fallback_v1';
const NAME_MAX_LEN = 16;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const statusEl = document.getElementById('status');

const scoreP = document.getElementById('scoreP');
const levelP = document.getElementById('levelP');
const statusMobile = document.getElementById('statusMobile');

const titleOverlay = document.getElementById('title');
const startBtn = document.getElementById('startBtn');
const highScoresEl = document.getElementById('highScores');

const gameOverOverlay = document.getElementById('gameOver');
const gameOverText = document.getElementById('gameOverText');
const goHomeBtn = document.getElementById('goHomeBtn');

const pauseBtn = document.getElementById('pauseBtn');
const portraitPauseBtn = document.getElementById('portraitPauseBtn');
const portraitRestartBtn = document.getElementById('portraitRestartBtn');

const btnLeft = document.getElementById('btnLeft');
const btnRight = document.getElementById('btnRight');
const btnRotL = document.getElementById('btnRotL');
const btnRotR = document.getElementById('btnRotR');
const btnDrop = document.getElementById('btnDrop');
const mobileControls = document.getElementById('mobileControls');

const COLORS = {
  I: '#67e8f9',
  O: '#fde047',
  T: '#c084fc',
  S: '#86efac',
  Z: '#fda4af',
  J: '#93c5fd',
  L: '#fdba74'
};

const SHAPES = {
  I: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0]
  ],
  O: [
    [1, 1],
    [1, 1]
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0]
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0]
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0]
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0]
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0]
  ]
};

function safeText(x) {
  return String(x ?? '');
}

function clampName(name) {
  const raw = safeText(name).trim().slice(0, NAME_MAX_LEN);
  // Match server constraints, keep it boring.
  const cleaned = raw.replace(/[^a-zA-Z0-9 _-]/g, '');
  return cleaned || 'Anon';
}

function makeBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function cloneMatrix(m) {
  return m.map((row) => row.slice());
}

function rotateCW(matrix) {
  const h = matrix.length;
  const w = matrix[0].length;
  const res = Array.from({ length: w }, () => Array(h).fill(0));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      res[x][h - 1 - y] = matrix[y][x];
    }
  }
  return res;
}

function rotateCCW(matrix) {
  const h = matrix.length;
  const w = matrix[0].length;
  const res = Array.from({ length: w }, () => Array(h).fill(0));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      res[w - 1 - x][y] = matrix[y][x];
    }
  }
  return res;
}

function randomBag() {
  const keys = Object.keys(SHAPES);
  for (let i = keys.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [keys[i], keys[j]] = [keys[j], keys[i]];
  }
  return keys;
}

function loadFallbackScores() {
  try {
    const raw = localStorage.getItem(LOCAL_FALLBACK_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x) => x && typeof x.score === 'number' && typeof x.name === 'string')
      .map((x) => ({ name: safeText(x.name).slice(0, NAME_MAX_LEN), score: Math.floor(x.score), ts: Number(x.ts) || Date.now() }))
      .sort((a, b) => b.score - a.score)
      .slice(0, HIGHSCORE_MAX);
  } catch {
    return [];
  }
}

function saveFallbackScores(list) {
  localStorage.setItem(LOCAL_FALLBACK_KEY, JSON.stringify(list.slice(0, HIGHSCORE_MAX)));
}

async function fetchHighScores() {
  try {
    const res = await fetch('/api/highscores', { cache: 'no-store' });
    if (!res.ok) throw new Error('bad response');
    const data = await res.json();
    const scores = Array.isArray(data?.scores) ? data.scores : [];
    const normalized = scores
      .filter((x) => x && typeof x.score === 'number' && typeof x.name === 'string')
      .map((x) => ({ name: safeText(x.name).slice(0, NAME_MAX_LEN), score: Math.floor(x.score), ts: Number(x.ts) || Date.now() }))
      .sort((a, b) => b.score - a.score)
      .slice(0, HIGHSCORE_MAX);
    saveFallbackScores(normalized);
    return normalized;
  } catch {
    return loadFallbackScores();
  }
}

async function submitHighScore(name, score) {
  try {
    const res = await fetch('/api/highscores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, score })
    });
    if (!res.ok) throw new Error('bad response');
    const data = await res.json();
    const scores = Array.isArray(data?.scores) ? data.scores : [];
    const normalized = scores
      .filter((x) => x && typeof x.score === 'number' && typeof x.name === 'string')
      .map((x) => ({ name: safeText(x.name).slice(0, NAME_MAX_LEN), score: Math.floor(x.score), ts: Number(x.ts) || Date.now() }))
      .sort((a, b) => b.score - a.score)
      .slice(0, HIGHSCORE_MAX);
    saveFallbackScores(normalized);
    return { saved: Boolean(data?.saved), scores: normalized };
  } catch {
    // Fallback local only
    const list = loadFallbackScores();
    const next = list.concat([{ name: clampName(name), score: Math.floor(score), ts: Date.now() }]).sort((a, b) => b.score - a.score).slice(0, HIGHSCORE_MAX);
    saveFallbackScores(next);
    return { saved: true, scores: next };
  }
}

function qualifiesForHighScore(list, score) {
  const sorted = list.slice().sort((a, b) => b.score - a.score).slice(0, HIGHSCORE_MAX);
  if (sorted.length < HIGHSCORE_MAX) return true;
  const last = sorted[sorted.length - 1];
  return score > (last?.score ?? -Infinity);
}

async function renderHighScores() {
  const list = await fetchHighScores();
  highScoresEl.innerHTML = '';
  if (list.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'No scores yet';
    highScoresEl.appendChild(li);
    return;
  }
  for (const s of list) {
    const li = document.createElement('li');
    li.textContent = `${s.name}: ${s.score}`;
    highScoresEl.appendChild(li);
  }
}

function setStatus(text) {
  statusEl.textContent = text;
  statusMobile.textContent = text;
}

function showOverlay(el) {
  el.classList.add('show');
}

function hideOverlay(el) {
  el.classList.remove('show');
}

function showHome() {
  showOverlay(titleOverlay);
  hideOverlay(gameOverOverlay);
  setStatus('');
  renderHighScores();
}

function hideHome() {
  hideOverlay(titleOverlay);
}

function showGameOver(message) {
  if (gameOverText) gameOverText.textContent = message || 'Game Over';
  showOverlay(gameOverOverlay);
}

function computeDropInterval(level) {
  const ms = START_DROP_MS - (level - 1) * DROP_DECREASE_PER_LEVEL;
  return Math.max(MIN_DROP_MS, ms);
}

let board;
let piece;
let bag;
let score;
let lines;
let level;
let dropInterval;
let dropCounter;
let lastTime;

let state; // 'home' | 'playing' | 'paused' | 'gameover'

const music = new Audio('/assets/stacklogic.mp3');
music.loop = true;

function startMusic() {
  try {
    music.currentTime = 0;
  } catch {}
  const p = music.play();
  if (p && typeof p.catch === 'function') p.catch(() => {});
}

function stopMusic() {
  try {
    music.pause();
    music.currentTime = 0;
  } catch {}
}

function pauseMusic() {
  try {
    music.pause();
  } catch {}
}

function resumeMusic() {
  const p = music.play();
  if (p && typeof p.catch === 'function') p.catch(() => {});
}

function newPiece(type) {
  const shape = cloneMatrix(SHAPES[type]);
  const x = Math.floor((COLS - shape[0].length) / 2);
  const y = -shape.length;
  return { type, shape, x, y };
}

function nextFromBag() {
  if (!bag || bag.length === 0) bag = randomBag();
  return bag.pop();
}

function collide(b, p) {
  const { shape } = p;
  for (let y = 0; y < shape.length; y++) {
    for (let x = 0; x < shape[y].length; x++) {
      if (!shape[y][x]) continue;
      const bx = p.x + x;
      const by = p.y + y;
      if (bx < 0 || bx >= COLS || by >= ROWS) return true;
      if (by >= 0 && b[by][bx]) return true;
    }
  }
  return false;
}

function mergeAndDetectOverflow(b, p) {
  const { shape, type } = p;
  let overflowed = false;
  for (let y = 0; y < shape.length; y++) {
    for (let x = 0; x < shape[y].length; x++) {
      if (!shape[y][x]) continue;
      const bx = p.x + x;
      const by = p.y + y;
      if (by < 0) overflowed = true;
      if (by >= 0) b[by][bx] = type;
    }
  }
  return overflowed;
}

function clearLines() {
  let cleared = 0;
  outer: for (let y = ROWS - 1; y >= 0; y--) {
    for (let x = 0; x < COLS; x++) {
      if (!board[y][x]) continue outer;
    }
    board.splice(y, 1);
    board.unshift(Array(COLS).fill(null));
    cleared++;
    y++;
  }

  if (cleared > 0) {
    lines += cleared;
    const lineScores = [0, 100, 300, 500, 800];
    score += (lineScores[cleared] || cleared * 200) * level;

    level = Math.floor(lines / LINES_PER_LEVEL) + 1;
    dropInterval = computeDropInterval(level);
  }
}

function spawn() {
  piece = newPiece(nextFromBag());
  if (collide(board, piece)) {
    triggerGameOver('No space to spawn');
  }
}

function resetGameState() {
  board = makeBoard();
  bag = randomBag();
  score = 0;
  lines = 0;
  level = 1;
  dropInterval = computeDropInterval(level);
  dropCounter = 0;
  lastTime = 0;
  setStatus('');
  spawn();
  updateHUD();
}

function updateHUD() {
  scoreEl.textContent = String(score);
  linesEl.textContent = String(lines);
  levelEl.textContent = String(level);
  scoreP.textContent = String(score);
  levelP.textContent = String(level);
}

function drawCell(x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.strokeRect(x * CELL + 0.5, y * CELL + 0.5, CELL - 1, CELL - 1);
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const t = board?.[y]?.[x];
      if (t) drawCell(x, y, COLORS[t]);
    }
  }

  if (piece) {
    const { shape, type } = piece;
    for (let y = 0; y < shape.length; y++) {
      for (let x = 0; x < shape[y].length; x++) {
        if (!shape[y][x]) continue;
        const bx = piece.x + x;
        const by = piece.y + y;
        if (by >= 0) drawCell(bx, by, COLORS[type]);
      }
    }
  }
}

function lockPiece() {
  const overflowed = mergeAndDetectOverflow(board, piece);
  if (overflowed) {
    triggerGameOver('Stacked above the top');
    return;
  }

  clearLines();
  updateHUD();
  spawn();
}

function softDropOnce() {
  if (state !== 'playing') return;
  piece.y++;
  if (collide(board, piece)) {
    piece.y--;
    lockPiece();
  } else {
    score += 1;
    updateHUD();
  }
  dropCounter = 0;
}

function hardDrop() {
  if (state !== 'playing') return;
  let dist = 0;
  while (true) {
    piece.y++;
    if (collide(board, piece)) {
      piece.y--;
      break;
    }
    dist++;
  }
  score += dist * 2;
  lockPiece();
}

function move(dir) {
  if (state !== 'playing') return;
  piece.x += dir;
  if (collide(board, piece)) piece.x -= dir;
}

function tryRotate(rotFn) {
  if (state !== 'playing') return;
  const prev = piece.shape;
  const rotated = rotFn(piece.shape);
  piece.shape = rotated;

  const kicks = [0, -1, 1, -2, 2];
  const oldX = piece.x;
  for (const k of kicks) {
    piece.x = oldX + k;
    if (!collide(board, piece)) return;
  }

  piece.shape = prev;
  piece.x = oldX;
}

function togglePause() {
  if (state === 'playing') {
    state = 'paused';
    setStatus('Paused');
    pauseBtn.textContent = 'Resume';
    portraitPauseBtn.textContent = 'Resume';
    pauseMusic();
  } else if (state === 'paused') {
    state = 'playing';
    setStatus('');
    pauseBtn.textContent = 'Pause';
    portraitPauseBtn.textContent = 'Pause';
    lastTime = performance.now();
    resumeMusic();
  }
}

function goHome() {
  state = 'home';
  pauseBtn.textContent = 'Pause';
  portraitPauseBtn.textContent = 'Pause';
  stopMusic();
  showHome();
  resetGameState();
}

function triggerGameOver(reason) {
  if (state === 'gameover') return;
  state = 'gameover';
  stopMusic();
  setStatus('Game Over');
  showGameOver('Game Over');

  // Freeze input immediately. Async flow runs after.
  void (async () => {
    const list = await fetchHighScores();
    const qualifies = qualifiesForHighScore(list, score);

    if (qualifies) {
      const name = prompt('New High Score. Name or initials?', '');
      if (typeof name === 'string') {
        await submitHighScore(clampName(name), score);
      }
    }

    // Return to home after handling.
    goHome();
  })();

  // Optional: report reason for debugging
  void reason;
}

function startGame() {
  hideHome();
  hideOverlay(gameOverOverlay);
  resetGameState();
  state = 'playing';
  pauseBtn.textContent = 'Pause';
  portraitPauseBtn.textContent = 'Pause';
  startMusic();
}

function update(time = 0) {
  const delta = time - lastTime;
  lastTime = time;

  if (state === 'playing') {
    dropCounter += delta;
    if (dropCounter > dropInterval) {
      piece.y++;
      if (collide(board, piece)) {
        piece.y--;
        lockPiece();
      }
      dropCounter = 0;
    }
  }

  draw();
  requestAnimationFrame(update);
}

mobileControls.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('contextmenu', (e) => {
  if (e.target && e.target.closest && e.target.closest('#mobileControls')) e.preventDefault();
});

// Desktop keyboard
document.addEventListener('keydown', (e) => {
  if (e.key === 'p' || e.key === 'P') {
    if (state !== 'home' && state !== 'gameover') togglePause();
    return;
  }

  if (e.key === 'r' || e.key === 'R') {
    goHome();
    return;
  }

  if (state !== 'playing') return;

  if (e.key === 'ArrowLeft') move(-1);
  else if (e.key === 'ArrowRight') move(1);
  else if (e.key === 'ArrowDown') softDropOnce();
  else if (e.key === 'ArrowUp' || e.key === 'x' || e.key === 'X') tryRotate(rotateCW);
  else if (e.key === 'z' || e.key === 'Z') tryRotate(rotateCCW);
  else if (e.key === ' ') {
    e.preventDefault();
    hardDrop();
  }
});

pauseBtn.addEventListener('click', () => {
  if (state === 'home' || state === 'gameover') return;
  togglePause();
});

portraitPauseBtn.addEventListener('click', () => {
  if (state === 'home' || state === 'gameover') return;
  togglePause();
});

portraitRestartBtn.addEventListener('click', () => {
  goHome();
});

goHomeBtn.addEventListener('click', () => {
  goHome();
});

startBtn.addEventListener('click', () => {
  startGame();
});

function bindHoldButton(btn, onPressOnce, { repeatMs = 0 } = {}) {
  let interval = null;
  const stop = () => {
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
  };

  const start = (e) => {
    e.preventDefault();
    if (state !== 'playing') return;
    onPressOnce();
    if (repeatMs > 0) {
      stop();
      interval = setInterval(() => {
        if (state !== 'playing') return;
        onPressOnce();
      }, repeatMs);
    }
  };

  btn.addEventListener('pointerdown', start);
  btn.addEventListener('pointerup', stop);
  btn.addEventListener('pointercancel', stop);
  btn.addEventListener('pointerleave', stop);
}

bindHoldButton(btnLeft, () => move(-1), { repeatMs: 90 });
bindHoldButton(btnRight, () => move(1), { repeatMs: 90 });
bindHoldButton(btnDrop, () => softDropOnce(), { repeatMs: 60 });

btnRotL.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  tryRotate(rotateCCW);
});

btnRotR.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  tryRotate(rotateCW);
});

state = 'home';
resetGameState();
showHome();
requestAnimationFrame(update);
