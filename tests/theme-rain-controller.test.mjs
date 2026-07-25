import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createRainController } from '../public/theme-rain-controller.js';

// ---- helpers ----

function makeSpies() {
  const calls = {
    createLayer: [],
    removeLayer: [],
    addResizeListener: [],
    removeResizeListener: [],
    requestFrame: [],
    cancelFrame: [],
    resizeLayer: [],
    drawFrame: [],
  };
  const deps = {
    createLayer: (...args) => {
      calls.createLayer.push(args);
      return { id: `layer-${calls.createLayer.length}` };
    },
    removeLayer: (...args) => calls.removeLayer.push(args),
    addResizeListener: (...args) => {
      calls.addResizeListener.push(args);
      return args[0]; // return the handler ref
    },
    removeResizeListener: (...args) => calls.removeResizeListener.push(args),
    requestFrame: (...args) => {
      calls.requestFrame.push(args);
      const token = `frame-${calls.requestFrame.length}`;
      return token;
    },
    cancelFrame: (...args) => calls.cancelFrame.push(args),
    resizeLayer: (...args) => calls.resizeLayer.push(args),
    drawFrame: (...args) => calls.drawFrame.push(args),
    reducedMotionMatches: false,
  };
  return { deps, calls };
}

// ---- tests ----

describe('rain-controller: start idempotence and single-owner scheduling', () => {
  it('calling start() twice creates only one layer, one listener, one frame', () => {
    const { deps, calls } = makeSpies();
    const ctrl = createRainController(deps);
    ctrl.start();
    ctrl.start();
    assert.strictEqual(calls.createLayer.length, 1, 'only one layer created');
    assert.strictEqual(calls.addResizeListener.length, 1, 'only one listener added');
    assert.strictEqual(calls.requestFrame.length, 1, 'only one frame scheduled');
    const state = ctrl.getState();
    assert.strictEqual(state.state, 'RUNNING');
    assert.strictEqual(state.generation, 1);
  });
});

describe('rain-controller: stop cleanup with exact owned handles', () => {
  it('stop cancels the owned frame, removes exact listener, removes owned layer, state returns IDLE', () => {
    const { deps, calls } = makeSpies();
    const ctrl = createRainController(deps);
    ctrl.start();
    const stateBefore = ctrl.getState();
    const ownedToken = stateBefore.pendingFrameId;
    const ownedListener = stateBefore.listenerRef;
    const ownedLayer = stateBefore.layer;
    ctrl.stop();
    assert.strictEqual(calls.cancelFrame.length, 1, 'cancelFrame called once');
    assert.strictEqual(calls.cancelFrame[0][0], ownedToken, 'cancelFrame received exact owned frame token');
    assert.strictEqual(calls.removeResizeListener.length, 1, 'removeResizeListener called once');
    assert.strictEqual(calls.removeResizeListener[0][0], ownedListener, 'removeResizeListener received exact owned listenerRef');
    assert.strictEqual(calls.removeLayer.length, 1, 'removeLayer called once');
    assert.strictEqual(calls.removeLayer[0][0], ownedLayer, 'removeLayer received exact owned layer');
    const state = ctrl.getState();
    assert.strictEqual(state.state, 'IDLE');
    assert.strictEqual(state.generation, 2);
  });
});

describe('rain-controller: reduced-motion zero-side-effect behavior', () => {
  it('inject reducedMotionMatches=true; start() never calls createLayer/addResizeListener/requestFrame, state stays IDLE', () => {
    const { deps, calls } = makeSpies();
    deps.reducedMotionMatches = true;
    const ctrl = createRainController(deps);
    ctrl.start();
    assert.strictEqual(calls.createLayer.length, 0, 'createLayer never called');
    assert.strictEqual(calls.addResizeListener.length, 0, 'addResizeListener never called');
    assert.strictEqual(calls.requestFrame.length, 0, 'requestFrame never called');
    const state = ctrl.getState();
    assert.strictEqual(state.state, 'IDLE');
    assert.strictEqual(state.generation, 0);
  });
});

describe('rain-controller: stale callback fencing after stop', () => {
  it('start, invoke pending frame callback, stop, invoke stale successor; drawFrame NOT called by stale callback, no new frame scheduled', () => {
    const { deps, calls } = makeSpies();
    const ctrl = createRainController(deps);
    ctrl.start();
    // Invoke the pending frame callback (simulates the frame firing)
    // This legitimately calls drawFrame once and schedules a successor
    const frameCallback = calls.requestFrame[0][0];
    frameCallback();
    // Assert exactly two scheduled calls before invoking stale successor
    assert.strictEqual(calls.requestFrame.length, 2, 'exactly two requestFrame calls before stale invocation');
    // Record drawFrame count after first callback
    const drawCountAfterFirst = calls.drawFrame.length;
    // Now stop — this invalidates the generation
    ctrl.stop();
    // Invoke the stale successor callback (scheduled by the first frame callback)
    const staleCallback = calls.requestFrame[1][0];
    staleCallback();
    // drawFrame should NOT have been called by the stale callback
    assert.strictEqual(calls.drawFrame.length, drawCountAfterFirst, 'drawFrame not called by stale callback');
    // No new frame should have been scheduled after stale callback
    assert.strictEqual(calls.requestFrame.length, 2, 'no new frame scheduled after stale callback');
  });
});

describe('rain-controller: stale callback fenced after restart', () => {
  it('start, fire callback (schedules successor), stop, start again, invoke old successor; drawFrame NOT called', () => {
    const { deps, calls } = makeSpies();
    const ctrl = createRainController(deps);
    // First start
    ctrl.start();
    // Fire the pending frame callback — schedules a successor
    const firstCallback = calls.requestFrame[0][0];
    firstCallback();
    assert.strictEqual(calls.requestFrame.length, 2, 'successor scheduled');
    const staleCallback = calls.requestFrame[1][0];
    // Stop — invalidates generation 1
    ctrl.stop();
    // Start again — new generation 3, schedules new first frame
    ctrl.start();
    // After second start: 3 requestFrame calls (1 initial + 1 successor + 1 new first frame)
    assert.strictEqual(calls.requestFrame.length, 3, 'second start scheduled new first frame');
    // Invoke the old successor callback from generation 1
    staleCallback();
    // drawFrame should NOT have been called — generation fence
    assert.strictEqual(calls.drawFrame.length, 1, 'drawFrame not called by stale successor after restart');
    // No new frame should have been scheduled by stale callback
    assert.strictEqual(calls.requestFrame.length, 3, 'no new frame from stale successor after restart');
  });
});

describe('rain-controller: getState.pendingFrameId transfers to successor', () => {
  it('after frame callback fires, getState.pendingFrameId equals the successor token', () => {
    const { deps, calls } = makeSpies();
    const ctrl = createRainController(deps);
    ctrl.start();
    // Before callback: pendingFrameId is the first token
    const stateBefore = ctrl.getState();
    const firstToken = stateBefore.pendingFrameId;
    assert.strictEqual(firstToken, 'frame-1', 'pendingFrameId is first frame token');
    // Fire the callback
    const frameCallback = calls.requestFrame[0][0];
    frameCallback();
    // After callback: pendingFrameId should be the successor token
    const stateAfter = ctrl.getState();
    assert.strictEqual(stateAfter.pendingFrameId, 'frame-2', 'pendingFrameId transferred to successor');
    assert.notStrictEqual(stateAfter.pendingFrameId, firstToken, 'pendingFrameId changed from first to successor');
  });
});

describe('rain-controller: resize delegation only while active', () => {
  it('resize() while IDLE is no-op; start then resize delegates once; stop then resize is no-op', () => {
    const { deps, calls } = makeSpies();
    const ctrl = createRainController(deps);
    // While IDLE
    ctrl.resize();
    assert.strictEqual(calls.resizeLayer.length, 0, 'resizeLayer not called while IDLE');
    // Start
    ctrl.start();
    const ownedLayer = ctrl.getState().layer;
    // Resize while active
    ctrl.resize();
    assert.strictEqual(calls.resizeLayer.length, 1, 'resizeLayer called once after start');
    assert.strictEqual(calls.resizeLayer[0][0], ownedLayer, 'resizeLayer received exact owned layer');
    // Stop
    ctrl.stop();
    // Resize while IDLE again
    ctrl.resize();
    assert.strictEqual(calls.resizeLayer.length, 1, 'resizeLayer not called after stop');
  });
});

describe('rain-controller: three repeated start-stop cycles leak no handles', () => {
  it('cycle start/stop three times; createLayer 3/removeLayer 3, addResizeListener 3/removeResizeListener 3, requestFrame 3/cancelFrame 3, final state IDLE generation=6', () => {
    const { deps, calls } = makeSpies();
    const ctrl = createRainController(deps);
    for (let i = 0; i < 3; i++) {
      ctrl.start();
      ctrl.stop();
    }
    assert.strictEqual(calls.createLayer.length, 3, 'createLayer called 3 times');
    assert.strictEqual(calls.removeLayer.length, 3, 'removeLayer called 3 times');
    assert.strictEqual(calls.addResizeListener.length, 3, 'addResizeListener called 3 times');
    assert.strictEqual(calls.removeResizeListener.length, 3, 'removeResizeListener called 3 times');
    assert.strictEqual(calls.requestFrame.length, 3, 'requestFrame called 3 times');
    assert.strictEqual(calls.cancelFrame.length, 3, 'cancelFrame called 3 times');
    const state = ctrl.getState();
    assert.strictEqual(state.state, 'IDLE');
    assert.strictEqual(state.generation, 6);
  });
});
