# Games

Source area for interactive games on Marco Bernardini's Quarto website.

The first game is [Balance the Boat](balance-the-boat/README.md).

## Site structure

- `games/index.qmd` is the Games landing page.
- `games/balance-the-boat/index.qmd` is the game page.
- The Games entry in `_quarto.yml` adds the section to the existing navbar.
- Keep game styles, JavaScript, and dependencies local to each game.
- Register game assets as Quarto resources so they are copied into `docs/`.
- Generate published HTML with Quarto; do not hand-edit generated pages.

Balance the Boat includes Boat Still and Boat Moving. Moving mode offers Drive practice, Recovery practice, and Continuous rowing, with two warm-up strokes and ten scored strokes per run.
