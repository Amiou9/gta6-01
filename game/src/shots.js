// NEON HARBOR — deterministic screenshot setups (?shot=chase|drive|street|mission).
// Each one stages the world so the screenshot shows several systems at once.
import { CONFIG } from './config.js';

export function parseShot() {
  const q = new URLSearchParams(location.search);
  const shot = q.get('shot');
  const seed = Number(q.get('seed') || 1);
  return shot ? { shot, seed } : null;
}

// Stage the game for a screenshot, then run a fixed number of sim steps so
// traffic, police and particles are mid-action when the shot is taken.
export function setupShot(game, name) {
  const { player, traffic, police, missions, hud, city } = game;
  game.state = 'playing';
  game.menuVisible = false;
  document.getElementById('menu').style.display = 'none';
  hud.setObjective('');
  if (name === 'chase') {
    // Cover: police chase with 3 stars, minimap, mission objective, traffic.
    const car = traffic.parked[0] || traffic.cars[0];
    game.enterCar(car, true);
    player.group.visible = false;
    car.group.position.set(-60, 0, -30);
    car.heading = Math.PI / 2;
    car.speed = 26;
    missions.jumpTo(3);
    missions.step = 1;
    missions.timer = 120;
    missions.pushObjective();
    police.setHeat(3);
    hud.setObjective('Drive Vera to the Coral Point safehouse — 2:00 left');
    game.camYaw = Math.PI / 2;
    game.camPitch = 0.32;
  } else if (name === 'drive') {
    // Driving through traffic at the Neon Plaza intersection.
    const car = traffic.parked[1] || traffic.cars[1];
    game.enterCar(car, true);
    car.group.position.set(-24, 0, 0);
    car.heading = 0;
    car.speed = 18;
    missions.jumpTo(1);
    hud.setObjective('Pick up the package at Pier 9');
    game.camYaw = 0;
    game.camPitch = 0.3;
  } else if (name === 'street') {
    // On foot at a busy intersection: peds around, a car to steal nearby.
    player.x = 52; player.z = -8;
    player.group.position.set(52, 0, -8);
    player.heading = Math.PI / 4;
    missions.jumpTo(0);
    hud.setObjective('Steal a car (walk up to one and press E)');
    game.camYaw = Math.PI * 1.25;
    game.camPitch = 0.28;
    // Stage a stealable car and a few pedestrians in frame.
    const parked = traffic.parked[0];
    if (parked) {
      parked.group.position.set(56, 0, 6);
      parked.heading = Math.PI / 2;
      parked.group.rotation.y = parked.heading;
    }
    const pedSpots = [[58, -4], [38, -14], [62, -10], [46, -2]];
    game.peds.peds.slice(0, 4).forEach((ped, i) => {
      ped.x = pedSpots[i][0]; ped.z = pedSpots[i][1];
      ped.group.position.set(ped.x, 0, ped.z);
    });
  } else if (name === 'mission') {
    // Mission in progress at the docks: package pickup, timer running.
    const car = traffic.parked[2] || traffic.cars[2];
    game.enterCar(car, true);
    car.group.position.set(126, 0, 30);
    car.heading = 0;
    car.speed = 12;
    missions.jumpTo(1);
    missions.step = 1;
    missions.timer = 74;
    missions.pushObjective();
    hud.setObjective('Deliver to the Neon Plaza hotel — 1:14 left');
    game.camYaw = Math.PI;
    game.camPitch = 0.3;
  }
  // Run the world forward so it is alive in the shot (deterministic steps).
  for (let i = 0; i < 100; i++) game.step(1 / 60, true);
  // Chase: put the patrol cars visibly behind the player, off the camera
  // axis, holding pace so the composition survives the screenshot.
  if (name === 'chase' && game.car) {
    const car = game.car;
    const fx = Math.cos(car.heading), fz = -Math.sin(car.heading);
    const rx = -fz, rz = fx; // right vector
    const spots = [[-2, -8], [6, 8], [14, -7]]; // [forward, lateral] — visible around the player
    police.cars.forEach((pc, i) => {
      const [fwd, lat] = spots[i % spots.length];
      pc.group.position.set(car.x + fx * fwd + rx * lat, 0, car.z + fz * fwd + rz * lat);
      pc.heading = car.heading;
      pc.group.rotation.y = car.heading;
      pc.speed = 30;
    });
    police.pinSpeeds = [30, 30, 30];
    police.pinHeading = true;
    car.speed = 30;
    game.cruiseSpeed = 30;
  }
  if (name === 'drive' && game.car) { game.car.speed = 22; game.cruiseSpeed = 22; }
  if (name === 'mission' && game.car) { game.car.speed = 20; game.cruiseSpeed = 20; }
  // Let the chase camera converge on its target before the shot.
  game.snapCam = true;
  for (let i = 0; i < 80; i++) game.positionCamera();
  game.render();
  window.__shotReady = true;
}
