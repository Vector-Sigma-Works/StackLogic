import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import net from "node:net";
import WebSocket from "ws";

const ORIGIN = "https://stacklogic-dev.game.lan";
const PAGES_ORIGIN = "https://alexgeslani.github.io";

async function reservePort() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", resolve);
  });
  const { port } = probe.address();
  await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  return port;
}

function waitForMessage(socket, timeoutMs = 1_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("websocket_message_timeout")), timeoutMs);
    socket.once("message", (data, isBinary) => {
      clearTimeout(timer);
      try {
        assert.equal(isBinary, false);
        resolve(JSON.parse(data.toString("utf8")));
      } catch (error) {
        reject(error);
      }
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function waitForHealth(port, child, timeoutMs = 3_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server_exited:${child.exitCode}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/healthz`);
      if (response.ok) return response.json();
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("server_health_timeout");
}

function waitForExit(child, timeoutMs = 2_000) {
  if (child.exitCode !== null) return Promise.resolve(child.exitCode);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("server_exit_timeout")), timeoutMs);
    child.once("exit", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

describe("StackLogic server WebSocket integration", () => {
  it("serves health and room traffic on configured host/port, then shuts down cleanly", async () => {
    const port = await reservePort();
    const child = spawn(process.execPath, ["server.js"], {
      cwd: new URL("..", import.meta.url),
      env: {
        ...process.env,
        HOST: "127.0.0.1",
        PORT: String(port),
        STACKLOGIC_ALLOWED_ORIGIN: `${ORIGIN},${PAGES_ORIGIN}`,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output = (output + chunk).slice(-8_192); });
    child.stderr.on("data", (chunk) => { output = (output + chunk).slice(-8_192); });
    let socket;
    let pagesSocket;

    try {
      assert.deepEqual(await waitForHealth(port, child), { ok: true });

      socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { Origin: ORIGIN } });
      assert.deepEqual(await waitForMessage(socket), { type: "connected", protocolVersion: 1 });

      const state = waitForMessage(socket);
      socket.send(JSON.stringify({ type: "create_room", requestId: "integration-1", name: "Alpha" }));
      const message = await state;
      assert.equal(message.type, "room_state");
      assert.equal(message.requestId, "integration-1");
      assert.match(message.room.code, /^[A-Z2-9]{6}$/);
      assert.equal(message.self.playerId.length > 0, true);

      pagesSocket = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { Origin: PAGES_ORIGIN } });
      assert.deepEqual(await waitForMessage(pagesSocket), { type: "connected", protocolVersion: 1 });

      child.kill("SIGTERM");
      assert.equal(await waitForExit(child), 0, output);
    } finally {
      socket?.terminate();
      pagesSocket?.terminate();
      if (child.exitCode === null) {
        child.kill("SIGKILL");
        await waitForExit(child).catch(() => {});
      }
    }
  });
});
