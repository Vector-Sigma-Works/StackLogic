const ROOM_PROTOCOL_VERSION = 1;

function createRoomProtocol({ registry, send }) {
  if (typeof registry !== "object" || typeof send !== "function") {
    const err = new Error("invalid_configuration");
    err.code = "invalid_configuration";
    throw err;
  }

  const sessions = new Map(); // connectionId -> { playerId, room }

  function connect(connectionId) {
    if (typeof connectionId !== "string" || connectionId.trim().length === 0) {
      const err = new Error("invalid_connection_id");
      err.code = "invalid_connection_id";
      throw err;
    }
    if (sessions.has(connectionId)) {
      const err = new Error("connection_exists");
      err.code = "connection_exists";
      throw err;
    }
    sessions.set(connectionId, null);
    send(connectionId, { type: "connected", protocolVersion: ROOM_PROTOCOL_VERSION });
  }

  function disconnect(connectionId) {
    if (!sessions.has(connectionId)) {
      return;
    }
    sessions.delete(connectionId);
  }

  // Validate requestId: if present in message (not undefined), must be a bounded ASCII token
  function validateRequestId(requestId) {
    if (requestId === undefined) return true;
    if (typeof requestId !== "string") return false;
    if (requestId.length === 0 || requestId.length > 64) return false;
    for (let i = 0; i < requestId.length; i++) {
      const ch = requestId.charCodeAt(i);
      // Only allow alphanumeric, underscore, hyphen
      if (!((ch >= 48 && ch <= 57) || (ch >= 65 && ch <= 90) || (ch >= 97 && ch <= 122) || ch === 95 || ch === 45)) {
        return false;
      }
    }
    return true;
  }

  function sendError(connectionId, code, extra, requestId) {
    const msg = { type: "error", protocolVersion: ROOM_PROTOCOL_VERSION, code };
    if (extra) Object.assign(msg, extra);
    // requestId is only included when it's a valid string
    if (typeof requestId === "string" && requestId.length > 0) {
      msg.requestId = requestId;
    } else {
      msg.requestId = null;
    }
    send(connectionId, msg);
  }

  function receive(connectionId, rawMessage) {
    if (!sessions.has(connectionId)) {
      const err = new Error("connection_not_found");
      err.code = "connection_not_found";
      throw err;
    }

    let msg;
    try {
      msg = JSON.parse(rawMessage);
    } catch (e) {
      sendError(connectionId, "invalid_json", null, undefined);
      return;
    }

    if (typeof msg !== "object" || msg === null || Array.isArray(msg) || typeof msg.type !== "string") {
      sendError(connectionId, "invalid_message", null, undefined);
      return;
    }

    // Validate requestId early - if invalid, reject before processing the command
    const requestId = msg.requestId;
    if (!validateRequestId(requestId)) {
      sendError(connectionId, "invalid_request_id", null, undefined);
      return;
    }

    const session = sessions.get(connectionId);
    const selfPlayerId = session ? session.playerId : null;
    const selfRoomCode = session && session.room ? session.room.code : null;

    switch (msg.type) {
      case "create_room": {
        if (!msg.name || typeof msg.name !== "string") {
          sendError(connectionId, "invalid_request", null, requestId);
          return;
        }
        // Check already_in_room before creating
        if (session && session.room) {
          sendError(connectionId, "already_in_room", null, requestId);
          return;
        }
        const result = registry.createRoom({ name: msg.name });
        sessions.set(connectionId, { playerId: result.playerId, room: result.room });
        send(connectionId, {
          type: "room_state",
          protocolVersion: ROOM_PROTOCOL_VERSION,
          requestId: requestId,
          room: deepClone(result.room),
          self: { playerId: result.playerId },
          invitePath: `/?room=${result.room.code}`,
        });
        break;
      }

      case "join_room": {
        // Check already_in_room first
        if (session && session.room) {
          sendError(connectionId, "already_in_room", null, requestId);
          return;
        }
        if (!msg.code || typeof msg.code !== "string") {
          sendError(connectionId, "invalid_request", null, requestId);
          return;
        }
        if (!msg.name || typeof msg.name !== "string") {
          sendError(connectionId, "invalid_request", null, requestId);
          return;
        }
        const result = registry.joinRoom({ code: msg.code, name: msg.name });
        sessions.set(connectionId, { playerId: result.playerId, room: result.room });
        // Broadcast to all players in the room (including the joiner)
        broadcastRoomState(result.room, connectionId, requestId);
        break;
      }

      case "set_ready": {
        // Check not_in_room first
        if (!session || !session.room) {
          sendError(connectionId, "not_in_room", null, requestId);
          return;
        }
        if (typeof msg.ready !== "boolean") {
          sendError(connectionId, "invalid_request", null, requestId);
          return;
        }
        try {
          const result = registry.setPlayerReady({
            code: selfRoomCode,
            playerId: selfPlayerId,
            ready: msg.ready,
            expectedSeq: msg.expectedSeq,
          });
          sessions.set(connectionId, { playerId: selfPlayerId, room: result });
          broadcastRoomState(result, connectionId, requestId);
        } catch (e) {
          if (e.code === "stale_state") {
            sendError(connectionId, e.code, { currentSeq: e.currentSeq }, requestId);
          } else {
            sendError(connectionId, e.code, null, requestId);
          }
        }
        break;
      }

      default: {
        sendError(connectionId, "unsupported_message", null, requestId);
        break;
      }
    }
  }

  function broadcastRoomState(room, excludeConnectionId, requestForRequestId) {
    for (const [connId, sess] of sessions) {
      if (!sess || !sess.room || sess.room.code !== room.code) continue;
      if (connId === excludeConnectionId) {
        // Sender gets the message with requestId and self
        send(connId, {
          type: "room_state",
          protocolVersion: ROOM_PROTOCOL_VERSION,
          requestId: requestForRequestId,
          room: deepClone(room),
          self: { playerId: sess.playerId },
          invitePath: `/?room=${room.code}`,
        });
      } else {
        // Others get it without requestId but with self
        send(connId, {
          type: "room_state",
          protocolVersion: ROOM_PROTOCOL_VERSION,
          room: deepClone(room),
          self: { playerId: sess.playerId },
          invitePath: `/?room=${room.code}`,
        });
      }
    }
  }

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  return { connect, receive, disconnect };
}

export { createRoomProtocol, ROOM_PROTOCOL_VERSION };