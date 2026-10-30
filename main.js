const { app, BrowserWindow, Menu, screen, globalShortcut, powerMonitor } = require('electron');
const path = require('path');

// Parent-only exit: type the secret phrase below (no Enter needed). It travels the
// normal key path (which reliably reaches before-input-event), so it sidesteps the
// OS-hotkey / Lock-Screen / modifier-capture problems that break chords. A toddler
// mashing the keyboard will never produce this exact sequence.
const EXIT_PHRASE = 'exitnow';

// Media keys are OS-level system events that never reach before-input-event. The
// Play/Pause key launches Apple Music when nothing is playing. Claiming them as
// global shortcuts turns them into no-ops.
const MEDIA_KEYS = ['MediaPlayPause', 'MediaNextTrack', 'MediaPreviousTrack', 'MediaStop'];

// These shortcuts can be consumed by macOS before before-input-event. Claim
// whichever are available; registration can fail when the OS/another app owns
// them. F4 here is the ordinary function key, NOT Apple's hardware Search key.
const SYSTEM_SHORTCUTS = [
  'Command+Space',
  'Command+Alt+Space',
  'Control+Up',
  'Control+Down',
  'Control+Left',
  'Control+Right',
  'F3',
  'F4',
];

const RECOVERY_INTERVAL_MS = 250;

const MODIFIER_KEYS = ['Meta', 'Control', 'Alt', 'Shift'];

// Pointer lock keeps the hidden OS cursor pinned, so it cannot reach Hot Corners
// or wander onto another display. The page cannot request it itself: keys arrive
// over IPC and mouse movement is not a user activation.
const LOCK_POINTER_SCRIPT =
  'if (!document.pointerLockElement) document.body.requestPointerLock().catch(() => {})';

// The groove must start on launch, before any click or key.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let win = null;
let typedBuffer = '';
let recoveryTimer = null;
let quitting = false;
let sessionLocked = false;
let suspended = false;

function restoreKiosk() {
  if (quitting || sessionLocked || suspended || !win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  if (!win.isVisible()) win.show();
  if (!win.isKiosk()) win.setKiosk(true);
  if (!win.isFullScreen()) win.setFullScreen(true);
  if (!win.isFocused()) {
    // Spotlight and other system panels can steal focus even in kiosk mode.
    // Raising the window alone is insufficient: key input must come back too.
    app.focus({ steal: true });
    win.focus();
    win.webContents.focus();
  }
  // Chromium drops the lock on blur and on Escape; the watchdog re-takes it.
  if (win.isFocused()) win.webContents.executeJavaScript(LOCK_POINTER_SCRIPT, true).catch(() => {});
}

function exitKiosk() {
  quitting = true;
  clearInterval(recoveryTimer);
  globalShortcut.unregisterAll();
  app.exit(0);
}

function createWindow() {
  // Open on whichever display the cursor is currently on, not the primary one.
  const { x, y, width, height } = screen.getDisplayNearestPoint(
    screen.getCursorScreenPoint()
  ).bounds;

  win = new BrowserWindow({
    x,
    y,
    width,
    height,
    kiosk: true,
    fullscreen: true,
    frame: false,
    closable: false,
    minimizable: false,
    maximizable: false,
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: false,
      spellcheck: false,
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver');

  // Defer activation until macOS finishes delivering the focus change. The
  // watchdog also retries if a system overlay briefly refuses activation.
  win.on('blur', () => {
    typedBuffer = '';
    setImmediate(restoreKiosk);
  });
  win.on('minimize', () => setImmediate(restoreKiosk));
  win.on('leave-full-screen', () => setImmediate(restoreKiosk));
  recoveryTimer = setInterval(restoreKiosk, RECOVERY_INTERVAL_MS);

  // The page acts only on keys forwarded here over IPC, key-downs and key-ups (so a held
  // synth key can sustain). Swallowing a key-down also makes Chromium drop its key-up,
  // so plain key-downs pass through (vj.js blocks their defaults in the page). Only
  // chords, which could reach a browser default, are swallowed; their key-up will
  // never come, so the page gets one straight after the key-down.
  win.webContents.on('before-input-event', (event, input) => {
    const code = input.code || input.key;
    const chord = (input.meta || input.control || input.alt) && !MODIFIER_KEYS.includes(input.key);
    if (input.type !== 'keyDown' || chord) event.preventDefault();
    if (input.type === 'keyUp' && input.key !== 'Escape') {
      win.webContents.send('key-up', code);
      return;
    }
    // While the pointer is locked Chromium consumes Escape's key-down to release
    // the lock, so only its key-up arrives here. Acting on key-up works either way.
    if (input.type !== (input.key === 'Escape' ? 'keyUp' : 'keyDown')) return;

    if (!input.isAutoRepeat) {
      win.webContents.send('key-down', code);
      if (chord) win.webContents.send('key-up', code);
    }

    if (input.key && input.key.length === 1 && !input.meta && !input.control && !input.alt) {
      typedBuffer = (typedBuffer + input.key.toLowerCase()).slice(-EXIT_PHRASE.length);
      if (typedBuffer === EXIT_PHRASE) exitKiosk();
    }
  });

  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.on('will-redirect', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  // The only way out is the exit phrase (app.exit) or SIGKILL — block every other
  // close so a kid can't dismiss the window.
  win.on('close', (e) => e.preventDefault());

  win.webContents.on('did-finish-load', () => {
    win.webContents.setVisualZoomLevelLimits(1, 1);
  });

  win.loadFile(path.join(__dirname, 'app', 'index.html'));
}

app.whenReady().then(() => {
  // Removing the menu strips every accelerator (Cmd+R/W/Q-as-menu-item, devtools, etc.).
  Menu.setApplicationMenu(null);
  for (const key of [...MEDIA_KEYS, ...SYSTEM_SHORTCUTS]) {
    // F3 and F4 pick grooves, so a claimed press is passed on to the page as well.
    const handler = /^F\d+$/.test(key)
      ? () => { restoreKiosk(); win?.webContents.send('key-down', key); }
      : restoreKiosk;
    if (!globalShortcut.register(key, handler)) {
      console.warn(`Could not intercept ${key}; macOS or another app may still handle it.`);
    }
  }

  // Never fight the macOS login screen or sleep/wake transition.
  powerMonitor.on('lock-screen', () => { sessionLocked = true; typedBuffer = ''; });
  powerMonitor.on('unlock-screen', () => { sessionLocked = false; restoreKiosk(); });
  powerMonitor.on('suspend', () => { suspended = true; });
  powerMonitor.on('resume', () => { suspended = false; restoreKiosk(); });
  createWindow();
});

app.on('activate', restoreKiosk);

// kiosk mode does not block a normal Cmd+Q on macOS — veto it. (This also blocks a
// graceful SIGTERM, so a force-kill from a terminal must use SIGKILL:
// `pkill -9 -f TinyVJ`.) The exit phrase uses app.exit(), which bypasses this.
app.on('before-quit', (e) => e.preventDefault());

app.on('window-all-closed', () => app.quit());
