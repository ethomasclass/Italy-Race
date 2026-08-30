import * as THREE from 'three';

/**
 * Kinematic bicycle model with visual-only body springs.
 *
 * No rigid-body solver on purpose. This car should feel soft, slow to respond and
 * a little vague — a twenty-year-old family hatchback, not a rally car. The low
 * top speed and the wallow are characterisation, not limitations: once the player
 * stops trying to drive it quickly, the leg starts reading at the intended pace.
 */

const WHEELBASE = 2.45;
const TOP_SPEED = 34.0;        // sets where engine output falls away, not a hard cap
const ENGINE = 4.0;
const BRAKE = 6.5;             // drums and skinny tyres — about 0.66 g, so plan ahead
const DRAG = 0.0011;           // quadratic: dominates at the top end
const ROLL_RESIST = 0.15;      // near-constant, as rolling resistance actually is
const REVERSE = 1.6;           // gentle backwards drive, for getting out of a ditch
const REVERSE_MAX = 3.5;       // ~13 km/h; enough to reverse out, not to drive in
// Balance of the three above settles the car at roughly 105 km/h on the flat.

export class Vehicle {
  constructor(terrain, road, startDistance = 12) {
    this.terrain = terrain;
    this.road = road;

    const s = road.sample(startDistance);
    this.position = new THREE.Vector3(s.position.x, s.position.y, s.position.z);
    this.heading = Math.atan2(s.tangent.z, s.tangent.x);
    this.speed = 0;
    this.steer = 0;
    this.legDistance = startDistance;
    this.onRoad = true;

    // Visual body attitude (radians) and their velocities.
    this.roll = 0; this.rollV = 0;
    this.pitch = 0; this.pitchV = 0;
    this.pitchGrade = 0; this.rollGrade = 0;
    this.wheelSpin = 0;
    this._lastSpeed = 0;
    // Readable before the first update, so HUDs and harnesses never see undefined.
    this.speedKmh = 0;
    this.metresThisFrame = 0;
    this.bodyRoll = 0;
    this.bodyPitch = 0;

    // Suspension travel. The shell rides a spring over the contact patch instead
    // of being pinned to the ground, so surface detail never reaches the camera
    // one-for-one — which is most of the difference between "soft old car" and
    // "bumpy".
    this.bodyY = terrain.surfaceHeightAt(this.position.x, this.position.z);
    this.bodyVY = 0;
    this.position.y = this.bodyY;
  }

  update(dt, input) {
    const { throttle, brake, steer: steerInput } = input;

    // --- Longitudinal ---
    // Power tails off quadratically, so the last 20 km/h takes real patience.
    const fade = Math.max(0, 1 - Math.pow(Math.abs(this.speed) / TOP_SPEED, 2));
    const v0 = this.speed;
    const rolling = Math.abs(v0) > 0.08;

    // There is no separate reverse gear. Rolling forward, the pedals are throttle
    // and brake; at rest or rolling back, the brake pedal drives the car backwards
    // and the throttle arrests it.
    let accel = 0;
    if (v0 > 0.08) {
      accel += throttle * ENGINE * fade;
      accel -= brake * BRAKE;
    } else if (v0 < -0.08) {
      accel += throttle * BRAKE;
      accel -= brake * REVERSE;
    } else {
      accel += throttle * ENGINE * fade;
      accel -= brake * REVERSE;
    }

    // Resistance always opposes whichever way the car is travelling.
    if (rolling) {
      const dir = Math.sign(v0);
      accel -= DRAG * v0 * Math.abs(v0);
      accel -= ROLL_RESIST * dir * (this.onRoad ? 1 : 4.5);
    }

    // Gravity along the slope the car is sitting on.
    accel -= Math.sin(this.pitchGrade) * 9.81;

    this.speed += accel * dt;

    // Slowing down stops the car; it never drags it through zero into reverse.
    if (rolling && Math.sign(this.speed) !== Math.sign(v0)) {
      const slowing = (v0 > 0 && brake > 0 && throttle === 0) ||
                      (v0 < 0 && throttle > 0 && brake === 0);
      if (slowing) this.speed = 0;
    }
    if (Math.abs(this.speed) < 0.08 && throttle === 0 && brake === 0) this.speed *= 0.85;
    this.speed = THREE.MathUtils.clamp(this.speed, -REVERSE_MAX, TOP_SPEED);

    // --- Steering ---
    // A slow rack that loses authority with speed. Deliberately unhurried.
    const speedFrac = THREE.MathUtils.clamp(Math.abs(this.speed) / 28, 0, 1);
    const maxSteer = THREE.MathUtils.lerp(0.52, 0.13, speedFrac);
    const target = steerInput * maxSteer;
    const rackRate = 2.6;
    this.steer += THREE.MathUtils.clamp(target - this.steer, -rackRate * dt, rackRate * dt);

    const grip = this.onRoad ? 1 : 0.7;
    const yawRate = (this.speed * Math.tan(this.steer) / WHEELBASE) * grip;
    this.heading += yawRate * dt;

    // --- Integrate position, then drop onto the ground ---
    const fx = Math.cos(this.heading), fz = Math.sin(this.heading);
    this.position.x += fx * this.speed * dt;
    this.position.z += fz * this.speed * dt;

    const near = this.road.nearest(this.position.x, this.position.z);
    this.legDistance = near.distance;
    this.onRoad = Math.abs(near.lateral) <= this.road.halfWidth + this.road.shoulder;

    const groundY = this.terrain.surfaceHeightAt(this.position.x, this.position.z);
    this.groundY = groundY;

    const SPRING = 95, DAMP = 16;      // damping ratio ~0.82: settles, with a little float
    const SOFT_LIMIT = 0.10, HARD_LIMIT = 0.20, STOP_RATE = 3200;
    const travel = this.bodyY - groundY;
    let force = -travel * SPRING - this.bodyVY * DAMP;
    // Progressive bump stop. A hard clamp on travel reads as a jolt precisely
    // because it is a discontinuity; this ramps in instead.
    const over = Math.abs(travel) - SOFT_LIMIT;
    if (over > 0) force -= Math.sign(travel) * over * over * STOP_RATE;
    this.bodyVY += force * dt;
    this.bodyY += this.bodyVY * dt;
    this.bodyY = groundY + THREE.MathUtils.clamp(this.bodyY - groundY, -HARD_LIMIT, HARD_LIMIT);
    this.position.y = this.bodyY;

    // --- Terrain-following attitude ---
    const probe = 1.2;
    const rx = -fz, rz = fx;
    const ahead = this.terrain.surfaceHeightAt(this.position.x + fx * probe, this.position.z + fz * probe);
    const behind = this.terrain.surfaceHeightAt(this.position.x - fx * probe, this.position.z - fz * probe);
    const left = this.terrain.surfaceHeightAt(this.position.x - rx * probe, this.position.z - rz * probe);
    const right = this.terrain.surfaceHeightAt(this.position.x + rx * probe, this.position.z + rz * probe);
    // Low-pass the terrain grades. They feed the body attitude directly, so any
    // step in them shows up as a jolt rather than a lean.
    const gradeLag = 1 - Math.exp(-9 * dt);
    this.pitchGrade += (Math.atan2(ahead - behind, probe * 2) - this.pitchGrade) * gradeLag;
    this.rollGrade += (Math.atan2(right - left, probe * 2) - this.rollGrade) * gradeLag;

    // --- Body springs. Under-damped on purpose: it wallows. ---
    const longAccel = (this.speed - this._lastSpeed) / Math.max(dt, 1e-4);
    this._lastSpeed = this.speed;
    const lateralAccel = this.speed * yawRate;

    const rollTarget = -lateralAccel * 0.030;
    const pitchTarget = -longAccel * 0.016;
    const k = 42, c = 7.4;   // soft spring, light damping
    this.rollV += (rollTarget - this.roll) * k * dt - this.rollV * c * dt;
    this.roll += this.rollV * dt;
    this.pitchV += (pitchTarget - this.pitch) * k * dt - this.pitchV * c * dt;
    this.pitch += this.pitchV * dt;

    this.bodyRoll = THREE.MathUtils.clamp(this.roll, -0.16, 0.16) + this.rollGrade;
    this.bodyPitch = THREE.MathUtils.clamp(this.pitch, -0.10, 0.10) - this.pitchGrade;

    this.wheelSpin += (this.speed / 0.29) * dt;
    this.speedKmh = Math.abs(this.speed) * 3.6;
    this.metresThisFrame = Math.abs(this.speed) * dt;
  }

  /** Write the physics state onto the car's scene graph node. */
  applyTo(group, wheels) {
    group.position.copy(this.position);
    group.rotation.set(0, 0, 0);
    group.rotateY(-this.heading);
    group.rotateZ(this.bodyPitch);
    group.rotateX(this.bodyRoll);

    for (const w of wheels) {
      w.hub.rotation.set(0, 0, 0);
      if (w.steers) w.hub.rotateY(-this.steer);
      w.hub.rotateZ(-this.wheelSpin);
    }
  }
}
