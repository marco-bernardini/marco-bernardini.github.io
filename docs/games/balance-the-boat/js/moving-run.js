import { clamp } from './balance.js';
import { strokeAt, strokePose, smooth } from './stroke.js';
import { MovingChallenges, WARMUP_CHALLENGE, sampleFault, controlWeight } from './moving-challenges.js';
import { MOVING, movingPose, advanceRoll } from './moving-balance.js';

const bucket = () => ({ time: 0, good: 0, errors: 0, incidentTime: 0, incidentActive: false, upTime: 0, downTime: 0, completed: false });

export class MovingRun {
  constructor({ mode = 'continuous', rate = 8, side, random = Math.random } = {}) {
    this.mode = mode; this.rate = rate; this.random = random;
    this.side = side || (random() < 0.5 ? 'bow' : 'stroke');
    this.time = 0; this.lean = 0; this.velocity = 0; this.correction = 0;
    this.appliedCorrection = 0; this.resetCount = 0; this.resetPhase = '';
    this.running = false; this.finished = false;
    this.warmupCycles = 2; this.scoredCycles = 10;
    this.deck = new MovingChallenges(random);
    this.challenges = [WARMUP_CHALLENGE, WARMUP_CHALLENGE];
    for (let i = 0; i < this.scoredCycles; i++) this.challenges.push(this.deck.next());
    this.metrics = { drive: bucket(), recovery: bucket() };
    this.strokes = Array.from({ length: this.scoredCycles }, () => ({ drive: bucket(), recovery: bucket() }));
    this.pose = this.getPose();
  }
  get totalSeconds() { return (this.warmupCycles + this.scoredCycles) * 60 / this.rate; }
  get clock() { return strokeAt(this.time, this.rate); }
  start() { if (!this.finished) this.running = true; }
  pause() { this.running = false; }
  setCorrection(value) { this.correction = clamp(value, -MOVING.trimRange, MOVING.trimRange); }
  recordInput(direction, seconds) {
    const ref = this.clock;
    if (!this.running || this.finished || !Number.isFinite(seconds) || seconds <= 0 || !direction || ref.cycle < this.warmupCycles || !['drive', 'recovery'].includes(ref.phase) || (this.mode !== 'continuous' && ref.phase !== this.mode)) return;
    const metric = this.strokes[ref.cycle - this.warmupCycles]?.[ref.phase];
    if (!metric || metric.completed) return;
    metric[direction > 0 ? 'upTime' : 'downTime'] += seconds;
  }
  getPose() {
    const ref = strokePose(this.clock);
    const index = Math.min(ref.cycle, this.challenges.length - 1);
    ref.missedCatch = this.challenges[index].drive < 0 && this.mode !== 'recovery';
    const fault = sampleFault(ref, this.challenges[index], this.challenges[Math.max(0, Math.min(ref.cycle - 1, this.challenges.length - 1))]);
    // Fade outgoing input through the transition; the following phase starts
    // with a centred command and a brief smooth physical pickup after reset.
    const inputWeight = ['catch', 'release'].includes(ref.phase) ? 1 - smooth(ref.progress) : smooth(ref.phaseElapsed / 0.12);
    const offset = (fault + this.appliedCorrection * inputWeight) * controlWeight(ref, this.mode);
    return movingPose(ref, offset, this.lean, this.side);
  }
  advance(elapsed) {
    if (!this.running || this.finished) return;
    let remaining = clamp(elapsed, 0, 0.05);
    while (remaining > 1e-9) {
      const dt = Math.min(remaining, 1 / 120, this.totalSeconds - this.time);
      if (dt <= 1e-9) { this.time = this.totalSeconds; this.finished = true; this.running = false; break; }
      const before = this.clock;
      this.appliedCorrection += (this.correction - this.appliedCorrection) * (1 - Math.exp(-dt / MOVING.correctionSmoothing));
      const pose = this.getPose();
      advanceRoll(this, pose, dt);
      this.record(pose, dt);
      this.time += dt; remaining -= dt;
      const after = this.clock;
      if (after.phase !== before.phase || after.cycle !== before.cycle) {
        if (before.cycle >= this.warmupCycles && ['drive', 'recovery'].includes(before.phase) && (this.mode === 'continuous' || this.mode === before.phase)) {
          this.strokes[before.cycle - this.warmupCycles][before.phase].completed = true;
        }
      }
      if ((after.phase === 'drive' || after.phase === 'recovery') && (after.phase !== before.phase || after.cycle !== before.cycle)) {
        this.correction = 0;
        this.appliedCorrection = 0; // outgoing input has already faded to zero
        this.resetCount++;
        this.resetPhase = after.phase;
      }
      if (this.time >= this.totalSeconds - 1e-8) { this.time = this.totalSeconds; this.finished = true; this.running = false; break; }
    }
    this.pose = this.getPose();
  }
  record(pose, dt) {
    const { reference: ref } = pose;
    const reactionSeconds = ref.phase === 'drive' ? MOVING.driveReactionSeconds : MOVING.recoveryReactionSeconds;
    if (ref.cycle < this.warmupCycles || !['drive', 'recovery'].includes(ref.phase) || ref.phaseElapsed < reactionSeconds || (this.mode !== 'continuous' && ref.phase !== this.mode)) return;
    const perStroke = this.strokes[ref.cycle - this.warmupCycles]?.[ref.phase];
    if (!perStroke) return;
    for (const metric of [this.metrics[ref.phase], perStroke]) {
      metric.time += dt;
      if (pose.good) metric.good += dt;
    }
    const error = ['Blade out', 'Blade too high', 'Missed the water', 'Washing out', 'Shaft buried', 'Water contact'].includes(pose.bladeStatus);
    // Require a sustained event; reset only after regaining good blade position.
    if (error) {
      perStroke.incidentTime += dt;
      if (perStroke.incidentTime >= 0.12 && !perStroke.incidentActive) {
        perStroke.errors++; this.metrics[ref.phase].errors++; perStroke.incidentActive = true;
      }
    } else { perStroke.incidentTime = 0; perStroke.incidentActive = false; }
  }
  summary() {
    const phases = this.mode === 'continuous' ? ['drive', 'recovery'] : [this.mode];
    const totals = { drive: 0, recovery: 0 }, correct = { drive: 0, recovery: 0 };
    for (let i = 0; i < this.strokes.length; i++) for (const phase of phases) {
      const metric = this.strokes[i][phase];
      if (!metric.completed) continue;
      totals[phase]++;
      const difference = metric.upTime - metric.downTime;
      const required = -Math.sign(this.challenges[i + this.warmupCycles][phase]);
      if (Math.abs(difference) > 1e-9 && Math.sign(difference) === required) correct[phase]++;
    }
    const total = totals.drive + totals.recovery, right = correct.drive + correct.recovery;
    return {
      drive: totals.drive ? Math.round(100 * correct.drive / totals.drive) : 0,
      recovery: totals.recovery ? Math.round(100 * correct.recovery / totals.recovery) : 0,
      overall: total ? Math.round(100 * right / total) : 0,
      correct: right, total, driveTotal: totals.drive, recoveryTotal: totals.recovery,
      errors: this.metrics.drive.errors + this.metrics.recovery.errors,
    };
  }
}
