import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/**
 * Pocket transistor radio — a found object, modelled from a period reference.
 *
 * Real dimensions in metres, so it drops into the car's cabin at true scale.
 * Local space: +X right, +Y up, +Z toward the viewer (the dial faces +Z).
 *
 * Three things carry this object's identity and each is built, not faked:
 *   - large-radius moulded fillets on both shells (RoundedBoxGeometry, not a chamfer)
 *   - a genuine cavity behind the bezel, framed by four rails, so the dial sits in
 *     real shadow rather than reading as a printed patch
 *   - the magenta pointer, which is the only saturated non-red colour on the object
 */

const W = 0.105;          // overall width
const H = 0.0468;         // overall height
const D = 0.0546;         // overall depth

// The three bands read 39 : 37 : 24 of total height off the reference.
const TOP_H = H * 0.39;
const BELT_H = H * 0.37;
const BOT_H = H * 0.24;
const TOP_Y = H / 2 - TOP_H / 2;
const BELT_Y = H / 2 - TOP_H - BELT_H / 2;
const BOT_Y = -H / 2 + BOT_H / 2;

const SHELL_W = W * 0.965;   // shells step in from the belt, which is the widest part
// The reference keeps a distinct flat top plane, so the fillet has to stay well
// under a third of the shell height or the shell reads as a pillow.
const FILLET = 0.0038;
// Shells run a little into the belt so the rounded edges cannot leave a gap at the
// joins; the belt is opaque and sits over the overlap.
const OVERLAP = 0.002;
const END_W = W * 0.115;     // black blocks closing each end of the belt

const APERTURE_W = W * 0.604;
const APERTURE_H = 0.0135;
const APERTURE_Y = BELT_Y;

const FRONT = D / 2;
const BEZEL_Z = FRONT - 0.0015;   // bezel face sits just behind the shells
const CARD_Z = BEZEL_Z - 0.004;   // and the card well behind that — this gap is the recess

export const RADIO_SIZE = { width: W, height: H, depth: D };

/** Printed dial card: frequency numerals along the top, wordmark bottom-right. */
function dialCardTexture(wordmark) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 110;
  const x = c.getContext('2d');

  x.fillStyle = '#0e0e10';
  x.fillRect(0, 0, c.width, c.height);

  // Scale: four legible numerals with ticks between them. The reference is 300px
  // square, so the exact glyphs are inferred — the spacing and weight are not.
  x.fillStyle = '#e8e4da';
  x.strokeStyle = '#e8e4da';
  x.font = '600 30px Helvetica, Arial, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  const marks = [
    { at: 0.11, label: '5' }, { at: 0.36, label: '7' },
    { at: 0.63, label: '9' }, { at: 0.85, label: '10' },
  ];
  for (const m of marks) {
    x.fillText(m.label, m.at * c.width, 26);
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(m.at * c.width, 44);
    x.lineTo(m.at * c.width, 52);
    x.stroke();
  }
  x.lineWidth = 1.5;
  for (let i = 0; i <= 24; i++) {
    const t = 0.06 + (i / 24) * 0.86;
    x.beginPath();
    x.moveTo(t * c.width, 46);
    x.lineTo(t * c.width, 52);
    x.stroke();
  }

  x.font = '600 22px Helvetica, Arial, sans-serif';
  x.textAlign = 'right';
  x.letterSpacing = '3px';
  x.fillText(wordmark, c.width - 26, 92);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/**
 * @param {object} opts
 * @param {'studio'|'toon'} opts.style  'studio' matches the reference photo;
 *   'toon' matches the game's flat ramp. Same geometry either way.
 * @param {THREE.Texture} [opts.ramp]   gradient map, required for 'toon'
 * @param {string} [opts.wordmark]      defaults to a fictional brand
 */
export function buildRadio({ style = 'toon', ramp = null, wordmark = 'MIRAFONE' } = {}) {
  const group = new THREE.Group();

  const surface = (color, { rough = 0.5, clearcoat = 0 } = {}) =>
    style === 'toon'
      ? new THREE.MeshToonMaterial({ color, gradientMap: ramp })
      : new THREE.MeshPhysicalMaterial({ color, roughness: rough, metalness: 0, clearcoat,
                                         clearcoatRoughness: 0.08 });

  const red = surface(0xce2020, { rough: 0.16, clearcoat: 0.6 });
  const black = surface(0x17171a, { rough: 0.55 });
  const cardMat = style === 'toon'
    ? new THREE.MeshBasicMaterial({ map: dialCardTexture(wordmark) })
    : new THREE.MeshBasicMaterial({ map: dialCardTexture(wordmark) });
  const trackMat = surface(0xc9c7c2, { rough: 0.6 });
  const pointerMat = surface(0xce3a73, { rough: 0.35 });

  const add = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };

  // --- Shells: the fillet is the object's character, so it is real geometry ---
  const topH = TOP_H + OVERLAP;
  add(new RoundedBoxGeometry(SHELL_W, topH, D, 3, FILLET), red, 0, H / 2 - topH / 2, 0);
  const botH = BOT_H + OVERLAP;
  add(new RoundedBoxGeometry(SHELL_W, botH, D, 3, 0.003), red, 0, -H / 2 + botH / 2, 0);

  // --- Belt: end blocks, plus four rails framing a real cavity ---
  const endX = W / 2 - END_W / 2;
  for (const s of [-1, 1]) {
    add(new RoundedBoxGeometry(END_W, BELT_H, D, 2, 0.002), black, s * endX, BELT_Y, 0);
  }

  const bezelSpan = W - END_W * 2;
  const railT = (BELT_H - APERTURE_H) / 2;
  const bezelDepth = D - 0.002;
  // Top and bottom rails.
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(bezelSpan, railT, bezelDepth), black,
        0, BELT_Y + s * (APERTURE_H + railT) / 2, -0.001);
  }
  // Left and right posts, closing the cavity sideways.
  const postW = (bezelSpan - APERTURE_W) / 2;
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(postW, APERTURE_H, bezelDepth), black,
        s * (APERTURE_W + postW) / 2, BELT_Y, -0.001);
  }

  // --- Inside the cavity ---
  const card = add(new THREE.PlaneGeometry(APERTURE_W, APERTURE_H), cardMat, 0, APERTURE_Y, CARD_Z);
  card.castShadow = false;

  const trackW = W * 0.434;
  add(new THREE.BoxGeometry(trackW, 0.0019, 0.0016), trackMat, 0, APERTURE_Y - 0.0012, CARD_Z + 0.0012);

  const pointer = add(new THREE.BoxGeometry(0.0018, 0.0026, 0.0022), pointerMat,
                      0, APERTURE_Y - 0.0012, CARD_Z + 0.0022);

  // Tuning is a real transform, so the pointer can be driven by the radio mechanic.
  const travel = trackW - 0.0018;
  const setTuning = (t) => {
    pointer.position.x = (THREE.MathUtils.clamp(t, 0, 1) - 0.5) * travel;
  };
  setTuning(0.04);   // parked near the low end, as in the reference

  group.userData.setTuning = setTuning;
  return { group, setTuning, size: RADIO_SIZE };
}
