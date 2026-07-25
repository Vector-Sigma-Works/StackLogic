import { describe, it } from 'node:test';
import assert from 'node:assert';

// Load the module under test. It attaches to globalThis.
import '../public/theme-renderer.js';

// ---- helpers ----
function makeMockCtx() {
  const calls = {
    fillRect: [],
    strokeRect: [],
    fillStyle: [],
    strokeStyle: [],
    font: [],
    fillText: [],
    beginPath: [],
    arc: [],
    fill: [],
    stroke: [],
    linearGradient: [],
    addColorStop: [],
    save: [],
    restore: [],
  };
  const ctx = {
    get fillStyle() { return calls.fillStyle[calls.fillStyle.length - 1] ?? null; },
    set fillStyle(v) { calls.fillStyle.push(v); },
    get strokeStyle() { return calls.strokeStyle[calls.strokeStyle.length - 1] ?? null; },
    set strokeStyle(v) { calls.strokeStyle.push(v); },
    get font() { return calls.font[calls.font.length - 1] ?? null; },
    set font(v) { calls.font.push(v); },
    fillRect(x, y, w, h) { calls.fillRect.push({ x, y, w, h, fillStyle: ctx.fillStyle }); },
    strokeRect(x, y, w, h) { calls.strokeRect.push({ x, y, w, h }); },
    fillText(text, x, y) { calls.fillText.push({ text, x, y }); },
    beginPath() { calls.beginPath.push(); },
    arc(x, y, r, start, end) { calls.arc.push({ x, y, r, start, end }); },
    fill() { calls.fill.push(); },
    stroke() { calls.stroke.push(); },
    createLinearGradient(x0, y0, x1, y1) {
      calls.linearGradient.push({ x0, y0, x1, y1 });
      return { addColorStop: (offset, color) => calls.addColorStop.push({ offset, color }) };
    },
    save() { calls.save.push(); },
    restore() { calls.restore.push(); },
  };
  return { ctx, calls };
}

// ---- tests ----

describe('theme-renderer: exports', () => {
  it('exports drawBrick as a function', () => {
    assert.strictEqual(typeof globalThis.drawBrick, 'function');
  });

  it('exports getRenderer as a function', () => {
    assert.strictEqual(typeof globalThis.getRenderer, 'function');
  });

  it('exports getActiveRenderer as a function', () => {
    assert.strictEqual(typeof globalThis.getActiveRenderer, 'function');
  });

  it('exports THEME_KEYS as an array of four theme names', () => {
    assert.ok(Array.isArray(globalThis.THEME_KEYS));
    assert.strictEqual(globalThis.THEME_KEYS.length, 4);
    assert.ok(globalThis.THEME_KEYS.includes('Default'));
    assert.ok(globalThis.THEME_KEYS.includes('Matrix'));
    assert.ok(globalThis.THEME_KEYS.includes('CandyPop'));
    assert.ok(globalThis.THEME_KEYS.includes('Dark'));
  });
});

describe('theme-renderer: theme identity', () => {
  it('Default and Matrix return distinct descriptors', () => {
    const d = globalThis.getRenderer('Default');
    const m = globalThis.getRenderer('Matrix');
    assert.notStrictEqual(d, m);
    assert.strictEqual(d.themeId, 'Default');
    assert.strictEqual(m.themeId, 'Matrix');
  });

  it('CandyPop and Dark return distinct descriptors', () => {
    const c = globalThis.getRenderer('CandyPop');
    const dk = globalThis.getRenderer('Dark');
    assert.notStrictEqual(c, dk);
    assert.strictEqual(c.themeId, 'CandyPop');
    assert.strictEqual(dk.themeId, 'Dark');
  });

  it('all four themes return descriptors with shape and corners fields', () => {
    for (const key of globalThis.THEME_KEYS) {
      const r = globalThis.getRenderer(key);
      assert.ok(r.shape, `${key} missing shape`);
      assert.ok(r.corners !== undefined, `${key} missing corners`);
    }
  });
});

describe('theme-renderer: geometry preserved', () => {
  it('drawBrick uses the passed cellSize for positioning', () => {
    const { ctx, calls } = makeMockCtx();
    globalThis.drawBrick(ctx, 2, 3, '#ff0000', 'Default', 30);
    const rect = calls.fillRect[0];
    assert.strictEqual(rect.x, 60);   // 2 * 30
    assert.strictEqual(rect.y, 90);   // 3 * 30
    assert.strictEqual(rect.w, 30);
    assert.strictEqual(rect.h, 30);
  });

  it('drawBrick with cellSize 30 produces 30x30 bricks', () => {
    const { ctx, calls } = makeMockCtx();
    globalThis.drawBrick(ctx, 0, 0, '#ff0000', 'Default', 30);
    const rect = calls.fillRect[0];
    assert.strictEqual(rect.w, 30);
    assert.strictEqual(rect.h, 30);
  });

  it('drawBrick respects arbitrary cellSize', () => {
    const { ctx, calls } = makeMockCtx();
    globalThis.drawBrick(ctx, 1, 1, '#ff0000', 'Default', 20);
    const rect = calls.fillRect[0];
    assert.strictEqual(rect.x, 20);
    assert.strictEqual(rect.y, 20);
    assert.strictEqual(rect.w, 20);
    assert.strictEqual(rect.h, 20);
  });
});

describe('theme-renderer: unknown fallback', () => {
  it('getRenderer("Nonexistent") returns the Default renderer', () => {
    const fallback = globalThis.getRenderer('Nonexistent');
    assert.strictEqual(fallback.themeId, 'Default');
  });
});

describe('theme-renderer: solid Matrix and Dark palettes', () => {
  const pieceColors = ['#67e8f9', '#fde047', '#c084fc', '#86efac', '#fda4af', '#93c5fd', '#fdba74'];
  const matrixShades = ['#006b2b', '#008f39', '#00a844', '#00bd4d', '#00d657', '#16e968', '#3df27f'];
  const darkShades = ['#101010', '#1c1c1c', '#282828', '#343434', '#424242', '#525252', '#646464'];

  it('Matrix draws each standard piece as one deterministic solid green shade with no glyph', () => {
    pieceColors.forEach((color, index) => {
      const { ctx, calls } = makeMockCtx();
      globalThis.drawBrick(ctx, index, 0, color, 'Matrix', 30);
      assert.strictEqual(calls.fillRect.length, 1);
      assert.strictEqual(calls.fillRect[0].fillStyle, matrixShades[index]);
      assert.strictEqual(calls.fillText.length, 0);
    });
    assert.strictEqual(new Set(matrixShades).size, pieceColors.length);
    assert.strictEqual(globalThis.getRenderer('Matrix').glyphs, null);
  });

  it('Dark draws each standard piece as one deterministic solid black-to-grey shade', () => {
    pieceColors.forEach((color, index) => {
      const { ctx, calls } = makeMockCtx();
      globalThis.drawBrick(ctx, index, 0, color, 'Dark', 30);
      assert.strictEqual(calls.fillRect.length, 1);
      assert.strictEqual(calls.fillRect[0].fillStyle, darkShades[index]);
      assert.strictEqual(calls.fillText.length, 0);
    });
    assert.strictEqual(new Set(darkShades).size, pieceColors.length);
  });
});

describe('theme-renderer: candyPop rounded', () => {
  it('CandyPop renderer has nonzero cornerRadius', () => {
    const c = globalThis.getRenderer('CandyPop');
    assert.ok(c.cornerRadius > 0, 'CandyPop cornerRadius should be > 0');
  });

  it('CandyPop renderer has highlight tokens', () => {
    const c = globalThis.getRenderer('CandyPop');
    assert.ok(c.highlight !== undefined, 'CandyPop missing highlight');
    assert.ok(c.highlight !== null, 'CandyPop highlight should not be null');
  });
});

describe('theme-renderer: getActiveRenderer', () => {
  it('getActiveRenderer returns renderer for current theme', () => {
    globalThis.ThemeModule = { getCurrentTheme: () => 'Matrix' };
    const r = globalThis.getActiveRenderer();
    assert.strictEqual(r.themeId, 'Matrix');
  });

  it('getActiveRenderer falls back to Default when no ThemeModule', () => {
    delete globalThis.ThemeModule;
    const r = globalThis.getActiveRenderer();
    assert.strictEqual(r.themeId, 'Default');
  });
});

// ---- RED tests for contract-amendment-1 required corrections ----

describe('amendment: index.html renderer script load order', () => {
  it('theme-renderer.js appears after theme.js and before game.js in index.html', async () => {
    const fs = await import('node:fs');
    const html = fs.readFileSync(
      new URL('../public/index.html', import.meta.url),
      'utf8'
    );
    const themeIdx = html.indexOf('<script src="theme.js"');
    const rendererIdx = html.indexOf('<script src="theme-renderer.js"');
    const gameIdx = html.indexOf('src="game.js"');
    assert.ok(themeIdx >= 0, 'theme.js script tag must exist');
    assert.ok(rendererIdx >= 0, 'theme-renderer.js script tag must exist');
    assert.ok(gameIdx >= 0, 'game.js script tag must exist');
    assert.ok(
      themeIdx < rendererIdx,
      'theme-renderer.js must load after theme.js'
    );
    assert.ok(
      rendererIdx < gameIdx,
      'theme-renderer.js must load before game.js'
    );
  });
});

describe('amendment: drawBrickAt pixel-coordinate geometry', () => {
  it('drawBrickAt draws at exact pixel coords without double-scaling', () => {
    const { ctx, calls } = makeMockCtx();
    // drawBrickAt should accept pixel coordinates directly
    assert.strictEqual(typeof globalThis.drawBrickAt, 'function');
    globalThis.drawBrickAt(ctx, 100, 200, '#ff0000', 'Default', 30);
    const rect = calls.fillRect[0];
    assert.strictEqual(rect.x, 100, 'x should be exact pixel coord 100');
    assert.strictEqual(rect.y, 200, 'y should be exact pixel coord 200');
    assert.strictEqual(rect.w, 30, 'width should be cellSize 30');
    assert.strictEqual(rect.h, 30, 'height should be cellSize 30');
  });

  it('drawBrickAt works with arbitrary pixel coords and cellSize', () => {
    const { ctx, calls } = makeMockCtx();
    globalThis.drawBrickAt(ctx, 42, 97, '#00ff00', 'Dark', 20);
    const rect = calls.fillRect[0];
    assert.strictEqual(rect.x, 42);
    assert.strictEqual(rect.y, 97);
    assert.strictEqual(rect.w, 20);
    assert.strictEqual(rect.h, 20);
  });
});
