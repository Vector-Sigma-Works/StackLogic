import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { closeHttpServer, closeServers, settleShutdown } from '../server-lifecycle.js';

describe('server shutdown lifecycle', () => {
  it('rejects an HTTP close callback error', async () => {
    const failure = new Error('close_failed');
    const server = { close(callback) { callback(failure); } };
    await assert.rejects(closeHttpServer(server), failure);
  });

  it('force-closes lingering HTTP connections after the shutdown grace period', async () => {
    let closeCallback;
    let forceTimer;
    let forced = false;
    const server = {
      close(callback) { closeCallback = callback; },
      closeIdleConnections() {},
      closeAllConnections() { forced = true; closeCallback(); },
    };
    const closing = closeHttpServer(server, {
      forceAfterMs: 25,
      setTimeoutFn(callback) { forceTimer = callback; return 1; },
      clearTimeoutFn() {},
    });
    assert.equal(forced, false);
    forceTimer();
    await closing;
    assert.equal(forced, true);
  });

  it('attempts HTTP teardown even when WebSocket shutdown throws synchronously', async () => {
    let httpClosed = false;
    const failure = new Error('ws_close_failed');
    await assert.rejects(
      closeServers({
        closeWebSocket: () => { throw failure; },
        closeHttp: async () => { httpClosed = true; },
      }),
      failure,
    );
    assert.equal(httpClosed, true);
  });

  it('reports shutdown failure and leaves a controlled nonzero exit code', async () => {
    const processObject = { exitCode: 0 };
    const reported = [];
    await settleShutdown({
      shutdown: async () => { throw new Error('shutdown_failed'); },
      processObject,
      reportError: (...args) => reported.push(args),
    });
    assert.equal(processObject.exitCode, 1);
    assert.equal(reported.length, 1);
    assert.equal(reported[0][0], 'shutdown_failed');
  });

  it('sets a zero exit code only after successful shutdown', async () => {
    const processObject = { exitCode: null };
    await settleShutdown({ shutdown: async () => {}, processObject, reportError() {} });
    assert.equal(processObject.exitCode, 0);
  });
});
