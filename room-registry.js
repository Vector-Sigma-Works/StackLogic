import { randomUUID, randomBytes } from "node:crypto";
import { generateRoomCode, normalizePlayerName, ROOM_CODE_ALPHABET } from "./room-code.js";

function createRoomRegistry({
  generateCode = generateRoomCode,
  createPlayerId = randomUUID,
  maxCodeAttempts: attemptLimit = 32,
  createMatchId = () => randomUUID(),
  createMatchSeed = () => randomBytes(4).readUInt32BE(0),
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
    for (const ch of code) {
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
          seq: 1,
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
      const trimmed = code.trim().toUpperCase();
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

    joinRoom({ code, name }) {
      // Normalize and validate room code
      if (code === null || code === undefined || typeof code !== "string") {
        const err = new Error("invalid_room_code");
        err.code = "invalid_room_code";
        throw err;
      }
      const trimmedCode = code.trim().toUpperCase();
      if (!isValidRoomCode(trimmedCode)) {
        const err = new Error("invalid_room_code");
        err.code = "invalid_room_code";
        throw err;
      }

      // Look up room by normalized (lowercase) key
      const lowerKey = trimmedCode.toLowerCase();
      let targetRoom = null;
      for (const [key, room] of rooms) {
        if (key.toLowerCase() === lowerKey) {
          targetRoom = room;
          break;
        }
      }
      if (!targetRoom) {
        const err = new Error("room_not_found");
        err.code = "room_not_found";
        throw err;
      }

      // Normalize name
      const normalizedName = normalizePlayerName(name);

      // Check for duplicate normalized names (case-insensitive) in the room
      const lowerNormalizedName = normalizedName.toLowerCase();
      for (const player of targetRoom.players) {
        if (player.name.toLowerCase() === lowerNormalizedName) {
          const err = new Error("name_taken");
          err.code = "name_taken";
          throw err;
        }
      }

      // Enforce two-player cap before ID allocation
      if (targetRoom.players.length >= 2) {
        const err = new Error("room_full");
        err.code = "room_full";
        throw err;
      }

      // Allocate player ID
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
      // Ensure unique within room
      for (const player of targetRoom.players) {
        if (player.id === playerId) {
          const err = new Error("invalid_player_id");
          err.code = "invalid_player_id";
          throw err;
        }
      }

      // Append ready:false player and increment seq
      targetRoom.seq += 1;
      targetRoom.players.push({ id: playerId, name: normalizedName, ready: false });

      return {
        playerId,
        room: deepClone(targetRoom),
      };
    },

    setPlayerReady({ code, playerId, ready, expectedSeq }) {
      // 1. Normalize + validate room code
      if (code === null || code === undefined || typeof code !== "string") {
        const err = new Error("invalid_room_code");
        err.code = "invalid_room_code";
        throw err;
      }
      const trimmedCode = code.trim().toUpperCase();
      if (!isValidRoomCode(trimmedCode)) {
        const err = new Error("invalid_room_code");
        err.code = "invalid_room_code";
        throw err;
      }

      // 2. Look up room
      const lowerKey = trimmedCode.toLowerCase();
      let targetRoom = null;
      for (const [key, room] of rooms) {
        if (key.toLowerCase() === lowerKey) {
          targetRoom = room;
          break;
        }
      }
      if (!targetRoom) {
        const err = new Error("room_not_found");
        err.code = "room_not_found";
        throw err;
      }

      // 3. Validate ready is a boolean
      if (typeof ready !== "boolean") {
        const err = new Error("invalid_ready");
        err.code = "invalid_ready";
        throw err;
      }

      // 4. Validate expectedSeq is a safe integer >= 1
      if (
        typeof expectedSeq !== "number" ||
        !Number.isInteger(expectedSeq) ||
        expectedSeq < 1 ||
        expectedSeq > Number.MAX_SAFE_INTEGER
      ) {
        const err = new Error("invalid_sequence");
        err.code = "invalid_sequence";
        throw err;
      }

      // 5. Compare expectedSeq to room.seq — stale_state if mismatch
      if (expectedSeq !== targetRoom.seq) {
        const err = new Error("stale_state");
        err.code = "stale_state";
        err.currentSeq = targetRoom.seq;
        throw err;
      }

      // 6. Validate playerId: must be a non-empty trimmed string
      if (typeof playerId !== "string" || !playerId.trim()) {
        const err = new Error("invalid_player_id");
        err.code = "invalid_player_id";
        throw err;
      }

      // 7. Find player in room — player_not_found if absent
      let targetPlayer = null;
      for (const player of targetRoom.players) {
        if (player.id === playerId) {
          targetPlayer = player;
          break;
        }
      }
      if (!targetPlayer) {
        const err = new Error("player_not_found");
        err.code = "player_not_found";
        throw err;
      }

      // 8. If match already started, reject readiness changes before any mutation or idempotent check
      if (Object.hasOwn(targetRoom, "match")) {
        const err = new Error("match_started");
        err.code = "match_started";
        throw err;
      }

      // 9. Idempotent no-op: same ready value → return snapshot without seq increment
      if (targetPlayer.ready === ready) {
        return deepClone(targetRoom);
      }

      // 10. If this transition would make both players ready, validate match authority
      //     against the still-unmodified room before any mutation.
      const wouldMakeBothReady =
        ready === true &&
        targetRoom.players.length === 2 &&
        !targetPlayer.ready &&
        targetRoom.players.some(
          (p) => p.id !== targetPlayer.id && p.ready === true,
        );

      let preparedMatch = null;
      if (wouldMakeBothReady) {
        let matchId;
        try {
          matchId = createMatchId();
        } catch (e) {
          const err = new Error("invalid_match_id");
          err.code = "invalid_match_id";
          throw err;
        }
        if (
          typeof matchId !== "string" ||
          !matchId.trim() ||
          matchId.length < 1 ||
          matchId.length > 64 ||
          !/^[A-Za-z0-9_-]+$/.test(matchId)
        ) {
          const err = new Error("invalid_match_id");
          err.code = "invalid_match_id";
          throw err;
        }

        let matchSeed;
        try {
          matchSeed = createMatchSeed();
        } catch (e) {
          const err = new Error("invalid_match_seed");
          err.code = "invalid_match_seed";
          throw err;
        }
        if (
          typeof matchSeed !== "number" ||
          !Number.isInteger(matchSeed) ||
          matchSeed < 0 ||
          matchSeed > 0xffffffff
        ) {
          const err = new Error("invalid_match_seed");
          err.code = "invalid_match_seed";
          throw err;
        }

        preparedMatch = { id: matchId, seed: matchSeed, startedSeq: targetRoom.seq + 1 };
      }

      // 11. Change ready, increment seq once
      targetPlayer.ready = ready;
      targetRoom.seq += 1;

      // 12. Attach prepared match if both players are now ready
      if (preparedMatch) {
        targetRoom.match = preparedMatch;
      }

      return deepClone(targetRoom);
    },
  };
}

export { createRoomRegistry };
