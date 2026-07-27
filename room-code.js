import { randomBytes } from "node:crypto";

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateRoomCode(randomBytesFn = randomBytes) {
  if (typeof randomBytesFn !== "function") {
    const err = new Error("invalid entropy");
    err.code = "invalid_entropy";
    throw err;
  }
  const result = randomBytesFn(6);
  if (
    !result ||
    typeof result !== "object" ||
    !Number.isInteger(result.length) ||
    result.length < 6
  ) {
    const err = new Error("invalid entropy");
    err.code = "invalid_entropy";
    throw err;
  }
  // Verify it behaves like Uint8Array (has byteLength, Symbol.toStringTag, and is unsigned)
  if (!("byteLength" in result) || typeof result[Symbol.toStringTag] !== "string") {
    const err = new Error("invalid entropy");
    err.code = "invalid_entropy";
    throw err;
  }
  // Ensure it's Uint8Array-compatible (unsigned bytes, 0-255)
  if (!(result instanceof Uint8Array)) {
    const err = new Error("invalid entropy");
    err.code = "invalid_entropy";
    throw err;
  }

  const alphabet = ROOM_CODE_ALPHABET;
  const len = alphabet.length; // 32
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += alphabet[result[i] % len];
  }
  return code;
}

function normalizePlayerName(name) {
  if (typeof name !== "string") {
    const err = new Error("invalid name");
    err.code = "invalid_name";
    throw err;
  }

  // Trim outer ASCII whitespace: space, tab, CR, LF, FF, VT
  const trimmed = name.replace(/^[\t \r\n\f\v]+|[\t \r\n\f\v]+$/g, "");

  // Collapse internal runs of ASCII whitespace to single space
  const collapsed = trimmed.replace(/[\t \r\n\f\v]+/g, " ");

  // Check allowed characters: ASCII letters, digits, space, underscore, hyphen
  if (!/^[\p{L}\p{N} _-]+$/u.test(collapsed)) {
    const err = new Error("invalid name");
    err.code = "invalid_name";
    throw err;
  }

  // Require 1..16 characters after normalization
  if (collapsed.length < 1 || collapsed.length > 16) {
    const err = new Error("invalid name");
    err.code = "invalid_name";
    throw err;
  }

  return collapsed;
}

export { ROOM_CODE_ALPHABET, generateRoomCode, normalizePlayerName };
