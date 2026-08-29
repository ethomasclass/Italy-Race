import * as THREE from 'three';

// Quantised light ramp. Three steps reads as "stylised" without going full cel-outline;
// the dither/outline passes come later.
export function makeToonRamp(steps = 4) {
  const data = new Uint8Array(steps * 4);
  for (let i = 0; i < steps; i++) {
    // Bias the ramp dark so the lit side pops and shadow sides stay flat and heavy.
    const t = Math.pow((i + 0.5) / steps, 0.78);
    const v = Math.round(40 + t * 215);
    data[i * 4 + 0] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, steps, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

// Restrained late-afternoon Tuscan palette. Everything in the scene pulls from here
// so the leg reads as one graded image rather than a pile of assets.
export const PALETTE = {
  skyTop: 0x6f9bc4,
  skyHorizon: 0xd9d2bd,
  haze: 0xc8c4ae,
  sun: 0xfff2d8,
  bounce: 0x8fa07d,

  asphalt: 0x4a4a48,
  asphaltWorn: 0x5d5c58,
  centreLine: 0xd8d3c2,
  gravel: 0x9a9078,
  verge: 0x8f9463,

  grassDry: 0xa3a166,
  grassGreen: 0x7d8b52,
  soil: 0xa8845e,

  cypress: 0x38512f,
  cypressLight: 0x4a6538,
  pine: 0x53663c,
  trunk: 0x5c4a38,
  stucco: 0xc9b394,
  roofTile: 0xa2603f,

  ridgeNear: 0x8b9469,
  ridgeMid: 0xa3a68c,
  ridgeFar: 0xbcbaa8,
};

export function toonMaterial(color, ramp, extra = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: ramp, ...extra });
}

// Gradient sky dome. Sits behind the fog so the horizon dissolves into the haze.
export function makeSky(radius = 4000) {
  const geo = new THREE.SphereGeometry(radius, 24, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topColor: { value: new THREE.Color(PALETTE.skyTop) },
      horizonColor: { value: new THREE.Color(PALETTE.skyHorizon) },
      offset: { value: 0.02 },
      exponent: { value: 0.85 },
    },
    vertexShader: /* glsl */`
      varying vec3 vWorldPosition;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorldPosition = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      uniform float offset;
      uniform float exponent;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition).y;
        float t = pow(max(h - offset, 0.0), exponent);
        gl_FragColor = vec4(mix(horizonColor, topColor, clamp(t, 0.0, 1.0)), 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return mesh;
}

export function setupLighting(scene) {
  // Single dominant low sun — long shadows, strong side-modelling on the car.
  const sun = new THREE.DirectionalLight(PALETTE.sun, 2.35);
  sun.position.set(-140, 90, 80);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const s = 90;
  sun.shadow.camera.left = -s;
  sun.shadow.camera.right = s;
  sun.shadow.camera.top = s;
  sun.shadow.camera.bottom = -s;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 420;
  sun.shadow.bias = -0.0012;
  sun.shadow.normalBias = 0.9;
  scene.add(sun);
  scene.add(sun.target);

  const sky = new THREE.HemisphereLight(PALETTE.skyTop, PALETTE.bounce, 0.85);
  scene.add(sky);

  return { sun, sky };
}
