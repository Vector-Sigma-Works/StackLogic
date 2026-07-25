// Theme brick renderer for StackLogic
// Data-driven renderer API: drawBrick, getRenderer, getActiveRenderer
// Attaches to globalThis so it works in both browser and Node test context.

(function (root) {
  'use strict';

  var standardPieceColors = ['#67e8f9', '#fde047', '#c084fc', '#86efac', '#fda4af', '#93c5fd', '#fdba74'];
  var matrixShades = ['#006b2b', '#008f39', '#00a844', '#00bd4d', '#00d657', '#16e968', '#3df27f'];
  var darkShades = ['#101010', '#1c1c1c', '#282828', '#343434', '#424242', '#525252', '#646464'];

  // ---- Renderer descriptors ----
  // Each descriptor defines the visual style for one theme.
  var renderers = {
    Default: {
      themeId: 'Default',
      shape: 'rect',
      corners: 0,
      stroke: true,
      strokeStyle: 'rgba(0,0,0,0.25)',
      strokeOffset: 0.5,
      glyphs: null,
      cornerRadius: 0,
      highlight: null,
      gradient: false,
      fillStyle: null,
    },
    Matrix: {
      themeId: 'Matrix',
      shape: 'rect',
      corners: 0,
      stroke: true,
      strokeStyle: 'rgba(0,255,65,0.4)',
      strokeOffset: 0.5,
      glyphs: null,
      cornerRadius: 0,
      highlight: null,
      gradient: false,
      fillStyle: null,
    },
    CandyPop: {
      themeId: 'CandyPop',
      shape: 'rounded',
      corners: 4,
      stroke: true,
      strokeStyle: 'rgba(0,0,0,0.15)',
      strokeOffset: 0.5,
      glyphs: null,
      cornerRadius: 6,
      highlight: {
        type: 'glossy',
        xRatio: 0.15,
        yRatio: 0.1,
        widthRatio: 0.7,
        heightRatio: 0.35,
        color: 'rgba(255,255,255,0.45)',
      },
      gradient: true,
      fillStyle: null,
    },
    Dark: {
      themeId: 'Dark',
      shape: 'rect',
      corners: 0,
      stroke: true,
      strokeStyle: 'rgba(255,255,255,0.15)',
      strokeOffset: 0.5,
      glyphs: null,
      cornerRadius: 0,
      highlight: null,
      gradient: false,
      fillStyle: null,
    },
  };

  // ---- drawBrick(ctx, x, y, color, themeId, cellSize) ----
  function drawBrick(ctx, x, y, color, themeId, cellSize) {
    var r = getRenderer(themeId);
    var px = x * cellSize;
    var py = y * cellSize;
    var size = cellSize;

    // Save context state for themes that modify it
    ctx.save();

    if (r.themeId === 'CandyPop') {
      drawCandyPop(ctx, px, py, size, color, r);
    } else if (r.themeId === 'Matrix') {
      drawMatrix(ctx, px, py, size, color, r);
    } else if (r.themeId === 'Dark') {
      drawDark(ctx, px, py, size, color, r);
    } else {
      // Default
      drawDefault(ctx, px, py, size, color, r);
    }

    ctx.restore();
  }

  function drawDefault(ctx, px, py, size, color, r) {
    ctx.fillStyle = color;
    ctx.fillRect(px, py, size, size);
    if (r.stroke) {
      ctx.strokeStyle = r.strokeStyle;
      ctx.strokeRect(px + r.strokeOffset, py + r.strokeOffset, size - r.strokeOffset * 2, size - r.strokeOffset * 2);
    }
  }

  function drawMatrix(ctx, px, py, size, color, r) {
    ctx.fillStyle = shadeForColor(color, matrixShades);
    ctx.fillRect(px, py, size, size);

    if (r.stroke) {
      ctx.strokeStyle = r.strokeStyle;
      ctx.lineWidth = 1;
      ctx.strokeRect(px + r.strokeOffset, py + r.strokeOffset, size - r.strokeOffset * 2, size - r.strokeOffset * 2);
    }
  }

  function drawCandyPop(ctx, px, py, size, color, r) {
    var radius = r.cornerRadius;
    var half = size / 2;

    // Rounded rect fill with gradient
    ctx.beginPath();
    ctx.moveTo(px + radius, py);
    ctx.lineTo(px + size - radius, py);
    ctx.quadraticCurveTo(px + size, py, px + size, py + radius);
    ctx.lineTo(px + size, py + size - radius);
    ctx.quadraticCurveTo(px + size, py + size, px + size - radius, py + size);
    ctx.lineTo(px + radius, py + size);
    ctx.quadraticCurveTo(px, py + size, px, py + size - radius);
    ctx.lineTo(px, py + radius);
    ctx.quadraticCurveTo(px, py, px + radius, py);
    ctx.closePath();

    if (r.gradient) {
      var grad = ctx.createLinearGradient(px, py, px, py + size);
      grad.addColorStop(0, lightenColor(color, 30));
      grad.addColorStop(1, color);
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = color;
    }
    ctx.fill();

    // Subtle stroke
    if (r.stroke) {
      ctx.strokeStyle = r.strokeStyle;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Glossy highlight
    if (r.highlight) var h = r.highlight;
    if (h) {
      var hx = px + size * h.xRatio;
      var hy = py + size * h.yRatio;
      var hw = size * h.widthRatio;
      var hh = size * h.heightRatio;
      ctx.fillStyle = h.color;
      ctx.beginPath();
      ctx.ellipse(hx + hw / 2, hy + hh / 2, hw / 2, hh / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawDark(ctx, px, py, size, color, r) {
    ctx.fillStyle = shadeForColor(color, darkShades);
    ctx.fillRect(px, py, size, size);

    if (r.stroke) {
      ctx.strokeStyle = r.strokeStyle;
      ctx.lineWidth = 1;
      ctx.strokeRect(px + r.strokeOffset, py + r.strokeOffset, size - r.strokeOffset * 2, size - r.strokeOffset * 2);
    }
  }

  function shadeForColor(color, palette) {
    var normalized = String(color || '').toLowerCase();
    var index = standardPieceColors.indexOf(normalized);
    if (index < 0) {
      index = 0;
      for (var i = 0; i < normalized.length; i++) {
        index = (index * 31 + normalized.charCodeAt(i)) >>> 0;
      }
    }
    return palette[index % palette.length];
  }

  // ---- Color utility ----
  function lightenColor(hex, percent) {
    var num = parseInt(hex.replace('#', ''), 16);
    var r = Math.min(255, (num >> 16) + percent);
    var g = Math.min(255, ((num >> 8) & 0x00ff) + percent);
    var b = Math.min(255, (num & 0x0000ff) + percent);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  // ---- drawBrickAt(ctx, px, py, color, themeId, cellSize) ----
  // Pixel-coordinate entry point: px/py are already in canvas pixels.
  // Used for the next-piece preview where coordinates are computed in pixels.
  function drawBrickAt(ctx, px, py, color, themeId, cellSize) {
    var r = getRenderer(themeId);

    ctx.save();

    if (r.themeId === 'CandyPop') {
      drawCandyPop(ctx, px, py, cellSize, color, r);
    } else if (r.themeId === 'Matrix') {
      drawMatrix(ctx, px, py, cellSize, color, r);
    } else if (r.themeId === 'Dark') {
      drawDark(ctx, px, py, cellSize, color, r);
    } else {
      drawDefault(ctx, px, py, cellSize, color, r);
    }

    ctx.restore();
  }

  // ---- getRenderer(themeId) ----
  function getRenderer(themeId) {
    if (renderers[themeId]) {
      return renderers[themeId];
    }
    // Fallback to Default for unknown themes
    return renderers.Default;
  }

  // ---- getActiveRenderer() ----
  function getActiveRenderer() {
    if (root.ThemeModule && typeof root.ThemeModule.getCurrentTheme === 'function') {
      return getRenderer(root.ThemeModule.getCurrentTheme());
    }
    return renderers.Default;
  }

  // ---- Exports ----
  root.drawBrick = drawBrick;
  root.drawBrickAt = drawBrickAt;
  root.getRenderer = getRenderer;
  root.getActiveRenderer = getActiveRenderer;
  root.THEME_KEYS = ['Default', 'Matrix', 'CandyPop', 'Dark'];

})(typeof window !== 'undefined' ? window : globalThis);
