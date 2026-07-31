import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { test } from 'node:test';

const root = new URL('..', import.meta.url);
const read = (relative) => fs.readFile(new URL(relative, root), 'utf8');

test('ships an accessible responsive opponent panel with exact cache revisions', async () => {
  const [html, style] = await Promise.all([
    read('public/index.html'),
    read('public/style.css'),
  ]);

  assert.match(html, /<aside[^>]+id="opponentPanel"[^>]+class="opponent-panel"[^>]+hidden[^>]*aria-labelledby="opponentHeading"/);
  assert.match(html, /<h2[^>]+id="opponentHeading"[^>]*>Opponent<\/h2>/);
  assert.match(html, /<canvas[^>]+id="opponentGame"[^>]+width="120"[^>]+height="240"[^>]+aria-label=/);
  for (const id of ['opponentName', 'opponentScore', 'opponentLines', 'opponentStatus']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }

  const hud = html.indexOf('class="hud desktop-only"');
  const stage = html.indexOf('class="stage"');
  const opponent = html.indexOf('id="opponentPanel"');
  assert.ok(hud > -1 && stage > hud && opponent > stage);
  assert.match(html, /<div id="status" class="status"><\/div>\s*<\/div>\s*<div class="stage">/);
  assert.match(html, /<div class="mobile-status" id="statusMobile"><\/div>\s*<\/div>\s*<aside id="opponentPanel"/);
  for (const acceptedId of ['multiplayerLobby', 'startBtn', 'pauseMenu', 'mobileControls']) {
    assert.match(html, new RegExp(`id="${acceptedId}"`));
  }

  assert.match(html, /style\.css\?v=0\.3\.0-beta\.1&rev=opponent-state-1/);
  assert.match(html, /game\.js\?v=0\.3\.0-beta\.1&rev=opponent-state-1/);
  assert.match(html, /room-client\.js\?v=0\.3\.0-beta\.1&rev=public-ws-2/);

  assert.match(style, /\.wrap\s*\{[\s\S]*?grid-template-columns:\s*220px\s+300px\s+160px/);
  assert.match(style, /\.opponent-panel\s*\{[\s\S]*?width:\s*160px/);
  assert.match(style, /\.opponent-panel\[hidden\]\s*\{\s*display:\s*none/);
  assert.match(style, /#opponentGame\s*\{[\s\S]*?width:\s*120px[\s\S]*?height:\s*240px/);
  assert.match(style, /@media\s*\(max-width:\s*760px\)[\s\S]*?\.opponent-panel\s*\{[\s\S]*?justify-self:\s*center/);
  assert.match(style, /@media\s*\(hover:\s*none\)\s*and\s*\(pointer:\s*coarse\)/);
  assert.match(style, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});
