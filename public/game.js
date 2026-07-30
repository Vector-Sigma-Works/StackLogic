import { createThemeRainBootstrap } from './theme-rain-bootstrap.js?v=0.3.0-beta.1';
import { computePreviewFrameLayout, drawPreviewFrame } from './preview-frame.js?v=0.3.0-beta.1';
import { bindIosDoubleTapGuard } from './ios-double-tap.js';
import { scoreDrop, scoreLineClear } from './game-scoring.js';
import { createSeededPieceSource } from './game-piece-sequence.js';
import { describeLevelChange, getProgression } from './game-progression.js';

const COLS = 10;
const ROWS = 20;
const CELL = 30;

// High score tuning
const HIGHSCORE_MAX = 10;
const LOCAL_FALLBACK_KEY = 'stacklogic_highscores_fallback_v1';
const NAME_MAX_LEN = 16;

const NEXT_PREVIEW_KEY = 'stacklogic_preview_next_v1';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const statusEl = document.getElementById('status');

const scoreP = document.getElementById('scoreP');
const levelP = document.getElementById('levelP');
const statusMobile = document.getElementById('statusMobile');

const levelProgressEl = document.getElementById('levelProgress');
const levelProgressP = document.getElementById('levelProgressP');

const titleOverlay = document.getElementById('title');
const startBtn = document.getElementById('startBtn');
const highScoresEl = document.getElementById('highScores');

// Opponent panel elements
const opponentPanel = document.getElementById('opponentPanel');
const opponentGame = document.getElementById('opponentGame');
const opponentName = document.getElementById('opponentName');
const opponentScore = document.getElementById('opponentScore');
const opponentLines = document.getElementById('opponentLines');
const opponentStatus = document.getElementById('opponentStatus');

const gameOverOverlay = document.getElementById('gameOver');
const gameOverText = document.getElementById('gameOverText');
const gameResultTitle = document.getElementById('gameResultTitle');
const rematchStatus = document.getElementById('rematchStatus');
const rematchBtn = document.getElementById('rematchBtn');
const victoryFireworks = document.getElementById('victoryFireworks');
const goHomeBtn = document.getElementById('goHomeBtn');
const pauseMenu = document.getElementById('pauseMenu');
const pauseResumeBtn = document.getElementById('pauseResumeBtn');

const pauseBtn = document.getElementById('pauseBtn');
const portraitPauseBtn = document.getElementById('portraitPauseBtn');
const portraitRestartBtn = document.getElementById('portraitRestartBtn');

const btnLeft = document.getElementById('btnLeft');
const btnRight = document.getElementById('btnRight');
const btnRotL = document.getElementById('btnRotL');
const btnRotR = document.getElementById('btnRotR');
const btnDrop = document.getElementById('btnDrop');
const mobileControls = document.getElementById('mobileControls');

const previewCheckbox = document.getElementById('previewNext');

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

function createSoloSeed() {
  const seed = new Uint32Array(1);
  globalThis.crypto.getRandomValues(seed);
  return seed[0];
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
  // GitHub Pages is static hosting; keep scores per-device (no backend).
  return loadFallbackScores();
}

async function submitHighScore(name, score) {
  // Local-only leaderboard (per device/browser)
  const list = loadFallbackScores();
  const next = list
    .concat([{ name: clampName(name), score: Math.floor(score), ts: Date.now() }])
    .sort((a, b) => b.score - a.score)
    .slice(0, HIGHSCORE_MAX);
  saveFallbackScores(next);
  return { saved: true, scores: next };
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

let board;
let piece;
let pieceSource;
let score;
let lines;
let level;
let dropInterval;
let dropCounter;
let lastTime;
let nextType = null;

let state; // 'home' | 'playing' | 'paused' | 'gameover'

// Multiplayer owner state (separate from local gameplay state)
let activeMultiplayerMatchId = null;
let finishedMultiplayerMatchId = null;
let rematchCommitted = false;
let lastRenderedOpponentSeq = 0;

let levelProgressText;

const music = new Audio('assets/stacklogic.mp3');
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

function nextFromSequence() {
  return pieceSource.next();
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
    score += scoreLineClear(cleared, level);

    const previousLevel = level;
    const progression = getProgression(lines);
    level = progression.level;
    dropInterval = progression.dropIntervalMs;
    levelProgressText = progression.progressText;
    const levelUpMessage = describeLevelChange(previousLevel, level);
    if (levelUpMessage) setStatus(levelUpMessage);
  }
}

function spawn() {
  // Use prefetched nextType so we can preview it
  if (!nextType) nextType = nextFromSequence();
  piece = newPiece(nextType);
  nextType = nextFromSequence();
  if (collide(board, piece)) {
    triggerGameOver('No space to spawn');
  }
}

function resetGameState(seed = createSoloSeed()) {
  board = makeBoard();
  pieceSource = createSeededPieceSource(seed);
  score = 0;
  lines = 0;
  const progression = getProgression(lines);
  level = progression.level;
  dropInterval = progression.dropIntervalMs;
  levelProgressText = progression.progressText;
  dropCounter = 0;
  lastTime = 0;
  nextType = null;
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
  levelProgressEl.textContent = levelProgressText;
  levelProgressP.textContent = levelProgressText;
}

function drawCell(x, y, color) {
  var themeId = (typeof window !== 'undefined' && window.ThemeModule && window.ThemeModule.getCurrentTheme)
    ? window.ThemeModule.getCurrentTheme() : 'Default';
  drawBrick(ctx, x, y, color, themeId, CELL);
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

  // Draw preview if enabled
  const previewEnabled = (function() {
    try {
      const v = localStorage.getItem(NEXT_PREVIEW_KEY);
      if (v === null) return true; // default on
      return v === '1' || v === 'true';
    } catch {
      return true;
    }
  })();

  if (previewEnabled && nextType) {
    const shape = SHAPES[nextType];
    const small = Math.floor(CELL * 0.7);
    const layout = computePreviewFrameLayout({
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      shape,
      cellSize: small,
    });
    const styles = getComputedStyle(document.documentElement);
    const borderColor = styles.getPropertyValue('--border').trim() || '#283244';
    const labelColor = styles.getPropertyValue('--fg').trim() || '#e6edf3';

    drawPreviewFrame(ctx, layout, { borderColor, labelColor });

    for (let y = 0; y < shape.length; y++) {
      for (let x = 0; x < shape[y].length; x++) {
        if (!shape[y][x]) continue;
        drawBrickAt(ctx, layout.pieceX + x * small, layout.pieceY + y * small, COLORS[nextType],
          (typeof window !== 'undefined' && window.ThemeModule && window.ThemeModule.getCurrentTheme)
            ? window.ThemeModule.getCurrentTheme() : 'Default', small);
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

  // Publish local state after settled lock (before spawn)
  if (activeMultiplayerMatchId != null) {
    publishLocalState(false);
  }

  spawn();
}

function softDropOnce() {
  if (state !== 'playing') return;
  piece.y++;
  if (collide(board, piece)) {
    piece.y--;
    lockPiece();
  } else {
    score += scoreDrop('soft', 1);
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
  score += scoreDrop('hard', dist);
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
    showOverlay(pauseMenu);
    pauseMusic();
  } else if (state === 'paused') {
    state = 'playing';
    setStatus('');
    pauseBtn.textContent = 'Pause';
    portraitPauseBtn.textContent = 'Pause';
    hideOverlay(pauseMenu);
    lastTime = performance.now();
    resumeMusic();
  }
}

function goHome() {
  if (rematchCommitted) return;
  invalidateOwner();
  state = 'home';
  pauseBtn.textContent = 'Pause';
  portraitPauseBtn.textContent = 'Pause';
  hideOverlay(pauseMenu);
  stopMusic();
  showHome();
  resetGameState();
}

// ---- Multiplayer lifecycle helpers ----

function dispatchStackLogicEvent(type, detail) {
  const EventConstructor = globalThis.CustomEvent;
  const event = typeof EventConstructor === 'function'
    ? new EventConstructor(type, { detail })
    : { type, detail };
  window.dispatchEvent(event);
}

function publishLocalState(gameOver) {
  if (activeMultiplayerMatchId == null) return;
  const detachedBoard = cloneMatrix(board);
  dispatchStackLogicEvent('stacklogic:local-state', {
    matchId: activeMultiplayerMatchId,
    board: detachedBoard,
    score: score,
    lines: lines,
    gameOver: !!gameOver
  });
}

function getOpponentContext() {
  if (!opponentGame || typeof opponentGame.getContext !== 'function') return null;
  return opponentGame.getContext('2d');
}

function invalidateOwner() {
  const endingMatchId = activeMultiplayerMatchId;
  const abandonedMatchId = finishedMultiplayerMatchId;
  activeMultiplayerMatchId = null;
  finishedMultiplayerMatchId = null;
  rematchCommitted = false;
  lastRenderedOpponentSeq = 0;

  // Clear every multiplayer-only visual/action surface even after a finished match.
  const octx = getOpponentContext();
  if (octx) octx.clearRect(0, 0, opponentGame.width, opponentGame.height);
  if (opponentName) opponentName.textContent = '—';
  if (opponentScore) opponentScore.textContent = '0';
  if (opponentLines) opponentLines.textContent = '0';
  if (opponentStatus) opponentStatus.textContent = '';
  if (opponentPanel) opponentPanel.hidden = true;
  if (victoryFireworks) victoryFireworks.hidden = true;
  if (rematchStatus) rematchStatus.textContent = '';
  if (rematchBtn) {
    rematchBtn.disabled = true;
    rematchBtn.textContent = 'Rematch';
  }

  // Dispatch only when an active multiplayer owner actually ended.
  if (endingMatchId != null) {
    dispatchStackLogicEvent('stacklogic:multiplayer-end', { matchId: endingMatchId });
  } else if (abandonedMatchId != null) {
    dispatchStackLogicEvent('stacklogic:multiplayer-abandon', { matchId: abandonedMatchId });
  }
}

function triggerGameOver(reason) {
  if (state === 'gameover') return;
  state = 'gameover';
  hideOverlay(pauseMenu);
  stopMusic();
  setStatus('Game Over');
  // A multiplayer loss waits for the server-authoritative result. Do not run the
  // solo high-score/home flow or fence the result bridge before it arrives.
  if (activeMultiplayerMatchId != null) {
    setStatus('Match result pending…');
    publishLocalState(true);
    return;
  }

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

function startGame(seed = createSoloSeed()) {
  if (rematchCommitted) return;
  // Solo Start clears both active and completed multiplayer ownership/UI.
  invalidateOwner();
  hideHome();
  hideOverlay(gameOverOverlay);
  hideOverlay(pauseMenu);
  resetGameState(seed);
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

pauseResumeBtn.addEventListener('click', () => {
  if (state === 'paused') togglePause();
});

portraitRestartBtn.addEventListener('click', () => {
  goHome();
});

goHomeBtn.addEventListener('click', () => {
  goHome();
});

if (rematchBtn) rematchBtn.addEventListener('click', () => {
  if (rematchBtn.disabled) return;
  rematchCommitted = true;
  rematchBtn.disabled = true;
  rematchBtn.textContent = 'Waiting for opponent…';
  if (rematchStatus) rematchStatus.textContent = 'Waiting for opponent to accept Rematch.';
  dispatchStackLogicEvent('stacklogic:rematch-request', { matchId: finishedMultiplayerMatchId });
});

startBtn.addEventListener('click', () => {
  startGame();
});

// StackLogic match-start handoff seam
(function() {
  const startedIds = new Set();

  function isValidMatchStart(detail) {
    if (!detail || typeof detail !== 'object') return false;
    var id = detail.id;
    if (typeof id !== 'string' || id.length < 1 || id.length > 64) return false;
    if (!/^[A-Za-z0-9_-]+$/.test(id)) return false;
    var seed = detail.seed;
    if (typeof seed !== 'number' || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) return false;
    var startedSeq = detail.startedSeq;
    if (typeof startedSeq !== 'number' || !Number.isInteger(startedSeq) || startedSeq < 1) return false;
    return true;
  }

  window.addEventListener('stacklogic:match-start', function(event) {
    var detail = event.detail;
    if (!isValidMatchStart(detail)) return;
    var id = detail.id;
    var seed = detail.seed;
    if (startedIds.has(id)) return;
    startedIds.add(id);

    // If a different game-side owner is active, invalidate that old owner exactly once
    if (activeMultiplayerMatchId != null && activeMultiplayerMatchId !== id) {
      invalidateOwner();
    }

    // Activate the new bounded match ID and reset opponent sequence to 0
    activeMultiplayerMatchId = id;
    finishedMultiplayerMatchId = null;
    rematchCommitted = false;
    if (rematchStatus) rematchStatus.textContent = '';
    lastRenderedOpponentSeq = 0;

    // Start the seeded game through the existing start seam
    hideHome();
    hideOverlay(gameOverOverlay);
    hideOverlay(pauseMenu);
    resetGameState(seed);
    state = 'playing';
    pauseBtn.textContent = 'Pause';
    portraitPauseBtn.textContent = 'Pause';
    startMusic();

    // Reveal and reset the opponent panel with status exactly "Waiting for opponent"
    if (opponentName) opponentName.textContent = '—';
    if (opponentScore) opponentScore.textContent = '0';
    if (opponentLines) opponentLines.textContent = '0';
    if (opponentStatus) opponentStatus.textContent = 'Waiting for opponent';
    const octx = getOpponentContext();
    if (octx) octx.clearRect(0, 0, opponentGame.width, opponentGame.height);
    if (opponentPanel) opponentPanel.hidden = false;

    // Dispatch exactly one initial local snapshot
    publishLocalState(false);
  });
})();

window.addEventListener('stacklogic:match-result', (event) => {
  const detail = event?.detail;
  if (!detail || detail.matchId !== activeMultiplayerMatchId || typeof detail.didWin !== 'boolean') return;
  state = 'gameover';
  stopMusic();
  hideOverlay(pauseMenu);
  if (gameResultTitle) gameResultTitle.textContent = detail.didWin ? 'Victory!' : 'Defeat';
  if (gameOverText) gameOverText.textContent = detail.didWin ? 'You won the round!' : `${detail.winnerName || 'Your opponent'} won the round.`;
  if (victoryFireworks) victoryFireworks.hidden = !detail.didWin;
  if (rematchStatus) rematchStatus.textContent = 'Choose Rematch to play another round.';
  if (rematchBtn) { rematchBtn.disabled = false; rematchBtn.textContent = 'Rematch'; }
  if (!detail.didWin && opponentStatus) opponentStatus.textContent = `${detail.winnerName || 'Opponent'} wins! ✦`;
  finishedMultiplayerMatchId = detail.matchId;
  rematchCommitted = false;
  activeMultiplayerMatchId = null;
  showOverlay(gameOverOverlay);
  if (rematchBtn && typeof rematchBtn.focus === 'function') rematchBtn.focus();
});

window.addEventListener('stacklogic:rematch-status', (event) => {
  const detail = event?.detail;
  if (!detail || detail.matchId !== finishedMultiplayerMatchId || !Array.isArray(detail.acceptedPlayerIds) || !rematchBtn) return;
  if (rematchBtn.disabled) return;
  if (detail.acceptedPlayerIds.length === 0) {
    rematchBtn.textContent = 'Rematch';
    if (rematchStatus) rematchStatus.textContent = 'Choose Rematch to play another round.';
    return;
  }
  rematchBtn.textContent = 'Opponent ready — Rematch';
  if (rematchStatus) rematchStatus.textContent = 'Opponent accepted. Choose Rematch to start the next round.';
});

// ---- Opponent state event handler ----
(function() {
  const VALID_PIECES = new Set(['I', 'O', 'T', 'S', 'Z', 'J', 'L']);
  const SAFE_INT_MAX = 1_000_000_000;

  function isSafeInt(n) {
    return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= SAFE_INT_MAX;
  }

  function isValidOpponentBoard(board) {
    if (!Array.isArray(board) || board.length !== 20) return false;
    for (let y = 0; y < 20; y++) {
      const row = board[y];
      if (!Array.isArray(row) || row.length !== 10) return false;
      for (let x = 0; x < 10; x++) {
        const cell = row[x];
        if (cell !== null && !VALID_PIECES.has(cell)) return false;
      }
    }
    return true;
  }

  function handleOpponentState(event) {
    try {
      // Must be a non-null object with exactly own enumerable keys matchId, opponent
      var detail = event.detail;
      if (!detail || typeof detail !== 'object') return;
      var ownKeys = Object.keys(detail);
      if (ownKeys.length !== 2 || !Object.hasOwn(detail, 'matchId') || !Object.hasOwn(detail, 'opponent')) return;

      var matchId = detail.matchId;
      if (typeof matchId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(matchId)) return;

      // A game-side multiplayer owner must be active and match
      if (activeMultiplayerMatchId == null || activeMultiplayerMatchId !== matchId) return;

      var opponent = detail.opponent;
      if (!opponent || typeof opponent !== 'object') return;
      var oppKeys = Object.keys(opponent);
      if (oppKeys.length !== 6 || !Object.hasOwn(opponent, 'name') || !Object.hasOwn(opponent, 'updateSeq') ||
          !Object.hasOwn(opponent, 'board') || !Object.hasOwn(opponent, 'score') || !Object.hasOwn(opponent, 'lines') ||
          !Object.hasOwn(opponent, 'gameOver')) return;

      var name = opponent.name;
      if (typeof name !== 'string' || name.length < 1 || name.length > 24) return;

      var updateSeq = opponent.updateSeq;
      if (typeof updateSeq !== 'number' || !Number.isSafeInteger(updateSeq) || updateSeq < 1 || updateSeq > SAFE_INT_MAX) return;

      // Must equal last-rendered sequence plus one
      if (updateSeq !== lastRenderedOpponentSeq + 1) return;

      var oppBoard = opponent.board;
      if (!isValidOpponentBoard(oppBoard)) return;

      var oppScore = opponent.score;
      if (!isSafeInt(oppScore)) return;

      var oppLines = opponent.lines;
      if (!isSafeInt(oppLines)) return;

      var gameOver = opponent.gameOver;
      if (typeof gameOver !== 'boolean') return;

      // All validation passed - render
      // Clear the complete 120 x 240 opponent canvas
      const octx = getOpponentContext();
      if (octx) {
        octx.clearRect(0, 0, opponentGame.width, opponentGame.height);

        // Draw each occupied cell
        var themeId = (typeof window !== 'undefined' && window.ThemeModule && window.ThemeModule.getCurrentTheme)
          ? window.ThemeModule.getCurrentTheme() : 'Default';

        for (let y = 0; y < 20; y++) {
          for (let x = 0; x < 10; x++) {
            const cellType = oppBoard[y][x];
            if (cellType) {
              drawBrickAt(octx, x * 12, y * 12, COLORS[cellType], themeId, 12);
            }
          }
        }
      }

      // Set name, score, lines, and status through textContent
      if (opponentName) opponentName.textContent = name;
      if (opponentScore) opponentScore.textContent = String(oppScore);
      if (opponentLines) opponentLines.textContent = String(oppLines);
      if (opponentStatus) opponentStatus.textContent = gameOver ? 'Game Over' : 'Playing';

      // Advance last-rendered sequence only after complete validation/rendering
      lastRenderedOpponentSeq = updateSeq;
    } catch (e) {
      // Non-throwing: invalid events do not advance sequence, alter text, or draw
    }
  }

  window.addEventListener('stacklogic:opponent-state', handleOpponentState);
})();

if (previewCheckbox) {
  // Initialize checkbox state from localStorage
  try {
    const v = localStorage.getItem(NEXT_PREVIEW_KEY);
    if (v === null) previewCheckbox.checked = true;
    else previewCheckbox.checked = (v === '1' || v === 'true');
  } catch {
    previewCheckbox.checked = true;
  }

  previewCheckbox.addEventListener('change', (e) => {
    try {
      localStorage.setItem(NEXT_PREVIEW_KEY, previewCheckbox.checked ? '1' : '0');
    } catch {}
  });
}

// Prevent iOS double-tap zoom on fast consecutive taps for controls
bindIosDoubleTapGuard(document.querySelectorAll('#mobileControls button:not(:disabled)'));

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

// ---- Theme integration ----
(function initTheme() {
  if (typeof window === 'undefined' || !window.ThemeModule) return;

  const themeRainBootstrap = createThemeRainBootstrap(window);
  themeRainBootstrap.start();
  window.addEventListener('pagehide', (event) => {
    if (event.persisted !== true) {
      themeRainBootstrap.dispose();
    }
  });

  window.ThemeModule.init();

  // Wire up accessible radio-group theme buttons.
  var themeBtns = document.querySelectorAll('.theme-btn');

  function syncThemeButtons(themeName) {
    for (var i = 0; i < themeBtns.length; i++) {
      var selected = themeBtns[i].getAttribute('data-theme') === themeName;
      themeBtns[i].setAttribute('aria-checked', selected ? 'true' : 'false');
      themeBtns[i].setAttribute('tabindex', selected ? '0' : '-1');
    }
  }

  function setActiveTheme(themeName) {
    if (!themeName) return;
    window.ThemeModule.selectTheme(themeName);
    window.ThemeModule.applyTheme(themeName);
    syncThemeButtons(themeName);
  }

  function handleThemeKeydown(event, btn) {
    var group = btn.closest('.theme-controls');
    if (!group) return;
    var groupBtns = group.querySelectorAll('.theme-btn');
    var currentIndex = Array.prototype.indexOf.call(groupBtns, btn);
    var targetIndex = currentIndex;

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      targetIndex = (currentIndex + 1) % groupBtns.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      targetIndex = (currentIndex - 1 + groupBtns.length) % groupBtns.length;
    } else if (event.key === 'Home') {
      targetIndex = 0;
    } else if (event.key === 'End') {
      targetIndex = groupBtns.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    var target = groupBtns[targetIndex];
    setActiveTheme(target.getAttribute('data-theme'));
    target.focus();
  }

  for (var i = 0; i < themeBtns.length; i++) {
    themeBtns[i].addEventListener('click', (function(btn) {
      return function() {
        setActiveTheme(btn.getAttribute('data-theme'));
      };
    })(themeBtns[i]));
    themeBtns[i].addEventListener('keydown', (function(btn) {
      return function(event) {
        handleThemeKeydown(event, btn);
      };
    })(themeBtns[i]));
  }

  // Sync selection and roving tab stops to the saved theme.
  var saved = window.ThemeModule.loadSavedTheme ? window.ThemeModule.loadSavedTheme() : null;
  syncThemeButtons(saved || 'Default');
})();

state = 'home';
resetGameState();
showHome();
requestAnimationFrame(update);
