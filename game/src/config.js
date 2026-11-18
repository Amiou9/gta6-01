// NEON HARBOR — tuning constants, car types, mission data.
// All names, places and story are original fiction.
export const CONFIG = {
  city: {
    blocks: 7,          // blocks per side
    block: 46,          // block size (m)
    road: 14,           // road width (m)
    sidewalk: 3,        // sidewalk width inside a block edge
  },
  player: {
    walkSpeed: 6.5,
    sprintSpeed: 10.5,
    accel: 42,
    jumpSpeed: 8.5,
    health: 100,
    punchDamage: 25,
    punchRange: 2.2,
    pistolDamage: 34,
    pistolRange: 60,
    pistolAmmo: 12,
    pistolReload: 1.1,
  },
  cars: {
    // name, top speed (m/s), accel, grip (steer), color palette, price-ish value
    sedan:  { label: 'Harbor Sedan',  top: 34, accel: 16, grip: 2.6, colors: [0x3a6ea5, 0x8a8f98, 0x5b4a8a] },
    taxi:   { label: 'Bay Taxi',      top: 32, accel: 15, grip: 2.7, colors: [0xf2b705] },
    sport:  { label: 'Vortex GT',     top: 46, accel: 24, grip: 3.4, colors: [0xd21f3c, 0x1fd6c1, 0xff7a1a] },
    truck:  { label: 'Dock Hauler',   top: 26, accel: 11, grip: 2.0, colors: [0x4a7c59, 0x7a6a4a] },
    coupe:  { label: 'Neon Coupe',    top: 40, accel: 20, grip: 3.0, colors: [0x9b2fb5, 0x2f6fb5, 0xe8e8e8] },
  },
  police: {
    top: 42,
    accel: 22,
    maxCars: 5,         // at 5 stars
    bustTime: 3.0,      // seconds pinned close + slow to get busted
    bustRange: 4.5,
    loseSightTime: 9,   // seconds unseen before a star decays
    decayInterval: 7,   // seconds per star decay while hidden
  },
  wanted: {
    stealCar: 1,
    hitPed: 1,
    shoot: 1,
    hitCop: 2,
    killCop: 2,
  },
  economy: {
    startCash: 250,
    cashPickup: 50,
    missionReward: [500, 800, 1000, 2500],
    deathPenalty: 0.1,  // fraction of cash lost on wasted/busted
  },
  shots: { width: 1280, height: 720 },
};

// Mission script — original story: Rex "Rook" Calloway, ex-getaway driver,
// owes fixer Vera Kline one last chain of jobs in Neon Harbor.
export const MISSIONS = [
  {
    id: 'm1', name: 'First Wheels', giver: 'Vera Kline',
    brief: 'Rook. You owe me, and I collect. First: get wheels. Any car on the street will do — take it, bring it to my garage on Meridian Row.',
    objective: 'Steal any car and drive it to the garage marker',
    reward: 500,
    steps: [
      { type: 'steal', text: 'Steal a car (walk up to one and press E)' },
      { type: 'goto', text: 'Drive to Vera\'s garage', point: 'garage' },
    ],
  },
  {
    id: 'm2', name: 'The Package', giver: 'Vera Kline',
    brief: 'A package is waiting at the docks, Pier 9. Pick it up and get it to the Neon Plaza hotel before the buyer walks. Ninety seconds. Don\'t scratch the paint.',
    objective: 'Pick up the package at Pier 9, deliver to Neon Plaza in 90s',
    reward: 800,
    time: 90,
    steps: [
      { type: 'goto', text: 'Pick up the package at Pier 9', point: 'docks' },
      { type: 'goto', text: 'Deliver to the Neon Plaza hotel', point: 'plaza', timed: true },
    ],
  },
  {
    id: 'm3', name: 'Heat Wave', giver: 'Vera Kline',
    brief: 'The harbor patrol is sniffing around my garage. They need a distraction. Get yourself two stars of heat, then lose them. Make it look good.',
    objective: 'Reach 2 stars of wanted, then lose the heat completely',
    reward: 1000,
    steps: [
      { type: 'wanted', text: 'Get the heat to 2 stars (steal, speed, cause a scene)', level: 2 },
      { type: 'evade', text: 'Lose the cops — break line of sight until the stars clear' },
    ],
  },
  {
    id: 'm4', name: 'The Last Getaway', giver: 'Vera Kline',
    brief: 'Last job, Rook. I\'m riding with you. Get me from the garage to the safehouse on Coral Point in two and a half minutes — and the whole harbor patrol will be on us. Drive like your life depends on it. It does.',
    objective: 'Drive Vera to the Coral Point safehouse in 150s with the cops on you',
    reward: 2500,
    time: 150,
    steps: [
      { type: 'goto', text: 'Pick Vera up at the garage', point: 'garage' },
      { type: 'goto', text: 'Drive Vera to the Coral Point safehouse', point: 'safehouse', timed: true, heat: 3 },
    ],
  },
];

// Named places on the grid (block coordinates, 0..blocks-1).
export const PLACES = {
  garage:    { bx: 1, bz: 1, name: "Vera's Garage", color: 0x2fd6a3 },
  docks:     { bx: 5, bz: 3, name: 'Pier 9 Docks', color: 0x2fb5d6 },
  plaza:     { bx: 3, bz: 3, name: 'Neon Plaza Hotel', color: 0xd62f8f },
  safehouse: { bx: 5, bz: 5, name: 'Coral Point Safehouse', color: 0xf2b705 },
  hospital:  { bx: 1, bz: 5, name: 'Harbor General', color: 0xe8e8e8 },
};

export const STREET_NAMES = [
  'Meridian Row', 'Coral Ave', 'Harbor Blvd', 'Neon Strip', 'Pier Road',
  'Sunset Way', 'Marina Lane', 'Violet St',
];
