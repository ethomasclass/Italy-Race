import * as THREE from 'three';
import { PALETTE } from '../render/toon.js';

/**
 * A leg's centreline.
 *
 * Everything is addressed by DISTANCE ALONG THE ROAD in metres, not by spline
 * parameter t. That is deliberate: it makes the road the leg's timeline, so
 * narrative beats, scatter rules and audio cues can all be authored as
 * "at 640 m" and stay stable when the spline is reshaped.
 */
/**
 * The road cross-section, shared by the mesh builder and the physics ground query
 * so the car drives on exactly the surface that is drawn.
 * `off` is lateral offset in metres, `up` is height above the centreline.
 */
export const ROAD_PROFILE = [
  { off: -6.20, up: -1.30, color: 0x8f9463 },
  { off: -3.95, up: -0.22, color: 0x8f9463 },
  { off: -3.45, up: -0.05, color: 0x9a9078 },
  { off: -3.00, up: 0.00, color: 0x5d5c58 },
  { off: -1.40, up: 0.045, color: 0x4a4a48 },
  { off: 1.40, up: 0.045, color: 0x4a4a48 },
  { off: 3.00, up: 0.00, color: 0x5d5c58 },
  { off: 3.45, up: -0.05, color: 0x9a9078 },
  { off: 3.95, up: -0.22, color: 0x8f9463 },
  { off: 6.20, up: -1.30, color: 0x8f9463 },
];

export const ROAD_EDGE = 6.20;

export class RoadPath {
  constructor(controlPoints) {
    this.curve = new THREE.CatmullRomCurve3(controlPoints, false, 'catmullrom', 0.5);
    this.length = this.curve.getLength();
    this.halfWidth = 3.0;      // asphalt, each side of centre
    this.shoulder = 0.45;      // gravel
    this._buildSamples(2);
    this._buildLookup(64);
  }

  _buildSamples(step) {
    this.step = step;
    const count = Math.max(2, Math.ceil(this.length / step) + 1);
    this.samples = new Array(count);
    for (let i = 0; i < count; i++) {
      const d = Math.min(i * step, this.length);
      const s = this.sample(d);
      this.samples[i] = { d, p: s.position, right: s.right };
    }
  }

  _buildLookup(cell) {
    this.cell = cell;
    this.grid = new Map();
    for (let i = 0; i < this.samples.length; i++) {
      const p = this.samples[i].p;
      const key = this._key(Math.floor(p.x / cell), Math.floor(p.z / cell));
      let bucket = this.grid.get(key);
      if (!bucket) this.grid.set(key, (bucket = []));
      bucket.push(i);
    }
  }

  _key(cx, cz) { return cx * 73856093 ^ cz * 19349663; }

  /** Position, tangent and right-vector at a distance along the road. */
  sample(distance) {
    const d = THREE.MathUtils.clamp(distance, 0, this.length);
    const u = this.length > 0 ? d / this.length : 0;
    const position = this.curve.getPointAt(u);
    const tangent = this.curve.getTangentAt(u).normalize();
    // Facing +tangent with +Y up, "right" is tangent rotated -90 degrees about Y.
    const right = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    return { position, tangent, right, distance: d, u };
  }

  /**
   * Height of the drawn road surface at a lateral offset, or null beyond its edge.
   * Interpolates the same profile the mesh is swept from.
   */
  surfaceOffset(lateral) {
    if (Math.abs(lateral) > ROAD_EDGE) return null;
    for (let i = 0; i < ROAD_PROFILE.length - 1; i++) {
      const a = ROAD_PROFILE[i], b = ROAD_PROFILE[i + 1];
      if (lateral >= a.off && lateral <= b.off) {
        const t = (lateral - a.off) / (b.off - a.off);
        return a.up + (b.up - a.up) * t;
      }
    }
    return null;
  }

  /**
   * Nearest point on the road to a world XZ.
   * Returns distance-along-road, signed lateral offset (+ = right of travel)
   * and the road surface height there.
   */
  nearest(x, z) {
    const cx = Math.floor(x / this.cell);
    const cz = Math.floor(z / this.cell);
    let best = -1, bestSq = Infinity;

    for (let ring = 0; ring < 64; ring++) {
      let found = false;
      for (let dz = -ring; dz <= ring; dz++) {
        for (let dx = -ring; dx <= ring; dx++) {
          // Only walk the shell of each ring.
          if (ring > 0 && Math.abs(dx) !== ring && Math.abs(dz) !== ring) continue;
          const bucket = this.grid.get(this._key(cx + dx, cz + dz));
          if (!bucket) continue;
          found = true;
          for (const i of bucket) {
            const p = this.samples[i].p;
            const ddx = p.x - x, ddz = p.z - z;
            const sq = ddx * ddx + ddz * ddz;
            if (sq < bestSq) { bestSq = sq; best = i; }
          }
        }
      }
      // One extra ring past the first hit, so a nearer sample in a diagonal cell wins.
      if (found && best >= 0 && ring * this.cell > Math.sqrt(bestSq)) break;
    }

    if (best < 0) return { distance: 0, lateral: 1e6, roadY: 0 };

    // Refine against the two segments meeting at that sample. Snapping to the
    // sample itself quantises distance — and therefore road height — to the
    // sample spacing, which the car feels as a staircase.
    let bestSq2 = Infinity, distance = this.samples[best].d, lateral = 0, roadY = this.samples[best].p.y;
    for (let i = Math.max(0, best - 1); i <= Math.min(best, this.samples.length - 2); i++) {
      const a = this.samples[i], b = this.samples[i + 1];
      const abx = b.p.x - a.p.x, abz = b.p.z - a.p.z;
      const len2 = abx * abx + abz * abz;
      if (len2 < 1e-9) continue;

      const t = THREE.MathUtils.clamp(((x - a.p.x) * abx + (z - a.p.z) * abz) / len2, 0, 1);
      const px = a.p.x + abx * t, pz = a.p.z + abz * t;
      const dx = x - px, dz = z - pz;
      const sq = dx * dx + dz * dz;
      if (sq >= bestSq2) continue;

      bestSq2 = sq;
      distance = a.d + t * (b.d - a.d);
      roadY = a.p.y + (b.p.y - a.p.y) * t;
      const inv = 1 / Math.sqrt(len2);
      lateral = dx * (-abz * inv) + dz * (abx * inv);
    }

    return { distance, lateral, roadY, index: best };
  }
}

/**
 * Meandering hill road. Generated from a seed rather than hand-placed, because a
 * "leg" should be data: a spline, an elevation rule, a scatter ruleset, a palette.
 */
export function makeLegCentreline(heightFn, { segments = 26, seed = 3 } = {}) {
  const pts = [];
  let x = 0, z = 0, heading = 0.2;
  for (let i = 0; i < segments; i++) {
    pts.push(new THREE.Vector3(x, 0, z));
    // Two out-of-phase waves: long sweepers with shorter kinks laid over them.
    // Kept under ~0.3 rad per segment so the minimum radius stays above the
    // terrain corridor half-width and the corridor mesh never folds on itself.
    const turn = Math.sin(i * 0.62 + seed) * 0.27 + Math.sin(i * 0.21 + 1.3) * 0.17;
    heading += turn;
    const len = 72 + 22 * Math.sin(i * 1.07 + seed);
    x += Math.cos(heading) * len;
    z += Math.sin(heading) * len;
  }

  // Drape the road over the terrain, then smooth it: real roads cut and fill
  // rather than following every undulation.
  for (const p of pts) p.y = heightFn(p.x, p.z);
  const smoothed = pts.map(p => p.y);
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 1; i < pts.length - 1; i++) {
      smoothed[i] = (smoothed[i - 1] + smoothed[i] * 2 + smoothed[i + 1]) / 4;
    }
  }
  pts.forEach((p, i) => { p.y = smoothed[i]; });
  return pts;
}

/** Sweep a cross-section along the centreline: asphalt, gravel shoulder, verge. */
export function buildRoadMesh(road, ramp) {
  const profile = ROAD_PROFILE;

  const step = 2.5;
  const rows = Math.max(2, Math.ceil(road.length / step) + 1);
  const cols = profile.length;
  const positions = new Float32Array(rows * cols * 3);
  const colors = new Float32Array(rows * cols * 3);
  const c = new THREE.Color();

  for (let r = 0; r < rows; r++) {
    const d = Math.min(r * step, road.length);
    const s = road.sample(d);
    for (let k = 0; k < cols; k++) {
      const pr = profile[k];
      const i = (r * cols + k) * 3;
      positions[i + 0] = s.position.x + s.right.x * pr.off;
      positions[i + 1] = s.position.y + pr.up;
      positions[i + 2] = s.position.z + s.right.z * pr.off;
      c.setHex(pr.color);
      colors[i + 0] = c.r; colors[i + 1] = c.g; colors[i + 2] = c.b;
    }
  }

  const indices = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let k = 0; k < cols - 1; k++) {
      const a = r * cols + k, b = a + 1, cc = a + cols, dd = cc + 1;
      indices.push(a, b, cc, b, dd, cc);
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

/** Dashed centre line, emitted straight onto the crown of the road. */
export function buildCentreLine(road, ramp) {
  const dash = 3.0, gap = 4.5, halfW = 0.075;
  const positions = [];
  const indices = [];
  let v = 0;

  for (let d = 6; d < road.length - 6; d += dash + gap) {
    const a = road.sample(d);
    const b = road.sample(Math.min(d + dash, road.length));
    const quad = [
      [a.position, a.right, -halfW], [a.position, a.right, halfW],
      [b.position, b.right, -halfW], [b.position, b.right, halfW],
    ];
    for (const [p, right, off] of quad) {
      positions.push(p.x + right.x * off, p.y + 0.055, p.z + right.z * off);
    }
    indices.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    v += 4;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshToonMaterial({
    color: PALETTE.centreLine, gradientMap: ramp,
  }));
}
