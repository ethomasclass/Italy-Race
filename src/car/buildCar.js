import * as THREE from 'three';
import { buildInstruments } from './interior.js';

/**
 * Fictional late-70s Italian hatchback.
 *
 * Design language borrowed from the era rather than from one car: dead-flat slab
 * sides, a hard crease low on the door, circular handles and extractor vents, and
 * a grey plastic band running bumper-to-bumper through the rocker. The face is
 * deliberately NOT the reference car's — a plain full-width slot with rectangular
 * lamps — so the silhouette reads period-correct without reading as a specific make.
 *
 * Local space: +X forward, +Y up, +Z right. Origin on the ground between the axles.
 */

const L = {
  front: 1.97, rear: -1.97,
  halfWidth: 0.825,
  beltline: 0.88,
  roof: 1.42,
  frontAxle: 1.23, rearAxle: -1.22,
  wheelR: 0.29, wheelW: 0.175,
  archR: 0.44,
  rocker: 0.28,
  floor: 0.30,        // footwell pan, well below the door aperture
  sillTop: 0.42,      // the rocker you step over to reach it
  cabinFront: 0.62, cabinRear: -1.20,
  bandTop: 0.52,
  greenhouseZ: 0.79,
};

function archPoints(cx, r, y0, dir) {
  // Half-circle over a wheel, walked in the direction of travel along the underside.
  const pts = [];
  const steps = 7;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = dir > 0 ? Math.PI - t * Math.PI : t * Math.PI;
    pts.push([cx + Math.cos(a) * r, y0 + Math.sin(a) * r * 0.78]);
  }
  return pts;
}

function lowerBodyShape() {
  const p = [];
  // Nose and hood, front to cowl.
  p.push([L.front, 0.34], [1.99, 0.55], [1.96, 0.70], [1.88, 0.765],
    [1.55, 0.80], [0.95, 0.855], [0.62, L.beltline]);
  // Drop into the cabin, run back along the floor, climb out at the parcel shelf.
  // The notch bottom is the footwell pan, not the door sill: a real car puts the
  // floor below the sill you step over, and that difference is the 0.12 m that lets
  // a correctly-scaled adult sit under this roof.
  p.push([0.60, L.floor], [-1.16, L.floor], [-1.20, L.beltline]);
  // Beltline back over the shelf, then down the tail.
  p.push([-1.55, L.beltline], [-1.80, 0.86], [-1.94, 0.72], [L.rear, 0.50], [-1.95, 0.34]);
  // Underside forward, lifting over each arch.
  p.push([-1.66, L.rocker]);
  p.push(...archPoints(L.rearAxle, L.archR, L.rocker, 1));
  p.push([-0.60, L.rocker], [0.60, L.rocker]);
  p.push(...archPoints(L.frontAxle, L.archR, L.rocker, 1));
  p.push([1.90, 0.31]);

  const s = new THREE.Shape();
  s.moveTo(p[0][0], p[0][1]);
  for (let i = 1; i < p.length; i++) s.lineTo(p[i][0], p[i][1]);
  s.closePath();
  return s;
}

function bandShape() {
  // The grey plastic band: same underside, capped flat at bumper height.
  const p = [[1.985, L.bandTop], [-1.965, L.bandTop], [-1.95, 0.34], [-1.66, L.rocker]];
  p.push(...archPoints(L.rearAxle, L.archR, L.rocker, 1));
  p.push([-0.60, L.rocker], [0.60, L.rocker]);
  p.push(...archPoints(L.frontAxle, L.archR, L.rocker, 1));
  p.push([1.90, 0.31]);

  const s = new THREE.Shape();
  s.moveTo(p[0][0], p[0][1]);
  for (let i = 1; i < p.length; i++) s.lineTo(p[i][0], p[i][1]);
  s.closePath();
  return s;
}

function greenhouseShape() {
  const s = new THREE.Shape();
  s.moveTo(0.62, L.beltline);
  s.lineTo(0.03, 1.38);
  s.lineTo(-1.02, L.roof);
  s.lineTo(-1.42, 1.10);
  s.lineTo(-1.52, L.beltline);
  s.closePath();

  // Door window.
  const door = new THREE.Path();
  door.moveTo(0.34, 0.96);
  door.lineTo(0.10, 1.30);
  door.lineTo(-0.62, 1.34);
  door.lineTo(-0.70, 0.96);
  door.closePath();

  // Fixed rear quarter light, with a B-pillar between.
  const quarter = new THREE.Path();
  quarter.moveTo(-0.80, 0.96);
  quarter.lineTo(-0.80, 1.34);
  quarter.lineTo(-1.06, 1.33);
  quarter.lineTo(-1.28, 0.96);
  quarter.closePath();

  s.holes.push(door, quarter);
  return s;
}

function extrude(shape, depth) {
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1, curveSegments: 6 });
  geo.translate(0, 0, -depth / 2);
  return geo;
}

/**
 * Bake the sun-fade into vertex colours: upward-facing panels chalk out, vertical
 * ones keep more of the original paint. Twenty summers parked outside.
 */
function applyWeatheredPaint(geo, baseHex, fadedHex, respray) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const base = new THREE.Color(baseHex);
  const faded = new THREE.Color(fadedHex);
  const resprayCol = respray ? new THREE.Color(respray.color) : null;
  const c = new THREE.Color();
  const colors = new Float32Array(pos.count * 3);

  for (let i = 0; i < pos.count; i++) {
    const up = Math.max(0, nor.getY(i));
    c.copy(base).lerp(faded, Math.pow(up, 1.4) * 0.85);
    if (resprayCol) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      if (x > respray.x0 && x < respray.x1 && y > 0.3 && Math.abs(z) > 0.7 && z < 0) {
        // A replacement door, resprayed once and never quite matched.
        c.lerp(resprayCol, 0.8);
      }
    }
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

export function buildCar(ramp, {
  paint = 0x3f6f7d,
  paintFaded = 0x93aab0,
  respray = 0x4d7f7a,
} = {}) {
  const group = new THREE.Group();
  const toon = (color, extra = {}) => new THREE.MeshToonMaterial({ color, gradientMap: ramp, ...extra });

  // Windscreen stays near-clear because the cockpit camera looks through it;
  // side and rear glass are darker so the cabin does not glow at you from outside.
  const screenMat = new THREE.MeshToonMaterial({
    color: 0x9fb6bd, gradientMap: ramp, transparent: true, opacity: 0.16,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const glassMat = new THREE.MeshToonMaterial({
    color: 0x24313a, gradientMap: ramp, transparent: true, opacity: 0.62,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const bandMat = toon(0x53534e);
  const trimMat = toon(0x26262a);
  const chromeMat = toon(0xb9bcbb);

  // --- Body ---
  const bodyGeo = extrude(lowerBodyShape(), L.halfWidth * 2);
  applyWeatheredPaint(bodyGeo, paint, paintFaded, { color: respray, x0: -0.78, x1: 0.62 });
  const body = new THREE.Mesh(bodyGeo, new THREE.MeshToonMaterial({
    vertexColors: true, gradientMap: ramp,
  }));
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Grey plastic band, standing proud of the body.
  const band = new THREE.Mesh(extrude(bandShape(), L.halfWidth * 2 + 0.05), bandMat);
  band.castShadow = true;
  group.add(band);

  // Door skins, closing the sides of the cabin notch.
  const skinGeo = new THREE.BoxGeometry(L.cabinFront - L.cabinRear, L.beltline - L.floor, 0.022);
  const skinColors = new Float32Array(skinGeo.attributes.position.count * 3);
  {
    const c = new THREE.Color(paint);
    for (let i = 0; i < skinGeo.attributes.position.count; i++) {
      skinColors[i * 3] = c.r; skinColors[i * 3 + 1] = c.g; skinColors[i * 3 + 2] = c.b;
    }
    skinGeo.setAttribute('color', new THREE.BufferAttribute(skinColors, 3));
  }
  for (const side of [-1, 1]) {
    const skin = new THREE.Mesh(skinGeo.clone(), new THREE.MeshToonMaterial({
      // The driver's door was replaced once and never quite matched.
      color: side < 0 ? respray : paint, gradientMap: ramp,
    }));
    skin.position.set((L.cabinFront + L.cabinRear) / 2, (L.beltline + L.floor) / 2, side * (L.halfWidth - 0.004));
    skin.castShadow = true;
    group.add(skin);
  }

  // Sills, standing above the footwell pan on each side.
  const sillGeo = new THREE.BoxGeometry(L.cabinFront - L.cabinRear, L.sillTop - L.floor, 0.085);
  for (const side of [-1, 1]) {
    const sill = new THREE.Mesh(sillGeo.clone(), bandMat);
    sill.position.set((L.cabinFront + L.cabinRear) / 2, (L.sillTop + L.floor) / 2, side * 0.765);
    sill.receiveShadow = true;
    group.add(sill);
  }

  // --- Greenhouse: thin side panels, so the cabin is genuinely hollow ---
  const ghGeo = extrude(greenhouseShape(), 0.05);
  applyWeatheredPaint(ghGeo, paint, paintFaded, null);
  const ghMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: ramp, side: THREE.DoubleSide });
  for (const side of [-1, 1]) {
    const panel = new THREE.Mesh(ghGeo.clone(), ghMat);
    panel.position.z = side * L.greenhouseZ;
    panel.castShadow = true;
    group.add(panel);
  }

  // Roof panel, with a little crown across its width.
  const roofGeo = (() => {
    const NX = 7, NZ = 6;
    const pos = [], idx = [];
    for (let i = 0; i < NX; i++) {
      const x = THREE.MathUtils.lerp(0.03, -1.02, i / (NX - 1));
      for (let j = 0; j < NZ; j++) {
        const z = THREE.MathUtils.lerp(-L.greenhouseZ, L.greenhouseZ, j / (NZ - 1));
        const crown = (1 - Math.pow(z / L.greenhouseZ, 2)) * 0.009;
        pos.push(x, THREE.MathUtils.lerp(1.38, L.roof, i / (NX - 1)) + crown, z);
      }
    }
    for (let i = 0; i < NX - 1; i++) {
      for (let j = 0; j < NZ - 1; j++) {
        const a = i * NZ + j, b = a + 1, c = a + NZ, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  })();
  applyWeatheredPaint(roofGeo, paint, paintFaded, null);
  const roof = new THREE.Mesh(roofGeo, new THREE.MeshToonMaterial({
    vertexColors: true, gradientMap: ramp, side: THREE.DoubleSide,
  }));
  roof.castShadow = true;
  group.add(roof);

  // --- Glazing ---
  const quad = (a, b, c, d, mat) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...d], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.computeVertexNormals();
    return new THREE.Mesh(g, mat);
  };
  group.add(quad([0.62, 0.88, -0.76], [0.62, 0.88, 0.76], [0.03, 1.38, 0.70], [0.03, 1.38, -0.70], screenMat));
  group.add(quad([-1.42, 1.10, -0.75], [-1.42, 1.10, 0.75], [-1.02, 1.41, 0.72], [-1.02, 1.41, -0.72], glassMat));
  // Hatch panel below the rear glass — without it the tail is open to the cabin.
  const hatchMat = new THREE.MeshToonMaterial({ color: paintFaded, gradientMap: ramp, side: THREE.DoubleSide });
  group.add(quad([-1.52, 0.88, -0.79], [-1.52, 0.88, 0.79], [-1.42, 1.10, 0.79], [-1.42, 1.10, -0.79], hatchMat));

  for (const side of [-1, 1]) {
    const z = side * L.greenhouseZ;
    group.add(quad([0.34, 0.96, z], [0.10, 1.30, z], [-0.62, 1.34, z], [-0.70, 0.96, z], glassMat));
    group.add(quad([-0.80, 0.96, z], [-0.80, 1.34, z], [-1.06, 1.33, z], [-1.28, 0.96, z], glassMat));
  }

  // --- Face: full-width slot, rectangular lamps ---
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.10, 1.16), trimMat);
  grille.position.set(1.955, 0.615, 0);
  group.add(grille);
  for (const side of [-1, 1]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.125, 0.30), toon(0xdfe4e0));
    lamp.position.set(1.955, 0.735, side * 0.48);
    group.add(lamp);
    const indicator = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.10, 0.14), toon(0xd8a03e));
    indicator.position.set(1.945, 0.73, side * 0.735);
    group.add(indicator);
    // Tail lamps.
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.20, 0.36), toon(0x9c2f28));
    tail.position.set(-1.955, 0.60, side * 0.50);
    group.add(tail);
  }

  // --- Circular details: handles, fuel filler, extractor vents ---
  const disc = (r, d) => {
    const g = new THREE.CylinderGeometry(r, r, d, 14);
    g.rotateX(Math.PI / 2);
    return g;
  };
  for (const side of [-1, 1]) {
    const handle = new THREE.Mesh(disc(0.052, 0.03), trimMat);
    handle.position.set(-0.35, 0.775, side * (L.halfWidth + 0.005));
    group.add(handle);

    const vent = new THREE.Mesh(disc(0.043, 0.02), trimMat);
    vent.position.set(-1.17, 1.13, side * (L.greenhouseZ + 0.03));
    group.add(vent);
  }
  const filler = new THREE.Mesh(disc(0.062, 0.02), toon(0x6d7a78));
  filler.position.set(-1.44, 0.70, L.halfWidth + 0.005);
  group.add(filler);

  // --- Wheels ---
  const tyreGeo = new THREE.CylinderGeometry(L.wheelR, L.wheelR, L.wheelW, 18);
  tyreGeo.rotateX(Math.PI / 2);
  const capGeo = new THREE.CylinderGeometry(0.195, 0.195, 0.02, 16);
  capGeo.rotateX(Math.PI / 2);
  const holeGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.03, 10);
  holeGeo.rotateX(Math.PI / 2);

  const wheels = [];
  for (const [ax, label] of [[L.frontAxle, 'front'], [L.rearAxle, 'rear']]) {
    for (const side of [-1, 1]) {
      const hub = new THREE.Group();
      const tyre = new THREE.Mesh(tyreGeo, toon(0x1f2124));
      tyre.castShadow = true;
      hub.add(tyre);

      const cap = new THREE.Mesh(capGeo, toon(0x8d9192));
      cap.position.z = side * (L.wheelW / 2 + 0.005);
      hub.add(cap);
      // Four circular cut-outs — the era's whole design language in one detail.
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const hole = new THREE.Mesh(holeGeo, trimMat);
        hole.position.set(Math.cos(a) * 0.105, Math.sin(a) * 0.105, side * (L.wheelW / 2 + 0.012));
        hub.add(hole);
      }
      hub.position.set(ax, L.wheelR, side * (L.halfWidth - L.wheelW / 2 - 0.02));
      group.add(hub);
      wheels.push({ hub, steers: label === 'front', side });

      // Dark inner arch so you can't see daylight through the wheel cut-out.
      const inner = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.34, 0.5), trimMat);
      inner.position.set(ax, 0.50, side * 0.42);
      group.add(inner);
    }
  }

  // --- Dad's roof rack, wipers, mirrors, aerial ---
  const rackMat = toon(0x6f6f6a);
  for (const x of [0.02, -0.78]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 1.44), rackMat);
    bar.position.set(x, L.roof + 0.075, 0);
    bar.castShadow = true;
    group.add(bar);
  }
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.03, 0.05), rackMat);
    rail.position.set(-0.38, L.roof + 0.06, side * 0.62);
    group.add(rail);

    const wiper = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.012, 0.02), trimMat);
    wiper.position.set(0.60, 0.905, side * 0.30);
    wiper.rotation.y = side * 0.22;
    group.add(wiper);

    const stalk = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.09), trimMat);
    stalk.position.set(0.50, 0.99, side * (L.halfWidth + 0.05));
    group.add(stalk);
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.075, 0.03), trimMat);
    mirror.position.set(0.47, 1.01, side * (L.halfWidth + 0.11));
    group.add(mirror);
  }
  const aerial = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.52, 5), chromeMat);
  aerial.position.set(1.12, 1.10, 0.68);
  aerial.rotation.z = 0.12;
  group.add(aerial);

  // --- Interior, needed for the cockpit camera ---
  const instruments = buildInstruments(group, ramp, L);

  return { group, wheels, instruments, dims: L };
}
