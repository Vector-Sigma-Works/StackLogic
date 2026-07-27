import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  MAX_SEQUENCE_OFFSET,
  PIECE_TYPES,
  createSeededPieceSource,
} from '../public/game-piece-sequence.js';

const take = (source, count) => Array.from({ length: count }, () => source.next());

describe('server-seeded seven-bag piece sequence', () => {
  it('publishes one frozen canonical piece order and bounded replay offset', () => {
    assert.deepEqual(PIECE_TYPES, ['I', 'O', 'T', 'S', 'Z', 'J', 'L']);
    assert.equal(Object.isFrozen(PIECE_TYPES), true);
    assert.equal(MAX_SEQUENCE_OFFSET, 100_000);
  });

  it('matches the frozen mulberry32 plus Fisher-Yates fixture', () => {
    const source = createSeededPieceSource(0x12345678);
    assert.equal(take(source, 28).join(''), 'SOTLZJIZJSLITOTISLOJZILSZJTO');
    assert.equal(source.getIndex(), 28);
  });

  it('is reproducible for the same seed and distinct for a neighboring seed', () => {
    const first = take(createSeededPieceSource(0x12345678), 70);
    const second = take(createSeededPieceSource(0x12345678), 70);
    const neighbor = take(createSeededPieceSource(0x12345679), 70);
    assert.deepEqual(first, second);
    assert.notDeepEqual(first, neighbor);
  });

  it('emits every piece exactly once in each consecutive seven-piece bag', () => {
    const sequence = take(createSeededPieceSource(0), 70);
    const canonical = [...PIECE_TYPES].sort();
    for (let index = 0; index < sequence.length; index += 7) {
      assert.deepEqual(sequence.slice(index, index + 7).sort(), canonical);
    }
  });

  it('replays from a bounded sequence index for reconnect recovery', () => {
    const full = take(createSeededPieceSource(0x12345678), 40);
    const resumed = createSeededPieceSource(0x12345678, 17);
    assert.equal(resumed.getIndex(), 17);
    assert.deepEqual(take(resumed, 23), full.slice(17, 40));
    assert.equal(resumed.getIndex(), 40);
    assert.equal(Object.isFrozen(resumed), true);
  });

  it('fails closed for malformed seeds and replay offsets', () => {
    for (const seed of [-1, 0x1_0000_0000, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '1', null]) {
      assert.throws(() => createSeededPieceSource(seed), RangeError);
    }
    for (const offset of [-1, 1.5, MAX_SEQUENCE_OFFSET + 1, Number.NaN, Number.POSITIVE_INFINITY, '1', null]) {
      assert.throws(() => createSeededPieceSource(1, offset), RangeError);
    }
  });

  it('never falls back to ambient Math.random', () => {
    const source = readFileSync(new URL('../public/game-piece-sequence.js', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /Math\.random/);
  });
});
