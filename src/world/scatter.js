import * as THREE from 'three';
import { makeRng, valueNoise2 } from './noise.js';
import { PALETTE } from '../render/toon.js';

// A leg's dressing is a ruleset, not a placed set. Cypress rows are the single
// strongest "this is Tuscany" cue, so they get real placement logic (driveways
// and ridge lines) rather than uniform scatter.

function cypressGeometry() {
  // Spindle profile: narrow at the base, gentle belly, sharp tip.
  const pts = [];
  const H = 1.0;
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const r = Math.sin(Math.pow(t, 0.62) * Math.PI) * 0.5 + 0.02;
    pts.push(new THREE.Vector2(Math.max(r * (1 - t * 0.35), 0.006), t * H));
  }
  return new THREE.LatheGeometry(pts, 7);
}

function pineCanopyGeometry() {
  const geo = new THREE.IcosahedronGeometry(1, 1);
  geo.scale(1, 0.44, 1);
  return geo;
}

function instanced(geo, mat, count) {
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return mesh;
}

export function buildScatter(road, terrain, ramp, seed = 5) {
  const rng = makeRng(seed);
  const group = new THREE.Group();
  const dummy = new THREE.Object3D();
  const colour = new THREE.Color();

  const cypressPlacements = [];
  const pinePlacements = [];
  const scrubPlacements = [];

  const clearOfRoad = (x, z, min = 9) =>
    Math.abs(road.nearest(x, z).lateral) > min;

  const push = (list, x, z, scale, rot) => {
    if (!clearOfRoad(x, z)) return;
    list.push({ x, z, y: terrain.heightAt(x, z), scale, rot });
  };

  // --- Cypress rows: driveways running off the road, and ridge-top lines ---
  const rowCount = 16;
  for (let i = 0; i < rowCount; i++) {
    const d = (i / rowCount) * road.length + rng() * 60;
    const s = road.sample(d);
    const side = rng() < 0.5 ? -1 : 1;
    const isDriveway = rng() < 0.55;

    const startOff = 22 + rng() * 40;
    const ox = s.position.x + s.right.x * startOff * side;
    const oz = s.position.z + s.right.z * startOff * side;

    // Driveways run away from the road; ridge lines lie across it.
    const baseAngle = Math.atan2(s.right.z * side, s.right.x * side);
    const angle = isDriveway
      ? baseAngle + (rng() - 0.5) * 0.5
      : baseAngle + Math.PI / 2 + (rng() - 0.5) * 0.8;

    const n = 5 + Math.floor(rng() * 8);
    const spacing = 6.5 + rng() * 3;
    for (let k = 0; k < n; k++) {
      const x = ox + Math.cos(angle) * spacing * k;
      const z = oz + Math.sin(angle) * spacing * k;
      push(cypressPlacements, x, z, 9.5 + rng() * 5.0, rng() * Math.PI * 2);
    }
  }

  // --- Lone cypresses and umbrella pines across the hills ---
  const b = terrain.bounds(160);
  for (let i = 0; i < 900; i++) {
    const x = b.minX + rng() * (b.maxX - b.minX);
    const z = b.minZ + rng() * (b.maxZ - b.minZ);
    // Cluster with a noise mask so trees gather in copses instead of dusting evenly.
    const mask = valueNoise2(x * 0.0032, z * 0.0032, 61);
    if (mask < 0.52) continue;
    if (rng() < 0.35) push(cypressPlacements, x, z, 8 + rng() * 5, rng() * Math.PI * 2);
    else push(pinePlacements, x, z, 4.5 + rng() * 3.4, rng() * Math.PI * 2);
  }

  // --- Roadside scrub, tight to the verge ---
  for (let d = 4; d < road.length; d += 5 + rng() * 9) {
    const s = road.sample(d);
    const side = rng() < 0.5 ? -1 : 1;
    const off = (7.2 + rng() * 5) * side;
    const x = s.position.x + s.right.x * off;
    const z = s.position.z + s.right.z * off;
    scrubPlacements.push({ x, z, y: terrain.heightAt(x, z), scale: 0.5 + rng() * 0.9, rot: rng() * 6.28 });
  }

  // --- Commit to instanced meshes ---
  const cypressMat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: ramp });
  const cypress = instanced(cypressGeometry(), cypressMat, cypressPlacements.length);
  const dark = new THREE.Color(PALETTE.cypress);
  const light = new THREE.Color(PALETTE.cypressLight);
  cypressPlacements.forEach((p, i) => {
    dummy.position.set(p.x, p.y, p.z);
    dummy.rotation.set(0, p.rot, 0);
    dummy.scale.set(p.scale * (0.20 + Math.random() * 0.05), p.scale, p.scale * 0.22);
    dummy.updateMatrix();
    cypress.setMatrixAt(i, dummy.matrix);
    cypress.setColorAt(i, colour.copy(dark).lerp(light, Math.random() * 0.75));
  });
  group.add(cypress);

  const pineMat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: ramp });
  const pine = instanced(pineCanopyGeometry(), pineMat, pinePlacements.length);
  const pineDark = new THREE.Color(PALETTE.pine);
  const trunkGeo = new THREE.CylinderGeometry(0.11, 0.17, 1, 5);
  trunkGeo.translate(0, 0.5, 0);
  const trunk = instanced(trunkGeo, new THREE.MeshToonMaterial({ color: PALETTE.trunk, gradientMap: ramp }), pinePlacements.length);

  pinePlacements.forEach((p, i) => {
    const h = p.scale;
    dummy.position.set(p.x, p.y + h * 0.92, p.z);
    dummy.rotation.set(0, p.rot, 0);
    dummy.scale.setScalar(h * 0.62);
    dummy.updateMatrix();
    pine.setMatrixAt(i, dummy.matrix);
    pine.setColorAt(i, colour.copy(pineDark).lerp(light, Math.random() * 0.5));

    dummy.position.set(p.x, p.y, p.z);
    dummy.rotation.set(0, p.rot, 0);
    dummy.scale.set(1, h * 0.95, 1);
    dummy.updateMatrix();
    trunk.setMatrixAt(i, dummy.matrix);
  });
  group.add(pine, trunk);

  const scrubGeo = new THREE.IcosahedronGeometry(1, 0);
  scrubGeo.scale(1, 0.62, 1);
  const scrub = instanced(scrubGeo, new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: ramp }), scrubPlacements.length);
  const scrubA = new THREE.Color(0x6d7444);
  const scrubB = new THREE.Color(0x97965c);
  scrubPlacements.forEach((p, i) => {
    dummy.position.set(p.x, p.y + p.scale * 0.4, p.z);
    dummy.rotation.set(0, p.rot, 0);
    dummy.scale.setScalar(p.scale);
    dummy.updateMatrix();
    scrub.setMatrixAt(i, dummy.matrix);
    scrub.setColorAt(i, colour.copy(scrubA).lerp(scrubB, Math.random()));
  });
  group.add(scrub);

  // --- A few farmhouses on high ground ---
  const stucco = new THREE.MeshToonMaterial({ color: PALETTE.stucco, gradientMap: ramp });
  const tile = new THREE.MeshToonMaterial({ color: PALETTE.roofTile, gradientMap: ramp });
  for (let i = 0; i < 5; i++) {
    let best = null;
    for (let a = 0; a < 40; a++) {
      const d = rng() * road.length;
      const s = road.sample(d);
      const side = rng() < 0.5 ? -1 : 1;
      const off = (70 + rng() * 150) * side;
      const x = s.position.x + s.right.x * off;
      const z = s.position.z + s.right.z * off;
      const y = terrain.heightAt(x, z);
      if (!best || y > best.y) best = { x, y, z };
    }
    const house = new THREE.Group();
    const w = 9 + rng() * 5, dp = 7 + rng() * 3, h = 6 + rng() * 2;
    const walls = new THREE.Mesh(new THREE.BoxGeometry(w, h, dp), stucco);
    walls.position.y = h / 2;
    walls.castShadow = true; walls.receiveShadow = true;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, dp) * 0.78, 2.6, 4), tile);
    roof.position.y = h + 1.3;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    house.add(walls, roof);
    house.position.set(best.x, best.y, best.z);
    house.rotation.y = rng() * Math.PI * 2;
    group.add(house);
  }

  return group;
}
