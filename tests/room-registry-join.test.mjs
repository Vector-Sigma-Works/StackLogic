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

function createWaitingRoom({ ids = ["p1", "p2", "p3"] } = {}) {
  const createPlayerId = sequence(ids);
  const registry = createRoomRegistry({ generateCode: () => "ABC234", createPlayerId });
  const created = registry.createRoom({ name: "Alpha One" });
  return { registry, created, createPlayerId };
}

describe("room registry join authority", () => {
  it("joins a normalized code and name as the second unready player", () => {
    const { registry } = createWaitingRoom();
    assert.deepEqual(registry.joinRoom({ code: "  abc234 ", name: "  Beta\tTwo " }), {
      playerId: "p2",
      room: {
        code: "ABC234",
        seq: 2,
        players: [
          { id: "p1", name: "Alpha One", ready: false },
          { id: "p2", name: "Beta Two", ready: false },
        ],
      },
    });
  });

  it("rejects a valid absent room without changing existing rooms", () => {
    const { registry } = createWaitingRoom();
    expectCode("room_not_found", () => registry.joinRoom({ code: "ZZZ999", name: "Beta" }));
    assert.equal(registry.getRoom("ABC234").seq, 1);
  });

  it("rejects duplicate normalized names case-insensitively and atomically", () => {
    const { registry, createPlayerId } = createWaitingRoom();
    expectCode("name_taken", () => registry.joinRoom({ code: "ABC234", name: " alpha   one " }));
    assert.deepEqual(registry.getRoom("ABC234"), {
      code: "ABC234",
      seq: 1,
      players: [{ id: "p1", name: "Alpha One", ready: false }],
    });
    assert.equal(createPlayerId.calls(), 1);
  });

  it("rejects a third player with room_full before allocating an identity", () => {
    const { registry, createPlayerId } = createWaitingRoom();
    registry.joinRoom({ code: "ABC234", name: "Beta" });
    expectCode("room_full", () => registry.joinRoom({ code: "ABC234", name: "Gamma" }));
    assert.equal(createPlayerId.calls(), 2);
    assert.equal(registry.getRoom("ABC234").seq, 2);
    assert.equal(registry.getRoom("ABC234").players.length, 2);
  });

  it("rejects invalid or duplicate player IDs atomically", () => {
    for (const invalid of ["", "   ", null, 7, {}]) {
      const { registry } = createWaitingRoom({ ids: ["p1", invalid] });
      expectCode("invalid_player_id", () => registry.joinRoom({ code: "ABC234", name: "Beta" }));
      assert.equal(registry.getRoom("ABC234").seq, 1);
      assert.equal(registry.getRoom("ABC234").players.length, 1);
    }

    const { registry } = createWaitingRoom({ ids: ["p1", "p1", "p2"] });
    expectCode("invalid_player_id", () => registry.joinRoom({ code: "ABC234", name: "Beta" }));
    assert.equal(registry.joinRoom({ code: "ABC234", name: "Beta" }).playerId, "p2");
  });

  it("rejects invalid room codes through the shared validation boundary", () => {
    const { registry } = createWaitingRoom();
    for (const code of [null, "", "ABC12", "ABC10O", "ABC23!"]) {
      expectCode("invalid_room_code", () => registry.joinRoom({ code, name: "Beta" }));
    }
  });

  it("returns detached join snapshots", () => {
    const { registry } = createWaitingRoom();
    const joined = registry.joinRoom({ code: "ABC234", name: "Beta" });
    joined.room.seq = 999;
    joined.room.players[1].name = "Mutated";
    joined.room.players.pop();

    assert.deepEqual(registry.getRoom("ABC234"), {
      code: "ABC234",
      seq: 2,
      players: [
        { id: "p1", name: "Alpha One", ready: false },
        { id: "p2", name: "Beta", ready: false },
      ],
    });
  });
});
