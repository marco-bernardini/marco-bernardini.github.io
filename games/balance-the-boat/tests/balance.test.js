import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RIG, MODEL, MIN_HEIGHT, MAX_HEIGHT, NEUTRAL_HEIGHT,
  ChallengeDeck, advance, bladeContact, heightForLean, oarPose, rollAcceleration,
  stillSliderHeight, stillSliderPercent,
} from '../js/balance.js';

const radians = degrees => degrees * Math.PI / 180;
const settle = (state, seconds = 8, fps = 60) => {
  for (let i = 0; i < seconds * fps; i++) advance(state, 1 / fps);
  return state;
};

test('stationary rounds start unbalanced with a centred slider and no fixed answer position', () => {
  const deck = new ChallengeDeck();
  const solutions = [];
  for (let i = 0; i < 40; i++) {
    const state = deck.next();
    assert.equal(stillSliderPercent(state.initialHeight, state.height), 50);
    assert.equal(stillSliderHeight(state.initialHeight, 50), state.height);
    assert.ok(Math.abs(state.lean) >= radians(6));
    assert.ok(Math.abs(rollAcceleration(state.height, state.lean, 0, state.side)) < 1e-8);
    const answer = stillSliderPercent(state.initialHeight, NEUTRAL_HEIGHT);
    assert.ok(Math.abs(answer - 50) > 5, 'centred input must not solve the lean');
    assert.ok(Math.abs(stillSliderHeight(state.initialHeight, answer) - NEUTRAL_HEIGHT) < 1e-12);
    assert.equal(stillSliderHeight(state.initialHeight, 0), MIN_HEIGHT);
    assert.equal(stillSliderHeight(state.initialHeight, 100), MAX_HEIGHT);
    solutions.push(answer);
  }
  assert.ok(solutions.some(x => x < 50) && solutions.some(x => x > 50));
});

test('the four rowing situations need the agreed correction and can all be solved', () => {
  for (const [side, degrees, correction] of [
    ['bow', 10, -1], ['bow', -10, 1], ['stroke', 10, 1], ['stroke', -10, -1],
  ]) {
    const lean = radians(degrees);
    const height = heightForLean(lean, side);
    assert.ok(Math.sign(NEUTRAL_HEIGHT - height) === correction, `${side}, ${degrees}: wrong correction`);
    assert.ok(Math.abs(rollAcceleration(height, lean, 0, side)) < 1e-8, 'initial pose must be at equilibrium');
    assert.ok(bladeContact(height, lean, side).force > 0, 'initial blade should be supported');
    const wrong = { side, lean, height: height - correction * 0.02, velocity: 0, hold: 0 };
    settle(wrong, 2);
    assert.ok(Math.abs(wrong.lean) > Math.abs(lean), 'wrong direction should worsen the lean');
    const right = { side, lean, height: NEUTRAL_HEIGHT, velocity: 0, hold: 0 };
    settle(right);
    assert.ok(Math.abs(right.lean) < radians(0.01), 'neutral handle should level the boat');
    assert.equal(right.hold, MODEL.holdSeconds);
  }
});

test('all 6–12 degree starts are reachable on both rigs', () => {
  for (const side of ['bow', 'stroke']) for (let degrees = -12; degrees <= 12; degrees += 0.25) {
    const lean = radians(degrees);
    const height = heightForLean(lean, side);
    assert.ok(height >= MIN_HEIGHT && height <= MAX_HEIGHT);
    assert.ok(Math.abs(rollAcceleration(height, lean, 0, side)) < 1e-8);
  }
});

test('the rigid oar preserves its lever lengths and fixed gate as the handle moves', () => {
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  for (const side of ['bow', 'stroke']) for (const height of [MIN_HEIGHT, NEUTRAL_HEIGHT, MAX_HEIGHT]) {
    const { gate, handle, blade } = oarPose(height, side);
    assert.ok(Math.abs(handle.y - height) < 1e-12);
    assert.ok(Math.abs(distance(handle, gate) - RIG.inboard) < 1e-12);
    assert.ok(Math.abs(distance(blade, gate) - RIG.outboard) < 1e-12);
    assert.ok(Math.abs(distance(handle, blade) - RIG.inboard - RIG.outboard) < 1e-12);
    assert.equal(Math.abs(gate.x), RIG.gateX);
  }
});

test('a raised blade loses support; water never pulls it down', () => {
  for (const side of ['bow', 'stroke']) {
    const lifted = bladeContact(MIN_HEIGHT, 0, side);
    assert.ok(lifted.y > 0);
    assert.equal(lifted.force, 0);
    assert.equal(lifted.depth, 0);
    assert.ok(bladeContact(MAX_HEIGHT, 0, side).force > 0);
  }
});

test('holding the initial handle does not spontaneously solve the challenge', () => {
  const deck = new ChallengeDeck();
  for (let i = 0; i < 30; i++) {
    const state = deck.next();
    settle(state, 5);
    assert.ok(Math.abs(state.lean - state.initialLean) < 1e-8);
    assert.equal(state.hold, 0);
  }
});

test('overshooting the handle gives the opposite lean on mirrored rigs', () => {
  const bow = settle({ side: 'bow', lean: 0, height: NEUTRAL_HEIGHT + 0.05, velocity: 0, hold: 0 });
  const stroke = settle({ side: 'stroke', lean: 0, height: NEUTRAL_HEIGHT + 0.05, velocity: 0, hold: 0 });
  assert.ok(bow.lean > radians(1));
  assert.ok(stroke.lean < -radians(1));
  assert.ok(Math.abs(bow.lean + stroke.lean) < 1e-10);
});

test('success requires a stable continuous hold, not a crossing or a paused tab', () => {
  const state = { side: 'bow', lean: 0, height: NEUTRAL_HEIGHT, velocity: 0, hold: 0 };
  for (let i = 0; i < 47; i++) assert.equal(advance(state, 1 / 60), false);
  assert.ok(state.hold < MODEL.holdSeconds);
  assert.equal(advance(state, 1 / 30), true);
  state.lean = radians(2);
  advance(state, 1 / 60);
  assert.equal(state.hold, 0);
  const paused = { side: 'bow', lean: 0, height: NEUTRAL_HEIGHT, velocity: 0, hold: 0 };
  assert.equal(advance(paused, 120), false, 'one long frame must not award success');
  const crossing = { side: 'bow', lean: 0, height: NEUTRAL_HEIGHT, velocity: 0.2, hold: 0 };
  advance(crossing, 1 / 240);
  assert.equal(crossing.hold, 0);
});

test('settling stays consistent at 30, 60, and 144 fps', () => {
  for (const fps of [30, 60, 144]) {
    const state = settle({ side: 'stroke', lean: radians(-12), height: NEUTRAL_HEIGHT, velocity: 0, hold: 0 }, 6, fps);
    assert.ok(Math.abs(state.lean) < radians(0.01));
    assert.equal(state.hold, MODEL.holdSeconds);
  }
});

test('each bag covers all four cases and never repeats across bag boundaries', () => {
  for (const random of [() => 0, () => 0.999999, Math.random]) {
    const deck = new ChallengeDeck(random);
    let last = null;
    for (let bag = 0; bag < 50; bag++) {
      const ids = new Set();
      for (let i = 0; i < 4; i++) {
        const round = deck.next();
        assert.notEqual(round.id, last);
        assert.equal(round.hold, 0); assert.equal(round.won, false);
        assert.ok(Math.abs(round.lean) >= radians(6) && Math.abs(round.lean) <= radians(12));
        ids.add(round.id); last = round.id;
      }
      assert.equal(ids.size, 4);
    }
  }
});

test('extreme input stays finite and inside the teaching range', () => {
  for (const side of ['bow', 'stroke']) for (const height of [MIN_HEIGHT, MAX_HEIGHT]) {
    const state = settle({ side, height, lean: 0, velocity: 0, hold: 0 }, 15, 30);
    assert.ok(Number.isFinite(state.lean) && Number.isFinite(state.velocity));
    assert.ok(Math.abs(state.lean) <= MODEL.maxLean);
    assert.equal(state.hold, 0);
  }
});
