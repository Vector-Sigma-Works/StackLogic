import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  DROP_INTERVALS_MS,
  LINES_PER_LEVEL,
  describeLevelChange,
  getProgression,
} from '../public/game-progression.js';

const gameSource = readFileSync(new URL('../public/game.js', import.meta.url), 'utf8');
const indexSource = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

describe('deterministic gameplay progression', () => {
  it('uses one explicit frozen speed curve with a stable minimum interval', () => {
    assert.equal(LINES_PER_LEVEL, 10);
    assert.deepEqual(DROP_INTERVALS_MS, [
      800, 720, 630, 550, 470, 400, 340, 290, 250, 220,
      195, 170, 150, 135, 120, 105, 95, 85, 80,
    ]);
    assert.equal(Object.isFrozen(DROP_INTERVALS_MS), true);
  });

  it('reports level, visible progress, remaining lines, and interval at boundaries', () => {
    assert.deepEqual(getProgression(0), {
      totalLines: 0,
      level: 1,
      linesIntoLevel: 0,
      linesToNextLevel: 10,
      progressText: '0 / 10',
      dropIntervalMs: 800,
    });
    assert.deepEqual(getProgression(9), {
      totalLines: 9,
      level: 1,
      linesIntoLevel: 9,
      linesToNextLevel: 1,
      progressText: '9 / 10',
      dropIntervalMs: 800,
    });
    assert.deepEqual(getProgression(10), {
      totalLines: 10,
      level: 2,
      linesIntoLevel: 0,
      linesToNextLevel: 10,
      progressText: '0 / 10',
      dropIntervalMs: 720,
    });
    assert.deepEqual(getProgression(189), {
      totalLines: 189,
      level: 19,
      linesIntoLevel: 9,
      linesToNextLevel: 1,
      progressText: '9 / 10',
      dropIntervalMs: 80,
    });
    assert.equal(getProgression(10_000).dropIntervalMs, 80);
  });

  it('normalizes invalid line totals deterministically', () => {
    assert.deepEqual(getProgression(-3), getProgression(0));
    assert.deepEqual(getProgression(Number.NaN), getProgression(0));
    assert.deepEqual(getProgression(Number.POSITIVE_INFINITY), getProgression(0));
    assert.deepEqual(getProgression(19.9), getProgression(19));
  });

  it('announces only a real upward level transition', () => {
    assert.equal(describeLevelChange(1, 1), '');
    assert.equal(describeLevelChange(2, 1), '');
    assert.equal(describeLevelChange(1, 2), 'Level up! 2');
    assert.equal(describeLevelChange(2, 4), 'Level up! 4');
  });

  it('integrates the shared progression result into reset, line clear, and both HUDs', () => {
    assert.match(gameSource, /from ['"]\.\/game-progression\.js['"]/);
    assert.equal((gameSource.match(/getProgression\(/g) || []).length >= 2, true);
    assert.match(gameSource, /describeLevelChange\(/);
    assert.doesNotMatch(gameSource, /DROP_DECREASE_PER_LEVEL|function computeDropInterval/);
    assert.match(gameSource, /levelProgressEl\.textContent\s*=\s*progression\.progressText/);
    assert.match(gameSource, /levelProgressP\.textContent\s*=\s*progression\.progressText/);
    assert.match(indexSource, /id="levelProgress"[^>]*>0 \/ 10</);
    assert.match(indexSource, /id="levelProgressP"[^>]*>0 \/ 10</);
  });
});
