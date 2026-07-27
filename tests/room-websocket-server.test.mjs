import { describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import WebSocket from "ws";
import { createRoomRegistry } from "../room-registry.js";
import { createRoomWebSocketServer } from "../room-websocket-server.js";

const ALLOWED_ORIGIN = "https://stacklogic-dev.game.lan";
const SOCKET_EXPECTATION_TIMEOUT_MS = 1_000;

function withinSocketDeadline(promise, label) {
  let timer;
  const deadline = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`socket_timeout:${label}`)), SOCKET_EXPECTATION_TIMEOUT_MS);
    timer.unref?.();
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

function sequence(values) {
  let index = 0;
  return () => values[index++];
}

function nextMessage(socket) {
  return withinSocketDeadline(new Promise((resolve, reject) => {
    socket.once("message", (data, isBinary) => {
      try {
        assert.equal(isBinary, false);
        resolve(JSON.parse(data.toString("utf8")));
      } catch (error) {
        reject(error);
      }
    });
    socket.once("error", reject);
  }), "message");
}

function nextClose(socket) {
  return withinSocketDeadline(
    new Promise((resolve) => socket.once("close", (code) => resolve(code))),
    "close",
  );
}

async function startHarness({ maxPayloadBytes = 4096 } = {}) {
  const registry = createRoomRegistry({
    generateCode: () => "ABC234",
    createPlayerId: sequence(["p1", "p2"]),
  });
  const server = http.createServer((_req, res) => {
    res.statusCode = 404;
    res.end("Not found");
  });
  const transport = createRoomWebSocketServer({
    server,
    registry,
    allowedOrigin: ALLOWED_ORIGIN,
    maxPayloadBytes,
    createConnectionId: sequence(["c1", "c2", "c3"]),
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  return {
    url: `ws://127.0.0.1:${port}`,
    registry,
    async close(sockets = []) {
      for (const socket of sockets) socket.terminate();
      await transport.close();
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}

function connect(url, { origin = ALLOWED_ORIGIN, path = "/ws" } = {}) {
  const socket = new WebSocket(`${url}${path}`, { headers: origin === null ? {} : { Origin: origin } });
  return { socket, connected: nextMessage(socket) };
}

function rejectedStatus(url, { origin = ALLOWED_ORIGIN, path = "/ws" } = {}) {
  return withinSocketDeadline(new Promise((resolve, reject) => {
    const socket = new WebSocket(`${url}${path}`, { headers: origin === null ? {} : { Origin: origin } });
    socket.once("unexpected-response", (_request, response) => {
      response.resume();
      resolve(response.statusCode);
    });
    socket.once("error", reject);
  }), "upgrade_rejection");
}

describe("room WebSocket server", () => {
  it("carries create and join commands over real WebSocket connections", async () => {
    const harness = await startHarness();
    const first = connect(harness.url);
    const second = connect(harness.url);
    const sockets = [first.socket, second.socket];
    try {
      assert.deepEqual(await first.connected, { type: "connected", protocolVersion: 1 });
      assert.deepEqual(await second.connected, { type: "connected", protocolVersion: 1 });

      const createdMessage = nextMessage(first.socket);
      first.socket.send(JSON.stringify({ type: "create_room", requestId: "r1", name: "Alpha" }));
      const created = await createdMessage;
      assert.equal(created.type, "room_state");
      assert.equal(created.room.code, "ABC234");
      assert.equal(created.self.playerId, "p1");

      const creatorBroadcast = nextMessage(first.socket);
      const joinerState = nextMessage(second.socket);
      second.socket.send(JSON.stringify({ type: "join_room", requestId: "r2", code: "abc234", name: "Beta" }));
      const [toCreator, toJoiner] = await Promise.all([creatorBroadcast, joinerState]);
      assert.equal(toCreator.room.seq, 2);
      assert.equal(toCreator.self.playerId, "p1");
      assert.equal("requestId" in toCreator, false);
      assert.equal(toJoiner.self.playerId, "p2");
      assert.equal(toJoiner.requestId, "r2");
    } finally {
      await harness.close(sockets);
    }
  });

  it("rejects missing, foreign, and prefix-confusable Origins", async () => {
    const harness = await startHarness();
    try {
      assert.equal(await rejectedStatus(harness.url, { origin: null }), 403);
      assert.equal(await rejectedStatus(harness.url, { origin: "https://evil.example" }), 403);
      assert.equal(await rejectedStatus(harness.url, { origin: `${ALLOWED_ORIGIN}.evil.example` }), 403);
    } finally {
      await harness.close();
    }
  });

  it("rejects upgrades outside the exact /ws path", async () => {
    const harness = await startHarness();
    try {
      assert.equal(await rejectedStatus(harness.url, { path: "/" }), 404);
      assert.equal(await rejectedStatus(harness.url, { path: "/ws/extra" }), 404);
    } finally {
      await harness.close();
    }
  });

  it("closes binary messages with unsupported-data status", async () => {
    const harness = await startHarness();
    const client = connect(harness.url);
    try {
      await client.connected;
      const closed = nextClose(client.socket);
      client.socket.send(Buffer.from([1, 2, 3]), { binary: true });
      assert.equal(await closed, 1003);
    } finally {
      await harness.close([client.socket]);
    }
  });

  it("closes oversized text messages with message-too-big status", async () => {
    const harness = await startHarness({ maxPayloadBytes: 64 });
    const client = connect(harness.url);
    try {
      await client.connected;
      const closed = nextClose(client.socket);
      client.socket.send(JSON.stringify({ type: "create_room", requestId: "r1", name: "A".repeat(100) }));
      assert.equal(await closed, 1009);
    } finally {
      await harness.close([client.socket]);
    }
  });
});
