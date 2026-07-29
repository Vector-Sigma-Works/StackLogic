const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsUrl = `${wsProtocol}//${window.location.host}/ws`;
const ws = new WebSocket(wsUrl);

let currentSeq = null;
let selfPlayerId = null;
let roomState = null;
let dispatchedMatchIds = new Set();

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
    return;
  }
  ws.send(JSON.stringify({ type, requestId: id, ...payload }));
}

function normalizeRoomCode(code) {
  return code.replace(/[\s-]/g, '').toUpperCase();
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
  els.readyBtn.disabled = true;
  els.readyBtn.textContent = 'Started';
  window.dispatchEvent(new CustomEvent('stacklogic:match-start', {
    detail: { id: match.id, seed: match.seed, startedSeq: match.startedSeq }
  }));
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
  if (data.type === 'room_state') {
    currentSeq = data.room.seq; selfPlayerId = data.self.playerId; roomState = data.room;
    updatePlayerList(data.room); updateReadyBtn(); setStatus(`Room ${data.room.code} active.`);
    els.roomCode.value = normalizeRoomCode(data.room.code);
    els.copyCodeBtn.disabled = false;
    els.copyInviteLinkBtn.disabled = false;
    handleMatchSnapshot(data.room.match, currentSeq);
  } else if (data.type === 'error') setStatus(`Error: ${data.code}`);
});
ws.addEventListener('error', () => setStatus('Connection error.'));
ws.addEventListener('close', () => setStatus('Disconnected.'));
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

updateReadyBtn();
