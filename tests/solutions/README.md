# Recorded solutions

Each `*.json` is a level's intended solution as recorded inputs. `tests/solutionReplay.test.mjs`
replays every file headlessly in CI and fails if the level no longer completes, if it goes over
`par` (when the level defines `par`), or if the loop count changed from the recording.

## Format (`echo-courier-solution/v1`)

```json
{
  "format": "echo-courier-solution/v1",
  "level": 0,                      // LEVELS index; null for an editor layout
  "levelName": "First Shift",
  "layout": { ... }, "meta": { ... },   // editor playtests only: serialized layout + level meta
  "loops": [                       // one array per loop (split at every rewind)
    [["s+d", 4], ["d", 30], ["", 20], ["r", 1]],
    [["", 44], ["d", 85], ["space", 1], ["a", 122], ["space", 1]]
  ],
  "completedLoops": 2              // loops used when the level completed (live run included)
}
```

Each frame is `[keys, ticks]`: keys held (`w a s d space r shift f c`, joined by `+`, `""` = none)
for that many 60 Hz simulation ticks. Dialog/briefing screens are skipped automatically.

## Recording

- **In game:** open `index.html?dev=1`, play the level (or an editor playtest), and on the
  DELIVERY SUCCESSFUL panel press **EXPORT SOLUTION (DEV)**. It downloads
  `levelN.solution.json` (or `editor.solution.json`). `window.exportSolution()` in the console
  also prints / copies it. Recording restarts on level start, Q-restart and playtest start.
- **Scripted:** `node tests/harness/recordW1.mjs <levelIndex|all>` drives the World 1 sim and writes
  `w1-l1.json` … `w1-mb.json`. `node tests/harness/recordLevel1.mjs [tests/solutions/w1-l1.json]`
  records First Shift only.

Drop the file here and run `npm test`. World 1 replays also drop the last loop (must fail) and
run a cheap wrong plan for Return Trip, Shift Change, Airlock Relay, and Gatekeeper.
