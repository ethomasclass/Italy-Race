import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/**
 * The brother — a posable figure built for close quarters.
 *
 * Two structural decisions:
 *
 * 1. Joints are a hierarchy of empty Groups and geometry hangs off them, so a pose
 *    is a table of rotations rather than a rebuild. Rigid parts on a joint chain,
 *    the same pattern the car's steering and wheels already use — at this
 *    stylisation the joint seams read as deliberate, and skinning would buy very
 *    little for a great deal of machinery.
 *
 * 2. The head carries a disproportionate share of the budget, because it is what
 *    you sit beside at 60 cm for two hours. Brows and mouth matter more than
 *    polygon count: they are what makes a face read as a person rather than a
 *    mannequin, and they cost almost nothing.
 *
 * Rest pose is standing, arms down. Origin is the hip. The figure faces -X, the
 * same way the car does.
 */

const C = {
  skin: 0xc0916c,
  skinShadow: 0xb4855f,   // jaw, a day-old beard — barely off the skin tone
  brow: 0x4a3728,
  eyeWhite: 0xe8e2d6,
  iris: 0x3b2a1c,
  mouth: 0x8a5f4a,
  shirt: 0xd6d0bd,
  trouser: 0x474751,
  hair: 0x2b2420,
  shoe: 0x2c2622,
};

// Rest-pose joint offsets, each relative to its parent, in metres.
const SKELETON = {
  pelvis:    { parent: null,     at: [0, 0, 0] },
  spine:     { parent: 'pelvis', at: [0, 0.115, 0] },
  chest:     { parent: 'spine',  at: [-0.012, 0.215, 0] },
  neck:      { parent: 'chest',  at: [-0.012, 0.235, 0] },
  head:      { parent: 'neck',   at: [0.004, 0.092, 0] },
  shoulderL: { parent: 'chest',  at: [-0.008, 0.148, -0.170] },
  elbowL:    { parent: 'shoulderL', at: [0, -0.285, 0] },
  wristL:    { parent: 'elbowL',    at: [0, -0.250, 0] },
  shoulderR: { parent: 'chest',  at: [-0.008, 0.148, 0.170] },
  elbowR:    { parent: 'shoulderR', at: [0, -0.285, 0] },
  wristR:    { parent: 'elbowR',    at: [0, -0.250, 0] },
  hipL:      { parent: 'pelvis', at: [-0.010, -0.030, -0.085] },
  kneeL:     { parent: 'hipL',   at: [0, -0.440, 0] },
  ankleL:    { parent: 'kneeL',  at: [0, -0.415, 0] },
  hipR:      { parent: 'pelvis', at: [-0.010, -0.030, 0.085] },
  kneeR:     { parent: 'hipR',   at: [0, -0.440, 0] },
  ankleR:    { parent: 'kneeR',  at: [0, -0.415, 0] },
};

/**
 * Poses are rotations from the rest pose, in radians, as [x, y, z].
 * Anything omitted stays at rest.
 */
export const POSES = {
  // Sitting in the car: thighs forward, shins down, one arm on the sill and the
  // other hand in the lap.
  seated: {
    spine: [0, 0, 0.05], chest: [0, 0, -0.03],
    hipL: [0.04, 0, -1.50], kneeL: [0, 0, 1.36], ankleL: [0, 0, 0.16],
    hipR: [-0.04, 0, -1.50], kneeR: [0, 0, 1.32], ankleR: [0, 0, 0.16],
    shoulderL: [0, 0, -0.30], elbowL: [0, 0.35, -0.85],
    shoulderR: [0, 0, 0.24], elbowR: [0, -0.55, -1.05],
  },
  // The same, slumped — for the quiet legs.
  seatedSlouched: {
    spine: [0, 0, 0.16], chest: [0, 0, -0.06], neck: [0, 0, 0.10],
    hipL: [0.06, 0, -1.42], kneeL: [0, 0, 1.20], ankleL: [0, 0, 0.20],
    hipR: [-0.06, 0, -1.40], kneeR: [0, 0, 1.16], ankleR: [0, 0, 0.20],
    shoulderL: [0, 0, -0.36], elbowL: [0, 0.30, -0.72],
    shoulderR: [0, 0, 0.30], elbowR: [0, -0.45, -0.90],
  },
  standing: {
    shoulderL: [0, 0, -0.06], shoulderR: [0, 0, 0.06],
    elbowL: [0, 0.10, -0.18], elbowR: [0, -0.10, -0.18],
  },
  // Leaning on the car with a forearm along the roof. Abduction is rotation about
  // X — swinging the arm out sideways — not Z, which just throws it forward.
  // The roof sits at almost exactly standing shoulder height, so the arm goes out,
  // not up.
  leaning: {
    spine: [0, 0, -0.08], chest: [0, 0.12, 0],
    hipL: [0, 0, 0.10], kneeL: [0, 0, -0.14],
    hipR: [0, 0, -0.14], kneeR: [0, 0, 0.20],
    shoulderR: [-1.30, 0, 0.12], elbowR: [0, 0, -1.05],
    shoulderL: [0, 0, -0.12], elbowL: [0, 0.25, -0.38],
  },
  // Hands in pockets, weight on one leg, looking out at something.
  atRoadside: {
    spine: [0, -0.06, -0.04], chest: [0, 0.14, 0],
    hipL: [0, 0, 0.06], hipR: [0, 0, -0.12], kneeR: [0, 0, 0.20],
    // Elbows out and back, forearms angled in to the hip — hands in pockets.
    shoulderL: [0.42, 0, -0.30], elbowL: [0, 0, -1.28],
    shoulderR: [-0.42, 0, 0.30], elbowR: [0, 0, -1.28],
  },
};

function taper(len, rA, rB, mat, seg = 8) {
  const geo = new THREE.CylinderGeometry(rB, rA, len, seg, 1);
  geo.translate(0, -len / 2, 0);   // hangs from the joint, down its local -Y
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  return m;
}

/**
 * The head. Brows, a mouth and an almond eye do more for likeness at this scale
 * than any amount of extra geometry elsewhere, so they get built explicitly.
 */
function buildHead(mat) {
  const g = new THREE.Group();
  const put = (m, x, y, z) => { m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };

  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.100, 18, 14), mat.skin);
  skull.scale.set(0.98, 1.02, 0.77);
  put(skull, -0.004, 0.022, 0);

  // Jaw shares the skull's width and tucks under it, in a slightly darker tone so
  // the beard line reads without a texture.
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.082, 14, 12), mat.stubble);
  jaw.scale.set(0.88, 0.68, 0.73);
  put(jaw, -0.020, -0.038, 0);

  // Feature placement is computed against the ellipsoid surfaces above, not eyeballed:
  // an earlier pass had the mouth 8 mm inside the jaw and the iris 5 mm proud of the
  // eye, which is why the face read as a mannequin with dots on it.

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.019, 0.052, 5), mat.skin);
  nose.rotation.z = -Math.PI / 2;
  nose.rotation.y = Math.PI / 4;
  nose.scale.set(1, 0.58, 0.72);
  put(nose, -0.098, 0.008, 0);           // skull surface here is -0.1011

  for (const s of [-1, 1]) {
    // One dark almond, flush with the skull. Splitting it into white plus iris made
    // the eye bulge; at this scale the whole eye reads better as a single form.
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), mat.iris);
    eye.scale.set(0.22, 0.44, 0.78);
    eye.rotation.x = s * 0.10;
    put(eye, -0.0918, 0.030, s * 0.032);  // surface here is -0.0928

    // Brows do most of the expression. Thin and angled, not heavy bars.
    const brow = new THREE.Mesh(new RoundedBoxGeometry(0.011, 0.0065, 0.040, 2, 0.003), mat.brow);
    brow.rotation.x = s * 0.07;
    brow.rotation.y = s * -0.13;
    put(brow, -0.0878, 0.049, s * 0.033);  // surface here is -0.0887

    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.021, 8, 6), mat.skin);
    ear.scale.set(0.34, 1.0, 0.60);
    put(ear, 0.006, 0.012, s * 0.075);
  }

  // Mouth: a shallow line on the jaw surface, with the faintest lower lip under it.
  const mouth = new THREE.Mesh(new RoundedBoxGeometry(0.008, 0.0055, 0.040, 2, 0.002), mat.mouth);
  put(mouth, -0.0912, -0.040, 0);        // jaw surface here is -0.0921
  const lip = new THREE.Mesh(new THREE.SphereGeometry(0.017, 10, 8), mat.skin);
  lip.scale.set(0.26, 0.22, 0.80);
  put(lip, -0.0882, -0.051, 0);

  // Hair: a shell swept back off the brow, with a nape behind so the crown is not
  // an open hemisphere from behind.
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(0.106, 16, 14, 0, Math.PI * 2, 0, Math.PI * 0.52), mat.hair);
  cap.scale.set(1.00, 1.02, 0.82);
  cap.rotation.z = -0.30;
  put(cap, 0.008, 0.030, 0);

  const nape = new THREE.Mesh(new THREE.SphereGeometry(0.096, 14, 12), mat.hair);
  nape.scale.set(0.78, 0.92, 0.80);
  put(nape, 0.038, 0.018, 0);

  return g;
}

export function buildPassenger({ style = 'toon', ramp = null, pose = 'seated' } = {}) {
  const surface = (color, rough = 0.85) =>
    style === 'toon'
      ? new THREE.MeshToonMaterial({ color, gradientMap: ramp })
      : new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 });

  const mat = {
    skin: surface(C.skin, 0.72), stubble: surface(C.skinShadow, 0.80),
    brow: surface(C.brow, 0.9), eyeWhite: surface(C.eyeWhite, 0.35),
    iris: surface(C.iris, 0.3), mouth: surface(C.mouth, 0.7),
    shirt: surface(C.shirt), trouser: surface(C.trouser),
    hair: surface(C.hair, 0.95), shoe: surface(C.shoe),
  };

  // --- Build the joint hierarchy ---
  const joints = {};
  const root = new THREE.Group();
  for (const [name, def] of Object.entries(SKELETON)) {
    const g = new THREE.Group();
    g.name = name;
    g.position.fromArray(def.at);
    joints[name] = g;
    (def.parent ? joints[def.parent] : root).add(g);
  }
  // Rest rotations, so a pose can be swapped without accumulating.
  const rest = {};
  for (const name of Object.keys(joints)) rest[name] = [0, 0, 0];

  const attach = (jointName, mesh) => { joints[jointName].add(mesh); return mesh; };
  const seg = (jointName, childName, rA, rB, m) => {
    const len = Math.abs(SKELETON[childName].at[1]);
    return attach(jointName, taper(len, rA, rB, m));
  };

  // --- Torso ---
  const pelvis = new THREE.Mesh(new RoundedBoxGeometry(0.215, 0.17, 0.315, 2, 0.055), mat.trouser);
  pelvis.position.set(0, 0.045, 0);
  attach('pelvis', pelvis);

  const abdomen = new THREE.Mesh(new RoundedBoxGeometry(0.200, 0.22, 0.285, 2, 0.06), mat.shirt);
  abdomen.position.set(0, 0.10, 0);
  attach('spine', abdomen);

  const chestMesh = new THREE.Mesh(new RoundedBoxGeometry(0.215, 0.26, 0.325, 2, 0.075), mat.shirt);
  chestMesh.position.set(-0.006, 0.105, 0);
  attach('chest', chestMesh);

  for (const s of [-1, 1]) {
    const delt = new THREE.Mesh(new THREE.SphereGeometry(0.056, 10, 8), mat.shirt);
    delt.scale.set(0.86, 0.82, 0.90);
    delt.position.set(-0.008, 0.128, s * 0.156);
    attach('chest', delt);
  }

  seg('neck', 'head', 0.052, 0.047, mat.skin).position.y = 0.092;
  attach('head', buildHead(mat));

  // --- Limbs ---
  for (const S of ['L', 'R']) {
    const s = S === 'L' ? -1 : 1;
    seg('shoulder' + S, 'elbow' + S, 0.053, 0.042, mat.shirt);
    seg('elbow' + S, 'wrist' + S, 0.042, 0.030, mat.skin);
    const hand = new THREE.Mesh(new RoundedBoxGeometry(0.075, 0.038, 0.10, 2, 0.016), mat.skin);
    hand.position.set(0, -0.040, 0);
    hand.rotation.z = s * 0.10;
    attach('wrist' + S, hand);

    seg('hip' + S, 'knee' + S, 0.088, 0.064, mat.trouser);
    seg('knee' + S, 'ankle' + S, 0.060, 0.043, mat.trouser);
    const shoe = new THREE.Mesh(new RoundedBoxGeometry(0.095, 0.055, 0.20, 2, 0.02), mat.shoe);
    shoe.position.set(0, -0.026, -0.052);
    attach('ankle' + S, shoe);
  }

  // --- Pose and idle ---
  function setPose(name) {
    const p = POSES[name] || {};
    for (const jn of Object.keys(joints)) {
      const r = p[jn] || rest[jn];
      joints[jn].rotation.set(r[0], r[1], r[2]);
    }
    basePose = p;
  }
  let basePose = {};
  setPose(pose);

  let t = 0;
  const look = { yaw: 0, pitch: 0 };
  const setHeadLook = (yaw, pitch = 0) => {
    look.yaw = THREE.MathUtils.clamp(yaw, -1.1, 1.1);
    look.pitch = THREE.MathUtils.clamp(pitch, -0.5, 0.5);
  };

  function update(dt) {
    t += dt;
    const breath = Math.sin(t * 1.15) * 0.5 + 0.5;
    const spineRest = (basePose.spine || rest.spine)[2];
    joints.spine.rotation.z = spineRest - breath * 0.010;
    chestMesh.scale.set(1, 1 + breath * 0.018, 1 + breath * 0.012);

    const driftY = Math.sin(t * 0.31) * 0.05 + Math.sin(t * 0.13) * 0.03;
    const driftX = Math.sin(t * 0.23 + 1.7) * 0.025;
    joints.head.rotation.y += ((look.yaw + driftY) - joints.head.rotation.y) * Math.min(1, dt * 3.2);
    joints.head.rotation.x += ((look.pitch + driftX) - joints.head.rotation.x) * Math.min(1, dt * 2.6);
  }

  return { group: root, joints, setPose, setHeadLook, update };
}
