import { RIG, clamp, sideSign } from './balance.js';

// The same perimeter creates the mesh and measures its immersed area.
const outline = [[-0.34, -0.075], [-0.19, -0.17]];
function quadratic(a, b, c) {
  for (let i = 1; i <= 12; i++) {
    const t = i / 12, u = 1 - t;
    outline.push([u * u * a[0] + 2 * u * t * b[0] + t * t * c[0], u * u * a[1] + 2 * u * t * b[1] + t * t * c[1]]);
  }
}
quadratic([-0.19, -0.17], [0.30, -0.21], [0.36, -0.12]);
outline.push([0.36, 0.16]);
quadratic([0.36, 0.16], [0.12, 0.20], [-0.34, 0.075]);
export const BLADE_OUTLINE = Object.freeze(outline.map(p => Object.freeze(p)));
export const smooth = t => { const x = clamp(t, 0, 1); return x * x * (3 - 2 * x); };
export const mix = (a, b, t) => a + (b - a) * t;

export function strokeAt(time, rate = 8) {
  const cycleSeconds = 60 / rate;
  const cycle = Math.floor((time + 1e-9) / cycleSeconds);
  const fraction = clamp((time - cycle * cycleSeconds) / cycleSeconds, 0, 1);
  let phase, progress, phaseFraction;
  if (fraction < 0.05) { phase = 'catch'; progress = fraction / 0.05; phaseFraction = 0.05; }
  else if (fraction < 0.34) { phase = 'drive'; progress = (fraction - 0.05) / 0.29; phaseFraction = 0.29; }
  else if (fraction < 0.40) { phase = 'release'; progress = (fraction - 0.34) / 0.06; phaseFraction = 0.06; }
  else { phase = 'recovery'; progress = (fraction - 0.40) / 0.60; phaseFraction = 0.60; }
  return { cycle, fraction, cycleSeconds, phase, progress, phaseSeconds: phaseFraction * cycleSeconds, phaseElapsed: progress * phaseFraction * cycleSeconds };
}

export function strokePose(clock) {
  const { phase, progress: q } = clock;
  let extension, body, feather, clearance = null, topDepth = null, lift = null, load;
  if (phase === 'drive') {
    extension = smooth(q);
    body = mix(-0.40, 0.10, smooth((q - 0.35) / 0.55));
    feather = Math.PI / 2; topDepth = 0.045;
    load = 1;
  } else if (phase === 'release') {
    extension = 1; body = 0.10;
    feather = Math.PI / 2 * (1 - smooth((q - 0.6) / 0.4));
    load = 1 - smooth(q / 0.6);
    if (q < 0.6) lift = smooth(q / 0.6);
    else clearance = mix(0.07, 0.115, smooth((q - 0.6) / 0.4));
  } else if (phase === 'recovery') {
    // Hands away and body preparation precede most seat travel.
    extension = 1 - smooth((q - 0.23) / 0.77);
    body = mix(0.10, -0.40, smooth(q / 0.44));
    feather = 0; clearance = 0.115; load = 0;
  } else {
    extension = 0; body = -0.40;
    feather = Math.PI / 2 * smooth(q / 0.45);
    load = smooth((q - 0.45) / 0.55);
    if (q < 0.45) clearance = mix(0.115, 0.07, smooth(q / 0.45));
    else lift = 1 - smooth((q - 0.45) / 0.55);
  }
  // A slightly quicker hand return gives the recovery its hands/body/slide sequence.
  const sweep = phase === 'recovery' ? 1 - smooth(q) : extension;
  return { ...clock, yaw: mix(1.08, -0.42, sweep), seat: mix(-0.38, 0, extension), body, feather, clearance, topDepth, lift, load };
}

export function rigPose(height, side, yaw, feather = 0) {
  const sign = sideSign(side);
  const dy = clamp((RIG.gateY - height) / RIG.inboard, -0.9, 0.9);
  const horizontal = Math.sqrt(1 - dy * dy);
  const direction = { x: sign * horizontal * Math.cos(yaw), y: dy, z: horizontal * Math.sin(yaw) };
  const gate = { x: sign * RIG.gateX, y: RIG.gateY, z: RIG.gateZ };
  const at = d => ({ x: gate.x + direction.x * d, y: gate.y + direction.y * d, z: gate.z + direction.z * d });
  const flatZ = { x: -direction.z / horizontal, y: 0, z: direction.x / horizontal };
  const flatY = { x: -flatZ.z * dy, y: horizontal, z: flatZ.x * dy };
  const c = Math.cos(feather), s = Math.sin(feather);
  const yAxis = { x: flatY.x * c + flatZ.x * s, y: flatY.y * c, z: flatY.z * c + flatZ.z * s };
  const zAxis = { x: flatZ.x * c - flatY.x * s, y: -flatY.y * s, z: flatZ.z * c - flatY.z * s };
  return { gate, direction, yAxis, zAxis, handle: at(-RIG.inboard), blade: at(RIG.outboard), at };
}

export function bladeBounds(rig, lean = 0) {
  const c = Math.cos(lean), s = Math.sin(lean);
  const centerY = RIG.rootY - rig.blade.x * s + rig.blade.y * c;
  const ux = -rig.direction.x * s + rig.direction.y * c;
  const uz = -rig.zAxis.x * s + rig.zAxis.y * c;
  const thickness = RIG.bladeHalfThickness * Math.abs(-rig.yAxis.x * s + rig.yAxis.y * c);
  const heights = BLADE_OUTLINE.map(([x, y]) => centerY + x * ux - y * uz);
  return {
    minY: Math.min(...heights) - thickness, maxY: Math.max(...heights) + thickness,
    heights, centerY,
    x: rig.blade.x * c + rig.blade.y * s, z: rig.blade.z,
  };
}

export function referenceHeight(reference, side) {
  // Newton iterations use the exact shared perimeter, including blade rotation.
  let height = 0.78;
  for (let i = 0; i < 8; i++) {
    const bounds = bladeBounds(rigPose(height, side, reference.yaw, reference.feather));
    const actual = reference.lift !== null ? mix(bounds.maxY, bounds.minY, reference.lift) : reference.clearance === null ? bounds.maxY : bounds.minY;
    const target = reference.lift !== null ? mix(-0.045, 0.07, reference.lift) : reference.clearance === null ? -reference.topDepth : reference.clearance;
    height += (actual - target) * RIG.inboard / RIG.outboard;
  }
  return height;
}
