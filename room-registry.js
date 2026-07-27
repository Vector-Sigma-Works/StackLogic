import { randomUUID } from "node:crypto";
import { generateRoomCode, normalizePlayerName, ROOM_CODE_ALPHABET } from "./room-code.js";

function createRoomRegistry({
  generateCode = generateRoomCode,
  createPlayerId = randomUUID,
  maxCodeAttempts: attemptLimit = 32,
} = {}) {
  if (
    typeof attemptLimit !== "number" ||
    !Number.isInteger(attemptLimit) ||
    attemptLimit < 1 ||
    attemptLimit > 128
  ) {
    const err = new Error("invalid_configuration");
    err.code = "invalid_configuration";
    throw err;
  }

  const rooms = new Map();

  function isValidRoomCode(code) {
    if (typeof code !== "string" || code.length !== 6) return false;
    const upper = code.toUpperCase();
    for (const ch of upper) {
      if (!ROOM_CODE_ALPHABET.includes(ch)) return false;
    }
    return true;
  }

  function validateRoomCode(code) {
    if (!isValidRoomCode(code)) {
      const err = new Error("invalid_room_code");
      err.code = "invalid_room_code";
      throw err;
    }
  }

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  return {
    createRoom({ name }) {
      const normalizedName = normalizePlayerName(name);
      let lastError = null;
      for (let i = 0; i < attemptLimit; i++) {
        const code = generateCode();
        if (!isValidRoomCode(code)) {
          const err = new Error("invalid_room_code");
          err.code = "invalid_room_code";
          throw err;
        }
        if (rooms.has(code)) {
          continue;
        }
        let playerId;
        try {
          playerId = createPlayerId();
        } catch (e) {
          const err = new Error("invalid_player_id");
          err.code = "invalid_player_id";
          throw err;
        }
        if (typeof playerId !== "string" || !playerId.trim()) {
          const err = new Error("invalid_player_id");
          err.code = "invalid_player_id";
          throw err;
        }
        const room = {
          code,
          seq: rooms.size + 1,
          players: [{ id: playerId, name: normalizedName, ready: false }],
        };
        rooms.set(code, room);
        return {
          playerId,
          room: deepClone(room),
        };
      }
      if (lastError) {
        throw lastError;
      }
      const err = new Error("room_code_exhausted");
      err.code = "room_code_exhausted";
      throw err;
    },

    getRoom(code) {
      if (code === null || code === undefined || typeof code !== "string") {
        const err = new Error("invalid_room_code");
        err.code = "invalid_room_code";
        throw err;
      }
      const trimmed = code.trim();
      if (!isValidRoomCode(trimmed)) {
        const err = new Error("invalid_room_code");
        err.code = "invalid_room_code";
        throw err;
      }
      const lowerKey = trimmed.toLowerCase();
      for (const [key, room] of rooms) {
        if (key.toLowerCase() === lowerKey) {
          return deepClone(room);
        }
      }
      return null;
    },
  };
}

export { createRoomRegistry };
