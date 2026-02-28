# Card Guessing Game

A modern browser-based version of the original card guessing game.

## Objective
Get through an entire 52-card deck without guessing the face value of the current card.
If your clicked value matches the card rank, you lose immediately.

## Features
- Modern glassmorphism UI
- Clickable on-screen card values (`A, 2-10, J, Q, K`)
- Card flip animation on each guess
- Win animation (green glow + particle burst)
- Lose animation (card shake + particle burst)
- New Game button to reshuffle and restart

## Run locally
From the project root:

```bash
python3 -m http.server 8000
```

Then open:

- `http://localhost:8000`

> Note: The legacy CLI prototype is still available in `card_game.py`.
