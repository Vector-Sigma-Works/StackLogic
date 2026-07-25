// Browser-only dependency wiring for the accepted Matrix rain adapter.
// Importing this module has no DOM, listener, or animation side effects.

import { createRainBrowserAdapter } from './theme-rain-adapter.js?v=0.2.0-beta.1';

export function createThemeRainBootstrap(root) {
  const document = root.document;
  let reducedMotionQuery = null;

  function getReducedMotionQuery() {
    if (!reducedMotionQuery) {
      reducedMotionQuery = root.matchMedia('(prefers-reduced-motion: reduce)');
    }
    return reducedMotionQuery;
  }

  const adapter = createRainBrowserAdapter({
    createCanvasLayer() {
      const canvas = document.createElement('canvas');
      canvas.className = 'matrix-rain-layer';
      canvas.setAttribute('aria-hidden', 'true');
      const context = canvas.getContext('2d');
      document.body.appendChild(canvas);
      return { canvas, context };
    },

    removeCanvasLayer(layer) {
      const canvas = layer && layer.canvas;
      if (canvas && canvas.parentNode === document.body) {
        document.body.removeChild(canvas);
      }
    },

    getViewportCssSize() {
      return {
        width: root.innerWidth,
        height: root.innerHeight,
      };
    },

    getDevicePixelRatio() {
      const dpr = root.devicePixelRatio;
      return Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
    },

    requestFrame(callback) {
      return root.requestAnimationFrame(callback);
    },

    cancelFrame(frameId) {
      root.cancelAnimationFrame(frameId);
    },

    addResizeListener(handler) {
      root.addEventListener('resize', handler);
      return handler;
    },

    removeResizeListener(handler) {
      root.removeEventListener('resize', handler);
    },

    reducedMotionMatches() {
      return getReducedMotionQuery().matches;
    },

    random() {
      return root.Math.random();
    },
  });

  let started = false;

  function handleReducedMotionChange() {
    if (!started) return;
    const themeModule = root.ThemeModule;
    const currentTheme = themeModule && typeof themeModule.getCurrentTheme === 'function'
      ? themeModule.getCurrentTheme()
      : null;
    if (typeof currentTheme === 'string') {
      adapter.handleTheme(currentTheme);
    }
  }

  function addReducedMotionListener() {
    const query = getReducedMotionQuery();
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', handleReducedMotionChange);
    } else if (typeof query.addListener === 'function') {
      query.addListener(handleReducedMotionChange);
    }
  }

  function removeReducedMotionListener() {
    if (!reducedMotionQuery) return;
    if (typeof reducedMotionQuery.removeEventListener === 'function') {
      reducedMotionQuery.removeEventListener('change', handleReducedMotionChange);
    } else if (typeof reducedMotionQuery.removeListener === 'function') {
      reducedMotionQuery.removeListener(handleReducedMotionChange);
    }
  }

  function handleThemeChange(event) {
    if (!started) return;
    const theme = event && event.detail && event.detail.theme;
    if (typeof theme === 'string') {
      adapter.handleTheme(theme);
    }
  }

  function start() {
    if (started) return;
    started = true;
    document.addEventListener('themechange', handleThemeChange);
    addReducedMotionListener();

    const themeModule = root.ThemeModule;
    const currentTheme = themeModule && typeof themeModule.getCurrentTheme === 'function'
      ? themeModule.getCurrentTheme()
      : null;
    if (typeof currentTheme === 'string') {
      adapter.handleTheme(currentTheme);
    }
  }

  function dispose() {
    if (!started) return;
    started = false;
    document.removeEventListener('themechange', handleThemeChange);
    removeReducedMotionListener();
    adapter.dispose();
  }

  function getState() {
    return adapter.getState();
  }

  return { start, dispose, getState };
}
