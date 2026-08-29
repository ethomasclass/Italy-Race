// Deterministic value noise. Shared by terrain, road elevation and scatter so the
// whole leg regenerates identically from a seed.

function hash2(ix, iy, seed) {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iy | 0, 668265263) ^ Math.imul(seed | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function smootherstep(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function valueNoise2(x, y, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const a = hash2(ix, iy, seed);
  const b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed);
  const d = hash2(ix + 1, iy + 1, seed);
  const ux = smootherstep(fx), uy = smootherstep(fy);
  return (a * (1 - ux) + b * ux) * (1 - uy) + (c * (1 - ux) + d * ux) * uy;
}

export function fbm(x, y, { octaves = 4, frequency = 1, amplitude = 1, lacunarity = 2.1, gain = 0.5, seed = 0 } = {}) {
  let sum = 0, amp = amplitude, freq = frequency, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += (valueNoise2(x * freq, y * freq, seed + i * 101) * 2 - 1) * amp;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

// Cheap deterministic RNG for scatter placement.
export function makeRng(seed) {
  let s = seed >>> 0 || 1;
  return function rng() {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967295;
  };
}
