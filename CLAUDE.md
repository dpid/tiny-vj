# Tiny VJ Kiosk

Toddler-proof Electron kiosk: an always-playing groove, a self-drawing pixel light show, and a
keyboard to jam on. Inspired by *Kawasaki Rhythm Rocker* (C64, 1984). Sibling of
`~/Documents/tiny-draw-kiosk`, whose kiosk shell (`main.js`, `preload.js`, packaging, kiosk test)
this one copies.

## Files
| File | Responsibility |
|------|----------------|
| `main.js` | Electron main process: kiosk window, key swallowing + forwarding, exit handling |
| `preload.js` | Exposes `kiosk.onKeyDown` — the page's only source of keyboard input |
| `app/sound.js` | Web Audio SID-style voices, drum kit, grooves, sequencer, live-note quantizing |
| `app/vj.js` | Palette, polyspiral drawing, keyboard / Sound Graph panel, visitors, input, state probe |
| `app/index.html` | Canvas + hidden-cursor styles; loads `sound.js` then `vj.js` (shared globals) |
| `scripts/package.mjs` | Local ad-hoc signing and optional Developer ID signing / notarization |
| `scripts/logic-test.cjs` | Groove, key, mouse and light-show checks in a hidden window |
| `scripts/kiosk-test.cjs` | Full-screen kiosk checks: real key path, pointer lock, focus, exit |

## Run / build
- `npm start` — run in dev via `electron .`
- `npm test` — checks in a hidden window; never takes focus. Takes ~20s because the groove runs in
  real time. Run it after every change.
- `npm run test:kiosk` — takes over the screen for ~10s. Run it for changes to `main.js`,
  `preload.js`, key handling, or pointer-lock / focus handling. Damon has OK'd it taking over his
  screen when needed.
- `npm run package` — build `build/current/TinyVJ-darwin-arm64/TinyVJ.app` (arm64). `build/` is
  gitignored.

## Behaviour
- Key map and mouse behaviour: see the README table — keep it in sync with `onKey` in `app/vj.js`.
- The groove is always on from launch — a settled decision (unlike Tiny Draw, which has no idle
  motion). The drawing draws itself and is replaced every `DRAWING_STEPS` sixteenths.
- Every key makes a sound; keys without a musical job blip. `npm test` checks this.
- Palette is Tiny Draw's bright OKLCH wheel, not the C64's 16 colours — a settled decision.
- Click toggles freeze: the drawing stops and scrolls sideways (the original's Z then M).

## Design notes
- **Rhythm Rocker canon vs. toddler adaptations.** From the original manual: always-on bass and
  drums, piano rows, percussion keys, space visitors, roll on Shift, four grooves on F-keys, tempo on cursor keys, auto-drawing with
  angle/size/width, stop + scroll, Rainbow, Sound Graph. Adaptations: no modes (each keyboard row
  is one of the original's modes), pentatonic instead of chromatic, live notes quantized to
  sixteenths (the original quantized recordings), no recording/dubbing/disk. Expand Color is not
  implemented yet. The original's held-note float (a held key's outline rises, changing colour)
  is in `drawFloaters`; its F1 bass-line cycling is on Backquote / Numpad0.
- **Key-ups need the key-down to reach the page.** If `before-input-event` calls
  `preventDefault()` on a key-down, Chromium never delivers that key's key-up. So `main.js` lets
  plain key-downs through (vj.js blocks their DOM defaults) and swallows only Cmd/Ctrl/Opt chords,
  sending the page an immediate key-up for those. This differs from Tiny Draw, which swallows
  everything and has no use for key-ups. `npm test` can't see this (it sends IPC directly) — only
  `npm run test:kiosk` exercises it.
- **Held notes are a plain keyboard synth — keep them that way.** Key-down starts the note
  immediately (synth keys are NOT quantized), it holds at a flat level, key-up fades it over
  `SYNTH_RELEASE_SECONDS` (0.25s), and its floating outline fades over the same time through
  `FADE_LEVELS` darker palette copies. A key-down for a key already sounding is ignored (key
  repeat). Damon rejected an earlier version with grid-quantized note-on, a minimum note length,
  decay while held and a Caps Lock long release: it sounded like notes kept building and ringing.
  Lost key-ups: release all on window blur and on Cmd's key-up (macOS sends no key-ups for keys
  pressed while Cmd is down); `MAX_HOLD_SECONDS` is the last resort. Pressing the on-screen keyboard
  (`keyUnderPointer`) plays keys like a real one — slide off to release, onto another to play it —
  and never toggles freeze.
- **Grooves and bass lines.** Nine grooves (F1–F9 / Numpad1–9; F3/F4 arrive via `globalShortcut`
  in `main.js`, which claims them). Bass line 0 is the groove's own line; lines 1–4 are
  `BASS_VARIATIONS` in scale degrees for the groove's `barSteps` (16 or 12), so they fit any key.
  Transpose (Left/Right) shifts `rootMidi()`, i.e. everything pitched except drums and visitors.
- **The on-screen keyboard is the flat key rectangles in perspective** — not blocks (Damon's
  call, even though the original's keys had depth). `keyQuad` projects a key's rectangle from
  world space; `camera()` puts the eye at `HORIZON_FRACTION` down the screen (smaller = keys
  tilted more toward the viewer) and derives the keyboard's depth so it exactly fills the panel.
  Floaters are the same rectangle lifted by `floatRise`, so their shape changes as they climb:
  they flatten to a line at eye level, then open out seen from underneath. Click hit-testing uses
  the same quads (`keyUnderPointer`); tests aim clicks with `__TV.keyCenter`.
- **Audio is scheduled ahead; visuals follow it.** The sequencer schedules ~120ms ahead and pushes
  `soundEvents`; `update()` in `vj.js` handles each event once `audio.currentTime` reaches it, so a
  flash lands with its sound. Live notes go to `nextGridTime()`.
- **Pulse waves** are a sawtooth minus a delayed copy of itself; the delay sets the duty cycle and
  an LFO on it gives pulse-width modulation.
- **Hearing safety:** `MASTER_VOLUME` plus a hard limiter; at most `MAX_SYNTH_VOICES` live synth
  notes, oldest stolen.
- **Flashing:** no border and no beat flash (removed at Damon's request); Rainbow shifts hue one
  wheel step per sixteenth rather than strobing. Keep any new effect off full-screen luminance flashes.
- **Colour indices** everywhere (drawing and frame) are 0 = black or 1 + wheel index relative to
  `cycleOffset`, so the wheel and Rainbow recolour everything at once.
- Space is held vibrato (Damon's choice over the original's pitch bend): one shared LFO
  (`vibratoLfo` → `vibratoDepth`) feeds every synth voice's detune; Space's key-down / key-up
  ramp the depth. Shift is a one-shot roll. Only the synth rows and Space act on key-ups.
- State probe: `window.render_game_to_text()` (processes due events first) and `window.__TV`
  (`state`, `sequencer`, `counts`, `colorAt`, `palette`).

## Exit and containment
- **Exit = type `exitnow`** (`EXIT_PHRASE` in `main.js`). **Force-kill = `pkill -9 -f TinyVJ`.**
- Known failure modes of chords, `app.quit()`, media keys and the Spotlight key are documented in
  `~/Documents/tiny-terminal-kiosk/CLAUDE.md`; pointer-lock and Escape details in
  `~/Documents/tiny-draw-kiosk/CLAUDE.md`. They apply unchanged here.

## Testing gotchas
- `npm test` sends keys straight to the page's `key-down` / `key-up` IPC handlers, skipping
  `before-input-event`; the kiosk test covers that route. Use `tap` (down + up) for synth keys
  unless the check is about holding.
- Live notes are quantized, so their counters update immediately but `lastHz` (per voice) is set at
  schedule time too; visual effects (visitors, Sound Graph shapes) appear only once the note's time
  arrives — poll with `waitFor`, don't assert right after a key.
- `open <app>` re-activates a running instance. `pkill -9` first, then launch
  `TinyVJ.app/Contents/MacOS/TinyVJ` directly.
