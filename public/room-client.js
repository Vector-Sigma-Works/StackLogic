const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsUrl = `${wsProtocol}//${window.location.host}/ws`;
const ws = new WebSocket(wsUrl);

let currentSeq = null;
let selfPlayerId = null;
let roomState = null;
let dispatchedMatchIds = new Set();
let activeMatchId = null;
let finishedMatchId = null;
let localUpdateSeq = 0;
let opponentUpdateSeq = 0;

const els = {
  roomName: document.getElementById('roomName'),
  roomCode: document.getElementById('roomCode'),
  createBtn: document.getElementById('createMatchBtn'),
  joinBtn: document.getElementById('joinMatchBtn'),
  status: document.getElementById('roomStatus'),
  players: document.getElementById('roomPlayers'),
  readyBtn: document.getElementById('roomReadyBtn'),
  copyCodeBtn: document.getElementById('copyCodeBtn'),
  copyInviteLinkBtn: document.getElementById('copyInviteLinkBtn')
};

async function copyText(text) {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
  }
  let ta = null;
  try {
    ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    return !!document.execCommand('copy');
  } catch {
    return false;
  } finally {
    if (ta && ta.parentNode) { ta.parentNode.removeChild(ta); }
  }
}

function setStatus(msg) { els.status.textContent = msg; }
function updatePlayerList(room) {
  if (!room || !room.players) { els.players.textContent = ''; return; }
  els.players.textContent = '';
  room.players.forEach(p => {
    const div = document.createElement('div');
    div.textContent = `${p.name} (${p.ready ? 'Ready' : 'Not ready'})`;
    els.players.appendChild(div);
  });
}
function updateReadyBtn() {
  if (!selfPlayerId || currentSeq === null) { els.readyBtn.disabled = true; els.readyBtn.textContent = 'Ready'; return; }
  const self = roomState?.players?.find(p => p.id === selfPlayerId);
  const ready = self ? self.ready : false;
  els.readyBtn.disabled = false;
  els.readyBtn.textContent = ready ? 'Unready' : 'Ready';
}

function generateRequestId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    const hex = Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
    return hex.substring(0, 32);
  }

  throw new Error('Secure random ID generation not available');
}

function sendMsg(type, payload) {
  let id;
  try {
    id = generateRequestId();
  } catch (e) {
    setStatus('Error: Secure ID generation failed');
    return false;
  }
  if (ws.readyState !== WebSocket.OPEN) return false;
  try {
    ws.send(JSON.stringify({ type, requestId: id, ...payload }));
    return true;
  } catch {
    return false;
  }
}

function normalizeRoomCode(code) {
  return code.replace(/[\s-]/g, '').toUpperCase();
}

const VALID_CELLS = new Set(['I', 'O', 'T', 'S', 'Z', 'J', 'L']);

function isValidState(state) {
  if (!state || typeof state !== 'object') return false;
  const keys = Object.keys(state);
  if (keys.length !== 4) return false;
  if (!Object.hasOwn(state, 'board') || !Object.hasOwn(state, 'score') || !Object.hasOwn(state, 'lines') || !Object.hasOwn(state, 'gameOver')) return false;
  const board = state.board;
  if (!Array.isArray(board) || board.length !== 20) return false;
  for (let r = 0; r < 20; r++) {
    const row = board[r];
    if (!Array.isArray(row) || row.length !== 10) return false;
    for (let c = 0; c < 10; c++) {
      const cell = row[c];
      if (cell !== null && !VALID_CELLS.has(cell)) return false;
    }
  }
  const score = state.score;
  if (typeof score !== 'number' || !Number.isSafeInteger(score) || score < 0 || score > 1_000_000_000) return false;
  const lines = state.lines;
  if (typeof lines !== 'number' || !Number.isSafeInteger(lines) || lines < 0 || lines > 1_000_000_000) return false;
  const gameOver = state.gameOver;
  if (typeof gameOver !== 'boolean') return false;
  return true;
}

function isValidMatch(match, seq) {
  if (!match || typeof match !== 'object') return false;
  if (typeof match.id !== 'string' || match.id.length < 1 || match.id.length > 64) return false;
  if (!/^[A-Za-z0-9_-]+$/.test(match.id)) return false;
  if (typeof match.seed !== 'number' || !Number.isInteger(match.seed) || match.seed < 0 || match.seed > 0xffffffff) return false;
  if (typeof match.startedSeq !== 'number' || !Number.isInteger(match.startedSeq) || match.startedSeq < 1) return false;
  if (match.startedSeq !== seq) return false;
  return true;
}

function handleMatchSnapshot(match, seq) {
  if (!isValidMatch(match, seq)) return;
  const matchId = match.id;
  if (dispatchedMatchIds.has(matchId)) {
    els.readyBtn.disabled = true;
    els.readyBtn.textContent = 'Started';
    return;
  }
  dispatchedMatchIds.add(matchId);
  activeMatchId = matchId;
  finishedMatchId = null;
  localUpdateSeq = 0;
  opponentUpdateSeq = 0;
  els.readyBtn.disabled = true;
  els.readyBtn.textContent = 'Started';
  window.dispatchEvent(new CustomEvent('stacklogic:match-start', {
    detail: { id: match.id, seed: match.seed, startedSeq: match.startedSeq }
  }));
}

function invalidateActiveMatch() {
  activeMatchId = null;
  localUpdateSeq = 0;
  opponentUpdateSeq = 0;
}

const params = new URLSearchParams(window.location.search);
const rawPrefill = params.get('room');
let prefilledRoom = '';
if (rawPrefill) {
  const urlMatch = rawPrefill.match(/[?&]room=([^&]+)/);
  if (urlMatch) {
    const usp = new URLSearchParams(urlMatch[0]);
    prefilledRoom = normalizeRoomCode(usp.get('room'));
  } else {
    prefilledRoom = normalizeRoomCode(rawPrefill);
  }
}
if (prefilledRoom) els.roomCode.value = prefilledRoom;
ws.addEventListener('open', () => setStatus('Connected to lobby.'));
ws.addEventListener('message', (e) => {
  let data;
  try { data = JSON.parse(e.data); } catch { return; }
  if (!data || typeof data !== 'object') return;
  if (data.type === 'room_state') {
    currentSeq = data.room.seq; selfPlayerId = data.self.playerId; roomState = data.room;
    updatePlayerList(data.room); updateReadyBtn(); setStatus(`Room ${data.room.code} active.`);
    els.roomCode.value = normalizeRoomCode(data.room.code);
    els.copyCodeBtn.disabled = false;
    els.copyInviteLinkBtn.disabled = false;
    handleMatchSnapshot(data.room.match, currentSeq);
  } else if (data.type === 'error') setStatus(`Error: ${data.code}`);
  else if (data.type === 'opponent_state') {
    const msgKeys = Object.keys(data);
    if (msgKeys.length !== 4) return;
    if (!Object.hasOwn(data, 'type') || !Object.hasOwn(data, 'protocolVersion') || !Object.hasOwn(data, 'matchId') || !Object.hasOwn(data, 'opponent')) return;
    if (data.protocolVersion !== 1) return;
    if (!activeMatchId || data.matchId !== activeMatchId) return;
    const opp = data.opponent;
    if (!opp || typeof opp !== 'object') return;
    const oppKeys = Object.keys(opp);
    if (oppKeys.length !== 6) return;
    if (!Object.hasOwn(opp, 'name') || !Object.hasOwn(opp, 'updateSeq') || !Object.hasOwn(opp, 'board') || !Object.hasOwn(opp, 'score') || !Object.hasOwn(opp, 'lines') || !Object.hasOwn(opp, 'gameOver')) return;
    const oppName = opp.name;
    const otherPlayer = roomState?.players?.find(p => p.id !== selfPlayerId);
    if (!otherPlayer || otherPlayer.name !== oppName) return;
    const uSeq = opp.updateSeq;
    if (typeof uSeq !== 'number' || !Number.isSafeInteger(uSeq) || uSeq < 1 || uSeq > 1_000_000_000) return;
    if (uSeq !== opponentUpdateSeq + 1) return;
    const extractedState = { board: opp.board, score: opp.score, lines: opp.lines, gameOver: opp.gameOver };
    if (!isValidState(extractedState)) return;
    const detachedDetail = {
      matchId: data.matchId,
      opponent: { name: opp.name, updateSeq: opp.updateSeq, board: extractedState.board.map(row => row.slice()), score: extractedState.score, lines: extractedState.lines, gameOver: extractedState.gameOver }
    };
    opponentUpdateSeq = uSeq;
    window.dispatchEvent(new CustomEvent('stacklogic:opponent-state', { detail: detachedDetail }));
  } else if (data.type === 'match_result') {
    const keys = Object.keys(data);
    if (keys.length !== 5 || !Object.hasOwn(data, 'type') || !Object.hasOwn(data, 'protocolVersion') || !Object.hasOwn(data, 'matchId') || !Object.hasOwn(data, 'winnerId') || !Object.hasOwn(data, 'loserId')) return;
    if (!activeMatchId || data.protocolVersion !== 1 || data.matchId !== activeMatchId || typeof data.winnerId !== 'string' || typeof data.loserId !== 'string' || data.winnerId === data.loserId) return;
    const winner = roomState?.players?.find((p) => p.id === data.winnerId);
    const loser = roomState?.players?.find((p) => p.id === data.loserId);
    if (!winner || !loser || !selfPlayerId || (selfPlayerId !== data.winnerId && selfPlayerId !== data.loserId)) return;
    finishedMatchId = activeMatchId;
    invalidateActiveMatch();
    window.dispatchEvent(new CustomEvent('stacklogic:match-result', { detail: { matchId: data.matchId, didWin: data.winnerId === selfPlayerId, winnerName: winner.name } }));
  } else if (data.type === 'rematch_status') {
    const keys = Object.keys(data);
    if (keys.length !== 4 || !Object.hasOwn(data, 'type') || !Object.hasOwn(data, 'protocolVersion') || !Object.hasOwn(data, 'matchId') || !Object.hasOwn(data, 'acceptedPlayerIds')) return;
    if (data.protocolVersion !== 1 || data.matchId !== finishedMatchId || !Array.isArray(data.acceptedPlayerIds)) return;
    const players = roomState?.players || [];
    if (data.acceptedPlayerIds.length > players.length || new Set(data.acceptedPlayerIds).size !== data.acceptedPlayerIds.length || data.acceptedPlayerIds.some((id) => typeof id !== 'string' || !players.some((player) => player.id === id))) return;
    window.dispatchEvent(new CustomEvent('stacklogic:rematch-status', { detail: { matchId: data.matchId, acceptedPlayerIds: data.acceptedPlayerIds.slice() } }));
  }
});
ws.addEventListener('error', () => setStatus('Connection error.'));
ws.addEventListener('close', () => { invalidateActiveMatch(); setStatus('Disconnected.'); });
els.createBtn.addEventListener('click', () => { const name = els.roomName.value.trim(); if (name) sendMsg('create_room', { name }); });
els.joinBtn.addEventListener('click', () => { const name = els.roomName.value.trim(); const rawCode = els.roomCode.value.trim(); const code = normalizeRoomCode(rawCode); if (name && code) sendMsg('join_room', { code, name }); });
els.roomCode.addEventListener('paste', async (e) => {
  const text = e.clipboardData.getData('text');
  try {
    const url = new URL(text);
    const roomParam = url.searchParams.get('room');
    if (roomParam) {
      e.preventDefault();
      els.roomCode.value = normalizeRoomCode(roomParam);
    }
  } catch { /* not a valid URL, ignore */ }
});
els.readyBtn.addEventListener('click', () => {
  if (!selfPlayerId || currentSeq === null) return;
  const self = roomState?.players?.find(p => p.id === selfPlayerId);
  sendMsg('set_ready', { ready: self ? !self.ready : false, expectedSeq: currentSeq });
  updateReadyBtn();
});

els.copyCodeBtn.addEventListener('click', async () => {
  const normalized = roomState ? normalizeRoomCode(roomState.code) : '';
  if (await copyText(normalized)) {
    setStatus(`Copied code: ${normalized}`);
  } else {
    setStatus('Failed to copy code.');
  }
});

els.copyInviteLinkBtn.addEventListener('click', async () => {
  const normalized = roomState ? normalizeRoomCode(roomState.code) : '';
  const url = window.location.origin + window.location.pathname + '?room=' + normalized;
  if (await copyText(url)) {
    setStatus('Copied invite link.');
  } else {
    setStatus('Failed to copy invite link.');
  }
});

window.addEventListener('stacklogic:multiplayer-end', (event) => {
  if (!activeMatchId) return;
  const detail = event.detail;
  if (!detail || typeof detail !== 'object') return;
  const keys = Object.keys(detail);
  if (keys.length !== 1 || !Object.hasOwn(detail, 'matchId')) return;
  const detailMatchId = detail.matchId;
  if (typeof detailMatchId !== 'string') return;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(detailMatchId)) return;
  if (detailMatchId !== activeMatchId) return;
  invalidateActiveMatch();
});

window.addEventListener('stacklogic:multiplayer-abandon', (event) => {
  const matchId = event?.detail?.matchId;
  if (matchId && matchId === finishedMatchId) finishedMatchId = null;
});

window.addEventListener('stacklogic:rematch-request', (event) => {
  const matchId = event?.detail?.matchId;
  if (matchId && matchId === finishedMatchId) sendMsg('request_rematch', { matchId });
});

window.addEventListener('stacklogic:local-state', (event) => {
  if (!activeMatchId || !ws) return;
  const detail = event.detail;
  if (!detail || typeof detail !== 'object') return;
  const keys = Object.keys(detail);
  if (keys.length !== 5) return;
  if (!Object.hasOwn(detail, 'matchId') || !Object.hasOwn(detail, 'board') || !Object.hasOwn(detail, 'score') || !Object.hasOwn(detail, 'lines') || !Object.hasOwn(detail, 'gameOver')) return;
  const detailMatchId = event.detail.matchId;
  if (detailMatchId !== activeMatchId) return;
  const extractedState = { board: event.detail.board, score: event.detail.score, lines: event.detail.lines, gameOver: event.detail.gameOver };
  if (!isValidState(extractedState)) return;
  if (localUpdateSeq >= 1_000_000_000) return;
  const nextSeq = localUpdateSeq + 1;
  const detachedState = { board: extractedState.board.map(row => row.slice()), score: extractedState.score, lines: extractedState.lines, gameOver: extractedState.gameOver };
  const sent = sendMsg('update_player_state', { matchId: activeMatchId, updateSeq: nextSeq, state: detachedState });
  if (sent) localUpdateSeq = nextSeq;
});

updateReadyBtn();
