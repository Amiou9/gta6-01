// NEON HARBOR — vehicles: box-built cars, arcade driving physics,
// parked cars to steal, and traffic that follows the road graph.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { clamp, dist2D, angleDiff, resolveCircleBox, pick } from './utils.js';

export function createCarMesh(type, colorHex, isPolice = false) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.35, metalness: 0.55 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.2, metalness: 0.7 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x0e2a3a, roughness: 0.1, metalness: 0.9 });
  const dims = type === 'truck'
    ? { len: 5.6, wid: 2.3, bodyH: 1.5, cabH: 1.2 }
    : { len: 4.4, wid: 2.0, bodyH: 0.85, cabH: 0.75 };
  const body = new THREE.Mesh(new THREE.BoxGeometry(dims.len, dims.bodyH, dims.wid), bodyMat);
  body.position.y = 0.55 + dims.bodyH / 2;
  body.castShadow = true;
  g.add(body);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(dims.len * 0.5, dims.cabH, dims.wid * 0.86), glassMat);
  cab.position.set(-dims.len * 0.06, 0.55 + dims.bodyH + dims.cabH / 2, 0);
  cab.castShadow = true;
  g.add(cab);
  // Wheels.
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
  wheelGeo.rotateX(Math.PI / 2);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.9 });
  const wheelPos = [
    [dims.len * 0.32, dims.wid / 2], [dims.len * 0.32, -dims.wid / 2],
    [-dims.len * 0.32, dims.wid / 2], [-dims.len * 0.32, -dims.wid / 2],
  ];
  const wheels = [];
  for (const [wx, wz] of wheelPos) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.position.set(wx, 0.36, wz);
    g.add(w); wheels.push(w);
  }
  // Headlights + taillights.
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xfff2b0, emissive: 0xffe9a0, emissiveIntensity: 1.4 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xcc1111, emissiveIntensity: 1.2 });
  for (const s of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 0.42), lightMat);
    hl.position.set(dims.len / 2 + 0.02, 0.85, s * 0.62);
    g.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 0.42), tailMat);
    tl.position.set(-dims.len / 2 - 0.02, 0.85, s * 0.62);
    g.add(tl);
  }
  if (isPolice) {
    const barMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 1.5), barMat);
    bar.position.set(-0.2, 0.55 + dims.bodyH + dims.cabH + 0.12, 0);
    g.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.16, 0.66), new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff2222, emissiveIntensity: 2 }));
    red.position.set(-0.2, 0.55 + dims.bodyH + dims.cabH + 0.24, 0.38);
    g.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.16, 0.66), new THREE.MeshStandardMaterial({ color: 0x2244ff, emissive: 0x2244ff, emissiveIntensity: 2 }));
    blue.position.set(-0.2, 0.55 + dims.bodyH + dims.cabH + 0.24, -0.38);
    g.add(blue);
    g.userData.lightBar = { red, blue };
  }
  g.userData.dims = dims;
  g.userData.wheels = wheels;
  return g;
}

export class Car {
  constructor(scene, type, colorHex, x, z, heading, opts = {}) {
    this.scene = scene;
    this.type = type;
    this.def = CONFIG.cars[type];
    this.isPolice = !!opts.police;
    this.group = createCarMesh(type, colorHex, this.isPolice);
    this.group.position.set(x, 0, z);
    this.group.rotation.y = heading;
    this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.health = 100;
    this.dead = false;
    this.driver = opts.driver ?? null; // 'traffic' | 'parked' | 'player' | 'police'
    this.aiTarget = null;              // traffic waypoint {x,z}
    this.aiNode = null;
    this.stoppedTimer = 0;
    this.smokeTimer = 0;
    scene.add(this.group);
  }

  get x() { return this.group.position.x; }
  get z() { return this.group.position.z; }

  drive(dt, throttle, steerInput, handbrake) {
    const def = this.def;
    const maxSpeed = def.top * (handbrake ? 0.55 : 1);
    const reverseMax = 12;
    if (throttle > 0) this.speed += def.accel * throttle * dt;
    else if (throttle < 0) this.speed += def.accel * 0.7 * throttle * dt;
    else this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 8 * dt);
    if (handbrake) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 22 * dt);
    this.speed = clamp(this.speed, -reverseMax, maxSpeed);
    const steerTarget = steerInput * def.grip * clamp(Math.abs(this.speed) / 8, 0, 1) * (this.speed < 0 ? -1 : 1);
    this.steer = THREE.MathUtils.lerp(this.steer, steerTarget, 1 - Math.exp(-8 * dt));
    this.heading += this.steer * dt * (handbrake ? 1.35 : 1);
    const dx = Math.cos(this.heading) * this.speed * dt;
    const dz = -Math.sin(this.heading) * this.speed * dt;
    this.group.position.x += dx;
    this.group.position.z += dz;
    this.group.rotation.y = this.heading;
    // Wheel spin + front-wheel steer visual.
    const wheels = this.group.userData.wheels;
    for (let i = 0; i < wheels.length; i++) {
      wheels[i].rotation.x += (this.speed * dt) / 0.36;
      if (i < 2) wheels[i].rotation.z = steerInput * 0.4;
    }
  }

  collide(colliders, cars) {
    const r = 2.1;
    for (const b of colliders) {
      const fixed = resolveCircleBox(this.x, this.z, r, b);
      if (fixed) {
        this.group.position.x = fixed.x;
        this.group.position.z = fixed.z;
        if (Math.abs(this.speed) > 6) this.damage(Math.abs(this.speed) * 0.7);
        this.speed *= 0.55;
      }
    }
    for (const other of cars) {
      if (other === this || other.dead) continue;
      const d = dist2D(this.x, this.z, other.x, other.z);
      if (d < 4.2 && d > 0.01) {
        const push = (4.2 - d) / 2;
        const nx = (this.x - other.x) / d, nz = (this.z - other.z) / d;
        this.group.position.x += nx * push;
        this.group.position.z += nz * push;
        if (Math.abs(this.speed - other.speed) > 8) this.damage(2);
        this.speed *= 0.8;
      }
    }
    // City bounds.
    this.group.position.x = clamp(this.group.position.x, -208, 206);
    this.group.position.z = clamp(this.group.position.z, -208, 208);
  }

  damage(amount) {
    this.health -= amount;
    if (this.health <= 0 && !this.dead) {
      this.dead = true;
      this.speed = 0;
    }
  }

  dispose() {
    this.scene.remove(this.group);
  }
}

export class TrafficManager {
  constructor(scene, city, rng) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.cars = [];
    this.parked = [];
    this.spawnTraffic(14);
    this.spawnParked(9);
  }

  spawnTraffic(n) {
    const types = Object.keys(CONFIG.cars);
    for (let i = 0; i < n; i++) {
      const p = this.city.randomRoadPoint(this.rng);
      const type = pick(this.rng, types);
      const color = pick(this.rng, CONFIG.cars[type].colors);
      const car = new Car(this.scene, type, color, p.x, p.z, p.heading, { driver: 'traffic' });
      car.aiNode = this.nearestNode(p.x, p.z);
      this.cars.push(car);
    }
  }

  spawnParked(n) {
    const types = ['sedan', 'coupe', 'sport', 'taxi', 'truck'];
    for (let i = 0; i < n; i++) {
      const p = this.city.randomRoadPoint(this.rng);
      // Park at the road edge, facing along the road.
      const alongRoad = Math.abs(p.x % 60) < 1 ? 'z' : 'x';
      const px = alongRoad === 'x' ? p.x : p.x + (this.rng() < 0.5 ? 5.4 : -5.4);
      const pz = alongRoad === 'z' ? p.z : p.z + (this.rng() < 0.5 ? 5.4 : -5.4);
      const heading = alongRoad === 'x' ? (this.rng() < 0.5 ? 0 : Math.PI) : (this.rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
      const type = pick(this.rng, types);
      const color = pick(this.rng, CONFIG.cars[type].colors);
      const car = new Car(this.scene, type, color, px, pz, heading, { driver: 'parked' });
      this.cars.push(car);
      this.parked.push(car);
    }
  }

  nearestNode(x, z) {
    let best = this.city.nodes[0], bd = Infinity;
    for (const n of this.city.nodes) {
      const d = dist2D(x, z, n.x, n.z);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  // Traffic AI: follow the road graph, slow for the car ahead, yield to the player.
  update(dt, playerPos, allCars) {
    for (const car of this.cars) {
      if (car.dead || car.driver === 'player' || car.driver === 'parked' || car.driver === 'police') continue;
      if (!car.aiNode) car.aiNode = this.nearestNode(car.x, car.z);
      const target = car.aiNode;
      const d = dist2D(car.x, car.z, target.x, target.z);
      if (d < 6) {
        const ns = this.city.neighbors(target);
        car.aiNode = ns[Math.floor(this.rng() * ns.length)];
      }
      const desired = Math.atan2(-(target.z - car.z), target.x - car.x);
      const diff = angleDiff(car.heading, desired);
      const steer = clamp(diff * 1.4, -1, 1);
      // Slow for a car ahead.
      let throttle = 0.55;
      const ahead = this.carAhead(car, allCars);
      if (ahead !== null && ahead < 12) throttle = ahead < 6 ? 0 : 0.2;
      if (playerPos && dist2D(car.x, car.z, playerPos.x, playerPos.z) < 7 && Math.abs(angleDiff(car.heading, Math.atan2(-(playerPos.z - car.z), playerPos.x - car.x))) < 0.6) {
        throttle = 0; // yield to a pedestrian in the way
      }
      car.drive(dt, throttle, steer, false);
      car.collide(this.city.colliders, allCars);
    }
  }

  carAhead(car, allCars) {
    let best = null;
    const fx = Math.cos(car.heading), fz = -Math.sin(car.heading);
    for (const other of allCars) {
      if (other === car || other.dead) continue;
      const dx = other.x - car.x, dz = other.z - car.z;
      const forward = dx * fx + dz * fz;
      const side = Math.abs(dx * -fz + dz * fx);
      if (forward > 0 && forward < 16 && side < 2.4) {
        if (best === null || forward < best) best = forward;
      }
    }
    return best;
  }

  nearestStealable(x, z, maxDist = 4) {
    let best = null, bd = maxDist;
    for (const car of this.cars) {
      if (car.dead || car.driver === 'player' || car.driver === 'police') continue;
      if (car.driver === 'traffic' && Math.abs(car.speed) > 3) continue;
      const d = dist2D(x, z, car.x, car.z);
      if (d < bd) { bd = d; best = car; }
    }
    return best;
  }

  removeCar(car) {
    const i = this.cars.indexOf(car);
    if (i >= 0) this.cars.splice(i, 1);
    const j = this.parked.indexOf(car);
    if (j >= 0) this.parked.splice(j, 1);
    car.dispose();
  }
}
