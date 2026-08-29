import * as THREE from 'three';

/**
 * Two views, one camera, with a short blend between them.
 *
 * The cut between chase and cockpit is meant to carry structure later: outside for
 * the journey, inside for the memory. So it is a blend rather than a hard swap, and
 * the cockpit anchor is parented to the car so it inherits every bit of the body's
 * roll and pitch — you feel the wallow most from the driver's seat.
 */

const CHASE_OFFSET = new THREE.Vector3(-5.6, 1.38, 0.36);
const CHASE_LOOK = new THREE.Vector3(4.0, 0.95, 0);

export class Cameras {
  constructor(camera, carGroup, driverEye) {
    this.camera = camera;
    this.carGroup = carGroup;

    // Cockpit anchor rides with the body.
    this.cockpit = new THREE.Object3D();
    this.cockpit.position.copy(driverEye);
    this.cockpit.rotation.y = -Math.PI / 2;   // local -Z looks down the car's +X
    carGroup.add(this.cockpit);

    this.mode = 'chase';
    this.blend = 0;              // 0 = chase, 1 = cockpit
    this.chasePos = new THREE.Vector3();
    this.chaseLook = new THREE.Vector3();
    this._initialised = false;

    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
  }

  toggle() {
    this.mode = this.mode === 'chase' ? 'cockpit' : 'chase';
  }

  update(dt, vehicle) {
    const target = this.mode === 'cockpit' ? 1 : 0;
    this.blend += THREE.MathUtils.clamp(target - this.blend, -dt / 0.35, dt / 0.35);

    // --- Chase: spring-followed, deliberately low ---
    const h = vehicle.heading;
    const cos = Math.cos(h), sin = Math.sin(h);
    const rot = (v, out) => out.set(
      v.x * cos - v.z * sin, v.y, v.x * sin + v.z * cos
    );

    const wantPos = rot(CHASE_OFFSET, new THREE.Vector3()).add(vehicle.position);
    const wantLook = rot(CHASE_LOOK, new THREE.Vector3()).add(vehicle.position);
    // Keep the camera clear of rising ground behind the car.
    wantPos.y = Math.max(wantPos.y, vehicle.position.y + 0.9);

    if (!this._initialised) {
      this.chasePos.copy(wantPos);
      this.chaseLook.copy(wantLook);
      this._initialised = true;
    } else {
      const posLag = 1 - Math.exp(-6.5 * dt);
      const lookLag = 1 - Math.exp(-9.0 * dt);
      this.chasePos.lerp(wantPos, posLag);
      this.chaseLook.lerp(wantLook, lookLag);
    }

    this._m.lookAt(this.chasePos, this.chaseLook, this._up);
    const chaseQuat = this._q.clone().setFromRotationMatrix(this._m);

    // --- Cockpit: read straight off the car's world matrix ---
    this.cockpit.updateWorldMatrix(true, false);
    const cockpitPos = this._p.setFromMatrixPosition(this.cockpit.matrixWorld);
    const cockpitQuat = new THREE.Quaternion().setFromRotationMatrix(this.cockpit.matrixWorld);

    const t = THREE.MathUtils.smoothstep(this.blend, 0, 1);
    this.camera.position.copy(this.chasePos).lerp(cockpitPos, t);
    this.camera.quaternion.copy(chaseQuat).slerp(cockpitQuat, t);

    // A touch of speed-sensitive FOV. Small — this is not a racing game.
    const speedFrac = THREE.MathUtils.clamp(vehicle.speedKmh / 110, 0, 1);
    const baseFov = THREE.MathUtils.lerp(58, 68, t);
    this.camera.fov = baseFov + speedFrac * 4;
    this.camera.updateProjectionMatrix();
  }
}
