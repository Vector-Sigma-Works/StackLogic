import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const themeSrc = readFileSync(join(__dirname, '..', 'public', 'theme.js'), 'utf-8');
const htmlSrc = readFileSync(join(__dirname, '..', 'public', 'index.html'), 'utf-8');
const cssSrc = readFileSync(join(__dirname, '..', 'public', 'style.css'), 'utf-8');
const gameSrc = readFileSync(join(__dirname, '..', 'public', 'game.js'), 'utf-8');

// Minimal browser-like environment for Node built-in tests.
const STORAGE = {};
const mockStyle = {};
mockStyle.setProperty = function(key, value) { this[key] = value; };
mockStyle.getPropertyValue = function(key) { return this[key] || ''; };
const mockDocumentElement = {
  style: mockStyle,
  getAttribute: (k) => (GLOBALS.docAttrs && GLOBALS.docAttrs[k]) || null,
  setAttribute: (k, v) => { GLOBALS.docAttrs = GLOBALS.docAttrs || {}; GLOBALS.docAttrs[k] = v; },
};
const mockDocument = {
  documentElement: mockDocumentElement,
  createElement: () => ({ style: {}, classList: { add: () => {}, remove: () => {} } }),
  body: { style: {} },
};
const mockLocalStorage = {
  getItem: (k) => STORAGE[k] || null,
  setItem: (k, v) => { STORAGE[k] = String(v); },
};
const mockWindow = {
  localStorage: mockLocalStorage,
  document: mockDocument,
  matchMedia: (q) => ({
    matches: q.includes('no-preference'),
    addEventListener: () => {},
    removeEventListener: () => {},
  }),
};

const GLOBALS = {
  window: mockWindow,
  document: mockDocument,
  localStorage: mockLocalStorage,
  docAttrs: {},
};

// Evaluate theme.js in a function that uses the injected globals.
// The IIFE attaches ThemeModule to `root` (which is `window` here).
new Function(
  'window', 'document', 'localStorage',
  themeSrc
)(mockWindow, mockDocument, mockLocalStorage);

const themeModule = mockWindow.ThemeModule;

describe('Theme module', () => {
  it('exports Default, Matrix, CandyPop, Dark theme definitions', () => {
    assert.ok(themeModule.themes, 'themes object must exist');
    assert.ok(themeModule.themes.Default, 'Default theme must exist');
    assert.ok(themeModule.themes.Matrix, 'Matrix theme must exist');
    assert.ok(themeModule.themes.CandyPop, 'CandyPop theme must exist');
    assert.ok(themeModule.themes.Dark, 'Dark theme must exist');
    for (const key of ['Default', 'Matrix', 'CandyPop', 'Dark']) {
      const t = themeModule.themes[key];
      assert.ok(typeof t.name === 'string', `${key}.name must be a string`);
      assert.ok(typeof t.cssVars === 'object', `${key}.cssVars must be an object`);
      assert.ok(Array.isArray(t.cssVars), `${key}.cssVars must be an array of [key, value] pairs`);
    }
  });

  it('theme selection persists via localStorage key', () => {
    for (const k of Object.keys(STORAGE)) delete STORAGE[k];
    themeModule.selectTheme('Matrix');
    const saved = mockLocalStorage.getItem('stacklogic_theme_v1');
    assert.strictEqual(saved, 'Matrix', 'localStorage key must store selected theme');
  });

  it('theme application function exists and returns valid CSS variable map', () => {
    assert.ok(typeof themeModule.applyTheme === 'function', 'applyTheme must be a function');
    const result = themeModule.applyTheme('CandyPop');
    assert.ok(Array.isArray(result), 'applyTheme must return an array');
    assert.ok(result.length > 0, 'applyTheme must return at least one CSS variable');
    for (const entry of result) {
      assert.strictEqual(entry.length, 2, 'each entry must be [name, value]');
      assert.strictEqual(typeof entry[0], 'string', 'name must be a string');
      assert.strictEqual(typeof entry[1], 'string', 'value must be a string');
    }
  });

  it('reduced-motion preference blocks ambient animation flag', () => {
    for (const key of ['Default', 'Matrix', 'CandyPop', 'Dark']) {
      assert.ok('ambientAnimation' in themeModule.themes[key], `${key} must have ambientAnimation`);
    }
  });

  // ---- Integration assertions (RED until UI is wired) ----

  it('index.html contains theme control buttons for all four themes', () => {
    for (const name of ['Default', 'Matrix', 'CandyPop', 'Dark']) {
      assert.ok(
        htmlSrc.includes(`data-theme="${name}"`) || htmlSrc.includes(`data-theme='${name}'`),
        `index.html must contain a theme control button for ${name}`
      );
    }
  });

  it('index.html exposes enabled Create Match and Join Match controls', () => {
    assert.match(
      htmlSrc,
      /id="createMatchBtn"[^>]*type="button"/
    );
    assert.match(
      htmlSrc,
      /id="joinMatchBtn"[^>]*type="button"/
    );
    assert.doesNotMatch(htmlSrc, /id="createMatchBtn"[^>]*\bdisabled\b/);
    assert.doesNotMatch(htmlSrc, /id="joinMatchBtn"[^>]*\bdisabled\b/);
    assert.doesNotMatch(htmlSrc, /Coming Soon/);
  });

  it('index.html Play Solo button is the primary action', () => {
    // startBtn should have Play Solo label (or Start with aria-label Play Solo)
    const startBtnMatch = htmlSrc.match(/id="startBtn"[^>]*>([^<]*)</);
    assert.ok(startBtnMatch, 'index.html must contain startBtn element');
    const btnText = startBtnMatch[1] || '';
    assert.ok(
      btnText.includes('Play Solo') || btnText.includes('Play') || btnText.includes('Start'),
      'startBtn text must indicate Play Solo / Start'
    );
  });

  it('style.css contains theme CSS variable sets for all four themes', () => {
    // Each theme should have a CSS class or attribute selector that sets --bg
    for (const name of ['Default', 'Matrix', 'CandyPop', 'Dark']) {
      const pattern = new RegExp(`--bg:\\s*#[0-9a-fA-F]{6}`, 'g');
      const matches = cssSrc.match(pattern);
      assert.ok(matches && matches.length >= 4, `style.css must define --bg for all themes (found ${matches ? matches.length : 0})`);
    }
  });

  it('style.css contains prefers-reduced-motion media query', () => {
    assert.ok(
      cssSrc.includes('prefers-reduced-motion'),
      'style.css must contain prefers-reduced-motion media query'
    );
  });

  it('game.js loads and initializes the theme module', () => {
    assert.ok(
      gameSrc.includes('ThemeModule') || gameSrc.includes('theme.js'),
      'game.js must reference ThemeModule or theme.js'
    );
    assert.ok(
      gameSrc.includes('ThemeModule.init') || gameSrc.includes('themeModule.init') || gameSrc.includes('ThemeModule.applyTheme'),
      'game.js must call ThemeModule.init or ThemeModule.applyTheme'
    );
  });

  it('theme application sets CSS variables on document root', () => {
    // Verify that applyTheme actually sets properties on documentElement.style
    for (const k of Object.keys(STORAGE)) delete STORAGE[k];
    const result = themeModule.applyTheme('Matrix');
    assert.strictEqual(mockDocument.documentElement.style.getPropertyValue('--bg'), '#0a0a0a', 'Matrix --bg must be set on documentElement');
    assert.strictEqual(mockDocument.documentElement.style.getPropertyValue('--fg'), '#00ff41', 'Matrix --fg must be set on documentElement');
  });

  it('Matrix and CandyPop have distinct visual presentation', () => {
    const matrixVars = themeModule.themes.Matrix.cssVars;
    const candyVars = themeModule.themes.CandyPop.cssVars;
    const matrixBg = matrixVars.find(v => v[0] === '--bg');
    const candyBg = candyVars.find(v => v[0] === '--bg');
    assert.ok(matrixBg, 'Matrix must define --bg');
    assert.ok(candyBg, 'CandyPop must define --bg');
    assert.notStrictEqual(matrixBg[1], candyBg[1], 'Matrix and CandyPop must have different --bg values');
    const matrixFg = matrixVars.find(v => v[0] === '--fg');
    const candyFg = candyVars.find(v => v[0] === '--fg');
    assert.notStrictEqual(matrixFg[1], candyFg[1], 'Matrix and CandyPop must have different --fg values');
  });

  // ---- Bounded correction: data-theme attribute and themed canvas ----

  it('applyTheme sets data-theme attribute on documentElement', () => {
    for (const k of Object.keys(STORAGE)) delete STORAGE[k];
    GLOBALS.docAttrs = {};
    themeModule.applyTheme('Dark');
    assert.strictEqual(
      mockDocument.documentElement.getAttribute('data-theme'),
      'Dark',
      'applyTheme must set data-theme on documentElement'
    );
    themeModule.applyTheme('CandyPop');
    assert.strictEqual(
      mockDocument.documentElement.getAttribute('data-theme'),
      'CandyPop',
      'applyTheme must update data-theme when theme changes'
    );
  });

  it('style.css uses a CSS variable for canvas#game background, not a hardcoded color', () => {
    // The canvas background must reference a CSS variable (e.g. var(--bg))
    // rather than a literal hex color, so theme selectors can control it.
    const canvasRule = cssSrc.match(/canvas#game\s*\{[^}]*background\s*:\s*([^;]+);/);
    assert.ok(canvasRule, 'canvas#game must have a background declaration');
    const bgValue = canvasRule[1].trim();
    assert.ok(
      bgValue.startsWith('var('),
      `canvas#game background must use a CSS variable (found: ${bgValue})`
    );
  });
});
