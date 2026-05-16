# Catan Board Randomizer

A browser-based Settlers of Catan board randomizer with support for:

- 4-player base game
- 6-player expansion layout
- Official-style number token placement flow
- No adjacent 6/8 enforcement
- Randomized harbor assignment
- Visual sea frame and harbor ring

## Features

- Mode switch between 4-player and 6-player boards
- Full board randomization (terrain, numbers, harbors)
- Reshuffle numbers only
- Board code textbox for partial or full layouts
- Image detection from screenshots (terrain import; numbers/harbors are regenerated)
- Responsive UI for desktop and mobile
- Accessibility basics (live status updates, labeled controls)

## Board Codes

Use the board-code textbox to define tiles in spiral order.

Examples:

- `O6 S4 W10`
- `D G8 B3`
- `W G S O B D`

Harbors are appended after a `P` marker using only letters and numbers:

- `P0T2W4O`

Example:

- `O6 S4 W10 P0T2W4O`

Code letters:

- `W` = wood
- `B` = brick
- `S` = sheep
- `G` = wheat
- `O` = ore
- `D` = desert

Notes:

- Each code token can be a resource only (`W`) or a resource plus number (`O6`).
- If you enter fewer tiles than the board needs, the remaining tiles are filled randomly.
- If you enter the full board, the layout is generated from your code.
- Harbor codes use `<slot><type>` after `P`. Use `T` for a generic `3:1` harbor, and `W/B/S/G/O` for matching `2:1` harbors.
- Official rule enforcement still applies: 6 and 8 may not be adjacent.

## Rules Implemented

- Correct terrain totals per mode
- Desert tiles get no number token
- Number tokens assigned in an official-style spiral flow
- Adjacent red numbers (6 and 8) are rejected
- Harbor count and distribution by mode

## Run Locally

No build tools are required.

### Option 1: Open directly

Open `index.html` in your browser.

### Option 2: Local server (recommended)

```bash
cd /home/alecu/projects/catan_helper
python3 -m http.server 4173
```

Then open:

- `http://127.0.0.1:4173/`

## Project Structure

- `index.html`: Page structure and file wiring.
- `style.css`: All visual styles.
- `app.js`: Board generation logic and UI behavior.

## How To Use

1. Choose board mode (4-player or 6-player).
2. Optionally type a board code like `O6 S4 W10`.
3. Click `Generate Board`.
4. Optional: click `Reshuffle Numbers Only` to keep terrain/harbors and only change tokens.

## Publish On GitHub (Checklist)

1. Ensure files are committed:

```bash
cd /home/alecu/projects/catan_helper
git add .
git commit -m "Add README and project polish"
```

2. Push to GitHub:

```bash
git push -u origin main
```

3. Make repository public (GitHub UI):
- Go to your repo on GitHub
- Open `Settings`
- Scroll to `Danger Zone`
- Click `Change repository visibility`
- Choose `Make public`

4. Optional but recommended before public release:
- Add a `LICENSE` file (MIT is common for small web tools)
- Add a short repo description and topic tags
- Enable GitHub Pages if you want a live URL

## Optional Next Steps

- Add seeded random generation for shareable boards
- Add fixed official harbor order toggle
- Split JS/CSS into separate files for maintainability
- Add automated tests for rule validation
