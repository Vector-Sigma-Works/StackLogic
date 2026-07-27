import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const gameSource = readFileSync(new URL('../public/game.js', import.meta.url), 'utf8');

describe('competitive scoring game-loop integration', () => {
  it('imports the shared scoring authority', () => {
    assert.match(
      gameSource,
      /import\s*\{\s*scoreDrop,\s*scoreLineClear\s*\}\s*from\s*['"]\.\/game-scoring\.js['"]/,
    );
  });

  it('uses the pre-progression level for line-clear points', () => {
    const clearStart = gameSource.indexOf('function clearLines()');
    const clearEnd = gameSource.indexOf('\n}\n\nfunction spawn()', clearStart);
    assert.notEqual(clearStart, -1);
    assert.notEqual(clearEnd, -1);
    const clearSource = gameSource.slice(clearStart, clearEnd);

    const scoreIndex = clearSource.indexOf('score += scoreLineClear(cleared, level);');
    const progressionIndex = clearSource.indexOf('const progression = getProgression(lines);');
    assert.notEqual(scoreIndex, -1);
    assert.notEqual(progressionIndex, -1);
    assert.ok(scoreIndex < progressionIndex);
    assert.doesNotMatch(clearSource, /lineScores|cleared \* 200/);
  });

  it('scores only successful deliberate soft-drop cells', () => {
    const softStart = gameSource.indexOf('function softDropOnce()');
    const softEnd = gameSource.indexOf('\n}\n\nfunction hardDrop()', softStart);
    assert.notEqual(softStart, -1);
    assert.notEqual(softEnd, -1);
    const softSource = gameSource.slice(softStart, softEnd);

    assert.match(softSource, /score \+= scoreDrop\('soft', 1\);/);
    assert.doesNotMatch(softSource, /score \+= 1/);
  });

  it('scores the exact successful hard-drop distance', () => {
    const hardStart = gameSource.indexOf('function hardDrop()');
    const hardEnd = gameSource.indexOf('\n}\n\nfunction move\(dir\)', hardStart);
    assert.notEqual(hardStart, -1);
    assert.notEqual(hardEnd, -1);
    const hardSource = gameSource.slice(hardStart, hardEnd);

    assert.match(hardSource, /score \+= scoreDrop\('hard', dist\);/);
    assert.doesNotMatch(hardSource, /score \+= dist \* 2/);
  });
});
