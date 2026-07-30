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

function sequence(values) {
  let index = 0;
  return () => values[index++];
}

function registryHarness(overrides = {}) {
  return createRoomRegistry({
    generateCode: () => 'ABC234',
    createPlayerId: sequence(['p1', 'p2']),
    createMatchId: () => MATCH_ID,
    createMatchSeed: () => MATCH_SEED,
    ...overrides,
  });
}

function prepareTwoPlayerRoom(registry) {
  const created = registry.createRoom({ name: 'Alpha' });
  assert.equal(Object.hasOwn(created.room, 'match'), false);
  const joined = registry.joinRoom({ code: 'ABC234', name: 'Beta' });
  assert.equal(joined.room.seq, 2);
  assert.equal(Object.hasOwn(joined.room, 'match'), false);
  return joined.room;
}

function request(type, requestId, fields = {}) {
  return JSON.stringify({ type, requestId, ...fields });
}

function createElement(id = '') {
  const listeners = new Map();
  const classes = new Set();
  return {
    id,
    value: '',
    textContent: '',
    disabled: false,
    children: [],
    style: {},
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
    appendChild(child) { this.children.push(child); },
    async dispatch(type, event = {}) {
      for (const listener of listeners.get(type) || []) await listener(event);
    },
  };
}

function runRoomClient(source) {
  const elements = new Map();
  const browserEvents = [];
  let socket;
  const getElement = (id) => {
    if (!elements.has(id)) elements.set(id, createElement(id));
    return elements.get(id);
  };

  class FakeWebSocket {
    constructor(url) {
      this.url = url;
      this.listeners = new Map();
      socket = this;
    }
    addEventListener(type, listener) {
      const current = this.listeners.get(type) || [];
      current.push(listener);
      this.listeners.set(type, current);
    }
    send() {}
    async emit(type, event = {}) {
      for (const listener of this.listeners.get(type) || []) await listener(event);
    }
  }

  class FakeCustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  }

  const windowListeners = new Map();
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
      body: { appendChild() {}, removeChild() {} },
      execCommand: () => false,
      getElementById: getElement,
      createElement: () => createElement(),
    },
    navigator: {},
    crypto: { randomUUID: () => 'request-id' },
    WebSocket: FakeWebSocket,
    CustomEvent: FakeCustomEvent,
    URL,
    URLSearchParams,
    Uint8Array,
    console,
  };

  vm.runInNewContext(source, sandbox, { filename: 'room-client.js' });
  return { browserEvents, getElement, socket };
}

function runGame(source) {
  const executable = source.replace(/^import .*;\s*$/gm, '');
  const elements = new Map();
  const generatedSeeds = [];
  const windowListeners = new Map();
  const getElement = (id) => {
    if (!elements.has(id)) {
      const element = createElement(id);
      if (id === 'game') {
        element.width = 300;
        element.height = 600;
        element.getContext = () => ({
          clearRect() {}, fillRect() {}, strokeRect() {}, fillText() {},
          beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
          save() {}, restore() {}, translate() {}, scale() {},
        });
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
      for (const listener of windowListeners.get(event.type) || []) listener(event);
      return true;
    },
  };
  const pieceTypes = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
  let pieceIndex = 0;
  const sandbox = {
    window: windowObject,
    document: {
      documentElement: {},
      getElementById: getElement,
      createElement: () => createElement(),
      addEventListener() {},
      querySelectorAll: () => [],
    },
    localStorage: { getItem: () => null, setItem() {} },
    crypto: { getRandomValues(array) { array[0] = 7; return array; } },
    Uint32Array,
    Audio: class {
      play() { return Promise.resolve(); }
      pause() {}
    },
    createSeededPieceSource(seed) {
      generatedSeeds.push(seed);
      return { next: () => pieceTypes[(pieceIndex++) % pieceTypes.length] };
    },
    createThemeRainBootstrap: () => ({ start() {}, dispose() {} }),
    computePreviewFrameLayout: () => ({}),
    drawPreviewFrame() {},
    bindIosDoubleTapGuard() {},
    scoreDrop: () => 0,
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
  return { elements, generatedSeeds, window: windowObject };
}

function matchState(match = { id: MATCH_ID, seed: MATCH_SEED, startedSeq: 4 }) {
  return {
    type: 'room_state',
    room: {
      code: 'ABC234',
      seq: 4,
      players: [
        { id: 'p1', name: 'Alpha', ready: true },
        { id: 'p2', name: 'Beta', ready: true },
      ],
      match,
    },
    self: { playerId: 'p1' },
  };
}

describe('Pass 02 server-authoritative match start', () => {
  it('creates one detached match atomically on the second Ready transition', () => {
    let idCalls = 0;
    let seedCalls = 0;
    const registry = registryHarness({
      createMatchId() { idCalls += 1; return MATCH_ID; },
      createMatchSeed() { seedCalls += 1; return MATCH_SEED; },
    });
    prepareTwoPlayerRoom(registry);

    const firstReady = registry.setPlayerReady({
      code: 'ABC234', playerId: 'p1', ready: true, expectedSeq: 2,
    });
    assert.equal(firstReady.seq, 3);
    assert.equal(Object.hasOwn(firstReady, 'match'), false);
    assert.equal(idCalls, 0);
    assert.equal(seedCalls, 0);

    const started = registry.setPlayerReady({
      code: 'ABC234', playerId: 'p2', ready: true, expectedSeq: 3,
    });
    assert.equal(started.seq, 4);
    assert.deepEqual(started.match, { id: MATCH_ID, seed: MATCH_SEED, startedSeq: 4 });
    assert.equal(idCalls, 1);
    assert.equal(seedCalls, 1);

    started.match.seed = 1;
    assert.equal(registry.getRoom('ABC234').match.seed, MATCH_SEED);
    assert.throws(
      () => registry.setPlayerReady({ code: 'ABC234', playerId: 'p1', ready: false, expectedSeq: 4 }),
      (error) => error?.code === 'match_started',
    );
    assert.equal(registry.getRoom('ABC234').seq, 4);
    assert.equal(registry.getRoom('ABC234').match.seed, MATCH_SEED);
  });

  it('uses cryptographic defaults and rejects malformed seed authority without mutation', async () => {
    const source = await read('room-registry.js');
    assert.match(source, /from\s+["']node:crypto["']/);
    assert.match(source, /\b(?:randomBytes|randomInt|webcrypto)\b/);
    assert.doesNotMatch(source, /Math\.random|Date\.now/);

    const registry = registryHarness({ createMatchSeed: () => -1 });
    prepareTwoPlayerRoom(registry);
    registry.setPlayerReady({ code: 'ABC234', playerId: 'p1', ready: true, expectedSeq: 2 });
    assert.throws(
      () => registry.setPlayerReady({ code: 'ABC234', playerId: 'p2', ready: true, expectedSeq: 3 }),
      (error) => error?.code === 'invalid_match_seed',
    );
    const unchanged = registry.getRoom('ABC234');
    assert.equal(unchanged.seq, 3);
    assert.equal(unchanged.players[1].ready, false);
    assert.equal(Object.hasOwn(unchanged, 'match'), false);
  });

  it('broadcasts the identical authoritative match snapshot to both sessions', () => {
    const sent = [];
    const protocol = createRoomProtocol({
      registry: registryHarness(),
      send(connectionId, message) { sent.push({ connectionId, message }); },
    });
    protocol.connect('c1');
    protocol.connect('c2');
    protocol.receive('c1', request('create_room', 'r1', { name: 'Alpha' }));
    protocol.receive('c2', request('join_room', 'r2', { code: 'ABC234', name: 'Beta' }));
    protocol.receive('c1', request('set_ready', 'r3', { ready: true, expectedSeq: 2 }));
    sent.length = 0;

    protocol.receive('c2', request('set_ready', 'r4', { ready: true, expectedSeq: 3 }));
    assert.equal(sent.length, 2);
    assert.deepEqual(sent.map(({ connectionId }) => connectionId), ['c1', 'c2']);
    assert.deepEqual(sent[0].message.room.match, { id: MATCH_ID, seed: MATCH_SEED, startedSeq: 4 });
    assert.deepEqual(sent[1].message.room.match, sent[0].message.room.match);
    assert.notEqual(sent[0].message.room.match, sent[1].message.room.match);
  });

  it('dispatches one validated browser start event and disables lobby readiness', async () => {
    const app = runRoomClient(await read('public/room-client.js'));
    const state = matchState();
    await app.socket.emit('message', { data: JSON.stringify(state) });
    await app.socket.emit('message', { data: JSON.stringify(state) });

    const starts = app.browserEvents.filter((event) => event.type === 'stacklogic:match-start');
    assert.equal(starts.length, 1);
    assert.deepEqual(
      JSON.parse(JSON.stringify(starts[0].detail)),
      { id: MATCH_ID, seed: MATCH_SEED, startedSeq: 4 },
    );
    assert.equal(app.getElement('roomReadyBtn').disabled, true);
    assert.match(app.getElement('roomReadyBtn').textContent, /started/i);

    await app.socket.emit('message', {
      data: JSON.stringify(matchState({ id: 'invalid-next', seed: -1, startedSeq: 4 })),
    });
    assert.equal(
      app.browserEvents.filter((event) => event.type === 'stacklogic:match-start').length,
      1,
    );
  });

  it('starts the existing game seam with the server seed while preserving solo Start', async () => {
    const source = await read('public/game.js');
    const multiplayer = runGame(source);
    assert.deepEqual(multiplayer.generatedSeeds, [7]);
    multiplayer.window.dispatchEvent({
      type: 'stacklogic:match-start',
      detail: { id: MATCH_ID, seed: MATCH_SEED, startedSeq: 4 },
    });
    assert.deepEqual(multiplayer.generatedSeeds, [7, MATCH_SEED]);
    assert.equal(multiplayer.elements.get('title').classList.contains('show'), false);

    const solo = runGame(source);
    await solo.elements.get('startBtn').dispatch('click');
    assert.deepEqual(solo.generatedSeeds, [7, 7]);
  });
});
