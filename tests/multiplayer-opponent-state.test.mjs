import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { describe, it } from 'node:test';
import vm from 'node:vm';
import { createRoomProtocol } from '../room-protocol.js';
import { createRoomRegistry } from '../room-registry.js';

const root = new URL('..', import.meta.url);
const read = (relative) => fs.readFile(new URL(relative, root), 'utf8');
const MATCH_ID = 'match-1';
const MATCH_SEED = 0x12345678;
const PIECES = new Set(['I', 'O', 'T', 'S', 'Z', 'J', 'L']);

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function sequence(values) {
  let index = 0;
  return () => values[index++];
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

function registryHarness() {
  return createRoomRegistry({
    generateCode: () => 'ABC234',
    createPlayerId: sequence(['p1', 'p2']),
    createMatchId: () => MATCH_ID,
    createMatchSeed: () => MATCH_SEED,
  });
}

function prepareStartedRegistry(registry) {
  registry.createRoom({ name: 'Alpha' });
  registry.joinRoom({ code: 'ABC234', name: 'Beta' });
  registry.setPlayerReady({ code: 'ABC234', playerId: 'p1', ready: true, expectedSeq: 2 });
  return registry.setPlayerReady({ code: 'ABC234', playerId: 'p2', ready: true, expectedSeq: 3 });
}

function request(type, requestId, fields = {}) {
  return JSON.stringify({ type, requestId, ...fields });
}

function prepareStartedProtocol(protocol, sent) {
  protocol.connect('c1');
  protocol.connect('c2');
  protocol.receive('c1', request('create_room', 'r1', { name: 'Alpha' }));
  protocol.receive('c2', request('join_room', 'r2', { code: 'ABC234', name: 'Beta' }));
  protocol.receive('c1', request('set_ready', 'r3', { ready: true, expectedSeq: 2 }));
  protocol.receive('c2', request('set_ready', 'r4', { ready: true, expectedSeq: 3 }));
  sent.length = 0;
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

function runGame(source) {
  const executable = source.replace(/^import .*;\s*$/gm, '');
  const elements = new Map();
  const browserEvents = [];
  const drawCalls = [];
  const windowListeners = new Map();
  const documentListeners = new Map();

  const getElement = (id) => {
    if (!elements.has(id)) {
      const element = createElement(id);
      if (id === 'game' || id === 'opponentGame') {
        element.width = id === 'game' ? 300 : 120;
        element.height = id === 'game' ? 600 : 240;
        const context = {
          clearRect(...args) { drawCalls.push({ kind: 'clear', id, args }); },
          fillRect() {},
          strokeRect() {},
          fillText() {},
          beginPath() {},
          moveTo() {},
          lineTo() {},
          stroke() {},
          save() {},
          restore() {},
          translate() {},
          scale() {},
        };
        element.getContext = () => context;
      }
      elements.set(id, element);
    }
    return elements.get(id);
  };

  const windowObject = {
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
  const documentObject = {
    documentElement: {},
    getElementById: getElement,
    createElement: () => createElement(),
    querySelectorAll: () => [],
    addEventListener(type, listener) {
      const current = documentListeners.get(type) || [];
      current.push(listener);
      documentListeners.set(type, current);
    },
    async dispatch(type, event = {}) {
      for (const listener of documentListeners.get(type) || []) await listener(event);
    },
  };

  const sandbox = {
    window: windowObject,
    document: documentObject,
    CustomEvent: FakeCustomEvent,
    localStorage: { getItem: () => null, setItem() {} },
    crypto: { getRandomValues(array) { array[0] = 7; return array; } },
    Uint32Array,
    Audio: class {
      play() { return Promise.resolve(); }
      pause() {}
    },
    createSeededPieceSource() {
      const pieceTypes = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
      let pieceIndex = 0;
      return { next: () => pieceTypes[(pieceIndex++) % pieceTypes.length] };
    },
    createThemeRainBootstrap: () => ({ start() {}, dispose() {} }),
    computePreviewFrameLayout: () => ({}),
    drawPreviewFrame() {},
    drawBrick(context, x, y, color, theme, size) {
      drawCalls.push({ kind: 'brick', context, x, y, color, theme, size });
    },
    drawBrickAt(context, x, y, color, theme, size) {
      drawCalls.push({ kind: 'brick-at', context, x, y, color, theme, size });
    },
    bindIosDoubleTapGuard() {},
    scoreDrop: (kind, distance) => kind === 'hard' ? distance * 2 : distance,
    scoreLineClear: () => 0,
    describeLevelChange: () => '',
    getProgression: () => ({ level: 1, dropIntervalMs: 1000, progressText: '0/10' }),
    requestAnimationFrame() {},
    performance: { now: () => 0 },
    prompt: () => null,
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    setInterval,
    clearInterval,
    console,
  };

  vm.runInNewContext(executable, sandbox, { filename: 'game.js' });
  return { browserEvents, document: documentObject, drawCalls, elements, getElement, window: windowObject };
}

function localStateEvents(app) {
  return app.browserEvents.filter((event) => event.type === 'stacklogic:local-state');
}

function multiplayerEndEvents(app) {
  return app.browserEvents.filter((event) => event.type === 'stacklogic:multiplayer-end');
}

describe('Pass 03 live opponent state', () => {
  it('stores only detached, valid, exactly sequenced player state without advancing room sequence', () => {
    const registry = registryHarness();
    const started = prepareStartedRegistry(registry);
    assert.equal(started.seq, 4);

    const pristine = registry.getRoom('ABC234');
    assert.throws(
      () => registry.updatePlayerState({
        code: 'ABC234',
        playerId: 'p1',
        matchId: MATCH_ID,
        updateSeq: 2,
        state: makeState(),
      }),
      (error) => {
        assert.equal(error?.code, 'stale_player_state');
        assert.equal(error.currentUpdateSeq, 0);
        return true;
      },
    );
    assert.deepEqual(registry.getRoom('ABC234'), pristine);

    const state = makeState({
      board: makeBoard([[19, 4, 'T']]),
      score: 24,
      lines: 2,
    });
    const updated = registry.updatePlayerState({
      code: 'ABC234',
      playerId: 'p1',
      matchId: MATCH_ID,
      updateSeq: 1,
      state,
    });

    assert.equal(updated.seq, 4);
    assert.deepEqual(updated.players[0].gameState, { updateSeq: 1, ...state });
    state.board[19][4] = 'I';
    updated.players[0].gameState.board[19][4] = 'O';
    assert.equal(registry.getRoom('ABC234').players[0].gameState.board[19][4], 'T');

    const before = registry.getRoom('ABC234');
    const invalidCases = [
      [{ matchId: 'foreign-match', updateSeq: 2, state: makeState() }, 'match_mismatch'],
      [{ matchId: MATCH_ID, updateSeq: 0, state: makeState() }, 'invalid_update_sequence'],
      [{ matchId: MATCH_ID, updateSeq: 1, state: makeState() }, 'stale_player_state'],
      [{ matchId: MATCH_ID, updateSeq: 3, state: makeState() }, 'stale_player_state'],
      [{ matchId: MATCH_ID, updateSeq: 2, state: makeState({ board: makeBoard().slice(1) }) }, 'invalid_player_state'],
      [{ matchId: MATCH_ID, updateSeq: 2, state: makeState({ board: makeBoard([[0, 0, 'X']]) }) }, 'invalid_player_state'],
      [{ matchId: MATCH_ID, updateSeq: 2, state: makeState({ score: Number.MAX_SAFE_INTEGER }) }, 'invalid_player_state'],
      [{ matchId: MATCH_ID, updateSeq: 2, state: { ...makeState(), extra: true } }, 'invalid_player_state'],
    ];
    for (const [fields, code] of invalidCases) {
      assert.throws(
        () => registry.updatePlayerState({ code: 'ABC234', playerId: 'p1', ...fields }),
        (error) => {
          assert.equal(error?.code, code);
          if (code === 'stale_player_state') assert.equal(error.currentUpdateSeq, 1);
          return true;
        },
      );
      assert.deepEqual(registry.getRoom('ABC234'), before);
    }

    const inheritedRequiredField = Object.assign(Object.create({ gameOver: false }), {
      board: makeBoard(),
      score: 0,
      lines: 0,
      extra: true,
    });
    assert.throws(
      () => registry.updatePlayerState({
        code: 'ABC234',
        playerId: 'p1',
        matchId: MATCH_ID,
        updateSeq: 2,
        state: inheritedRequiredField,
      }),
      (error) => error?.code === 'invalid_player_state',
    );
    assert.deepEqual(registry.getRoom('ABC234'), before);
  });

  it('acknowledges the sender, relays a detached opponent projection, and fails closed without broadcast', () => {
    const sent = [];
    const registry = registryHarness();
    const protocol = createRoomProtocol({
      registry,
      send(connectionId, message) { sent.push({ connectionId, message }); },
    });
    prepareStartedProtocol(protocol, sent);

    const state = makeState({ board: makeBoard([[19, 4, 'T']]), score: 36, lines: 3 });
    protocol.receive('c1', request('update_player_state', 'u1', {
      matchId: MATCH_ID,
      updateSeq: 1,
      state,
      playerId: 'p2',
    }));

    assert.deepEqual(plain(sent), [
      {
        connectionId: 'c1',
        message: {
          type: 'player_state_accepted',
          protocolVersion: 1,
          requestId: 'u1',
          matchId: MATCH_ID,
          updateSeq: 1,
        },
      },
      {
        connectionId: 'c2',
        message: {
          type: 'opponent_state',
          protocolVersion: 1,
          matchId: MATCH_ID,
          opponent: { name: 'Alpha', updateSeq: 1, ...state },
        },
      },
    ]);
    assert.equal(Object.hasOwn(sent[1].message.opponent, 'playerId'), false);
    sent[1].message.opponent.board[19][4] = 'O';
    assert.equal(registry.getRoom('ABC234').players[0].gameState.board[19][4], 'T');

    sent.length = 0;
    protocol.receive('c1', request('update_player_state', 'u2', {
      matchId: MATCH_ID,
      updateSeq: 1,
      state: makeState(),
    }));
    assert.deepEqual(plain(sent), [{
      connectionId: 'c1',
      message: {
        type: 'error',
        protocolVersion: 1,
        code: 'stale_player_state',
        currentUpdateSeq: 1,
        requestId: 'u2',
      },
    }]);
    assert.equal(registry.getRoom('ABC234').players[0].gameState.score, 36);

    for (const [requestId, fields, code] of [
      ['u3', { matchId: MATCH_ID, updateSeq: '2', state: makeState() }, 'invalid_update_sequence'],
      ['u4', { matchId: MATCH_ID, updateSeq: 2, state: null }, 'invalid_player_state'],
    ]) {
      sent.length = 0;
      const before = registry.getRoom('ABC234');
      protocol.receive('c1', request('update_player_state', requestId, fields));
      assert.deepEqual(plain(sent), [{
        connectionId: 'c1',
        message: {
          type: 'error',
          protocolVersion: 1,
          code,
          requestId,
        },
      }]);
      assert.deepEqual(registry.getRoom('ABC234'), before);
    }
  });

  it('bridges only validated active-match local and opponent state with independent exact sequences', async () => {
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

  it('ignores malformed browser bridge envelopes without throwing', async () => {
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

  it('requires own exact local state keys', async () => {
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

  it('reports meaningful multiplayer transitions and renders one responsive hidden-by-default opponent panel', async () => {
    const [gameSource, indexHtml, style] = await Promise.all([
      read('public/game.js'),
      read('public/index.html'),
      read('public/style.css'),
    ]);
    assert.match(indexHtml, /<aside[^>]+id="opponentPanel"[^>]+hidden/);
    assert.match(indexHtml, /<canvas[^>]+id="opponentGame"[^>]+width="120"[^>]+height="240"/);
    for (const id of ['opponentName', 'opponentScore', 'opponentLines', 'opponentStatus']) {
      assert.match(indexHtml, new RegExp(`id="${id}"`));
    }
    assert.match(indexHtml, /style\.css\?v=0\.3\.0-beta\.1&rev=opponent-state-1/);
    assert.match(indexHtml, /game\.js\?v=0\.3\.0-beta\.1&rev=opponent-state-1/);
    assert.match(indexHtml, /room-client\.js\?v=0\.3\.0-beta\.1&rev=opponent-state-1/);
    assert.match(style, /\.opponent-panel\s*\{/);
    assert.match(style, /grid-template-columns:\s*220px\s+300px\s+160px/);
    assert.match(style, /@media\s*\(max-width:\s*760px\)[\s\S]*\.opponent-panel/);

    const solo = runGame(gameSource);
    assert.equal(solo.getElement('opponentPanel').hidden, true);
    assert.equal(localStateEvents(solo).length, 0);
    await solo.getElement('startBtn').dispatch('click');
    assert.equal(localStateEvents(solo).length, 0);
    assert.equal(solo.getElement('opponentPanel').hidden, true);

    const multiplayer = runGame(gameSource);
    multiplayer.window.dispatchEvent(new FakeCustomEvent('stacklogic:match-start', {
      detail: { id: MATCH_ID, seed: MATCH_SEED, startedSeq: 4 },
    }));
    assert.equal(multiplayer.getElement('opponentPanel').hidden, false);
    assert.equal(multiplayer.getElement('opponentStatus').textContent, 'Waiting for opponent');

    let reports = localStateEvents(multiplayer);
    assert.equal(reports.length, 1);
    assert.deepEqual(plain(reports[0].detail), {
      matchId: MATCH_ID,
      board: makeBoard(),
      score: 0,
      lines: 0,
      gameOver: false,
    });

    await multiplayer.document.dispatch('keydown', { key: 'ArrowLeft' });
    await multiplayer.document.dispatch('keydown', { key: 'ArrowUp' });
    assert.equal(localStateEvents(multiplayer).length, 1);

    await multiplayer.document.dispatch('keydown', { key: ' ', preventDefault() {} });
    reports = localStateEvents(multiplayer);
    assert.equal(reports.length, 2);
    assert.equal(reports[1].detail.matchId, MATCH_ID);
    assert.equal(reports[1].detail.gameOver, false);
    assert.ok(reports[1].detail.score > 0);
    assert.equal(reports[1].detail.board.flat().filter((cell) => PIECES.has(cell)).length, 4);

    const opponentBoard = makeBoard([[19, 4, 'T']]);
    multiplayer.window.dispatchEvent(new FakeCustomEvent('stacklogic:opponent-state', {
      detail: {
        matchId: MATCH_ID,
        opponent: { name: 'Beta', updateSeq: 1, board: opponentBoard, score: 18, lines: 2, gameOver: false },
      },
    }));
    assert.equal(multiplayer.getElement('opponentName').textContent, 'Beta');
    assert.equal(multiplayer.getElement('opponentScore').textContent, '18');
    assert.equal(multiplayer.getElement('opponentLines').textContent, '2');
    assert.equal(multiplayer.getElement('opponentStatus').textContent, 'Playing');
    assert.ok(multiplayer.drawCalls.some((call) => call.kind === 'brick-at' || call.kind === 'brick'));

    multiplayer.window.dispatchEvent(new FakeCustomEvent('stacklogic:opponent-state', {
      detail: {
        matchId: MATCH_ID,
        opponent: { name: 'Bad', updateSeq: 2, board: makeBoard([[0, 0, 'X']]), score: 99, lines: 9, gameOver: true },
      },
    }));
    assert.equal(multiplayer.getElement('opponentName').textContent, 'Beta');
    assert.equal(multiplayer.getElement('opponentScore').textContent, '18');

    const reportsBeforeHome = localStateEvents(multiplayer).length;
    await multiplayer.document.dispatch('keydown', { key: 'r' });
    assert.equal(multiplayer.getElement('opponentPanel').hidden, true);
    assert.deepEqual(plain(multiplayerEndEvents(multiplayer).map((event) => event.detail)), [{ matchId: MATCH_ID }]);
    assert.equal(localStateEvents(multiplayer).length, reportsBeforeHome);

    const drawsBeforeStaleOpponent = multiplayer.drawCalls.length;
    multiplayer.window.dispatchEvent(new FakeCustomEvent('stacklogic:opponent-state', {
      detail: {
        matchId: MATCH_ID,
        opponent: { name: 'Beta', updateSeq: 2, board: makeBoard([[19, 3, 'L']]), score: 28, lines: 3, gameOver: false },
      },
    }));
    assert.equal(multiplayer.getElement('opponentPanel').hidden, true);
    assert.equal(multiplayer.drawCalls.length, drawsBeforeStaleOpponent);

    await multiplayer.getElement('startBtn').dispatch('click');
    assert.equal(multiplayer.getElement('opponentPanel').hidden, true);
    assert.equal(multiplayerEndEvents(multiplayer).length, 1);
    assert.equal(localStateEvents(multiplayer).length, reportsBeforeHome);
  });

  it('bridges only exact active-match result and rematch envelopes', async () => {
    const app = runRoomClient(await read('public/room-client.js'));
    await app.socket.emit('message', { data: JSON.stringify(matchState()) });
    const result = { type: 'match_result', protocolVersion: 1, matchId: MATCH_ID, winnerId: 'p2', loserId: 'p1' };
    await app.socket.emit('message', { data: JSON.stringify({ ...result, extra: true }) });
    assert.equal(app.browserEvents.filter((event) => event.type === 'stacklogic:match-result').length, 0);
    await app.socket.emit('message', { data: JSON.stringify(result) });
    assert.deepEqual(plain(app.browserEvents.filter((event) => event.type === 'stacklogic:match-result').map((event) => event.detail)), [{ matchId: MATCH_ID, didWin: false, winnerName: 'Beta' }]);

    app.window.dispatchEvent(new FakeCustomEvent('stacklogic:rematch-request', { detail: { matchId: MATCH_ID } }));
    assert.deepEqual(app.sentMessages.map(({ type, matchId }) => ({ type, matchId })), [
      { type: 'request_rematch', matchId: MATCH_ID },
    ]);
    await app.socket.emit('message', { data: JSON.stringify({ type: 'rematch_status', protocolVersion: 1, matchId: MATCH_ID, acceptedPlayerIds: ['p1'], extra: true }) });
    assert.equal(app.browserEvents.filter((event) => event.type === 'stacklogic:rematch-status').length, 0);
    await app.socket.emit('message', { data: JSON.stringify({ type: 'rematch_status', protocolVersion: 1, matchId: MATCH_ID, acceptedPlayerIds: ['p1'] }) });
    assert.deepEqual(plain(app.browserEvents.filter((event) => event.type === 'stacklogic:rematch-status').map((event) => event.detail)), [{ matchId: MATCH_ID, acceptedPlayerIds: ['p1'] }]);
  });

  it('clears completed multiplayer state before Home and Solo gameplay', async () => {
    const app = runGame(await read('public/game.js'));
    app.window.dispatchEvent(new FakeCustomEvent('stacklogic:match-start', {
      detail: { id: MATCH_ID, seed: MATCH_SEED, startedSeq: 4 },
    }));
    app.window.dispatchEvent(new FakeCustomEvent('stacklogic:match-result', {
      detail: { matchId: MATCH_ID, didWin: true, winnerName: 'Alpha' },
    }));

    assert.equal(app.getElement('opponentPanel').hidden, false);
    assert.equal(app.getElement('victoryFireworks').hidden, false);
    assert.equal(app.getElement('rematchBtn').disabled, false);

    app.window.dispatchEvent(new FakeCustomEvent('stacklogic:rematch-status', {
      detail: { matchId: 'stale-match', acceptedPlayerIds: ['p2'] },
    }));
    assert.equal(app.getElement('rematchBtn').textContent, 'Rematch');

    await app.document.dispatch('keydown', { key: 'r' });
    assert.equal(app.getElement('opponentPanel').hidden, true);
    assert.equal(app.getElement('victoryFireworks').hidden, true);
    assert.equal(app.getElement('rematchBtn').disabled, true);
    assert.deepEqual(
      plain(app.browserEvents.filter((event) => event.type === 'stacklogic:multiplayer-abandon').map((event) => event.detail)),
      [{ matchId: MATCH_ID }],
    );

    await app.getElement('startBtn').dispatch('click');
    await app.getElement('rematchBtn').dispatch('click');
    assert.equal(app.browserEvents.filter((event) => event.type === 'stacklogic:rematch-request').length, 0);
  });

  it('treats Rematch acceptance as committed until the next match starts', async () => {
    const app = runGame(await read('public/game.js'));
    app.window.dispatchEvent(new FakeCustomEvent('stacklogic:match-start', {
      detail: { id: MATCH_ID, seed: MATCH_SEED, startedSeq: 4 },
    }));
    app.window.dispatchEvent(new FakeCustomEvent('stacklogic:match-result', {
      detail: { matchId: MATCH_ID, didWin: true, winnerName: 'Alpha' },
    }));
    await app.getElement('rematchBtn').dispatch('click');
    await app.document.dispatch('keydown', { key: 'r' });
    await app.getElement('startBtn').dispatch('click');

    assert.equal(app.getElement('gameOver').classList.contains('show'), true);
    assert.equal(app.getElement('opponentPanel').hidden, false);
    assert.equal(app.browserEvents.filter((event) => event.type === 'stacklogic:multiplayer-abandon').length, 0);
    assert.deepEqual(plain(app.browserEvents.filter((event) => event.type === 'stacklogic:rematch-request').map((event) => event.detail)), [{ matchId: MATCH_ID }]);
  });

  it('waits for the authoritative result, freezes the match, and preserves the finished ID for rematch', async () => {
    const app = runGame(await read('public/game.js'));
    app.window.dispatchEvent(new FakeCustomEvent('stacklogic:match-start', {
      detail: { id: MATCH_ID, seed: MATCH_SEED, startedSeq: 4 },
    }));

    for (let attempt = 0; attempt < 100 && !localStateEvents(app).at(-1)?.detail.gameOver; attempt++) {
      await app.document.dispatch('keydown', { key: ' ', preventDefault() {} });
    }

    const reports = localStateEvents(app);
    assert.ok(reports.length > 1);
    assert.equal(reports.at(-1).detail.gameOver, true);
    assert.equal(multiplayerEndEvents(app).length, 0);
    assert.equal(app.getElement('opponentPanel').hidden, false);

    app.window.dispatchEvent(new FakeCustomEvent('stacklogic:match-result', {
      detail: { matchId: MATCH_ID, didWin: false, winnerName: 'Beta' },
    }));
    assert.equal(app.getElement('gameResultTitle').textContent, 'Defeat');
    assert.match(app.getElement('gameOverText').textContent, /Beta won/);
    assert.equal(app.getElement('victoryFireworks').hidden, true);
    assert.equal(app.getElement('opponentStatus').textContent, 'Beta wins! ✦');
    assert.equal(app.getElement('rematchBtn').disabled, false);

    await app.getElement('rematchBtn').dispatch('click');
    assert.deepEqual(plain(app.browserEvents.filter((event) => event.type === 'stacklogic:rematch-request').map((event) => event.detail)), [{ matchId: MATCH_ID }]);

    app.window.dispatchEvent(new FakeCustomEvent('stacklogic:match-start', {
      detail: { id: 'match-2', seed: 9, startedSeq: 5 },
    }));
    assert.equal(app.getElement('gameOver').classList.contains('show'), false);
    assert.equal(app.getElement('opponentPanel').hidden, false);
    assert.equal(localStateEvents(app).at(-1).detail.matchId, 'match-2');
  });
});
