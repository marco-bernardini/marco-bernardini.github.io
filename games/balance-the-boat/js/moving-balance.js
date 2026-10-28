import { RIG, clamp, sideSign } from './balance.js';
import { BLADE_OUTLINE, bladeBounds, referenceHeight, rigPose } from './stroke.js';

export const MOVING = Object.freeze({
  trimRange: 0.12, keyboardPercentSpeed: 80, maxLean: Math.PI / 12,
  tolerance: 1.5 * Math.PI / 180, stiffness: 32, damping: 11,
  driveGain: 1.65, driveRollFeedback: 0.40, driveRollCoupling: 2.0,
  driveStiffness: 90, driveDamping: 16,
  driveReactionSeconds: 0.60, recoveryReactionSeconds: 0.45,
  recoveryGain: 1.55, correctionSmoothing: 0.055,
});
export const trimFromPercent = percent => (clamp(percent, 0, 100) - 50) / 50 * MOVING.trimRange;
export const trimToPercent = trim => 50 + trim / MOVING.trimRange * 50;

function polygonArea(points) {
  return Math.abs(points.reduce((sum, p, i) => { const q = points[(i + 1) % points.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
}
const bladeArea = polygonArea(BLADE_OUTLINE);
export function immersedFraction(heights) {
  const clipped = [];
  for (let i = 0; i < BLADE_OUTLINE.length; i++) {
    const j = (i + 1) % BLADE_OUTLINE.length;
    const a = BLADE_OUTLINE[i], b = BLADE_OUTLINE[j], ha = heights[i], hb = heights[j];
    if (ha <= 0) clipped.push(a);
    if ((ha < 0 && hb > 0) || (ha > 0 && hb < 0)) {
      const t = ha / (ha - hb);
      clipped.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return clipped.length > 2 ? clamp(polygonArea(clipped) / bladeArea, 0, 1) : 0;
}

export function movingPose(reference, offset, lean, side) {
  const nominal = referenceHeight(reference, side);
  const ownSideRoll = -sideSign(side) * lean;
  // Exaggerated drive draw-path error: rolling up on the oar side increases
  // the excessive draw height, burying more shaft; a low draw reinforces a
  // dropped side and a high blade. The oar remains rigid in its fixed gate.
  // No such coupling is applied to the feathered recovery (load === 0).
  let height = clamp(nominal + offset + reference.load * MOVING.driveRollCoupling * ownSideRoll, 0.20, RIG.gateY + 0.90 * RIG.inboard);
  let rig = rigPose(height, side, reference.yaw, reference.feather);
  let bounds = bladeBounds(rig, lean);
  if (reference.missedCatch && reference.load > 0 && ['catch', 'drive'].includes(reference.phase) && offset < 0) {
    // A planned high-blade fault skips placement instead of entering normally
    // and then washing out. Raising the handle progressively restores entry.
    const normalBounds = bladeBounds(rigPose(nominal, side, reference.yaw, reference.feather));
    const strength = clamp(-offset / 0.070, 0, 1);
    const clearance = normalBounds.minY + (0.045 - normalBounds.minY) * strength;
    for (let i = 0; i < 10 && bounds.minY < clearance - 1e-7; i++) {
      height = clamp(height + (bounds.minY - clearance) * RIG.inboard / RIG.outboard, 0.20, RIG.gateY + 0.90 * RIG.inboard);
      rig = rigPose(height, side, reference.yaw, reference.feather);
      bounds = bladeBounds(rig, lean);
    }
  }
  const coverage = immersedFraction(bounds.heights);
  const shaftLength = RIG.outboard - 0.34;
  const c = Math.cos(lean), s = Math.sin(lean);
  const gateY = RIG.rootY - rig.gate.x * s + rig.gate.y * c;
  const shaftTip = rig.at(shaftLength);
  const tipY = RIG.rootY - shaftTip.x * s + shaftTip.y * c;
  const shaftWetFraction = gateY <= 0 ? tipY <= 0 ? 1 : clamp(-gateY / (tipY - gateY), 0, 1) : tipY >= 0 ? 0 : clamp(-tipY / (gateY - tipY), 0, 1);
  const surfacePoint = rig.at(shaftLength * (1 - shaftWetFraction));
  const shaftSurface = { x: surfacePoint.x * c + surfacePoint.y * s, z: surfacePoint.z };
  const drive = reference.phase === 'drive';
  const recovery = reference.phase === 'recovery';
  const missedWater = !!reference.missedCatch && ['catch', 'drive'].includes(reference.phase) && reference.load > 0 && coverage < 0.01;
  let bladeStatus = 'Transition';
  if (drive) bladeStatus = coverage < 0.01 ? bounds.minY > 0.10 ? 'Blade too high' : 'Blade out' : coverage < 0.98 || bounds.maxY > -0.005 ? 'Washing out' : shaftWetFraction > 0.40 ? 'Shaft buried' : -bounds.maxY > 0.075 ? 'Too deep' : 'Good depth';
  if (recovery) bladeStatus = bounds.minY < 0 ? 'Water contact' : bounds.minY < 0.025 ? 'Too close' : bounds.minY > 0.30 ? 'Too high' : 'Blade clear';
  if (drive && missedWater) bladeStatus = 'Missed the water';
  const level = Math.abs(lean) <= MOVING.tolerance;
  const bladeGood = bladeStatus === 'Good depth' || bladeStatus === 'Blade clear';
  // Airborne recovery has zero water force. This effective crew-carry model
  // represents the changing oar/rower/gate loads; it is not fluid dynamics.
  const waterForce = recovery ? Math.max(0, -bounds.minY) * 8 : reference.load * coverage;
  const bodyDrop = reference.load * clamp((0.65 - height) * 0.6, 0, 0.18);
  return { reference, rig, bounds, height, offset, coverage, missedWater, shaftWetFraction, shaftWetLength: shaftWetFraction * shaftLength, shaftSurface, bodyDrop, bladeStatus, bladeGood, level, good: bladeGood && level, waterForce };
}

export function advanceRoll(state, pose, dt) {
  const { reference, offset, bounds, waterForce } = pose;
  const gain = MOVING.recoveryGain * (1 - reference.load) + MOVING.driveGain * reference.load;
  const feedback = MOVING.driveRollFeedback * reference.load * clamp(Math.abs(offset) / 0.04, 0, 1);
  const desiredLean = -sideSign(state.side) * gain * offset + feedback * state.lean;
  // Only an actual recovery-water collision produces this extra restoring load.
  const collisionTorque = reference.phase === 'recovery' ? -bounds.x * waterForce : 0;
  const stiffness = MOVING.stiffness + reference.load * (MOVING.driveStiffness - MOVING.stiffness);
  const damping = MOVING.damping + reference.load * (MOVING.driveDamping - MOVING.damping);
  const acceleration = stiffness * (desiredLean - state.lean) - damping * state.velocity + collisionTorque;
  state.velocity += acceleration * dt;
  state.lean += state.velocity * dt;
  if (Math.abs(state.lean) > MOVING.maxLean) { state.lean = Math.sign(state.lean) * MOVING.maxLean; state.velocity = 0; }
}
