export const LINES_PER_LEVEL = 10;

export const DROP_INTERVALS_MS = Object.freeze([
  800, 720, 630, 550, 470, 400, 340, 290, 250, 220,
  195, 170, 150, 135, 120, 105, 95, 85, 80,
]);

function normalizeTotalLines(totalLines) {
  if (typeof totalLines !== 'number' || !Number.isFinite(totalLines) || totalLines < 0) {
    return 0;
  }
  return Math.floor(totalLines);
}

export function getProgression(totalLines) {
  const lines = normalizeTotalLines(totalLines);
  const level = Math.floor(lines / LINES_PER_LEVEL) + 1;
  const linesIntoLevel = lines % LINES_PER_LEVEL;
  const linesToNextLevel = LINES_PER_LEVEL - linesIntoLevel;

  // Index into DROP_INTERVALS_MS: level 1 -> index 0, level 2 -> index 1, etc.
  const intervalIndex = Math.min(level - 1, DROP_INTERVALS_MS.length - 1);
  const dropIntervalMs = DROP_INTERVALS_MS[intervalIndex];

  return {
    totalLines: lines,
    level,
    linesIntoLevel,
    linesToNextLevel,
    progressText: `${linesIntoLevel} / ${LINES_PER_LEVEL}`,
    dropIntervalMs,
  };
}

export function describeLevelChange(previousLevel, nextLevel) {
  if (nextLevel > previousLevel) {
    return `Level up! ${nextLevel}`;
  }
  return '';
}
