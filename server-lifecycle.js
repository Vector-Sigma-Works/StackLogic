export function closeHttpServer(server, {
  forceAfterMs = 1000,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
} = {}) {
  return new Promise((resolve, reject) => {
    let timer = null;
    let settled = false;
    const finish = (error) => {
      settled = true;
      if (timer !== null) clearTimeoutFn(timer);
      error ? reject(error) : resolve();
    };
    server.close(finish);
    if (settled) return;
    if (typeof server.closeIdleConnections === 'function') server.closeIdleConnections();
    if (settled) return;
    timer = setTimeoutFn(() => {
      if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    }, forceAfterMs);
  });
}

export async function closeServers({ closeWebSocket, closeHttp }) {
  const invoke = (callback) => Promise.resolve().then(callback);
  const results = await Promise.allSettled([invoke(closeWebSocket), invoke(closeHttp)]);
  const failures = results.filter((result) => result.status === 'rejected').map((result) => result.reason);
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, 'shutdown_failed');
}

export async function settleShutdown({
  shutdown,
  processObject = process,
  reportError = console.error,
}) {
  try {
    await shutdown();
    processObject.exitCode = 0;
  } catch (error) {
    reportError('shutdown_failed', error);
    processObject.exitCode = 1;
  }
}
