import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createThemeRainBootstrap } from '../public/theme-rain-bootstrap.js';

function createFakeRoot(options = {}) {
  let currentTheme = options.currentTheme ?? null;
  let reducedMotion = options.reducedMotion ?? false;
  const records = {
    appended: [],
    removed: [],
    documentAdds: [],
    documentRemoves: [],
    windowAdds: [],
    windowRemoves: [],
    requestedFrames: [],
    cancelledFrames: [],
    transforms: [],
    fills: [],
  };
  const documentListeners = new Map();
  const windowListeners = new Map();
  const frameCallbacks = new Map();
  let nextFrameId = 40;

  const context = {
    fillStyle: '',
    font: '',
    setTransform(...args) {
      records.transforms.push(args);
    },
    fillRect(...args) {
      records.fills.push(['rect', ...args]);
    },
    fillText(...args) {
      records.fills.push(['text', ...args]);
    },
  };

  const body = {
    appendChild(node) {
      node.parentNode = body;
      records.appended.push(node);
      return node;
    },
    removeChild(node) {
      assert.equal(node.parentNode, body);
      node.parentNode = null;
      records.removed.push(node);
      return node;
    },
  };

  const document = {
    body,
    createElement(tag) {
      assert.equal(tag, 'canvas');
      const attributes = new Map();
      return {
        nodeName: 'CANVAS',
        className: '',
        style: {},
        width: 0,
        height: 0,
        parentNode: null,
        setAttribute(name, value) {
          attributes.set(name, String(value));
        },
        getAttribute(name) {
          return attributes.get(name) ?? null;
        },
        getContext(kind) {
          assert.equal(kind, '2d');
          return context;
        },
      };
    },
    addEventListener(type, handler) {
      records.documentAdds.push([type, handler]);
      documentListeners.set(type, handler);
    },
    removeEventListener(type, handler) {
      records.documentRemoves.push([type, handler]);
      if (documentListeners.get(type) === handler) documentListeners.delete(type);
    },
  };

  const root = {
    document,
    innerWidth: options.width ?? 320,
    innerHeight: options.height ?? 240,
    devicePixelRatio: options.dpr ?? 2,
    ThemeModule: {
      getCurrentTheme() {
        return currentTheme;
      },
    },
    Math: { random: () => 0.5 },
    matchMedia(query) {
      assert.equal(query, '(prefers-reduced-motion: reduce)');
      return { matches: reducedMotion };
    },
    requestAnimationFrame(callback) {
      const id = ++nextFrameId;
      records.requestedFrames.push([id, callback]);
      frameCallbacks.set(id, callback);
      return id;
    },
    cancelAnimationFrame(id) {
      records.cancelledFrames.push(id);
      frameCallbacks.delete(id);
    },
    addEventListener(type, handler) {
      records.windowAdds.push([type, handler]);
      windowListeners.set(type, handler);
    },
    removeEventListener(type, handler) {
      records.windowRemoves.push([type, handler]);
      if (windowListeners.get(type) === handler) windowListeners.delete(type);
    },
  };

  return {
    root,
    context,
    records,
    documentListeners,
    windowListeners,
    frameCallbacks,
    setCurrentTheme(value) { currentTheme = value; },
    setReducedMotion(value) { reducedMotion = value; },
    dispatchTheme(detail) {
      const handler = documentListeners.get('themechange');
      assert.equal(typeof handler, 'function');
      handler(detail === undefined ? { type: 'themechange' } : { type: 'themechange', detail });
    },
  };
}

describe('Matrix rain browser bootstrap', () => {
  test('module/factory have zero browser side effects before start', () => {
    const fake = createFakeRoot();
    const bootstrap = createThemeRainBootstrap(fake.root);
    assert.deepEqual(Object.keys(bootstrap).sort(), ['dispose', 'getState', 'start']);
    assert.equal(fake.records.appended.length, 0);
    assert.equal(fake.records.documentAdds.length, 0);
    assert.equal(fake.records.windowAdds.length, 0);
    assert.equal(fake.records.requestedFrames.length, 0);
  });

  test('start is idempotent, installs one theme listener, and ignores malformed events', () => {
    const fake = createFakeRoot();
    const bootstrap = createThemeRainBootstrap(fake.root);
    bootstrap.start();
    bootstrap.start();
    assert.equal(fake.records.documentAdds.length, 1);
    assert.equal(fake.records.documentAdds[0][0], 'themechange');
    assert.equal(fake.records.appended.length, 0);
    fake.dispatchTheme(undefined);
    fake.dispatchTheme({ theme: 42 });
    assert.equal(fake.records.appended.length, 0);
    assert.equal(fake.records.requestedFrames.length, 0);
  });

  test('Matrix creates one exact accessible canvas, resize owner, and frame at CSS viewport/DPR size', () => {
    const fake = createFakeRoot({ width: 401, height: 277, dpr: 1.5 });
    const bootstrap = createThemeRainBootstrap(fake.root);
    bootstrap.start();
    fake.dispatchTheme({ theme: 'Matrix' });

    assert.equal(fake.records.appended.length, 1);
    const canvas = fake.records.appended[0];
    assert.equal(canvas.parentNode, fake.root.document.body);
    assert.equal(canvas.className, 'matrix-rain-layer');
    assert.equal(canvas.getAttribute('aria-hidden'), 'true');
    assert.equal(canvas.width, 602);
    assert.equal(canvas.height, 416);
    assert.equal(canvas.style.width, '401px');
    assert.equal(canvas.style.height, '277px');
    assert.deepEqual(fake.records.transforms, [[1.5, 0, 0, 1.5, 0, 0]]);
    assert.equal(fake.records.windowAdds.length, 1);
    assert.equal(fake.records.windowAdds[0][0], 'resize');
    assert.equal(fake.records.requestedFrames.length, 1);
    assert.equal(bootstrap.getState().state, 'RUNNING');

    fake.dispatchTheme({ theme: 'Matrix' });
    assert.equal(fake.records.appended.length, 1);
    assert.equal(fake.records.windowAdds.length, 1);
    assert.equal(fake.records.requestedFrames.length, 1);
  });

  test('non-Matrix removes the exact live canvas, resize handler, and pending frame; stale frame is inert', () => {
    const fake = createFakeRoot();
    const bootstrap = createThemeRainBootstrap(fake.root);
    bootstrap.start();
    fake.dispatchTheme({ theme: 'Matrix' });
    const canvas = fake.records.appended[0];
    const resizeHandler = fake.records.windowAdds[0][1];
    const [frameId, staleFrame] = fake.records.requestedFrames[0];

    fake.dispatchTheme({ theme: 'CandyPop' });
    assert.deepEqual(fake.records.removed, [canvas]);
    assert.deepEqual(fake.records.windowRemoves, [['resize', resizeHandler]]);
    assert.deepEqual(fake.records.cancelledFrames, [frameId]);
    assert.equal(bootstrap.getState().state, 'IDLE');

    const requestCount = fake.records.requestedFrames.length;
    const drawCount = fake.records.fills.length;
    staleFrame();
    assert.equal(fake.records.requestedFrames.length, requestCount);
    assert.equal(fake.records.fills.length, drawCount);
  });

  test('a current persisted Matrix theme is forwarded once during start', () => {
    const fake = createFakeRoot({ currentTheme: 'Matrix' });
    const bootstrap = createThemeRainBootstrap(fake.root);
    bootstrap.start();
    bootstrap.start();
    assert.equal(fake.records.appended.length, 1);
    assert.equal(fake.records.requestedFrames.length, 1);
  });

  test('reduced motion creates zero canvas, resize, or frame resources for Matrix', () => {
    const fake = createFakeRoot({ currentTheme: 'Matrix', reducedMotion: true });
    const bootstrap = createThemeRainBootstrap(fake.root);
    bootstrap.start();
    fake.dispatchTheme({ theme: 'Matrix' });
    assert.equal(fake.records.appended.length, 0);
    assert.equal(fake.records.windowAdds.length, 0);
    assert.equal(fake.records.requestedFrames.length, 0);
    assert.equal(bootstrap.getState().state, 'IDLE');
  });

  test('dispose is idempotent, removes exact ownership once, and captured stale theme events are inert', () => {
    const fake = createFakeRoot({ currentTheme: 'Matrix' });
    const bootstrap = createThemeRainBootstrap(fake.root);
    bootstrap.start();
    const staleThemeHandler = fake.records.documentAdds[0][1];
    const canvas = fake.records.appended[0];

    bootstrap.dispose();
    bootstrap.dispose();
    assert.equal(fake.records.documentRemoves.length, 1);
    assert.deepEqual(fake.records.documentRemoves[0], ['themechange', staleThemeHandler]);
    assert.deepEqual(fake.records.removed, [canvas]);
    assert.equal(bootstrap.getState().state, 'IDLE');

    staleThemeHandler({ detail: { theme: 'Matrix' } });
    assert.equal(fake.records.appended.length, 1);
    assert.equal(fake.records.requestedFrames.length, 1);
  });

  test('invalid or non-positive DPR falls back to one', () => {
    for (const dpr of [0, -2, Number.NaN, Number.POSITIVE_INFINITY]) {
      const fake = createFakeRoot({ dpr, currentTheme: 'Matrix', width: 111, height: 77 });
      const bootstrap = createThemeRainBootstrap(fake.root);
      bootstrap.start();
      const canvas = fake.records.appended[0];
      assert.equal(canvas.width, 111);
      assert.equal(canvas.height, 77);
      assert.deepEqual(fake.records.transforms, [[1, 0, 0, 1, 0, 0]]);
      bootstrap.dispose();
    }
  });
});
