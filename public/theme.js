// Theme system for StackLogic
// Provides Default, Matrix, CandyPop, Dark themes with localStorage persistence.

(function (root) {
  'use strict';

  var STORAGE_KEY = 'stacklogic_theme_v1';
  var REDUCED_MOTION_KEY = 'prefers-reduced-motion';

  // Theme definitions
  var themes = {
    Default: {
      name: 'Default',
      ambientAnimation: true,
      cssVars: [
        ['--bg', '#0b0f14'],
        ['--fg', '#e6edf3'],
        ['--muted', '#9aa4af'],
        ['--panel', '#0f1624'],
        ['--border', '#283244'],
        ['--accent', '#1d4ed8']
      ]
    },
    Matrix: {
      name: 'Matrix',
      ambientAnimation: true,
      cssVars: [
        ['--bg', '#0a0a0a'],
        ['--fg', '#00ff41'],
        ['--muted', '#008f11'],
        ['--panel', '#0d1a0d'],
        ['--border', '#003b00'],
        ['--accent', '#00ff41']
      ]
    },
    CandyPop: {
      name: 'CandyPop',
      ambientAnimation: true,
      cssVars: [
        ['--bg', '#1a0a2e'],
        ['--fg', '#ffb6c1'],
        ['--muted', '#c77dba'],
        ['--panel', '#2d1b4e'],
        ['--border', '#4a2c7a'],
        ['--accent', '#ff69b4']
      ]
    },
    Dark: {
      name: 'Dark',
      ambientAnimation: false,
      cssVars: [
        ['--bg', '#000000'],
        ['--fg', '#ffffff'],
        ['--muted', '#888888'],
        ['--panel', '#111111'],
        ['--border', '#333333'],
        ['--accent', '#555555']
      ]
    }
  };

  var currentTheme = null;

  // Load saved theme from localStorage
  function loadSavedTheme() {
    try {
      var saved = root.localStorage.getItem(STORAGE_KEY);
      if (saved && themes[saved]) {
        return saved;
      }
    } catch (e) {
      // localStorage unavailable
    }
    return null;
  }

  // Select and persist a theme
  function selectTheme(name) {
    if (!themes[name]) return false;
    currentTheme = name;
    try {
      root.localStorage.setItem(STORAGE_KEY, name);
    } catch (e) {
      // localStorage unavailable
    }
    return true;
  }

  // Apply theme CSS variables to document
  function applyTheme(name) {
    var theme = themes[name];
    if (!theme) return [];
    currentTheme = name;
    var vars = [];
    for (var i = 0; i < theme.cssVars.length; i++) {
      var entry = theme.cssVars[i];
      var key = entry[0];
      var value = entry[1];
      root.document.documentElement.style.setProperty(key, value);
      vars.push([key, value]);
    }
    root.document.documentElement.setAttribute('data-theme', name);
    return vars;
  }

  // Check if reduced motion is preferred
  function prefersReducedMotion() {
    try {
      if (root.window.matchMedia) {
        return !root.window.matchMedia('(prefers-reduced-motion: no-preference)').matches;
      }
    } catch (e) {
      // matchMedia unavailable
    }
    return false;
  }

  // Initialize theme on load
  function init() {
    var saved = loadSavedTheme();
    if (saved) {
      applyTheme(saved);
    } else {
      applyTheme('Default');
    }
  }

  // Expose public API
  root.ThemeModule = {
    themes: themes,
    selectTheme: selectTheme,
    applyTheme: applyTheme,
    init: init,
    prefersReducedMotion: prefersReducedMotion,
    loadSavedTheme: loadSavedTheme
  };

})(typeof window !== 'undefined' ? window : globalThis);
