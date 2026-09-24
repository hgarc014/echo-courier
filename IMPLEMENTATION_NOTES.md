# Hint popup (Approach B)

- `?` plates open a small anchored bubble (`#demo-popup-panel`) over a frozen copy of the game canvas. The live script runs only on `#demo-mini-canvas`.
- The popup overlay is transparent and `pointer-events: none`. Skip/Close stay on the panel. Full-screen intro demos still use `.demo-overlay-full`.
- The bubble sits above the plate (tail down). If there is under 8px of room, it flips below (`tail-above`).
- Mini view frames move-to steps, the hint plate, and the player. Entities are drawn with `render` only.
- Developer Mode refreshes the level grid via `refreshLevelSelectGrid()` so Settings stays open.
