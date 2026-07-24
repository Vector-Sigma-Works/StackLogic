import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const themeSrc = readFileSync(join(__dirname, '..', 'public', 'theme.js'), 'utf-8');

// Minimal mock environment for themechange event tests.
function createMockEnv() {
  const STORAGE = {};
  const mockStyle = {};
  mockStyle.setProperty = function (key, value) { this[key] = value; };
  mockStyle.getPropertyValue = function (key) { return this[key] || ''; };

  const docAttrs = {};
  const mockDocumentElement = {
    style: mockStyle,
    getAttribute: function (k) { return docAttrs[k] || null; },
    setAttribute: function (k, v) { docAttrs[k] = v; },
  };

  const dispatchedEvents = [];
  const mockDocument = {
    documentElement: mockDocumentElement,
    createElement: function () { return { style: {}, classList: { add: function () { }, remove: function () { } } }; },
    body: { style: {} },
    dispatchEvent: function (evt) { dispatchedEvents.push(evt); },
  };

  const mockLocalStorage = {
    getItem: function (k) { return STORAGE[k] || null; },
    setItem: function (k, v) { STORAGE[k] = String(v); },
  };

  function CustomEvent(type, options) {
    this.type = type;
    this.detail = options && options.detail ? options.detail : null;
  }

  const mockWindow = {
    localStorage: mockLocalStorage,
    document: mockDocument,
    CustomEvent: CustomEvent,
    matchMedia: function (q) {
      return {
        matches: q.includes('no-preference'),
        addEventListener: function () { },
        removeEventListener: function () { },
      };
    },
  };

  return { mockWindow, mockDocument, mockLocalStorage, dispatchedEvents };
}

describe('themechange event', function () {
  it('valid theme dispatches exactly one themechange event with detail.theme', function () {
    const { mockWindow, mockDocument, mockLocalStorage, dispatchedEvents } = createMockEnv();
    new Function('window', 'document', 'localStorage', themeSrc)(
      mockWindow, mockDocument, mockLocalStorage
    );
    const result = mockWindow.ThemeModule.applyTheme('Dark');
    assert.ok(Array.isArray(result), 'applyTheme must return an array');
    assert.strictEqual(dispatchedEvents.length, 1, 'exactly one event must be dispatched');
    assert.strictEqual(dispatchedEvents[0].type, 'themechange', 'event type must be themechange');
    assert.deepStrictEqual(dispatchedEvents[0].detail, { theme: 'Dark' }, 'detail must be {theme: name}');
  });

  it('invalid theme does not dispatch any event', function () {
    const { mockWindow, mockDocument, mockLocalStorage, dispatchedEvents } = createMockEnv();
    new Function('window', 'document', 'localStorage', themeSrc)(
      mockWindow, mockDocument, mockLocalStorage
    );
    const result = mockWindow.ThemeModule.applyTheme('invalid');
    assert.deepStrictEqual(result, [], 'applyTheme must return empty array for invalid theme');
    assert.strictEqual(dispatchedEvents.length, 0, 'no event must be dispatched for invalid theme');
  });

  it('missing document.dispatchEvent does not throw', function () {
    const { mockWindow, mockLocalStorage } = createMockEnv();
    delete mockWindow.document.dispatchEvent;
    new Function('window', 'document', 'localStorage', themeSrc)(
      mockWindow, mockWindow.document, mockLocalStorage
    );
    assert.doesNotThrow(function () {
      mockWindow.ThemeModule.applyTheme('Matrix');
    }, 'applyTheme must not throw when dispatchEvent is missing');
  });

  it('missing root.CustomEvent does not throw', function () {
    const { mockWindow, mockDocument, mockLocalStorage } = createMockEnv();
    delete mockWindow.CustomEvent;
    new Function('window', 'document', 'localStorage', themeSrc)(
      mockWindow, mockDocument, mockLocalStorage
    );
    assert.doesNotThrow(function () {
      mockWindow.ThemeModule.applyTheme('Default');
    }, 'applyTheme must not throw when CustomEvent is missing');
  });

  it('consecutive calls emit separate events', function () {
    const { mockWindow, mockDocument, mockLocalStorage, dispatchedEvents } = createMockEnv();
    new Function('window', 'document', 'localStorage', themeSrc)(
      mockWindow, mockDocument, mockLocalStorage
    );
    mockWindow.ThemeModule.applyTheme('Dark');
    mockWindow.ThemeModule.applyTheme('Matrix');
    assert.strictEqual(dispatchedEvents.length, 2, 'two events must be dispatched');
    assert.strictEqual(dispatchedEvents[0].detail.theme, 'Dark', 'first event theme must be Dark');
    assert.strictEqual(dispatchedEvents[1].detail.theme, 'Matrix', 'second event theme must be Matrix');
  });
});
