export function computePreviewFrameLayout({
  canvasWidth,
  canvasHeight,
  shape,
  cellSize,
  outerPadding = 8,
  framePadding = 6,
  labelHeight = 16,
}) {
  const dimensions = [canvasWidth, canvasHeight, cellSize, outerPadding, framePadding, labelHeight];
  if (!dimensions.every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error('preview frame dimensions must be finite positive numbers');
  }
  if (
    !Array.isArray(shape)
    || shape.length === 0
    || !shape.every((row) => Array.isArray(row) && row.length > 0)
  ) {
    throw new Error('shape must contain non-empty rows');
  }

  const columns = Math.max(...shape.map((row) => row.length));
  const rows = shape.length;
  const pieceWidth = columns * cellSize;
  const pieceHeight = rows * cellSize;
  const frameWidth = pieceWidth + 2 * framePadding;
  const frameHeight = labelHeight + pieceHeight + 3 * framePadding;
  const frameX = canvasWidth - outerPadding - frameWidth;
  const frameY = outerPadding;
  const pieceX = frameX + framePadding;
  const pieceY = frameY + labelHeight + framePadding;
  const labelX = frameX + framePadding;
  const labelY = frameY + 2 * framePadding;

  if (
    frameX < 0
    || frameY < 0
    || frameX + frameWidth > canvasWidth
    || frameY + frameHeight > canvasHeight
  ) {
    throw new Error('preview frame does not fit inside the canvas');
  }

  return {
    frameX,
    frameY,
    frameWidth,
    frameHeight,
    pieceX,
    pieceY,
    pieceWidth,
    pieceHeight,
    labelX,
    labelY,
  };
}

export function drawPreviewFrame(context, layout, { borderColor, labelColor }) {
  context.save();
  context.strokeStyle = borderColor;
  context.fillStyle = labelColor;
  context.lineWidth = 1;
  context.font = '12px sans-serif';
  context.textBaseline = 'alphabetic';
  context.strokeRect(
    layout.frameX + 0.5,
    layout.frameY + 0.5,
    layout.frameWidth - 1,
    layout.frameHeight - 1,
  );
  context.fillText('Next', layout.labelX, layout.labelY);
  context.restore();
}
