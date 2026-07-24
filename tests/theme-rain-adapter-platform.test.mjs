import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRainBrowserAdapter } from '../public/theme-rain-adapter.js';

function makeHarness({ width, height, dpr }) {
  const viewport = { width, height };
  let currentDpr = dpr;
  let resizeHandler = null;
  let nextFrameId = 1;
  const callbacks = new Map();
  const fillTextCalls = [];
  const fillRectCalls = [];
  const transformCalls = [];
  const context = {
    fillStyle: '',
    font: '',
    setTransform(...args) { transformCalls.push(args); },
    fillRect(...args) { fillRectCalls.push(args); },
    fillText(glyph, x, y) { fillTextCalls.push({ glyph, x, y }); },
  };
  const layer = { canvas: { width: 0, height: 0, style: {} }, context };
  let randomCall = 0;
  const deps = {
    createCanvasLayer: () => layer,
    removeCanvasLayer: () => {},
    getViewportCssSize: () => ({ ...viewport }),
    getDevicePixelRatio: () => currentDpr,
    requestFrame(cb) {
      const id = nextFrameId++;
      callbacks.set(id, cb);
      return id;
    },
    cancelFrame: () => {},
    addResizeListener(handler) {
      resizeHandler = handler;
      return { type: 'resize-listener' };
    },
    removeResizeListener: () => {},
    random() {
      const slot = randomCall % 3;
      const column = Math.floor(randomCall / 3) % 100;
      randomCall++;
      if (slot === 0) return 0;
      if (slot === 1) return (column + 1) / 100;
      return column / 100;
    },
    reducedMotionMatches: () => false,
  };
  const adapter = createRainBrowserAdapter(deps);
  return {
    adapter,
    layer,
    viewport,
    setDpr(value) { currentDpr = value; },
    resize() {
      assert.equal(typeof resizeHandler, 'function');
      resizeHandler();
    },
    runFrame() {
      const before = fillTextCalls.length;
      const id = adapter.getState().pendingFrameId;
      const cb = callbacks.get(id);
      assert.equal(typeof cb, 'function');
      cb();
      return fillTextCalls.slice(before);
    },
    fillRectCalls,
    transformCalls,
  };
}

function expectedX(column, width) {
  return Math.min((column + 0.5) * 14, Math.max(0, width - 1));
}

function assertUniqueInRange(frame, width, count) {
  assert.equal(frame.length, count);
  const xs = frame.map(({ x }) => x);
  assert.equal(new Set(xs).size, count);
  for (const x of xs) assert.ok(x >= 0 && x < width, `x=${x} outside [0,${width})`);
  assert.deepEqual(xs, Array.from({ length: count }, (_, column) => expectedX(column, width)));
}

describe('Matrix rain platform geometry', () => {
  it('reconciles exact stable columns and recomputes x across 400→200→800 resize', () => {
    const h = makeHarness({ width: 400, height: 100, dpr: 2 });
    h.adapter.handleTheme('Matrix');
    const wide = h.runFrame();
    assertUniqueInRange(wide, 400, Math.ceil(400 / 14));

    h.viewport.width = 200;
    h.setDpr(3);
    h.resize();
    const narrow = h.runFrame();
    assertUniqueInRange(narrow, 200, Math.ceil(200 / 14));
    for (let column = 0; column < narrow.length; column++) {
      const speed = wide[column].y;
      assert.ok(Math.abs((narrow[column].y - wide[column].y) - speed) < 1e-9,
        `column ${column} did not retain y/speed across shrink`);
    }

    h.viewport.width = 800;
    h.resize();
    const expanded = h.runFrame();
    assertUniqueInRange(expanded, 800, Math.ceil(800 / 14));
    for (let column = 0; column < narrow.length; column++) {
      const speed = narrow[column].y - wide[column].y;
      assert.ok(Math.abs((expanded[column].y - narrow[column].y) - speed) < 1e-9,
        `column ${column} did not retain y/speed across expansion`);
    }
  });

  it('uses DPR only for backing dimensions/transform and draws in CSS pixels', () => {
    const h = makeHarness({ width: 200, height: 100, dpr: 3 });
    h.adapter.handleTheme('Matrix');
    assert.equal(h.layer.canvas.width, 600);
    assert.equal(h.layer.canvas.height, 300);
    assert.equal(h.layer.canvas.style.width, '200px');
    assert.equal(h.layer.canvas.style.height, '100px');
    assert.deepEqual(h.transformCalls.at(-1), [3, 0, 0, 3, 0, 0]);

    const frame = h.runFrame();
    assert.deepEqual(h.fillRectCalls.at(-1), [0, 0, 200, 100]);
    assertUniqueInRange(frame, 200, Math.ceil(200 / 14));
  });
});
