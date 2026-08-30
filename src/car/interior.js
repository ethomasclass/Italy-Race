import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/**
 * Cabin. Modelled because the cockpit camera is a first-class view, not a bonus:
 * this is the one space that never changes across all eight legs, so it carries
 * more screen time than any landscape.
 *
 * Known simplification for this prototype: the cabin floor is the top of the body
 * extrusion at beltline height, so there is no real footwell yet.
 */

function makeGaugeCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  return canvas;
}

function drawGauges(ctx, speedKmh, odoKm, tripKm) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  ctx.fillStyle = '#1b1b1d';
  ctx.fillRect(0, 0, W, H);

  // Speedometer.
  const cx = 168, cy = 112, r = 90;
  ctx.fillStyle = '#0f0f10';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();

  const START = Math.PI * 0.75, SWEEP = Math.PI * 1.5, MAX = 180;
  ctx.strokeStyle = '#cfc8b4';
  ctx.fillStyle = '#cfc8b4';
  ctx.font = '600 15px Helvetica, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let v = 0; v <= MAX; v += 20) {
    const a = START + (v / MAX) * SWEEP;
    const c = Math.cos(a), s = Math.sin(a);
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx + c * (r - 14), cy + s * (r - 14));
    ctx.lineTo(cx + c * (r - 3), cy + s * (r - 3));
    ctx.stroke();
    ctx.fillText(String(v), cx + c * (r - 30), cy + s * (r - 30));
  }

  // Needle.
  const a = START + (Math.min(speedKmh, MAX) / MAX) * SWEEP;
  ctx.strokeStyle = '#d8563c';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - Math.cos(a) * 14, cy - Math.sin(a) * 14);
  ctx.lineTo(cx + Math.cos(a) * (r - 20), cy + Math.sin(a) * (r - 20));
  ctx.stroke();
  ctx.fillStyle = '#8a8578';
  ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2); ctx.fill();

  // Odometer. Six digits of his mileage, and a trip meter the brothers reset
  // when they left. The number they are adding to is not theirs.
  const drawCounter = (x, y, w, h, value, digits, accent) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(x, y, w, h);
    const text = String(Math.floor(value)).padStart(digits, '0');
    const dw = w / digits;
    ctx.font = '600 ' + Math.floor(h * 0.72) + 'px Menlo, Consolas, monospace';
    ctx.textAlign = 'center';
    for (let i = 0; i < digits; i++) {
      ctx.fillStyle = i === digits - 1 ? accent : '#e6e0cf';
      ctx.fillRect(x + i * dw + 1, y + 1, dw - 2, h - 2);
      ctx.fillStyle = '#141414';
      ctx.fillText(text[i], x + i * dw + dw / 2, y + h / 2 + 1);
    }
  };
  drawCounter(cx - 62, cy + 40, 124, 24, odoKm, 6, '#c9b48a');
  ctx.fillStyle = '#8a8578';
  ctx.font = '500 12px Helvetica, Arial, sans-serif';
  ctx.fillText('km', cx + 84, cy + 52);

  // Secondary dial: fuel and temperature.
  const cx2 = 386, cy2 = 112, r2 = 62;
  ctx.fillStyle = '#0f0f10';
  ctx.beginPath(); ctx.arc(cx2, cy2, r2, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#cfc8b4';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    const aa = Math.PI * 0.85 + (i / 4) * Math.PI * 0.6;
    ctx.beginPath();
    ctx.moveTo(cx2 + Math.cos(aa) * (r2 - 12), cy2 + Math.sin(aa) * (r2 - 12));
    ctx.lineTo(cx2 + Math.cos(aa) * (r2 - 2), cy2 + Math.sin(aa) * (r2 - 2));
    ctx.stroke();
  }
  ctx.fillStyle = '#cfc8b4';
  ctx.font = '600 13px Helvetica, Arial, sans-serif';
  ctx.fillText('E', cx2 - 40, cy2 + 26);
  ctx.fillText('F', cx2 + 40, cy2 + 26);
  const fa = Math.PI * 0.85 + 0.62 * Math.PI * 0.6;
  ctx.strokeStyle = '#d8563c';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx2, cy2);
  ctx.lineTo(cx2 + Math.cos(fa) * (r2 - 18), cy2 + Math.sin(fa) * (r2 - 18));
  ctx.stroke();

  ctx.fillStyle = '#6a6459';
  ctx.font = '500 11px Helvetica, Arial, sans-serif';
  ctx.fillText('TRIP ' + tripKm.toFixed(1), cx2, cy2 + 48);
}

export function buildInstruments(group, ramp, L) {
  const toon = (color, extra = {}) => new THREE.MeshToonMaterial({ color, gradientMap: ramp, ...extra });

  const vinyl = toon(0x413c38);          // warm grey dash mouldings
  const trim = toon(0x2a2724);
  const fabric = toon(0xb98a5c);          // camel cloth, as the reference cars
  const carpet = toon(0x2e2c2a);
  const chrome = toon(0xa8aaa6);
  const vent = toon(0x1d1b19);

  const FLOOR = L.floor;          // 0.30 — footwell pan
  const HIP = 0.46;               // seat H-point, the datum everything else keys off
  const DRIVER_Z = -0.33;
  // Eye sits 0.75 m above the H-point (50th-percentile male, slouched and with the
  // seat back reclined), which puts the crown about 0.07 m clear of the headliner.
  const EYE = new THREE.Vector3(-0.42, HIP + 0.75, DRIVER_Z);

  // Dash: a slab across the firewall with a binnacle hood over the driver.
  const dash = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.34, 1.58), vinyl);
  dash.position.set(0.46, EYE.y - 0.47, 0);   // top lands ~0.30 below the eye
  group.add(dash);

  // Cowl lip along the windscreen edge, with the defroster slots let into it.
  const cowl = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.035, 1.52), vinyl);
  cowl.position.set(0.585, EYE.y - 0.295, 0);
  group.add(cowl);
  for (let i = 0; i < 3; i++) {
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.007, 0.30), toon(0x2a2522));
    slot.position.set(0.585, EYE.y - 0.281, -0.42 + i * 0.42);
    group.add(slot);
  }

  // Face vents: a wide rectangular grille each side, as on the reference dash.
  for (const [vz, vw] of [[-0.60, 0.20], [0.10, 0.24]]) {
    const grille = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.048, vw), toon(0x241f1c));
    grille.position.set(0.293, EYE.y - 0.420, vz);
    group.add(grille);
    // Louvres sit proud of the grille face, toward the driver, or the vent reads
    // as an open hole rather than a slatted outlet.
    for (let i = 0; i < 4; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.005, vw - 0.012), toon(0x6b635a));
      fin.position.set(0.286, EYE.y - 0.437 + i * 0.0115, vz);
      group.add(fin);
    }
  }

  // Glovebox lid, with a recessed pull.
  const glove = new THREE.Mesh(new THREE.BoxGeometry(0.010, 0.095, 0.44), toon(0x4a443f));
  glove.position.set(0.292, EYE.y - 0.545, 0.42);
  group.add(glove);
  const gloveHandle = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.022, 0.09), vent);
  gloveHandle.position.set(0.286, EYE.y - 0.545, 0.30);
  group.add(gloveHandle);

  // Heater controls: a row of rotary knobs under the radio.
  for (let i = 0; i < 3; i++) {
    const knobBody = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.022, 12), toon(0x35312e));
    knobBody.rotation.z = Math.PI / 2;
    knobBody.position.set(0.288, EYE.y - 0.475, -0.055 + i * 0.055);
    group.add(knobBody);
  }
  // Rocker switch pods flanking the binnacle.
  for (const sz of [-0.52, -0.14]) {
    for (let i = 0; i < 2; i++) {
      const rk = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.020, 0.030), toon(0x33302c));
      rk.position.set(0.290, EYE.y - 0.318 + i * 0.026, sz);
      group.add(rk);
    }
  }

  const hood = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.04, 0.46), vinyl);
  hood.position.set(0.36, EYE.y - 0.212, DRIVER_Z);
  hood.rotation.z = -0.18;
  group.add(hood);

  // Instrument face, sitting on the rear surface of the dash.
  const canvas = makeGaugeCanvas();
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;

  const faceHolder = new THREE.Group();
  faceHolder.position.set(0.297, EYE.y - 0.300, DRIVER_Z);
  faceHolder.rotation.y = -Math.PI / 2;
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(0.38, 0.19),
    new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })
  );
  face.rotation.x = 0.20;
  faceHolder.add(face);
  group.add(faceHolder);

  // Steering wheel on a raked column.
  const wheelGroup = new THREE.Group();
  wheelGroup.position.set(0.06, EYE.y - 0.400, DRIVER_Z);
  wheelGroup.rotateY(Math.PI / 2);   // torus axis now points along the car's +X
  wheelGroup.rotateX(0.38);          // rake the top of the rim away from the driver
  wheelGroup.add(new THREE.Mesh(new THREE.TorusGeometry(0.163, 0.019, 8, 28), trim));
  // Two wide flat spokes running out to about 8 and 4 o'clock.
  for (const a of [Math.PI * 0.92, Math.PI * 0.08]) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.145, 0.030, 0.020), trim);
    spoke.position.set(Math.cos(a) * 0.082, Math.sin(a) * 0.082, -0.004);
    spoke.rotation.z = a;
    wheelGroup.add(spoke);
  }
  const pad = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.056, 0.024), toon(0x35312e));
  pad.position.set(0, 0, -0.006);
  wheelGroup.add(pad);
  group.add(wheelGroup);

  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.24, 8), trim);
  column.position.set(0.18, EYE.y - 0.450, DRIVER_Z);
  column.rotation.z = Math.PI / 2 - 0.38;
  group.add(column);

  // Pedals, visible when you glance down.
  for (const z of [-0.44, -0.30, -0.17]) {
    const pedal = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.015, 0.055), trim);
    pedal.position.set(0.42, FLOOR + 0.05, z);
    pedal.rotation.z = -0.3;
    group.add(pedal);
  }

  // Front seats. The reference cars have a rolled top edge, raised side bolsters and
  // a seamed centre panel — a plain slab reads as a cardboard box at cabin distance.
  const seam = toon(0x8f6842);

  function frontSeat(z) {
    const seat = new THREE.Group();
    seat.position.set(0, 0, z);
    group.add(seat);

    const base = new THREE.Mesh(new THREE.BoxGeometry(0.42, HIP - 0.09 - FLOOR, 0.42), trim);
    base.position.set(-0.28, (FLOOR + HIP - 0.09) / 2, 0);
    seat.add(base);

    // Cushion: centre panel between two bolsters, with a rolled front edge.
    const squab = new THREE.Mesh(new RoundedBoxGeometry(0.50, 0.075, 0.315, 2, 0.02), fabric);
    squab.position.set(-0.28, HIP - 0.048, 0);
    seat.add(squab);
    for (const b of [-1, 1]) {
      const bolster = new THREE.Mesh(new RoundedBoxGeometry(0.48, 0.095, 0.078, 2, 0.032), fabric);
      bolster.position.set(-0.28, HIP - 0.040, b * 0.192);
      seat.add(bolster);
    }
    const frontRoll = new THREE.Mesh(new THREE.CylinderGeometry(0.043, 0.043, 0.44, 12), fabric);
    frontRoll.rotation.x = Math.PI / 2;
    frontRoll.position.set(-0.045, HIP - 0.052, 0);
    seat.add(frontRoll);

    // Backrest, on the same rake as the seat.
    const backGroup = new THREE.Group();
    backGroup.position.set(-0.56, HIP + 0.30, 0);
    backGroup.rotation.z = 0.15;
    seat.add(backGroup);

    backGroup.add(new THREE.Mesh(new RoundedBoxGeometry(0.105, 0.58, 0.315, 2, 0.022), fabric));
    for (const b of [-1, 1]) {
      const bolster = new THREE.Mesh(new RoundedBoxGeometry(0.135, 0.56, 0.078, 2, 0.034), fabric);
      bolster.position.set(0.012, 0, b * 0.192);
      backGroup.add(bolster);
    }
    for (const sy of [-0.16, 0.04, 0.22]) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.010, 0.30), seam);
      line.position.set(-0.052, sy, 0);
      backGroup.add(line);
    }
    const topRoll = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.42, 12), fabric);
    topRoll.rotation.x = Math.PI / 2;
    topRoll.position.set(0.004, 0.285, 0);
    backGroup.add(topRoll);

    const rest = new THREE.Mesh(new RoundedBoxGeometry(0.10, 0.135, 0.185, 2, 0.035), fabric);
    rest.position.set(-0.622, HIP + 0.662, 0);   // above the raked backrest top
    seat.add(rest);
    const stalk = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.06, 0.016), trim);
    stalk.position.set(-0.612, HIP + 0.598, 0);
    seat.add(stalk);
  }

  frontSeat(DRIVER_Z);
  frontSeat(-DRIVER_Z);

  const rearBase = new THREE.Mesh(new THREE.BoxGeometry(0.44, HIP - 0.10 - FLOOR, 1.28), trim);
  rearBase.position.set(-1.00, (FLOOR + HIP - 0.10) / 2, 0);
  group.add(rearBase);
  const rearSquab = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.10, 1.28), fabric);
  rearSquab.position.set(-1.00, HIP - 0.05, 0);
  group.add(rearSquab);
  const rearBack = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.44, 1.28), fabric);
  rearBack.position.set(-1.26, HIP + 0.22, 0);
  group.add(rearBack);
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.03, 1.32), vinyl);
  shelf.position.set(-1.36, L.beltline, 0);
  group.add(shelf);

  // Door cards with circular pulls, echoing the exterior handles.
  for (const side of [-1, 1]) {
    const cardH = L.beltline - L.sillTop;
    const card = new THREE.Mesh(new THREE.BoxGeometry(1.68, cardH, 0.03), fabric);
    card.position.set(-0.20, (L.beltline + L.sillTop) / 2, side * 0.795);
    group.add(card);
    const roll = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.055, 0.042), vinyl);
    roll.position.set(-0.20, L.beltline - 0.028, side * 0.792);
    group.add(roll);
    const armrest = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.045, 0.05), vinyl);
    armrest.position.set(-0.16, L.beltline - 0.20, side * 0.778);
    group.add(armrest);
    const pull = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.044, 0.02, 12), chrome);
    pull.rotation.x = Math.PI / 2;
    pull.position.set(-0.20, L.beltline - 0.10, side * 0.775);
    group.add(pull);
  }

  // Gear lever and handbrake.
  const lever = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.019, 0.32, 6), chrome);
  lever.position.set(-0.02, FLOOR + 0.16, -0.02);
  lever.rotation.z = 0.16;
  group.add(lever);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.034, 10, 8), trim);
  knob.position.set(0.008, FLOOR + 0.32, -0.02);
  group.add(knob);
  const handbrake = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.026, 0.03), trim);
  handbrake.position.set(-0.24, FLOOR + 0.16, -0.02);
  handbrake.rotation.z = 0.25;
  group.add(handbrake);

  // Aftermarket radio-cassette, sat slightly proud in a mismatched surround —
  // the one thing the family ever upgraded.
  const radioBody = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.28), toon(0x1e1e20));
  radioBody.position.set(0.50, EYE.y - 0.40, 0.02);
  group.add(radioBody);
  const radioFace = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.062, 0.24), toon(0x4a4c50));
  radioFace.position.set(0.463, EYE.y - 0.395, 0.02);
  group.add(radioFace);
  for (let i = 0; i < 5; i++) {
    const btn = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.013, 0.024), chrome);
    btn.position.set(0.458, EYE.y - 0.425, -0.05 + i * 0.033);
    group.add(btn);
  }

  // Rear-view mirror, and a corno rosso on a thread — period-correct, and the
  // first object in the car with a story attached to it.
  const mirrorStalk = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.03), trim);
  mirrorStalk.position.set(0.05, 1.375, -0.02);
  group.add(mirrorStalk);
  const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.036, 0.17), trim);
  mirror.position.set(0.02, 1.343, -0.02);
  mirror.rotation.z = 0.12;
  group.add(mirror);
  const thread = new THREE.Mesh(new THREE.CylinderGeometry(0.0013, 0.0013, 0.035, 4), toon(0x6b6357));
  thread.position.set(0.014, 1.312, 0.072);
  group.add(thread);
  const charm = new THREE.Mesh(new THREE.ConeGeometry(0.0075, 0.034, 7), toon(0xa8322a));
  charm.position.set(0.014, 1.278, 0.072);
  charm.rotation.x = Math.PI;
  group.add(charm);

  // Cabin fill. The roof shadows the interior almost completely, so without a
  // little bounce light the whole cockpit view reads as a black box.
  const fill = new THREE.PointLight(0xffe3c4, 1.05, 4.6, 1.8);
  fill.position.set(-0.30, 1.16, 0);
  group.add(fill);

  // --- Live readouts ---
  const state = { speed: 0, odo: 187432, trip: 0 };
  let lastDraw = -1;

  return {
    driverEye: EYE,
    hipHeight: HIP,
    charm,
    wheelGroup,
    get odo() { return state.odo; },
    get trip() { return state.trip; },
    update(speedKmh, metresTravelled, elapsed) {
      state.speed = speedKmh;
      state.odo += metresTravelled / 1000;
      state.trip += metresTravelled / 1000;
      // Redraw at ~12 Hz; the needle does not need per-frame fidelity.
      if (elapsed - lastDraw > 0.08) {
        lastDraw = elapsed;
        drawGauges(ctx, state.speed, state.odo, state.trip);
        texture.needsUpdate = true;
      }
    },
  };
}
