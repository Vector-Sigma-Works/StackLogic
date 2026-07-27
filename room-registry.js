import { randomUUID } from "node:crypto";
import { generateRoomCode, normalizePlayerName, ROOM_CODE_ALPHABET } from "./room-code.js";

function createRoomRegistry({
  generateCode = generateRoomCode,
  createPlayerId = randomUUID,
  maxCodeAttempts: attemptLimit = 32,
} = {}) {
  void generateCode;
  void createPlayerId;
  void attemptLimit;
  void normalizePlayerName;
  void ROOM_CODE_ALPHABET;
  throw new Error("room registry not implemented");
}

export { createRoomRegistry };
