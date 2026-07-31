import { randomUUID, randomBytes } from "node:crypto";
import { generateRoomCode, normalizePlayerName, ROOM_CODE_ALPHABET } from "./room-code.js";

function createRoomRegistry({
  generateCode = generateRoomCode,
  createPlayerId = randomUUID,
  maxCodeAttempts: attemptLimit = 32,
  maxRooms = 256,
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

  if (!Number.isInteger(maxRooms) || maxRooms < 1 || maxRooms > 10_000) {
    const err = new Error("invalid_configuration");
    err.code = "invalid_configuration";
    throw err;
  }

  const rooms = new Map();
  const issuedMatchIdsByRoom = new Map();

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
      if (rooms.size >= maxRooms) {
        const err = new Error("room_capacity_reached");
        err.code = "room_capacity_reached";
        throw err;
      }
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
        issuedMatchIdsByRoom.set(code, new Set());
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

    deleteRoom({ code }) {
      if (typeof code !== "string") {
        const err = new Error("invalid_room_code");
        err.code = "invalid_room_code";
        throw err;
      }
      const normalizedCode = code.trim().toUpperCase();
      validateRoomCode(normalizedCode);
      const removed = rooms.delete(normalizedCode);
      issuedMatchIdsByRoom.delete(normalizedCode);
      return removed;
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
        issuedMatchIdsByRoom.get(targetRoom.code).add(preparedMatch.id);
      }

      return deepClone(targetRoom);
    },

    updatePlayerState({ code, playerId, matchId, updateSeq, state }) {
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

      // 2. Look up authoritative room
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

      // 3. Validate match exists and started
      if (!Object.hasOwn(targetRoom, "match")) {
        const err = new Error("match_not_started");
        err.code = "match_not_started";
        throw err;
      }

      // 4. Validate matchId matches room's current match
      if (targetRoom.match.id !== matchId) {
        const err = new Error("match_mismatch");
        err.code = "match_mismatch";
        throw err;
      }
      if (Object.hasOwn(targetRoom.match, "result")) {
        const err = new Error("match_finished");
        err.code = "match_finished";
        throw err;
      }

      // 5. Validate playerId: must be a non-empty trimmed string
      if (typeof playerId !== "string" || !playerId.trim()) {
        const err = new Error("invalid_player_id");
        err.code = "invalid_player_id";
        throw err;
      }

      // 6. Find player in room
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

      // 7. Validate updateSeq: must be a safe integer in 1..1,000,000,000
      if (
        typeof updateSeq !== "number" ||
        !Number.isInteger(updateSeq) ||
        updateSeq < 1 ||
        updateSeq > 1_000_000_000
      ) {
        const err = new Error("invalid_update_sequence");
        err.code = "invalid_update_sequence";
        throw err;
      }

      // 8. Check per-player sequence: expected is currentUpdateSeq + 1 (or 1 if first)
      const expectedSeq = (targetPlayer.currentUpdateSeq ?? 0) + 1;
      if (updateSeq !== expectedSeq) {
        const err = new Error("stale_player_state");
        err.code = "stale_player_state";
        err.currentUpdateSeq = targetPlayer.currentUpdateSeq ?? 0;
        throw err;
      }

      // 9. Validate state shape: exactly board, score, lines, gameOver — no extra keys
      const expectedStateKeys = new Set(["board", "score", "lines", "gameOver"]);
      if (
        typeof state !== "object" ||
        state === null ||
        Array.isArray(state) ||
        Object.keys(state).length !== 4 ||
        [...Object.keys(state)].some((k) => !expectedStateKeys.has(k))
      ) {
        const err = new Error("invalid_player_state");
        err.code = "invalid_player_state";
        throw err;
      }

      // 10. Validate board: exactly 20 rows x 10 columns, each cell null or valid token
      const board = state.board;
      if (
        !Array.isArray(board) ||
        board.length !== 20
      ) {
        const err = new Error("invalid_player_state");
        err.code = "invalid_player_state";
        throw err;
      }
      const validTokens = new Set(["I", "O", "T", "S", "Z", "J", "L"]);
      for (let r = 0; r < 20; r++) {
        const row = board[r];
        if (!Array.isArray(row) || row.length !== 10) {
          const err = new Error("invalid_player_state");
          err.code = "invalid_player_state";
          throw err;
        }
        for (let c = 0; c < 10; c++) {
          const cell = row[c];
          if (cell !== null && !validTokens.has(cell)) {
            const err = new Error("invalid_player_state");
            err.code = "invalid_player_state";
            throw err;
          }
        }
      }

      // 11. Validate score: non-negative safe integer ≤ 1,000,000,000
      const score = state.score;
      if (
        typeof score !== "number" ||
        !Number.isInteger(score) ||
        score < 0 ||
        score > 1_000_000_000
      ) {
        const err = new Error("invalid_player_state");
        err.code = "invalid_player_state";
        throw err;
      }

      // 12. Validate lines: non-negative safe integer ≤ 1,000,000,000
      const lines = state.lines;
      if (
        typeof lines !== "number" ||
        !Number.isInteger(lines) ||
        lines < 0 ||
        lines > 1_000_000_000
      ) {
        const err = new Error("invalid_player_state");
        err.code = "invalid_player_state";
        throw err;
      }

      // 13. Validate gameOver: must be boolean
      if (typeof state.gameOver !== "boolean") {
        const err = new Error("invalid_player_state");
        err.code = "invalid_player_state";
        throw err;
      }

      // 14. All validation passed — resolve terminal authority before any mutation.
      const acceptedState = deepClone(state);
      acceptedState.updateSeq = updateSeq;
      let winner = null;
      if (acceptedState.gameOver) {
        winner = targetRoom.players.find((player) => player.id !== targetPlayer.id);
        if (!winner) {
          const err = new Error("invalid_match_state");
          err.code = "invalid_match_state";
          throw err;
        }
      }

      targetPlayer.gameState = acceptedState;
      targetPlayer.currentUpdateSeq = updateSeq;

      // A validated terminal report resolves this match exactly once. The registry,
      // not either browser, owns the winner/loser record.
      if (winner) {
        targetRoom.match.result = { winnerId: winner.id, loserId: targetPlayer.id };
        targetRoom.match.rematchAccepted = [];
      }

      // 15. Return complete detached room snapshot (room seq unchanged)
      return deepClone(targetRoom);
    },

    requestRematch({ code, playerId, matchId }) {
      const targetRoom = rooms.get(String(code || "").trim().toUpperCase());
      if (!targetRoom) {
        const err = new Error("room_not_found");
        err.code = "room_not_found";
        throw err;
      }
      if (!targetRoom.match || targetRoom.match.id !== matchId) {
        const err = new Error("match_mismatch");
        err.code = "match_mismatch";
        throw err;
      }
      if (!targetRoom.match.result) {
        const err = new Error("match_not_finished");
        err.code = "match_not_finished";
        throw err;
      }
      const player = targetRoom.players.find((item) => item.id === playerId);
      if (!player) {
        const err = new Error("player_not_found");
        err.code = "player_not_found";
        throw err;
      }
      const accepted = targetRoom.match.rematchAccepted || (targetRoom.match.rematchAccepted = []);
      if (accepted.includes(playerId)) return deepClone(targetRoom);
      const completesRematch = accepted.length + 1 >= targetRoom.players.length;
      if (!completesRematch) {
        accepted.push(playerId);
        return deepClone(targetRoom);
      }

      // Prepare and validate the next match before committing the final vote.
      let nextMatchId;
      let nextSeed;
      try {
        nextMatchId = createMatchId();
        nextSeed = createMatchSeed();
      } catch {
        const err = new Error("invalid_match_state");
        err.code = "invalid_match_state";
        throw err;
      }
      const issuedMatchIds = issuedMatchIdsByRoom.get(targetRoom.code);
      if (typeof nextMatchId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(nextMatchId) || !issuedMatchIds || issuedMatchIds.has(nextMatchId) || !Number.isInteger(nextSeed) || nextSeed < 0 || nextSeed > 0xffffffff) {
        const err = new Error("invalid_match_state");
        err.code = "invalid_match_state";
        throw err;
      }
      targetRoom.seq += 1;
      for (const item of targetRoom.players) {
        item.ready = true;
        delete item.gameState;
        delete item.currentUpdateSeq;
      }
      targetRoom.match = { id: nextMatchId, seed: nextSeed, startedSeq: targetRoom.seq };
      issuedMatchIds.add(nextMatchId);
      return deepClone(targetRoom);
    },
  };
}

export { createRoomRegistry };
