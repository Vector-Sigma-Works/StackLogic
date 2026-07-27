export const PIECE_TYPES = Object.freeze(['I', 'O', 'T', 'S', 'Z', 'J', 'L']);

export const MAX_SEQUENCE_OFFSET = 100_000;

function mulberry32(seed) {
  let s = seed | 0;
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleBag(rng) {
  const bag = [...PIECE_TYPES];
  for (let i = 6; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

export function createSeededPieceSource(seed, startIndex = 0) {
  if (
    typeof seed !== 'number' ||
    !Number.isInteger(seed) ||
    seed < 0 ||
    seed > 0xffffffff
  ) {
    throw new RangeError('Invalid seed');
  }
  if (
    typeof startIndex !== 'number' ||
    !Number.isInteger(startIndex) ||
    startIndex < 0 ||
    startIndex > MAX_SEQUENCE_OFFSET
  ) {
    throw new RangeError('Invalid startIndex');
  }

  const rng = mulberry32(seed);
  let bag = shuffleBag(rng);
  let pos = 0;
  let index = startIndex;

  // Consume pieces up to startIndex
  for (let i = 0; i < startIndex; i++) {
    if (pos >= bag.length) {
      bag = shuffleBag(rng);
      pos = 0;
    }
    pos++;
  }

  function next() {
    if (pos >= bag.length) {
      bag = shuffleBag(rng);
      pos = 0;
    }
    const piece = bag[pos];
    pos++;
    index++;
    return piece;
  }

  function getIndex() {
    return index;
  }

  return Object.freeze({ next, getIndex });
}
