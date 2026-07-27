import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const gameSource = readFileSync(new URL('../public/game.js', import.meta.url), 'utf8');

describe('progression game-loop integration', () => {
  it('uses the shared progression module as the only speed and level authority', () => {
    assert.match(
      gameSource,
      /import\s*\{[^}]*describeLevelChange[^}]*getProgression[^}]*\}\s*from\s*['"]\.\/game-progression\.js['"]/s,
    );
    assert.doesNotMatch(
      gameSource,
      /LINES_PER_LEVEL|MIN_DROP_MS|START_DROP_MS|DROP_DECREASE_PER_LEVEL|function computeDropInterval/,
    );
    assert.equal((gameSource.match(/getProgression\(/g) || []).length, 2);
  });

  it('recomputes progression after line clears and reports real level transitions', () => {
    assert.match(gameSource, /const previousLevel = level;/);
    assert.match(gameSource, /const progression = getProgression\(lines\);/);
    assert.match(gameSource, /level = progression\.level;/);
    assert.match(gameSource, /dropInterval = progression\.dropIntervalMs;/);
    assert.match(gameSource, /const levelUpMessage = describeLevelChange\(previousLevel, level\);/);
    assert.match(gameSource, /if \(levelUpMessage\) setStatus\(levelUpMessage\);/);
  });

  it('initializes level and drop interval from the shared progression result', () => {
    const resetStart = gameSource.indexOf('function resetGameState()');
    const resetEnd = gameSource.indexOf('\n}\n\nfunction updateHUD()', resetStart);
    assert.notEqual(resetStart, -1);
    assert.notEqual(resetEnd, -1);
    const resetSource = gameSource.slice(resetStart, resetEnd);

    assert.match(resetSource, /const progression = getProgression\(lines\);/);
    assert.match(resetSource, /level = progression\.level;/);
    assert.match(resetSource, /dropInterval = progression\.dropIntervalMs;/);
    assert.doesNotMatch(resetSource, /computeDropInterval/);
  });
});
