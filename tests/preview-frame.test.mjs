import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  computePreviewFrameLayout,
  drawPreviewFrame,
} from '../public/preview-frame.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const gameSource = readFileSync(join(__dirname, '..', 'public', 'game.js'), 'utf8');

const T_SHAPE = [
  [0, 1, 0],
  [1, 1, 1],
  [0, 0, 0],
];

describe('next-piece preview frame', () => {
  it('computes a bounded frame with an internal label band and enclosed piece', () => {
    const layout = computePreviewFrameLayout({
      canvasWidth: 300,
      canvasHeight: 600,
      shape: T_SHAPE,
      cellSize: 21,
      outerPadding: 8,
      framePadding: 6,
      labelHeight: 16,
    });

    assert.deepStrictEqual(layout, {
      frameX: 217,
      frameY: 8,
      frameWidth: 75,
      frameHeight: 97,
      pieceX: 223,
      pieceY: 30,
      pieceWidth: 63,
      pieceHeight: 63,
      labelX: 223,
      labelY: 20,
    });
    assert.ok(layout.frameX >= 0 && layout.frameY >= 0);
    assert.ok(layout.frameX + layout.frameWidth <= 300);
    assert.ok(layout.frameY + layout.frameHeight <= 600);
    assert.ok(layout.pieceX >= layout.frameX);
    assert.ok(layout.pieceY > layout.labelY);
    assert.ok(layout.pieceX + layout.pieceWidth <= layout.frameX + layout.frameWidth);
    assert.ok(layout.pieceY + layout.pieceHeight <= layout.frameY + layout.frameHeight);
  });

  it('draws one crisp lightweight frame and one internal Next label using supplied theme colors', () => {
    const calls = [];
    const context = {
      save() { calls.push(['save']); },
      restore() { calls.push(['restore']); },
      strokeRect(...args) { calls.push(['strokeRect', ...args]); },
      fillText(...args) { calls.push(['fillText', ...args]); },
      set strokeStyle(value) { calls.push(['strokeStyle', value]); },
      set fillStyle(value) { calls.push(['fillStyle', value]); },
      set lineWidth(value) { calls.push(['lineWidth', value]); },
      set font(value) { calls.push(['font', value]); },
      set textBaseline(value) { calls.push(['textBaseline', value]); },
    };
    const layout = computePreviewFrameLayout({
      canvasWidth: 300,
      canvasHeight: 600,
      shape: T_SHAPE,
      cellSize: 21,
    });

    drawPreviewFrame(context, layout, {
      borderColor: '#283244',
      labelColor: '#e6edf3',
    });

    assert.deepStrictEqual(calls, [
      ['save'],
      ['strokeStyle', '#283244'],
      ['fillStyle', '#e6edf3'],
      ['lineWidth', 1],
      ['font', '12px sans-serif'],
      ['textBaseline', 'alphabetic'],
      ['strokeRect', 217.5, 8.5, 74, 96],
      ['fillText', 'Next', 223, 20],
      ['restore'],
    ]);
  });

  it('rejects empty or out-of-bounds geometry instead of drawing an invalid frame', () => {
    assert.throws(
      () => computePreviewFrameLayout({ canvasWidth: 300, canvasHeight: 600, shape: [], cellSize: 21 }),
      /shape/,
    );
    assert.throws(
      () => computePreviewFrameLayout({ canvasWidth: 50, canvasHeight: 50, shape: T_SHAPE, cellSize: 21 }),
      /fit/,
    );
  });

  it('is integrated into the live next-piece draw path', () => {
    assert.match(gameSource, /computePreviewFrameLayout/);
    assert.match(gameSource, /drawPreviewFrame/);
    assert.match(gameSource, /getComputedStyle\(document\.documentElement\)/);
  });
});
