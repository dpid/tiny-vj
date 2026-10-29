'use strict';

const SEMITONES_PER_OCTAVE = 12;
const A4_MIDI = 69;
const A4_HZ = 440;
const midiToHz = (midi) => A4_HZ * 2 ** ((midi - A4_MIDI) / SEMITONES_PER_OCTAVE);

// Small ears: a low ceiling, and a hard limiter so a key-mash pile-up can't get loud.
const MASTER_VOLUME = 0.5;
const LIMITER_THRESHOLD_DB = -14;
const LIMITER_RATIO = 20;
const LIMITER_ATTACK_SECONDS = 0.002;
const LIMITER_RELEASE_SECONDS = 0.2;

const SILENCE = 0.0001;
const STOP_PADDING_SECONDS = 0.05;
const NOISE_SECONDS = 1;
// Noise "pitch" is a playback rate relative to this.
const NOISE_BASE_HZ = 1000;

const LOOKAHEAD_SECONDS = 0.12;
const SCHEDULER_INTERVAL_MS = 25;
const START_DELAY_SECONDS = 0.1;
const STEPS_PER_BEAT = 4;
const SECONDS_PER_MINUTE = 60;
const MIN_BPM = 84;
const MAX_BPM = 138;
const BPM_STEP = 6;

const GROOVE_DRUM_LEVEL = 0.6;
const BASS_GATE = 0.9;
const BASS_MAX_STEPS = 4;

// Live synth voices beyond this steal the oldest, SID-style, so a key mash stays a
// tune instead of a smear.
const MAX_SYNTH_VOICES = 4;
const STEAL_FADE_SECONDS = 0.01;
const SYNTH_NOTE_STEPS = 2;
const SUSTAIN_NOTE_STEPS = 8;
const SYNTH_OCTAVE_ABOVE_ROOT = 12;
const MOUSE_OCTAVES_ABOVE_ROOT = 24;
const BLIP_OCTAVES_ABOVE_ROOT = 24;
const BLIP_SECONDS = 0.09;

const BEND_CENTS = 200;
const BEND_UP_SECONDS = 0.12;
const BEND_DOWN_SECONDS = 0.35;
const ROLL_HITS = 4;
const ROLL_HITS_PER_STEP = 2;

const MINOR_PENTATONIC = [0, 3, 5, 7, 10];
const MAJOR_PENTATONIC = [0, 2, 4, 7, 9];

const PATCHES = {
  lead: {
    wave: 'pulse', width: 0.25, pwmHz: 3, pwmDepth: 0.15,
    attack: 0.005, sustain: 0.6, release: 0.15, volume: 0.16, filterHz: 3200, filterQ: 4,
  },
  bell: {
    wave: 'triangle', vibratoHz: 6, vibratoCents: 18,
    attack: 0.002, sustain: 0.4, release: 0.4, volume: 0.3,
  },
  blip: { wave: 'square', attack: 0.002, sustain: 0.5, release: 0.04, volume: 0.1 },
  boing: { wave: 'triangle', attack: 0.002, sustain: 0.5, release: 0.1, volume: 0.3 },
};

// Hand-written in the spirit of the original's four built-in funk bass lines. Bass
// entries are semitones above the root (null = rest); drum lanes use 'x' for a hit.
const GROOVES = [
  {
    name: 'funk', bpm: 108, rootMidi: 40, scale: MINOR_PENTATONIC, steps: 16,
    bass: [0, null, null, 12, null, null, 0, null, 3, null, 5, null, 7, null, 10, 12],
    bassPatch: {
      wave: 'pulse', width: 0.35, attack: 0.003, sustain: 0.4, release: 0.1, volume: 0.3,
      filterHz: 600, filterEnvHz: 2000, filterQ: 6,
    },
    drums: {
      kick: 'x.....x...x.....',
      snare: '....x.......x..x',
      hat: 'x.x.x.x.x.x.x...',
      open: '..............x.',
    },
  },
  {
    name: 'boogie', bpm: 120, rootMidi: 45, scale: MAJOR_PENTATONIC, steps: 16,
    bass: [0, null, 4, null, 7, null, 9, null, 10, null, 9, null, 7, null, 4, null],
    bassPatch: {
      wave: 'sawtooth', attack: 0.004, sustain: 0.6, release: 0.08, volume: 0.2,
      filterHz: 1200, filterQ: 2,
    },
    drums: {
      kick: 'x.......x.......',
      snare: '....x.......x...',
      hat: 'x.xxx.xxx.xxx.xx',
      open: '................',
    },
  },
  {
    name: 'waltz', bpm: 96, rootMidi: 38, scale: MAJOR_PENTATONIC, steps: 24,
    bass: [
      0, null, null, null, 7, null, null, null, 7, null, null, null,
      -5, null, null, null, 2, null, null, null, 2, null, null, null,
    ],
    bassPatch: { wave: 'triangle', attack: 0.004, sustain: 0.7, release: 0.2, volume: 0.4 },
    drums: {
      kick: 'x...........x...........',
      snare: '........................',
      hat: '....x...x.......x...x...',
      open: '..........x...........x.',
    },
  },
  {
    name: 'space', bpm: 90, rootMidi: 36, scale: MINOR_PENTATONIC, steps: 16,
    bass: [0, null, null, null, null, null, null, 0, null, null, 3, null, null, null, -2, null],
    bassPatch: {
      wave: 'pulse', width: 0.5, pwmHz: 0.5, pwmDepth: 0.3,
      attack: 0.01, sustain: 0.8, release: 0.2, volume: 0.25, filterHz: 800, filterQ: 3,
    },
    drums: {
      kick: 'x......x..x.....',
      snare: '........x.......',
      hat: 'x.x.x.x.x.x.x.x.',
      open: '......x.........',
    },
  },
];

const DRUMS = {
  kick: { tones: [{ wave: 'triangle', from: 160, to: 42, sweep: 0.12 }], decay: 0.3, volume: 0.7 },
  snare: {
    tones: [{ wave: 'triangle', from: 240, to: 170, sweep: 0.06 }],
    noise: { type: 'bandpass', hz: 3000, q: 0.7 }, decay: 0.18, volume: 0.4,
  },
  hat: { noise: { type: 'highpass', hz: 7000, q: 0.7 }, decay: 0.04, volume: 0.25 },
  open: { noise: { type: 'highpass', hz: 6000, q: 0.7 }, decay: 0.3, volume: 0.18 },
  clap: { noise: { type: 'bandpass', hz: 1400, q: 1.2 }, decay: 0.16, volume: 0.5 },
  tomLow: { tones: [{ wave: 'triangle', from: 190, to: 95, sweep: 0.2 }], decay: 0.3, volume: 0.5 },
  tomMid: { tones: [{ wave: 'triangle', from: 280, to: 150, sweep: 0.2 }], decay: 0.28, volume: 0.5 },
  tomHigh: { tones: [{ wave: 'triangle', from: 400, to: 220, sweep: 0.2 }], decay: 0.25, volume: 0.5 },
  cowbell: {
    tones: [{ wave: 'square', from: 560, to: 540, sweep: 0.2 }, { wave: 'square', from: 830, to: 810, sweep: 0.2 }],
    decay: 0.2, volume: 0.1,
  },
  rim: { tones: [{ wave: 'square', from: 1800, to: 1600, sweep: 0.02 }], decay: 0.04, volume: 0.12 },
  crash: { noise: { type: 'highpass', hz: 3500, q: 0.7 }, decay: 0.9, volume: 0.15 },
};
// Home row, left to right.
const DRUM_KIT = ['kick', 'snare', 'hat', 'open', 'clap', 'tomLow', 'tomMid', 'tomHigh', 'cowbell', 'rim', 'crash'];

// One sound per space visitor (bottom row, left to right).
const VISITOR_SOUNDS = [
  { wave: 'pulse', width: 0.25, from: 1800, to: 150, seconds: 0.3 },
  { wave: 'triangle', from: 180, to: 1500, seconds: 0.5 },
  { wave: 'square', from: 600, to: 600, seconds: 0.8, vibratoHz: 10, vibratoCents: 400 },
  { wave: 'noise', from: 300, to: 3000, seconds: 0.7 },
  { wave: 'triangle', from: 400, to: 1200, seconds: 0.2 },
  { wave: 'sawtooth', from: 500, to: 500, seconds: 1, vibratoHz: 3, vibratoCents: 500, filterHz: 2000, filterQ: 1 },
  { wave: 'square', from: 2400, to: 600, seconds: 0.2 },
  { wave: 'triangle', from: 1200, to: 120, seconds: 0.9 },
  { wave: 'pulse', width: 0.1, from: 2000, to: 3000, seconds: 0.12, vibratoHz: 20, vibratoCents: 100 },
  { wave: 'noise', from: 900, to: 60, seconds: 0.8 },
];
const VISITOR_VOLUME = 0.14;

const audio = new AudioContext();
const master = audio.createGain();
master.gain.value = MASTER_VOLUME;
const limiter = audio.createDynamicsCompressor();
limiter.threshold.value = LIMITER_THRESHOLD_DB;
limiter.knee.value = 0;
limiter.ratio.value = LIMITER_RATIO;
limiter.attack.value = LIMITER_ATTACK_SECONDS;
limiter.release.value = LIMITER_RELEASE_SECONDS;
master.connect(limiter).connect(audio.destination);

const noiseBuffer = audio.createBuffer(1, audio.sampleRate * NOISE_SECONDS, audio.sampleRate);
noiseBuffer.getChannelData(0).forEach((_, i, data) => { data[i] = Math.random() * 2 - 1; });

const sequencer = {
  groove: 0,
  bpm: GROOVES[0].bpm,
  step: 0,
  nextStepTime: 0,
  sustain: false,
  lastDrum: 'snare',
};
const counts = { bass: 0, beat: 0, synth: 0, drum: 0, visitor: 0, mouse: 0, blip: 0, bend: 0 };
// Per voice, so the test can tell a key's pitch from the groove's bass.
const lastHz = {};
let activeSynth = [];

// Audio is scheduled ahead of time; the visuals drain these as their time comes up,
// so a flash lands with its sound rather than when the key was pressed.
const soundEvents = [];
function emit(event) {
  soundEvents.push(event);
  if (event.hz) lastHz[event.voice] = Math.round(event.hz);
}

const stepSeconds = () => SECONDS_PER_MINUTE / sequencer.bpm / STEPS_PER_BEAT;
const groove = () => GROOVES[sequencer.groove];

function scaleMidi(baseMidi, degree) {
  const { scale } = groove();
  const octave = Math.floor(degree / scale.length);
  return baseMidi + scale[degree - octave * scale.length] + SEMITONES_PER_OCTAVE * octave;
}

function createSource(hz, patch) {
  if (patch.wave === 'noise') {
    const node = audio.createBufferSource();
    node.buffer = noiseBuffer;
    node.loop = true;
    node.playbackRate.value = hz / NOISE_BASE_HZ;
    return { output: node, pitch: node.playbackRate, pitchPerHz: 1 / NOISE_BASE_HZ, detune: node.detune, nodes: [node] };
  }
  const osc = audio.createOscillator();
  osc.type = patch.wave === 'pulse' ? 'sawtooth' : patch.wave;
  osc.frequency.value = hz;
  const source = { output: osc, pitch: osc.frequency, pitchPerHz: 1, detune: osc.detune, nodes: [osc] };
  if (patch.wave !== 'pulse') return source;

  // A pulse is a sawtooth minus a delayed copy of itself; the delay sets the duty
  // cycle, so modulating it gives the SID's pulse-width sweep.
  const delay = audio.createDelay();
  delay.delayTime.value = patch.width / hz;
  const invert = audio.createGain();
  invert.gain.value = -1;
  const sum = audio.createGain();
  osc.connect(sum);
  osc.connect(delay).connect(invert).connect(sum);
  if (patch.pwmHz) {
    const lfo = audio.createOscillator();
    lfo.frequency.value = patch.pwmHz;
    const depth = audio.createGain();
    depth.gain.value = (patch.pwmDepth * patch.width) / hz;
    lfo.connect(depth).connect(delay.delayTime);
    source.nodes.push(lfo);
  }
  source.output = sum;
  return source;
}

function playTone(time, hz, patch, holdSeconds, glideToHz = hz) {
  const source = createSource(hz, patch);
  const end = time + holdSeconds;
  const stopAt = end + patch.release + STOP_PADDING_SECONDS;
  if (glideToHz !== hz) {
    source.pitch.setValueAtTime(hz * source.pitchPerHz, time);
    source.pitch.exponentialRampToValueAtTime(glideToHz * source.pitchPerHz, end);
  }
  if (patch.vibratoHz) {
    const lfo = audio.createOscillator();
    lfo.frequency.value = patch.vibratoHz;
    const depth = audio.createGain();
    depth.gain.value = patch.vibratoCents;
    lfo.connect(depth).connect(source.detune);
    source.nodes.push(lfo);
  }

  let output = source.output;
  if (patch.filterHz) {
    const filter = audio.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = patch.filterQ;
    filter.frequency.setValueAtTime(patch.filterHz + (patch.filterEnvHz ?? 0), time);
    filter.frequency.exponentialRampToValueAtTime(patch.filterHz, end);
    output = output.connect(filter);
  }

  const gain = audio.createGain();
  gain.gain.setValueAtTime(SILENCE, time);
  gain.gain.exponentialRampToValueAtTime(patch.volume, time + patch.attack);
  gain.gain.exponentialRampToValueAtTime(patch.volume * patch.sustain, Math.max(end, time + patch.attack));
  gain.gain.exponentialRampToValueAtTime(SILENCE, end + patch.release);
  output.connect(gain).connect(master);

  for (const node of source.nodes) {
    node.start(time);
    node.stop(stopAt);
  }
  return { gain, detune: source.detune, time, stopAt };
}

function playDrum(name, time, level = 1) {
  const drum = DRUMS[name];
  const end = time + drum.decay;
  const gain = audio.createGain();
  gain.gain.setValueAtTime(drum.volume * level, time);
  gain.gain.exponentialRampToValueAtTime(SILENCE, end);
  gain.connect(master);
  for (const tone of drum.tones ?? []) {
    const osc = audio.createOscillator();
    osc.type = tone.wave;
    osc.frequency.setValueAtTime(tone.from, time);
    osc.frequency.exponentialRampToValueAtTime(tone.to, time + tone.sweep);
    osc.connect(gain);
    osc.start(time);
    osc.stop(end + STOP_PADDING_SECONDS);
  }
  if (drum.noise) {
    const noise = audio.createBufferSource();
    noise.buffer = noiseBuffer;
    const filter = audio.createBiquadFilter();
    filter.type = drum.noise.type;
    filter.frequency.value = drum.noise.hz;
    filter.Q.value = drum.noise.q;
    noise.connect(filter).connect(gain);
    noise.start(time);
    noise.stop(end + STOP_PADDING_SECONDS);
  }
}

// Live notes snap to the next sixteenth, like the original's "auto correcting"
// recorder, so random mashing still lands on the groove.
function nextGridTime() {
  const step = stepSeconds();
  const ahead = sequencer.nextStepTime - audio.currentTime;
  return Math.max(audio.currentTime, sequencer.nextStepTime - Math.floor(ahead / step) * step);
}

function playStep(stepIndex, time) {
  const current = groove();
  const i = stepIndex % current.steps;
  emit({ time, type: 'step', step: stepIndex });

  const bass = current.bass[i];
  if (bass !== null) {
    let length = 1;
    while (length < BASS_MAX_STEPS && current.bass[(i + length) % current.steps] === null) length++;
    const hz = midiToHz(current.rootMidi + bass);
    playTone(time, hz, current.bassPatch, length * stepSeconds() * BASS_GATE);
    counts.bass++;
    emit({ time, type: 'sound', voice: 'bass', hz });
  }
  for (const [name, pattern] of Object.entries(current.drums)) {
    if (pattern[i] !== 'x') continue;
    playDrum(name, time, GROOVE_DRUM_LEVEL);
    counts.beat++;
    emit({ time, type: 'sound', voice: 'beat', drum: name });
  }
}

function schedule() {
  while (sequencer.nextStepTime < audio.currentTime + LOOKAHEAD_SECONDS) {
    playStep(sequencer.step, sequencer.nextStepTime);
    sequencer.step++;
    sequencer.nextStepTime += stepSeconds();
  }
}

function startGroove() {
  sequencer.nextStepTime = audio.currentTime + START_DELAY_SECONDS;
  schedule();
  setInterval(schedule, SCHEDULER_INTERVAL_MS);
}

function playSynth(degree, patchName, tag) {
  const time = nextGridTime();
  const hz = midiToHz(scaleMidi(groove().rootMidi + SYNTH_OCTAVE_ABOVE_ROOT, degree));
  const steps = sequencer.sustain ? SUSTAIN_NOTE_STEPS : SYNTH_NOTE_STEPS;
  activeSynth = activeSynth.filter((voice) => voice.stopAt > audio.currentTime);
  activeSynth.push(playTone(time, hz, PATCHES[patchName], steps * stepSeconds()));
  while (activeSynth.length > MAX_SYNTH_VOICES) {
    const { gain, time: start } = activeSynth.shift();
    const at = Math.max(time, start);
    gain.gain.cancelScheduledValues(at);
    gain.gain.setTargetAtTime(SILENCE, at, STEAL_FADE_SECONDS);
  }
  counts.synth++;
  emit({ time, type: 'sound', voice: 'synth', hz, tag });
}

function playDrumKey(index, tag) {
  const time = nextGridTime();
  sequencer.lastDrum = DRUM_KIT[index];
  playDrum(sequencer.lastDrum, time);
  counts.drum++;
  emit({ time, type: 'sound', voice: 'drum', drum: sequencer.lastDrum, tag });
}

function playVisitor(index, tag) {
  const time = nextGridTime();
  const sound = VISITOR_SOUNDS[index];
  const patch = { ...sound, attack: 0.005, sustain: 0.7, release: 0.05, volume: VISITOR_VOLUME };
  playTone(time, sound.from, patch, sound.seconds, sound.to);
  counts.visitor++;
  emit({ time, type: 'sound', voice: 'visitor', hz: sound.from, tag, index });
}

function playMouseNote(degree) {
  const time = nextGridTime();
  const hz = midiToHz(scaleMidi(groove().rootMidi + MOUSE_OCTAVES_ABOVE_ROOT, degree));
  playTone(time, hz, PATCHES.blip, BLIP_SECONDS);
  counts.mouse++;
  emit({ time, type: 'sound', voice: 'mouse', hz });
  return time;
}

// Clicks, the wheel and keys without another job: a Tiny Draw-style blip.
function playBlip(degree, tag) {
  const time = nextGridTime();
  const hz = midiToHz(scaleMidi(groove().rootMidi + BLIP_OCTAVES_ABOVE_ROOT, degree));
  playTone(time, hz, PATCHES.blip, BLIP_SECONDS);
  counts.blip++;
  emit({ time, type: 'sound', voice: 'blip', hz, tag });
}

// Space: the original's pitch bend. With no note sounding there is nothing to
// bend, so it boings instead.
function bend(tag) {
  const now = audio.currentTime;
  activeSynth = activeSynth.filter((voice) => voice.stopAt > now);
  for (const { detune } of activeSynth) {
    detune.cancelScheduledValues(now);
    detune.setValueAtTime(detune.value, now);
    detune.linearRampToValueAtTime(BEND_CENTS, now + BEND_UP_SECONDS);
    detune.linearRampToValueAtTime(0, now + BEND_UP_SECONDS + BEND_DOWN_SECONDS);
  }
  let hz = null;
  if (!activeSynth.length) {
    const root = midiToHz(groove().rootMidi + SYNTH_OCTAVE_ABOVE_ROOT);
    hz = root * 2;
    playTone(now, root, PATCHES.boing, BEND_UP_SECONDS + BEND_DOWN_SECONDS, hz);
  }
  counts.bend++;
  emit({ time: now, type: 'sound', voice: 'bend', hz, tag });
}

// Shift: the original's drum roll, on whichever drum was hit last.
function roll(tag) {
  const start = nextGridTime();
  for (let hit = 0; hit < ROLL_HITS; hit++) {
    const time = start + (hit * stepSeconds()) / ROLL_HITS_PER_STEP;
    playDrum(sequencer.lastDrum, time);
    counts.drum++;
    emit({ time, type: 'sound', voice: 'drum', drum: sequencer.lastDrum, tag });
  }
}

function setGroove(index) {
  sequencer.groove = index;
  sequencer.bpm = GROOVES[index].bpm;
  // Restart on the downbeat so a new groove starts as itself, not mid-bar.
  sequencer.step = 0;
}

function nudgeTempo(direction) {
  sequencer.bpm = Math.min(MAX_BPM, Math.max(MIN_BPM, sequencer.bpm + direction * BPM_STEP));
}
