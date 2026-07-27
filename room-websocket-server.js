import { WebSocketServer } from "ws";
import { createRoomProtocol } from "./room-protocol.js";

function createRoomWebSocketServer({ server, registry, allowedOrigin, maxPayloadBytes = 4096, createConnectionId }) {
  if (typeof server !== "object" || server === null || typeof server.on !== "function") {
    throw new Error("invalid_configuration");
  }
  if (typeof registry !== "object" || registry === null) {
    throw new Error("invalid_configuration");
  }
  if (typeof allowedOrigin !== "string") {
    throw new Error("invalid_configuration");
  }
  if (typeof maxPayloadBytes !== "number" || !Number.isInteger(maxPayloadBytes) || maxPayloadBytes < 1) {
    throw new Error("invalid_configuration");
  }
  if (typeof createConnectionId !== "function") {
    throw new Error("invalid_configuration");
  }

  // Create protocol EXACTLY ONCE per server creation, outside all callbacks
  const protocol = createRoomProtocol({
    registry,
    send(connectionId, message) {
      const ws = clients.get(connectionId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    },
  });

  // Track all owned sockets and their connection IDs
  const clients = new Map(); // connectionId -> WebSocket

  let closePromise = null;

  const upgradeListener = (request, socket, head) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const pathname = url.pathname;

    // Exact /ws path only
    if (pathname !== "/ws") {
      socket.end(
        "HTTP/1.1 404 Not Found\r\nContent-Length: 9\r\nConnection: close\r\n\r\nNot found"
      );
      return;
    }

    // Origin validation
    const origin = request.headers.origin;
    if (origin !== allowedOrigin) {
      socket.end(
        "HTTP/1.1 403 Forbidden\r\nContent-Length: 9\r\nConnection: close\r\n\r\nForbidden"
      );
      return;
    }

    // Accept the upgrade — let WSS handle it
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  };

  const wss = new WebSocketServer({
    noServer: true,
    perMessageDeflate: false,
    maxPayload: maxPayloadBytes,
  });

  server.on("upgrade", upgradeListener);

  wss.on("connection", (ws) => {
    // Generate unique connection ID
    let connectionId;
    try {
      connectionId = createConnectionId();
    } catch (e) {
      ws.close(1011, "internal_error");
      return;
    }

    if (typeof connectionId !== "string" || connectionId.trim().length === 0) {
      ws.close(1011, "internal_error");
      return;
    }

    if (clients.has(connectionId)) {
      ws.close(1011, "internal_error");
      return;
    }

    clients.set(connectionId, ws);

    // Register with protocol
    try {
      protocol.connect(connectionId);
    } catch (e) {
      clients.delete(connectionId);
      ws.close(1011, "internal_error");
      return;
    }

    // Handle text messages -> protocol.receive
    ws.on("message", (data, isBinary) => {
      if (isBinary) {
        ws.close(1003, "unsupported_data");
        return;
      }
      try {
        protocol.receive(connectionId, data.toString("utf8"));
      } catch (e) {
        // Protocol may throw on invalid messages; handle gracefully
      }
    });

    // Handle binary close (1009 = message too big from ws maxPayload)
    ws.on("close", (code) => {
      // Idempotent cleanup: remove socket and disconnect from protocol
      if (clients.has(connectionId)) {
        clients.delete(connectionId);
        protocol.disconnect(connectionId);
      }
    });

    ws.on("error", () => {
      if (clients.has(connectionId)) {
        clients.delete(connectionId);
        protocol.disconnect(connectionId);
      }
    });
  });

  // Return async idempotent close
  return {
    async close() {
      if (closePromise) {
        return closePromise;
      }

      closePromise = (async () => {
        // Remove only our owned upgrade listener
        server.removeListener("upgrade", upgradeListener);

        // Terminate all client sockets
        for (const [connectionId, ws] of clients) {
          try {
            ws.terminate();
          } catch (e) {
            // ignore
          }
          protocol.disconnect(connectionId);
        }
        clients.clear();

        // Close only the WSS, never the HTTP server
        await new Promise((resolve, reject) => {
          wss.close((err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      })();

      return closePromise;
    },
  };
}

export { createRoomWebSocketServer };
