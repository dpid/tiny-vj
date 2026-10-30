// The parent verifies that the child reached the final exit check. Otherwise a
// premature app.exit(0) (for example, a broken exit-buffer reset) could pass.
if (!process.versions.electron) {
  const { spawnSync } = require('node:child_process');
  const result = spawnSync(require('electron'), [__filename], {
    encoding: 'utf8',
    timeout: 40000,
    killSignal: 'SIGKILL',
  });
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  if (result.error) console.error(result.error.message);
  if (result.status !== 0 || !result.stdout?.includes('TESTING exitnow')) {
    console.error('FAIL kiosk test did not complete all checks and exit normally');
    process.exit(1);
  }
  console.log('PASS parent exit phrase terminates the app');
  process.exit(0);
}

const { app } = require('electron');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const assert = require('node:assert/strict');
const path = require('node:path');
const run = promisify(execFile);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const failures = [];
const check = (name, fn) => {
  try { fn(); console.log('PASS ' + name); }
  catch (error) { failures.push(name); console.error('FAIL ' + name + ': ' + error.message); }
};
setTimeout(() => { console.error('FAIL timed out'); app.exit(2); }, 35000);
app.on('browser-window-created', (_, win) => {
  let blurCount = 0;
  win.on('blur', () => { blurCount++; });
  win.webContents.once('did-finish-load', async () => {
    try {
      // A real mouse moving during the run would interleave with the scripted
      // pointer path, so real (trusted) pointer events are dropped and the test
      // dispatches its own. Keys still take the real main-process route.
      await win.webContents.executeJavaScript(`
        for (const type of ['mousemove', 'mousedown', 'mouseup', 'mouseleave', 'wheel']) {
          window.addEventListener(type, e => { if (e.isTrusted) e.stopImmediatePropagation(); }, true);
        }
      `);
      await delay(1800);
      const send = async event => { win.webContents.sendInputEvent(event); await delay(60); };
      const press = async (keyCode, modifiers = []) => {
        await send({ type: 'keyDown', keyCode, modifiers });
        await send({ type: 'keyUp', keyCode, modifiers });
      };
      const type = async text => { for (const key of text) await press(key); };
      const probe = async () => JSON.parse(await win.webContents.executeJavaScript('render_game_to_text()'));

      check('starts fullscreen and in kiosk mode', () => assert.ok(win.isKiosk() && win.isFullScreen()));
      const cursor = await win.webContents.executeJavaScript(
        "[document.body, document.querySelector('canvas')].map(el => getComputedStyle(el).cursor)");
      check('mouse pointer is hidden', () => assert.deepEqual(cursor, ['none', 'none']));

      const start = await probe();
      check('pointer lock is held', () => assert.equal(start.pointerLocked, true));
      check('audio is running without a click', () => assert.equal(start.audio, 'running'));
      check('the groove is playing', () => assert.ok(start.counts.bass > 0 && start.counts.beat > 0));

      // Sound and light-show behaviour is covered by logic-test.cjs; these checks
      // only prove real keys reach the page through before-input-event.
      const beforeA = await probe();
      await press('a');
      const afterA = await probe();
      check('a real key press plays a drum', () => assert.equal(afterA.counts.drum, beforeA.counts.drum + 1));
      await send({ type: 'keyDown', keyCode: 'q' });
      await delay(400);
      const holdingQ = await probe();
      await send({ type: 'keyUp', keyCode: 'q' });
      await delay(200);
      const releasedQ = await probe();
      check('a real held key sustains its note until the real key-up', () => {
        assert.deepEqual(holdingQ.held, ['KeyQ']);
        assert.deepEqual(releasedQ.held, []);
      });
      await send({ type: 'keyDown', keyCode: 'Space' });
      await delay(300);
      const spaceDown = await probe();
      await send({ type: 'keyUp', keyCode: 'Space' });
      await delay(300);
      const spaceUp = await probe();
      check('real Space held turns vibrato on, and off on its key-up', () => {
        assert.equal(spaceDown.vibrato, true);
        assert.equal(spaceUp.vibrato, false);
      });
      await press('w', ['meta']);
      await delay(200);
      const afterCmdW = await probe();
      check('a Cmd chord on a synth key plays a quick note, not a stuck one', () =>
        assert.deepEqual(afterCmdW.held, []));
      await press('f', ['meta']);
      const afterChord = await probe();
      check('a modifier combination still reaches the page and makes a sound', () =>
        assert.ok(afterChord.counts.drum + afterChord.counts.blip > afterA.counts.drum + afterA.counts.blip));

      const edge = await win.webContents.executeJavaScript(`
        window.dispatchEvent(new MouseEvent('mousemove', { movementX: 1e6, movementY: 1e6, bubbles: true }));
        ({ pointer: __TV.state.pointer, width: innerWidth, height: innerHeight })`);
      check('the locked pointer stops at the screen edge', () =>
        assert.deepEqual(edge.pointer, { x: edge.width - 1, y: edge.height - 1 }));

      const beforeEscape = await probe();
      await press('Escape');
      const cleared = await probe();
      check('a real Escape starts a fresh drawing and blips', () => {
        // The groove may draw one step between the key-up and this probe.
        assert.ok(cleared.drawingSteps <= 1, `${cleared.drawingSteps} steps`);
        assert.equal(cleared.counts.blip, beforeEscape.counts.blip + 1);
      });
      const lockedRightAfterEscape = cleared.pointerLocked;
      console.log('INFO Escape', lockedRightAfterEscape ? 'did not release' : 'released', 'the pointer lock');
      // Chromium refuses to re-lock for a moment after an Escape release.
      let relockMs = 0;
      while (!(await probe()).pointerLocked && relockMs < 5000) { await delay(100); relockMs += 100; }
      console.log('INFO pointer lock re-taken after ~' + relockMs + 'ms');
      const afterEscape = await probe();
      check('pointer lock is re-taken after Escape', () => assert.equal(afterEscape.pointerLocked, true));

      await win.capturePage().then(shot => require('node:fs').writeFileSync(
        process.env.KIOSK_SCREENSHOT || path.join(app.getPath('temp'), 'tiny-vj-kiosk.png'), shot.toPNG()));

      win.close();
      check('window close is blocked', () => assert.equal(win.isDestroyed(), false));
      await type('ex');
      const blursBeforeSpotlight = blurCount;
      console.log('OPENING Spotlight');
      await run('/usr/bin/open', ['-a', '/System/Library/CoreServices/Spotlight.app']);
      await delay(1000);
      check('Spotlight actually stole focus during the test', () => assert.ok(blurCount > blursBeforeSpotlight));
      check('focus returns after opening Spotlight', () => assert.ok(win.isFocused()));
      check('Spotlight does not leave fullscreen', () => assert.ok(win.isKiosk() && win.isFullScreen()));
      await type('itnow');
      check('exit phrase resets when focus is lost', () => assert.equal(win.isDestroyed(), false));
      for (let waited = 0; !(await probe()).pointerLocked && waited < 5000; waited += 100) await delay(100);
      const afterSpotlight = await probe();
      check('pointer lock is re-taken after a focus steal', () => assert.equal(afterSpotlight.pointerLocked, true));

      console.log('RESULT', failures.length ? 'FAILED ' + failures.join(', ') : 'all checks passed');
      if (failures.length) { app.exit(1); return; }
      console.log('TESTING exitnow (process must exit with code 0)');
      await type('exitno');
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'w' });
      await delay(1000);
      console.error('FAIL exit phrase did not terminate app');
      app.exit(1);
    } catch (error) {
      console.error(error);
      app.exit(1);
    }
  });
});
require(path.join(__dirname, '..', 'main.js'));
