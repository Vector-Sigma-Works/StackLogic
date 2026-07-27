import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateRoomCode, normalizePlayerName, ROOM_CODE_ALPHABET } from "../room-code.js";

describe("ROOM_CODE_ALPHABET", () => {
  it("is a frozen constant with exact value", () => {
    assert.strictEqual(ROOM_CODE_ALPHABET, "ABCDEFGHJKLMNPQRSTUVWXYZ23456789");
  });

  it("has length 32", () => {
    assert.strictEqual(ROOM_CODE_ALPHABET.length, 32);
  });
});

describe("generateRoomCode", () => {
  const alphabet = ROOM_CODE_ALPHABET;
  const ALPHABET_LEN = alphabet.length; // 32

  function makeRandomBytes(bytes) {
    return (n) => new Uint8Array(bytes.slice(0, n));
  }

  it("uses default entropy and returns six chars from ROOM_CODE_ALPHABET", () => {
    const code = generateRoomCode();
    assert.strictEqual(code.length, 6);
    for (const ch of code) {
      assert.ok(ROOM_CODE_ALPHABET.includes(ch), `char '${ch}' not in alphabet`);
    }
  });

  it("returns exactly 6 characters from the alphabet", () => {
    const rb = makeRandomBytes([1, 2, 3, 4, 5, 6]);
    const code = generateRoomCode(rb);
    assert.strictEqual(code.length, 6);
    for (const ch of code) {
      assert.ok(alphabet.includes(ch), `char '${ch}' not in alphabet`);
    }
  });

  it("calls randomBytesFn exactly once with argument 6", () => {
    let callCount = 0;
    let lastArg = null;
    const rb = (n) => {
      callCount++;
      lastArg = n;
      return new Uint8Array(6);
    };
    generateRoomCode(rb);
    assert.strictEqual(callCount, 1);
    assert.strictEqual(lastArg, 6);
  });

  it("maps byte 0 -> alphabet[0] = 'A'", () => {
    const rb = makeRandomBytes([0, 0, 0, 0, 0, 0]);
    assert.strictEqual(generateRoomCode(rb), "AAAAAA");
  });

  it("maps byte 31 -> alphabet[31] = '9'", () => {
    const rb = makeRandomBytes([31, 31, 31, 31, 31, 31]);
    assert.strictEqual(generateRoomCode(rb), "999999");
  });

  it("maps byte 32 -> alphabet[0] = 'A' (mod wraps)", () => {
    const rb = makeRandomBytes([32, 32, 32, 32, 32, 32]);
    assert.strictEqual(generateRoomCode(rb), "AAAAAA");
  });

  it("maps byte 255 -> alphabet[31] = '9' (255 % 32 = 31)", () => {
    const rb = makeRandomBytes([255, 255, 255, 255, 255, 255]);
    assert.strictEqual(generateRoomCode(rb), "999999");
  });

  it("throws Error with code 'invalid_entropy' when result has fewer than 6 bytes", () => {
    const rb = () => new Uint8Array(5);
    assert.throws(() => generateRoomCode(rb), (err) => {
      assert.strictEqual(err.code, "invalid_entropy");
      return true;
    });
  });

  it("throws Error with code 'invalid_entropy' when result is not Uint8Array-like", () => {
    const rb = () => null;
    assert.throws(() => generateRoomCode(rb), (err) => {
      assert.strictEqual(err.code, "invalid_entropy");
      return true;
    });
  });

  it("never uses Math.random", () => {
    const origMathRandom = Math.random;
    let mathRandomCalled = false;
    Math.random = () => {
      mathRandomCalled = true;
      throw new Error("Math.random was called!");
    };
    try {
      generateRoomCode(makeRandomBytes([1, 2, 3, 4, 5, 6]));
      assert.strictEqual(mathRandomCalled, false);
    } finally {
      Math.random = origMathRandom;
    }
  });

  it("short entropy (too few bytes) throws invalid_entropy", () => {
    const rb = () => new Uint8Array([1, 2]);
    assert.throws(() => generateRoomCode(rb), (err) => {
      assert.strictEqual(err.code, "invalid_entropy");
      return true;
    });
  });

  it("wrong entropy type throws invalid_entropy", () => {
    const rb = () => new Int8Array(6);
    assert.throws(() => generateRoomCode(rb), (err) => {
      assert.strictEqual(err.code, "invalid_entropy");
      return true;
    });
  });
});

describe("normalizePlayerName", () => {
  it("returns trimmed string for simple name", () => {
    assert.strictEqual(normalizePlayerName("Alice"), "Alice");
  });

  it("strips outer ASCII whitespace (space, tab, CR, LF, FF, VT)", () => {
    assert.strictEqual(normalizePlayerName("  Alice  "), "Alice");
    assert.strictEqual(normalizePlayerName("\tAlice\t"), "Alice");
    assert.strictEqual(normalizePlayerName("\r\nAlice\r\n"), "Alice");
    assert.strictEqual(normalizePlayerName("\fAlice\f"), "Alice");
    assert.strictEqual(normalizePlayerName("\vAlice\v"), "Alice");
  });

  it("collapses internal whitespace runs to single space", () => {
    assert.strictEqual(normalizePlayerName("Alices  Bob"), "Alices Bob");
    assert.strictEqual(normalizePlayerName("Alices\t\tBob"), "Alices Bob");
    assert.strictEqual(normalizePlayerName("Alices\r\nBob"), "Alices Bob");
    assert.strictEqual(normalizePlayerName("Alices \t \r \n Bob"), "Alices Bob");
  });

  it("allows only ASCII letters, digits, space, underscore, hyphen", () => {
    const validPatterns = [
      "Alice123",
      "Alice_Bob",
      "Alice-Bob",
      "A b",
      "a",
      "Z9_-",
    ];
    for (const name of validPatterns) {
      assert.strictEqual(normalizePlayerName(name), name, `expected '${name}' to be valid`);
    }
  });

  it("throws Error with code 'invalid_name' for empty string after normalization", () => {
    assert.throws(() => normalizePlayerName(""), (err) => {
      assert.strictEqual(err.code, "invalid_name");
      return true;
    });
    assert.throws(() => normalizePlayerName("   "), (err) => {
      assert.strictEqual(err.code, "invalid_name");
      return true;
    });
  });

  it("throws Error with code 'invalid_name' for name longer than 16 chars", () => {
    const longName = "A".repeat(17);
    assert.throws(() => normalizePlayerName(longName), (err) => {
      assert.strictEqual(err.code, "invalid_name");
      return true;
    });
  });

  it("allows exactly 16 characters", () => {
    const name = "A".repeat(16);
    assert.strictEqual(normalizePlayerName(name), name);
  });

  it("throws Error for invalid characters (e.g. @, #, digits beyond allowed)", () => {
    const invalidNames = ["Alice@", "Bob#", "Charlie!", "Test%"];
    for (const name of invalidNames) {
      assert.throws(() => normalizePlayerName(name), (err) => {
        assert.strictEqual(err.code, "invalid_name");
        return true;
      }, `expected '${name}' to throw`);
    }
  });

  it("throws Error for non-string input", () => {
    const invalidInputs = [123, null, undefined, {}, [], true];
    for (const input of invalidInputs) {
      assert.throws(() => normalizePlayerName(input), (err) => {
        assert.strictEqual(err.code, "invalid_name");
        return true;
      }, `expected ${JSON.stringify(input)} to throw`);
    }
  });

  it("never substitutes 'Anon'", () => {
    // Should throw for empty input, never return "Anon"
    assert.throws(() => normalizePlayerName(""), (err) => {
      assert.strictEqual(err.code, "invalid_name");
      return true;
    });
  });

  it("proves replacing global Math.random does not affect these functions", () => {
    const origMathRandom = Math.random;
    let mathRandomCalled = false;
    Math.random = () => {
      mathRandomCalled = true;
      throw new Error("Math.random was called!");
    };
    try {
      generateRoomCode(() => new Uint8Array([1, 2, 3, 4, 5, 6]));
      normalizePlayerName("Alice");
      assert.strictEqual(mathRandomCalled, false);
    } finally {
      Math.random = origMathRandom;
    }
  });
});
