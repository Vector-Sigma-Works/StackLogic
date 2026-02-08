# StackLogic Backlog Notes

Owner (future): Prime (agent)
Status: Parked for roadmap

## From Codex review (main..staging)

### Should
1. **Perf / maintainability** (`public/game.js`)
   - Current: `draw()` reads `localStorage` every frame to determine `previewEnabled`.
   - Proposed: cache `previewEnabled` in memory; initialize once on load; update via checkbox change handler.

2. **Touch handler scope** (`public/game.js`)
   - Current: double-tap guard selector is broad (`.btn`, `.pbtn`, etc.).
   - Proposed: limit to game-control elements only to avoid side effects on future buttons.

### Nice
1. Add a subtle frame/background behind "Next" preview for readability.
2. Add lightweight test checklist for:
   - preview toggle persistence
   - spawn/next consistency across restart/home flow
   - iOS double-tap guard behavior

## Gate decision reference
- PASS (no blockers/security issues)
- No secrets added in diff
- No eval usage added
- No unsafe DOM (`innerHTML`) in changed files
- No dependency/version changes in diff
