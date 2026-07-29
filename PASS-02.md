# StackLogic Pass 02 — Server-Authoritative Match Start

## Outcome

When exactly two room members are present and the second valid Ready transition makes both players Ready, the server atomically creates one match and both clients begin from the same authoritative match identity and unsigned 32-bit seed.

## Writable product paths

- `room-registry.js`
- `public/room-client.js`
- `public/game.js`

No other product path is writable in this pass.

## Immutable acceptance gate

- `tests/multiplayer-match-start.test.mjs`

The implementation and review lanes may read this test but must not alter it.

## Required behavior

1. A room has no `match` property before exactly two players are Ready.
2. The valid second Ready transition increments the existing room sequence exactly once and atomically adds:
   - `match.id`: a non-empty bounded ASCII token;
   - `match.seed`: an integer from `0` through `0xffffffff`;
   - `match.startedSeq`: the resulting authoritative room sequence.
3. Default match identity and seed authority use Node cryptographic entropy (`randomUUID` plus a cryptographic unsigned 32-bit seed), never `Math.random`, clocks, or client input.
4. The registry accepts injected match-ID and seed factories for deterministic tests. Invalid factory output fails with a typed error and leaves room sequence, readiness, and match state unchanged.
5. A started match cannot be regenerated or returned to lobby readiness through `setPlayerReady`; reject with `match_started` without mutation.
6. Existing personalized `room_state` broadcasts carry the same detached `room.match` snapshot to both connections. Do not add a second competing match-start protocol message.
7. The room client validates the authoritative match shape, disables the Ready control, and dispatches exactly one `stacklogic:match-start` browser event per match ID. Repeated room snapshots must not restart the match. Invalid match data must not dispatch.
8. `public/game.js` listens for that browser event and calls the existing `startGame(seed)` seam with the authoritative seed.
9. Solo Start continues to call `startGame()` with locally generated cryptographic entropy.
10. Existing room-code, request-ID, sequence, readiness, lobby-copy, solo progression/scoring, and seeded seven-bag behavior remain intact.

## Non-goals

- board, movement, input, score, line, garbage, pause, or game-over synchronization;
- matchmaking, spectators, persistence, results, rematches, or reconnect recovery;
- protocol redesign or dependency changes;
- push, deployment, release, promotion, or production mutation.

## Acceptance command

```sh
node --test tests/multiplayer-match-start.test.mjs
```
