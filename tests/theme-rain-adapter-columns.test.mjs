import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createRainBrowserAdapter } from '../public/theme-rain-adapter.js';

describe('theme-rain-adapter columns invariant', () => {
  it('viewport 42x1, random 0.99: per-frame 3 fillText, 3 unique x in [0,42)', () => {
    // --- fake deps ---
    const fillTextCalls = [];
    const fakeContext = {
      setTransform() {},
      fillStyle: null,
      font: null,
      fillRect() {},
      fillText(glyph, x, y) {
        fillTextCalls.push({ glyph, x, y });
      },
    };

    const fakeLayer = { canvas: { width: 0, height: 0, style: {} }, context: fakeContext };

    const storedCallbacks = [];
    let pendingFrameId = 0;
    function requestFrame(cb) {
      const id = pendingFrameId++;
      storedCallbacks.push({ id, cb });
      return id;
    }
    function cancelFrame() {}
    function addResizeListener() { return {}; }
    function removeResizeListener() {}

    const deps = {
      createCanvasLayer() { return fakeLayer; },
      removeCanvasLayer() {},
      getViewportCssSize() { return { width: 42, height: 1 }; },
      getDevicePixelRatio() { return 1; },
      requestFrame,
      cancelFrame,
      addResizeListener,
      removeResizeListener,
      random() { return 0.99; },
      reducedMotionMatches() { return false; },
    };

    // --- build adapter ---
    const adapter = createRainBrowserAdapter(deps);

    // --- start Matrix theme ---
    adapter.handleTheme('Matrix');

    // --- verify controller is running ---
    const state = adapter.getState();
    assert.strictEqual(state.state, 'RUNNING', 'controller should be RUNNING');

    // --- manually run two successive RAF callbacks ---
    const cb0 = storedCallbacks.find(c => c.id === 0);
    assert.ok(cb0, 'first callback should exist');
    cb0.cb();

    const cb1 = storedCallbacks.find(c => c.id === 1);
    assert.ok(cb1, 'second callback should exist');
    cb1.cb();

    // --- per-frame assertions ---
    // Frame 0: calls 0..2
    const frame0 = fillTextCalls.slice(0, 3);
    assert.equal(frame0.length, 3, 'frame 0: exactly 3 fillText calls');
    const x0 = frame0.map(c => c.x);
    const uniqueX0 = [...new Set(x0)];
    assert.equal(uniqueX0.length, 3, 'frame 0: 3 unique x values');
    for (const x of x0) {
      assert.ok(x >= 0 && x < 42, `frame 0: x=${x} must be in [0,42)`);
    }

    // Frame 1: calls 3..5
    const frame1 = fillTextCalls.slice(3, 6);
    assert.equal(frame1.length, 3, 'frame 1: exactly 3 fillText calls');
    const x1 = frame1.map(c => c.x);
    const uniqueX1 = [...new Set(x1)];
    assert.equal(uniqueX1.length, 3, 'frame 1: 3 unique x values');
    for (const x of x1) {
      assert.ok(x >= 0 && x < 42, `frame 1: x=${x} must be in [0,42)`);
    }

    // Verify columns are stable: x should be 7, 21, 35 for columns 0,1,2
    const expectedX = [7, 21, 35];
    for (let i = 0; i < 3; i++) {
      assert.strictEqual(x0[i], expectedX[i], `frame 0 column ${i} x should be ${expectedX[i]}`);
      assert.strictEqual(x1[i], expectedX[i], `frame 1 column ${i} x should be ${expectedX[i]}`);
    }
  });
});
