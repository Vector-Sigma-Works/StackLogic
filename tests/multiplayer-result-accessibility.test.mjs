import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

describe('Pass 04 result accessibility contract', () => {
  it('ships a labelled modal result dialog with live result and rematch status surfaces', async () => {
    const html = await read('public/index.html');
    assert.match(html, /<div id="gameOver" class="overlay" role="dialog" aria-modal="true" aria-labelledby="gameResultTitle"/);
    assert.match(html, /<h2 id="gameResultTitle" class="title" aria-live="assertive"/);
    assert.match(html, /<p class="hint" id="gameOverText" aria-live="polite"/);
    assert.match(html, /<p id="rematchStatus" class="hint" aria-live="polite"/);
    assert.match(html, /id="victoryFireworks"[^>]*hidden aria-hidden="true"/);
  });

  it('suppresses decorative winner animation for reduced-motion users', async () => {
    const css = await read('public/style.css');
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\.victory-fireworks\s*\{[\s\S]*?animation:\s*none/s);
  });
});
