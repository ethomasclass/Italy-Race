import * as THREE from 'three';
import { fbm, valueNoise2 } from './noise.js';
import { PALETTE } from '../render/toon.js';

/**
 * Rolling Tuscan hill profile. Deliberately gentle: this is the median-difficulty
 * leg, so whatever the road system handles here generalises up to the Futa
 * switchbacks and down to the Adriatic straights.
 */
export function makeBaseHeight(seed = 7) {
  return function baseHeight(x, z) {
    let h = 0;
    h += fbm(x * 0.0016, z * 0.0016, { octaves: 3, seed }) * 34;      // broad hills
    h += fbm(x * 0.0065, z * 0.0065, { octaves: 3, seed: seed + 40 }) * 8; // shoulders
    h += fbm(x * 0.022, z * 0.022, { octaves: 2, seed: seed + 90 }) * 1.4; // field texture
    return h;
  };
}

const VERGE_DROP = 1.30;   // matches the outer edge of the road cross-section
const VERGE_EDGE = 6.20;
const BLEND_END = 48;      // how far the cut/fill grading reaches

export class Terrain {
  constructor(road, baseHeight) {
    this.road = road;
    this.base = baseHeight;
  }

  /** Ground height anywhere in the world, with the road graded in. */
  heightAt(x, z) {
    const n = this.road.nearest(x, z);
    const a = Math.abs(n.lateral);
    const vergeY = n.roadY - VERGE_DROP;
    if (a <= VERGE_EDGE) return vergeY;
    const t = THREE.MathUtils.smoothstep(a, VERGE_EDGE, BLEND_END);
    return vergeY * (1 - t) + this.base(x, z) * t;
  }

  /**
   * The surface a wheel actually rests on: the drawn road where there is road,
   * the graded terrain everywhere else. `heightAt` alone is not this — under the
   * road it returns the buried verge level, 1.3 m below the tarmac.
   */
  surfaceHeightAt(x, z) {
    const n = this.road.nearest(x, z);
    const off = this.road.surfaceOffset(n.lateral);
    if (off !== null) return n.roadY + off;
    return this.heightAt(x, z);
  }

  bounds(margin = 500) {
    const box = new THREE.Box3();
    for (const s of this.road.samples) box.expandByPoint(s.p);
    return {
      minX: box.min.x - margin, maxX: box.max.x + margin,
      minZ: box.min.z - margin, maxZ: box.max.z + margin,
    };
  }

  buildMesh(ramp, cell = 5) {
    const b = this.bounds();
    const nx = Math.ceil((b.maxX - b.minX) / cell) + 1;
    const nz = Math.ceil((b.maxZ - b.minZ) / cell) + 1;

    const positions = new Float32Array(nx * nz * 3);
    const colors = new Float32Array(nx * nz * 3);
    const dry = new THREE.Color(PALETTE.grassDry);
    const green = new THREE.Color(PALETTE.grassGreen);
    const soil = new THREE.Color(PALETTE.soil);
    const c = new THREE.Color();

    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const x = b.minX + i * cell;
        const z = b.minZ + j * cell;
        const y = this.heightAt(x, z);
        const k = (j * nx + i) * 3;
        positions[k] = x; positions[k + 1] = y; positions[k + 2] = z;

        // Patchwork of dry and green fields, with bare soil showing on the
        // cut faces beside the road.
        const patch = valueNoise2(x * 0.0035, z * 0.0035, 21);
        c.copy(dry).lerp(green, THREE.MathUtils.smoothstep(patch, 0.35, 0.72));
        const n = this.road.nearest(x, z);
        const near = 1 - THREE.MathUtils.smoothstep(Math.abs(n.lateral), VERGE_EDGE, 22);
        c.lerp(soil, near * 0.55);
        colors[k] = c.r; colors[k + 1] = c.g; colors[k + 2] = c.b;
      }
    }

    const indices = [];
    for (let j = 0; j < nz - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i, bb = a + 1, cc = a + nx, dd = cc + 1;
        indices.push(a, cc, bb, bb, cc, dd);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mesh = new THREE.Mesh(geo, new THREE.MeshToonMaterial({
      vertexColors: true, gradientMap: ramp,
    }));
    mesh.receiveShadow = true;
    return mesh;
  }
}

/**
 * Layered ridge silhouettes on the horizon. Cheapest possible depth cue and the
 * single biggest contributor to the landscape reading as Tuscan rather than generic.
 */
export function buildDistantRidges(ramp) {
  const group = new THREE.Group();
  const centre = new THREE.Vector3(0, 0, 0);
  const layers = [
    { radius: 780, height: 78, color: PALETTE.ridgeNear, seed: 3, freq: 3.5 },
    { radius: 1180, height: 128, color: PALETTE.ridgeMid, seed: 11, freq: 2.6 },
    { radius: 1620, height: 190, color: PALETTE.ridgeFar, seed: 29, freq: 1.9 },
  ];

  for (const layer of layers) {
    const segs = 128;
    const positions = [];
    const indices = [];
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const x = Math.cos(a) * layer.radius;
      const z = Math.sin(a) * layer.radius;
      const n = fbm(Math.cos(a) * layer.freq, Math.sin(a) * layer.freq,
        { octaves: 4, seed: layer.seed });
      const top = layer.height * (0.45 + 0.55 * (n * 0.5 + 0.5));
      positions.push(x, -200, z);
      positions.push(x, top, z);
    }
    for (let i = 0; i < segs; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      indices.push(a, c, b, b, c, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: layer.color, side: THREE.BackSide, fog: true,
    }));
    mesh.frustumCulled = false;
    group.add(mesh);
  }
  return group;
}
