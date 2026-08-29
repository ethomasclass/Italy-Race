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
const TOP_SPEED = 31.5;        // ~113 km/h, and it feels unpleasant well before that
const ENGINE = 5.4;
const BRAKE = 9.0;
const DRAG = 0.0042;
const ROLL_RESIST = 0.42;

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
    this.wheelSpin = 0;
    this._lastSpeed = 0;
  }

  update(dt, input) {
    const { throttle, brake, steer: steerInput } = input;

    // --- Longitudinal ---
    // Power tails off with speed so the last 20 km/h takes real patience.
    const powerFade = 1 - Math.min(Math.abs(this.speed) / TOP_SPEED, 1) * 0.72;
    let accel = throttle * ENGINE * powerFade;
    accel -= brake * BRAKE * Math.sign(this.speed || 1);
    accel -= DRAG * this.speed * Math.abs(this.speed);
    accel -= ROLL_RESIST * this.speed * (this.onRoad ? 1 : 2.6);

    // Gravity along the slope the car is sitting on.
    accel -= Math.sin(this.pitchGrade || 0) * 9.81 * 0.55;

    this.speed += accel * dt;
    if (throttle === 0 && brake === 0 && Math.abs(this.speed) < 0.25) this.speed *= 0.86;
    this.speed = THREE.MathUtils.clamp(this.speed, -6, TOP_SPEED);

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
    this.position.y = groundY;

    // --- Terrain-following attitude ---
    const probe = 1.2;
    const rx = -fz, rz = fx;
    const ahead = this.terrain.surfaceHeightAt(this.position.x + fx * probe, this.position.z + fz * probe);
    const behind = this.terrain.surfaceHeightAt(this.position.x - fx * probe, this.position.z - fz * probe);
    const left = this.terrain.surfaceHeightAt(this.position.x - rx * probe, this.position.z - rz * probe);
    const right = this.terrain.surfaceHeightAt(this.position.x + rx * probe, this.position.z + rz * probe);
    this.pitchGrade = Math.atan2(ahead - behind, probe * 2);
    const rollGrade = Math.atan2(right - left, probe * 2);

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

    this.bodyRoll = THREE.MathUtils.clamp(this.roll, -0.16, 0.16) + rollGrade;
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
