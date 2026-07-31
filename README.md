<!-- Keep this default-branch README synchronized with the current UI, canonical URLs, release version, and key screenshots. -->

# StackLogic

**Version:** v0.3.0-beta.1

StackLogic is a fast, browser-based falling-block arcade puzzler with responsive keyboard and touch controls, persistent local scores, and four visual themes that can be changed before play or while paused.

**[Play StackLogic](https://alexgeslani.github.io/StackLogic/)** · **[Latest release](https://github.com/AlexGeslani/StackLogic/releases/tag/v0.3.0-beta.1)** · **[Changelog](CHANGELOG.md)** · **[Backlog](BACKLOG.md)**

## Screenshots

### Matrix gameplay

![StackLogic Matrix gameplay with solid-green pieces and digital rain](docs/screenshots/matrix-gameplay.png)

| Pause-time theme selection | iPad-class touch controls |
| --- | --- |
| ![Paused CandyPop game with Default, Matrix, CandyPop, and Dark theme controls](docs/screenshots/pause-theme-picker.png) | ![CandyPop gameplay in an iPad-class landscape viewport with touch controls](docs/screenshots/ipad-touch-controls.png) |

## Highlights

- **Four persistent themes:** Default, Matrix, CandyPop, and Dark.
- **Live theme switching:** choose a theme on the title screen or change it while paused without restarting the game.
- **Responsive input:** keyboard controls on desktop and on-screen controls for touch and coarse-pointer devices, including wide iPad-class layouts.
- **Accessible motion and navigation:** Matrix rain follows live reduced-motion preferences; theme controls support Arrow keys and Home/End with roving focus.
- **Deterministic game core:** level progression, competitive scoring, and seeded seven-bag piece order are reproducible and independently tested.
- **Local play data:** optional next-piece preview and local high scores work without an account.
- **Static deployment:** the production game runs on GitHub Pages; the Express server is provided for local development.

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Move | Left / Right arrows | Left / Right |
| Soft drop | Down arrow | Drop |
| Rotate right | Up arrow or `X` | Rot R |
| Rotate left | `Z` | Rot L |
| Hard drop | Space | — |
| Pause / resume | `P` | Pause / Resume |
| Return home | `R` | Restart (portrait layout) |

## Run locally

Requires Node.js 18 or newer.

```bash
npm install
npm start
```

Open http://localhost:3000.

## Test

```bash
npm test
```

The test suite covers deterministic progression, scoring, seeded piece sequences, release metadata, theme rendering and accessibility, Matrix rain lifecycle and cleanup, responsive controls, and GitHub Pages workflow boundaries.

## Project layout

- `public/` — browser game, themes, styles, and static assets
- `tests/` — deterministic Node test suite
- `docs/screenshots/` — current product screenshots used by this README
- `.github/workflows/pages.yml` — pull-request tests and GitHub Pages deployment
- `server.js` — lightweight Express development server
- `CHANGELOG.md` — released product changes
- `BACKLOG.md` — parked roadmap and review follow-ups

## Release status

StackLogic is currently in the **v0.x beta** line. Gameplay, UI, and local data formats may change before v1.0. Patch prereleases focus on fixes and refinements; minor prereleases may introduce larger gameplay or presentation changes.
