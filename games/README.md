# Games

Source area for interactive games on Marco Bernardini's Quarto website.

The first game is [Balance the Boat](balance-the-boat/README.md).

## Site structure

- `rowing/index.qmd` is the main Rowing landing page; `games/index.qmd` remains available at its original URL.
- `games/balance-the-boat/index.qmd` is the game page.
- The Rowing entry in `_quarto.yml` groups the SABC planner and the game in the navbar.
- Keep game styles, JavaScript, and dependencies local to each game.
- Register game assets as Quarto resources so they are copied into `docs/`.
- Generate published HTML with Quarto; do not hand-edit generated pages.

Balance the Boat includes Boat Still and Boat Moving. Moving mode offers Drive practice, Recovery practice, and Continuous rowing, with two warm-up strokes and ten scored strokes per run.
