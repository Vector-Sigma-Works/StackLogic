// Matrix rain browser adapter — wraps the accepted lifecycle controller.
// Exports createRainBrowserAdapter(deps) and a frozen bounded RAIN_GLYPHS constant.

import { createRainController } from './theme-rain-controller.js?v=0.2.0-beta.1';

export const RAIN_GLYPHS = Object.freeze([
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
  'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
  'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
  'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
  'ア', 'イ', 'ウ', 'エ', 'オ',
  'カ', 'キ', 'ク', 'ケ', 'コ',
  'サ', 'シ', 'ス', 'セ', 'ソ',
  'タ', 'チ', 'ツ', 'テ', 'ト',
  'ナ', 'ニ', 'ヌ', 'ネ', 'ノ',
  'ハ', 'ヒ', 'フ', 'ヘ', 'ホ',
  'マ', 'ミ', 'ム', 'メ', 'モ',
  'ヤ', 'ユ', 'ヨ',
  'ラ', 'リ', 'ル', 'レ', 'ロ',
  'ワ', 'ヲ', 'ン',
]);

export function createRainBrowserAdapter(deps) {
  const {
    createCanvasLayer,
    removeCanvasLayer,
    getViewportCssSize,
    getDevicePixelRatio,
    requestFrame,
    cancelFrame,
    addResizeListener,
    removeResizeListener,
    random,
  } = deps;

  let controller = null;
  let layer = null;
  let drops = [];
  let cachedViewport = null;
  let cachedDpr = null;

  function configureBackingStore() {
    cachedViewport = getViewportCssSize();
    cachedDpr = getDevicePixelRatio();
    const { width, height } = cachedViewport;
    const dpr = cachedDpr;
    const backingWidth = Math.round(width * dpr);
    const backingHeight = Math.round(height * dpr);
    layer.canvas.width = backingWidth;
    layer.canvas.height = backingHeight;
    layer.canvas.style.width = width + 'px';
    layer.canvas.style.height = height + 'px';
    layer.context.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function createDrops() {
    const { width, height } = cachedViewport;
    const cellSize = 14;
    const maxColumns = Math.ceil(width / cellSize);
    drops = [];
    for (let i = 0; i < maxColumns; i++) {
      drops.push({
        column: i,
        x: Math.min((i + 0.5) * cellSize, Math.max(0, width - 1)),
        y: random() * (height - 100),
        speed: 1 + random() * 3,
        glyph: RAIN_GLYPHS[Math.floor(random() * RAIN_GLYPHS.length)],
      });
    }
  }

  function reconcileDrops() {
    const { width, height } = cachedViewport;
    const cellSize = 14;
    const maxColumns = Math.ceil(width / cellSize);

    const dropMap = new Map(drops.map(d => [d.column, d]));
    const next = [];

    for (let col = 0; col < maxColumns; col++) {
      const drop = dropMap.get(col);
      if (drop) {
        drop.x = Math.min((col + 0.5) * cellSize, Math.max(0, width - 1));
        next.push(drop);
      } else {
        next.push({
          column: col,
          x: Math.min((col + 0.5) * cellSize, Math.max(0, width - 1)),
          y: random() * (height - 100),
          speed: 1 + random() * 3,
          glyph: RAIN_GLYPHS[Math.floor(random() * RAIN_GLYPHS.length)],
        });
      }
    }

    drops = next;
  }

  function drawFrame() {
    const ctx = layer.context;
    const { width, height } = cachedViewport;

    // Semi-transparent black overlay to retain trails
    ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
    ctx.fillRect(0, 0, width, height);

    for (let i = 0; i < drops.length; i++) {
      const drop = drops[i];
      drop.y += drop.speed;
      if (drop.y > height) {
        drop.y = -20;
        drop.speed = 1 + random() * 3;
        drop.glyph = RAIN_GLYPHS[Math.floor(random() * RAIN_GLYPHS.length)];
      }
      ctx.fillStyle = '#0f0';
      ctx.font = '14px monospace';
      ctx.fillText(drop.glyph, drop.x, drop.y);
    }
  }

  function handleTheme(theme) {
    if (theme === 'Matrix') {
      // Evaluate reduced motion before starting (call deps directly, not captured ref)
      if (deps.reducedMotionMatches()) {
        // If already running, stop it and clear controller reference
        if (controller && controller.getState().state === 'RUNNING') {
          controller.stop();
          controller = null;
        }
        return; // reduced motion: stay IDLE
      }
      // Check if already running via controller state (no private active flag)
      if (controller && controller.getState().state === 'RUNNING') {
        return; // already running, idempotent
      }
      controller = createRainController({
        requestFrame,
        cancelFrame,
        addResizeListener,
        removeResizeListener,
        reducedMotionMatches: false, // already checked in adapter
        createLayer: () => {
          layer = createCanvasLayer();
          configureBackingStore();
          createDrops();
          return layer;
        },
        removeLayer: (l) => {
          removeCanvasLayer(l);
          layer = null;
        },
        resizeLayer: () => {
          configureBackingStore();
          reconcileDrops();
        },
        drawFrame,
      });

      controller.start();
    } else if (theme !== 'Matrix') {
      if (controller && controller.getState().state === 'RUNNING') {
        controller.stop();
        controller = null;
      }
    }
  }

  function dispose() {
    if (controller && controller.getState().state === 'RUNNING') {
      controller.stop();
      controller = null;
    }
  }

  function getState() {
    if (controller) return controller.getState();
    return {
      state: 'IDLE',
      generation: 0,
      layer: null,
      pendingFrameId: null,
      listenerRef: null,
    };
  }

  return { handleTheme, dispose, getState };
}
