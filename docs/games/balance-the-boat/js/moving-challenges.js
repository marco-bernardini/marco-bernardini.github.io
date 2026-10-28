import { mix, smooth } from './stroke.js';

export class MovingChallenges {
  constructor(random = Math.random) { this.random = random; this.bag = []; this.last = ''; }
  next() {
    if (!this.bag.length) {
      this.bag = ['deep:up', 'deep:down', 'high:up', 'high:down'];
      for (let i = 3; i > 0; i--) { const j = Math.floor(this.random() * (i + 1)); [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]]; }
      if (this.bag[3] === this.last) [this.bag[0], this.bag[3]] = [this.bag[3], this.bag[0]];
    }
    const id = this.bag.pop(); this.last = id;
    const [depth, carry] = id.split(':');
    return { id, drive: (depth === 'deep' ? 1 : -1) * (0.070 + this.random() * 0.020), recovery: (carry === 'up' ? 1 : -1) * (0.032 + this.random() * 0.012) };
  }
}

export const WARMUP_CHALLENGE = Object.freeze({ id: 'warmup', drive: 0, recovery: 0 });

export function sampleFault(reference, current, previous = current) {
  if (reference.phase === 'catch') return mix(previous.recovery, current.drive < 0 ? current.drive : 0, smooth(reference.progress));
  if (reference.phase === 'release') return mix(current.drive, current.recovery, smooth(reference.progress));
  return reference.phase === 'drive' ? current.drive < 0 ? current.drive : current.drive * smooth(reference.phaseElapsed / 0.35) : current.recovery;
}

export function controlWeight(reference, mode) {
  if (mode === 'drive') return reference.load;
  if (mode === 'recovery') return 1 - reference.load;
  return 1;
}
