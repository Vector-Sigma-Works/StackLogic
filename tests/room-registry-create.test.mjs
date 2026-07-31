import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRoomRegistry } from "../room-registry.js";

function sequence(values) {
  let index = 0;
  const fn = () => values[index++];
  fn.calls = () => index;
  return fn;
}

function expectCode(expected, action) {
  assert.throws(action, (error) => {
    assert.equal(error?.code, expected);
    return true;
  });
}

describe("room registry creation authority", () => {
  it("creates the exact initial snapshot with normalized name and server identity", () => {
    const registry = createRoomRegistry({
      generateCode: () => "ABC234",
      createPlayerId: () => "player-1",
    });

    assert.deepEqual(registry.createRoom({ name: "  Alpha\tOne  " }), {
      playerId: "player-1",
      room: {
        code: "ABC234",
        seq: 1,
        players: [{ id: "player-1", name: "Alpha One", ready: false }],
      },
    });
  });

  it("starts every independently created room at sequence one", () => {
    const codes = sequence(["AAA222", "BBB333"]);
    const ids = sequence(["p1", "p2"]);
    const registry = createRoomRegistry({ generateCode: codes, createPlayerId: ids });

    assert.equal(registry.createRoom({ name: "One" }).room.seq, 1);
    assert.equal(registry.createRoom({ name: "Two" }).room.seq, 1);
  });

  it("bounds room allocation and releases capacity only through explicit deletion", () => {
    const codes = sequence(["AAA222", "BBB333"]);
    const ids = sequence(["p1", "p2"]);
    const registry = createRoomRegistry({ generateCode: codes, createPlayerId: ids, maxRooms: 1 });

    registry.createRoom({ name: "One" });
    expectCode("room_capacity_reached", () => registry.createRoom({ name: "Two" }));
    assert.equal(registry.deleteRoom({ code: "AAA222" }), true);
    assert.equal(registry.getRoom("AAA222"), null);
    assert.equal(registry.deleteRoom({ code: "AAA222" }), false);
    assert.equal(registry.createRoom({ name: "Two" }).room.code, "BBB333");
  });

  it("accepts only bounded integer room capacity", () => {
    assert.ok(createRoomRegistry({ maxRooms: 1 }));
    assert.ok(createRoomRegistry({ maxRooms: 10_000 }));
    for (const value of [0, 10_001, 1.5, "256", null]) {
      expectCode("invalid_configuration", () => createRoomRegistry({ maxRooms: value }));
    }
  });

  it("rejects lowercase generated codes instead of silently normalizing them", () => {
    const registry = createRoomRegistry({ generateCode: () => "abc234", createPlayerId: () => "p1" });
    expectCode("invalid_room_code", () => registry.createRoom({ name: "Player" }));
    assert.equal(registry.getRoom("ABC234"), null);
  });

  it("accepts only bounded integer maxCodeAttempts", () => {
    assert.ok(createRoomRegistry({ maxCodeAttempts: 1 }));
    assert.ok(createRoomRegistry({ maxCodeAttempts: 128 }));
    for (const value of [0, 129, 1.5, "32", null]) {
      expectCode("invalid_configuration", () => createRoomRegistry({ maxCodeAttempts: value }));
    }
  });

  it("retries collisions and exhausts at the exact configured bound", () => {
    const codes = sequence(["AAAAAA", "AAAAAA", "BBBBBB", "AAAAAA", "BBBBBB"]);
    const ids = sequence(["p1", "p2"]);
    const registry = createRoomRegistry({ generateCode: codes, createPlayerId: ids, maxCodeAttempts: 2 });

    assert.equal(registry.createRoom({ name: "One" }).room.code, "AAAAAA");
    assert.equal(registry.createRoom({ name: "Two" }).room.code, "BBBBBB");
    expectCode("room_code_exhausted", () => registry.createRoom({ name: "Three" }));
    assert.equal(codes.calls(), 5);
    assert.equal(registry.getRoom("AAAAAA").players.length, 1);
    assert.equal(registry.getRoom("BBBBBB").players.length, 1);
  });

  it("rejects malformed generated codes without retaining a room", () => {
    const codes = sequence(["ABC10O", "CCC333"]);
    const registry = createRoomRegistry({ generateCode: codes, createPlayerId: () => "p1" });

    expectCode("invalid_room_code", () => registry.createRoom({ name: "Bad" }));
    assert.equal(registry.getRoom("CCC333"), null);
    assert.equal(registry.createRoom({ name: "Good" }).room.code, "CCC333");
  });

  it("rejects invalid player IDs atomically so the same code remains reusable", () => {
    const ids = sequence(["", "player-ok"]);
    const registry = createRoomRegistry({ generateCode: () => "DDD444", createPlayerId: ids });

    expectCode("invalid_player_id", () => registry.createRoom({ name: "First" }));
    assert.equal(registry.getRoom("DDD444"), null);
    assert.equal(registry.createRoom({ name: "Second" }).room.code, "DDD444");
  });

  it("rejects non-string player IDs", () => {
    for (const id of [null, 7, {}, "   "]) {
      const registry = createRoomRegistry({ generateCode: () => "EEE555", createPlayerId: () => id });
      expectCode("invalid_player_id", () => registry.createRoom({ name: "Player" }));
    }
  });

  it("normalizes lookup codes and returns null for a valid absent room", () => {
    const registry = createRoomRegistry({ generateCode: () => "FGH678", createPlayerId: () => "p1" });
    registry.createRoom({ name: "Player" });

    assert.equal(registry.getRoom("  fgh678 ").code, "FGH678");
    assert.equal(registry.getRoom("ZZZ999"), null);
  });

  it("rejects invalid lookup codes", () => {
    const registry = createRoomRegistry();
    for (const code of [null, "", "ABC12", "ABC10O", "ABC23!"]) {
      expectCode("invalid_room_code", () => registry.getRoom(code));
    }
  });

  it("returns deep detached snapshots from both createRoom and getRoom", () => {
    const registry = createRoomRegistry({ generateCode: () => "JKL789", createPlayerId: () => "p1" });
    const created = registry.createRoom({ name: "Player" });
    created.room.code = "MUTATE";
    created.room.seq = 999;
    created.room.players[0].name = "Mutated";
    created.room.players.push({ id: "x", name: "X", ready: true });

    const first = registry.getRoom("JKL789");
    assert.deepEqual(first, {
      code: "JKL789",
      seq: 1,
      players: [{ id: "p1", name: "Player", ready: false }],
    });
    first.players[0].ready = true;
    assert.equal(registry.getRoom("JKL789").players[0].ready, false);
  });
});
