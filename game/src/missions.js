// NEON HARBOR — missions: a four-job story chain for Rex "Rook" Calloway,
// with objectives, timers, markers and rewards. All fiction, all original.
import { MISSIONS } from './config.js';
import { dist2D } from './utils.js';

export class MissionManager {
  constructor(city, hooks) {
    this.city = city;
    this.hooks = hooks; // { message(text), banner(title, sub), objective(text), reward(amount), failed(reason), finished() }
    this.index = -1;    // -1 = no mission yet
    this.step = 0;
    this.timer = 0;
    this.active = false;
    this.done = false;
    this.completedCount = 0;
    this.waitingStart = true;
  }

  get mission() { return this.index >= 0 ? MISSIONS[this.index] : null; }
  get stepDef() { return this.mission ? this.mission.steps[this.step] : null; }

  start() {
    this.index = 0;
    this.step = 0;
    this.active = true;
    this.waitingStart = false;
    this.beginMission();
  }

  beginMission() {
    const m = this.mission;
    this.hooks.banner(m.name, `Job ${this.index + 1} of ${MISSIONS.length} — ${m.giver}`);
    this.hooks.message(`${m.giver}: "${m.brief}"`);
    this.pushObjective();
  }

  pushObjective() {
    const s = this.stepDef;
    if (s) this.hooks.objective(s.text);
  }

  marker() {
    const s = this.stepDef;
    if (!s || s.type !== 'goto') return null;
    const p = this.city.placePosition(s.point);
    return { x: p.x, z: p.z, color: p.color, name: p.name };
  }

  // Called by the game when the player steals a car.
  onCarStolen() {
    if (!this.active) return;
    const s = this.stepDef;
    if (s && s.type === 'steal') this.advance();
  }

  advance() {
    this.step += 1;
    if (this.step >= this.mission.steps.length) {
      this.completeMission();
    } else {
      const s = this.stepDef;
      if (s.type === 'goto' && s.timed) this.timer = this.mission.time;
      if (s.heat) this.hooks.setHeat && this.hooks.setHeat(s.heat);
      this.pushObjective();
    }
  }

  completeMission() {
    const m = this.mission;
    this.hooks.reward(m.reward);
    this.hooks.banner('Job complete', `${m.name} — ${'$' + m.reward.toLocaleString('en-US')} earned`);
    this.hooks.message(`${m.giver}: "Clean work, Rook. The money is yours."`);
    this.completedCount += 1;
    this.index += 1;
    this.step = 0;
    this.active = false;
    if (this.index >= MISSIONS.length) {
      this.done = true;
      this.hooks.finished();
    } else {
      // Short breather, then the next job's briefing.
      this.active = false;
      this.waitingStart = true;
      this.hooks.nextJobIn && this.hooks.nextJobIn(4);
    }
  }

  failMission(reason) {
    this.hooks.failed(reason);
    this.step = 0;
    this.active = false;
    this.waitingStart = true;
    this.hooks.retryIn && this.hooks.retryIn(3);
  }

  // Restart the current mission after a failure.
  retry() {
    this.step = 0;
    this.active = true;
    this.waitingStart = false;
    this.beginMission();
  }

  // Start the next mission after the breather.
  next() {
    this.active = true;
    this.waitingStart = false;
    this.beginMission();
  }

  update(dt, state) {
    if (!this.active || !this.mission) return;
    const s = this.stepDef;
    if (!s) return;
    if (s.type === 'goto') {
      const p = this.city.placePosition(s.point);
      const d = dist2D(state.x, state.z, p.x, p.z);
      if (s.timed) {
        this.timer -= dt;
        if (this.timer <= 0) {
          this.failMission('Out of time — the job fell through. Vera will let you try again.');
          return;
        }
      }
      if (d < 12) {
        if (this.mission.id === 'm1' && !state.inCar) {
          this.hooks.message('Bring the car to the garage — park it on the marker.');
          return;
        }
        this.advance();
      }
    } else if (s.type === 'wanted') {
      if (state.wanted >= s.level) this.advance();
    } else if (s.type === 'evade') {
      if (state.wanted === 0) this.advance();
    }
  }

  // For save/shot modes: jump straight to a mission.
  jumpTo(index) {
    this.index = index;
    this.step = 0;
    this.active = true;
    this.waitingStart = false;
    this.completedCount = index;
    this.beginMission();
  }
}
