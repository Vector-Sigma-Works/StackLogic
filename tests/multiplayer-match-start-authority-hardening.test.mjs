import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRoomRegistry } from '../room-registry.js';

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

function prepareSecondReady(registry) {
  registry.createRoom({ name: 'Alpha' });
  registry.joinRoom({ code: 'ABC234', name: 'Beta' });
  registry.setPlayerReady({
    code: 'ABC234', playerId: 'p1', ready: true, expectedSeq: 2,
  });
}

function startMatch(registry) {
  prepareSecondReady(registry);
  return registry.setPlayerReady({
    code: 'ABC234', playerId: 'p2', ready: true, expectedSeq: 3,
  });
}

describe('Pass 02 authoritative match hardening', () => {
  it('rejects invalid bounded ASCII match IDs before seed allocation or mutation', () => {
    const invalidFactories = [
      () => '',
      () => 'x'.repeat(65),
      () => 'contains space',
      () => 'non-ascii-é',
      () => 'trailing-newline\n',
      () => { throw new Error('factory failed'); },
    ];

    for (const createMatchId of invalidFactories) {
      let seedCalls = 0;
      const registry = registryHarness({
        createMatchId,
        createMatchSeed() { seedCalls += 1; return MATCH_SEED; },
      });
      prepareSecondReady(registry);

      assert.throws(
        () => registry.setPlayerReady({
          code: 'ABC234', playerId: 'p2', ready: true, expectedSeq: 3,
        }),
        (error) => error?.code === 'invalid_match_id',
      );

      const unchanged = registry.getRoom('ABC234');
      assert.equal(seedCalls, 0);
      assert.equal(unchanged.seq, 3);
      assert.equal(unchanged.players[1].ready, false);
      assert.equal(Object.hasOwn(unchanged, 'match'), false);
    }
  });

  it('allocates and validates match authority before mutating readiness or sequence', () => {
    let registry;
    const observedFactoryStates = [];
    function observeState() {
      observedFactoryStates.push(registry.getRoom('ABC234'));
    }
    registry = registryHarness({
      createMatchId() { observeState(); return MATCH_ID; },
      createMatchSeed() { observeState(); return MATCH_SEED; },
    });
    prepareSecondReady(registry);

    const started = registry.setPlayerReady({
      code: 'ABC234', playerId: 'p2', ready: true, expectedSeq: 3,
    });

    assert.equal(observedFactoryStates.length, 2);
    for (const observed of observedFactoryStates) {
      assert.equal(observed.seq, 3);
      assert.equal(observed.players[1].ready, false);
      assert.equal(Object.hasOwn(observed, 'match'), false);
    }
    assert.deepEqual(started.match, { id: MATCH_ID, seed: MATCH_SEED, startedSeq: 4 });
  });

  it('rejects every readiness request after a match starts without mutation', () => {
    const registry = registryHarness();
    const started = startMatch(registry);
    const before = registry.getRoom('ABC234');
    assert.deepEqual(started.match, { id: MATCH_ID, seed: MATCH_SEED, startedSeq: 4 });

    for (const ready of [true, false]) {
      assert.throws(
        () => registry.setPlayerReady({
          code: 'ABC234', playerId: 'p1', ready, expectedSeq: 4,
        }),
        (error) => error?.code === 'match_started',
      );
      assert.deepEqual(registry.getRoom('ABC234'), before);
    }
  });
});
