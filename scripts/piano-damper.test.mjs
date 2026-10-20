import assert from "node:assert/strict";
import test from "node:test";
import { mixPianoDamperNote } from "../src/pianoTone.js";

const rate = 48000;
function buffer(seconds = 0.4) {
  const channels = [new Float32Array(Math.ceil(seconds * rate)), new Float32Array(Math.ceil(seconds * rate))];
  return {
    sampleRate: rate, numberOfChannels: 2, length: channels[0].length,
    getChannelData: (channel) => channels[channel],
  };
}
function note(start = 0) {
  return {
    pitch: 60, start, end: start + 0.05,
    pianoReleaseMs: 140, pianoDampingSeconds: 0.012,
  };
}

test("the damper preserves the complete held body and catches it without a discontinuity", () => {
  const input = buffer();
  const output = buffer();
  for (let channel = 0; channel < 2; channel++) input.getChannelData(channel).fill(0.5);
  mixPianoDamperNote(output, input, note(), 1);
  for (let channel = 0; channel < 2; channel++) {
    const values = output.getChannelData(channel);
    for (let index = 0; index <= rate * 0.05; index++) assert.equal(values[index], 0.5);
    assert.ok(Math.abs(values[2401] - values[2400]) < 0.001);
    let previous = 0.5;
    for (let index = 2400; index < 9120; index++) {
      assert.ok(values[index] >= 0 && values[index] <= previous);
      previous = values[index];
    }
    assert.ok(values[4800] > 0);
    assert.ok(values[7200] > 0);
    assert.ok(values[9119] < 1e-5);
    assert.equal(values[9120], 0);
  }
});

test("release quickly loses energy but retains a quiet ring-off rather than a hard gate", () => {
  const input = buffer();
  input.getChannelData(0).fill(1);
  const output = buffer();
  mixPianoDamperNote(output, input, note(), 1);
  const values = output.getChannelData(0);
  assert.ok(values[Math.round(0.07 * rate)] > 0.35);
  assert.ok(values[Math.round(0.07 * rate)] < 0.45);
  assert.ok(values[Math.round(0.11 * rate)] > 0.02);
  assert.ok(values[Math.round(0.11 * rate)] < 0.06);
  assert.ok(values[Math.round(0.17 * rate)] > 0);
  assert.ok(values[Math.round(0.17 * rate)] < 0.02);
});

test("damping eases in gently and the final fade reaches silence with a flattened slope", () => {
  const input = buffer();
  input.getChannelData(0).fill(1);
  const output = buffer();
  mixPianoDamperNote(output, input, note(), 1);
  const values = output.getChannelData(0);
  const release = Math.round(0.05 * rate);
  const end = release + Math.ceil(140 * rate / 1000);
  assert.equal(values[release], 1);
  assert.ok(1 - values[release + 1] < 1e-5);
  assert.ok(values[release + Math.round(0.001 * rate)] > 0.995);
  assert.ok(values[release + Math.round(0.006 * rate)] > 0.875);
  assert.ok(values[release + Math.round(0.006 * rate)] < 0.9);
  const last24ms = values[end - Math.round(0.024 * rate)];
  assert.ok(last24ms > 0.0115 && last24ms < 0.0125);
  const earlierStep = values[end - 100] - values[end - 99];
  assert.ok(earlierStep > 0);
  assert.ok(values[end - 1] < earlierStep * 0.01);
  assert.equal(values[end], 0);
});

test("high partials damp faster than the remaining low-frequency resonance", () => {
  const input = buffer();
  const data = input.getChannelData(0);
  for (let index = 0; index < data.length; index++) {
    data[index] = 0.2 * (Math.sin(2 * Math.PI * 200 * index / rate) +
      Math.sin(2 * Math.PI * 8000 * index / rate));
  }
  const output = buffer();
  mixPianoDamperNote(output, input, note(), 1);
  function amplitude(hz) {
    const values = output.getChannelData(0);
    let re = 0;
    let im = 0;
    for (let index = 4320; index < 6240; index++) {
      const phase = 2 * Math.PI * hz * index / rate;
      re += values[index] * Math.cos(phase);
      im += values[index] * Math.sin(phase);
    }
    return Math.hypot(re, im);
  }
  assert.ok(amplitude(8000) / amplitude(200) < 0.3);
});

test("overlapping damper notes mix independently without affecting another note's envelope", () => {
  const input = buffer();
  for (let channel = 0; channel < 2; channel++) {
    const data = input.getChannelData(channel);
    for (let index = 0; index < data.length; index++) {
      data[index] = Math.sin(2 * Math.PI * 440 * index / rate) * 0.2;
    }
  }
  const first = buffer();
  const second = buffer();
  const mixed = buffer();
  mixPianoDamperNote(first, input, note(), 1);
  mixPianoDamperNote(second, input, note(0.06), 1);
  mixPianoDamperNote(mixed, input, note(), 1);
  mixPianoDamperNote(mixed, input, note(0.06), 1);
  for (let channel = 0; channel < 2; channel++) {
    for (let index = 0; index < mixed.length; index++) {
      assert.ok(Math.abs(mixed.getChannelData(channel)[index] -
        first.getChannelData(channel)[index] - second.getChannelData(channel)[index]) < 1e-7);
    }
  }
});

test("invalid model parameters or truncated buffers produce explicit errors", () => {
  const output = buffer();
  const input = buffer();
  assert.throws(() => mixPianoDamperNote(output, input, { ...note(), pitch: NaN }, 1), /note timeline/);
  assert.throws(() => mixPianoDamperNote(output, input, { ...note(), start: NaN }, 1), /note timeline/);
  assert.throws(() => mixPianoDamperNote(output, input, { ...note(), pianoDampingSeconds: 0 }, 1),
    /note timeline/);
  assert.throws(() => mixPianoDamperNote(output, buffer(0.1), note(), 1), /note timeline/);
  assert.throws(() => mixPianoDamperNote(buffer(0.1), input, note(), 1), /note timeline/);
});
