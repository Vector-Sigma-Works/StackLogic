import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DROP_POINTS_PER_CELL,
  LINE_CLEAR_POINTS,
  scoreDrop,
  scoreLineClear,
} from '../public/game-scoring.js';

describe('deterministic competitive scoring', () => {
  it('publishes frozen standard line-clear and drop values', () => {
    assert.deepEqual(LINE_CLEAR_POINTS, [0, 100, 300, 500, 800]);
    assert.deepEqual(DROP_POINTS_PER_CELL, { soft: 1, hard: 2 });
    assert.equal(Object.isFrozen(LINE_CLEAR_POINTS), true);
    assert.equal(Object.isFrozen(DROP_POINTS_PER_CELL), true);
  });

  it('scores one through four cleared lines at the supplied pre-clear level', () => {
    assert.equal(scoreLineClear(0, 1), 0);
    assert.equal(scoreLineClear(1, 1), 100);
    assert.equal(scoreLineClear(2, 1), 300);
    assert.equal(scoreLineClear(3, 1), 500);
    assert.equal(scoreLineClear(4, 1), 800);
    assert.equal(scoreLineClear(1, 3), 300);
    assert.equal(scoreLineClear(4, 3), 2400);
  });

  it('scores only deliberate soft and hard drop distance', () => {
    assert.equal(scoreDrop('soft', 0), 0);
    assert.equal(scoreDrop('soft', 3), 3);
    assert.equal(scoreDrop('hard', 3), 6);
  });

  it('fails closed for malformed or impossible scoring inputs', () => {
    for (const [lines, level] of [
      [-1, 1],
      [5, 1],
      [1.5, 1],
      [1, 0],
      [1, -1],
      [1, 1.5],
      ['1', 1],
      [1, '1'],
      [1, Number.NaN],
      [1, Number.POSITIVE_INFINITY],
    ]) {
      assert.equal(scoreLineClear(lines, level), 0);
    }

    for (const [kind, cells] of [
      ['gravity', 1],
      ['soft', -1],
      ['soft', 1.5],
      ['hard', Number.NaN],
      ['hard', Number.POSITIVE_INFINITY],
      ['hard', '2'],
    ]) {
      assert.equal(scoreDrop(kind, cells), 0);
    }
  });

  it('rejects unsafe integer totals instead of emitting divergent scores', () => {
    assert.equal(scoreLineClear(4, Number.MAX_SAFE_INTEGER), 0);
    assert.equal(scoreDrop('hard', Number.MAX_SAFE_INTEGER), 0);
  });
});
