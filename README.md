# Tiny VJ — Kiosk

A fullscreen, toddler-proof jam-and-light-show screen for macOS, inspired by Ryo Kawasaki's 1984
Commodore 64 program *Kawasaki Rhythm Rocker*. A bass-and-drum groove is always playing; every key
adds a sound and a picture on top of it, and a chunky pixel drawing draws itself in time.

| Input | Sound | Picture |
|-------|-------|---------|
| Letter row (Q…\\) | Synth notes, higher to the right; the note plays while the key is down and fades out over a quarter second when let go | The key lights up and its outline floats up, changing colour, while held, then fades with the note; the drawing takes its colour |
| Number row (1…=) | Bell notes, an octave above the letter row; held keys sustain | Same as the letter row |
| Home row (A…') | Drums | The key lights up |
| Bottom row (Z…/) | Space sounds | A space visitor flies across |
| Space (hold) | Vibrato on every synth note while held (a short wobble if nothing is playing) | The drawing turns; floating outlines wobble |
| Shift | Drum roll on the last drum | — |
| Tab | Blip | Rainbow colour cycling on/off |
| Enter | Blip | Keyboard ↔ Sound Graph |
| F1–F9, numpad 1–9 | Nine grooves: funk, boogie, waltz, space, reggae, disco, electro, bossa, lullaby | — |
| \` (backquote), numpad 0 | Next of five bass lines for the current groove | — |
| Up / Down | Faster / slower | — |
| Right / Left | Transpose everything up / down a semitone (up to an octave each way) | — |
| Escape | Blip | A fresh drawing |
| Any other key | Blip | The key lights up |
| Move the mouse | A note on every sixteenth, pitched by height | Steers the drawing's angle and size |
| Click an on-screen key | Plays that key, held for as long as the button is down; slide to other keys to play them | Same as pressing the key |
| Click anywhere else | Blip | Freeze the drawing and scroll it; click again to resume |
| Scroll wheel | Blip | Colour-cycles everything |

Every note lands on the groove's sixteenth-note grid and in its pentatonic scale, so mashing keys
always sounds musical.

## Run

Requires Node.js 22.12 or newer.

```bash
npm ci
npm start
```

Opens fullscreen on the display containing the pointer.

## Exit (parent only)

Type **`exitnow`**, without modifiers or Enter. The sequence resets when the window loses focus.
For emergency termination from a terminal: `pkill -9 -f TinyVJ`.

## Package a clickable app

```bash
npm run package
```

Produces `build/current/TinyVJ-darwin-arm64/TinyVJ.app` for Apple Silicon, ad-hoc signed (not
notarized). Spotlight finds it there as **TinyVJ**. Developer ID signing and notarization work the
same way as in the sibling `tiny-terminal-kiosk` project (`MAC_SIGN_IDENTITY`,
`MAC_NOTARY_PROFILE`).

## Kiosk protection

Same best-effort containment as `tiny-draw-kiosk`: kiosk mode, claimed Spotlight / Mission Control
/ media shortcuts, always-on-top, a 250ms focus watchdog, and pointer lock. It is practical
containment, not a macOS security boundary. To close the remaining gaps:

- **Desktop & Dock → Hot Corners:** set all four to “–”.
- **Trackpad → More Gestures:** turn off Mission Control, App Exposé, and fullscreen swipes.

## Verification

```bash
npm test
```

Checks the groove, every key's sound and picture, mouse notes, freezing, and colour cycling in a
hidden window, without touching the screen.

```bash
npm run test:kiosk
```

Briefly enters kiosk mode and checks the real keyboard path, pointer lock, close protection,
Spotlight focus recovery, and the exit phrase. Takes over the screen for about 10 seconds and
requires an unlocked graphical session.
