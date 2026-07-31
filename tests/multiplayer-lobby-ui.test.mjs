import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const root = new URL('..', import.meta.url);
const read = (relative) => fs.readFile(new URL(relative, root), 'utf8');

function createElement(id = '') {
  const listeners = new Map();
  return {
    id,
    value: '',
    _textContent: '',
    get textContent() { return this._textContent; },
    set textContent(value) {
      this._textContent = value;
      if (value === '') this.children.length = 0;
    },
    disabled: id === 'copyCodeBtn' || id === 'copyInviteLinkBtn',
    children: [],
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

function runRoomClient(client, { search = '', modernClipboard = true, host = 'game.example', socketReadyState = 1 } = {}) {
  const elements = new Map();
  const messages = [];
  const copied = [];
  let clipboardFailure = false;
  let legacyCopySuccess = true;
  let legacyCopyThrows = false;
  let selectedCopyNode = null;
  const fallbackNodes = new Set();
  const windowListeners = new Map();
  let socket;

  const getElement = (id) => {
    if (!elements.has(id)) elements.set(id, createElement(id));
    return elements.get(id);
  };

  class FakeWebSocket {
    constructor(url) {
      this.url = url;
      this.listeners = new Map();
      this.readyState = socketReadyState;
      socket = this;
    }
    addEventListener(type, listener) {
      const current = this.listeners.get(type) || [];
      current.push(listener);
      this.listeners.set(type, current);
    }
    send(payload) { messages.push(JSON.parse(payload)); }
    async emit(type, event = {}) {
      if (type === 'open') this.readyState = FakeWebSocket.OPEN;
      if (type === 'close') this.readyState = FakeWebSocket.CLOSED;
      for (const listener of this.listeners.get(type) || []) await listener(event);
    }
  }
  FakeWebSocket.CONNECTING = 0;
  FakeWebSocket.OPEN = 1;
  FakeWebSocket.CLOSED = 3;

  const protocol = modernClipboard ? 'https:' : 'http:';
  const origin = `${protocol}//${host}`;
  const location = {
    protocol,
    host,
    hostname: host,
    origin,
    pathname: '/play',
    href: `${origin}/play${search}`,
    search,
  };
  const windowObject = {
    location,
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
  const sandbox = {
    window: windowObject,
    document: {
      body: {
        appendChild(node) {
          fallbackNodes.add(node);
          node.parentNode = this;
        },
        removeChild(node) {
          fallbackNodes.delete(node);
          node.parentNode = null;
          if (selectedCopyNode === node) selectedCopyNode = null;
        },
      },
      execCommand(command) {
        if (legacyCopyThrows) throw new Error('legacy copy failed');
        if (command !== 'copy' || !legacyCopySuccess || !selectedCopyNode) return false;
        copied.push(selectedCopyNode.value);
        return true;
      },
      getElementById: getElement,
      createElement: () => {
        const element = createElement();
        element.style = {};
        element.setAttribute = () => {};
        element.select = () => { selectedCopyNode = element; };
        element.remove = () => {
          if (selectedCopyNode === element) selectedCopyNode = null;
        };
        return element;
      },
    },
    navigator: modernClipboard ? {
      clipboard: {
        async writeText(text) {
          if (clipboardFailure) throw new Error('clipboard unavailable');
          copied.push(text);
        },
      },
    } : {},
    crypto: { randomUUID: () => 'request-id' },
    WebSocket: FakeWebSocket,
    URL,
    URLSearchParams,
    Uint8Array,
    console,
  };

  vm.runInNewContext(client, sandbox, { filename: 'room-client.js' });
  return {
    copied,
    elements,
    getElement,
    getFallbackNodeCount() { return fallbackNodes.size; },
    messages,
    setClipboardFailure(value) { clipboardFailure = value; },
    setLegacyCopySuccess(value) { legacyCopySuccess = value; },
    setLegacyCopyThrows(value) { legacyCopyThrows = value; },
    socket,
  };
}

describe('multiplayer lobby UI contract', () => {
  it('ships an enabled create/join lobby and a browser room client', async () => {
    const [html, client] = await Promise.all([
      read('public/index.html'),
      read('public/room-client.js'),
    ]);

    assert.match(html, /id="multiplayerLobby"/);
    assert.match(html, /id="createMatchBtn"[^>]*type="button"/);
    assert.match(html, /id="joinMatchBtn"[^>]*type="button"/);
    assert.doesNotMatch(html, /id="createMatchBtn"[^>]*\bdisabled\b/);
    assert.doesNotMatch(html, /id="joinMatchBtn"[^>]*\bdisabled\b/);
    assert.doesNotMatch(html, /Coming Soon/);
    assert.match(html, /id="roomName"/);
    assert.match(html, /id="roomCode"/);
    assert.match(html, /id="roomStatus"/);
    assert.match(html, /id="roomPlayers"/);
    assert.match(html, /id="roomReadyBtn"[^>]*\bdisabled\b/);
    assert.match(html, /<script type="module" src="room-client\.js\?v=0\.3\.0-beta\.1&rev=public-ws-3"><\/script>/);

    assert.match(client, /new WebSocket\(/);
    assert.match(client, /create_room/);
    assert.match(client, /join_room/);
    assert.match(client, /set_ready/);
    assert.match(client, /room_state/);
    assert.match(client, /els\.roomCode\.value\s*=\s*prefilledRoom/);
    assert.doesNotMatch(client, /prefilledRoom\s*&&\s*els\.roomName/);
    assert.match(client, /p\.ready\s*\?\s*['"]Ready['"]\s*:\s*['"]Not ready['"]/);
    assert.match(client, /players\?\.find\(p => p\.id === selfPlayerId\)/);
    assert.doesNotMatch(client, /p\.playerId === selfPlayerId/);
    assert.match(client, /updateReadyBtn\(\);\s*$/m);
    assert.match(client, /crypto\.randomUUID\(\)/);
    assert.doesNotMatch(client, /Math\.random/);
  });

  it('uses the public production socket on GitHub Pages and gates lobby controls on connection state', async () => {
    const client = await read('public/room-client.js');
    const app = runRoomClient(client, {
      host: 'alexgeslani.github.io',
      socketReadyState: 0,
    });

    assert.equal(app.socket.url, 'wss://stacklogic.alexgeslani.com/ws');
    assert.equal(app.getElement('createMatchBtn').disabled, true);
    assert.equal(app.getElement('joinMatchBtn').disabled, true);
    assert.equal(app.getElement('roomReadyBtn').disabled, true);
    assert.match(app.getElement('roomStatus').textContent, /connect/i);

    await app.socket.emit('open');
    assert.equal(app.getElement('createMatchBtn').disabled, false);
    assert.equal(app.getElement('joinMatchBtn').disabled, false);
    assert.equal(app.getElement('roomReadyBtn').disabled, true);

    await app.socket.emit('message', { data: JSON.stringify({
      type: 'room_state',
      room: { code: 'ABC234', seq: 1, players: [{ id: 'p1', name: 'Alpha', ready: false }] },
      self: { playerId: 'p1' },
    }) });
    assert.equal(app.getElement('roomReadyBtn').disabled, false);

    await app.socket.emit('close');
    assert.equal(app.getElement('createMatchBtn').disabled, true);
    assert.equal(app.getElement('joinMatchBtn').disabled, true);
    assert.equal(app.getElement('roomReadyBtn').disabled, true);
    assert.equal(app.getElement('copyCodeBtn').disabled, true);
    assert.equal(app.getElement('copyInviteLinkBtn').disabled, true);
    assert.equal(app.getElement('roomPlayers').children.length, 0);
    assert.equal(app.getElement('roomStatus').textContent, 'Disconnected.');
  });

  it('normalizes join input, pasted invite URLs, and direct room prefills', async () => {
    const client = await read('public/room-client.js');
    const app = runRoomClient(client);
    app.getElement('roomName').value = 'Alex';
    app.getElement('roomCode').value = 'a b-c d-2 3';

    await app.getElement('joinMatchBtn').dispatch('click');
    assert.deepEqual(app.messages.at(-1), {
      type: 'join_room',
      requestId: 'request-id',
      code: 'ABCD23',
      name: 'Alex',
    });

    let prevented = false;
    await app.getElement('roomCode').dispatch('paste', {
      clipboardData: { getData: () => 'https://game.example/play?room=a-b%20c-d23&name=secret' },
      preventDefault() { prevented = true; },
    });
    assert.equal(prevented, true);
    assert.equal(app.getElement('roomCode').value, 'ABCD23');

    const prefilled = runRoomClient(client, { search: '?room=a-b%20c-d23' });
    assert.equal(prefilled.getElement('roomCode').value, 'ABCD23');
  });

  it('exposes safe accessible copy controls only after room state', async () => {
    const [html, client] = await Promise.all([
      read('public/index.html'),
      read('public/room-client.js'),
    ]);
    const copyCodeTag = html.match(/<button\b[^>]*\bid="copyCodeBtn"[^>]*>\s*Copy Code\s*<\/button>/)?.[0];
    const copyInviteTag = html.match(/<button\b[^>]*\bid="copyInviteLinkBtn"[^>]*>\s*Copy Invite Link\s*<\/button>/)?.[0];
    assert.ok(copyCodeTag, 'Copy Code button must have an accessible text label');
    assert.ok(copyInviteTag, 'Copy Invite Link button must have an accessible text label');
    assert.match(copyCodeTag, /\btype="button"/);
    assert.match(copyInviteTag, /\btype="button"/);
    assert.match(copyCodeTag, /\bdisabled\b/);
    assert.match(copyInviteTag, /\bdisabled\b/);
    assert.doesNotMatch(client, /\b(?:alert|prompt)\s*\(/);

    const app = runRoomClient(client);
    assert.equal(app.getElement('copyCodeBtn').disabled, true);
    assert.equal(app.getElement('copyInviteLinkBtn').disabled, true);

    await app.socket.emit('message', {
      data: JSON.stringify({
        type: 'room_state',
        requestId: 'server-secret',
        token: 'never-copy-me',
        room: {
          code: 'ab-cd 23',
          seq: 1,
          players: [{ id: 'player-1', name: 'Alex', ready: false }],
        },
        self: { playerId: 'player-1' },
      }),
    });
    assert.equal(app.getElement('copyCodeBtn').disabled, false);
    assert.equal(app.getElement('copyInviteLinkBtn').disabled, false);

    // Copy controls must remain bound to the active room, not editable join input.
    app.getElement('roomCode').value = 'zz-zz 99';

    await app.getElement('copyCodeBtn').dispatch('click');
    assert.equal(app.copied.at(-1), 'ABCD23');
    assert.match(app.getElement('roomStatus').textContent, /cop/i);

    await app.getElement('copyInviteLinkBtn').dispatch('click');
    const invite = new URL(app.copied.at(-1));
    assert.equal(invite.origin, 'https://game.example');
    assert.equal(invite.pathname, '/play');
    assert.deepEqual([...invite.searchParams.keys()], ['room']);
    assert.equal(invite.searchParams.get('room'), 'ABCD23');
    assert.doesNotMatch(invite.href, /Alex|player-1|request-id|server-secret|never-copy-me/);

    app.setClipboardFailure(true);
    await app.getElement('copyCodeBtn').dispatch('click');
    assert.match(app.getElement('roomStatus').textContent, /fail|unable/i);
  });

  it('copies active-room values through the insecure-origin fallback', async () => {
    const client = await read('public/room-client.js');
    const app = runRoomClient(client, { modernClipboard: false });
    await app.socket.emit('message', {
      data: JSON.stringify({
        type: 'room_state',
        room: {
          code: 'ab-cd 23',
          seq: 1,
          players: [{ id: 'player-1', name: 'Alex', ready: false }],
        },
        self: { playerId: 'player-1' },
      }),
    });
    app.getElement('roomCode').value = 'zz-zz 99';

    await app.getElement('copyCodeBtn').dispatch('click');
    assert.equal(app.copied.at(-1), 'ABCD23');
    assert.match(app.getElement('roomStatus').textContent, /cop/i);
    assert.equal(app.getFallbackNodeCount(), 0);

    await app.getElement('copyInviteLinkBtn').dispatch('click');
    const invite = new URL(app.copied.at(-1));
    assert.equal(invite.href, 'http://game.example/play?room=ABCD23');
    assert.match(app.getElement('roomStatus').textContent, /cop/i);
    assert.equal(app.getFallbackNodeCount(), 0);
  });

  it('reports failure when insecure-origin copying is rejected', async () => {
    const client = await read('public/room-client.js');
    const app = runRoomClient(client, { modernClipboard: false });
    await app.socket.emit('message', {
      data: JSON.stringify({
        type: 'room_state',
        room: {
          code: 'ABCD23',
          seq: 1,
          players: [{ id: 'player-1', name: 'Alex', ready: false }],
        },
        self: { playerId: 'player-1' },
      }),
    });
    app.setLegacyCopySuccess(false);

    await app.getElement('copyCodeBtn').dispatch('click');
    assert.equal(app.copied.length, 0);
    assert.match(app.getElement('roomStatus').textContent, /fail|unable/i);
    assert.equal(app.getFallbackNodeCount(), 0);
  });

  it('cleans up and reports failure when insecure-origin copying throws', async () => {
    const client = await read('public/room-client.js');
    const app = runRoomClient(client, { modernClipboard: false });
    await app.socket.emit('message', {
      data: JSON.stringify({
        type: 'room_state',
        room: {
          code: 'ABCD23',
          seq: 1,
          players: [{ id: 'player-1', name: 'Alex', ready: false }],
        },
        self: { playerId: 'player-1' },
      }),
    });
    app.setLegacyCopyThrows(true);

    await app.getElement('copyCodeBtn').dispatch('click');
    assert.equal(app.copied.length, 0);
    assert.match(app.getElement('roomStatus').textContent, /fail|unable/i);
    assert.equal(app.getFallbackNodeCount(), 0);
  });
});
