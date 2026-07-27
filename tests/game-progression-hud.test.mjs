import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const gameSource = readFileSync(new URL('../public/game.js', import.meta.url), 'utf8');
const indexSource = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

describe('visible next-level progression', () => {
  it('renders initial progress in both desktop and portrait HUDs', () => {
    assert.match(
      indexSource,
      /<div class="row"><span>Next level<\/span><span id="levelProgress" aria-live="polite">0 \/ 10<\/span><\/div>/,
    );
    assert.match(
      indexSource,
      /<div class="mini"><span>Next<\/span> <span id="levelProgressP" aria-live="polite">0 \/ 10<\/span><\/div>/,
    );
  });

  it('retains progress text from each shared progression result', () => {
    assert.match(gameSource, /let levelProgressText;/);
    assert.equal(
      (gameSource.match(/levelProgressText = progression\.progressText;/g) || []).length,
      2,
    );
  });

  it('updates both HUD progress surfaces together', () => {
    assert.match(gameSource, /const levelProgressEl = document\.getElementById\('levelProgress'\);/);
    assert.match(gameSource, /const levelProgressP = document\.getElementById\('levelProgressP'\);/);

    const hudStart = gameSource.indexOf('function updateHUD()');
    const hudEnd = gameSource.indexOf('\n}\n\nfunction drawCell', hudStart);
    assert.notEqual(hudStart, -1);
    assert.notEqual(hudEnd, -1);
    const hudSource = gameSource.slice(hudStart, hudEnd);

    assert.match(hudSource, /levelProgressEl\.textContent = levelProgressText;/);
    assert.match(hudSource, /levelProgressP\.textContent = levelProgressText;/);
  });
});
