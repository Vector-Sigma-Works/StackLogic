import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const gameSource = readFileSync(new URL('../public/game.js', import.meta.url), 'utf8');

function functionSource(name, nextName) {
  const start = gameSource.indexOf(`function ${name}`);
  const end = gameSource.indexOf(`\n}\n\nfunction ${nextName}`, start);
  assert.notEqual(start, -1, `${name} must exist`);
  assert.notEqual(end, -1, `${nextName} must follow ${name}`);
  return gameSource.slice(start, end);
}

describe('seeded piece-sequence game-loop integration', () => {
  it('imports the seeded sequence authority and removes ambient random bags', () => {
    assert.match(
      gameSource,
      /import\s*\{\s*createSeededPieceSource\s*\}\s*from\s*['"]\.\/game-piece-sequence\.js['"]/,
    );
    assert.doesNotMatch(gameSource, /function randomBag\(|Math\.random|\blet bag\b/);
    assert.match(gameSource, /\blet pieceSource\b/);
  });

  it('creates solo seeds only from browser cryptographic entropy', () => {
    const source = functionSource('createSoloSeed()', 'loadFallbackScores()');
    assert.match(source, /const seed = new Uint32Array\(1\);/);
    assert.match(source, /globalThis\.crypto\.getRandomValues\(seed\);/);
    assert.match(source, /return seed\[0\];/);
    assert.doesNotMatch(source, /Date\.now|performance|Math\.random/);
  });

  it('draws every current and preview piece from one seeded source', () => {
    const nextSource = functionSource('nextFromSequence()', 'collide(b, p)');
    assert.match(nextSource, /return pieceSource\.next\(\);/);

    const spawnSource = functionSource('spawn()', 'resetGameState(seed = createSoloSeed())');
    assert.equal((spawnSource.match(/nextFromSequence\(\)/g) || []).length, 2);
    assert.doesNotMatch(spawnSource, /randomBag|Math\.random/);
  });

  it('initializes a replayable source from the supplied seed before spawning', () => {
    const resetSource = functionSource('resetGameState(seed = createSoloSeed())', 'updateHUD()');
    const sourceIndex = resetSource.indexOf('pieceSource = createSeededPieceSource(seed);');
    const spawnIndex = resetSource.indexOf('spawn();');
    assert.notEqual(sourceIndex, -1);
    assert.notEqual(spawnIndex, -1);
    assert.ok(sourceIndex < spawnIndex);
  });

  it('accepts a future server-issued seed while preserving solo start behavior', () => {
    const startSource = functionSource('startGame(seed = createSoloSeed())', 'update(time = 0)');
    assert.match(startSource, /resetGameState\(seed\);/);
    assert.doesNotMatch(startSource, /createSeededPieceSource|Math\.random/);
    assert.match(gameSource, /startBtn\.addEventListener\('click', \(\) => \{\s*startGame\(\);\s*\}\);/s);
  });
});
