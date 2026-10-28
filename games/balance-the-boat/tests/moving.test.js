import test from 'node:test';
import assert from 'node:assert/strict';
import { RIG } from '../js/balance.js';
import { strokeAt, strokePose, referenceHeight, rigPose, bladeBounds } from '../js/stroke.js';
import { MovingChallenges, sampleFault } from '../js/moving-challenges.js';
import { MOVING, movingPose, advanceRoll } from '../js/moving-balance.js';
import { MovingRun } from '../js/moving-run.js';

const referenceAt = fraction => strokePose(strokeAt(fraction * 5, 12));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
function expertStep(run, dt) {
  const ref = run.pose.reference, i = Math.min(ref.cycle, 11);
  run.setCorrection(-sampleFault(ref, run.challenges[i], run.challenges[Math.max(0, i - 1)]));
  if (['drive', 'recovery'].includes(ref.phase)) run.recordInput(-Math.sign(run.challenges[i][ref.phase]), dt);
  run.advance(dt);
}
function finishRun(run, expert = false, fps = 60) {
  run.start();
  for (let i = 0; i < 20000 && !run.finished; i++) expert ? expertStep(run, 1 / fps) : run.advance(1 / fps);
  assert.ok(run.finished);
  return run.summary();
}

test('clean reference strokes have a covered drive and an airborne recovery on both sides', () => {
  for (const side of ['bow', 'stroke']) for (const fraction of [0.07, 0.20, 0.33, 0.42, 0.70, 0.97]) {
    const reference = referenceAt(fraction), pose = movingPose(reference, 0, 0, side);
    assert.ok(pose.good, `${side}, ${fraction}: ${pose.bladeStatus}`);
    if (reference.phase === 'drive') {
      assert.equal(pose.coverage, 1);
      assert.ok(Math.abs(pose.bounds.maxY + 0.045) < 1e-6);
      assert.equal(reference.feather, Math.PI / 2);
    } else {
      assert.equal(pose.waterForce, 0);
      assert.ok(Math.abs(pose.bounds.minY - 0.115) < 1e-6);
      assert.equal(reference.feather, 0);
    }
  }
});

test('placement and extraction remain continuous at all animation boundaries', () => {
  for (const boundary of [0.0225, 0.05, 0.34, 0.376, 0.40, 1]) {
    const a = referenceAt(boundary - 1e-7), b = referenceAt(boundary + 1e-7);
    for (const key of ['yaw', 'seat', 'body', 'feather']) assert.ok(Math.abs(a[key] - b[key]) < 1e-4, `${boundary}: discontinuous ${key}`);
    assert.ok(Math.abs(referenceHeight(a, 'bow') - referenceHeight(b, 'bow')) < 1e-4, `${boundary}: handle jump`);
  }
});

test('blade is extracted before feathering, and squared before placement', () => {
  for (let fraction = 0.376; fraction < 0.40; fraction += 0.002) {
    const pose = movingPose(referenceAt(fraction), 0, 0, 'bow');
    assert.ok(pose.bounds.minY > 0, 'feathering must happen above water');
  }
  for (let fraction = 0.0225; fraction < 0.05; fraction += 0.002) assert.equal(referenceAt(fraction).feather, Math.PI / 2);
});

test('drive height controls real immersion and recovery contact is compression-only', () => {
  for (const side of ['bow', 'stroke']) {
    const ref = referenceAt(0.20);
    const deep = movingPose(ref, 0.055, 0, side), clean = movingPose(ref, 0, 0, side), shallow = movingPose(ref, -0.12, 0, side);
    assert.equal(deep.bladeStatus, 'Too deep');
    assert.ok(deep.bounds.maxY < clean.bounds.maxY);
    assert.ok(shallow.coverage < 0.98);
    assert.ok(['Blade out', 'Washing out'].includes(shallow.bladeStatus));
    const recovery = referenceAt(0.7);
    assert.equal(movingPose(recovery, -0.08, 0, side).waterForce, 0);
    assert.ok(movingPose(recovery, 0.12, 0, side).waterForce > 0);
  }
});

test('effective carry gives mirrored corrections while the recovery blade is in the air', () => {
  for (const side of ['bow', 'stroke']) for (const offset of [-0.035, 0.035]) {
    const state = { side, lean: 0, velocity: 0 };
    for (let i = 0; i < 360; i++) {
      const pose = movingPose(referenceAt(0.7), offset, state.lean, side);
      assert.equal(pose.waterForce, 0);
      advanceRoll(state, pose, 1 / 120);
    }
    assert.ok(Math.sign(state.lean) === Math.sign(offset) * (side === 'bow' ? 1 : -1));
    assert.ok(Math.abs(state.lean) > MOVING.tolerance);
    for (let i = 0; i < 360; i++) advanceRoll(state, movingPose(referenceAt(0.7), 0, state.lean, side), 1 / 120);
    assert.ok(Math.abs(state.lean) < 0.0001);
  }
});

test('all generated faults have a shared zero-error solution within the trim range', () => {
  const deck = new MovingChallenges();
  let previous = deck.next();
  for (let i = 0; i < 100; i++) {
    const current = deck.next();
    for (const side of ['bow', 'stroke']) for (const fraction of [0.08, 0.2, 0.32, 0.45, 0.7, 0.95]) {
      const ref = referenceAt(fraction), fault = sampleFault(ref, current, previous);
      assert.ok(Math.abs(fault) < MOVING.trimRange);
      assert.ok(movingPose(ref, fault - fault, 0, side).good);
    }
    previous = current;
  }
});

test('fault offsets blend continuously across phases and strokes', () => {
  const deck = new MovingChallenges(() => 0.3), previous = deck.next(), current = deck.next(), next = deck.next();
  for (const fraction of [0.05, 0.34, 0.40]) assert.ok(Math.abs(sampleFault(referenceAt(fraction - 1e-7), current, previous) - sampleFault(referenceAt(fraction + 1e-7), current, previous)) < 1e-6);
  assert.ok(Math.abs(sampleFault(referenceAt(1 - 1e-7), current, previous) - sampleFault(referenceAt(1e-7), next, current)) < 1e-6);
});

test('rigid lever lengths and feasible arm reach survive the complete stroke envelope', () => {
  for (const side of ['bow', 'stroke']) for (let i = 0; i <= 100; i++) for (const offset of [-0.12, 0, 0.12]) {
    const ref = referenceAt(i / 100), pose = movingPose(ref, offset, 0, side), rig = pose.rig;
    assert.ok(Math.abs(distance(rig.gate, rig.handle) - RIG.inboard) < 1e-10);
    assert.ok(Math.abs(distance(rig.gate, rig.blade) - RIG.outboard) < 1e-10);
    assert.ok(Number.isFinite(bladeBounds(rig).minY));
    for (const sign of [-1, 1]) {
      const shoulder = { x: sign * 0.225, y: 0.51 + 0.62 * Math.cos(ref.body) - 0.04 * Math.sin(ref.body), z: 0.16 + ref.seat + 0.62 * Math.sin(ref.body) + 0.04 * Math.cos(ref.body) };
      const wrist = rig.at(-RIG.inboard + (sign === (side === 'bow' ? 1 : -1) ? 0.06 : 0.26));
      assert.ok(distance(shoulder, wrist) <= 0.90, `${side}, ${i}, ${offset}: unreachable hand`);
    }
  }
});

test('warm-up, transition, and pause frames cannot earn score or incidents', () => {
  const run = new MovingRun({ random: () => 0.5 });
  run.start(); run.setCorrection(-0.12);
  for (let i = 0; i < 890; i++) run.advance(1 / 60);
  assert.equal(run.metrics.drive.time, 0); assert.equal(run.metrics.recovery.time, 0);
  run.pause(); const snapshot = JSON.stringify({ time: run.time, lean: run.lean, metrics: run.metrics });
  for (let i = 0; i < 500; i++) run.advance(1 / 60);
  assert.equal(JSON.stringify({ time: run.time, lean: run.lean, metrics: run.metrics }), snapshot);
  const probe = new MovingRun();
  probe.record(movingPose(referenceAt(0.01), -0.12, 0, 'bow'), 1);
  probe.record(movingPose(referenceAt(0.35), -0.12, 0, 'bow'), 1);
  assert.equal(probe.summary().errors, 0);
});

test('sustained washout is counted once and valid repositioning permits a new incident', () => {
  const run = new MovingRun();
  const ref = strokePose(strokeAt(11, 12)); // first scored drive, after reaction allowance
  const bad = movingPose(ref, -0.12, 0, run.side), good = movingPose(ref, 0, 0, run.side);
  assert.ok(['Washing out', 'Blade out'].includes(bad.bladeStatus));
  for (let i = 0; i < 120; i++) run.record(bad, 1 / 120);
  assert.equal(run.summary().errors, 1);
  run.record(good, 1 / 60);
  for (let i = 0; i < 30; i++) run.record(bad, 1 / 120);
  assert.equal(run.summary().errors, 2);
});

test('practice isolates its selected phase and correct input earns full direction credit', () => {
  for (const mode of ['drive', 'recovery', 'continuous']) for (const side of ['bow', 'stroke']) {
    const run = new MovingRun({ mode, side, rate: 12, random: () => 0.5 });
    const summary = finishRun(run, true);
    assert.equal(summary.correct, mode === 'continuous' ? 20 : 10);
    if (mode !== 'recovery') assert.ok(summary.drive >= 98);
    else assert.equal(run.metrics.drive.time, 0);
    if (mode !== 'drive') assert.ok(summary.recovery >= 98);
    else assert.equal(run.metrics.recovery.time, 0);
    const final = run.time; run.start(); run.advance(1 / 60); assert.equal(run.time, final);
  }
});

test('scores are consistent across display rates and inaction does not pass', () => {
  const results = [30, 60, 144].map(fps => finishRun(new MovingRun({ random: () => 0.5 }), true, fps));
  assert.ok(results.every(r => r.drive === 100 && r.recovery === 100 && r.correct === 20));
  const idle = finishRun(new MovingRun({ random: () => 0.5 }));
  assert.equal(idle.drive, 0); assert.equal(idle.recovery, 0); assert.equal(idle.correct, 0);
});

test('correct held-key direction earns full credit despite depth errors and overshooting', () => {
  for (const side of ['bow', 'stroke']) {
    const run = new MovingRun({ side, rate: 8, random: () => 0.999 });
    const dt = 1 / 60;
    const maxStep = MOVING.keyboardPercentSpeed / 100 * 2 * MOVING.trimRange * dt;
    run.start();
    while (!run.finished) {
      const ref = run.clock, i = Math.min(ref.cycle, 11);
      const direction = ['drive', 'recovery'].includes(ref.phase) ? -Math.sign(run.challenges[i][ref.phase]) : 0;
      run.setCorrection(run.correction + direction * maxStep);
      run.recordInput(direction, dt);
      run.advance(dt);
    }
    assert.equal(run.summary().correct, 20);
    assert.equal(run.summary().drive, 100); assert.equal(run.summary().recovery, 100);
    assert.ok(run.summary().errors > 0, 'physical errors must not penalise a correct direction choice');
  }
});

test('challenge decks cover each template without consecutive repeats', () => {
  for (const random of [() => 0, () => 0.999, Math.random]) {
    const deck = new MovingChallenges(random); let last = '';
    for (let i = 0; i < 25; i++) {
      const bag = new Set();
      for (let j = 0; j < 4; j++) { const c = deck.next(); assert.notEqual(c.id, last); bag.add(c.id); last = c.id; }
      assert.equal(bag.size, 4);
    }
  }
});

test('easy is 8 spm and hard is 12 spm', () => {
  assert.equal(new MovingRun().rate, 8);
  assert.equal(new MovingRun().totalSeconds, 90);
  assert.equal(new MovingRun({ rate: 12 }).totalSeconds, 60);
  assert.equal(strokeAt(7.5).cycle, 1);
  assert.equal(strokeAt(5, 12).cycle, 1);
});

test('correction recentres once after catch and once after feathering, without snapping the handle', () => {
  for (const rate of [8, 12]) {
    const run = new MovingRun({ rate });
    run.start(); run.setCorrection(0.03);
    while (run.clock.phase === 'catch') run.advance(1 / 120);
    assert.equal(run.clock.phase, 'drive');
    assert.equal(run.correction, 0);
    assert.equal(run.resetCount, 1);
    assert.equal(run.appliedCorrection, 0, 'outgoing input must not reactivate after the reset');
    assert.ok(Math.abs(run.pose.offset) < 0.001, 'warm-up physical input has faded out through placement');
    run.setCorrection(-0.025);
    for (let i = 0; i < 20; i++) run.advance(1 / 120);
    assert.equal(run.correction, -0.025, 'do not reset repeatedly within a drive');
    run.pause(); const resets = run.resetCount; const time = run.time;
    run.advance(1); assert.equal(run.time, time); assert.equal(run.resetCount, resets);
    run.start();
    while (run.clock.phase !== 'recovery') run.advance(1 / 120);
    assert.equal(run.correction, 0);
    assert.equal(run.resetCount, 2);
    assert.equal(run.resetPhase, 'recovery');
    run.setCorrection(0.02);
    for (let i = 0; i < 20; i++) run.advance(1 / 120);
    assert.equal(run.correction, 0.02, 'retain new input until the next control phase');
  }
});

test('a full run resets exactly twice per stroke across display rates', () => {
  for (const fps of [30, 60, 144]) {
    const run = new MovingRun({ rate: 8 }); run.start();
    while (!run.finished) {
      const before = run.resetCount;
      run.setCorrection(0.025); run.advance(1 / fps);
      if (run.resetCount !== before) assert.equal(run.correction, 0);
    }
    assert.equal(run.resetCount, 24);
  }
});

test('deep drives lift the rower side and progressively bury more than 40% of shaft', () => {
  for (const side of ['bow', 'stroke']) {
    const ref = referenceAt(0.20), state = { side, lean: 0, velocity: 0 };
    const initial = movingPose(ref, 0.08, 0, side);
    for (let i = 0; i < 240; i++) advanceRoll(state, movingPose(ref, 0.08, state.lean, side), 1 / 120);
    const end = movingPose(ref, 0.08, state.lean, side);
    assert.ok((side === 'bow' ? 1 : -1) * state.lean > 8 * Math.PI / 180);
    assert.ok(end.shaftWetFraction > 0.40);
    assert.ok(end.shaftWetFraction > initial.shaftWetFraction + 0.10);
    assert.ok(end.bounds.centerY < initial.bounds.centerY - 0.20);
    assert.equal(end.bladeStatus, 'Shaft buried');
    for (let i = 0; i < 240; i++) advanceRoll(state, movingPose(ref, 0, state.lean, side), 1 / 120);
    assert.ok(movingPose(ref, 0, state.lean, side).good, 'correcting the draw must recover the boat');
  }
});

test('high-blade drives drop the rower side and lift the complete blade above water', () => {
  for (const side of ['bow', 'stroke']) {
    const ref = referenceAt(0.20), state = { side, lean: 0, velocity: 0 };
    for (let i = 0; i < 240; i++) advanceRoll(state, movingPose(ref, -0.08, state.lean, side), 1 / 120);
    const pose = movingPose(ref, -0.08, state.lean, side);
    assert.ok((side === 'bow' ? 1 : -1) * state.lean < -8 * Math.PI / 180);
    assert.ok(pose.bounds.minY > 0.10);
    assert.equal(pose.bladeStatus, 'Blade too high');
    assert.equal(pose.shaftWetFraction, 0);
    assert.equal(pose.coverage, 0);
  }
});

test('shaft immersion and the surface guide use the actual rigid shaft geometry', () => {
  for (const side of ['bow', 'stroke']) {
    const lean = (side === 'bow' ? 1 : -1) * 0.15;
    const pose = movingPose(referenceAt(0.2), 0.08, lean, side);
    const point = pose.rig.at((RIG.outboard - 0.34) * (1 - pose.shaftWetFraction));
    const worldY = RIG.rootY - point.x * Math.sin(lean) + point.y * Math.cos(lean);
    assert.ok(Math.abs(worldY) < 1e-9);
    assert.ok(pose.shaftWetLength > 0 && pose.shaftWetLength < RIG.outboard - 0.34);
  }
});

test('drive deck offers both deep and high-blade errors within the available control range', () => {
  const deck = new MovingChallenges(() => 0.5);
  const drives = Array.from({ length: 4 }, () => deck.next().drive);
  assert.equal(drives.filter(value => value > 0).length, 2);
  assert.equal(drives.filter(value => value < 0).length, 2);
  assert.ok(drives.every(value => Math.abs(value) >= 0.07 && Math.abs(value) <= 0.09));
});

test('the articulated rower can reach the handle through the exaggerated drive faults', () => {
  for (const side of ['bow', 'stroke']) for (const fraction of [0.06, 0.1, 0.2, 0.3, 0.33]) for (const offset of [-0.09, 0.09]) for (const ownRoll of [0, 0.1, 0.2, 0.26]) {
    const ref = referenceAt(fraction);
    const lean = (side === 'bow' ? 1 : -1) * Math.sign(offset) * ownRoll;
    const pose = movingPose(ref, offset, lean, side);
    const pitch = ref.body - pose.bodyDrop * 0.6;
    for (const sign of [-1, 1]) {
      const shoulder = { x: sign * 0.225, y: 0.51 - pose.bodyDrop + 0.62 * Math.cos(pitch) - 0.04 * Math.sin(pitch), z: 0.16 + ref.seat + 0.62 * Math.sin(pitch) + 0.04 * Math.cos(pitch) };
      const wrist = pose.rig.at(-RIG.inboard + (sign === (side === 'bow' ? 1 : -1) ? 0.06 : 0.26));
      assert.ok(distance(shoulder, wrist) < 0.90);
    }
  }
});

test('planned high blades miss placement and never dip into the water before the drive', () => {
  for (const side of ['bow', 'stroke']) for (const drive of [-0.07, -0.09]) for (const carry of [-0.044, 0.044]) {
    const run = new MovingRun({ side, rate: 8 });
    run.challenges[1] = { id: 'previous', drive: 0.08, recovery: carry };
    run.challenges[2] = { id: 'miss', drive, recovery: 0.04 };
    run.lean = (side === 'bow' ? 1 : -1) * 0.08;
    for (const fraction of [0.025, 0.035, 0.045, 0.049, 0.05, 0.051, 0.07, 0.12]) {
      run.time = (2 + fraction) * 7.5;
      run.appliedCorrection = fraction < 0.05 ? -carry : 0;
      const pose = run.getPose();
      assert.ok(pose.bounds.minY > 0.005, `${side}, ${drive}, ${carry}, ${fraction}: blade entered before correction`);
      assert.equal(pose.coverage, 0);
      if (pose.reference.phase === 'drive') assert.equal(pose.bladeStatus, 'Missed the water');
    }
  }
});

test('raising the handle can place a missed blade, and ordinary deep catches still enter normally', () => {
  const ref = { ...referenceAt(0.20), missedCatch: true };
  for (const side of ['bow', 'stroke']) {
    const missed = movingPose(ref, -0.08, 0, side);
    const corrected = movingPose(ref, 0, 0, side);
    assert.equal(missed.coverage, 0); assert.ok(missed.missedWater);
    assert.equal(corrected.coverage, 1); assert.ok(corrected.good);
    assert.equal(corrected.missedWater, false);
    const deep = movingPose({ ...ref, missedCatch: false }, 0.08, 0, side);
    assert.equal(deep.coverage, 1);
  }
});

function scoringFixture(mode = 'continuous') {
  const run = new MovingRun({ mode, rate: 8 });
  run.challenges[2] = { id: 'known', drive: -0.08, recovery: 0.04 };
  run.time = (2 + 0.15) * 7.5;
  run.pose = run.getPose(); run.start();
  return run;
}
function completeCurrentPhase(run) {
  const phase = run.clock.phase;
  while (run.running && run.clock.phase === phase) run.advance(1 / 60);
}

test('longer active input direction wins, independently of depth and diagnostic errors', () => {
  const run = scoringFixture();
  run.recordInput(1, 0.6); run.recordInput(-1, 0.2);
  run.strokes[0].drive.errors = 4;
  run.metrics.drive.errors = 4;
  completeCurrentPhase(run);
  assert.equal(run.summary().drive, 100);
  assert.equal(run.summary().correct, 1);
  assert.ok(run.summary().errors >= 4);
  const wrong = scoringFixture();
  wrong.recordInput(1, 0.2); wrong.recordInput(-1, 0.6);
  completeCurrentPhase(wrong);
  assert.equal(wrong.summary().drive, 0);
});

test('unequal-duration inputs use time, not the number of presses', () => {
  const run = scoringFixture();
  for (let i = 0; i < 10; i++) run.recordInput(-1, 0.02);
  run.recordInput(1, 0.4);
  completeCurrentPhase(run);
  assert.equal(run.summary().drive, 100);
});

test('ties, no input, and programmatic slider changes do not earn direction credit', () => {
  const tie = scoringFixture();
  tie.recordInput(1, 0.3); tie.recordInput(-1, 0.3); completeCurrentPhase(tie);
  assert.equal(tie.summary().drive, 0);
  const none = scoringFixture();
  none.setCorrection(0.08); completeCurrentPhase(none);
  assert.equal(none.summary().drive, 0);
  assert.equal(none.summary().driveTotal, 1);
});

test('warm-up, transitions, paused input and automatic practice phases do not cast votes', () => {
  const run = new MovingRun({ mode: 'recovery' });
  run.start(); run.recordInput(1, 0.5);
  run.time = (2 + 0.15) * 7.5; run.recordInput(1, 0.5);
  run.time = (2 + 0.36) * 7.5; run.recordInput(1, 0.5);
  run.time = (2 + 0.6) * 7.5; run.pause(); run.recordInput(1, 0.5);
  assert.equal(run.strokes[0].drive.upTime, 0);
  assert.equal(run.strokes[0].recovery.upTime, 0);
  run.start(); run.recordInput(-Math.sign(run.challenges[2].recovery), 0.1);
  completeCurrentPhase(run);
  assert.equal(run.summary().recovery, 100);
  assert.equal(run.summary().total, 1);
});

test('each phase counts once in the percentages, including uncorrected phases', () => {
  const run = scoringFixture();
  run.recordInput(1, 0.5); completeCurrentPhase(run);
  run.time = (2 + 0.6) * 7.5;
  run.recordInput(-1, 0.5); completeCurrentPhase(run);
  assert.equal(run.summary().overall, 100);
  assert.equal(run.summary().total, 2);
  run.time = (3 + 0.15) * 7.5; completeCurrentPhase(run);
  assert.equal(run.summary().drive, 50);
  assert.equal(run.summary().recovery, 100);
  assert.equal(run.summary().overall, 67);
});
