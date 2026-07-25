import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const [css, html, game] = await Promise.all([
  readFile(new URL('../public/style.css', import.meta.url), 'utf8'),
  readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../public/game.js', import.meta.url), 'utf8'),
]);

function relativeLuminance(hex) {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const linear = channels.map((value) => (
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  ));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(a, b) {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

function themeVariable(theme, variable) {
  const block = css.match(new RegExp(`\\[data-theme="${theme}"\\] \\{([\\s\\S]*?)\\}`));
  assert.ok(block, `${theme} CSS block exists`);
  const value = block[1].match(new RegExp(`--${variable}:\\s*(#[0-9a-fA-F]{6})`));
  assert.ok(value, `${theme} defines --${variable}`);
  return value[1];
}

describe('theme control accessibility', () => {
  it('selected labels meet WCAG AA contrast in every theme', () => {
    assert.match(css, /color:\s*var\(--accent-fg/);
    for (const theme of ['Default', 'Matrix', 'CandyPop', 'Dark']) {
      const ratio = contrastRatio(themeVariable(theme, 'accent-fg'), themeVariable(theme, 'accent'));
      assert.ok(ratio >= 4.5, `${theme} selected label contrast ${ratio.toFixed(3)} >= 4.5`);
    }
  });

  it('each radio group starts with one roving tab stop', () => {
    const groups = [...html.matchAll(/<div class="theme-controls"[^>]*role="radiogroup"[\s\S]*?<\/div>/g)];
    assert.equal(groups.length, 2);
    for (const group of groups) {
      assert.equal((group[0].match(/tabindex="0"/g) || []).length, 1);
      assert.equal((group[0].match(/tabindex="-1"/g) || []).length, 3);
    }
  });

  it('implements Arrow and Home/End keyboard selection within each radio group', () => {
    for (const key of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End']) {
      assert.match(game, new RegExp(`['"]${key}['"]`));
    }
    assert.match(game, /closest\(['"]\.theme-controls['"]\)/);
    assert.match(game, /\.focus\(\)/);
    assert.match(game, /setAttribute\(['"]tabindex['"]/);
  });
});
