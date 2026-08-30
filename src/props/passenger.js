import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/**
 * The brother in the passenger seat.
 *
 * Built for one job: to be sat beside, at about 60 cm, in a dim cabin, for two
 * hours. That brief is very different from a hero character seen in the round —
 * it means no walk cycle, no full-body action rig, and no legs worth detailing,
 * but it does mean the head, shoulders and hands have to hold up close.
 *
 * Deliberately stylised rather than realistic. At this distance a nearly-real
 * face is worse than an unreal one, and a photoreal human would not sit in a
 * flat-shaded landscape anyway. Likeness is carried by silhouette, posture and
 * motion — brow, nose and jaw are geometry; nothing is painted on.
 *
 * Origin is the hip (the seat's H-point), so placing him is `position.set` onto
 * the seat. Y is up, +Z is the character's right, -X is forward (matching the car).
 */

const SKIN = 0xc0916c;
const SHIRT = 0xd6d0bd;
const TROUSER = 0x474751;
const HAIR = 0x2b2420;
const EYE = 0x241d18;

// Seated proportions, metres, measured from the hip.
const P = {
  pelvisTop: 0.10,
  waist: 0.30,
  chestTop: 0.52,
  shoulderY: 0.485,
  shoulderHalf: 0.185,
  neckTop: 0.545,
  headCentre: 0.66,
  headR: 0.104,
  upperArm: 0.29,
  foreArm: 0.25,
  thigh: 0.43,
  shin: 0.42,
};

/** A tapered limb segment running from `a` to `b`. */
function limb(a, b, rA, rB, mat, seg = 8) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const geo = new THREE.CylinderGeometry(rB, rA, len, seg, 1);
  geo.translate(0, len / 2, 0);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(a);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  mesh.castShadow = true;
  return mesh;
}

const v = (x, y, z) => new THREE.Vector3(x, y, z);

/**
 * @param {object} opts
 * @param {'toon'|'studio'} opts.style
 * @param {THREE.Texture} [opts.ramp]
 */
export function buildPassenger({ style = 'toon', ramp = null } = {}) {
  const surface = (color, rough = 0.85) =>
    style === 'toon'
      ? new THREE.MeshToonMaterial({ color, gradientMap: ramp })
      : new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 });

  const skin = surface(SKIN, 0.72);
  const shirt = surface(SHIRT);
  const trouser = surface(TROUSER);
  const hair = surface(HAIR, 0.95);
  const eyeMat = surface(EYE, 0.4);

  const root = new THREE.Group();
  const add = (m, parent = root) => { parent.add(m); return m; };
  const box = (w, h, d, r, mat, x, y, z, parent = root) => {
    const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, r), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    return add(m, parent);
  };

  // --- Torso: a slight forward lean, because nobody sits bolt upright for 1800 km ---
  const torso = new THREE.Group();
  torso.rotation.z = 0.0;
  torso.rotation.x = 0.0;
  add(torso);

  box(0.30, 0.16, 0.22, 0.055, trouser, 0, 0.045, 0, torso);           // pelvis
  box(0.28, 0.22, 0.20, 0.06, shirt, -0.012, 0.20, 0, torso);          // abdomen
  const chest = box(0.355, 0.26, 0.235, 0.075, shirt, -0.022, 0.40, 0, torso);
  chest.scale.z = 0.95;

  // Deltoids: flattened and sunk into the chest so the shoulder line is one
  // continuous mass. Spheres sitting proud of the torso read as ball joints.
  for (const s of [-1, 1]) {
    const sh = new THREE.Mesh(new THREE.SphereGeometry(0.056, 10, 8), shirt);
    sh.scale.set(0.80, 0.82, 0.95);
    sh.position.set(-0.024, P.shoulderY - 0.030, s * (P.shoulderHalf - 0.038));
    sh.castShadow = true;
    add(sh, torso);
  }

  // --- Head, on its own pivot so it can turn to the driver ---
  const headPivot = new THREE.Group();
  headPivot.position.set(-0.01, P.neckTop, 0);
  add(headPivot, torso);

  // Neck: short and thick. A long thin neck is the single fastest way to make a
  // stylised figure read as a puppet.
  add(limb(v(0, -0.05, 0), v(0.002, 0.045, 0), 0.052, 0.047, skin, 8), headPivot);

  const skull = new THREE.Mesh(new THREE.SphereGeometry(P.headR, 16, 14), skin);
  skull.scale.set(0.92, 1.02, 0.90);
  skull.position.set(-0.004, 0.108, 0);
  skull.castShadow = true;
  add(skull, headPivot);

  // Jaw: a wedge that shares the skull's width and tucks under it, so the head is
  // one silhouette rather than a ball with a box below.
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(P.headR * 0.82, 14, 12), skin);
  jaw.scale.set(0.86, 0.66, 0.80);
  jaw.position.set(-0.016, 0.052, 0);
  jaw.castShadow = true;
  add(jaw, headPivot);

  // Nose only — no brow bar. The brow reads from the skull's own overhang once the
  // eyes sit slightly under it.
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.019, 0.055, 4), skin);
  nose.rotation.z = -Math.PI / 2;
  nose.rotation.y = Math.PI / 4;
  nose.position.set(-0.098, 0.098, 0);
  nose.scale.set(1, 0.62, 0.85);
  add(nose, headPivot);

  for (const s of [-1, 1]) {
    // Eyes sit on the surface as flat lenses. Recessed spheres disappear entirely
    // under any shading model this flat.
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), eyeMat);
    eye.scale.set(0.32, 0.62, 1.0);
    eye.position.set(-0.0905, 0.118, s * 0.036);
    add(eye, headPivot);

    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.021, 8, 6), skin);
    ear.scale.set(0.34, 1.0, 0.62);
    ear.position.set(0.004, 0.100, s * 0.088);
    add(ear, headPivot);
  }

  // Hair: a shell that follows the skull and stops at a clean hairline, swept back
  // off the forehead rather than dropped on like a bowl.
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(P.headR * 1.06, 16, 14, 0, Math.PI * 2, 0, Math.PI * 0.50), hair);
  cap.scale.set(0.96, 1.02, 0.96);
  cap.position.set(0.010, 0.116, 0);
  cap.rotation.z = -0.30;   // negative tips the front up, off the brow
  cap.castShadow = true;
  add(cap, headPivot);

  // Back of the head, so the crown is not an open hemisphere from behind.
  const nape = new THREE.Mesh(new THREE.SphereGeometry(P.headR * 0.95, 14, 12), hair);
  nape.scale.set(0.74, 0.92, 0.92);
  nape.position.set(0.038, 0.104, 0);
  add(nape, headPivot);

  // --- Arms. Right forearm rests on the door top, left hand in the lap. ---
  const arms = [];
  for (const s of [-1, 1]) {
    const shoulder = v(-0.022, P.shoulderY - 0.018, s * (P.shoulderHalf - 0.020));
    // Elbows stay tucked against the ribs; only the forearms travel.
    const elbow = s > 0
      ? v(0.006, P.shoulderY - 0.235, s * (P.shoulderHalf + 0.004))
      : v(0.000, P.shoulderY - 0.240, s * (P.shoulderHalf - 0.006));
    const wrist = s > 0
      ? v(-0.205, P.shoulderY - 0.315, s * (P.shoulderHalf + 0.022))  // forearm forward, on the sill
      : v(-0.185, P.shoulderY - 0.360, s * (P.shoulderHalf - 0.080)); // hand down into the lap
    add(limb(shoulder, elbow, 0.058, 0.044, shirt, 8), torso);
    add(limb(elbow, wrist, 0.042, 0.030, skin, 8), torso);
    const hand = new THREE.Mesh(new RoundedBoxGeometry(0.10, 0.038, 0.07, 2, 0.016), skin);
    hand.position.copy(wrist).add(v(-0.045, -0.012, 0));
    hand.rotation.z = s > 0 ? -0.28 : -0.48;
    hand.rotation.y = s > 0 ? 0.12 : -0.10;
    hand.castShadow = true;
    add(hand, torso);
    arms.push({ side: s });
  }

  // --- Legs. Mostly under the dash; they exist for the knee line and nothing else. ---
  for (const s of [-1, 1]) {
    const hip = v(-0.02, 0.03, s * 0.085);
    const knee = v(-0.40, 0.02, s * 0.10);
    const ankle = v(-0.44, -0.38, s * 0.105);
    add(limb(hip, knee, 0.085, 0.062, trouser, 8), torso);
    add(limb(knee, ankle, 0.058, 0.042, trouser, 8), torso);
    const shoe = new THREE.Mesh(new RoundedBoxGeometry(0.20, 0.055, 0.085, 2, 0.02), surface(0x2c2622));
    shoe.position.set(-0.50, -0.395, s * 0.105);
    add(shoe, torso);
  }

  // --- Idle: breathing, and a head that can turn to the driver ---
  let t = 0;
  const baseChestY = chest.position.y;
  const look = { yaw: 0, pitch: 0 };

  function setHeadLook(yaw, pitch = 0) {
    look.yaw = THREE.MathUtils.clamp(yaw, -1.1, 1.1);
    look.pitch = THREE.MathUtils.clamp(pitch, -0.5, 0.5);
  }

  function update(dt) {
    t += dt;
    // Breath: the chest rises a few millimetres, and the whole torso follows a little.
    const breath = Math.sin(t * 1.15) * 0.5 + 0.5;
    chest.position.y = baseChestY + breath * 0.006;
    torso.rotation.z = breath * 0.004;
    // Head settles toward the look target with a lag, plus a slow drift so he is
    // never perfectly still.
    const driftY = Math.sin(t * 0.31) * 0.05 + Math.sin(t * 0.13) * 0.03;
    const driftX = Math.sin(t * 0.23 + 1.7) * 0.025;
    headPivot.rotation.y += ((look.yaw + driftY) - headPivot.rotation.y) * Math.min(1, dt * 3.2);
    headPivot.rotation.x += ((look.pitch + driftX) - headPivot.rotation.x) * Math.min(1, dt * 2.6);
  }

  return { group: root, headPivot, setHeadLook, update };
}
