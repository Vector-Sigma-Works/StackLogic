# StackLogic Pass 01 — Lobby Usability

## Goal
Finish the existing secure-room lobby usability without adding match gameplay.

## Required behavior
1. Normalize join input to the server's canonical uppercase room code before sending `join_room`: accept lowercase and ignore spaces/hyphens.
2. Normalize direct `?room=<code>` prefills, and accept a pasted invite URL containing `?room=<code>` by extracting/normalizing only the room code.
3. Provide accessible **Copy Code** and **Copy Invite Link** controls that are unavailable before `room_state` and enabled after it.
4. Copy Code must copy the normalized canonical code from the active `room_state`, never a later edit to the join input.
5. Copy Invite Link must use the active `room_state` code and contain only the current page origin/path and normalized room code; never include player name, request ID, token, room state, or unrelated query parameters.
6. Copy must use the modern Clipboard API when available and a user-gesture document-copy fallback on the canonical non-secure HTTP lane; success/failure must use the existing in-page status surface with no `alert()` or `prompt()`.
7. Preserve current create/join/ready behavior, solo behavior, secure request IDs, and all existing assertions.

## Not in this pass
- Countdown, match start, opponent board, Duel/garbage gameplay, reconnect, rematch, visual redesign, deployment, commit, or push.

## Writable paths
- `public/index.html`
- `public/room-client.js`

## Immutable acceptance gate
- `tests/multiplayer-lobby-ui.test.mjs`

## Gates
- `node --test tests/multiplayer-lobby-ui.test.mjs` inside the admitted offline container.
- Prime separately runs full `npm test` after an accepted patch is projected to the authoritative dev worktree.
