// NEON HARBOR — the wanted system: stars, harbor patrol cars that chase
// and ram, busted logic, and heat that decays when you break line of sight.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { clamp, dist2D, angleDiff, pick } from './utils.js';
import { Car } from './vehicles.js';

export class Police {
  constructor(scene, city, rng) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.level = 0;
    this.cars = [];
    this.bustTimer = 0;
    this.hiddenTimer = 0;
    this.decayTimer = 0;
    this.flash = 0;
    this.lastSeen = null; // where a patrol car last saw the player
    this.pinSpeeds = null; // shot mode: hold each patrol car at this speed
    this.pinHeading = false; // shot mode: patrol cars drive straight, holding formation
    this.onBusted = null; // callback
  }

  get wantedCount() {
    return [0, 1, 2, 3, 4, 5][clamp(this.level, 0, 5)];
  }

  addHeat(n, reason) {
    if (this.level >= 5) return;
    this.level = clamp(this.level + n, 0, 5);
    this.hiddenTimer = 0;
    this.decayTimer = 0;
  }

  setHeat(n) {
    this.level = clamp(n, 0, 5);
    this.hiddenTimer = 0;
    this.decayTimer = 0;
  }

  clearHeat() { this.level = 0; this.bustTimer = 0; }

  spawnCar(playerPos) {
    // Spawn on a road 70-120m from the player.
    let x = 0, z = 0;
    for (let tries = 0; tries < 12; tries++) {
      const p = this.city.randomRoadPoint(this.rng);
      if (dist2D(p.x, p.z, playerPos.x, playerPos.z) > 70) { x = p.x; z = p.z; break; }
      x = p.x; z = p.z;
    }
    const car = new Car(this.scene, 'sedan', 0x11131a, x, z, 0, { driver: 'police', police: true });
    car.def = { ...CONFIG.cars.sedan, top: CONFIG.police.top, accel: CONFIG.police.accel, grip: 3.0 };
    // White doors livery: recolor the body.
    car.group.children[0].material = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.35, metalness: 0.5 });
    this.cars.push(car);
    return car;
  }

  update(dt, playerPos, playerSpeed, playerInCar, playerCar) {
    this.flash += dt;
    // Keep the right number of patrol cars.
    const want = this.wantedCount;
    while (this.cars.length < want) this.spawnCar(playerPos);
    while (this.cars.length > want) {
      const c = this.cars.pop();
      c.dispose();
    }
    let nearest = Infinity;
    for (const car of this.cars) {
      if (!car.dead) nearest = Math.min(nearest, dist2D(car.x, car.z, playerPos.x, playerPos.z));
    }
    // Seen / unseen: the patrol only knows where it last saw the player.
    const seen = nearest < 100;
    if (seen) {
      this.lastSeen = { x: playerPos.x, z: playerPos.z };
      this.hiddenTimer = 0;
      this.decayTimer = 0;
    } else {
      this.hiddenTimer += dt;
      if (this.hiddenTimer > CONFIG.police.loseSightTime) {
        this.decayTimer += dt;
        if (this.decayTimer > CONFIG.police.decayInterval) {
          this.decayTimer = 0;
          this.level = Math.max(0, this.level - 1);
        }
      }
    }
    const hunt = seen ? playerPos : (this.lastSeen || playerPos);
    for (let ci = 0; ci < this.cars.length; ci++) {
      const car = this.cars[ci];
      if (car.dead) continue;
      const d = dist2D(car.x, car.z, hunt.x, hunt.z);
      // Chase the last known position; when the trail goes cold and the
      // player is not in sight, search a nearby road instead.
      let target = hunt;
      if (!seen && d < 12) {
        if (!car.searchNode || dist2D(car.x, car.z, car.searchNode.x, car.searchNode.z) < 8) {
          const node = this.city.nodes[Math.floor(this.rng() * this.city.nodes.length)];
          car.searchNode = node;
        }
        target = car.searchNode;
      } else {
        car.searchNode = null;
      }
      const desired = Math.atan2(-(target.z - car.z), target.x - car.x);
      const diff = angleDiff(car.heading, desired);
      const steer = this.pinHeading ? 0 : clamp(diff * 1.6, -1, 1);
      let throttle = 1;
      let handbrake = false;
      // Park on the player to make the bust — a patrol car that just drives
      // through can never pin anyone down.
      if (seen && dist2D(car.x, car.z, playerPos.x, playerPos.z) < 6) { throttle = 0; handbrake = true; }
      car.drive(dt, throttle, steer, handbrake);
      if (this.pinSpeeds && this.pinSpeeds[ci] != null) car.speed = this.pinSpeeds[ci];
      car.collide(this.city.colliders, this.cars);
      // Ram damage to the player's car.
      if (playerInCar && playerCar && dist2D(car.x, car.z, playerPos.x, playerPos.z) < 4.4) {
        playerCar.damage(2.5 * dt);
      }
      // Rubber-band: a patrol car that fell far behind the last known
      // position repositions closer to it — never onto the player.
      if (this.lastSeen && dist2D(car.x, car.z, this.lastSeen.x, this.lastSeen.z) > 220) {
        const p = this.city.randomRoadPoint(this.rng);
        if (dist2D(p.x, p.z, this.lastSeen.x, this.lastSeen.z) > 60 && dist2D(p.x, p.z, this.lastSeen.x, this.lastSeen.z) < 130) {
          car.group.position.set(p.x, 0, p.z);
          car.speed = 10;
        }
      }
      // Light bar flash.
      const bar = car.group.userData.lightBar;
      if (bar) {
        const on = Math.sin(this.flash * 9) > 0;
        bar.red.material.emissiveIntensity = on ? 3 : 0.4;
        bar.blue.material.emissiveIntensity = on ? 0.4 : 3;
      }
    }
    // Busted: pinned close and slow.
    if (this.level > 0 && nearest < CONFIG.police.bustRange && playerSpeed < 1.5) {
      this.bustTimer += dt;
      if (this.bustTimer >= CONFIG.police.bustTime && this.onBusted) {
        this.bustTimer = 0;
        this.onBusted();
      }
    } else {
      this.bustTimer = Math.max(0, this.bustTimer - dt * 2);
    }
  }

  nearestDistance(playerPos) {
    let best = Infinity;
    for (const car of this.cars) best = Math.min(best, dist2D(car.x, car.z, playerPos.x, playerPos.z));
    return best;
  }

  removeAll() {
    for (const c of this.cars) c.dispose();
    this.cars = [];
  }
}
