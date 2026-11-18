// NEON HARBOR — the player on foot: third-person movement, jump, punch
// and pistol combat, health, and the low-poly character model.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { clamp, dist2D, resolveCircleBox, angleLerp } from './utils.js';

function buildPersonMesh(jacketColor, pantsColor, skinColor, scale = 1) {
  const g = new THREE.Group();
  const jacket = new THREE.MeshStandardMaterial({ color: jacketColor, roughness: 0.8 });
  const pants = new THREE.MeshStandardMaterial({ color: pantsColor, roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.7 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x1c1410, roughness: 1 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), jacket);
  torso.position.y = 1.08; torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.32), skin);
  head.position.y = 1.66; head.castShadow = true;
  g.add(head);
  const hairM = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.34), hair);
  hairM.position.y = 1.86;
  g.add(hairM);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.72, 0.26), pants);
  legL.position.set(-0.16, 0.36, 0); legL.castShadow = true;
  const legR = legL.clone(); legR.position.x = 0.16;
  g.add(legL); g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.62, 0.2), jacket);
  armL.position.set(-0.42, 1.1, 0); armL.castShadow = true;
  const armR = armL.clone(); armR.position.x = 0.42;
  g.add(armL); g.add(armR);
  g.scale.setScalar(scale);
  g.userData = { legL, legR, armL, armR, torso, head };
  return g;
}

export class Player {
  constructor(scene, x, z) {
    this.scene = scene;
    this.group = buildPersonMesh(0x2f6fb5, 0x23262e, 0xd9a066);
    this.group.position.set(x, 0, z);
    scene.add(this.group);
    this.x = x; this.z = z; this.y = 0;
    this.vy = 0;
    this.heading = Math.PI; // facing south (-z is forward of camera default)
    this.speed = 0;
    this.health = CONFIG.player.health;
    this.maxHealth = CONFIG.player.health;
    this.ammo = CONFIG.player.pistolAmmo;
    this.reloadTimer = 0;
    this.punchTimer = 0;
    this.shootTimer = 0;
    this.onGround = true;
    this.walkPhase = 0;
    this.dead = false;
    this.regenTimer = 0;
  }

  get pos() { return { x: this.x, z: this.z }; }

  update(dt, input, camYaw, colliders, cars) {
    if (this.dead) return;
    this.punchTimer = Math.max(0, this.punchTimer - dt);
    this.shootTimer = Math.max(0, this.shootTimer - dt);
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) this.ammo = CONFIG.player.pistolAmmo;
    }
    // Camera-relative movement.
    const fwd = { x: -Math.sin(camYaw), z: -Math.cos(camYaw) };
    const right = { x: Math.cos(camYaw), z: -Math.sin(camYaw) };
    let mx = 0, mz = 0;
    if (input.forward) { mx += fwd.x; mz += fwd.z; }
    if (input.back) { mx -= fwd.x; mz -= fwd.z; }
    if (input.left) { mx -= right.x; mz -= right.z; }
    if (input.right) { mx += right.x; mz += right.z; }
    const len = Math.hypot(mx, mz);
    const sprint = input.sprint ? CONFIG.player.sprintSpeed : CONFIG.player.walkSpeed;
    if (len > 0.01) {
      mx /= len; mz /= len;
      const targetHeading = Math.atan2(mx, mz);
      this.heading = angleLerp(this.heading, targetHeading, 1 - Math.exp(-12 * dt));
      const accel = CONFIG.player.accel;
      this.speed = Math.min(sprint, this.speed + accel * dt);
      this.x += mx * this.speed * dt;
      this.z += mz * this.speed * dt;
      this.walkPhase += dt * this.speed * 1.6;
    } else {
      this.speed = Math.max(0, this.speed - 30 * dt);
    }
    // Jump + gravity.
    if (input.jump && this.onGround) { this.vy = CONFIG.player.jumpSpeed; this.onGround = false; }
    if (!this.onGround) {
      this.vy -= 24 * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) { this.y = 0; this.vy = 0; this.onGround = true; }
    }
    // Collide with buildings and cars.
    for (const b of colliders) {
      const fixed = resolveCircleBox(this.x, this.z, 0.45, b);
      if (fixed) { this.x = fixed.x; this.z = fixed.z; }
    }
    for (const car of cars) {
      if (car.dead) continue;
      const d = dist2D(this.x, this.z, car.x, car.z);
      if (d < 2.4 && d > 0.01) {
        const nx = (this.x - car.x) / d, nz = (this.z - car.z) / d;
        this.x = car.x + nx * 2.4; this.z = car.z + nz * 2.4;
        if (Math.abs(car.speed) > 8) this.damage(Math.abs(car.speed) * 1.2);
      }
    }
    this.x = clamp(this.x, -208, 206);
    this.z = clamp(this.z, -208, 208);
    // Health regen after 6s without damage.
    this.regenTimer += dt;
    if (this.regenTimer > 6 && this.health < this.maxHealth) {
      this.health = Math.min(this.maxHealth, this.health + 6 * dt);
    }
    // Pose.
    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.y = this.heading;
    const swing = Math.sin(this.walkPhase) * clamp(this.speed / 6, 0, 1) * 0.55;
    const u = this.group.userData;
    u.legL.rotation.x = swing;
    u.legR.rotation.x = -swing;
    u.armL.rotation.x = -swing * 0.8;
    u.armR.rotation.x = swing * 0.8;
    if (!this.onGround) { u.legL.rotation.x = 0.5; u.legR.rotation.x = -0.4; }
  }

  damage(amount) {
    if (this.dead) return;
    this.health -= amount;
    this.regenTimer = 0;
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
    }
  }

  heal(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  canPunch() { return this.punchTimer <= 0; }
  punch() { this.punchTimer = 0.45; }

  canShoot() { return this.shootTimer <= 0 && this.reloadTimer <= 0 && this.ammo > 0; }
  shoot() {
    this.shootTimer = 0.22;
    this.ammo -= 1;
    if (this.ammo === 0) this.reloadTimer = CONFIG.player.pistolReload;
  }

  reload() {
    if (this.ammo < CONFIG.player.pistolAmmo && this.reloadTimer <= 0) {
      this.reloadTimer = CONFIG.player.pistolReload;
    }
  }

  respawn(x, z) {
    this.x = x; this.z = z; this.y = 0;
    this.health = this.maxHealth;
    this.dead = false;
    this.ammo = CONFIG.player.pistolAmmo;
    this.group.visible = true;
  }
}

export { buildPersonMesh };
