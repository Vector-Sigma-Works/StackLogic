import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRoomRegistry } from '../room-registry.js';
import { createRoomProtocol } from '../room-protocol.js';

const board = () => Array.from({ length: 20 }, () => Array(10).fill(null));
const state = (gameOver = false) => ({ board: board(), score: 0, lines: 0, gameOver });

function sequence(values) {
  let index = 0;
  return () => values[index++];
}

function started() {
  const registry = createRoomRegistry({
    generateCode: () => 'ABC234',
    createPlayerId: sequence(['p1', 'p2']),
    createMatchId: sequence(['match-1', 'match-2']),
    createMatchSeed: sequence([7, 8]),
  });
  registry.createRoom({ name: 'Alpha' });
  registry.joinRoom({ code: 'ABC234', name: 'Beta' });
  registry.setPlayerReady({ code: 'ABC234', playerId: 'p1', ready: true, expectedSeq: 2 });
  registry.setPlayerReady({ code: 'ABC234', playerId: 'p2', ready: true, expectedSeq: 3 });
  return registry;
}

describe('Pass 04 authoritative result and mutual rematch', () => {
  it('does not commit the final rematch vote when next-match allocation fails', () => {
    const registry = createRoomRegistry({
      generateCode: () => 'ABC234',
      createPlayerId: sequence(['p1', 'p2']),
      createMatchId: sequence(['match-1', 'invalid match id']),
      createMatchSeed: sequence([7, 8]),
    });
    registry.createRoom({ name: 'Alpha' });
    registry.joinRoom({ code: 'ABC234', name: 'Beta' });
    registry.setPlayerReady({ code: 'ABC234', playerId: 'p1', ready: true, expectedSeq: 2 });
    registry.setPlayerReady({ code: 'ABC234', playerId: 'p2', ready: true, expectedSeq: 3 });
    registry.updatePlayerState({ code: 'ABC234', playerId: 'p1', matchId: 'match-1', updateSeq: 1, state: state(true) });
    registry.requestRematch({ code: 'ABC234', playerId: 'p1', matchId: 'match-1' });

    assert.throws(
      () => registry.requestRematch({ code: 'ABC234', playerId: 'p2', matchId: 'match-1' }),
      (error) => error?.code === 'invalid_match_state',
    );
    assert.deepEqual(registry.getRoom('ABC234').match.rematchAccepted, ['p1']);
  });

  it('rejects a repeated completed match ID before committing the final rematch vote', () => {
    const registry = createRoomRegistry({
      generateCode: () => 'ABC234',
      createPlayerId: sequence(['p1', 'p2']),
      createMatchId: sequence(['match-1', 'match-1']),
      createMatchSeed: sequence([7, 8]),
    });
    registry.createRoom({ name: 'Alpha' });
    registry.joinRoom({ code: 'ABC234', name: 'Beta' });
    registry.setPlayerReady({ code: 'ABC234', playerId: 'p1', ready: true, expectedSeq: 2 });
    registry.setPlayerReady({ code: 'ABC234', playerId: 'p2', ready: true, expectedSeq: 3 });
    registry.updatePlayerState({ code: 'ABC234', playerId: 'p1', matchId: 'match-1', updateSeq: 1, state: state(true) });
    registry.requestRematch({ code: 'ABC234', playerId: 'p1', matchId: 'match-1' });

    assert.throws(
      () => registry.requestRematch({ code: 'ABC234', playerId: 'p2', matchId: 'match-1' }),
      (error) => error?.code === 'invalid_match_state',
    );
    assert.deepEqual(registry.getRoom('ABC234').match.rematchAccepted, ['p1']);
  });

  it('rejects reuse of any historical room match ID before mutation', () => {
    const registry = createRoomRegistry({
      generateCode: () => 'ABC234',
      createPlayerId: sequence(['p1', 'p2']),
      createMatchId: sequence(['match-1', 'match-2', 'match-1']),
      createMatchSeed: sequence([7, 8, 9]),
    });
    registry.createRoom({ name: 'Alpha' });
    registry.joinRoom({ code: 'ABC234', name: 'Beta' });
    registry.setPlayerReady({ code: 'ABC234', playerId: 'p1', ready: true, expectedSeq: 2 });
    registry.setPlayerReady({ code: 'ABC234', playerId: 'p2', ready: true, expectedSeq: 3 });
    registry.updatePlayerState({ code: 'ABC234', playerId: 'p1', matchId: 'match-1', updateSeq: 1, state: state(true) });
    registry.requestRematch({ code: 'ABC234', playerId: 'p1', matchId: 'match-1' });
    registry.requestRematch({ code: 'ABC234', playerId: 'p2', matchId: 'match-1' });
    registry.updatePlayerState({ code: 'ABC234', playerId: 'p1', matchId: 'match-2', updateSeq: 1, state: state(true) });
    registry.requestRematch({ code: 'ABC234', playerId: 'p1', matchId: 'match-2' });

    assert.throws(
      () => registry.requestRematch({ code: 'ABC234', playerId: 'p2', matchId: 'match-2' }),
      (error) => error?.code === 'invalid_match_state',
    );
    const room = registry.getRoom('ABC234');
    assert.equal(room.match.id, 'match-2');
    assert.deepEqual(room.match.rematchAccepted, ['p1']);
  });

  it('records exactly one terminal result, fences later state, and starts a fresh match only after both accept rematch', () => {
    const registry = started();
    const resolved = registry.updatePlayerState({
      code: 'ABC234', playerId: 'p1', matchId: 'match-1', updateSeq: 1, state: state(true),
    });
    assert.deepEqual(resolved.match.result, { winnerId: 'p2', loserId: 'p1' });
    assert.throws(() => registry.updatePlayerState({
      code: 'ABC234', playerId: 'p2', matchId: 'match-1', updateSeq: 1, state: state(false),
    }), (error) => error?.code === 'match_finished');

    const waiting = registry.requestRematch({ code: 'ABC234', playerId: 'p1', matchId: 'match-1' });
    assert.deepEqual(waiting.match.rematchAccepted, ['p1']);
    const duplicate = registry.requestRematch({ code: 'ABC234', playerId: 'p1', matchId: 'match-1' });
    assert.deepEqual(duplicate.match.rematchAccepted, ['p1']);
    const fresh = registry.requestRematch({ code: 'ABC234', playerId: 'p2', matchId: 'match-1' });
    assert.deepEqual(fresh.match, { id: 'match-2', seed: 8, startedSeq: fresh.seq });
    assert.equal(fresh.players.every((player) => !Object.hasOwn(player, 'gameState') && !Object.hasOwn(player, 'currentUpdateSeq')), true);
  });

  it('fails closed for pre-result, simultaneous-terminal, and stale rematch transitions', () => {
    const registry = started();
    assert.throws(() => registry.requestRematch({ code: 'ABC234', playerId: 'p1', matchId: 'match-1' }), (error) => error?.code === 'match_not_finished');

    registry.updatePlayerState({ code: 'ABC234', playerId: 'p1', matchId: 'match-1', updateSeq: 1, state: state(true) });
    assert.throws(() => registry.updatePlayerState({ code: 'ABC234', playerId: 'p2', matchId: 'match-1', updateSeq: 1, state: state(true) }), (error) => error?.code === 'match_finished');

    registry.requestRematch({ code: 'ABC234', playerId: 'p1', matchId: 'match-1' });
    const fresh = registry.requestRematch({ code: 'ABC234', playerId: 'p2', matchId: 'match-1' });
    assert.equal(fresh.match.id, 'match-2');
    assert.throws(() => registry.requestRematch({ code: 'ABC234', playerId: 'p1', matchId: 'match-1' }), (error) => error?.code === 'match_mismatch');
  });

  it('broadcasts the immutable result and only starts a fresh match after both protocol rematch accepts', () => {
    const sent = [];
    const registry = createRoomRegistry({
      generateCode: () => 'ABC234',
      createPlayerId: sequence(['p1', 'p2']),
      createMatchId: sequence(['match-1', 'match-2']),
      createMatchSeed: sequence([7, 8]),
    });
    const protocol = createRoomProtocol({ registry, send: (connectionId, message) => sent.push({ connectionId, message }) });
    const send = (connectionId, type, requestId, fields = {}) => protocol.receive(connectionId, JSON.stringify({ type, requestId, ...fields }));
    protocol.connect('c1'); protocol.connect('c2');
    send('c1', 'create_room', 'r1', { name: 'Alpha' });
    send('c2', 'join_room', 'r2', { code: 'ABC234', name: 'Beta' });
    send('c1', 'set_ready', 'r3', { ready: true, expectedSeq: 2 });
    send('c2', 'set_ready', 'r4', { ready: true, expectedSeq: 3 });
    sent.length = 0;

    send('c1', 'update_player_state', 'loss-1', { matchId: 'match-1', updateSeq: 1, state: state(true) });
    const results = sent.filter(({ message }) => message.type === 'match_result');
    assert.deepEqual(results.map(({ connectionId, message }) => ({ connectionId, message })), [
      { connectionId: 'c1', message: { type: 'match_result', protocolVersion: 1, matchId: 'match-1', winnerId: 'p2', loserId: 'p1' } },
      { connectionId: 'c2', message: { type: 'match_result', protocolVersion: 1, matchId: 'match-1', winnerId: 'p2', loserId: 'p1' } },
    ]);

    sent.length = 0;
    send('c1', 'request_rematch', 'rematch-1', { matchId: 'match-1' });
    assert.deepEqual(sent.map(({ message }) => message.type), ['rematch_status', 'rematch_status']);
    assert.deepEqual(sent[0].message.acceptedPlayerIds, ['p1']);

    sent.length = 0;
    send('c2', 'request_rematch', 'rematch-2', { matchId: 'match-1' });
    const starts = sent.filter(({ message }) => message.type === 'room_state').map(({ message }) => message.room.match);
    assert.deepEqual(starts, [
      { id: 'match-2', seed: 8, startedSeq: 5 },
      { id: 'match-2', seed: 8, startedSeq: 5 },
    ]);
  });

});
