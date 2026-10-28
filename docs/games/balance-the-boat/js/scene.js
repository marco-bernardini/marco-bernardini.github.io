import * as THREE from '../assets/vendor/three.module.min.js';
import { RIG, oarPose, bladeContact, sideSign } from './balance.js';
import { BLADE_OUTLINE } from './stroke.js';

const vec = p => new THREE.Vector3(p.x, p.y, p.z);
const Y = new THREE.Vector3(0, 1, 0);
const material = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.68, metalness: 0, ...extra });

export function createScene(canvas, viewport, onFailure, options = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.localClippingEnabled = !!options.moving;
  renderer.setClearColor(0xe8efec);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xe8efec, 13, 30);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x739799, 2.7));
  const sun = new THREE.DirectionalLight(0xfff5da, 3.1);
  sun.position.set(-3, 7, 4);
  scene.add(sun);
  const camera = new THREE.OrthographicCamera(-3.7, 3.7, 2, -2, 0.1, 50);
  camera.position.set(0, 3.25, 7.8);
  camera.lookAt(0, 0.55, 0);

  const gold = material(0xe8b749);
  const ivory = material(0xfff4cf);
  const graphite = material(0x234a58);
  const teal = material(0x278d86);
  const grip = material(0xffa51f, { emissive: 0xff9700, emissiveIntensity: 0.35 });
  const body = material(0x739db1, { transparent: true, opacity: 0.40, depthWrite: false });
  const skin = material(0xadc1c7, { transparent: true, opacity: 0.43, depthWrite: false });
  const shorts = material(0x436d83, { transparent: true, opacity: 0.43, depthWrite: false });
  const hair = material(0x3f677a, { transparent: true, opacity: 0.48, depthWrite: false });

  function mesh(geometry, mat, parent = scene) {
    const item = new THREE.Mesh(geometry, mat);
    parent.add(item);
    return item;
  }
  const sphereGeometry = new THREE.SphereGeometry(1, 24, 16);
  const cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 12);
  function ellipsoid(parent, mat, position, scale) {
    const item = mesh(sphereGeometry, mat, parent);
    item.position.set(...position);
    item.scale.set(...scale);
    return item;
  }
  function rod(parent, mat, radius = 0.025) {
    const item = mesh(cylinderGeometry, mat, parent);
    item.userData.radius = radius;
    return item;
  }
  function connect(item, a, b) {
    const delta = new THREE.Vector3().subVectors(b, a);
    item.position.copy(a).add(b).multiplyScalar(0.5);
    item.quaternion.setFromUnitVectors(Y, delta.clone().normalize());
    item.scale.set(item.userData.radius, delta.length(), item.userData.radius);
  }
  function line(points, color, opacity = 1, parent = scene) {
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const item = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: false }));
    parent.add(item);
    return item;
  }

  // Quiet, static water: a fixed reference, not a periodic disturbance.
  const water = mesh(new THREE.PlaneGeometry(70, 50), material(0xd7e7e3, { transparent: true, opacity: options.moving ? 0.40 : 0.74, depthWrite: false }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.01;
  water.renderOrder = -3;
  const waterLines = [];
  for (let row = 0; row < 20; row++) {
    const z = -12 + row * 1.1;
    const points = Array.from({ length: 65 }, (_, i) => new THREE.Vector3(-14 + i * 0.44, 0.002, z + Math.sin(i * 0.5 + row) * 0.018));
    waterLines.push(line(points, 0x86b4b3, 0.20));
  }
  line([new THREE.Vector3(-12, 0.008, -0.05), new THREE.Vector3(12, 0.008, -0.05)], 0x80aaa9, 0.38);
  for (let i = 0; i < 18; i++) {
    const x = Math.sin(i * 12.3) * 6;
    const z = Math.cos(i * 4.7) * 4.6;
    line([new THREE.Vector3(x, 0.005, z), new THREE.Vector3(x + 0.12 + (i % 3) * 0.08, 0.005, z)], 0xffffff, 0.65);
  }

  const boat = new THREE.Group();
  boat.position.y = RIG.rootY;
  scene.add(boat);
  const halfLength = 3.05;
  const widthAt = z => 0.36 * Math.pow(Math.max(0, 1 - (z / halfLength) ** 2), 0.72);
  const hullPositions = [], hullIndices = [];
  const longitudinal = 56, cross = 18;
  for (let i = 0; i <= longitudinal; i++) {
    const z = -halfLength + i / longitudinal * 2 * halfLength;
    for (let j = 0; j <= cross; j++) {
      const angle = j / cross * Math.PI;
      hullPositions.push(widthAt(z) * Math.cos(angle), 0.22 - 0.4 * Math.sin(angle), z);
      if (i < longitudinal && j < cross) {
        const a = i * (cross + 1) + j, b = a + cross + 1;
        hullIndices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  const hullGeometry = new THREE.BufferGeometry();
  hullGeometry.setAttribute('position', new THREE.Float32BufferAttribute(hullPositions, 3));
  hullGeometry.setIndex(hullIndices);
  hullGeometry.computeVertexNormals();
  mesh(hullGeometry, material(0xe8b749, { side: THREE.DoubleSide }), boat);
  for (const sign of [-1, 1]) {
    const points = Array.from({ length: 65 }, (_, i) => {
      const z = -halfLength + i / 64 * halfLength * 2;
      return new THREE.Vector3(sign * widthAt(z), 0.225, z);
    });
    mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 80, 0.018, 6, false), ivory, boat);
  }
  for (const [start, end] of [[-3.05, -1.35], [0.75, 3.05]]) {
    const positions = [], indices = [];
    for (let i = 0; i <= 30; i++) {
      const z = start + (end - start) * i / 30;
      positions.push(-widthAt(z), 0.215, z, widthAt(z), 0.215, z);
      if (i < 30) { const n = i * 2; indices.push(n, n + 2, n + 1, n + 1, n + 2, n + 3); }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    mesh(geometry, material(0xefc35c, { side: THREE.DoubleSide }), boat);
  }
  // Cockpit, slide, seat and stretcher give the silhouette a rowing-shell shape.
  const floor = mesh(new THREE.BoxGeometry(0.48, 0.04, 1.9), graphite, boat);
  floor.position.set(0, 0.06, -0.3);
  for (const x of [-0.14, 0.14]) {
    const rail = rod(boat, ivory, 0.014);
    connect(rail, new THREE.Vector3(x, 0.28, -0.65), new THREE.Vector3(x, 0.28, 0.38));
  }
  const seat = mesh(new THREE.BoxGeometry(0.42, 0.09, 0.29), graphite, boat);
  seat.position.set(0, 0.35, 0.12);
  const stretcher = mesh(new THREE.BoxGeometry(0.42, 0.06, 0.3), graphite, boat);
  stretcher.position.set(0, 0.23, -1.1);
  stretcher.rotation.x = 0.35;
  const rigger = new THREE.Group(); boat.add(rigger);
  const riggerArms = [rod(rigger, graphite, 0.026), rod(rigger, graphite, 0.026)];
  const pin = rod(rigger, ivory, 0.035);
  const gateRing = mesh(new THREE.TorusGeometry(0.072, 0.018, 8, 20), teal, rigger);
  gateRing.rotation.x = Math.PI / 2;

  const rower = new THREE.Group(); boat.add(rower);
  const hips = ellipsoid(rower, shorts, [0, 0.51, 0.16], [0.23, 0.15, 0.19]);
  const upperBody = new THREE.Group(); upperBody.position.set(0, 0.51, 0.16); rower.add(upperBody);
  const upperPart = (mat, position, scale) => ellipsoid(upperBody, mat, [position[0], position[1] - 0.51, position[2] - 0.16], scale);
  const torso = upperPart(body, [0, 0.94, 0.23], [0.245, 0.35, 0.16]);
  torso.rotation.x = 0.13;
  upperPart(skin, [0, 1.29, 0.28], [0.075, 0.10, 0.075]);
  upperPart(skin, [0, 1.53, 0.32], [0.205, 0.235, 0.19]);
  const hairCap = mesh(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.56), hair, upperBody);
  hairCap.position.set(0, 1.06, 0.17); hairCap.scale.set(0.212, 0.21, 0.196);
  const legs = [];
  for (const sign of [-1, 1]) {
    upperPart(skin, [sign * 0.202, 1.52, 0.32], [0.038, 0.055, 0.035]);
    const hip = new THREE.Vector3(sign * 0.14, 0.51, 0.12);
    const knee = new THREE.Vector3(sign * 0.16, 0.42, -0.45);
    const ankle = new THREE.Vector3(sign * 0.15, 0.27, -1.03);
    const upper = rod(rower, shorts, 0.102), lower = rod(rower, skin, 0.073);
    const joint = ellipsoid(rower, skin, knee.toArray(), [0.085, 0.085, 0.085]);
    connect(upper, hip, knee); connect(lower, knee, ankle);
    legs.push({ sign, hip, ankle, upper, lower, joint });
    ellipsoid(rower, material(0xc8d6d5, { transparent: true, opacity: 0.48, depthWrite: false }), [sign * 0.15, 0.27, -1.12], [0.087, 0.064, 0.17]);
  }
  const arms = [-1, 1].map(sign => ({
    sign,
    shoulder: new THREE.Vector3(sign * 0.225, 0.62, 0.04),
    upper: rod(upperBody, body, 0.075), forearm: rod(upperBody, skin, 0.06),
    elbow: ellipsoid(upperBody, skin, [0, 0, 0], [0.072, 0.072, 0.072]),
    hand: ellipsoid(upperBody, skin, [0, 0, 0], [0.065, 0.065, 0.065]),
  }));
  arms.forEach(arm => ellipsoid(upperBody, body, arm.shoulder.toArray(), [0.10, 0.10, 0.10]));

  const shaftMaterial = options.moving ? graphite.clone() : graphite;
  if (options.moving) shaftMaterial.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)];
  const shaft = rod(boat, shaftMaterial, 0.025);
  const submergedShaft = options.moving ? rod(boat, material(0x3d9fb3, { clippingPlanes: [new THREE.Plane(new THREE.Vector3(0, -1, 0), 0)] }), 0.025) : null;
  const sleeve = rod(boat, teal, 0.039);
  const handle = rod(boat, grip, 0.045);
  const handleBands = [rod(boat, graphite, 0.047), rod(boat, graphite, 0.047)];
  // Blade length is along its local X axis. Y is the feathered thickness.
  const shape = new THREE.Shape(BLADE_OUTLINE.map(p => new THREE.Vector2(...p)));
  const bladeGeometry = new THREE.ExtrudeGeometry(shape, { depth: RIG.bladeHalfThickness * 2, bevelEnabled: false, steps: 1 });
  // Extrusion originally along Z; lay the broad face into the XZ plane.
  bladeGeometry.rotateX(-Math.PI / 2);
  bladeGeometry.translate(0, -RIG.bladeHalfThickness, 0);
  const bladeMaterial = options.moving ? teal.clone() : teal;
  if (options.moving) bladeMaterial.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)];
  const bladeMesh = mesh(bladeGeometry, bladeMaterial, boat);
  let submergedBlade = null;
  if (options.moving) {
    submergedBlade = mesh(bladeGeometry, material(0x3d9fb3, { clippingPlanes: [new THREE.Plane(new THREE.Vector3(0, -1, 0), 0)] }), boat);
  }
  const bladeStripe = mesh(new THREE.BoxGeometry(0.09, 0.029, 0.30), ivory, bladeMesh);
  bladeStripe.position.x = 0.14;

  const ripples = [0.22, 0.34].map(radius => {
    const item = mesh(new THREE.RingGeometry(radius, radius + 0.008, 64), new THREE.MeshBasicMaterial({ color: 0x70aaa8, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }));
    item.rotation.x = -Math.PI / 2; item.scale.set(1.6, 0.55, 1); item.position.y = 0.009;
    return item;
  });
  const waterGuide = line([new THREE.Vector3(-0.5, 0.012, 0), new THREE.Vector3(0.5, 0.012, 0)], 0xffffff, 0.85);
  waterGuide.visible = !!options.moving;

  let width = 1, height = 1, viewSide = 'bow';
  function frameCamera() {
    // On a phone, frame the active rig instead of spending half the canvas
    // on empty water opposite the oar. The camera still looks straight aft.
    const compact = width < 450;
    const centerX = compact ? sideSign(viewSide) * 0.98 : 0;
    const halfWidth = compact ? 2.4 : 3.65;
    const halfHeight = halfWidth * height / width;
    camera.position.x = centerX;
    camera.lookAt(centerX, options.moving ? 0.10 : 0.55, 0);
    camera.left = -halfWidth; camera.right = halfWidth;
    camera.top = halfHeight; camera.bottom = -halfHeight;
    camera.updateProjectionMatrix();
  }
  function resize() {
    width = Math.max(1, viewport.clientWidth); height = Math.max(1, viewport.clientHeight);
    frameCamera();
    renderer.setSize(width, height, false);
  }
  const observer = new ResizeObserver(resize); observer.observe(viewport); resize();
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); onFailure(); });

  function update(state) {
    if (state.side !== viewSide) { viewSide = state.side; frameCamera(); }
    boat.rotation.z = -state.lean;
    const moving = state.pose;
    const pose = moving ? moving.rig : oarPose(state.height, state.side);
    if (moving) {
      const reference = moving.reference;
      upperBody.position.y = 0.51 - moving.bodyDrop;
      upperBody.position.z = 0.16 + reference.seat;
      upperBody.rotation.x = reference.body - moving.bodyDrop * 0.6;
      hips.position.z = 0.16 + reference.seat;
      seat.position.z = 0.12 + reference.seat;
      for (const leg of legs) {
        const hip = leg.hip.clone(); hip.z += reference.seat;
        const delta = leg.ankle.clone().sub(hip), distance = delta.length(), axis = delta.clone().normalize();
        const along = (0.60 ** 2 - 0.59 ** 2 + distance ** 2) / (2 * distance);
        const bend = Y.clone().addScaledVector(axis, -axis.y).normalize();
        const knee = hip.clone().addScaledVector(axis, along).addScaledVector(bend, Math.sqrt(Math.max(0, 0.60 ** 2 - along ** 2)));
        connect(leg.upper, hip, knee); connect(leg.lower, knee, leg.ankle); leg.joint.position.copy(knee);
      }
      waterLines.forEach(item => { item.position.z = -(state.time * 0.3 % 1.1); });
    }
    const sign = sideSign(state.side), gate = vec(pose.gate);
    for (let i = 0; i < 2; i++) connect(riggerArms[i], new THREE.Vector3(sign * 0.29, 0.24, i ? 0.27 : -0.62), gate);
    connect(pin, gate.clone().add(new THREE.Vector3(0, -0.06, 0)), gate.clone().add(new THREE.Vector3(0, 0.08, 0)));
    gateRing.position.copy(gate);
    connect(shaft, vec(pose.handle), vec(pose.at(RIG.outboard - 0.24)));
    if (submergedShaft) connect(submergedShaft, vec(pose.handle), vec(pose.at(RIG.outboard - 0.24)));
    connect(sleeve, vec(pose.at(-0.12)), vec(pose.at(0.15)));
    connect(handle, vec(pose.at(-RIG.inboard)), vec(pose.at(-RIG.inboard + 0.34)));
    for (let i = 0; i < 2; i++) {
      const distance = -RIG.inboard + (i ? 0.315 : 0.015);
      connect(handleBands[i], vec(pose.at(distance)), vec(pose.at(distance + 0.012)));
    }
    bladeMesh.position.copy(vec(pose.blade));
    // Align blade length to shaft; its broad face remains feathered, not squared.
    const xAxis = vec(pose.direction);
    const zAxis = moving ? vec(pose.zAxis) : new THREE.Vector3().crossVectors(xAxis, Y).normalize();
    const yAxis = moving ? vec(pose.yAxis) : new THREE.Vector3().crossVectors(zAxis, xAxis).normalize();
    bladeMesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis));
    if (submergedBlade) { submergedBlade.position.copy(bladeMesh.position); submergedBlade.quaternion.copy(bladeMesh.quaternion); }

    for (const arm of arms) {
      const outside = arm.sign === -sign;
      const wrist = vec(pose.at(-RIG.inboard + (outside ? 0.06 : 0.26))).sub(upperBody.position).applyAxisAngle(new THREE.Vector3(1, 0, 0), -upperBody.rotation.x);
      const delta = wrist.clone().sub(arm.shoulder);
      const distance = delta.length(), axis = delta.clone().normalize();
      const upperLength = 0.45, foreLength = 0.45;
      const along = Math.min(upperLength, (upperLength ** 2 - foreLength ** 2 + distance ** 2) / (2 * distance));
      const bend = new THREE.Vector3(arm.sign, -0.15, 0.7);
      bend.addScaledVector(axis, -bend.dot(axis)).normalize();
      const elbow = arm.shoulder.clone().addScaledVector(axis, along).addScaledVector(bend, Math.sqrt(Math.max(0, upperLength ** 2 - along ** 2)));
      connect(arm.upper, arm.shoulder, elbow); connect(arm.forearm, elbow, wrist);
      arm.elbow.position.copy(elbow); arm.hand.position.copy(wrist);
    }
    const contact = moving ? { ...moving.bounds, force: moving.waterForce } : bladeContact(state.height, state.lean, state.side);
    ripples.forEach(item => { item.position.x = contact.x; item.position.z = contact.z; item.visible = contact.force > 0; });
    if (moving) {
      const surface = moving.shaftWetFraction > 0 ? moving.shaftSurface : contact;
      waterGuide.position.set(surface.x, 0, surface.z);
    }
    renderer.render(scene, camera);
  }
  function dispose() {
    observer.disconnect();
    const geometries = new Set(), materials = new Set();
    scene.traverse(item => { if (item.geometry) geometries.add(item.geometry); if (item.material) materials.add(item.material); });
    geometries.forEach(item => item.dispose()); materials.forEach(item => item.dispose()); renderer.dispose();
  }
  return { update, dispose };
}
