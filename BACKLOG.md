# StackLogic Backlog Notes

Owner: Prime (agent)
Source of truth: Autobot Command Project board (`Vector-Sigma-Works` Project #2)
Last sync: 2026-02-10 (from Prime live board snapshot)

## Board snapshot (synced)

### Ready
- F: StackLogic Gameplay Progression Pack (#12)
- S: Gameplay Ramp - Levels and Speed Curves (#13)
- F: StackLogic Architecture Hardening (#18)

### Backlog
- E: StackLogic Game Evolution v0.1 (#11)
- S: Control Flow Parity - Pause, Resume, Restart (#14)
- F: StackLogic Competitive Scoring Foundation (#15)
- S: Scoring Model Normalization (#16)
- S: Seeded Challenge Mode (#17)

### Unassigned / needs status field set
- S: Module Split Refactor (input/state/render) (#19)
- S: Regression Checklist Script for Core Flows (#20)

## Parked quality follow-ups (from prior Codex review)

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
