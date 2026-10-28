// Coordinates: +x is screen right (port), +z points toward the bow/camera.
// Positive lean means bowside high; the scene therefore rotates by -lean.
export const RIG = Object.freeze({
  gateX: 0.64, gateY: 0.52, gateZ: -0.12,
  inboard: 1.05, outboard: 2.45, sweepAngle: 0.24,
  rootY: 0.06, bladeHalfThickness: 0.012, preloadDepth: 0.035,
});
export const MODEL = Object.freeze({
  contactStiffness: 14, hullStiffness: 1.8, damping: 23,
  maxLean: Math.PI / 10, tolerance: Math.PI / 180,
  maxStableSpeed: 0.025, holdSeconds: 0.8,
});
export const NEUTRAL_HEIGHT = RIG.gateY + (RIG.rootY + RIG.gateY - RIG.bladeHalfThickness + RIG.preloadDepth) * RIG.inboard / RIG.outboard;
export const MIN_HEIGHT = NEUTRAL_HEIGHT - 0.31;
export const MAX_HEIGHT = NEUTRAL_HEIGHT + 0.31;
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const sideSign = side => side === 'bow' ? -1 : 1;
export const toDegrees = radians => radians * 180 / Math.PI;
export const fromPercent = value => MIN_HEIGHT + clamp(value, 0, 100) / 100 * (MAX_HEIGHT - MIN_HEIGHT);
export const toPercent = height => 100 * (height - MIN_HEIGHT) / (MAX_HEIGHT - MIN_HEIGHT);

// Every stationary challenge begins at the middle of its control travel,
// while retaining the physical handle height that produces its initial lean.
export function stillSliderHeight(origin, percent) {
  const value = clamp(percent, 0, 100);
  if (value === 50) return origin;
  return value <= 50 ? MIN_HEIGHT + (origin - MIN_HEIGHT) * value / 50 : origin + (MAX_HEIGHT - origin) * (value - 50) / 50;
}
export function stillSliderPercent(origin, height) {
  if (height === origin) return 50;
  return height <= origin ? 50 * (height - MIN_HEIGHT) / (origin - MIN_HEIGHT) : 50 + 50 * (height - origin) / (MAX_HEIGHT - origin);
}

export function oarPose(height, side) {
  const sign = sideSign(side);
  const y = (RIG.gateY - height) / RIG.inboard;
  const horizontal = Math.sqrt(1 - y * y);
  const direction = { x: sign * horizontal * Math.cos(RIG.sweepAngle), y, z: horizontal * Math.sin(RIG.sweepAngle) };
  const gate = { x: sign * RIG.gateX, y: RIG.gateY, z: RIG.gateZ };
  const at = distance => ({ x: gate.x + direction.x * distance, y: gate.y + direction.y * distance, z: gate.z + direction.z * distance });
  return { gate, direction, handle: at(-RIG.inboard), blade: at(RIG.outboard), at };
}

export function bladeContact(height, lean, side) {
  const { blade } = oarPose(height, side);
  const x = blade.x * Math.cos(lean) + blade.y * Math.sin(lean);
  const y = RIG.rootY - blade.x * Math.sin(lean) + blade.y * Math.cos(lean);
  const depth = Math.max(0, RIG.bladeHalfThickness - y);
  return { x, y, z: blade.z, depth, force: MODEL.contactStiffness * depth };
}

const neutralLever = Math.abs(oarPose(NEUTRAL_HEIGHT, 'bow').blade.x);
const preloadForce = MODEL.contactStiffness * RIG.preloadDepth;

export function rollAcceleration(height, lean, velocity, side) {
  const contact = bladeContact(height, lean, side);
  // The unseen crew balances the neutral oar's preload. Contact force is
  // compression-only: a blade above water never pulls the water downward.
  const passiveTorque = sideSign(side) * neutralLever * preloadForce;
  return -contact.x * contact.force + passiveTorque - MODEL.hullStiffness * lean - MODEL.damping * velocity;
}

export function heightForLean(lean, side) {
  let low = MIN_HEIGHT;
  let high = MAX_HEIGHT;
  const lowSign = Math.sign(rollAcceleration(low, lean, 0, side));
  if (lowSign === Math.sign(rollAcceleration(high, lean, 0, side))) throw new Error('Initial lean is outside the handle range');
  for (let i = 0; i < 50; i++) {
    const mid = (low + high) / 2;
    if (Math.sign(rollAcceleration(mid, lean, 0, side)) === lowSign) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

export function advance(state, elapsed) {
  // Fixed small substeps keep the contact spring stable across display rates.
  let remaining = clamp(elapsed, 0, 0.05);
  while (remaining > 1e-8) {
    const dt = Math.min(remaining, 1 / 240);
    state.velocity += rollAcceleration(state.height, state.lean, state.velocity, state.side) * dt;
    state.lean += state.velocity * dt;
    if (Math.abs(state.lean) > MODEL.maxLean) {
      state.lean = Math.sign(state.lean) * MODEL.maxLean;
      state.velocity = 0;
    }
    const stable = Math.abs(state.lean) <= MODEL.tolerance && Math.abs(state.velocity) <= MODEL.maxStableSpeed;
    state.hold = stable ? Math.min(MODEL.holdSeconds, state.hold + dt) : 0;
    remaining -= dt;
  }
  return state.hold >= MODEL.holdSeconds;
}

export class ChallengeDeck {
  constructor(random = Math.random) { this.random = random; this.bag = []; this.last = null; }
  next() {
    if (!this.bag.length) {
      this.bag = ['bow:high', 'bow:low', 'stroke:high', 'stroke:low'];
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(this.random() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
      if (this.bag[this.bag.length - 1] === this.last) [this.bag[0], this.bag[3]] = [this.bag[3], this.bag[0]];
    }
    const id = this.bag.pop();
    this.last = id;
    const [side, position] = id.split(':');
    const lean = (position === 'high' ? 1 : -1) * (6 + this.random() * 6) * Math.PI / 180;
    const height = heightForLean(lean, side);
    return { id, side, position, initialLean: lean, initialHeight: height, lean, velocity: 0, height, hold: 0, won: false };
  }
}
