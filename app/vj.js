'use strict';

// About the C64's 320-pixel width, whatever the screen.
const TARGET_COLS = 320;
const PANEL_FRACTION = 0.3;
const PANEL_GAP_CELLS = 3;

// Physical layout order, so KEY_STRIDE below scatters neighbouring keys across the
// wheel. Shared with Tiny Draw, so a key has the same colour in both apps.
const KEY_CODES = [
  'Escape', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
  'Backquote', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8',
  'Digit9', 'Digit0', 'Minus', 'Equal', 'Backspace',
  'Tab', 'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP',
  'BracketLeft', 'BracketRight', 'Backslash',
  'CapsLock', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL',
  'Semicolon', 'Quote', 'Enter',
  'ShiftLeft', 'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period',
  'Slash', 'ShiftRight',
  'ControlLeft', 'AltLeft', 'MetaLeft', 'Space', 'MetaRight', 'AltRight',
  'ArrowLeft', 'ArrowUp', 'ArrowDown', 'ArrowRight',
];
const WHEEL_SIZE = KEY_CODES.length;
const KEY_STRIDE = 29;

const SYNTH_HIGH_ROW = KEY_CODES.slice(KEY_CODES.indexOf('Digit1'), KEY_CODES.indexOf('Equal') + 1);
const SYNTH_ROW = KEY_CODES.slice(KEY_CODES.indexOf('KeyQ'), KEY_CODES.indexOf('Backslash') + 1);
const DRUM_ROW = KEY_CODES.slice(KEY_CODES.indexOf('KeyA'), KEY_CODES.indexOf('Quote') + 1);
const VISITOR_ROW = KEY_CODES.slice(KEY_CODES.indexOf('KeyZ'), KEY_CODES.indexOf('Slash') + 1);
const KEYBOARD_ROWS = [SYNTH_HIGH_ROW, SYNTH_ROW, DRUM_ROW, VISITOR_ROW];
// Real keyboard stagger, in key widths, relative to the number row.
const KEYBOARD_STAGGER = [0, 0.5, 0.75, 1.25];
const KEYBOARD_WIDTH_KEYS = 14;
// The on-screen keyboard's flat key rectangles lie on a floor, seen in perspective from
// above and in front. The eye (the horizon) is this far down the screen: higher tilts the
// keys toward the viewer. Held notes floating up flip to their undersides as they cross it.
const HORIZON_FRACTION = 0.1;
// Space between neighbouring keys in a row, as a fraction of a key's width, and between
// rows, as a fraction of a row's depth (larger, since depth is foreshortened on screen).
const KEY_GAP_FRACTION = 0.12;
const ROW_GAP_FRACTION = 0.3;
// Black space between the near row and the bottom of the screen.
const KEYBOARD_BOTTOM_MARGIN_CELLS = 6;
// The number row plays one pentatonic octave above the letter row.
const HIGH_ROW_DEGREE_OFFSET = 5;
// F1–F9 and numpad 1–9 pick the nine grooves (the numpad is for keyboards whose
// F-row sends media shortcuts).
const GROOVE_KEYS = Object.fromEntries(
  GROOVES.flatMap((_, i) => [[`F${i + 1}`, i], [`Numpad${i + 1}`, i]])
);
const BASS_LINE_KEYS = ['Backquote', 'Numpad0'];
const TEMPO_KEYS = { ArrowUp: 1, ArrowDown: -1 };
const TRANSPOSE_KEYS = { ArrowRight: 1, ArrowLeft: -1 };
const BLIP_DEGREES = 10;
const LIT_SECONDS = 0.25;
// Like the original, a held synth key's outline lifts off the keyboard and floats up,
// changing colour, until the key comes up.
// Rising speed and acceleration in cells per second (per second), measured at the near
// row. Fast enough to cross eye level, and flip to showing the key's underside, within a
// few seconds of holding.
const FLOAT_START_SPEED_CELLS = 15;
const FLOAT_ACCELERATION_CELLS = 12;
const FLOAT_HUE_STEPS_PER_SECOND = 20;
// While Space's vibrato is on, floating outlines wobble side to side in time with it.
const FLOAT_WOBBLE_CELLS = 3;
// Darker copies of the wheel, so a released note's outline can fade out with its sound.
const FADE_LEVELS = 3;

// Same palette recipe as Tiny Draw: per hue, the most saturated sRGB colour whose
// OKLCH lightness is in this range, so nothing goes dark.
const MIN_LIGHTNESS = 0.66;
const MAX_LIGHTNESS = 0.96;
const LIGHTNESS_STEP = 0.01;
const MAX_CHROMA = 0.4;
const CHROMA_SEARCH_ITERATIONS = 16;
const BLACK = 0xff000000;
const CHANNEL_MAX = 255;

const WHEEL_PIXELS_PER_STEP = 24;

// The automatic drawing is a polyspiral: draw a line, turn, draw a slightly longer
// one. The original's angle (D), size (F) and wide/narrow (G) keys map onto these.
const TURN_CHOICES = [59, 72, 89, 91, 119, 121, 143, 145, 160, 171];
const GROWTH_CHOICES = [0.5, 1, 1.5, 2.5];
const WIDTH_CHOICES = [1, 2];
const MIN_GROWTH = 0.25;
const MAX_GROWTH = 3;
const SEGMENTS_PER_STEP = 2;
// Like the original, each drawing runs for a while, then a new one replaces it.
const DRAWING_STEPS = 96;
const SPIRAL_MAX_FRACTION = 0.6;
const TURN_DEGREES_PER_PIXEL = 0.01;
const GROWTH_PER_PIXEL = 0.002;
const SPACE_TURN_DEGREES = 90;

const MOUSE_NOTE_MIN_TRAVEL = 6;
const MOUSE_DEGREES = 10;
const POINTER_RADIUS = 2;
const POINTER_PULSE_RADIUS = 4;
const POINTER_PULSE_SECONDS = 0.12;

const VISITOR_SECONDS = 2.5;
const VISITOR_WOBBLE_CELLS = 6;
const VISITOR_WOBBLE_HZ = 1.5;
const SPRITE_SCALE = 2;

const SHAPE_SECONDS = 0.6;
const SHAPE_MAX_RADIUS = 8;
const GRAPH_MIN_HZ = 40;
const GRAPH_MAX_HZ = 3000;

// Original pixel art, '#' = lit. Drawn facing right; mirrored when flying left.
const SPRITES = [
  [
    '....####....',
    '..########..',
    '############',
    '#.##.##.##.#',
    '############',
    '..##....##..',
  ],
  [
    '##..........',
    '###.######..',
    '.##########.',
    '..##########',
    '.##########.',
    '###.######..',
    '##..........',
  ],
  [
    '........###.',
    '....#.######',
    '.#.#########',
    '....#.######',
    '........###.',
  ],
  [
    '.....##.....',
    '....####....',
    '############',
    '..########..',
    '...######...',
    '..###..###..',
    '.##......##.',
  ],
  [
    '.....###....',
    '...#######..',
    '############',
    '...#######..',
    '.....###....',
  ],
];

function oklchToSrgb(lightness, chroma, hueDegrees) {
  const hue = (hueDegrees * Math.PI) / 180;
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (rgb) => rgb.every((channel) => channel >= 0 && channel <= 1);

function maxChroma(lightness, hue) {
  let low = 0;
  let high = MAX_CHROMA;
  for (let i = 0; i < CHROMA_SEARCH_ITERATIONS; i++) {
    const mid = (low + high) / 2;
    if (inGamut(oklchToSrgb(lightness, mid, hue))) low = mid;
    else high = mid;
  }
  return low;
}

function gammaEncode(linear) {
  const encoded = linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, encoded)) * CHANNEL_MAX);
}

function brightestSaturated(hue) {
  let best = { chroma: -1, lightness: MIN_LIGHTNESS };
  for (let lightness = MIN_LIGHTNESS; lightness <= MAX_LIGHTNESS; lightness += LIGHTNESS_STEP) {
    const chroma = maxChroma(lightness, hue);
    if (chroma > best.chroma) best = { chroma, lightness };
  }
  return oklchToSrgb(best.lightness, best.chroma, hue).map(gammaEncode);
}

const WHEEL_RGB = Array.from({ length: WHEEL_SIZE }, (_, i) =>
  brightestSaturated((i * 360) / WHEEL_SIZE)
);
// ImageData is RGBA bytes, i.e. ABGR when viewed as little-endian uint32.
const toPixel = ([r, g, b]) => (BLACK | (b << 16) | (g << 8) | r) >>> 0;
// FADED_PIXELS[0] is the full-brightness wheel; each level after it is darker.
const FADED_PIXELS = Array.from({ length: FADE_LEVELS }, (_, level) =>
  WHEEL_RGB.map((rgb) => toPixel(rgb.map((channel) => Math.round((channel * (FADE_LEVELS - level)) / FADE_LEVELS))))
);

const mod = (n, m) => ((n % m) + m) % m;
const hex = ([r, g, b]) => '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('');
const pick = (choices) => choices[Math.floor(Math.random() * choices.length)];
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function wheelIndexForKey(code) {
  let position = KEY_CODES.indexOf(code);
  if (position < 0) {
    // Keys off the built-in layout (numpad, external keyboards) still get a stable colour.
    position = [...code].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  }
  return mod(position * KEY_STRIDE, WHEEL_SIZE);
}

function wheelIndexForHz(hz) {
  const span = Math.log(GRAPH_MAX_HZ / GRAPH_MIN_HZ);
  return mod(Math.round((Math.log(hz / GRAPH_MIN_HZ) / span) * WHEEL_SIZE), WHEEL_SIZE);
}

const canvas = document.getElementById('screen');
const context = canvas.getContext('2d');

// Every colour on screen, frame and drawing alike, is 0 for black or 1 + a wheel
// index relative to cycleOffset, so the wheel and Rainbow recolour everything at once.
// Indices past the wheel are the same hues at FADE_LEVELS darker steps.
const state = {
  cellSize: 1,
  cols: 0,
  rows: 0,
  frame: new Uint8Array(0),
  drawArea: null,
  panelArea: null,
  drawing: new Uint8Array(0),
  scrollX: 0,
  turtle: null,
  drawingSteps: 0,
  frozen: false,
  rainbow: false,
  panel: 'keyboard',
  cycleOffset: 0,
  lit: new Map(),
  floaters: [],
  visitors: [],
  shapes: [],
  pointer: null,
  pointerColor: 0,
  pointerPulseUntil: 0,
  playingKeys: false,
  mouseKey: null,
  mouseTravel: 0,
  mouseNoteAt: -Infinity,
  wheelRemainder: 0,
};

let image = null;
let pixels = null;

function newDrawing() {
  const { w, h } = state.drawArea;
  state.drawing = new Uint8Array(w * h);
  state.scrollX = 0;
  state.drawingSteps = 0;
  state.turtle = {
    x: w / 2,
    y: h / 2,
    heading: Math.random() * 360,
    turn: pick(TURN_CHOICES),
    growth: pick(GROWTH_CHOICES),
    width: pick(WIDTH_CHOICES),
    length: 1,
    pen: Math.floor(Math.random() * WHEEL_SIZE),
  };
}

function resize() {
  const cellSize = Math.max(1, Math.round(window.innerWidth / TARGET_COLS));
  const cols = Math.ceil(window.innerWidth / cellSize);
  const rows = Math.ceil(window.innerHeight / cellSize);
  const panelH = Math.floor(rows * PANEL_FRACTION);
  Object.assign(state, {
    cellSize,
    cols,
    rows,
    frame: new Uint8Array(cols * rows),
    drawArea: { x: 0, y: 0, w: cols, h: rows - panelH - PANEL_GAP_CELLS },
    panelArea: { x: 0, y: rows - panelH, w: cols, h: panelH },
  });
  // Under pointer lock clientX/Y stay frozen (often at 0,0), so start in the middle.
  state.pointer ??= { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  newDrawing();

  canvas.width = cols;
  canvas.height = rows;
  canvas.style.width = `${cols * cellSize}px`;
  canvas.style.height = `${rows * cellSize}px`;
  image = context.createImageData(cols, rows);
  pixels = new Uint32Array(image.data.buffer);
}

// Drawing coordinates wrap, so a line leaving one edge comes back on the other.
function plotDrawing(x, y, color, width) {
  const { w, h } = state.drawArea;
  for (let dy = 0; dy < width; dy++) {
    for (let dx = 0; dx < width; dx++) {
      state.drawing[mod(y + dy, h) * w + mod(x + dx, w)] = color;
    }
  }
}

function drawSegment() {
  const turtle = state.turtle;
  const radians = (turtle.heading * Math.PI) / 180;
  const toX = turtle.x + turtle.length * Math.cos(radians);
  const toY = turtle.y + turtle.length * Math.sin(radians);
  const color = turtle.pen + 1;
  // Bresenham, so long segments stay unbroken.
  let x = Math.round(turtle.x);
  let y = Math.round(turtle.y);
  const endX = Math.round(toX);
  const endY = Math.round(toY);
  const deltaX = Math.abs(endX - x);
  const deltaY = -Math.abs(endY - y);
  const stepX = x < endX ? 1 : -1;
  const stepY = y < endY ? 1 : -1;
  let error = deltaX + deltaY;
  for (;;) {
    plotDrawing(x, y, color, turtle.width);
    if (x === endX && y === endY) break;
    const doubled = 2 * error;
    if (doubled >= deltaY) { error += deltaY; x += stepX; }
    if (doubled <= deltaX) { error += deltaX; y += stepY; }
  }

  const { w, h } = state.drawArea;
  turtle.x = mod(toX, w);
  turtle.y = mod(toY, h);
  turtle.heading = mod(turtle.heading + turtle.turn, 360);
  turtle.length += turtle.growth;
  if (turtle.length > Math.max(w, h) * SPIRAL_MAX_FRACTION) turtle.length = 1;
  turtle.pen = mod(turtle.pen + 1, WHEEL_SIZE);
}

function onStep(step) {
  if (state.rainbow) state.cycleOffset = mod(state.cycleOffset + 1, WHEEL_SIZE);
  if (state.frozen) {
    // The original's scroll (M): a stopped drawing slides across the screen.
    state.scrollX++;
    return;
  }
  for (let i = 0; i < SEGMENTS_PER_STEP; i++) drawSegment();
  if (++state.drawingSteps >= DRAWING_STEPS) newDrawing();
}

function spawnVisitor(index, color, now) {
  const sprite = SPRITES[index % SPRITES.length];
  const area = state.drawArea;
  const width = sprite[0].length * SPRITE_SCALE;
  const leftToRight = Math.random() < 0.5;
  state.visitors.push({
    sprite,
    color,
    born: now,
    leftToRight,
    fromX: leftToRight ? area.x - width : area.x + area.w,
    toX: leftToRight ? area.x + area.w : area.x - width,
    y: area.y + VISITOR_WOBBLE_CELLS + Math.random() * (area.h - sprite.length * SPRITE_SCALE - 2 * VISITOR_WOBBLE_CELLS),
  });
}

function spawnShape(event, color, now) {
  const area = state.panelArea;
  const x = event.hz
    ? area.x + (Math.log(event.hz / GRAPH_MIN_HZ) / Math.log(GRAPH_MAX_HZ / GRAPH_MIN_HZ)) * area.w
    : area.x + Math.random() * area.w;
  state.shapes.push({
    x: Math.round(clamp(x, area.x, area.x + area.w - 1)),
    y: Math.round(area.y + Math.random() * area.h),
    diamond: !event.hz,
    color,
    born: now,
  });
}

function onSound(event, now) {
  const keyColor = event.tag ? wheelIndexForKey(event.tag) : null;
  const color = keyColor ?? (event.hz ? wheelIndexForHz(event.hz) : wheelIndexForKey(event.drum));
  spawnShape(event, color, now);
  switch (event.voice) {
    case 'synth':
      state.turtle.pen = keyColor;
      if (!state.frozen) drawSegment();
      break;
    case 'visitor':
      spawnVisitor(event.index, keyColor, now);
      break;
    case 'mouse':
      state.pointerColor = color;
      state.pointerPulseUntil = now + POINTER_PULSE_SECONDS;
      break;
    case 'vibrato':
      state.turtle.heading = mod(state.turtle.heading + SPACE_TURN_DEGREES, 360);
      break;
  }
}

function update() {
  const now = audio.currentTime;
  for (let i = 0; i < soundEvents.length;) {
    if (soundEvents[i].time > now) { i++; continue; }
    const [event] = soundEvents.splice(i, 1);
    if (event.type === 'step') onStep(event.step);
    else if (event.type === 'release') {
      const floater = state.floaters.find(({ voiceId }) => voiceId === event.voiceId);
      if (floater) floater.releasedAt = now;
    }
    else onSound(event, now);
  }
  state.visitors = state.visitors.filter((visitor) => now - visitor.born < VISITOR_SECONDS);
  state.shapes = state.shapes.filter((shape) => now - shape.born < SHAPE_SECONDS);
  state.floaters = state.floaters.filter(({ releasedAt }) => !(now - releasedAt >= SYNTH_RELEASE_SECONDS));
  for (const [code, until] of state.lit) if (until <= now) state.lit.delete(code);
}

function fillRect(x, y, w, h, color, clip) {
  const left = Math.max(x, clip.x);
  const top = Math.max(y, clip.y);
  const right = Math.min(x + w, clip.x + clip.w);
  const bottom = Math.min(y + h, clip.y + clip.h);
  for (let row = top; row < bottom; row++) {
    state.frame.fill(color, row * state.cols + left, row * state.cols + Math.max(left, right));
  }
}

function plotFrame(x, y, color, clip) {
  if (x < clip.x || y < clip.y || x >= clip.x + clip.w || y >= clip.y + clip.h) return;
  state.frame[y * state.cols + x] = color;
}

function strokeRect(x, y, w, h, color, clip) {
  fillRect(x, y, w, 1, color, clip);
  fillRect(x, y + h - 1, w, 1, color, clip);
  fillRect(x, y, 1, h, color, clip);
  fillRect(x + w - 1, y, 1, h, color, clip);
}

function plotLine([x0, y0], [x1, y1], color, clip) {
  const deltaX = Math.abs(x1 - x0);
  const deltaY = -Math.abs(y1 - y0);
  const stepX = x0 < x1 ? 1 : -1;
  const stepY = y0 < y1 ? 1 : -1;
  let error = deltaX + deltaY;
  for (let x = x0, y = y0; ;) {
    plotFrame(x, y, color, clip);
    if (x === x1 && y === y1) return;
    const doubled = 2 * error;
    if (doubled >= deltaY) { error += deltaY; x += stepX; }
    if (doubled <= deltaX) { error += deltaX; y += stepY; }
  }
}

// Scanline fill of a convex polygon, sampling each row at its centre.
function fillPolygon(points, color, clip) {
  const ys = points.map(([, y]) => y);
  for (let y = Math.min(...ys); y <= Math.max(...ys); y++) {
    const scan = y + 0.5;
    const xs = [];
    points.forEach(([ax, ay], i) => {
      const [bx, by] = points[(i + 1) % points.length];
      if ((ay <= scan) !== (by <= scan)) xs.push(ax + ((scan - ay) / (by - ay)) * (bx - ax));
    });
    if (xs.length < 2) continue;
    const left = Math.round(Math.min(...xs));
    fillRect(left, y, Math.round(Math.max(...xs)) - left + 1, 1, color, clip);
  }
}

function insidePolygon([x, y], points) {
  let inside = false;
  points.forEach(([ax, ay], i) => {
    const [bx, by] = points[(i + 1) % points.length];
    if ((ay > y) !== (by > y) && x < ax + ((y - ay) / (by - ay)) * (bx - ax)) inside = !inside;
  });
  return inside;
}

// World space: x and y (up) in cells as seen at the near row, z is distance with the near
// row at 1. The eye sits above the middle of the keyboard, at the height that puts the
// near row's front edge a margin above the panel's bottom edge; the keyboard's depth (how far back the
// far row sits) is whatever puts the far row's back edge at the panel's top edge.
function camera() {
  const top = state.panelArea.y;
  const bottom = state.panelArea.y + state.panelArea.h - 1 - KEYBOARD_BOTTOM_MARGIN_CELLS;
  const horizon = Math.round(state.rows * HORIZON_FRACTION);
  const eye = bottom - horizon;
  return { centerX: state.panelArea.x + state.panelArea.w / 2, horizon, eye, depthRatio: eye / (top - horizon) };
}

// A key is a flat rectangle on the floor; `rise` lifts it straight up.
function keyQuad(code, cam, rise = 0, shiftX = 0) {
  const r = KEYBOARD_ROWS.findIndex((row) => row.includes(code));
  const rowDepth = (cam.depthRatio - 1) / KEYBOARD_ROWS.length;
  const keyW = state.panelArea.w / KEYBOARD_WIDTH_KEYS;
  const x0 = (KEYBOARD_STAGGER[r] + KEYBOARD_ROWS[r].indexOf(code) - KEYBOARD_WIDTH_KEYS / 2) * keyW + shiftX;
  const x1 = x0 + keyW * (1 - KEY_GAP_FRACTION);
  const z0 = 1 + (KEYBOARD_ROWS.length - 1 - r) * rowDepth;
  const z1 = z0 + rowDepth * (1 - ROW_GAP_FRACTION);
  const project = (x, z) => [Math.round(cam.centerX + x / z), Math.round(cam.horizon + (cam.eye - rise) / z)];
  return [project(x0, z0), project(x1, z0), project(x1, z1), project(x0, z1)];
}

function strokePolygon(points, color, clip) {
  points.forEach((point, i) => plotLine(point, points[(i + 1) % points.length], color, clip));
}

function drawKeyboard(now) {
  const area = state.panelArea;
  const cam = camera();
  for (const code of KEYBOARD_ROWS.flat()) {
    const quad = keyQuad(code, cam);
    const color = wheelIndexForKey(code) + 1;
    const held = state.floaters.some((floater) => floater.code === code && floater.releasedAt === undefined);
    if (held || state.lit.get(code) > now) fillPolygon(quad, color, area);
    else strokePolygon(quad, color, area);
  }
}

// Height above the keyboard, in world cells.
function floatRise(floater, now) {
  const age = now - floater.born;
  return FLOAT_START_SPEED_CELLS * age + (FLOAT_ACCELERATION_CELLS * age ** 2) / 2;
}

// Held notes rise as flat key outlines in the same perspective, so their shape changes as
// they go: they flatten toward eye level, squash to a line at it, then open out again
// seen from underneath. Black inside, so they read in front of the drawing.
function drawFloaters(now) {
  const screen = { x: 0, y: 0, w: state.cols, h: state.rows };
  const cam = camera();
  for (const floater of state.floaters) {
    const wobble = sequencer.vibrato ? Math.sin(now * VIBRATO_HZ * 2 * Math.PI) * FLOAT_WOBBLE_CELLS : 0;
    const quad = keyQuad(floater.code, cam, floatRise(floater, now), wobble);
    const hue = mod(floater.color + Math.floor((now - floater.born) * FLOAT_HUE_STEPS_PER_SECOND), WHEEL_SIZE);
    const fade = floater.releasedAt === undefined
      ? 0
      : Math.min(FADE_LEVELS - 1, Math.floor(((now - floater.releasedAt) / SYNTH_RELEASE_SECONDS) * FADE_LEVELS));
    fillPolygon(quad, 0, screen);
    strokePolygon(quad, fade * WHEEL_SIZE + hue + 1, screen);
  }
}

function keyCenter(code) {
  const quad = keyQuad(code, camera());
  const sum = quad.reduce(([sx, sy], [x, y]) => [sx + x, sy + y], [0, 0]);
  return { x: sum[0] / quad.length, y: sum[1] / quad.length };
}

// The original's Sound Graph: squares for notes, diamonds for drums.
function drawSoundGraph(now) {
  const area = state.panelArea;
  for (const shape of state.shapes) {
    const radius = Math.round(1 + ((now - shape.born) / SHAPE_SECONDS) * SHAPE_MAX_RADIUS);
    const color = shape.color + 1;
    if (!shape.diamond) {
      strokeRect(shape.x - radius, shape.y - radius, 2 * radius + 1, 2 * radius + 1, color, area);
      continue;
    }
    for (let d = 0; d <= radius; d++) {
      plotFrame(shape.x - radius + d, shape.y - d, color, area);
      plotFrame(shape.x + radius - d, shape.y - d, color, area);
      plotFrame(shape.x - radius + d, shape.y + d, color, area);
      plotFrame(shape.x + radius - d, shape.y + d, color, area);
    }
  }
}

function drawVisitors(now) {
  const clip = { x: 0, y: 0, w: state.cols, h: state.rows };
  for (const visitor of state.visitors) {
    const age = (now - visitor.born) / VISITOR_SECONDS;
    const left = Math.round(visitor.fromX + (visitor.toX - visitor.fromX) * age);
    const top = Math.round(visitor.y + Math.sin(age * VISITOR_SECONDS * VISITOR_WOBBLE_HZ * 2 * Math.PI) * VISITOR_WOBBLE_CELLS);
    const width = visitor.sprite[0].length;
    visitor.sprite.forEach((line, row) => {
      for (let col = 0; col < width; col++) {
        const source = visitor.leftToRight ? col : width - 1 - col;
        if (line[source] !== '#') continue;
        fillRect(left + col * SPRITE_SCALE, top + row * SPRITE_SCALE, SPRITE_SCALE, SPRITE_SCALE, visitor.color + 1, clip);
      }
    });
  }
}

function drawPointer(now) {
  const x = Math.floor(state.pointer.x / state.cellSize);
  const y = Math.floor(state.pointer.y / state.cellSize);
  const radius = now < state.pointerPulseUntil ? POINTER_PULSE_RADIUS : POINTER_RADIUS;
  const screen = { x: 0, y: 0, w: state.cols, h: state.rows };
  for (let dy = -radius; dy <= radius; dy++) {
    const span = radius - Math.abs(dy);
    fillRect(x - span, y + dy, 2 * span + 1, 1, state.pointerColor + 1, screen);
  }
}

function render() {
  update();
  const now = audio.currentTime;
  const { frame, cols, drawArea } = state;
  frame.fill(0);
  for (let y = 0; y < drawArea.h; y++) {
    const source = y * drawArea.w;
    const target = (drawArea.y + y) * cols + drawArea.x;
    for (let x = 0; x < drawArea.w; x++) {
      frame[target + x] = state.drawing[source + mod(x - state.scrollX, drawArea.w)];
    }
  }
  if (state.panel === 'keyboard') drawKeyboard(now);
  else drawSoundGraph(now);
  drawFloaters(now);
  drawVisitors(now);
  drawPointer(now);

  for (let i = 0; i < frame.length; i++) {
    const color = frame[i];
    if (!color) {
      pixels[i] = BLACK;
      continue;
    }
    const index = color - 1;
    const fade = Math.floor(index / WHEEL_SIZE);
    pixels[i] = FADED_PIXELS[fade][mod(index - fade * WHEEL_SIZE + state.cycleOffset, WHEEL_SIZE)];
  }
  context.putImageData(image, 0, 0);
}

function frameLoop() {
  render();
  requestAnimationFrame(frameLoop);
}

const blipDegree = (code) => wheelIndexForKey(code) % BLIP_DEGREES;

function holdNote(code, voiceId) {
  if (voiceId === null) return;
  state.floaters.push({ code, voiceId, color: wheelIndexForKey(code), born: audio.currentTime });
}

function onKey(code) {
  state.lit.set(code, audio.currentTime + LIT_SECONDS);
  const rows = [
    [SYNTH_ROW, (i) => holdNote(code, startSynth(i, 'lead', code))],
    [SYNTH_HIGH_ROW, (i) => holdNote(code, startSynth(i + HIGH_ROW_DEGREE_OFFSET, 'bell', code))],
    [DRUM_ROW, (i) => playDrumKey(i, code)],
    [VISITOR_ROW, (i) => playVisitor(i, code)],
  ];
  for (const [row, play] of rows) {
    const index = row.indexOf(code);
    if (index >= 0) { play(index); return; }
  }

  if (code === 'Space') { startVibrato(code); return; }
  if (code === 'ShiftLeft' || code === 'ShiftRight') { roll(code); return; }

  playBlip(blipDegree(code), code);
  if (code in GROOVE_KEYS) setGroove(GROOVE_KEYS[code]);
  else if (BASS_LINE_KEYS.includes(code)) nextBassLine();
  else if (code in TEMPO_KEYS) nudgeTempo(TEMPO_KEYS[code]);
  else if (code in TRANSPOSE_KEYS) transpose(TRANSPOSE_KEYS[code]);
  else if (code === 'Tab') state.rainbow = !state.rainbow;
  else if (code === 'Enter') state.panel = state.panel === 'keyboard' ? 'graph' : 'keyboard';
  else if (code === 'Escape') {
    state.frozen = false;
    newDrawing();
  }
}

function keyUnderPointer() {
  if (state.panel !== 'keyboard') return null;
  const point = [Math.floor(state.pointer.x / state.cellSize), Math.floor(state.pointer.y / state.cellSize)];
  const cam = camera();
  return KEYBOARD_ROWS.flat().find((code) => insidePolygon(point, keyQuad(code, cam))) ?? null;
}

function onPointer(event) {
  const from = state.pointer;
  if (document.pointerLockElement) {
    state.pointer = {
      x: clamp(from.x + event.movementX, 0, window.innerWidth - 1),
      y: clamp(from.y + event.movementY, 0, window.innerHeight - 1),
    };
  } else {
    state.pointer = { x: event.clientX, y: event.clientY };
  }
  const moveX = state.pointer.x - from.x;
  const moveY = state.pointer.y - from.y;

  if (event.type === 'mousedown') {
    // Pressing on the on-screen keyboard plays keys, held for as long as the button is.
    const key = keyUnderPointer();
    if (key) {
      state.playingKeys = true;
      state.mouseKey = key;
      onKey(key);
      return;
    }
    // The original's stop (Z) and scroll (M), on one click; the next click resumes.
    state.frozen = !state.frozen;
    playBlip(state.frozen ? 0 : BLIP_DEGREES / 2);
    return;
  }
  if (state.playingKeys) {
    // event.buttons catches a mouseup lost to a focus steal.
    const key = event.type === 'mouseup' || !event.buttons ? null : keyUnderPointer();
    // Sliding off a key lets it go; sliding onto another plays that one, like running a
    // finger along a real keyboard.
    if (key !== state.mouseKey) {
      if (state.mouseKey) releaseSynth(state.mouseKey);
      state.mouseKey = key;
      if (key) onKey(key);
    }
    if (event.type === 'mouseup' || !event.buttons) state.playingKeys = false;
    return;
  }
  if (event.type === 'mouseup') return;

  // Steering the drawing is the original's angle (D) and size (F) keys, made continuous.
  state.turtle.turn = mod(state.turtle.turn + moveX * TURN_DEGREES_PER_PIXEL, 360);
  state.turtle.growth = clamp(state.turtle.growth + moveY * GROWTH_PER_PIXEL, MIN_GROWTH, MAX_GROWTH);

  // Movement plays one note per sixteenth, pitched by height: high on screen, high note.
  state.mouseTravel += Math.abs(moveX) + Math.abs(moveY);
  if (state.mouseTravel < MOUSE_NOTE_MIN_TRAVEL || state.mouseNoteAt > audio.currentTime) return;
  state.mouseTravel = 0;
  const height = 1 - state.pointer.y / window.innerHeight;
  state.mouseNoteAt = playMouseNote(Math.min(MOUSE_DEGREES - 1, Math.floor(height * MOUSE_DEGREES)));
}

for (const type of ['mousemove', 'mousedown', 'mouseup']) {
  window.addEventListener(type, onPointer);
}

window.addEventListener('wheel', (event) => {
  event.preventDefault();
  state.wheelRemainder += event.deltaY;
  const steps = Math.trunc(state.wheelRemainder / WHEEL_PIXELS_PER_STEP);
  if (!steps) return;
  state.wheelRemainder -= steps * WHEEL_PIXELS_PER_STEP;
  state.cycleOffset = mod(state.cycleOffset + steps, WHEEL_SIZE);
  // One blip per event, not per step: a fast flick spanning several steps would
  // otherwise sound as a chord.
  playBlip(state.cycleOffset % BLIP_DEGREES);
}, { passive: false });

// main.js lets plain key-downs reach the page (so their key-ups arrive) and forwards
// them over IPC; their DOM defaults (Tab focus, Space scrolling) must not run.
for (const type of ['keydown', 'contextmenu', 'dragstart', 'selectstart']) {
  window.addEventListener(type, (event) => event.preventDefault());
}

window.kiosk.onKeyDown(onKey);
window.kiosk.onKeyUp((code) => {
  // macOS sends no key-ups for keys pressed while Cmd is down, so Cmd coming up is the
  // last chance to let go of them.
  if (code === 'MetaLeft' || code === 'MetaRight') releaseAllSynth();
  else if (code === 'Space') stopVibrato();
  else releaseSynth(code);
});
// Key-ups can't arrive while another app has focus; let go of everything.
window.addEventListener('blur', () => {
  releaseAllSynth();
  stopVibrato();
});
window.addEventListener('resize', resize);
resize();
startGroove();
frameLoop();

function colorAt(col, row) {
  const color = state.frame[row * state.cols + col];
  return color ? hex(WHEEL_RGB[mod(color - 1 + state.cycleOffset, WHEEL_SIZE)]) : null;
}

window.render_game_to_text = () => {
  render();
  return JSON.stringify({
    cols: state.cols,
    rows: state.rows,
    cellSize: state.cellSize,
    audio: audio.state,
    groove: groove().name,
    bpm: sequencer.bpm,
    transpose: sequencer.transpose,
    vibrato: sequencer.vibrato,
    vibratoCents: Math.round(vibratoDepth.gain.value),
    bassLine: sequencer.bassLine,
    held: [...heldSynth.keys()],
    floaters: state.floaters.map((floater) => ({ code: floater.code, rise: floatRise(floater, audio.currentTime) })),
    step: sequencer.step,
    ringingSeconds: Math.max(0, ...activeSynth.map(({ stopAt }) => stopAt - audio.currentTime)),
    frozen: state.frozen,
    rainbow: state.rainbow,
    panel: state.panel,
    cycleOffset: state.cycleOffset,
    scrollX: state.scrollX,
    drawingSteps: state.drawingSteps,
    painted: state.drawing.reduce((count, cell) => count + (cell ? 1 : 0), 0),
    turtle: { turn: state.turtle.turn, growth: state.turtle.growth, width: state.turtle.width },
    lit: [...state.lit.keys()],
    visitors: state.visitors.length,
    shapes: state.shapes.length,
    pointer: state.pointer,
    pointerLocked: document.pointerLockElement !== null,
    counts,
    lastHz,
  });
};
window.__TV = { state, sequencer, counts, colorAt, keyCenter, palette: WHEEL_RGB.map(hex) };
