# Changelog

All notable changes to this project are recorded here.

## [Unreleased]

## [0.3.0-beta.1] - 2026-07-26

### Added
- Added a deterministic level and drop-speed progression curve with visible progress toward the next level.
- Added standard competitive line-clear, soft-drop, and hard-drop scoring rules.
- Added reproducible seeded seven-bag piece sequences with bounded replay offsets for future reconnect recovery.
- Added an explicit game-start seed seam for future server-issued multiplayer seeds while retaining cryptographically seeded solo play.

### Changed
- Current and preview pieces now draw from one deterministic piece-sequence authority.
- Gameplay progression and scoring now use shared, independently tested modules.

### Fixed
- Preserved replay correctness at exact seven-piece bag boundaries.

## [0.2.0-beta.1] - 2026-07-25

### Added
- Added a title screen with Default, Matrix, CandyPop, and Dark themes.
- Added theme-aware piece rendering and persistent local theme selection.
- Added Matrix rain with single-owner animation lifecycle, resize and DPR handling, reduced-motion support, cleanup fencing, and non-interference with gameplay controls.
- Added a dedicated pause menu with synchronized theme selection and explicit resume behavior.
- Added Arrow-key and Home/End navigation with roving focus for theme radio groups.
- Added deterministic unit and real-browser acceptance coverage for themes, rain lifecycle, browser integration, and responsive controls.

### Changed
- Matrix game pieces now use deterministic solid green shades without glyph faces.
- Dark game pieces now use deterministic solid black-to-grey shades.
- Wide touch devices such as iPad Pro now expose on-screen controls based on coarse/no-hover input capability rather than viewport width alone.

### Fixed
- Preserved Matrix stream identity and geometry across viewport and DPR changes.
- Prevented duplicate animation ownership, stale callbacks, interaction interception, and reduced-motion resource allocation.
- Stopped and restarted Matrix rain when the operating-system reduced-motion preference changes live.
- Corrected selected Matrix and CandyPop theme-label contrast to meet WCAG AA.
- Remediated known Express transitive dependency advisories in the development/server toolchain.

## [0.1.0-beta.1] - 2026-02-08

### Added
- Added a title-screen checkbox to toggle the next-block preview using localStorage key `stacklogic_preview_next_v1`.
- Added next-piece preview rendering and prefetched next-piece logic.
- Added localStorage-only high scores for GitHub Pages.
- Added GitHub Pages deployment.

### Fixed
- Kept the next-piece preview inside the canvas.
- Added an iOS double-tap guard for on-screen controls.
- Corrected GitHub Pages paths for music and intro assets.
