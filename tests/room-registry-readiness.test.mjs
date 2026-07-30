import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRoomRegistry } from "../room-registry.js";

function sequence(values) {
  let index = 0;
  return () => values[index++];
}

function expectCode(expected, action, currentSeq) {
  assert.throws(action, (error) => {
    assert.equal(error?.code, expected);
    if (currentSeq !== undefined) assert.equal(error?.currentSeq, currentSeq);
    return true;
  });
}

function createRoom({ joined = false } = {}) {
  const registry = createRoomRegistry({
    generateCode: () => "ABC234",
    createPlayerId: sequence(["p1", "p2"]),
  });
  registry.createRoom({ name: "Alpha" });
  if (joined) registry.joinRoom({ code: "ABC234", name: "Beta" });
  return registry;
}

describe("room readiness and state sequence authority", () => {
  it("changes readiness and increments sequence exactly once", () => {
    const registry = createRoom();
    assert.deepEqual(registry.setPlayerReady({
      code: "abc234",
      playerId: "p1",
      ready: true,
      expectedSeq: 1,
    }), {
      code: "ABC234",
      seq: 2,
      players: [{ id: "p1", name: "Alpha", ready: true }],
    });
  });

  it("sequences readiness changes from both players", () => {
    const registry = createRoom({ joined: true });
    assert.equal(registry.setPlayerReady({ code: "ABC234", playerId: "p1", ready: true, expectedSeq: 2 }).seq, 3);
    const final = registry.setPlayerReady({ code: "ABC234", playerId: "p2", ready: true, expectedSeq: 3 });
    assert.equal(final.seq, 4);
    assert.deepEqual(final.players.map((player) => player.ready), [true, true]);
  });

  it("rejects stale commands and reports the authoritative current sequence", () => {
    const registry = createRoom({ joined: true });
    expectCode("stale_state", () => registry.setPlayerReady({
      code: "ABC234",
      playerId: "p1",
      ready: true,
      expectedSeq: 1,
    }), 2);
    assert.equal(registry.getRoom("ABC234").seq, 2);
    assert.equal(registry.getRoom("ABC234").players[0].ready, false);
  });

  it("treats an identical readiness command as an idempotent no-op", () => {
    const registry = createRoom();
    const unchanged = registry.setPlayerReady({
      code: "ABC234",
      playerId: "p1",
      ready: false,
      expectedSeq: 1,
    });
    assert.equal(unchanged.seq, 1);
    assert.equal(registry.getRoom("ABC234").seq, 1);
  });

  it("rejects malformed sequence and readiness values atomically", () => {
    for (const expectedSeq of [null, 0, -1, 1.5, "1", Number.MAX_SAFE_INTEGER + 1]) {
      const registry = createRoom();
      expectCode("invalid_sequence", () => registry.setPlayerReady({
        code: "ABC234", playerId: "p1", ready: true, expectedSeq,
      }));
      assert.equal(registry.getRoom("ABC234").seq, 1);
    }
    for (const ready of [null, 0, 1, "true", {}]) {
      const registry = createRoom();
      expectCode("invalid_ready", () => registry.setPlayerReady({
        code: "ABC234", playerId: "p1", ready, expectedSeq: 1,
      }));
      assert.equal(registry.getRoom("ABC234").seq, 1);
    }
  });

  it("rejects malformed or absent player identities atomically", () => {
    for (const playerId of [null, "", "   ", 7]) {
      const registry = createRoom();
      expectCode("invalid_player_id", () => registry.setPlayerReady({
        code: "ABC234", playerId, ready: true, expectedSeq: 1,
      }));
    }
    const registry = createRoom();
    expectCode("player_not_found", () => registry.setPlayerReady({
      code: "ABC234", playerId: "absent", ready: true, expectedSeq: 1,
    }));
    assert.equal(registry.getRoom("ABC234").seq, 1);
  });

  it("shares room validation and missing-room boundaries", () => {
    const registry = createRoom();
    expectCode("invalid_room_code", () => registry.setPlayerReady({
      code: "bad", playerId: "p1", ready: true, expectedSeq: 1,
    }));
    expectCode("room_not_found", () => registry.setPlayerReady({
      code: "ZZZ999", playerId: "p1", ready: true, expectedSeq: 1,
    }));
  });

  it("returns detached readiness snapshots", () => {
    const registry = createRoom();
    const snapshot = registry.setPlayerReady({
      code: "ABC234", playerId: "p1", ready: true, expectedSeq: 1,
    });
    snapshot.seq = 999;
    snapshot.players[0].ready = false;
    assert.equal(registry.getRoom("ABC234").seq, 2);
    assert.equal(registry.getRoom("ABC234").players[0].ready, true);
  });
});
