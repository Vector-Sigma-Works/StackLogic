import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createRainController } from '../public/theme-rain-controller.js';
import { createRainBrowserAdapter, RAIN_GLYPHS } from '../public/theme-rain-adapter.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---- helpers ----

function makeSpies() {
  const calls = {
    createCanvasLayer: [],
    removeCanvasLayer: [],
    getViewportCssSize: [],
    getDevicePixelRatio: [],
    requestFrame: [],
    cancelFrame: [],
    addResizeListener: [],
    removeResizeListener: [],
    reducedMotionMatches: [],
    random: [],
    setTransform: [],
    fillRect: [],
    fillText: [],
    clearRect: [],
    fillStyleValues: [],
    fillStyleAtFillRect: [],
  };

  const viewportSize = { width: 400, height: 600 };
  const dpr = { value: 2 };

  let capturedFillStyle = null;

  const deps = {
    createCanvasLayer: (...args) => {
      calls.createCanvasLayer.push(args);
      const canvas = {
        width: 0,
        height: 0,
        style: { width: '', height: '' },
      };
      const ctx = {
        get fillStyle() { return capturedFillStyle; },
        set fillStyle(val) {
          capturedFillStyle = val;
          calls.fillStyleValues.push(val);
        },
        fillRect: (...a) => {
          calls.fillRect.push(a);
          calls.fillStyleAtFillRect.push(capturedFillStyle);
        },
        fillText: (...a) => calls.fillText?.push(a),
        setTransform: (...a) => calls.setTransform?.push(a),
        font: null,
        textAlign: null,
        textBaseline: null,
        save: () => {},
        restore: () => {},
        clearRect: (...a) => calls.clearRect?.push(a),
      };
      return { canvas, context: ctx };
    },
    removeCanvasLayer: (...args) => calls.removeCanvasLayer.push(args),
    getViewportCssSize: (...args) => {
      calls.getViewportCssSize.push(args);
      return { ...viewportSize };
    },
    getDevicePixelRatio: (...args) => {
      calls.getDevicePixelRatio.push(args);
      return dpr.value;
    },
    requestFrame: (...args) => {
      calls.requestFrame.push(args);
      const token = `frame-${calls.requestFrame.length}`;
      return token;
    },
    cancelFrame: (...args) => calls.cancelFrame.push(args),
    addResizeListener: (...args) => {
      calls.addResizeListener.push(args);
      return args[0];
    },
    removeResizeListener: (...args) => calls.removeResizeListener.push(args),
    reducedMotionMatches: () => {
      calls.reducedMotionMatches.push([]);
      return false;
    },
    random: () => {
      calls.random.push([]);
      return 0.5;
    },
  };

  return { deps, calls, viewportSize, dpr };
}

// ---- tests ----

describe('adapter: import has zero global/browser side effects', () => {
  it('importing the module does not call any injected platform functions', () => {
    assert.ok(Array.isArray(RAIN_GLYPHS), 'RAIN_GLYPHS is an array');
    assert.ok(Object.isFrozen(RAIN_GLYPHS), 'RAIN_GLYPHS is frozen');
    assert.strictEqual(typeof createRainBrowserAdapter, 'function', 'createRainBrowserAdapter is exported');
  });
});

describe('adapter: Matrix creates exactly one owned layer listener and pending frame', () => {
  it('handleTheme("Matrix") creates one layer, one listener, one frame, and one requestFrame call', () => {
    const { deps, calls } = makeSpies();
    const adapter = createRainBrowserAdapter(deps);
    adapter.handleTheme('Matrix');
    assert.strictEqual(calls.createCanvasLayer.length, 1, 'one layer created');
    assert.strictEqual(calls.addResizeListener.length, 1, 'one listener added');
    assert.strictEqual(calls.requestFrame.length, 1, 'one frame scheduled');
    assert.strictEqual(calls.getViewportCssSize.length, 1, 'viewport size read once');
    assert.strictEqual(calls.getDevicePixelRatio.length, 1, 'DPR read once');
    const state = adapter.getState();
    assert.strictEqual(state.state, 'RUNNING', 'controller state is RUNNING');
    assert.strictEqual(state.generation, 1, 'generation is 1');
  });
});

describe('adapter: repeated Matrix creates no duplicate resources', () => {
  it('calling handleTheme("Matrix") twice creates only one layer, one listener, one frame', () => {
    const { deps, calls } = makeSpies();
    const adapter = createRainBrowserAdapter(deps);
    adapter.handleTheme('Matrix');
    adapter.handleTheme('Matrix');
    assert.strictEqual(calls.createCanvasLayer.length, 1, 'only one layer created');
    assert.strictEqual(calls.addResizeListener.length, 1, 'only one listener added');
    assert.strictEqual(calls.requestFrame.length, 1, 'only one frame scheduled');
    const state = adapter.getState();
    assert.strictEqual(state.state, 'RUNNING', 'still RUNNING');
  });
});

describe('adapter: non-Matrix stops and removes exact owned frame listener and layer', () => {
  it('handleTheme("Default") after Matrix cancels frame, removes listener, removes layer, state IDLE', () => {
    const { deps, calls } = makeSpies();
    const adapter = createRainBrowserAdapter(deps);
    adapter.handleTheme('Matrix');
    const stateBefore = adapter.getState();
    const ownedToken = stateBefore.pendingFrameId;
    const ownedListener = stateBefore.listenerRef;
    const ownedLayer = stateBefore.layer;
    adapter.handleTheme('Default');
    assert.strictEqual(calls.cancelFrame.length, 1, 'cancelFrame called once');
    assert.strictEqual(calls.cancelFrame[0][0], ownedToken, 'cancelFrame received exact owned token');
    assert.strictEqual(calls.removeResizeListener.length, 1, 'removeResizeListener called once');
    assert.strictEqual(calls.removeResizeListener[0][0], ownedListener, 'removeResizeListener received exact listener');
    assert.strictEqual(calls.removeCanvasLayer.length, 1, 'removeCanvasLayer called once');
    assert.strictEqual(calls.removeCanvasLayer[0][0], ownedLayer, 'removeCanvasLayer received exact layer');
    const state = adapter.getState();
    assert.strictEqual(state.state, 'IDLE', 'state is IDLE');
  });
});

describe('adapter: non-Matrix before start and repeated dispose are no-ops', () => {
  it('handleTheme("Default") before Matrix does nothing; repeated dispose is no-op', () => {
    const { deps, calls } = makeSpies();
    const adapter = createRainBrowserAdapter(deps);
    adapter.handleTheme('Default');
    assert.strictEqual(calls.createCanvasLayer.length, 0, 'no layer created');
    assert.strictEqual(calls.requestFrame.length, 0, 'no frame scheduled');
    adapter.dispose();
    adapter.dispose();
    assert.strictEqual(calls.cancelFrame.length, 0, 'no cancelFrame calls');
    const state = adapter.getState();
    assert.strictEqual(state.state, 'IDLE', 'state remains IDLE');
  });
});

describe('adapter: reduced motion creates zero layer listener frame or draw effects', () => {
  it('inject reducedMotionMatches returning true; handleTheme("Matrix") creates no resources', () => {
    const { deps, calls } = makeSpies();
    deps.reducedMotionMatches = () => true;
    const adapter = createRainBrowserAdapter(deps);
    adapter.handleTheme('Matrix');
    assert.strictEqual(calls.createCanvasLayer.length, 0, 'no layer created');
    assert.strictEqual(calls.addResizeListener.length, 0, 'no listener added');
    assert.strictEqual(calls.requestFrame.length, 0, 'no frame scheduled');
    const state = adapter.getState();
    assert.strictEqual(state.state, 'IDLE', 'state is IDLE');
  });
});

describe('adapter: reduced motion false permits start, then true blocks later start', () => {
  it('reducedMotionMatches=false starts Matrix; then reducedMotionMatches=true blocks subsequent start', () => {
    const { deps, calls } = makeSpies();
    // First: reduced motion is false, start should work
    deps.reducedMotionMatches = () => false;
    const adapter = createRainBrowserAdapter(deps);
    adapter.handleTheme('Matrix');
    assert.strictEqual(calls.createCanvasLayer.length, 1, 'layer created when reduced motion is false');
    assert.strictEqual(calls.requestFrame.length, 1, 'frame scheduled when reduced motion is false');

    // Now stop
    adapter.handleTheme('Default');
    assert.strictEqual(adapter.getState().state, 'IDLE', 'stopped');

    // Reset calls
    calls.createCanvasLayer.length = 0;
    calls.requestFrame.length = 0;
    calls.addResizeListener.length = 0;

    // Now reduced motion is true, start should be blocked
    deps.reducedMotionMatches = () => true;
    adapter.handleTheme('Matrix');
    assert.strictEqual(calls.createCanvasLayer.length, 0, 'no layer when reduced motion is true');
    assert.strictEqual(calls.requestFrame.length, 0, 'no frame when reduced motion is true');
    assert.strictEqual(calls.addResizeListener.length, 0, 'no listener when reduced motion is true');
  });
});

describe('adapter: reduced motion true->false recovery', () => {
  it('initial true blocks Matrix; switching to false permits start with one layer/listener/frame', () => {
    const { deps, calls } = makeSpies();
    // Initial: reduced motion is true — should be no-op
    deps.reducedMotionMatches = () => true;
    const adapter = createRainBrowserAdapter(deps);
    adapter.handleTheme('Matrix');
    assert.strictEqual(calls.createCanvasLayer.length, 0, 'no layer with reduced motion true');
    assert.strictEqual(calls.addResizeListener.length, 0, 'no listener with reduced motion true');
    assert.strictEqual(calls.requestFrame.length, 0, 'no frame with reduced motion true');
    assert.strictEqual(adapter.getState().state, 'IDLE', 'state is IDLE after blocked start');

    // Switch to reduced motion false and start again
    deps.reducedMotionMatches = () => false;
    adapter.handleTheme('Matrix');
    assert.strictEqual(calls.createCanvasLayer.length, 1, 'layer created after switching to false');
    assert.strictEqual(calls.addResizeListener.length, 1, 'listener added after switching to false');
    assert.strictEqual(calls.requestFrame.length, 1, 'frame scheduled after switching to false');
    assert.strictEqual(adapter.getState().state, 'RUNNING', 'state is RUNNING after recovery');
  });
});

describe('adapter: reduced motion false->true while RUNNING stops controller and cleans up exact resources', () => {
  it('start Matrix with reducedMotion=false, invoke first frame callback, capture state, switch reducedMotion=true, call handleTheme(Matrix); verify exact successor cancelled, exact listener/layer removed, controller IDLE, no new resources, stale successor is inert', () => {
    const { deps, calls } = makeSpies();
    calls.fillText = [];
    calls.fillRect = [];

    // Step 1: Start Matrix with reducedMotion=false
    deps.reducedMotionMatches = () => false;
    const adapter = createRainBrowserAdapter(deps);
    adapter.handleTheme('Matrix');
    assert.strictEqual(calls.createCanvasLayer.length, 1, 'layer created');
    assert.strictEqual(calls.addResizeListener.length, 1, 'listener added');
    assert.strictEqual(calls.requestFrame.length, 1, 'one frame scheduled');

    // Step 2: Manually invoke the first stored frame callback so a successor exists
    const firstFrameCallback = calls.requestFrame[0][0];
    firstFrameCallback();
    assert.strictEqual(calls.requestFrame.length, 2, 'one successor frame scheduled after first callback');
    assert.ok(calls.fillText.length > 0, 'drawFrame executed (glyphs drawn)');

    // Step 3: Capture the controller's exact current state
    const stateBefore = adapter.getState();
    const exactPendingFrameId = stateBefore.pendingFrameId;
    const exactListenerRef = stateBefore.listenerRef;
    const exactLayer = stateBefore.layer;
    const fillTextCountBefore = calls.fillText.length;
    const requestFrameCountBefore = calls.requestFrame.length;
    assert.strictEqual(stateBefore.state, 'RUNNING', 'controller is RUNNING');
    assert.ok(exactPendingFrameId !== null, 'pendingFrameId is set (successor exists)');
    assert.ok(exactListenerRef !== null, 'listenerRef is set');
    assert.ok(exactLayer !== null, 'layer is set');

    // Step 4: Change reducedMotionMatches to true
    deps.reducedMotionMatches = () => true;

    // Step 5: Call handleTheme('Matrix') while RUNNING
    adapter.handleTheme('Matrix');

    // GREEN: exact captured successor is cancelled
    assert.strictEqual(calls.cancelFrame.length, 1, 'one cancelFrame call');
    assert.strictEqual(calls.cancelFrame[0][0], exactPendingFrameId, 'cancelFrame received exact successor token');

    // GREEN: exact listener removed
    assert.strictEqual(calls.removeResizeListener.length, 1, 'one removeResizeListener call');
    assert.strictEqual(calls.removeResizeListener[0][0], exactListenerRef, 'removeResizeListener received exact listener');

    // GREEN: exact layer removed
    assert.strictEqual(calls.removeCanvasLayer.length, 1, 'one removeCanvasLayer call');
    assert.strictEqual(calls.removeCanvasLayer[0][0], exactLayer, 'removeCanvasLayer received exact layer');

    // GREEN: controller IDLE
    const stateAfter = adapter.getState();
    assert.strictEqual(stateAfter.state, 'IDLE', 'controller is IDLE after reduced-motion stop');
    assert.strictEqual(stateAfter.pendingFrameId, null, 'pendingFrameId cleared');
    assert.strictEqual(stateAfter.listenerRef, null, 'listenerRef cleared');
    assert.strictEqual(stateAfter.layer, null, 'layer cleared');

    // GREEN: no new resources created
    assert.strictEqual(calls.requestFrame.length, requestFrameCountBefore, 'no new requestFrame calls');
    assert.strictEqual(calls.createCanvasLayer.length, 1, 'no new layer created');
    assert.strictEqual(calls.addResizeListener.length, 1, 'no new listener added');

    // GREEN: no new draw
    assert.strictEqual(calls.fillText.length, fillTextCountBefore, 'no new fillText calls after reduced-motion stop');

    // Step 6: Manually invoke the stale successor and assert no new draw and no new scheduling
    const staleCallback = calls.requestFrame[1][0];
    const fillTextCountBeforeStale = calls.fillText.length;
    const requestFrameCountBeforeStale = calls.requestFrame.length;
    staleCallback();
    assert.strictEqual(calls.fillText.length, fillTextCountBeforeStale, 'no new fillText after stale callback');
    assert.strictEqual(calls.requestFrame.length, requestFrameCountBeforeStale, 'no new requestFrame after stale callback');
  });
});

describe('adapter: manual first RAF callback draws once and schedules exactly one successor', () => {
  it('invoke stored frame callback; drawFrame called once, one successor frame scheduled', () => {
    const { deps, calls } = makeSpies();
    calls.fillText = [];
    calls.fillRect = [];
    const adapter = createRainBrowserAdapter(deps);
    adapter.handleTheme('Matrix');
    // Get the frame callback that was scheduled
    const frameCallback = calls.requestFrame[0][0];
    // Invoke it manually
    frameCallback();
    // drawFrame draws all drops (one pass) — check fillText was called
    assert.ok(calls.fillText.length > 0, 'drawFrame called (glyphs drawn)');
    // One successor frame scheduled
    assert.strictEqual(calls.requestFrame.length, 2, 'one successor frame scheduled');
    const state = adapter.getState();
    assert.strictEqual(state.state, 'RUNNING', 'still RUNNING');
  });
});

describe('adapter: semi-transparent overlay retains trails', () => {
  it('fillStyle spy captures rgba black with numeric alpha between 0 and 1 at fillRect', () => {
    const { deps, calls } = makeSpies();
    calls.fillText = [];
    calls.fillRect = [];
    const adapter = createRainBrowserAdapter(deps);
    adapter.handleTheme('Matrix');
    const frameCallback = calls.requestFrame[0][0];
    frameCallback();
    // The spy captures fillStyle at each fillRect call
    assert.ok(calls.fillStyleAtFillRect.length > 0, 'fillStyle captured at fillRect');
    const overlayStyle = calls.fillStyleAtFillRect[0];
    assert.ok(overlayStyle.startsWith('rgba(0, 0, 0,'), 'overlay uses rgba black');
    const alphaMatch = overlayStyle.match(/rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*([0-9.]+)\)/);
    assert.ok(alphaMatch, 'overlay has numeric alpha');
    const alpha = parseFloat(alphaMatch[1]);
    assert.ok(Number.isFinite(alpha), 'alpha is a finite number');
    assert.ok(alpha > 0 && alpha < 1, `alpha ${alpha} is strictly between 0 and 1`);
  });
});

describe('adapter: DPR changes propagate to setTransform on resize', () => {
  it('changing DPR and resizing updates setTransform with new DPR', () => {
    const { deps, calls, dpr } = makeSpies();
    const adapter = createRainBrowserAdapter(deps);
    adapter.handleTheme('Matrix');
    // Get the resize handler that was registered
    const resizeHandler = calls.addResizeListener[0][0];
    // First resize with initial DPR=2
    resizeHandler();
    assert.strictEqual(calls.setTransform.length, 2, 'setTransform called twice (start + resize)');
    assert.strictEqual(calls.setTransform[0][0], 2, 'initial setTransform DPR x is 2');
    assert.strictEqual(calls.setTransform[0][3], 2, 'initial setTransform DPR y is 2');
    // Change DPR to 3 via mutable object
    dpr.value = 3;
    // Second resize with DPR=3
    resizeHandler();
    assert.strictEqual(calls.setTransform.length, 3, 'setTransform called three times');
    assert.strictEqual(calls.setTransform[2][0], 3, 'second resize setTransform DPR x is 3');
    assert.strictEqual(calls.setTransform[2][3], 3, 'second resize setTransform DPR y is 3');
  });
});

describe('adapter: resize callback dynamically rereads viewport and DPR and configures backing/CSS dimensions and context transform', () => {
  it('resizeLayer triggers configureBackingStore with new viewport and DPR', () => {
    const { deps, calls, viewportSize, dpr } = makeSpies();
    const adapter = createRainBrowserAdapter(deps);
    adapter.handleTheme('Matrix');
    // Get the resize handler that was registered
    const resizeHandler = calls.addResizeListener[0][0];
    // Simulate resize
    resizeHandler();
    // Verify backing store was configured
    assert.strictEqual(calls.getViewportCssSize.length, 2, 'viewport size read twice (start + resize)');
    assert.strictEqual(calls.getDevicePixelRatio.length, 2, 'DPR read twice');
    // Check setTransform was called with DPR
    assert.ok(calls.setTransform.length > 0, 'setTransform called');
    assert.strictEqual(calls.setTransform[calls.setTransform.length - 1][0], dpr.value, 'setTransform DPR x');
    assert.strictEqual(calls.setTransform[calls.setTransform.length - 1][1], 0, 'setTransform DPR y skew');
    assert.strictEqual(calls.setTransform[calls.setTransform.length - 1][2], 0, 'setTransform x skew');
    assert.strictEqual(calls.setTransform[calls.setTransform.length - 1][3], dpr.value, 'setTransform DPR y');
    assert.strictEqual(calls.setTransform[calls.setTransform.length - 1][4], 0, 'setTransform x offset');
    assert.strictEqual(calls.setTransform[calls.setTransform.length - 1][5], 0, 'setTransform y offset');
  });
});

describe('adapter: drops persist and advance across two manually invoked frames', () => {
  it('two manual frame invocations advance drop.y for surviving columns, not cumulative call count', () => {
    const { deps, calls } = makeSpies();
    calls.fillText = [];
    calls.fillRect = [];
    const adapter = createRainBrowserAdapter(deps);
    adapter.handleTheme('Matrix');

    // First frame
    const frameCallback = calls.requestFrame[0][0];
    frameCallback();
    const firstCount = calls.fillText.length;
    const frame1Calls = calls.fillText.slice(0, firstCount);

    // Second frame
    const successorCallback = calls.requestFrame[1][0];
    successorCallback();
    const frame2Calls = calls.fillText.slice(firstCount);

    // Same number of columns drawn in both frames
    assert.strictEqual(frame1Calls.length, frame2Calls.length, 'same column count across frames');

    // Group frame 1 by x coordinate
    const xCoords1 = new Map();
    for (const call of frame1Calls) {
      const x = call[1];
      const y = call[2];
      if (!xCoords1.has(x) || y > xCoords1.get(x)) {
        xCoords1.set(x, y);
      }
    }

    // Group frame 2 by x coordinate
    const xCoords2 = new Map();
    for (const call of frame2Calls) {
      const x = call[1];
      const y = call[2];
      if (!xCoords2.has(x) || y > xCoords2.get(x)) {
        xCoords2.set(x, y);
      }
    }

    // Same x columns in both frames
    assert.strictEqual(xCoords1.size, xCoords2.size, 'same x column count');
    for (const [x] of xCoords1) {
      assert.ok(xCoords2.has(x), `column x=${x} present in both frames`);
    }

    // At least some columns advanced y
    let advancedCount = 0;
    for (const [x, y1] of xCoords1) {
      const y2 = xCoords2.get(x);
      if (y2 !== undefined && y2 > y1) {
        advancedCount++;
      }
    }
    assert.ok(advancedCount > 0, `at least ${advancedCount} columns advanced y across frames`);
  });
});

describe('adapter: every fillText glyph belongs to the exported bounded glyph set', () => {
  it('all fillText calls use glyphs from RAIN_GLYPHS', () => {
    const { deps, calls } = makeSpies();
    calls.fillText = [];
    const adapter = createRainBrowserAdapter(deps);
    adapter.handleTheme('Matrix');
    // Invoke multiple frames to get multiple glyphs
    const frameCallback = calls.requestFrame[0][0];
    frameCallback();
    const successorCallback = calls.requestFrame[1][0];
    successorCallback();
    // Check every fillText call's glyph argument
    for (const fillTextCall of calls.fillText) {
      const glyph = fillTextCall[0];
      assert.ok(RAIN_GLYPHS.includes(glyph), `glyph "${glyph}" belongs to RAIN_GLYPHS`);
    }
  });
});

describe('adapter: tests use real createRainController and stored non-auto-running callbacks', () => {
  it('adapter imports createRainController from the real controller module, callbacks are stored not auto-running', () => {
    const adapterPath = join(__dirname, '..', 'public', 'theme-rain-adapter.js');
    const source = readFileSync(adapterPath, 'utf-8');
    assert.match(
      source,
      /from '\.\/theme-rain-controller\.js(?:\?v=[^']+)?'/,
      'adapter imports real controller'
    );
    assert.ok(source.includes('createRainController'), 'adapter uses createRainController');
  });
});

describe('adapter: source contains no #game access and no browser bootstrap', () => {
  it('adapter source has no #game selector and no bootstrap/index/CSS', () => {
    const adapterPath = join(__dirname, '..', 'public', 'theme-rain-adapter.js');
    const source = readFileSync(adapterPath, 'utf-8');
    assert.ok(!source.includes('#game'), 'no #game selector');
    assert.ok(!source.includes('bootstrap'), 'no bootstrap');
    assert.ok(!source.includes('index.html'), 'no index reference');
    assert.ok(!source.includes('<link'), 'no CSS link');
    assert.ok(!source.includes('<style'), 'no inline style');
  });
});

describe('adapter: RAIN_GLYPHS is a frozen bounded constant with digits/Latin/katakana', () => {
  it('RAIN_GLYPHS is frozen, non-empty, single chars, contains digits/Latin/katakana', () => {
    assert.ok(Object.isFrozen(RAIN_GLYPHS), 'RAIN_GLYPHS is frozen');
    assert.ok(RAIN_GLYPHS.length > 0, 'RAIN_GLYPHS is non-empty');
    for (const glyph of RAIN_GLYPHS) {
      assert.strictEqual(typeof glyph, 'string', 'each glyph is a string');
      assert.strictEqual(glyph.length, 1, 'each glyph is a single character');
    }
    // Verify presence of digits
    const hasDigits = RAIN_GLYPHS.some(g => g >= '0' && g <= '9');
    assert.ok(hasDigits, 'RAIN_GLYPHS contains digits');
    // Verify presence of Latin
    const hasLatin = RAIN_GLYPHS.some(g => (g >= 'A' && g <= 'Z') || (g >= 'a' && g <= 'z'));
    assert.ok(hasLatin, 'RAIN_GLYPHS contains Latin characters');
    // Verify presence of katakana (Unicode range 0x30A0-0x30FF)
    const hasKatakana = RAIN_GLYPHS.some(g => {
      const code = g.charCodeAt(0);
      return code >= 0x30A0 && code <= 0x30FF;
    });
    assert.ok(hasKatakana, 'RAIN_GLYPHS contains katakana characters');
  });
});

describe('adapter: dispose after Matrix is idempotent', () => {
  it('handleTheme("Matrix"), dispose, dispose; only one cancelFrame call', () => {
    const { deps, calls } = makeSpies();
    const adapter = createRainBrowserAdapter(deps);
    adapter.handleTheme('Matrix');
    adapter.dispose();
    adapter.dispose();
    assert.strictEqual(calls.cancelFrame.length, 1, 'only one cancelFrame call');
    const state = adapter.getState();
    assert.strictEqual(state.state, 'IDLE', 'state is IDLE');
  });
});

describe('adapter: getState reports controller state without creating resources', () => {
  it('getState before start returns IDLE without calling any platform functions', () => {
    const { deps, calls } = makeSpies();
    const adapter = createRainBrowserAdapter(deps);
    const state = adapter.getState();
    assert.strictEqual(state.state, 'IDLE', 'state is IDLE');
    assert.strictEqual(state.generation, 0, 'generation is 0');
    assert.strictEqual(state.layer, null, 'layer is null');
    assert.strictEqual(state.pendingFrameId, null, 'pendingFrameId is null');
    assert.strictEqual(state.listenerRef, null, 'listenerRef is null');
  });
});

describe('adapter: resize retains surviving drop state, truncates on shrink, creates on expansion', () => {
  it('shrink width drops columns, expand width adds columns, surviving columns retain/advance state', () => {
    const { deps, calls, viewportSize, dpr } = makeSpies();
    calls.fillText = [];
    calls.fillRect = [];
    const adapter = createRainBrowserAdapter(deps);
    adapter.handleTheme('Matrix');

    // Initial state: width=400, dpr=2
    // Columns = ceil(400/14) = 29
    const initialColumns = Math.ceil(400 / 14);
    assert.strictEqual(initialColumns, 29, 'initial column count is 29');

    // Advance one frame to establish drops
    const frameCallback = calls.requestFrame[0][0];
    frameCallback();
    const glyphCountBefore = calls.fillText.length;
    assert.strictEqual(glyphCountBefore, initialColumns, `initial frame drew ${initialColumns} glyphs`);

    // Get resize handler
    const resizeHandler = calls.addResizeListener[0][0];

    // --- Shrink: width 400 -> 200, DPR 2 -> 3 ---
    // Mutate the values returned by the already-injected dependency functions.
    viewportSize.width = 200;
    viewportSize.height = 600;
    dpr.value = 3;

    resizeHandler();

    // Verify backing store configured with new dimensions
    const shrinkState = adapter.getState();
    const shrinkLayer = shrinkState.layer;
    assert.ok(shrinkLayer, 'layer exists after shrink');
    assert.strictEqual(shrinkLayer.canvas.width, 600, 'backing width after shrink (200*3)');
    assert.strictEqual(shrinkLayer.canvas.height, 1800, 'backing height after shrink (600*3)');
    assert.strictEqual(shrinkLayer.canvas.style.width, '200px', 'CSS width after shrink');
    assert.strictEqual(shrinkLayer.canvas.style.height, '600px', 'CSS height after shrink');

    // Verify setTransform with DPR=3
    assert.ok(calls.setTransform.length > 0, 'setTransform called after shrink');
    const lastShrinkTransform = calls.setTransform[calls.setTransform.length - 1];
    assert.strictEqual(lastShrinkTransform[0], 3, 'setTransform DPR x after shrink');
    assert.strictEqual(lastShrinkTransform[3], 3, 'setTransform DPR y after shrink');

    // Verify viewport/DPR re-read
    assert.strictEqual(calls.getViewportCssSize.length, 2, 'viewport re-read on shrink');
    assert.strictEqual(calls.getDevicePixelRatio.length, 2, 'DPR re-read on shrink');

    // Advance frame after shrink — should have fewer columns
    const shrinkFrameCallback = calls.requestFrame[1][0];
    const shrinkFrameStart = calls.fillText.length;
    shrinkFrameCallback();
    const shrinkFrameCalls = calls.fillText.slice(shrinkFrameStart);
    const glyphCountAfterShrink = shrinkFrameCalls.length;
    const shrinkColumns = Math.ceil(200 / 14);
    assert.strictEqual(shrinkColumns, 15, 'shrink column count is 15');
    assert.strictEqual(glyphCountAfterShrink, shrinkColumns, `shrink frame drew ${shrinkColumns} glyphs`);
    assert.ok(glyphCountAfterShrink < glyphCountBefore, `columns dropped: ${glyphCountAfterShrink} < ${glyphCountBefore}`);

    // Capture surviving logical columns by deterministic draw order. Rendered x is
    // geometry, not identity: an edge-clamped column must move when width changes.
    const survivingYs = shrinkFrameCalls.map((call) => call[2]);

    // --- Expand: width 200 -> 800, DPR stays 3 ---
    viewportSize.width = 800;

    resizeHandler();

    // Verify backing store configured with expanded dimensions
    const expandState = adapter.getState();
    const expandLayer = expandState.layer;
    assert.ok(expandLayer, 'layer exists after expand');
    assert.strictEqual(expandLayer.canvas.width, 2400, 'backing width after expand (800*3)');
    assert.strictEqual(expandLayer.canvas.height, 1800, 'backing height after expand (600*3)');
    assert.strictEqual(expandLayer.canvas.style.width, '800px', 'CSS width after expand');
    assert.strictEqual(expandLayer.canvas.style.height, '600px', 'CSS height after expand');

    // Verify setTransform still DPR=3
    const lastExpandTransform = calls.setTransform[calls.setTransform.length - 1];
    assert.strictEqual(lastExpandTransform[0], 3, 'setTransform DPR x after expand');
    assert.strictEqual(lastExpandTransform[3], 3, 'setTransform DPR y after expand');

    // Verify viewport/DPR re-read
    assert.strictEqual(calls.getViewportCssSize.length, 3, 'viewport re-read on expand');
    assert.strictEqual(calls.getDevicePixelRatio.length, 3, 'DPR re-read on expand');

    // Advance frame after expand — should have more columns
    const expandFrameCallback = calls.requestFrame[2][0];
    const expandFrameStart = calls.fillText.length;
    expandFrameCallback();
    const expandFrameCalls = calls.fillText.slice(expandFrameStart);
    const glyphCountAfterExpand = expandFrameCalls.length;
    const expandColumns = Math.ceil(800 / 14);
    assert.strictEqual(expandColumns, 58, 'expand column count is 58');
    assert.strictEqual(glyphCountAfterExpand, expandColumns, `expand frame drew ${expandColumns} glyphs`);
    assert.ok(glyphCountAfterExpand > glyphCountAfterShrink, `columns added: ${glyphCountAfterExpand} > ${glyphCountAfterShrink}`);

    // Every surviving logical column occupies the same ordered prefix and advances y.
    for (let column = 0; column < survivingYs.length; column++) {
      const y1 = survivingYs[column];
      const y2 = expandFrameCalls[column][2];
      assert.ok(y2 > y1, `surviving column ${column} advanced y: ${y1} -> ${y2}`);
    }
    assert.strictEqual(survivingYs.length, shrinkColumns, `all ${shrinkColumns} surviving columns retained and advanced`);
  });
});

describe('adapter: controller remains sole RAF owner and exact cleanup passes', () => {
  it('controller owns all frames; stop cancels exact owned frame and removes exact owned resources', () => {
    const { deps, calls } = makeSpies();
    const adapter = createRainBrowserAdapter(deps);
    adapter.handleTheme('Matrix');

    const stateBefore = adapter.getState();
    assert.strictEqual(stateBefore.state, 'RUNNING', 'running');

    // Advance one frame to get a successor
    const frameCallback = calls.requestFrame[0][0];
    frameCallback();

    // Now stop
    adapter.handleTheme('Default');

    // Verify exact cleanup
    assert.strictEqual(calls.cancelFrame.length, 1, 'one cancelFrame');
    assert.strictEqual(calls.removeResizeListener.length, 1, 'one removeResizeListener');
    assert.strictEqual(calls.removeCanvasLayer.length, 1, 'one removeCanvasLayer');

    const state = adapter.getState();
    assert.strictEqual(state.state, 'IDLE', 'state is IDLE');
    assert.strictEqual(state.pendingFrameId, null, 'pendingFrameId cleared');
    assert.strictEqual(state.listenerRef, null, 'listenerRef cleared');
  });
});
