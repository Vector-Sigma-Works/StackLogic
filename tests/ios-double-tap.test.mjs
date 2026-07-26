import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  IOS_DOUBLE_TAP_THRESHOLD_MS,
  bindIosDoubleTapGuard,
} from '../public/ios-double-tap.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const gameSource = readFileSync(join(__dirname, '..', 'public', 'game.js'), 'utf8');

class FakeButton {
  constructor({ disabled = false } = {}) {
    this.disabled = disabled;
    this.listeners = new Map();
    this.removed = [];
  }

  addEventListener(type, listener, options) {
    this.listeners.set(type, { listener, options });
  }

  removeEventListener(type, listener, options) {
    this.removed.push({ type, listener, options });
    if (this.listeners.get(type)?.listener === listener) this.listeners.delete(type);
  }

  touch() {
    const record = this.listeners.get('touchstart');
    assert.ok(record, 'touchstart listener must be installed');
    const event = {
      cancelable: true,
      prevented: false,
      preventDefault() { this.prevented = true; },
    };
    record.listener(event);
    return event;
  }
}

describe('iOS double-tap zoom guard', () => {
  it('suppresses only a fast second tap on the same enabled control', () => {
    let now = 1_000;
    const left = new FakeButton();
    const right = new FakeButton();
    const disabled = new FakeButton({ disabled: true });

    const dispose = bindIosDoubleTapGuard([left, right, disabled], { now: () => now });

    assert.equal(IOS_DOUBLE_TAP_THRESHOLD_MS, 300);
    assert.deepEqual(left.listeners.get('touchstart').options, { passive: false });
    assert.deepEqual(right.listeners.get('touchstart').options, { passive: false });
    assert.equal(disabled.listeners.has('touchstart'), false, 'disabled controls stay unguarded');

    assert.equal(left.touch().prevented, false, 'first left tap is allowed');
    now = 1_100;
    assert.equal(right.touch().prevented, false, 'fast cross-control tap is allowed');
    now = 1_200;
    assert.equal(left.touch().prevented, true, 'fast second left tap is guarded');
    now = 1_400;
    assert.equal(right.touch().prevented, false, 'tap at the exact threshold is allowed');

    dispose();
    assert.equal(left.listeners.has('touchstart'), false);
    assert.equal(right.listeners.has('touchstart'), false);
    assert.equal(left.removed.length, 1);
    assert.equal(right.removed.length, 1);
  });

  it('resets safely when the clock moves backward and ignores non-cancelable touches', () => {
    let now = 2_000;
    const button = new FakeButton();
    bindIosDoubleTapGuard([button], { now: () => now });

    assert.equal(button.touch().prevented, false);
    now = 1_900;
    assert.equal(button.touch().prevented, false, 'negative elapsed time is not a double tap');

    now = 2_000;
    const record = button.listeners.get('touchstart');
    const event = {
      cancelable: false,
      prevented: false,
      preventDefault() { this.prevented = true; },
    };
    record.listener(event);
    assert.equal(event.prevented, false, 'non-cancelable events are not prevented');
  });

  it('integrates only with enabled mobile gameplay buttons', () => {
    assert.match(gameSource, /import\s*\{\s*bindIosDoubleTapGuard\s*\}\s*from\s*['"]\.\/ios-double-tap\.js/);
    assert.match(
      gameSource,
      /bindIosDoubleTapGuard\(document\.querySelectorAll\(['"]#mobileControls button:not\(:disabled\)['"]\)\)/,
    );

    const legacyBlock = gameSource.match(/\/\/ Prevent iOS double-tap[\s\S]*?function bindHoldButton/);
    assert.ok(legacyBlock, 'touch guard remains adjacent to the mobile control bindings');
    assert.doesNotMatch(legacyBlock[0], /\.btn|\.pbtn|#startBtn|#goHomeBtn|#portraitRestartBtn/);
  });
});
