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

    await press('KeyQ');
    const afterQ = await waitFor(s => s.counts.synth > grooving.counts.synth);
    await press('KeyP');
    const afterP = await waitFor(s => s.counts.synth > afterQ.counts.synth);
    check('letter-row keys play synth notes, higher to the right', () => {
      assert.equal(afterP.counts.synth, grooving.counts.synth + 2);
      assert.ok(afterP.lastHz.synth > afterQ.lastHz.synth, `${afterQ.lastHz.synth} -> ${afterP.lastHz.synth}`);
    });
    check('a pressed key lights up on the keyboard', () => assert.ok(afterP.lit.includes('KeyP')));
    await press('Digit1');
    const afterOne = await waitFor(s => s.counts.synth > afterP.counts.synth);
    check('the number row plays an octave above the letter row', () =>
      assert.equal(afterOne.lastHz.synth, Math.round(afterQ.lastHz.synth * 2)));

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
    const afterSpace = await probe();
    check('Space bends (or boings)', () => assert.equal(afterSpace.counts.bend, beforeSpace.counts.bend + 1));

    await press('F2');
    const afterF2 = await probe();
    check('F-keys switch grooves, with their own tempo', () => {
      assert.equal(afterF2.groove, 'boogie');
      assert.notEqual(afterF2.bpm, afterSpace.bpm);
    });
    await press('F5');
    const afterF5 = await probe();
    check('F5 picks the first groove again', () => assert.equal(afterF5.groove, 'funk'));
    for (let i = 0; i < 20; i++) await press('ArrowUp');
    const fast = await probe();
    for (let i = 0; i < 20; i++) await press('ArrowDown');
    const slow = await probe();
    check('arrows change tempo within safe limits', () => {
      assert.ok(fast.bpm > afterF5.bpm && slow.bpm < afterF5.bpm);
      assert.ok(fast.bpm <= 140 && slow.bpm >= 80, `${slow.bpm}..${fast.bpm}`);
    });
    await press('F1');

    await press('CapsLock');
    await press('Tab');
    await press('Enter');
    const toggled = await probe();
    check('Caps Lock, Tab and Enter toggle sustain, Rainbow and the Sound Graph', () => {
      assert.equal(toggled.sustain, true);
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

    await mouse('mousedown', centre, 1);
    const frozen = await probe();
    check('a click freezes the drawing and blips', () => {
      assert.equal(frozen.frozen, true);
      assert.equal(frozen.counts.blip, afterBurst.counts.blip + 1);
    });
    const scrolled = await waitFor(s => s.scrollX > frozen.scrollX + 2);
    check('a frozen drawing scrolls instead of growing', () => {
      assert.ok(scrolled.scrollX > frozen.scrollX);
      assert.equal(scrolled.drawingSteps, frozen.drawingSteps);
    });
    await mouse('mousedown', centre, 1);
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
      await press(code);
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
