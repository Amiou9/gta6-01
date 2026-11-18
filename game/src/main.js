// NEON HARBOR — main game: renderer, loop, cameras, driving, combat,
// wanted flow, missions wiring, save, menus and screenshot shots.
import * as THREE from 'three';
import { CONFIG, MISSIONS, STREET_NAMES } from './config.js';
import { City, ROAD_LINES, blockToWorld } from './city.js';
import { Player } from './player.js';
import { TrafficManager } from './vehicles.js';
import { PedManager, PickupManager } from './peds.js';
import { Police } from './police.js';
import { MissionManager } from './missions.js';
import { HUD } from './hud.js';
import { AudioEngine } from './audio.js';
import { Effects } from './effects.js';
import { Input } from './input.js';
import { loadSave, writeSave } from './save.js';
import { parseShot, setupShot } from './shots.js';
import { clamp, dist2D, formatCash, mulberry32 } from './utils.js';

const STEP = 1 / 60;

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.state = 'menu';
    this.menuVisible = true;
    this.time = 0;
    this.cash = CONFIG.economy.startCash;
    this.bestWanted = 0;
    this.car = null; // the car the player drives, if any
    this.camYaw = Math.PI;
    this.camPitch = 0.32;
    this.camDist = 7;
    this.saveTimer = 0;
    this.retryTimer = 0;
    this.nextJobTimer = 0;
    this.cruiseSpeed = null; // shot mode: hold the player's car at this speed
    this.snapCam = false; // shot mode: camera snaps to its target each frame
    this.shotThreat = null;
    this.prevWanted = 0;
    this.streetTimer = 0;
    this.seed = 1337;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x2a1e3f, 120, 420);
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);

    // Dusk sun + ambient.
    const hemi = new THREE.HemisphereLight(0x9a8bd8, 0x3a2c22, 1.5);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffb36a, 2.8);
    sun.position.set(120, 90, -60);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -160; sun.shadow.camera.right = 160;
    sun.shadow.camera.top = 160; sun.shadow.camera.bottom = -160;
    sun.shadow.camera.far = 500;
    sun.shadow.bias = -0.0004;
    this.scene.add(sun);
    this.sun = sun;
    // Cool fill from the opposite side so building backs are never black.
    const fill = new THREE.DirectionalLight(0x6a8aff, 0.9);
    fill.position.set(-100, 60, 80);
    this.scene.add(fill);

    // Gradient dusk sky dome.
    const skyCanvas = document.createElement('canvas');
    skyCanvas.width = 4; skyCanvas.height = 256;
    const sg = skyCanvas.getContext('2d');
    const grad = sg.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#1a1033');
    grad.addColorStop(0.45, '#4a2a5e');
    grad.addColorStop(0.72, '#c65a4a');
    grad.addColorStop(0.88, '#ff9a5a');
    grad.addColorStop(1, '#2a1e3f');
    sg.fillStyle = grad; sg.fillRect(0, 0, 4, 256);
    const skyTex = new THREE.CanvasTexture(skyCanvas);
    skyTex.colorSpace = THREE.SRGBColorSpace;
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(800, 24, 16),
      new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }),
    );
    this.scene.add(sky);

    this.hud = new HUD();
    this.audio = new AudioEngine();
    this.input = new Input(canvas);
    this.effects = new Effects(this.scene);
    this.raycaster = new THREE.Raycaster();

    window.addEventListener('resize', () => this.onResize());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.saveGame(); });
  }

  init() {
    const rng = mulberry32(this.seed);
    this.city = new City(this.scene, this.seed);
    this.player = new Player(this.scene, -90, -60); // on the road south of Vera's garage
    this.player.heading = 0; // facing the garage
    this.traffic = new TrafficManager(this.scene, this.city, rng);
    this.peds = new PedManager(this.scene, this.city, rng);
    this.pickups = new PickupManager(this.scene, rng);
    this.police = new Police(this.scene, this.city, rng);
    this.missions = new MissionManager(this.city, this.missionHooks());
    this.police.onBusted = () => this.onBusted();

    // Mission marker beacon: a tall glowing column over the objective point.
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0x2fd6a3, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending });
    this.beacon = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 46, 12, 1, true), beaconMat);
    this.beacon.visible = false;
    this.scene.add(this.beacon);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x2fd6a3, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false });
    this.beaconRing = new THREE.Mesh(new THREE.RingGeometry(3.2, 4.2, 24), ringMat);
    this.beaconRing.rotation.x = -Math.PI / 2;
    this.beaconRing.visible = false;
    this.scene.add(this.beaconRing);

    // Restore a save, if one exists.
    const save = loadSave();
    this.save = save;
    if (save) {
      this.cash = save.cash;
      this.bestWanted = save.bestWanted;
      this.audio.setMuted(save.muted);
      document.getElementById('continue-btn').style.display = 'inline-block';
      document.getElementById('continue-note').textContent =
        `Save found: ${formatCash(save.cash)} · ${save.missionsCompleted} of ${MISSIONS.length} jobs done`;
    }
    this.hud.setCash(this.cash);
    this.hud.setHealth(this.player.health, this.player.maxHealth);
    this.hud.setWanted(0);
    this.hud.setObjective('Start a new game, or continue your save.');
    this.hud.setTimer(null);
    this.bindMenu();
    this.bindPause();

    const shot = parseShot();
    window.__shotReady = false;
    if (shot) {
      this.seed = shot.seed;
      setupShot(this, shot.shot);
    }
    window.NH = {
      game: this, player: this.player, police: this.police,
      missions: this.missions, traffic: this.traffic, peds: this.peds,
      get state() { return window.__gameState; },
    };
    window.__gameState = this.state;
  }

  missionHooks() {
    return {
      message: (t) => this.hud.showMessage(t),
      banner: (t, s) => this.hud.banner(t, s),
      objective: (t) => this.hud.setObjective(t),
      reward: (amount) => {
        this.cash += amount;
        this.hud.setCash(this.cash);
        this.audio.missionDone();
        this.saveGame();
      },
      failed: (reason) => {
        this.audio.missionFail();
        this.hud.showMessage(reason, 7000);
        this.retryTimer = 3;
      },
      retryIn: (s) => { this.retryTimer = s; },
      nextJobIn: (s) => { this.nextJobTimer = s; },
      setHeat: (n) => this.police.setHeat(n),
      finished: () => this.onFinished(),
    };
  }

  bindMenu() {
    const startBtn = document.getElementById('start-btn');
    const contBtn = document.getElementById('continue-btn');
    const muteBtn = document.getElementById('mute-btn');
    startBtn.addEventListener('click', () => {
      this.audio.ensure();
      this.audio.click();
      this.startGame(false);
    });
    contBtn.addEventListener('click', () => {
      this.audio.ensure();
      this.audio.click();
      this.startGame(true);
    });
    muteBtn.addEventListener('click', () => {
      this.audio.ensure();
      this.audio.setMuted(!this.audio.muted);
      muteBtn.textContent = this.audio.muted ? '🔇 Sound: off' : '🔊 Sound: on';
      this.saveGame();
    });
    if (this.save && this.save.muted) muteBtn.textContent = '🔇 Sound: off';
  }

  bindPause() {
    document.getElementById('resume-btn').addEventListener('click', () => this.resume());
    document.getElementById('quit-btn').addEventListener('click', () => {
      this.saveGame();
      this.state = 'menu';
      document.getElementById('pause').style.display = 'none';
      document.getElementById('menu').style.display = 'flex';
      this.menuVisible = true;
      this.audio.musicStop();
      this.audio.sirenStop();
      this.audio.engineUpdate(0, false);
    });
  }

  startGame(fromSave) {
    document.getElementById('menu').style.display = 'none';
    this.menuVisible = false;
    this.state = 'playing';
    window.__gameState = 'playing';
    this.audio.ensure();
    this.audio.musicStart();
    if (fromSave && this.save) {
      const done = Math.min(this.save.missionsCompleted, MISSIONS.length - 1);
      if (this.save.missionsCompleted >= MISSIONS.length) {
        this.missions.done = true;
        this.missions.completedCount = MISSIONS.length;
        this.hud.setObjective('Free roam — Neon Harbor is yours. Missions complete.');
        this.hud.showMessage('Welcome back, Rook. The city is yours.');
      } else {
        this.missions.jumpTo(done);
      }
    } else {
      this.cash = CONFIG.economy.startCash;
      this.hud.setCash(this.cash);
      this.missions.start();
    }
    this.hud.showMessage('Vera Kline is waiting. Check your objective, top left.');
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    window.__gameState = 'paused';
    document.getElementById('pause').style.display = 'flex';
    this.audio.engineUpdate(0, false);
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    window.__gameState = 'playing';
    document.getElementById('pause').style.display = 'none';
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  saveGame() {
    if (!this.missions) return;
    writeSave({
      cash: this.cash,
      missionsCompleted: this.missions.completedCount,
      bestWanted: this.bestWanted,
      muted: this.audio.muted,
    });
  }

  loop = (t) => {
    requestAnimationFrame(this.loop);
    const now = t / 1000;
    let dt = Math.min(0.1, now - (this.lastT || now));
    this.lastT = now;
    if (this.state === 'playing') {
      this.acc = (this.acc || 0) + dt;
      while (this.acc >= STEP) {
        this.step(STEP, false);
        this.acc -= STEP;
      }
    } else if (this.state === 'menu') {
      // Slow orbit around the city behind the start screen.
      this.time += dt;
      const a = this.time * 0.05;
      this.camera.position.set(Math.cos(a) * 150, 55, Math.sin(a) * 150);
      this.camera.lookAt(0, 0, 0);
      this.city.update(this.time);
      this.effects.update(dt);
    }
    this.render();
    this.input.endFrame();
  };

  render() {
    this.positionCamera();
    this.renderer.render(this.scene, this.camera);
  }

  positionCamera() {
    if (this.state === 'menu') return; // orbit set in loop()
    const shake = this.effects.shakeOffset(this.time);
    if (this.car) {
      const car = this.car;
      const back = car.heading + Math.PI;
      const dist = 11, height = 5.0;
      const tx = car.x + Math.cos(back) * dist;
      const tz = car.z - Math.sin(back) * dist;
      const k = this.snapCam ? 1 : 1 - Math.exp(-6 * (1 / 60));
      this.camera.position.x += (tx - this.camera.position.x) * k;
      this.camera.position.y += (height - this.camera.position.y) * k;
      this.camera.position.z += (tz - this.camera.position.z) * k;
      this.camera.lookAt(car.x + Math.cos(car.heading) * 3, 1.4 + shake.y, car.z - Math.sin(car.heading) * 3);
      this.camera.fov = 62 + clamp(Math.abs(car.speed) / 46, 0, 1) * 10;
      this.camera.updateProjectionMatrix();
    } else {
      const p = this.player;
      const dist = this.camDist, height = 2.6 + this.camPitch * 4;
      // Camera sits behind the yaw direction, looking at the player.
      const cx = p.x + Math.sin(this.camYaw) * dist;
      const cz = p.z + Math.cos(this.camYaw) * dist;
      const k = this.snapCam ? 1 : 1 - Math.exp(-14 * (1 / 60));
      this.camera.position.x += (cx - this.camera.position.x) * k;
      this.camera.position.y += (height - this.camera.position.y) * k;
      this.camera.position.z += (cz - this.camera.position.z) * k;
      this.camera.lookAt(p.x + shake.x, 1.7 + shake.y, p.z);
      this.camera.fov = 62;
      this.camera.updateProjectionMatrix();
    }
  }

  // One fixed simulation step. `silent` skips audio/input (used by shot setups).
  step(dt, silent = false) {
    this.time += dt;
    const input = this.input;
    const player = this.player;

    // Global keys.
    if (!silent) {
      if (input.wasPressed('KeyP') || input.wasPressed('Escape')) {
        if (this.state === 'playing') this.pause();
        else if (this.state === 'paused') this.resume();
      }
      if (input.wasPressed('KeyM')) {
        this.audio.setMuted(!this.audio.muted);
        this.saveGame();
      }
    }

    // Mouse look.
    const md = input.takeMouseDelta();
    if (md.dx !== 0 || md.dy !== 0) {
      this.camYaw -= md.dx * 0.0032;
      this.camPitch = clamp(this.camPitch + md.dy * 0.0022, 0.08, 1.05);
    }

    // Timers for mission retry / next job.
    if (this.retryTimer > 0) {
      this.retryTimer -= dt;
      if (this.retryTimer <= 0) this.missions.retry();
    }
    if (this.nextJobTimer > 0) {
      this.nextJobTimer -= dt;
      if (this.nextJobTimer <= 0) this.missions.next();
    }

    const allCars = [...this.traffic.cars, ...this.police.cars];

    // --- Player / car ---
    if (this.car) {
      const car = this.car;
      const throttle = input.forward ? 1 : input.back ? -1 : 0;
      const steer = input.left ? 1 : input.right ? -1 : 0;
      car.drive(dt, throttle, steer, input.handbrake);
      car.collide(this.city.colliders, allCars);
      if (this.cruiseSpeed != null) car.speed = this.cruiseSpeed;
      if (input.handbrake && Math.abs(car.speed) > 10 && Math.random() < 0.5) {
        this.effects.smoke(car.x, 0.4, car.z, 1);
      }
      if (car.health < 40 && Math.random() < 0.3) {
        this.effects.smoke(car.x, 1.2, car.z, 1);
      }
      if (!silent) this.audio.engineUpdate(clamp(Math.abs(car.speed) / 46, 0, 1), true);
      // Hitting pedestrians while driving.
      for (const ped of this.peds.peds) {
        if (!ped.dead && dist2D(car.x, car.z, ped.x, ped.z) < 2.4 && Math.abs(car.speed) > 6) {
          ped.damage(100);
          this.police.addHeat(1);
          this.effects.sparks(ped.x, 1, ped.z);
          this.effects.shake(0.25);
          if (!silent) { this.audio.crash(); this.hud.flashDamage(); }
        }
      }
      // Car destroyed while driving.
      if (car.dead) {
        this.effects.sparks(car.x, 1, car.z);
        this.effects.smoke(car.x, 1.5, car.z, 8);
        if (!silent) { this.audio.crash(); this.effects.shake(0.7); }
        player.damage(30);
        this.exitCar(true);
      }
      if (!silent && input.wasPressed('KeyE')) this.exitCar(false);
      if (!silent && input.wasPressed('KeyH')) this.audio.horn();
    } else {
      const camInput = { forward: input.forward, back: input.back, left: input.left, right: input.right, sprint: input.sprint, jump: input.jump };
      player.update(dt, camInput, this.camYaw, this.city.colliders, allCars);
      if (!silent) this.audio.engineUpdate(0, false);
      // Enter a car.
      if (!silent && input.wasPressed('KeyE')) {
        const car = this.traffic.nearestStealable(player.x, player.z, 4.2);
        if (car) this.enterCar(car, false);
      }
      // Punch.
      if (!silent && input.wasPressed('KeyF') && player.canPunch()) {
        player.punch();
        this.audio.punch();
        const ped = this.peds.nearest(player.x, player.z, 2.4);
        if (ped) {
          const killed = ped.damage(25);
          this.effects.sparks(ped.x, 1.2, ped.z);
          if (killed) this.police.addHeat(1);
        } else {
          const car = this.traffic.nearestStealable(player.x, player.z, 2.6);
          if (car) { car.damage(8); this.effects.sparks(car.x, 1, car.z); }
        }
      }
      // Shoot (mouse click).
      if (!silent && (input.mouseDown || input.consumeMouseClick()) && player.canShoot()) {
        this.shoot();
      }
      if (!silent && input.wasPressed('KeyR')) player.reload();
    }

    // --- World systems ---
    const threats = [];
    if (this.car && Math.abs(this.car.speed) > 8) threats.push({ x: this.car.x, z: this.car.z, radius: 9 });
    if (this.shotThreat) {
      threats.push(this.shotThreat);
      this.shotThreat.ttl -= dt;
      if (this.shotThreat.ttl <= 0) this.shotThreat = null;
    }
    this.traffic.update(dt, player.pos, allCars);
    this.peds.update(dt, threats);
    const playerPos = this.car ? { x: this.car.x, z: this.car.z } : player.pos;
    const playerSpeed = this.car ? Math.abs(this.car.speed) : player.speed;
    this.police.update(dt, playerPos, playerSpeed, !!this.car, this.car);
    this.missions.update(dt, { x: playerPos.x, z: playerPos.z, inCar: !!this.car, wanted: this.police.level });

    // Police ramming the player on foot.
    if (!this.car && !player.dead) {
      for (const pc of this.police.cars) {
        if (pc.dead) continue;
        if (dist2D(pc.x, pc.z, player.x, player.z) < 2.8 && Math.abs(pc.speed) > 6) {
          player.damage(14);
          this.effects.shake(0.4);
          if (!silent) { this.audio.crash(); this.hud.flashDamage(); }
        }
      }
    }

    // Cash pickups.
    const got = this.pickups.update(dt, this.time, playerPos);
    if (got) {
      this.cash += CONFIG.economy.cashPickup;
      this.hud.setCash(this.cash);
      this.effects.cash(got.x, 1, got.z);
      if (!silent) this.audio.pickup();
    }

    // Mission beacon follows the active objective marker.
    const mk = this.missions.marker();
    if (mk) {
      this.beacon.visible = true;
      this.beaconRing.visible = true;
      this.beacon.position.set(mk.x, 23, mk.z);
      this.beaconRing.position.set(mk.x, 0.15, mk.z);
      this.beacon.material.opacity = 0.22 + Math.sin(this.time * 3) * 0.08;
      const s = 1 + Math.sin(this.time * 3) * 0.12;
      this.beaconRing.scale.set(s, s, 1);
    } else {
      this.beacon.visible = false;
      this.beaconRing.visible = false;
    }

    // Wanted level changes.
    if (this.police.level !== this.prevWanted) {
      this.bestWanted = Math.max(this.bestWanted, this.police.level);
      this.prevWanted = this.police.level;
      this.hud.setWanted(this.police.level);
      if (!silent) {
        if (this.police.level > 0) { this.audio.sirenStart(); this.hud.showMessage(`Wanted level ${this.police.level} — the harbor patrol is on you.`); }
        else { this.audio.sirenStop(); this.hud.showMessage('You lost the heat. For now.'); }
      }
    }

    // HUD.
    this.hud.setHealth(player.health, player.maxHealth);
    this.hud.setCash(this.cash);
    if (this.missions.mission && this.missions.stepDef && this.missions.stepDef.timed) {
      this.hud.setTimer(this.missions.timer);
    } else if (this.missions.mission && this.missions.mission.time && this.missions.stepDef && this.missions.stepDef.type === 'goto' && this.missions.timer > 0) {
      this.hud.setTimer(this.missions.timer);
    } else {
      this.hud.setTimer(null);
    }
    if (this.car) {
      this.hud.setSpeed(Math.abs(this.car.speed) * 3.6, this.car.def.label);
      this.hud.hideAmmo();
    } else {
      this.hud.setSpeed(0, null);
      this.hud.setAmmo(player.ammo, player.reloadTimer > 0);
    }
    this.hud.setCrosshair(!this.car);
    this.hud.tickClock(dt);
    this.hud.drawMinimap(dt, this.city, playerPos, this.traffic.cars, this.police.cars, this.missions.marker(), this.car ? this.car.heading : this.camYaw);

    // Contextual hint.
    if (!silent) {
      if (!this.car) {
        const car = this.traffic.nearestStealable(player.x, player.z, 4.2);
        this.hud.setHint(car ? `E — Steal the ${car.def.label}` : 'WASD move · Shift sprint · F punch · Click shoot · E enter car');
      } else {
        this.hud.setHint('W/S drive · A/D steer · Space handbrake · E exit car · H horn');
      }
    }

    // Street name.
    this.streetTimer -= dt;
    if (this.streetTimer <= 0) {
      this.streetTimer = 0.5;
      let bi = 0, bd = Infinity;
      for (let i = 0; i < ROAD_LINES.length; i++) {
        const d = Math.min(Math.abs(playerPos.x - ROAD_LINES[i]), Math.abs(playerPos.z - ROAD_LINES[i]));
        if (d < bd) { bd = d; bi = i; }
      }
      const el = document.getElementById('street');
      if (el) el.textContent = STREET_NAMES[bi % STREET_NAMES.length];
    }

    // Player death.
    if (player.dead) this.onWasted();
    if (player.health < 40 && !silent) this.hud.flashDamage();

    // Autosave.
    this.saveTimer += dt;
    if (this.saveTimer > 20) { this.saveTimer = 0; this.saveGame(); }

    this.city.update(this.time);
    this.effects.update(dt);
  }

  enterCar(car, silent) {
    const wasParked = car.driver === 'parked';
    const wasTraffic = car.driver === 'traffic';
    car.driver = 'player';
    this.car = car;
    this.player.group.visible = false;
    if (!silent) {
      this.audio.engineStart();
      if (wasParked || wasTraffic) {
        this.police.addHeat(CONFIG.wanted.stealCar);
        this.hud.showMessage(`You took the ${car.def.label}. The owner will not be happy.`);
        this.missions.onCarStolen();
      } else {
        this.hud.showMessage(`You are driving the ${car.def.label}.`);
      }
    }
  }

  exitCar(forced) {
    if (!this.car) return;
    const car = this.car;
    this.car = null;
    car.driver = 'parked';
    car.speed = 0;
    const p = this.player;
    p.x = car.x + Math.cos(car.heading + Math.PI / 2) * 2.6;
    p.z = car.z - Math.sin(car.heading + Math.PI / 2) * 2.6;
    p.group.position.set(p.x, 0, p.z);
    p.group.visible = true;
    if (!forced) this.audio.engineUpdate(0, false);
  }

  shoot() {
    const player = this.player;
    player.shoot();
    this.audio.shot();
    // Raycast from the camera through the mouse.
    const nx = (this.input.mouseX / window.innerWidth) * 2 - 1;
    const ny = -(this.input.mouseY / window.innerHeight) * 2 + 1;
    this.raycaster.setFromCamera({ x: nx, y: ny }, this.camera);
    this.raycaster.far = CONFIG.player.pistolRange;
    const targets = [];
    for (const ped of this.peds.peds) if (!ped.dead) targets.push({ root: ped.group, kind: 'ped', ref: ped });
    for (const car of [...this.traffic.cars, ...this.police.cars]) {
      if (!car.dead) targets.push({ root: car.group, kind: 'car', ref: car });
    }
    let best = null, bestDist = Infinity;
    for (const t of targets) {
      const hits = this.raycaster.intersectObject(t.root, true);
      if (hits.length > 0 && hits[0].distance < bestDist) { best = t; bestDist = hits[0].distance; }
    }
    const origin = this.camera.position.clone();
    const dir = this.raycaster.ray.direction.clone();
    const muzzlePos = origin.clone().add(dir.clone().multiplyScalar(2));
    this.effects.muzzle(muzzlePos.x, muzzlePos.y, muzzlePos.z);
    this.effects.shake(0.08);
    if (best) {
      const hitPoint = origin.clone().add(dir.clone().multiplyScalar(bestDist));
      this.effects.sparks(hitPoint.x, hitPoint.y, hitPoint.z);
      if (best.kind === 'ped') {
        const killed = best.ref.damage(CONFIG.player.pistolDamage);
        if (killed) this.police.addHeat(1);
        else this.police.addHeat(0); // shooting near people still draws eyes
      } else {
        best.ref.damage(CONFIG.player.pistolDamage);
        if (best.ref.isPolice) this.police.addHeat(CONFIG.wanted.hitCop);
      }
    }
    this.shotThreat = { x: player.x, z: player.z, radius: 22, ttl: 3 };
    if (this.police.level === 0) this.police.addHeat(CONFIG.wanted.shoot);
  }

  onBusted() {
    if (this.state !== 'playing') return;
    const lost = Math.floor(this.cash * CONFIG.economy.deathPenalty);
    this.cash -= lost;
    this.police.clearHeat();
    this.audio.busted();
    this.audio.sirenStop();
    this.state = 'over';
    window.__gameState = 'over';
    this.hud.showEnd('BUSTED', `The harbor patrol got you. You lost ${formatCash(lost)} in fines and impound fees.`,
      `Cash: ${formatCash(this.cash)} · Jobs done: ${this.missions.completedCount} of ${MISSIONS.length}`,
      'Walk out of the precinct', () => this.respawnAtHospital());
  }

  onWasted() {
    if (this.state !== 'playing') return;
    const lost = Math.floor(this.cash * CONFIG.economy.deathPenalty);
    this.cash -= lost;
    this.police.clearHeat();
    this.audio.busted();
    this.audio.sirenStop();
    this.state = 'over';
    window.__gameState = 'over';
    this.hud.showEnd('WASTED', `Rook went down. Harbor General patched him up — for ${formatCash(lost)}.`,
      `Cash: ${formatCash(this.cash)} · Jobs done: ${this.missions.completedCount} of ${MISSIONS.length}`,
      'Get back on your feet', () => this.respawnAtHospital());
  }

  onFinished() {
    this.audio.missionDone();
    this.saveGame();
    this.state = 'over';
    window.__gameState = 'over';
    this.hud.showEnd('HARBOR LEGEND', 'Vera paid in full. The last chain is done — Neon Harbor is yours, Rook.',
      `Cash: ${formatCash(this.cash)} · All ${MISSIONS.length} jobs complete · Best heat: ${this.bestWanted}★`,
      'Keep playing — free roam', () => {
        this.state = 'playing';
        window.__gameState = 'playing';
        this.hud.setObjective('Free roam — Neon Harbor is yours.');
      });
  }

  respawnAtHospital() {
    const h = this.city.placePosition('hospital');
    if (this.car) { this.car.driver = 'parked'; this.car = null; }
    this.player.respawn(h.x, h.z + 12);
    this.police.removeAll();
    this.state = 'playing';
    window.__gameState = 'playing';
    this.hud.setHealth(this.player.health, this.player.maxHealth);
    this.hud.setCash(this.cash);
    this.saveGame();
  }
}

// Boot.
const canvas = document.getElementById('game');
const game = new Game(canvas);
try {
  game.init();
  game.loop(0);
} catch (err) {
  const status = document.getElementById('status');
  if (status) status.textContent = 'Neon Harbor could not start: ' + err.message;
  console.error(err);
}
