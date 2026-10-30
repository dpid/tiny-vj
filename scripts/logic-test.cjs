// Groove, sound and light-show checks in a hidden window, so they run without
// taking over the screen. Keys are sent straight to the page's IPC handler; the real
// before-input-event route and everything kiosk-shaped live in kiosk-test.cjs.
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');

const WIDTH = 1280;
const HEIGHT = 800;
const TIMEOUT_MS = 60000;
const IPC_SETTLE_MS = 30;
const POLL_MS = 50;
const WAIT_LIMIT_MS = 3000;

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const failures = [];
const check = (name, fn) => {
  try { fn(); console.log('PASS ' + name); }
  catch (error) { failures.push(name); console.error('FAIL ' + name + ': ' + error.message); }
};
setTimeout(() => { console.error('FAIL timed out'); app.exit(2); }, TIMEOUT_MS);

app.whenReady().then(async () => {
  // An accessory app never activates, so the terminal keeps focus.
  app.setActivationPolicy('accessory');
  const win = new BrowserWindow({
    show: false,
    width: WIDTH,
    height: HEIGHT,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  await win.loadFile(path.join(__dirname, '..', 'app', 'index.html'));
  try {
    const js = code => win.webContents.executeJavaScript(code);
    const mouse = (type, { x, y }, buttons = 0) => js(`{
      const from = __TV.state.pointer;
      window.dispatchEvent(new MouseEvent('${type}', {
        clientX: ${x}, clientY: ${y}, movementX: ${x} - from.x, movementY: ${y} - from.y,
        buttons: ${buttons}, bubbles: true,
      }));
    }`);
    const press = async code => { win.webContents.send('key-down', code); await delay(IPC_SETTLE_MS); };
    const lift = async code => { win.webContents.send('key-up', code); await delay(IPC_SETTLE_MS); };
    const tap = async code => { await press(code); await lift(code); };
    const scroll = deltaY => js(`window.dispatchEvent(new WheelEvent('wheel', { deltaY: ${deltaY}, cancelable: true }))`);
    const probe = async () => JSON.parse(await js('render_game_to_text()'));
    const waitFor = async (condition) => {
      let snapshot = await probe();
      for (let waited = 0; !condition(snapshot) && waited < WAIT_LIMIT_MS; waited += POLL_MS) {
        await delay(POLL_MS);
        snapshot = await probe();
      }
      return snapshot;
    };

    const start = await probe();
    check('audio is running without a click', () => assert.equal(start.audio, 'running'));
    check('starts on the first groove with the keyboard showing', () => {
      assert.equal(start.groove, 'funk');
      assert.equal(start.panel, 'keyboard');
      assert.equal(start.frozen, false);
    });
    const grooving = await waitFor(s => s.counts.bass > 2 && s.counts.beat > 2 && s.painted > 0);
    check('the groove plays on its own', () => {
      assert.ok(grooving.step > start.step);
      assert.ok(grooving.counts.bass > 2 && grooving.counts.beat > 2, JSON.stringify(grooving.counts));
    });
    check('the drawing draws itself', () => assert.ok(grooving.painted > 0));

    await tap('KeyQ');
    const afterQ = await waitFor(s => s.counts.synth > grooving.counts.synth);
    await tap('KeyP');
    const afterP = await waitFor(s => s.counts.synth > afterQ.counts.synth);
    check('letter-row keys play synth notes, higher to the right', () => {
      assert.equal(afterP.counts.synth, grooving.counts.synth + 2);
      assert.ok(afterP.lastHz.synth > afterQ.lastHz.synth, `${afterQ.lastHz.synth} -> ${afterP.lastHz.synth}`);
    });
    check('a pressed key lights up on the keyboard', () => assert.ok(afterP.lit.includes('KeyP')));
    await tap('Digit1');
    const afterOne = await waitFor(s => s.counts.synth > afterP.counts.synth);
    check('the number row plays an octave above the letter row', () =>
      assert.equal(afterOne.lastHz.synth, Math.round(afterQ.lastHz.synth * 2)));

    await press('KeyE');
    const holding = await waitFor(s => s.floaters.some(f => f.code === 'KeyE' && f.rise > 2));
    await delay(300);
    const stillHolding = await probe();
    check('holding a synth key sustains its note', () => assert.deepEqual(stillHolding.held, ['KeyE']));
    check("a held key's outline floats up, higher the longer it's held", () => {
      const [first, later] = [holding, stillHolding].map(s => s.floaters.find(f => f.code === 'KeyE'));
      assert.ok(first && later && later.rise > first.rise, JSON.stringify([first, later]));
    });
    await lift('KeyE');
    const letGo = await probe();
    check('letting go releases the note with a quarter-second fade', () => {
      assert.deepEqual(letGo.held, []);
      assert.ok(letGo.ringingSeconds > 0.15 && letGo.ringingSeconds <= 0.35, `still ringing ${letGo.ringingSeconds}s`);
    });
    check('the outline lingers while it fades', () => assert.equal(letGo.floaters.length, 1));
    await delay(400);
    const released = await probe();
    check('a quarter second later the note and its outline are gone', () => {
      assert.equal(released.ringingSeconds, 0);
      assert.deepEqual(released.floaters, []);
    });

    const beforeRepeat = await probe();
    await press('KeyY');
    await press('KeyY');
    await press('KeyY');
    const repeated = await probe();
    check('key repeat while held does not restart the note', () => {
      assert.equal(repeated.counts.synth, beforeRepeat.counts.synth + 1);
      assert.equal(repeated.floaters.length, 1);
    });
    await lift('KeyY');
    await waitFor(s => s.floaters.length === 0);
    await press('KeyR');
    await delay(400);
    const ringing = await probe();
    check('a held note keeps ringing', () => assert.deepEqual(ringing.held, ['KeyR']));
    await js(`window.dispatchEvent(new Event('blur'))`);
    const blurred = await waitFor(s => s.floaters.length === 0);
    check('losing focus lets go of held notes', () => assert.deepEqual(blurred.held, []));
    await press('MetaLeft');
    await press('KeyT');
    await lift('MetaLeft');
    const cmdReleased = await waitFor(s => s.floaters.length === 0);
    check('Cmd coming up lets go of notes whose key-ups macOS swallowed', () =>
      assert.deepEqual(cmdReleased.held, []));

    await press('KeyA');
    const afterA = await probe();
    check('home-row keys play drums', () => assert.equal(afterA.counts.drum, afterOne.counts.drum + 1));
    await press('ShiftLeft');
    const afterShift = await probe();
    check('Shift rolls the last drum', () => assert.ok(afterShift.counts.drum >= afterA.counts.drum + 4));

    await press('KeyZ');
    const afterZ = await waitFor(s => s.visitors > 0);
    check('bottom-row keys send a space visitor across with its sound', () => {
      assert.equal(afterZ.counts.visitor, afterShift.counts.visitor + 1);
      assert.ok(afterZ.visitors > 0);
    });

    const beforeSpace = await probe();
    await press('Space');
    const wobbleAlone = await probe();
    check('Space with no note sounding plays a wobble', () => {
      assert.equal(wobbleAlone.counts.vibrato, beforeSpace.counts.vibrato + 1);
      assert.ok(wobbleAlone.lastHz.vibrato > 0);
    });
    await lift('Space');
    await press('KeyU');
    await press('Space');
    await delay(300);
    const vibrating = await probe();
    check('holding Space puts vibrato on a held note', () => {
      assert.equal(vibrating.vibrato, true);
      assert.ok(vibrating.vibratoCents > 30, `${vibrating.vibratoCents} cents`);
      assert.deepEqual(vibrating.held, ['KeyU']);
    });
    await press('KeyI');
    await lift('Space');
    await delay(400);
    const steady = await probe();
    check('letting go of Space steadies the notes again', () => {
      assert.equal(steady.vibrato, false);
      assert.ok(steady.vibratoCents < 2, `${steady.vibratoCents} cents`);
      assert.deepEqual(steady.held.sort(), ['KeyI', 'KeyU']);
    });
    await lift('KeyU');
    await lift('KeyI');
    const afterSpace = await waitFor(s => s.floaters.length === 0);

    await press('F2');
    const afterF2 = await probe();
    check('F-keys switch grooves, with their own tempo', () => {
      assert.equal(afterF2.groove, 'boogie');
      assert.notEqual(afterF2.bpm, afterSpace.bpm);
    });
    const picked = {};
    for (const code of ['F5', 'F9', 'Numpad3', 'Numpad8']) {
      await press(code);
      picked[code] = (await probe()).groove;
    }
    check('F1–F9 and numpad 1–9 pick nine grooves', () => assert.deepEqual(picked, {
      F5: 'reggae', F9: 'lullaby', Numpad3: 'waltz', Numpad8: 'bossa',
    }));
    await press('F10');
    const afterF10 = await probe();
    check('F10 leaves the groove alone', () => assert.equal(afterF10.groove, 'bossa'));

    await press('F1');
    const funk = await probe();
    for (let i = 0; i < 20; i++) await press('ArrowUp');
    const fast = await probe();
    for (let i = 0; i < 20; i++) await press('ArrowDown');
    const slow = await probe();
    check('Up and Down change tempo within safe limits', () => {
      assert.ok(fast.bpm > funk.bpm && slow.bpm < funk.bpm);
      assert.ok(fast.bpm <= 140 && slow.bpm >= 60, `${slow.bpm}..${fast.bpm}`);
      assert.equal(slow.transpose, 0);
    });
    await press('F1');

    await tap('KeyQ');
    const plain = await waitFor(s => s.counts.synth > funk.counts.synth);
    await press('ArrowRight');
    await tap('KeyQ');
    const raised = await waitFor(s => s.counts.synth > plain.counts.synth);
    check('Right transposes everything up a semitone', () => {
      assert.equal(raised.transpose, 1);
      assert.equal(raised.lastHz.synth, Math.round(plain.lastHz.synth * 2 ** (1 / 12)));
    });
    for (let i = 0; i < 30; i++) await press('ArrowLeft');
    const lowest = await probe();
    check('Left transposes down, at most an octave', () => assert.equal(lowest.transpose, -12));
    const beforeLowBass = lowest.counts.bass;
    const lowBass = await waitFor(s => s.counts.bass > beforeLowBass);
    check('the groove bass follows the transpose', () =>
      assert.ok(lowBass.lastHz.bass < 80, `bass at ${lowBass.lastHz.bass}Hz`));
    for (let i = 0; i < 12; i++) await press('ArrowRight');

    const lines = [];
    for (const code of ['Backquote', 'Numpad0', 'Backquote', 'Backquote', 'Backquote']) {
      await press(code);
      lines.push((await probe()).bassLine);
    }
    check('Backquote and numpad 0 cycle five bass lines', () => assert.deepEqual(lines, [1, 2, 3, 4, 0]));
    await press('Backquote');
    await press('F3');
    const waltzLine = await probe();
    const waltzBass = await waitFor(s => s.counts.bass > waltzLine.counts.bass);
    check('bass-line variations also fit the waltz', () => assert.ok(waltzBass.counts.bass > waltzLine.counts.bass));
    for (let i = 0; i < 4; i++) await press('Backquote');
    await press('F1');

    await press('CapsLock');
    await press('Tab');
    await press('Enter');
    const toggled = await probe();
    check('Tab and Enter toggle Rainbow and the Sound Graph', () => {
      assert.equal(toggled.rainbow, true);
      assert.equal(toggled.panel, 'graph');
    });
    const rainbowing = await waitFor(s => s.cycleOffset !== toggled.cycleOffset && s.shapes > 0);
    check('Rainbow cycles colours on the beat', () => assert.notEqual(rainbowing.cycleOffset, toggled.cycleOffset));
    check('the Sound Graph shows shapes for the groove', () => assert.ok(rainbowing.shapes > 0));
    await press('CapsLock');
    await press('Tab');
    await press('Enter');

    const centre = { x: WIDTH / 2, y: HEIGHT / 2 };
    const beforeMouse = await probe();
    await mouse('mousemove', { x: centre.x + 200, y: 40 });
    const top = await waitFor(s => s.counts.mouse > beforeMouse.counts.mouse);
    await delay(400);
    await mouse('mousemove', { x: centre.x - 200, y: HEIGHT - 40 });
    const bottom = await waitFor(s => s.counts.mouse > top.counts.mouse);
    check('moving the mouse plays notes', () => assert.equal(bottom.counts.mouse, beforeMouse.counts.mouse + 2));
    check('high on screen is a high note', () => assert.ok(top.lastHz.mouse > bottom.lastHz.mouse, `${top.lastHz.mouse} vs ${bottom.lastHz.mouse}`));
    check('moving the mouse steers the drawing', () => assert.notEqual(bottom.turtle.turn, beforeMouse.turtle.turn));
    const burst = await probe();
    for (let i = 0; i < 10; i++) await mouse('mousemove', { x: centre.x + i * 20, y: centre.y });
    const afterBurst = await probe();
    check('a burst of movement plays at most one note per sixteenth', () =>
      assert.ok(afterBurst.counts.mouse - burst.counts.mouse <= 2, `${afterBurst.counts.mouse - burst.counts.mouse} notes`));

    const keyCentre = async code => js(`{
      const { x, y } = __TV.keyCenter('${code}');
      const size = __TV.state.cellSize;
      ({ x: (x + 0.5) * size, y: (y + 0.5) * size });
    }`);
    const onScreenQ = await keyCentre('KeyQ');
    await mouse('mousemove', onScreenQ);
    const beforeClick = await probe();
    await mouse('mousedown', onScreenQ, 1);
    await delay(400);
    const clickHeld = await probe();
    check('clicking an on-screen key plays it and holds it while the button is down', () => {
      assert.equal(clickHeld.counts.synth, beforeClick.counts.synth + 1);
      assert.deepEqual(clickHeld.held, ['KeyQ']);
      assert.ok(clickHeld.floaters.some(f => f.code === 'KeyQ'));
    });
    check('clicking a key does not freeze the drawing', () => assert.equal(clickHeld.frozen, false));
    const onScreenW = await keyCentre('KeyW');
    await mouse('mousemove', onScreenW, 1);
    const slid = await probe();
    check('sliding onto the next key lets go of the first and plays the second', () =>
      assert.deepEqual(slid.held, ['KeyW']));
    await mouse('mousemove', centre, 1);
    const slidOff = await probe();
    check('sliding off the keyboard lets go', () => assert.deepEqual(slidOff.held, []));
    await mouse('mousemove', onScreenQ, 1);
    await mouse('mouseup', onScreenQ);
    const clickReleased = await waitFor(s => s.floaters.length === 0);
    check('releasing the button lets go of the note', () => assert.deepEqual(clickReleased.held, []));
    check('none of that froze the drawing', () => assert.equal(clickReleased.frozen, false));
    const onScreenA = await keyCentre('KeyA');
    await mouse('mousemove', onScreenA);
    const beforeDrumClick = await probe();
    await mouse('mousedown', onScreenA, 1);
    await mouse('mouseup', onScreenA);
    const drumClicked = await probe();
    check('clicking an on-screen drum key plays the drum', () =>
      assert.equal(drumClicked.counts.drum, beforeDrumClick.counts.drum + 1));

    await mouse('mousemove', centre);
    await mouse('mousedown', centre, 1);
    await mouse('mouseup', centre);
    const frozen = await probe();
    check('a click freezes the drawing and blips', () => {
      assert.equal(frozen.frozen, true);
      assert.equal(frozen.counts.blip, drumClicked.counts.blip + 1);
    });
    const scrolled = await waitFor(s => s.scrollX > frozen.scrollX + 2);
    check('a frozen drawing scrolls instead of growing', () => {
      assert.ok(scrolled.scrollX > frozen.scrollX);
      assert.equal(scrolled.drawingSteps, frozen.drawingSteps);
    });
    await mouse('mousedown', centre, 1);
    await mouse('mouseup', centre);
    const resumed = await waitFor(s => s.drawingSteps > scrolled.drawingSteps);
    check('a second click resumes drawing', () => {
      assert.equal(resumed.frozen, false);
      assert.ok(resumed.drawingSteps > scrolled.drawingSteps);
    });

    await scroll(120);
    const wheeled = await probe();
    check('the wheel colour-cycles and blips', () => {
      assert.notEqual(wheeled.cycleOffset, resumed.cycleOffset);
      assert.equal(wheeled.counts.blip, resumed.counts.blip + 1);
    });

    await press('Escape');
    const cleared = await probe();
    check('Escape starts a fresh drawing', () => {
      assert.ok(cleared.painted < wheeled.painted, `${wheeled.painted} -> ${cleared.painted}`);
      assert.equal(cleared.drawingSteps, 0);
    });

    const keys = await js(`[${[
      'Escape', 'F1', 'Backquote', 'Digit5', 'Minus', 'Backspace', 'Tab', 'KeyT', 'Backslash',
      'CapsLock', 'KeyG', 'Quote', 'Enter', 'ShiftRight', 'KeyB', 'Slash', 'ControlLeft',
      'AltLeft', 'MetaLeft', 'Space', 'MetaRight', 'AltRight', 'ArrowLeft', 'Numpad5',
    ].map(code => `'${code}'`)}]`);
    const silent = [];
    for (const code of keys) {
      const before = await probe();
      await tap(code);
      const after = await probe();
      const sum = s => Object.values(s.counts).reduce((total, n) => total + n, 0) - s.counts.bass - s.counts.beat;
      if (sum(after) <= sum(before)) silent.push(code);
    }
    check('every key makes a sound', () => assert.deepEqual(silent, []));
  } catch (error) {
    console.error(error);
    failures.push('unexpected error');
  }
  console.log('RESULT', failures.length ? 'FAILED ' + failures.join(', ') : 'all checks passed');
  app.exit(failures.length ? 1 : 0);
});
