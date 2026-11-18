# NEON HARBOR

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Amiou9/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Amiou9/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**NEON HARBOR** — a complete open-world crime game in the spirit of GTA 6, playable in a desktop browser from static files. One night. One city. One last job.

Rex “Rook” Calloway, the best getaway driver on the coast, owes fixer Vera Kline a debt. She is calling it in — four jobs, one night, and the whole harbor patrol watching. Steal cars, run the jobs, lose the heat, get paid.

## Play it

```sh
node serve.ts
# then open http://localhost:8080
```

No build step, no network requests: `game/index.html` and its ES modules (three.js 0.187.0 vendored under `game/vendor/`) are all the game needs.

## What is in the city

- **A 3D open world**: Neon Harbor — a coastal neon city at dusk, 7×7 blocks of streets, lit windows, palms, a pier and the water beyond. Explore it **on foot and by car**.
- **Traffic and pedestrians**: cars drive the road grid, pedestrians walk the sidewalks and flee from danger.
- **Cars to steal**: five car types (sedan, taxi, sport coupe, truck, GT) with different handling. Walk up to one and press **E**.
- **A wanted level and police**: steal, hit a pedestrian or shoot and the stars climb; harbor patrol cars chase, ram and park on you to make the bust. Break line of sight and the heat decays — the patrol searches where it last saw you.
- **Missions and a story**: four jobs for Vera Kline — steal wheels, a timed dock delivery, a heat-wave evasion, and a final getaway with the whole patrol on you — with briefings, objectives, timers and cash rewards.
- **Combat**: punch and a pistol, health that regenerates, WASTED and BUSTED screens with a hospital respawn.
- **HUD with a live minimap**: cash, wanted stars, health, mission objective and timer, speed, ammo, street name and in-game clock.
- **Start and save**: title screen with story and controls, automatic saves (cash, jobs done, best heat) with Continue.
- **Polish**: third-person and chase cameras, dusk lighting and shadows, neon signs, skid smoke, impact sparks, muzzle flash, camera shake, and a fully synthesized WebAudio soundscape — engine hum, sirens, gunshots and a synthwave loop. No audio files.

## Controls

| Key | Action |
| --- | --- |
| WASD | Move / drive |
| Mouse | Look · Click to shoot |
| E | Steal / exit car |
| F | Punch |
| R | Reload |
| Space | Jump / handbrake |
| Shift | Sprint |
| H | Horn |
| P | Pause |
| M | Mute |

## Enter it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` and `screenshots/` to `/output` and writes `/output/dossier.json` with the vendored make.fun library.

---

<sub>Entered on [make.fun](https://make.fun/?ref=f2azfct1&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
