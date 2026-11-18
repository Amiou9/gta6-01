// NEON HARBOR — particles (smoke, sparks, muzzle flash, cash sparkle)
// and camera shake. One pooled Points cloud, no per-frame allocation.
import * as THREE from 'three';

const MAX = 500;

export class Effects {
  constructor(scene) {
    this.scene = scene;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.parts = [];
    for (let i = 0; i < MAX; i++) this.parts.push({ life: 0, max: 1, vx: 0, vy: 0, vz: 0, grav: 0, size: 1 });
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const mat = new THREE.PointsMaterial({ size: 0.55, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.cursor = 0;
    this.trauma = 0;
    // Muzzle flash light.
    this.flash = new THREE.PointLight(0xffc36a, 0, 14, 1.6);
    scene.add(this.flash);
    this.flashLife = 0;
  }

  spawn(x, y, z, opts = {}) {
    const count = opts.count ?? 10;
    const color = new THREE.Color(opts.color ?? 0xffffff);
    const spread = opts.spread ?? 2.5;
    const up = opts.up ?? 2;
    const life = opts.life ?? 0.7;
    const grav = opts.gravity ?? -4;
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % MAX;
      const p = this.parts[i];
      p.life = life * (0.6 + Math.random() * 0.7);
      p.max = p.life;
      p.vx = (Math.random() - 0.5) * spread * 2;
      p.vy = Math.random() * up;
      p.vz = (Math.random() - 0.5) * spread * 2;
      p.grav = grav;
      this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
      this.col[i * 3] = color.r; this.col[i * 3 + 1] = color.g; this.col[i * 3 + 2] = color.b;
    }
  }

  smoke(x, y, z, n = 3) { this.spawn(x, y, z, { count: n, color: 0x777777, spread: 1.2, up: 2.4, life: 1.1, gravity: 1.5 }); }
  sparks(x, y, z) { this.spawn(x, y, z, { count: 14, color: 0xffc36a, spread: 5, up: 3, life: 0.5, gravity: -9 }); }
  muzzle(x, y, z) {
    this.spawn(x, y, z, { count: 6, color: 0xffe9a0, spread: 1.5, up: 0.5, life: 0.12, gravity: 0 });
    this.flash.position.set(x, y, z);
    this.flash.intensity = 26;
    this.flashLife = 0.07;
  }
  cash(x, y, z) { this.spawn(x, y, z, { count: 12, color: 0x2fd62f, spread: 2, up: 3, life: 0.8, gravity: -2 }); }

  shake(amount) { this.trauma = Math.min(1, this.trauma + amount); }

  update(dt) {
    for (let i = 0; i < MAX; i++) {
      const p = this.parts[i];
      if (p.life <= 0) { this.pos[i * 3 + 1] = -100; continue; }
      p.life -= dt;
      p.vy += p.grav * dt;
      this.pos[i * 3] += p.vx * dt;
      this.pos[i * 3 + 1] += p.vy * dt;
      this.pos[i * 3 + 2] += p.vz * dt;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
    if (this.flashLife > 0) {
      this.flashLife -= dt;
      if (this.flashLife <= 0) this.flash.intensity = 0;
    }
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
  }

  shakeOffset(time) {
    const t = this.trauma * this.trauma;
    return {
      x: t * 0.35 * Math.sin(time * 61),
      y: t * 0.3 * Math.sin(time * 53 + 1.7),
    };
  }
}
