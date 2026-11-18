// NEON HARBOR — the HUD: cash, wanted stars, health, objective, timer,
// speed, ammo, minimap, message feed, banners and end screens.
import { formatCash, formatTime } from './utils.js';
import { ROAD_LINES } from './city.js';

export class HUD {
  constructor() {
    this.el = (id) => document.getElementById(id);
    this.minimap = this.el('minimap');
    this.mm = this.minimap.getContext('2d');
    this.messages = [];
    this.mmTimer = 0;
    this.clock = 19 * 60 + 24; // 19:24 in-game
  }

  setCash(n) { this.el('cash').textContent = formatCash(n); }
  setHealth(h, max) {
    const pct = Math.max(0, (h / max) * 100);
    const bar = this.el('health-fill');
    bar.style.width = pct + '%';
    bar.style.background = pct > 50 ? '#2fd62f' : pct > 25 ? '#f2b705' : '#d21f3c';
    this.el('health-num').textContent = Math.ceil(h);
  }
  setWanted(level) {
    const stars = this.el('stars');
    stars.innerHTML = '';
    for (let i = 0; i < 5; i++) {
      const s = document.createElement('span');
      s.textContent = '★';
      s.className = i < level ? 'star on' : 'star';
      stars.appendChild(s);
    }
    this.el('wanted-box').style.display = level > 0 ? 'block' : 'none';
  }
  setObjective(text) { this.el('objective').textContent = text; }
  setTimer(seconds) {
    const t = this.el('timer');
    if (seconds === null || seconds === undefined) { t.style.display = 'none'; return; }
    t.style.display = 'block';
    t.textContent = '⏱ ' + formatTime(seconds);
    t.style.color = seconds < 15 ? '#ff5a4f' : '#fff';
  }
  setSpeed(kmh, carName) {
    const s = this.el('speed');
    if (carName) {
      s.style.display = 'block';
      this.el('speed-num').textContent = Math.round(kmh);
      this.el('car-name').textContent = carName;
    } else {
      s.style.display = 'none';
    }
  }
  setAmmo(ammo, reloading) {
    const a = this.el('ammo');
    a.style.display = 'block';
    a.textContent = reloading ? 'RELOADING…' : `🔫 ${ammo} / 12`;
  }
  hideAmmo() { this.el('ammo').style.display = 'none'; }

  showMessage(text, ms = 5200) {
    const feed = this.el('feed');
    const div = document.createElement('div');
    div.className = 'msg';
    div.textContent = text;
    feed.prepend(div);
    while (feed.children.length > 3) feed.removeChild(feed.lastChild);
    setTimeout(() => { if (div.parentNode) div.parentNode.removeChild(div); }, ms);
  }

  banner(title, sub = '') {
    const b = this.el('banner');
    this.el('banner-title').textContent = title;
    this.el('banner-sub').textContent = sub;
    b.classList.remove('show');
    void b.offsetWidth; // restart the animation
    b.classList.add('show');
  }

  setHint(text) {
    const h = this.el('hint');
    if (text) { h.textContent = text; h.style.display = 'block'; }
    else h.style.display = 'none';
  }

  flashDamage() {
    const f = this.el('damage');
    f.classList.remove('show');
    void f.offsetWidth;
    f.classList.add('show');
  }

  setCrosshair(on) { this.el('crosshair').style.display = on ? 'block' : 'none'; }

  showEnd(title, sub, stats, buttonLabel, onButton) {
    const e = this.el('end-screen');
    this.el('end-title').textContent = title;
    this.el('end-sub').textContent = sub;
    this.el('end-stats').textContent = stats;
    const btn = this.el('end-btn');
    btn.textContent = buttonLabel;
    btn.onclick = () => { e.style.display = 'none'; onButton && onButton(); };
    e.style.display = 'flex';
  }
  hideEnd() { this.el('end-screen').style.display = 'none'; }

  tickClock(dt) {
    this.clock = (this.clock + dt * 2.2) % (24 * 60); // game time runs fast
    const h = Math.floor(this.clock / 60);
    const m = Math.floor(this.clock % 60);
    this.el('clock').textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  drawMinimap(dt, city, player, cars, policeCars, marker, heading) {
    this.mmTimer -= dt;
    if (this.mmTimer > 0) return;
    this.mmTimer = 0.12;
    const g = this.mm, S = 180, scale = S / 440;
    const X = (x) => (x + 220) * scale;
    const Z = (z) => (z + 220) * scale;
    g.clearRect(0, 0, S, S);
    g.fillStyle = '#10131a';
    g.fillRect(0, 0, S, S);
    // Water strip (east).
    g.fillStyle = '#0d3a5c';
    g.fillRect(X(210), 0, S - X(210), S);
    // Roads.
    g.strokeStyle = '#4a4e57';
    g.lineWidth = 3;
    for (const r of ROAD_LINES) {
      g.beginPath(); g.moveTo(X(r), 0); g.lineTo(X(r), S); g.stroke();
      g.beginPath(); g.moveTo(0, Z(r)); g.lineTo(S, Z(r)); g.stroke();
    }
    // Mission marker.
    if (marker) {
      const pulse = 3 + Math.sin(performance.now() / 200) * 1.5;
      g.fillStyle = '#2fd6a3';
      g.save();
      g.translate(X(marker.x), Z(marker.z));
      g.rotate(Math.PI / 4);
      g.fillRect(-pulse, -pulse, pulse * 2, pulse * 2);
      g.restore();
    }
    // Cars (yellow), police (flashing blue/red).
    g.fillStyle = '#f2b705';
    for (const c of cars) {
      if (c.dead) continue;
      g.fillRect(X(c.x) - 1.5, Z(c.z) - 1.5, 3, 3);
    }
    const flashBlue = Math.floor(performance.now() / 300) % 2 === 0;
    g.fillStyle = flashBlue ? '#3a6eff' : '#ff2a2a';
    for (const c of policeCars) {
      g.beginPath(); g.arc(X(c.x), Z(c.z), 3.2, 0, Math.PI * 2); g.fill();
    }
    // Player arrow.
    g.save();
    g.translate(X(player.x), Z(player.z));
    g.rotate(Math.atan2(Math.sin(heading), Math.cos(heading)) * -1 + Math.PI);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(0, -6); g.lineTo(4.5, 5); g.lineTo(0, 2.5); g.lineTo(-4.5, 5);
    g.closePath(); g.fill();
    g.restore();
    // Border.
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 1;
    g.strokeRect(0.5, 0.5, S - 1, S - 1);
  }
}
