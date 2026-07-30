import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const root = new URL('..', import.meta.url);
const read = (relative) => fs.readFile(new URL(relative, root), 'utf8');
const MATCH_ID = 'match-1';
const MATCH_SEED = 0x12345678;

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeBoard(entries = []) {
  const board = Array.from({ length: 20 }, () => Array(10).fill(null));
  for (const [row, column, piece] of entries) board[row][column] = piece;
  return board;
}

function makeState(overrides = {}) {
  return {
    board: makeBoard(),
    score: 0,
    lines: 0,
    gameOver: false,
    ...overrides,
  };
}

function createElement(id = '') {
  const listeners = new Map();
  const classes = new Set();
  const attributes = new Map();
  return {
    id,
    value: '',
    textContent: '',
    disabled: false,
    hidden: id === 'opponentPanel',
    children: [],
    style: {},
    parentNode: null,
    classList: {
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); },
      contains(name) { return classes.has(name); },
    },
    addEventListener(type, listener) {
      const current = listeners.get(type) || [];
      current.push(listener);
      listeners.set(type, current);
    },
    appendChild(child) { child.parentNode = this; this.children.push(child); },
    removeChild(child) { this.children = this.children.filter((item) => item !== child); child.parentNode = null; },
    select() {},
    focus() {},
    closest() { return null; },
    getAttribute(name) { return attributes.get(name) ?? null; },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    async dispatch(type, event = {}) {
      for (const listener of listeners.get(type) || []) await listener(event);
    },
  };
}

class FakeCustomEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }
}

function runRoomClient(source) {
  const elements = new Map();
  const browserEvents = [];
  const sentMessages = [];
  const windowListeners = new Map();
  let socket;
  let requestCounter = 0;

  const getElement = (id) => {
    if (!elements.has(id)) elements.set(id, createElement(id));
    return elements.get(id);
  };

  class FakeWebSocket {
    static OPEN = 1;
    constructor(url) {
      this.url = url;
      this.listeners = new Map();
      this.readyState = FakeWebSocket.OPEN;
      socket = this;
    }
    addEventListener(type, listener) {
      const current = this.listeners.get(type) || [];
      current.push(listener);
      this.listeners.set(type, current);
    }
    send(raw) { sentMessages.push(JSON.parse(raw)); }
    async emit(type, event = {}) {
      if (type === 'close') this.readyState = 3;
      for (const listener of this.listeners.get(type) || []) await listener(event);
    }
  }

  const location = {
    protocol: 'https:',
    host: 'game.example',
    origin: 'https://game.example',
    pathname: '/play',
    search: '',
  };
  const windowObject = {
    location,
    CustomEvent: FakeCustomEvent,
    addEventListener(type, listener) {
      const current = windowListeners.get(type) || [];
      current.push(listener);
      windowListeners.set(type, current);
    },
    dispatchEvent(event) {
      browserEvents.push(event);
      for (const listener of windowListeners.get(event.type) || []) listener(event);
      return true;
    },
  };
  const sandbox = {
    window: windowObject,
    document: {
      body: createElement('body'),
      execCommand: () => false,
      getElementById: getElement,
      createElement: () => createElement(),
    },
    navigator: {},
    crypto: { randomUUID: () => `request-${++requestCounter}` },
    WebSocket: FakeWebSocket,
    CustomEvent: FakeCustomEvent,
    URL,
    URLSearchParams,
    Uint8Array,
    console,
  };

  vm.runInNewContext(source, sandbox, { filename: 'room-client.js' });
  return { browserEvents, getElement, sentMessages, socket, window: windowObject };
}

function matchState(selfPlayerId = 'p1') {
  return {
    type: 'room_state',
    protocolVersion: 1,
    room: {
      code: 'ABC234',
      seq: 4,
      players: [
        { id: 'p1', name: 'Alpha', ready: true },
        { id: 'p2', name: 'Beta', ready: true },
      ],
      match: { id: MATCH_ID, seed: MATCH_SEED, startedSeq: 4 },
    },
    self: { playerId: selfPlayerId },
  };
}

test('bridges only validated active-match local and opponent state with independent exact sequences', async () => {
    const app = runRoomClient(await read('public/room-client.js'));
    await app.socket.emit('message', { data: JSON.stringify(matchState()) });
    app.sentMessages.length = 0;

    const first = makeState({ board: makeBoard([[19, 4, 'I']]), score: 32 });
    app.window.dispatchEvent(new FakeCustomEvent('stacklogic:local-state', {
      detail: { matchId: MATCH_ID, ...first },
    }));
    app.window.dispatchEvent(new FakeCustomEvent('stacklogic:local-state', {
      detail: { matchId: 'foreign-match', ...makeState() },
    }));
    app.window.dispatchEvent(new FakeCustomEvent('stacklogic:local-state', {
      detail: { matchId: MATCH_ID, ...makeState({ board: makeBoard([[0, 0, 'X']]) }) },
    }));
    const second = makeState({ board: makeBoard([[19, 3, 'O']]), score: 40, lines: 1 });
    app.window.dispatchEvent(new FakeCustomEvent('stacklogic:local-state', {
      detail: { matchId: MATCH_ID, ...second },
    }));

    await app.socket.emit('message', { data: JSON.stringify(matchState()) });
    assert.equal(app.browserEvents.filter((event) => event.type === 'stacklogic:match-start').length, 1);
    const third = makeState({ board: makeBoard([[18, 3, 'S']]), score: 44, lines: 1 });
    app.window.dispatchEvent(new FakeCustomEvent('stacklogic:local-state', {
      detail: { matchId: MATCH_ID, ...third },
    }));

    assert.equal(app.sentMessages.length, 3);
    assert.deepEqual(
      app.sentMessages.map(({ type, matchId, updateSeq, state }) => ({ type, matchId, updateSeq, state })),
      [
        { type: 'update_player_state', matchId: MATCH_ID, updateSeq: 1, state: first },
        { type: 'update_player_state', matchId: MATCH_ID, updateSeq: 2, state: second },
        { type: 'update_player_state', matchId: MATCH_ID, updateSeq: 3, state: third },
      ],
    );
    first.board[19][4] = 'Z';
    assert.equal(app.sentMessages[0].state.board[19][4], 'I');

    const opponent1 = {
      type: 'opponent_state',
      protocolVersion: 1,
      matchId: MATCH_ID,
      opponent: { name: 'Beta', updateSeq: 1, ...makeState({ board: makeBoard([[19, 5, 'T']]), score: 18 }) },
    };
    await app.socket.emit('message', { data: JSON.stringify(opponent1) });
    await app.socket.emit('message', { data: JSON.stringify(opponent1) });
    await app.socket.emit('message', { data: JSON.stringify({
      ...opponent1,
      opponent: { ...opponent1.opponent, updateSeq: 3 },
    }) });
    await app.socket.emit('message', { data: JSON.stringify({
      ...opponent1,
      matchId: 'foreign-match',
      opponent: { ...opponent1.opponent, updateSeq: 2 },
    }) });
    const opponent2 = {
      ...opponent1,
      opponent: { name: 'Beta', updateSeq: 2, ...makeState({ board: makeBoard([[19, 2, 'L']]), score: 28, lines: 2 }) },
    };
    await app.socket.emit('message', { data: JSON.stringify(opponent2) });

    const relayed = app.browserEvents.filter((event) => event.type === 'stacklogic:opponent-state');
    assert.equal(relayed.length, 2);
    assert.deepEqual(plain(relayed.map((event) => event.detail)), [
      { matchId: MATCH_ID, opponent: opponent1.opponent },
      { matchId: MATCH_ID, opponent: opponent2.opponent },
    ]);
    opponent2.opponent.board[19][2] = 'Z';
    assert.equal(relayed[1].detail.opponent.board[19][2], 'L');

    app.window.dispatchEvent(new FakeCustomEvent('stacklogic:multiplayer-end', {
      detail: { matchId: MATCH_ID },
    }));
    app.window.dispatchEvent(new FakeCustomEvent('stacklogic:local-state', {
      detail: { matchId: MATCH_ID, ...makeState({ score: 99 }) },
    }));
    await app.socket.emit('message', { data: JSON.stringify({
      ...opponent1,
      opponent: { ...opponent1.opponent, updateSeq: 3 },
    }) });
    assert.equal(app.sentMessages.length, 3);
    assert.equal(app.browserEvents.filter((event) => event.type === 'stacklogic:opponent-state').length, 2);

    const closed = runRoomClient(await read('public/room-client.js'));
    await closed.socket.emit('message', { data: JSON.stringify(matchState()) });
    await closed.socket.emit('close');
    closed.window.dispatchEvent(new FakeCustomEvent('stacklogic:local-state', {
      detail: { matchId: MATCH_ID, ...makeState() },
    }));
    assert.equal(closed.sentMessages.length, 0);
});

test('ignores malformed browser bridge envelopes without throwing', async () => {
  const app = runRoomClient(await read('public/room-client.js'));
  await app.socket.emit('message', { data: JSON.stringify(matchState()) });
  app.sentMessages.length = 0;

  assert.doesNotThrow(() => app.window.dispatchEvent(new FakeCustomEvent('stacklogic:local-state', { detail: null })));
  assert.doesNotThrow(() => app.window.dispatchEvent(new FakeCustomEvent('stacklogic:multiplayer-end', { detail: null })));
  await assert.doesNotReject(() => app.socket.emit('message', { data: 'null' }));
  await assert.doesNotReject(() => app.socket.emit('message', { data: JSON.stringify({
    type: 'opponent_state',
    protocolVersion: 1,
    matchId: MATCH_ID,
    opponent: null,
  }) }));

  assert.equal(app.sentMessages.length, 0);
  assert.equal(app.browserEvents.filter((event) => event.type === 'stacklogic:opponent-state').length, 0);
});

test('requires own exact local state keys', async () => {
  const app = runRoomClient(await read('public/room-client.js'));
  await app.socket.emit('message', { data: JSON.stringify(matchState()) });
  app.sentMessages.length = 0;

  const inheritedBoard = Object.create({ board: makeBoard([[19, 0, 'I']]) });
  Object.assign(inheritedBoard, {
    matchId: MATCH_ID,
    score: 10,
    lines: 1,
    gameOver: false,
    extra: true,
  });
  app.window.dispatchEvent(new FakeCustomEvent('stacklogic:local-state', { detail: inheritedBoard }));

  assert.equal(app.sentMessages.length, 0);
});
