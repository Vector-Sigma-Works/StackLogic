// DOM-free Matrix rain lifecycle controller.
// Exports createRainController(dependencies) returning {start, stop, resize, isActive, getState}.

export function createRainController(dependencies) {
  let generation = 0;
  let layer = null;
  let pendingFrameId = null;
  let listenerRef = null;
  let state = 'IDLE';

  const {
    requestFrame,
    cancelFrame,
    addResizeListener,
    removeResizeListener,
    reducedMotionMatches,
    createLayer,
    removeLayer,
    resizeLayer,
    drawFrame,
  } = dependencies;

  function start() {
    // Guard: if reduced motion, short-circuit before any dependency call
    if (reducedMotionMatches) {
      return;
    }

    // Idempotent: if already running with same generation, do nothing
    if (generation > 0 && state === 'RUNNING') {
      return;
    }

    // Increment generation (monotonic counter)
    generation++;

    // Create owned layer
    layer = createLayer();

    // Attach owned resize listener
    const handler = function () {
      resizeLayer(layer);
    };
    listenerRef = addResizeListener(handler);

    // Schedule first frame
    const activeGen = generation;
    const frameCallback = function () {
      // Generation fence: if generation changed (stop was called), no-op
      if (generation !== activeGen) {
        return;
      }
      // Draw the frame
      drawFrame();
      // Schedule exactly one successor only while still active
      pendingFrameId = requestFrame(frameCallback);
    };
    pendingFrameId = requestFrame(frameCallback);

    state = 'RUNNING';
  }

  function stop() {
    // Cancel the owned pending frame
    if (pendingFrameId !== null) {
      cancelFrame(pendingFrameId);
      pendingFrameId = null;
    }

    // Invalidate generation (fences stale callbacks)
    generation++;

    // Remove owned resize listener
    if (listenerRef !== null) {
      removeResizeListener(listenerRef);
      listenerRef = null;
    }

    // Remove owned layer
    if (layer !== null) {
      removeLayer(layer);
      layer = null;
    }

    state = 'IDLE';
  }

  function resize() {
    // Only delegate while active
    if (generation <= 0 || state !== 'RUNNING') {
      return;
    }
    resizeLayer(layer);
  }

  function isActive() {
    return generation > 0 && state === 'RUNNING';
  }

  function getState() {
    return {
      state: state,
      generation: generation,
      layer: layer,
      pendingFrameId: pendingFrameId,
      listenerRef: listenerRef,
    };
  }

  return { start, stop, resize, isActive, getState };
}
