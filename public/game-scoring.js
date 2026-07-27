export const LINE_CLEAR_POINTS = Object.freeze([0, 100, 300, 500, 800]);

export const DROP_POINTS_PER_CELL = Object.freeze({ soft: 1, hard: 2 });

function isSafeInteger(v) {
  return typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v);
}

function resultIsSafe(n) {
  return Number.isSafeInteger(n);
}

export function scoreLineClear(clearedLines, level) {
  if (!isSafeInteger(clearedLines) || !isSafeInteger(level)) {
    return 0;
  }
  if (clearedLines < 0 || clearedLines > 4) {
    return 0;
  }
  if (level < 1) {
    return 0;
  }
  const base = LINE_CLEAR_POINTS[clearedLines];
  const result = base * level;
  if (!resultIsSafe(result)) {
    return 0;
  }
  return result;
}

export function scoreDrop(kind, cells) {
  if (kind !== 'soft' && kind !== 'hard') {
    return 0;
  }
  if (!isSafeInteger(cells)) {
    return 0;
  }
  if (cells < 0) {
    return 0;
  }
  const multiplier = DROP_POINTS_PER_CELL[kind];
  const result = multiplier * cells;
  if (!resultIsSafe(result)) {
    return 0;
  }
  return result;
}
