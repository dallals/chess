# Grandmaster — Chess in 2D & 3D

A browser chess game you play against a computer opponent, on either a classic 2D board or a fully rendered 3D board.

Built with React, TypeScript, Vite, Tailwind CSS, Three.js and [chess.js](https://github.com/jhlywa/chess.js).

## Features

- **2D and 3D boards.** Switch views at any time. The 3D board has orbit camera controls, lighting and shadows.
- **AI opponent with four difficulty levels.** Beginner, Casual, Advanced and Expert, powered by a negamax search with alpha-beta pruning and a tunable positional evaluation.
- **Full chess rules.** Castling, en passant, promotion (with piece choice), check, checkmate, stalemate and draws.
- **Chess clocks.** Unlimited, 5 min, 10 min or 15|10 with increment.
- **Play as White or Black**, flip the board, undo moves, or resign.
- **Move history** for the current game.
- **Game library.** Finished games are saved locally (up to 50) and can be replayed move by move.
- **PGN and FEN.** Copy the current game as PGN, or load any position from a FEN string.
- **Sound effects and dark mode**, with your preferences remembered between visits.

## Getting started

Requires Node.js 18 or newer.

```bash
npm install
npm run dev
```

The dev server runs at http://localhost:4200 and opens in your browser automatically.

## Scripts

| Command           | Description                               |
| ----------------- | ----------------------------------------- |
| `npm run dev`     | Start the Vite dev server                 |
| `npm run build`   | Type-check and build for production       |
| `npm run preview` | Preview the production build locally      |
| `npm test`        | Run the test suite with Vitest            |

## Project structure

```
src/
├── components/   React UI: App shell, 2D and 3D boards, clock, dialogs
├── engine/       Chess logic, AI search and position evaluation
├── store/        Zustand stores: game, AI, clock, UI, sound, game library
└── utils/        Helpers such as FEN diffing for move animations
public/pieces/    SVG piece artwork for the 2D board
```

## How the AI works

Each difficulty level sets a search depth (1 to 4 plies) and a set of evaluation weights. Beginner looks only at material. Higher levels also weigh mobility, center control, king safety, pawn structure and piece development. The search uses negamax with alpha-beta pruning to find the best move within that depth.
