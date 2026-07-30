# StackLogic Pass 03 — Live Opponent State

Status: runner-owned implementation contract
Baseline source checkpoint: `fa3be624429f38c28f5ce47a639538195f74e1ad`
Cumulative fixture baseline: `c1bf65fa03483c55341d23056fbc61fc64ae1f1f`
Mode: local-only two-Qwen implementation/review cycle

## Primary objective

Use StackLogic as the pilot product to qualify the bounded local implementation and read-only review lanes. The deterministic runner and Prime retain authority for scope, tests, candidate identity, browser acceptance, dev/production isolation, and final decisions.

## Product outcome

After the two-player server-authoritative match start from Pass 02, each browser can see the other player's settled board, score, lines, and game-over status update live.

This pass does **not** make a reported board, score, lines, or game-over flag authoritative gameplay truth. The client reports cosmetic opponent-view state. The server is authoritative only for connection-bound player identity, room and match ownership, strict payload validation, per-player update ordering, storage isolation, and opponent-only relay. A reported game-over flag never adjudicates a winner or stops the other player's game.

## Frozen state schema

A client state update has these exact fields:

```json
{
  "board": [[null]],
  "score": 0,
  "lines": 0,
  "gameOver": false
}
```

The real board must be exactly 20 rows by 10 columns. Every cell is exactly `null` or one of `I`, `O`, `T`, `S`, `Z`, `J`, `L`. `score` and `lines` are non-negative safe integers no greater than 1,000,000,000. `gameOver` is boolean. The four own enumerable state keys must be exactly `board`, `score`, `lines`, and `gameOver`; inherited substitutes and extra own keys are rejected.

Every update also carries the current bounded ASCII `matchId` and an integer `updateSeq` in `1..1,000,000,000`. A player's first update is sequence 1; every later update must be exactly the previous sequence plus one. One player's update sequence is independent of the room sequence and the other player's sequence.

## Server and protocol outcome

1. `room-registry.js` exposes one `updatePlayerState` authority.
2. It accepts updates only for an existing room, existing connection-bound player, already-started matching match ID, exact next player sequence, and fully valid detached state.
3. Invalid input fails before mutation. Use `match_not_started` when no match exists, `match_mismatch` for a valid foreign match ID, `invalid_update_sequence` for a malformed sequence value, `stale_player_state` with numeric `currentUpdateSeq` for a valid duplicate/stale/skipped sequence, and `invalid_player_state` for a malformed state shape or value. Before the first accepted update, authoritative `currentUpdateSeq` is `0`. Existing room/player errors retain their current codes. Duplicate, stale, and skipped sequences never replace the last accepted state.
4. Accepted state is deep-copied into the player as `gameState`. `updatePlayerState` returns the complete detached room snapshot—preserving top-level `code`, `seq`, `players`, and `match`—with the accepted player's `gameState` visible in that returned snapshot. The room's lobby `seq` remains exactly unchanged.
5. `room-protocol.js` accepts `update_player_state` through the existing request-ID and connection session boundary. Clients never choose a player ID. The protocol passes only the connection-bound session room code and player ID into `updatePlayerState`; the registry re-reads the authoritative current room and match. Authorization must never depend on the session's stale detached room snapshot.
6. The sender receives:

```json
{
  "type": "player_state_accepted",
  "protocolVersion": 1,
  "requestId": "...",
  "matchId": "...",
  "updateSeq": 1
}
```

7. Only the other currently connected, distinct player session in the same authoritative room receives the dedicated projection; state is not added to `room_state`:

```json
{
  "type": "opponent_state",
  "protocolVersion": 1,
  "matchId": "...",
  "opponent": {
    "name": "Alpha",
    "updateSeq": 1,
    "board": [[null]],
    "score": 0,
    "lines": 0,
    "gameOver": false
  }
}
```

8. After the request-ID and in-room session gates, the registry remains the sole match, sequence, and state-shape validator. The protocol must not remap registry `invalid_update_sequence`, `stale_player_state`, `match_mismatch`, or `invalid_player_state` outcomes to generic `invalid_request`. A rejected update produces one typed error to the sender and no opponent message. All outbound state is detached from registry storage.

## Browser bridge outcome

1. `public/room-client.js` tracks the validated authoritative active match from Pass 02.
2. It accepts `stacklogic:local-state` only while that match is active, validates the exact state shape defensively, assigns the next local player update sequence, and sends `update_player_state` only through an open existing WebSocket. The local sequence advances only after a successful send. Send failure must not break the local game loop.
3. It validates `opponent_state` against the active match and exact next opponent sequence, ignores malformed, foreign, duplicate, stale, or skipped updates, and dispatches a detached `stacklogic:opponent-state` event.
4. A genuinely new validated match resets both per-player counters. Repeated `room_state` delivery for the same match must neither restart the game nor reset counters. Socket close invalidates multiplayer publication. `public/game.js` also dispatches `stacklogic:multiplayer-end` with exact detail `{ matchId }`; `room-client.js` invalidates only when that bounded match ID equals its active authoritative match.

## Game and interface outcome

1. `public/game.js` starts multiplayer through the existing validated match-start seam, retains the authoritative active match ID as the publication owner, and preserves solo Start behavior. Solo Start, Home, and multiplayer game-over invalidate that owner synchronously before reset or any asynchronous prompt/high-score work; late events from an old match cannot publish or render. Invalidation dispatches `stacklogic:multiplayer-end` exactly once for the ending authoritative match.
2. During multiplayer it dispatches a detached `stacklogic:local-state` snapshot at initial start, after each settled piece lock, and once when game over is entered. On game over the final state event is dispatched before `stacklogic:multiplayer-end`. It does not transmit every movement, rotation, or timer tick.
3. It validates and renders `stacklogic:opponent-state` into a dedicated miniature opponent canvas using the existing piece colors/theme renderer.
4. The opponent panel shows opponent name, score, lines, and Playing/Game Over status. It is hidden outside multiplayer and must not alter the accepted lobby or solo layout.
5. `public/index.html` and `public/style.css` provide an accessible responsive opponent panel: a third compact column on wide screens and a centered panel below the game on narrow screens. Changed `style.css`, `game.js`, and `room-client.js` entry assets retain `v=0.3.0-beta.1` and add the exact revision key `rev=opponent-state-1`.

## Required deterministic gates

- Frozen Pass 03 registry authority test.
- Frozen Pass 03 protocol relay test.
- Frozen Pass 03 room-client bridge test.
- Frozen Pass 03 game/interface event and rendering test.
- Existing full source suite remains green.
- Exact candidate paths and hashes are sealed before projection.

## Required canonical-dev browser acceptance

Using two independent concurrent browser contexts on `http://stacklogic-dev.game.lan`:

1. Host creates; guest joins; both Ready; both receive the same authoritative match start.
2. Both opponent panels become visible and identify the other player.
3. A hard drop in host produces one settled-board update visible only in guest's opponent panel.
4. A differently placed hard drop in guest produces one settled-board update visible only in host's opponent panel.
5. Score/lines/status converge with the corresponding reported opponent state.
6. Solo Start still works and keeps the opponent panel hidden.
7. No page exceptions, console errors, failed requests, server errors, or stale cache behavior occur.
8. Production `stacklogic.game.lan` bytes, process, and route remain unchanged.

## Cumulative subpasses

### 03A — registry state authority

Writable path: `room-registry.js` only. Done when the frozen registry gate and standing regressions pass.

### 03B — protocol acknowledgement and opponent-only relay

Writable path: `room-protocol.js` only. Done when the frozen protocol gate and standing regressions pass against the cumulative 03A state.

### 03C — browser event/WebSocket bridge

Writable path: `public/room-client.js` only. Done when the frozen room-client gate and standing regressions pass against cumulative 03A–03B.

### 03D — game reporting and responsive opponent panel

Writable paths: `public/game.js`, `public/index.html`, and `public/style.css` only. Done when the frozen game/interface gate and the complete unfiltered Pass 03 test file pass against cumulative 03A–03C.

After every accepted subpass, the runner creates a clean cumulative fixture checkpoint. The final unfiltered Pass 03 gate and full source suite are rerun after all subpasses.

## Explicit non-goals

- No garbage, attacks, winner adjudication, results, or rematch.
- No current falling-piece synchronization.
- No public matchmaking, spectators, persistence, reconnect recovery, or anti-cheat claim.
- No disconnect notification, hostile-client rate limiting, or slow-peer queue redesign. The official client emits only initial/lock/game-over snapshots; the existing transport retains its 4096-byte ingress ceiling. Adversarial rate control is a separate pass if the trust boundary expands.
- No `server.js`, package, release metadata, production, route, certificate, or deployment changes.
- No push, merge, release, or production promotion without explicit human approval.
