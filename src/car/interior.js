import * as THREE from 'three';

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

  const vinyl = toon(0x39352f);          // cracked dark dash top
  const trim = toon(0x2a2724);
  const fabric = toon(0x7a6a4f);          // sun-faded tan cloth
  const chrome = toon(0xa8aaa6);

  const FLOOR = L.floor;
  const DRIVER_Z = -0.33;
  const EYE = new THREE.Vector3(-0.42, 1.17, DRIVER_Z);

  // Dash: a slab across the firewall with a binnacle hood over the driver.
  const dash = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 1.58), vinyl);
  dash.position.set(0.46, 0.75, 0);
  group.add(dash);

  const hood = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.04, 0.46), vinyl);
  hood.position.set(0.36, 0.965, DRIVER_Z);
  hood.rotation.z = -0.18;
  group.add(hood);

  // Instrument face, sitting on the rear surface of the dash.
  const canvas = makeGaugeCanvas();
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;

  const faceHolder = new THREE.Group();
  faceHolder.position.set(0.297, 0.858, DRIVER_Z);
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
  wheelGroup.position.set(0.06, 0.915, DRIVER_Z);
  wheelGroup.rotateY(Math.PI / 2);   // torus axis now points along the car's +X
  wheelGroup.rotateX(0.38);          // rake the top of the rim away from the driver
  wheelGroup.add(new THREE.Mesh(new THREE.TorusGeometry(0.163, 0.016, 8, 26), trim));
  for (const a of [-0.5, Math.PI + 0.5]) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.017, 0.033), trim);
    spoke.position.set(Math.cos(a) * 0.08, Math.sin(a) * 0.08, 0);
    spoke.rotation.z = a;
    wheelGroup.add(spoke);
  }
  const boss = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.044, 0.028, 12), trim);
  boss.rotation.x = Math.PI / 2;
  wheelGroup.add(boss);
  group.add(wheelGroup);

  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.24, 8), trim);
  column.position.set(0.18, 0.862, DRIVER_Z);
  column.rotation.z = Math.PI / 2 - 0.38;
  group.add(column);

  // Pedals, visible when you glance down.
  for (const z of [-0.44, -0.30, -0.17]) {
    const pedal = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.015, 0.055), trim);
    pedal.position.set(0.40, FLOOR + 0.055, z);
    pedal.rotation.z = -0.3;
    group.add(pedal);
  }

  // Front seats: pedestal, squab, backrest, headrest.
  for (const z of [DRIVER_Z, -DRIVER_Z]) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.42), trim);
    base.position.set(-0.28, FLOOR + 0.07, z);
    group.add(base);
    const squab = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.12, 0.46), fabric);
    squab.position.set(-0.28, 0.64, z);
    group.add(squab);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.55, 0.46), fabric);
    back.position.set(-0.57, 0.975, z);
    back.rotation.z = 0.13;
    group.add(back);
    const rest = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.13, 0.19), fabric);
    rest.position.set(-0.63, 1.315, z);
    group.add(rest);
  }

  // Rear bench and parcel shelf.
  const rearSquab = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.12, 1.28), fabric);
  rearSquab.position.set(-1.00, 0.64, 0);
  group.add(rearSquab);
  const rearBack = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.40, 1.28), fabric);
  rearBack.position.set(-1.26, 0.88, 0);
  group.add(rearBack);
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.03, 1.32), vinyl);
  shelf.position.set(-1.36, 0.98, 0);
  group.add(shelf);

  // Door cards with circular pulls, echoing the exterior handles.
  for (const side of [-1, 1]) {
    const card = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.26, 0.03), trim);
    card.position.set(-0.20, 0.72, side * 0.795);
    group.add(card);
    const pull = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.044, 0.02, 12), chrome);
    pull.rotation.x = Math.PI / 2;
    pull.position.set(-0.20, 0.79, side * 0.775);
    group.add(pull);
  }

  // Gear lever and handbrake.
  const lever = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.019, 0.30, 6), chrome);
  lever.position.set(-0.02, 0.60, -0.02);
  lever.rotation.z = 0.16;
  group.add(lever);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.034, 10, 8), trim);
  knob.position.set(0.005, 0.75, -0.02);
  group.add(knob);
  const handbrake = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.026, 0.03), trim);
  handbrake.position.set(-0.24, 0.60, -0.02);
  handbrake.rotation.z = 0.25;
  group.add(handbrake);

  // Aftermarket radio-cassette, sat slightly proud in a mismatched surround —
  // the one thing the family ever upgraded.
  const radioBody = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.28), toon(0x1e1e20));
  radioBody.position.set(0.50, 0.80, 0.02);
  group.add(radioBody);
  const radioFace = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.062, 0.24), toon(0x4a4c50));
  radioFace.position.set(0.463, 0.805, 0.02);
  group.add(radioFace);
  for (let i = 0; i < 5; i++) {
    const btn = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.013, 0.024), chrome);
    btn.position.set(0.458, 0.775, -0.05 + i * 0.033);
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
  const thread = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.055, 4), toon(0x6b6357));
  thread.position.set(0.012, 1.303, 0.045);
  group.add(thread);
  const charm = new THREE.Mesh(new THREE.ConeGeometry(0.0085, 0.042, 7), toon(0xa8322a));
  charm.position.set(0.012, 1.256, 0.045);
  charm.rotation.x = Math.PI;
  group.add(charm);

  // Cabin fill. The roof shadows the interior almost completely, so without a
  // little bounce light the whole cockpit view reads as a black box.
  const fill = new THREE.PointLight(0xffe9cc, 2.2, 5.5, 1.6);
  fill.position.set(-0.25, 1.22, 0);
  group.add(fill);

  // --- Live readouts ---
  const state = { speed: 0, odo: 187432, trip: 0 };
  let lastDraw = -1;

  return {
    driverEye: EYE,
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
