import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRoomRegistry } from "../room-registry.js";
import { createRoomProtocol, ROOM_PROTOCOL_VERSION } from "../room-protocol.js";

function sequence(values) {
  let index = 0;
  return () => values[index++];
}

function harness() {
  const sent = [];
  const registry = createRoomRegistry({
    generateCode: () => "ABC234",
    createPlayerId: sequence(["p1", "p2"]),
  });
  const protocol = createRoomProtocol({
    registry,
    send(connectionId, message) {
      sent.push({ connectionId, message });
    },
  });
  return { protocol, sent, registry };
}

function request(type, requestId, fields = {}) {
  return JSON.stringify({ type, requestId, ...fields });
}

describe("room protocol", () => {
  it("publishes one frozen protocol version and a connected event", () => {
    assert.equal(ROOM_PROTOCOL_VERSION, 1);
    const { protocol, sent } = harness();
    protocol.connect("c1");
    assert.deepEqual(sent, [{
      connectionId: "c1",
      message: { type: "connected", protocolVersion: 1 },
    }]);
  });

  it("creates a room with connection-bound self identity and invite path", () => {
    const { protocol, sent } = harness();
    protocol.connect("c1");
    sent.length = 0;
    protocol.receive("c1", request("create_room", "req-1", { name: "Alpha" }));
    assert.deepEqual(sent, [{
      connectionId: "c1",
      message: {
        type: "room_state",
        protocolVersion: 1,
        requestId: "req-1",
        room: {
          code: "ABC234",
          seq: 1,
          players: [{ id: "p1", name: "Alpha", ready: false }],
        },
        self: { playerId: "p1" },
        invitePath: "/?room=ABC234",
      },
    }]);
  });

  it("joins and broadcasts personalized room state to both connections", () => {
    const { protocol, sent } = harness();
    protocol.connect("c1");
    protocol.connect("c2");
    protocol.receive("c1", request("create_room", "r1", { name: "Alpha" }));
    sent.length = 0;
    protocol.receive("c2", request("join_room", "r2", { code: "abc234", name: "Beta" }));

    assert.equal(sent.length, 2);
    assert.deepEqual(sent.map((entry) => entry.connectionId), ["c1", "c2"]);
    assert.equal(sent[0].message.self.playerId, "p1");
    assert.equal("requestId" in sent[0].message, false);
    assert.equal(sent[1].message.self.playerId, "p2");
    assert.equal(sent[1].message.requestId, "r2");
    assert.equal(sent[0].message.room.seq, 2);
    assert.deepEqual(sent[0].message.room, sent[1].message.room);
  });

  it("changes readiness using the connection-bound player and broadcasts", () => {
    const { protocol, sent } = harness();
    protocol.connect("c1");
    protocol.connect("c2");
    protocol.receive("c1", request("create_room", "r1", { name: "Alpha" }));
    protocol.receive("c2", request("join_room", "r2", { code: "ABC234", name: "Beta" }));
    sent.length = 0;
    protocol.receive("c1", request("set_ready", "r3", { ready: true, expectedSeq: 2 }));

    assert.equal(sent.length, 2);
    assert.equal(sent[0].message.requestId, "r3");
    assert.equal("requestId" in sent[1].message, false);
    assert.equal(sent[0].message.room.seq, 3);
    assert.equal(sent[0].message.room.players[0].ready, true);
  });

  it("returns coded registry errors without throwing or mutating session identity", () => {
    const { protocol, sent } = harness();
    protocol.connect("c1");
    protocol.receive("c1", request("create_room", "r1", { name: "Alpha" }));
    sent.length = 0;
    protocol.receive("c1", request("set_ready", "r2", { ready: true, expectedSeq: 99 }));
    assert.deepEqual(sent, [{
      connectionId: "c1",
      message: {
        type: "error",
        protocolVersion: 1,
        requestId: "r2",
        code: "stale_state",
        currentSeq: 1,
      },
    }]);
  });

  it("rejects commands that conflict with connection session state", () => {
    const { protocol, sent } = harness();
    protocol.connect("c1");
    protocol.connect("c2");
    protocol.receive("c1", request("create_room", "r1", { name: "Alpha" }));
    sent.length = 0;
    protocol.receive("c1", request("create_room", "r2", { name: "Again" }));
    protocol.receive("c2", request("set_ready", "r3", { ready: true, expectedSeq: 1 }));
    assert.deepEqual(sent.map((entry) => entry.message.code), ["already_in_room", "not_in_room"]);
  });

  it("converts create and join registry failures into typed responses", () => {
    const { protocol, sent } = harness();
    protocol.connect("c1");
    protocol.connect("c2");
    sent.length = 0;

    assert.doesNotThrow(() => protocol.receive("c1", request("create_room", "r1", { name: "Ålex" })));
    assert.doesNotThrow(() => protocol.receive("c2", request("join_room", "r2", { code: "ZZZ999", name: "Beta" })));
    assert.deepEqual(sent.map((entry) => entry.message), [
      { type: "error", protocolVersion: 1, requestId: "r1", code: "invalid_name" },
      { type: "error", protocolVersion: 1, requestId: "r2", code: "room_not_found" },
    ]);
  });

  it("requires every command to carry a request ID", () => {
    const { protocol, sent } = harness();
    protocol.connect("c1");
    sent.length = 0;
    protocol.receive("c1", JSON.stringify({ type: "create_room", name: "Alpha" }));
    assert.deepEqual(sent, [{
      connectionId: "c1",
      message: { type: "error", protocolVersion: 1, requestId: null, code: "invalid_request_id" },
    }]);
  });

  it("fails closed for malformed JSON, message shapes, request IDs, and types", () => {
    const { protocol, sent } = harness();
    protocol.connect("c1");
    sent.length = 0;
    protocol.receive("c1", "{");
    protocol.receive("c1", "null");
    protocol.receive("c1", JSON.stringify({ type: "create_room", requestId: "bad id", name: "Alpha" }));
    protocol.receive("c1", request("unknown", "r4"));
    assert.deepEqual(sent.map((entry) => entry.message), [
      { type: "error", protocolVersion: 1, requestId: null, code: "invalid_json" },
      { type: "error", protocolVersion: 1, requestId: null, code: "invalid_message" },
      { type: "error", protocolVersion: 1, requestId: null, code: "invalid_request_id" },
      { type: "error", protocolVersion: 1, requestId: "r4", code: "unsupported_message" },
    ]);
  });

  it("requires request IDs to be bounded ASCII tokens", () => {
    const { protocol, sent } = harness();
    protocol.connect("c1");
    sent.length = 0;
    for (const requestId of ["", "x".repeat(65), "snow☃", 7, null]) {
      protocol.receive("c1", JSON.stringify({ type: "create_room", requestId, name: "Alpha" }));
    }
    assert.deepEqual(sent.map((entry) => entry.message.code), Array(5).fill("invalid_request_id"));
  });

  it("disconnects transport sessions without deleting authoritative rooms", () => {
    const { protocol, registry } = harness();
    protocol.connect("c1");
    protocol.receive("c1", request("create_room", "r1", { name: "Alpha" }));
    protocol.disconnect("c1");
    assert.equal(registry.getRoom("ABC234").players[0].name, "Alpha");
    assert.doesNotThrow(() => protocol.connect("c1"));
  });

  it("rejects malformed protocol dependencies at construction", () => {
    const send = () => {};
    const completeRegistry = {
      createRoom() {},
      joinRoom() {},
      setPlayerReady() {},
    };
    for (const registry of [null, {}, { createRoom() {} }]) {
      assert.throws(() => createRoomProtocol({ registry, send }), (error) => error?.code === "invalid_configuration");
    }
    assert.throws(
      () => createRoomProtocol({ registry: completeRegistry, send: null }),
      (error) => error?.code === "invalid_configuration",
    );
  });

  it("rejects malformed or duplicate connection identities", () => {
    const { protocol } = harness();
    for (const id of [null, "", "   ", 7]) {
      assert.throws(() => protocol.connect(id), (error) => error?.code === "invalid_connection_id");
    }
    protocol.connect("c1");
    assert.throws(() => protocol.connect("c1"), (error) => error?.code === "connection_exists");
    assert.throws(() => protocol.receive("missing", "{}"), (error) => error?.code === "connection_not_found");
  });
});
