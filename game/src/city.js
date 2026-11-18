// NEON HARBOR — the city: procedural ground, buildings, lights, palms,
// neon signs, harbor water and pier, plus the road graph traffic drives on.
import * as THREE from 'three';
import { CONFIG, PLACES } from './config.js';
import { mulberry32, pick } from './utils.js';

export const ROAD_LINES = [-180, -120, -60, 0, 60, 120, 180];
export const BLOCK_CENTERS = [-150, -90, -30, 30, 90, 150];
const PITCH = CONFIG.city.block + CONFIG.city.road; // 60
const HALF = 210; // city spans [-210, 210]

export function blockToWorld(bx, bz) {
  return { x: BLOCK_CENTERS[bx], z: BLOCK_CENTERS[bz] };
}

function makeWindowTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#2a2f3c'; g.fillRect(0, 0, 128, 256);
  const lit = ['#ffd27a', '#9be8ff', '#ff9ad5', '#c9f7b2', '#fff3c4'];
  for (let y = 8; y < 248; y += 16) {
    for (let x = 8; x < 120; x += 16) {
      if (Math.random() < 0.5) {
        g.fillStyle = lit[Math.floor(Math.random() * lit.length)];
        g.globalAlpha = 0.75 + Math.random() * 0.25;
        g.fillRect(x, y, 9, 11);
      } else {
        g.fillStyle = '#1a2030';
        g.fillRect(x, y, 9, 11);
      }
    }
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeGroundTexture(rng) {
  const S = 2048, WORLD = 480; // covers [-240, 240]
  const px = (w) => ((w + WORLD / 2) / WORLD) * S;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g = c.getContext('2d');
  // Base asphalt.
  g.fillStyle = '#2e323a'; g.fillRect(0, 0, S, S);
  // Subtle asphalt noise.
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = rng() < 0.5 ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.05)';
    g.fillRect(rng() * S, rng() * S, 2, 2);
  }
  // Sidewalk + lot for every block.
  for (const bx of BLOCK_CENTERS) {
    for (const bz of BLOCK_CENTERS) {
      const x = px(bx - 23), z = px(bz - 23), s = px(46) - px(0);
      g.fillStyle = '#4a4f58'; g.fillRect(x, z, s, s);
      g.fillStyle = '#363b44'; g.fillRect(x + 6, z + 6, s - 12, s - 12);
    }
  }
  // Plaza block (3,3): pale stone circle.
  {
    const p = blockToWorld(3, 3);
    const x = px(p.x), z = px(p.z);
    g.fillStyle = '#4a4436'; g.beginPath(); g.arc(x, z, px(20) - px(0), 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#8a7f5a'; g.lineWidth = 3;
    g.beginPath(); g.arc(x, z, px(14) - px(0), 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#2f6f8f'; g.beginPath(); g.arc(x, z, px(5) - px(0), 0, Math.PI * 2); g.fill();
  }
  // Docks block (5,3): container yard.
  {
    const p = blockToWorld(5, 3);
    const x0 = px(p.x - 20), z0 = px(p.z - 20);
    g.fillStyle = '#31343a'; g.fillRect(x0, z0, px(40) - px(0), px(40) - px(0));
    const cols = ['#6e3a22', '#224e6e', '#4e6e22', '#6e2246'];
    for (let i = 0; i < 8; i++) {
      g.fillStyle = cols[i % cols.length];
      g.globalAlpha = 0.55;
      g.fillRect(x0 + 8 + (i % 4) * (px(9) - px(0)), z0 + 8 + Math.floor(i / 4) * (px(12) - px(0)), px(7) - px(0), px(9) - px(0));
    }
    g.globalAlpha = 1;
  }
  // Lane markings: dashed center lines on every road.
  g.strokeStyle = '#d8b13a'; g.lineWidth = 2; g.setLineDash([14, 18]);
  for (const r of ROAD_LINES) {
    g.beginPath(); g.moveTo(px(r), px(-HALF)); g.lineTo(px(r), px(HALF)); g.stroke();
    g.beginPath(); g.moveTo(px(-HALF), px(r)); g.lineTo(px(HALF), px(r)); g.stroke();
  }
  g.setLineDash([]);
  // Edge lines.
  g.strokeStyle = 'rgba(230,230,230,0.55)'; g.lineWidth = 2;
  for (const r of ROAD_LINES) {
    for (const off of [-6.2, 6.2]) {
      g.beginPath(); g.moveTo(px(r + off), px(-HALF)); g.lineTo(px(r + off), px(HALF)); g.stroke();
      g.beginPath(); g.moveTo(px(-HALF), px(r + off)); g.lineTo(px(HALF), px(r + off)); g.stroke();
    }
  }
  // Crosswalks at every intersection.
  g.fillStyle = 'rgba(235,235,235,0.75)';
  for (const rx of ROAD_LINES) {
    for (const rz of ROAD_LINES) {
      for (let k = -3; k <= 3; k++) {
        g.fillRect(px(rx + k * 1.7) - 3, px(rz - 6.5), 6, px(13) - px(0));
        g.fillRect(px(rx - 6.5), px(rz + k * 1.7) - 3, px(13) - px(0), 6);
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function makeSignTexture(text, color) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#0c0a12'; g.fillRect(0, 0, 512, 128);
  g.font = 'bold 64px Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = color; g.shadowBlur = 26;
  g.fillStyle = color;
  g.fillText(text, 256, 66);
  g.shadowBlur = 0;
  g.strokeStyle = color; g.lineWidth = 4;
  g.strokeRect(6, 6, 500, 116);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class City {
  constructor(scene, seed = 1337) {
    this.scene = scene;
    this.rng = mulberry32(seed);
    this.colliders = [];   // AABBs {minX,maxX,minZ,maxZ}
    this.signs = [];       // pulsing neon materials
    this.water = null;
    this.buildings = 0;
    this.buildGround();
    this.buildBuildings();
    this.buildStreetlights();
    this.buildPalms();
    this.buildSigns();
    this.buildWaterAndPier();
    this.buildRoadGraph();
  }

  buildGround() {
    const tex = makeGroundTexture(this.rng);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(480, 480), mat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  buildBuildings() {
    const rng = this.rng;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0); // origin at base
    const winTex = makeWindowTexture();
    const mat = new THREE.MeshStandardMaterial({
      map: winTex, roughness: 0.85, metalness: 0.05,
      emissive: 0x999999, emissiveMap: winTex, emissiveIntensity: 0.55,
    });
    const placements = [];
    const palette = [0x8a93a8, 0x6e7b8a, 0xa89a7a, 0x7a6a8a, 0x5a6a7a, 0x9a8a6a, 0x4a5568];
    for (const bx of BLOCK_CENTERS) {
      for (const bz of BLOCK_CENTERS) {
        // The plaza (30,30) and the docks (150,30) stay open: fountain and yard.
        if ((bx === 30 && bz === 30) || (bx === 150 && bz === 30)) continue;
        const n = 1 + Math.floor(rng() * 3); // 1-3 buildings per block
        for (let i = 0; i < n; i++) {
          const w = 12 + rng() * 22, d = 12 + rng() * 22;
          const h = 9 + rng() * rng() * 42; // mostly low, some tall
          const ox = (rng() - 0.5) * (40 - w), oz = (rng() - 0.5) * (40 - d);
          const x = bx + ox, z = bz + oz;
          placements.push({ x, z, w, d, h, color: pick(rng, palette) });
          this.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
        }
      }
    }
    const inst = new THREE.InstancedMesh(geo, mat, placements.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const col = new THREE.Color();
    placements.forEach((b, i) => {
      p.set(b.x, 0, b.z); s.set(b.w, b.h, b.d);
      m.compose(p, q, s);
      inst.setMatrixAt(i, m);
      inst.setColorAt(i, col.setHex(b.color));
    });
    inst.castShadow = true; inst.receiveShadow = true;
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    this.scene.add(inst);
    this.buildings = placements.length;
    // A few antennas on the tallest buildings.
    const antGeo = new THREE.CylinderGeometry(0.12, 0.2, 7, 5);
    const antMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 });
    const tall = placements.filter((b) => b.h > 34).slice(0, 8);
    const ants = new THREE.InstancedMesh(antGeo, antMat, tall.length);
    tall.forEach((b, i) => {
      p.set(b.x, b.h + 3.5, b.z); s.set(1, 1, 1);
      m.compose(p, q, s);
      ants.setMatrixAt(i, m);
    });
    ants.instanceMatrix.needsUpdate = true;
    this.scene.add(ants);
  }

  buildStreetlights() {
    const rng = this.rng;
    const poleGeo = new THREE.CylinderGeometry(0.09, 0.13, 7, 6);
    poleGeo.translate(0, 3.5, 0);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.7, metalness: 0.4 });
    const lampGeo = new THREE.SphereGeometry(0.35, 8, 6);
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xffc95e, emissiveIntensity: 1.6 });
    const spots = [];
    const nearRoad = (v) => ROAD_LINES.some((r) => Math.abs(v - r) < 9);
    for (const r of ROAD_LINES) {
      for (let t = -180; t <= 180; t += 30) {
        // Keep poles off the crossing roads so none stands mid-lane.
        if (!nearRoad(t)) spots.push({ x: r + 7.4, z: t });
        if (!nearRoad(t)) spots.push({ x: t, z: r - 7.4 });
      }
    }
    const poles = new THREE.InstancedMesh(poleGeo, poleMat, spots.length);
    const lamps = new THREE.InstancedMesh(lampGeo, lampMat, spots.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    spots.forEach((sp, i) => {
      p.set(sp.x, 0, sp.z); m.compose(p, q, s);
      poles.setMatrixAt(i, m);
      p.set(sp.x, 7.1, sp.z); m.compose(p, q, s);
      lamps.setMatrixAt(i, m);
    });
    poles.instanceMatrix.needsUpdate = true;
    lamps.instanceMatrix.needsUpdate = true;
    this.scene.add(poles); this.scene.add(lamps);
  }

  buildPalms() {
    const rng = this.rng;
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 6.5, 6);
    trunkGeo.translate(0, 3.25, 0);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6a4a2f, roughness: 1 });
    const leafGeo = new THREE.ConeGeometry(2.6, 2.2, 6);
    leafGeo.translate(0, 7.2, 0);
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f7a4a, roughness: 1 });
    const spots = [];
    // Beach row along the east edge + around the plaza.
    for (let z = -190; z <= 190; z += 24) spots.push({ x: 196 + rng() * 6, z: z + rng() * 8 });
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2;
      spots.push({ x: 30 + Math.cos(ang) * 17, z: 30 + Math.sin(ang) * 17 });
    }
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
    const leaves = new THREE.InstancedMesh(leafGeo, leafMat, spots.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    spots.forEach((sp, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * Math.PI * 2);
      p.set(sp.x, 0, sp.z); s.set(1, 0.9 + rng() * 0.3, 1);
      m.compose(p, q, s);
      trunks.setMatrixAt(i, m); leaves.setMatrixAt(i, m);
      this.colliders.push({ minX: sp.x - 0.4, maxX: sp.x + 0.4, minZ: sp.z - 0.4, maxZ: sp.z + 0.4 });
    });
    trunks.instanceMatrix.needsUpdate = true;
    leaves.instanceMatrix.needsUpdate = true;
    this.scene.add(trunks); this.scene.add(leaves);
  }

  buildSigns() {
    const defs = [
      { text: 'NEON PLAZA', color: '#ff4fd8', at: [30, 26, 30, 6] },
      { text: 'HOTEL', color: '#4fd8ff', at: [30, 42, 30, 12] },
      { text: 'PIER 9', color: '#4fffc8', at: [150, 30, 30, 4] },
      { text: 'TACOS 24H', color: '#ffd24f', at: [-90, -118, -90, 8] },
      { text: 'CASINO', color: '#ff5a4f', at: [-30, -118, -30, 10] },
      { text: 'GARAGE', color: '#7dff4f', at: [-90, -118, -90, 14] },
      { text: 'MARINA', color: '#4f8fff', at: [90, 186, 90, 6] },
    ];
    for (const d of defs) {
      const tex = makeSignTexture(d.text, d.color);
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: false });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(16, 4), mat);
      mesh.position.set(d.at[0], d.at[3], d.at[1]);
      mesh.rotation.y = d.at[2] === 30 ? 0 : Math.PI / 2;
      this.scene.add(mesh);
      this.signs.push({ mat, phase: Math.random() * 6 });
    }
  }

  buildWaterAndPier() {
    // Real 3D shipping containers stacked in the docks yard.
    const contCols = [0xb5542f, 0x2f7ab5, 0x7ab52f, 0xb52f6e, 0xc9a227];
    const contGeo = new THREE.BoxGeometry(6, 2.6, 2.5);
    const contSpots = [
      [136, 18, 0], [143, 18, 0], [136, 24, 1], [150, 42, 2],
      [164, 18, 3], [164, 24, 4], [143, 42, 0], [157, 42, 1],
    ];
    for (const [cx, cz, ci] of contSpots) {
      const m = new THREE.Mesh(contGeo, new THREE.MeshStandardMaterial({ color: contCols[ci % contCols.length], roughness: 0.7, metalness: 0.3 }));
      m.position.set(cx, 1.3, cz);
      m.rotation.y = ci % 2 === 0 ? 0 : Math.PI / 2;
      m.castShadow = true; m.receiveShadow = true;
      this.scene.add(m);
      this.colliders.push({ minX: cx - 3.2, maxX: cx + 3.2, minZ: cz - 3.2, maxZ: cz + 3.2 });
    }
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x0d3a5c, roughness: 0.25, metalness: 0.4,
      emissive: 0x061e33, emissiveIntensity: 0.6,
    });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(140, 480), waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(280, -0.4, 0);
    this.scene.add(water);
    this.water = waterMat;
    // Wooden pier at the docks, reaching into the water.
    const pierMat = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1 });
    const pier = new THREE.Mesh(new THREE.BoxGeometry(46, 1.2, 8), pierMat);
    pier.position.set(228, 0.4, 30);
    pier.castShadow = true; pier.receiveShadow = true;
    this.scene.add(pier);
    this.colliders.push({ minX: 205, maxX: 252, minZ: 25, maxZ: 35 });
    // Harbor wall: keep the player on land.
    this.colliders.push({ minX: 206, maxX: 400, minZ: -240, maxZ: 240 });
  }

  buildRoadGraph() {
    // Intersections of the road grid; traffic drives node to node.
    this.nodes = [];
    this.nodeIndex = new Map();
    for (let i = 0; i < ROAD_LINES.length; i++) {
      for (let j = 0; j < ROAD_LINES.length; j++) {
        const key = `${i},${j}`;
        this.nodeIndex.set(key, this.nodes.length);
        this.nodes.push({ x: ROAD_LINES[i], z: ROAD_LINES[j], i, j });
      }
    }
  }

  neighbors(node) {
    const out = [];
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [di, dj] of dirs) {
      const ni = node.i + di, nj = node.j + dj;
      if (ni >= 0 && ni < ROAD_LINES.length && nj >= 0 && nj < ROAD_LINES.length) {
        out.push(this.nodes[this.nodeIndex.get(`${ni},${nj}`)]);
      }
    }
    return out;
  }

  randomRoadPoint(rng) {
    const a = this.nodes[Math.floor(rng() * this.nodes.length)];
    const ns = this.neighbors(a);
    const b = ns[Math.floor(rng() * ns.length)];
    const t = rng();
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, heading: Math.atan2(-(b.z - a.z), b.x - a.x) };
  }

  placePosition(name) {
    const p = PLACES[name];
    const w = blockToWorld(p.bx, p.bz);
    // The marker sits on the block's south-edge sidewalk, by the road —
    // the block center can hold a building the player could never reach.
    return { x: w.x, z: w.z + 21, name: p.name, color: p.color };
  }

  update(time) {
    // Gentle neon flicker + water shimmer.
    for (const s of this.signs) {
      s.mat.opacity = 1;
    }
    if (this.water) this.water.emissiveIntensity = 0.5 + Math.sin(time * 0.7) * 0.12;
  }
}
