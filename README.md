# The Way — A Gospel Adventure

A polished, nonviolent Bible-based platformer built with Phaser 3, TypeScript, and Vite. The first playable chapter follows Jesus along the Galilean shore toward the calling of Peter and Andrew (Matthew 4:18–20).

## Play locally

```bash
npm install
npm run dev
```

Keyboard controls: **A/D** or **arrow keys** to move, **W/Space/Up** to jump, **E** to interact, **Esc** to pause, and **R** to return to the last checkpoint. Gamepads use the left stick/D-pad to move, **A** to jump, **X** to interact, and **Start** to pause. Touch controls appear automatically on smaller/touch displays.

## Build

```bash
npm run build
npm run preview
```

## GitHub Pages

The included workflow deploys every push to `main`. In the GitHub repository, open **Settings → Pages** and set **Source** to **GitHub Actions**. Vite uses relative asset paths, so the build works at both a root domain and a repository subpath.

## Campaign architecture

Level metadata lives in `src/game/data/levels.ts`. Progress, best times, ratings, and Scripture discoveries are saved locally. New chapters can reuse the shared menu, level-select, player controller, save system, audio system, HUD, dialogue, and completion flow.

## Artwork

The Galilee background, Jesus character, hand-painted terrain, brambles, olive tree, and Peter-and-Andrew character group were generated specifically for this project and processed locally for game use. Atmospheric effects, collectibles, checkpoints, shoreline details, and UI are rendered in Phaser.
