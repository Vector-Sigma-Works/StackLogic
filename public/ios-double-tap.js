export const IOS_DOUBLE_TAP_THRESHOLD_MS = 300;

/**
 * Install a touchstart listener on each enabled button that prevents the default
 * action when two taps occur within IOS_DOUBLE_TAP_THRESHOLD_MS on the same control.
 * Returns a disposer function that removes all installed listeners.
 */
export function bindIosDoubleTapGuard(buttons, { now = Date.now } = {}) {
  const lastTapTime = new Map();
  const disposers = [];

  for (const btn of buttons) {
    if (btn.disabled) continue;

    const handler = (e) => {
      if (!e.cancelable) return;
      const nowMs = now();
      const prev = lastTapTime.get(btn);
      if (prev !== undefined && (nowMs - prev) >= 0 && (nowMs - prev) < IOS_DOUBLE_TAP_THRESHOLD_MS) {
        e.preventDefault();
      }
      lastTapTime.set(btn, nowMs);
    };

    btn.addEventListener('touchstart', handler, { passive: false });
    disposers.push(() => {
      btn.removeEventListener('touchstart', handler, { passive: false });
      lastTapTime.delete(btn);
    });
  }

  return () => {
    for (const dispose of disposers) {
      dispose();
    }
  };
}
