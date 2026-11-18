// NEON HARBOR — pedestrians: sidewalk walkers who flee from danger,
// plus cash pickups dropped around the city.
import * as THREE from 'three';
import { buildPersonMesh } from './player.js';
import { dist2D, pick, clamp } from './utils.js';

const JACKETS = [0xd6d6d6, 0x3a3a3a, 0xd21f3c, 0x2f7a4a, 0xd2a72f, 0x7a4a9a, 0x2f8a9a];
const PANTS = [0x23262e, 0x3a3f4a, 0x5a4a3a, 0x2a2d33];
const SKINS = [0xd9a066, 0x8a5a34, 0xe8b98a, 0x5a3a22, 0xc98a6a];

export class Ped {
  constructor(scene, x, z, rng) {
    this.scene = scene;
    this.group = buildPersonMesh(pick(rng, JACKETS), pick(rng, PANTS), pick(rng, SKINS), 0.92 + rng() * 0.16);
    this.group.position.set(x, 0, z);
    scene.add(this.group);
    this.x = x; this.z = z;
    this.heading = rng() * Math.PI * 2;
    this.speed = 1.2 + rng() * 0.9;
    this.health = 50;
    this.dead = false;
    this.fleeing = false;
    this.fleeTimer = 0;
    this.target = null;
    this.walkPhase = rng() * 6;
    this.rng = rng;
  }

  update(dt, colliders, threats) {
    if (this.dead) return;
    // Flee from nearby threats (fast cars, gunfire, the player punching).
    let scared = false;
    for (const t of threats) {
      if (dist2D(this.x, this.z, t.x, t.z) < t.radius) { scared = true; break; }
    }
    if (scared) { this.fleeing = true; this.fleeTimer = 4; }
    if (this.fleeing) {
      this.fleeTimer -= dt;
      if (this.fleeTimer <= 0) this.fleeing = false;
    }
    const speed = this.fleeing ? 5.2 : this.speed;
    if (!this.target || dist2D(this.x, this.z, this.target.x, this.target.z) < 2) {
      this.pickSidewalkTarget();
    }
    if (this.target) {
      const desired = Math.atan2(this.target.x - this.x, this.target.z - this.z);
      let diff = desired - this.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.heading += clamp(diff, -2.2 * dt, 2.2 * dt);
      if (this.fleeing) {
        // Run away from the nearest threat instead.
        const t = threats[0];
        if (t) {
          this.heading = Math.atan2(this.x - t.x, this.z - t.z);
        }
      }
    }
    this.x += Math.sin(this.heading) * speed * dt;
    this.z += Math.cos(this.heading) * speed * dt;
    // Keep on sidewalks: stay inside city, avoid buildings.
    this.x = clamp(this.x, -205, 205);
    this.z = clamp(this.z, -205, 205);
    this.walkPhase += dt * speed * 1.8;
    this.group.position.set(this.x, 0, this.z);
    this.group.rotation.y = this.heading;
    const swing = Math.sin(this.walkPhase) * 0.45;
    const u = this.group.userData;
    u.legL.rotation.x = swing;
    u.legR.rotation.x = -swing;
    u.armL.rotation.x = -swing * 0.7;
    u.armR.rotation.x = swing * 0.7;
  }

  pickSidewalkTarget() {
    // Walk to a random nearby block corner (sidewalk ring around blocks).
    const bx = Math.round((this.x + 150) / 60);
    const bz = Math.round((this.z + 150) / 60);
    const cx = -150 + clamp(bx, 0, 5) * 60 + (this.rng() < 0.5 ? -24 : 24);
    const cz = -150 + clamp(bz, 0, 5) * 60 + (this.rng() < 0.5 ? -24 : 24);
    this.target = { x: clamp(cx, -200, 200), z: clamp(cz, -200, 200) };
  }

  damage(amount) {
    if (this.dead) return true;
    this.health -= amount;
    if (this.health <= 0) {
      this.dead = true;
      this.group.rotation.x = -Math.PI / 2; // fall over
      this.group.position.y = 0.3;
      return true;
    }
    this.fleeing = true;
    this.fleeTimer = 5;
    return false;
  }

  dispose() { this.scene.remove(this.group); }
}

export class PedManager {
  constructor(scene, city, rng) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.peds = [];
    for (let i = 0; i < 16; i++) this.spawn();
  }

  spawn() {
    const bx = -150 + Math.floor(this.rng() * 6) * 60 + (this.rng() < 0.5 ? -24 : 24);
    const bz = -150 + Math.floor(this.rng() * 6) * 60 + (this.rng() < 0.5 ? -24 : 24);
    const ped = new Ped(this.scene, bx, bz, this.rng);
    this.peds.push(ped);
    return ped;
  }

  update(dt, threats) {
    for (const ped of this.peds) ped.update(dt, this.city.colliders, threats);
    // Replace the dead after a while so the streets stay alive.
    for (let i = this.peds.length - 1; i >= 0; i--) {
      if (this.peds[i].dead) {
        this.peds[i].dispose();
        this.peds.splice(i, 1);
        this.spawn();
      }
    }
  }

  nearest(x, z, maxDist) {
    let best = null, bd = maxDist;
    for (const ped of this.peds) {
      if (ped.dead) continue;
      const d = dist2D(x, z, ped.x, ped.z);
      if (d < bd) { bd = d; best = ped; }
    }
    return best;
  }
}

// Cash pickups: glowing green stacks the player can collect on foot or by car.
export class PickupManager {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    this.items = [];
    const geo = new THREE.BoxGeometry(0.7, 0.25, 0.45);
    const mat = new THREE.MeshStandardMaterial({ color: 0x2fd62f, emissive: 0x1a8a1a, emissiveIntensity: 1.2 });
    for (let i = 0; i < 10; i++) {
      const x = -190 + rng() * 380, z = -190 + rng() * 380;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, 0.5, z);
      mesh.rotation.y = rng() * Math.PI;
      scene.add(mesh);
      this.items.push({ mesh, x, z, taken: false, bob: rng() * 6 });
    }
  }

  update(dt, time, playerPos) {
    for (const it of this.items) {
      if (it.taken) continue;
      it.mesh.position.y = 0.5 + Math.sin(time * 2 + it.bob) * 0.12;
      it.mesh.rotation.y += dt * 1.2;
      if (playerPos && dist2D(playerPos.x, playerPos.z, it.x, it.z) < 2.2) {
        it.taken = true;
        it.mesh.visible = false;
        return it; // collected
      }
    }
    return null;
  }
}
