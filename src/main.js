import * as THREE from 'three';
import { makeToonRamp, makeSky, setupLighting, PALETTE } from './render/toon.js';
import { makeBaseHeight, Terrain, buildDistantRidges } from './world/terrain.js';
import { RoadPath, makeLegCentreline, buildRoadMesh, buildCentreLine } from './world/road.js';
import { buildScatter } from './world/scatter.js';
import { buildCar } from './car/buildCar.js';
import { Vehicle } from './car/vehicle.js';
import { Cameras } from './camera/cameras.js';

const status = document.getElementById('status');
const setStatus = (t) => { status.textContent = t; };

// --- Renderer -------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(PALETTE.haze, 90, 1500);

const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 5000);

// --- Build the leg --------------------------------------------------------
setStatus('Generating leg…');

const ramp = makeToonRamp(4);
scene.add(makeSky());
const { sun } = setupLighting(scene);

const baseHeight = makeBaseHeight(7);
const road = new RoadPath(makeLegCentreline(baseHeight, { segments: 26, seed: 3 }));
const terrain = new Terrain(road, baseHeight);

scene.add(terrain.buildMesh(ramp, 5));
scene.add(buildRoadMesh(road, ramp));
scene.add(buildCentreLine(road, ramp));
scene.add(buildScatter(road, terrain, ramp, 5));

// Ridges ride with the car so you never end up outside a ring and see its wall.
const ridges = buildDistantRidges(ramp);
scene.add(ridges);

// --- Car ------------------------------------------------------------------
const car = buildCar(ramp);
scene.add(car.group);

const vehicle = new Vehicle(terrain, road, 14);
const cameras = new Cameras(camera, car.group, car.instruments.driverEye);

// --- Input ----------------------------------------------------------------
const keys = new Set();
const CONTROL_KEYS = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'enter'];

addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
  if (mode === 'intro' && CONTROL_KEYS.includes(k)) startDrive();
  if (k === 'c' && mode === 'drive') cameras.toggle();
  if (k === 'r') location.reload();
  keys.add(k);
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());

const down = (...ks) => ks.some((k) => keys.has(k));
function readInput() {
  const throttle = down('w', 'arrowup') ? 1 : 0;
  const brake = down('s', 'arrowdown', ' ') ? 1 : 0;
  let steer = 0;
  if (down('a', 'arrowleft')) steer -= 1;
  if (down('d', 'arrowright')) steer += 1;
  return { throttle, brake, steer };
}

/**
 * Story beats authored as distance along the leg. This is the whole point of
 * arc-length parameterising the road: the spline can be reshaped freely and
 * these stay put.
 */
const BEATS = [
  { at: 90, text: 'MARCO — Slower. He never drove this road in a hurry.' },
  { at: 430, text: 'He wouldn’t take the autostrada. Not once, not in thirty years.' },
  { at: 880, text: 'MARCO — There’s something rattling behind the door card.' },
  { at: 1320, text: 'Cypresses. He’d have known whose land this was.' },
];
let nextBeat = 0;
const subtitle = document.getElementById('subtitle');
let subtitleUntil = 0;

// --- Intro ----------------------------------------------------------------
// The scene runs behind the title card so the first thing anyone sees is the
// road itself, not a loading screen.
let mode = 'intro';
let introT = 0;
const NO_INPUT = { throttle: 0, brake: 0, steer: 0 };

function startDrive() {
  if (mode === 'drive') return;
  mode = 'drive';
  document.body.classList.add('driving');
  clock.getDelta();
}
window.__startDrive = startDrive;

function introCamera(dt) {
  introT += dt;
  // Slow arc around the parked car, drifting from the front wing to the flank.
  const a = -0.55 + introT * 0.045;
  const r = 9.4 - Math.min(introT, 22) * 0.09;
  const p = vehicle.position;
  camera.position.set(
    p.x + Math.cos(vehicle.heading + a) * r,
    p.y + 2.35 + Math.sin(introT * 0.12) * 0.25,
    p.z + Math.sin(vehicle.heading + a) * r
  );
  camera.lookAt(p.x, p.y + 0.85, p.z);
  camera.fov = 40;
  camera.updateProjectionMatrix();
}

// --- Loop -----------------------------------------------------------------
document.getElementById('start')?.addEventListener('click', () => {
  startDrive();
  window.focus();
});
renderer.domElement.addEventListener('pointerdown', startDrive);

const clock = new THREE.Clock();
let elapsed = 0;
const hud = document.getElementById('hud');
setStatus('');

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 1 / 20);
  elapsed += dt;

  vehicle.update(dt, mode === 'drive' ? readInput() : NO_INPUT);
  vehicle.applyTo(car.group, car.wheels);
  car.instruments.update(vehicle.speedKmh, vehicle.metresThisFrame, elapsed);

  scene.updateMatrixWorld();
  if (mode === 'drive') cameras.update(dt, vehicle);
  else introCamera(dt);

  ridges.position.set(vehicle.position.x, vehicle.position.y - 6, vehicle.position.z);

  // Keep the shadow frustum on the car.
  sun.position.set(vehicle.position.x - 120, vehicle.position.y + 95, vehicle.position.z + 70);
  sun.target.position.copy(vehicle.position);
  sun.target.updateMatrixWorld();

  // Fire any beat the car has driven past.
  while (mode === 'drive' && nextBeat < BEATS.length && vehicle.legDistance >= BEATS[nextBeat].at) {
    subtitle.textContent = BEATS[nextBeat].text;
    subtitle.classList.add('visible');
    subtitleUntil = elapsed + 6;
    nextBeat++;
  }
  if (elapsed > subtitleUntil) subtitle.classList.remove('visible');

  const pct = (vehicle.legDistance / road.length) * 100;
  hud.innerHTML =
    '<b>' + Math.round(vehicle.speedKmh) + '</b> km/h' +
    '<span></span>ODO <b>' + Math.floor(car.instruments.odo).toLocaleString('en-GB') + '</b> km' +
    '<span></span>TRIP <b>' + car.instruments.trip.toFixed(1) + '</b> km' +
    '<span></span>LEG <b>' + pct.toFixed(0) + '%</b>' +
    (vehicle.onRoad ? '' : '<span></span><i>off road</i>');

  renderer.render(scene, camera);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// Handy during development: poke at the leg from the console.
window.__dbg = { scene, camera, renderer, road, terrain, vehicle, car, cameras };

frame();
