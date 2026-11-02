// Rushtime's junctions. Each is a short run-up through traffic into a busy crossing, laid out as roads,
// traffic lanes on them, and the vehicles that make a good crash (a tanker, a bus) timed to arrive at the
// junction when a fast run would.
//
// Roads: { x0, z0, x1, z1, right, left, median, open } — `right` lanes carry traffic from (x0, z0) to
// (x1, z1), `left` lanes the other way; `open` lists sides (1: right of travel, -1: left) with no buildings.
// Lanes: { road, side, i, speed: [lo, hi], gap: [lo, hi] seconds (spawning) or metres (`fill`), fill: [from, to]
//   along the road in metres, spawn, stop (metres along the road: the red light), queue (how many cars wait
//   there, or a list of their kinds, front first, null for any) }
//   A lane can bend onto another road (`then`: { road, side, i }), and `stopBefore` puts its red light that many
//   metres before the junction.
// Specials: { lane, kind, eta } — a vehicle placed so it reaches the junction `eta` seconds after the start.
// Parked: { kind, x, z, yaw } — vehicles standing still off the road (yaw 0 faces -z).
// Station: a petrol station's canopy { x, z, w, d, h }. Get your own car in under it fast and it goes up.

// A Y: the main road runs north, and 10 m before the junction a branch forks off to the north-west at 30°
const SIN = Math.sin(Math.PI / 6), COS = Math.cos(Math.PI / 6);
const FORK = {
  bounds: [-300, 300, -420, 470],
  junction: [-3, -6],
  roads: [
    { name: 'main', x0: 0, z0: 420, x1: 0, z1: -260, right: 2, left: 2 },
    { name: 'branch', x0: 0, z0: 10, x1: -420 * SIN, z1: 10 - 420 * COS, right: 2, left: 2 },
  ],
  // Ends of the road, and a crash barrier on the nose between the two
  blocks: [
    { x: 0, z: -277, w: 40, d: 30, h: 26, fixed: true },
    { x: -436 * SIN, z: 10 - 436 * COS, w: 40, d: 30, h: 22, ang: -Math.PI / 6, fixed: true },
  ],
  props: [['barrier', -8.6, -19.5, Math.PI / 3], ['barrier', -9.4, -21.4, Math.PI / 3], ['cone', -7.9, -17.6, 0], ['cone', -10, -23.5, 0]],
};

export const LEVELS = {
  cross: {
    name: 'Market Cross', blurb: 'Four lanes in, four lanes across. The lights are red for you; they don\'t have to be.',
    seed: 11,
    bounds: [-440, 440, -210, 470],
    start: { x: 5.4, z: 380, speed: 28 },
    junction: [0, 0],
    roads: [
      { name: 'main', x0: 0, z0: 420, x1: 0, z1: -175, right: 2, left: 2 },
      { name: 'cross', x0: -430, z0: 0, x1: 430, z1: 0, right: 2, left: 2 },
    ],
    // The road north ends at a town hall
    blocks: [{ x: 0, z: -192, w: 40, d: 30, h: 26, fixed: true }],
    lanes: [
      // Your way: a few cars to get past, and a queue at the red light
      { road: 'main', side: 1, i: 0, speed: [19, 23], fill: [70, 330], gap: [45, 90], stop: 410.3, queue: 4 },
      { road: 'main', side: 1, i: 1, speed: [21, 25], fill: [90, 320], gap: [60, 120], stop: 410.3, queue: 3 },
      // Oncoming, and a queue waiting the other side of the junction
      { road: 'main', side: -1, i: 0, speed: [20, 24], fill: [190, 580], gap: [55, 110], stop: 165.3, queue: 3 },
      { road: 'main', side: -1, i: 1, speed: [18, 22], fill: [190, 580], gap: [70, 140], stop: 165.3, queue: 2 },
      // Across: green for them, and busy
      { road: 'cross', side: 1, i: 0, speed: [15, 18], gap: [1.6, 3.0], spawn: true },
      { road: 'cross', side: 1, i: 1, speed: [16, 20], gap: [1.8, 3.4], spawn: true },
      { road: 'cross', side: -1, i: 0, speed: [15, 18], gap: [1.6, 3.0], spawn: true },
      { road: 'cross', side: -1, i: 1, speed: [16, 20], gap: [1.8, 3.4], spawn: true },
    ],
    specials: [
      { lane: 6, kind: 'tanker', eta: 6.8 },
      { lane: 5, kind: 'bus', eta: 8.3 },
    ],
    medals: [40000, 120000, 300000],
  },

  docks: {
    name: 'Dockside Drop', blurb: 'Downhill all the way to the harbour road, with a crest that throws you. Don\'t miss the quay.',
    seed: 23,
    bounds: [-470, 470, -170, 490],
    start: { x: 5.4, z: 410, speed: 28 },
    junction: [0, 0],
    // Down from the hills: a gentle slope, a short rise to a crest that throws you, then steeper to the flat
    height: (x, z) => {
      if (z < 110) return 0;
      const s = z - 110;
      if (s < 40) return 0.0818 * s * s / 80;
      if (z < 330) return 1.636 + (s - 40) * 0.0818;
      if (z < 345) return 16.36 - (z - 330) * 0.05;
      return 15.61 + (z - 345) * 0.045;
    },
    roads: [
      { name: 'main', x0: 0, z0: 460, x1: 0, z1: 0, right: 2, left: 1 },
      { name: 'quay', x0: -460, z0: 0, x1: 460, z1: 0, right: 3, left: 3, median: 2, open: [-1] },
    ],
    // Warehouses across the water
    blocks: [-300, -200, -100, 0, 100, 200, 300].map((x, i) => ({ x: x + (i % 2) * 20, z: -150, w: 70, d: 30, h: 14 + (i % 3) * 6, fixed: true })),
    water: { rect: [-470, 470, -170, -16.8], edge: -16.8, y: -1.6, floor: -5, below: (x, z) => z < -16.8 },
    ramps: [{ x: 5.4, z: 70, len: 8, h: 0.9, w: 3.4 }],
    lanes: [
      { road: 'main', side: 1, i: 0, speed: [20, 24], fill: [70, 400], gap: [50, 100], stop: 445.7, queue: 3 },
      { road: 'main', side: 1, i: 1, speed: [22, 26], fill: [90, 390], gap: [70, 130], stop: 445.7, queue: 2 },
      { road: 'main', side: -1, i: 0, speed: [19, 23], fill: [20, 440], gap: [55, 100] },
      { road: 'quay', side: 1, i: 0, speed: [16, 19], gap: [1.6, 3.0], spawn: true },
      { road: 'quay', side: 1, i: 1, speed: [17, 21], gap: [1.8, 3.2], spawn: true },
      { road: 'quay', side: 1, i: 2, speed: [18, 22], gap: [2.0, 3.6], spawn: true },
      { road: 'quay', side: -1, i: 0, speed: [16, 19], gap: [1.6, 3.0], spawn: true },
      { road: 'quay', side: -1, i: 1, speed: [17, 21], gap: [1.8, 3.2], spawn: true },
      { road: 'quay', side: -1, i: 2, speed: [18, 22], gap: [2.0, 3.6], spawn: true },
    ],
    specials: [
      { lane: 6, kind: 'tanker', eta: 6.6 },
      { lane: 4, kind: 'bus', eta: 8.1 },
    ],
    medals: [40000, 120000, 300000],
  },
  jump: {
    name: 'Gridlock Leap', blurb: 'Your way\'s jammed solid to the lights, and the roadworks left a ramp. Land on the jam, shove it into the junction.',
    seed: 37,
    bounds: [-440, 440, -210, 470],
    start: { x: 5.4, z: 390, speed: 28 },
    junction: [0, 0],
    roads: [
      { name: 'main', x0: 0, z0: 420, x1: 0, z1: -175, right: 2, left: 2 },
      { name: 'cross', x0: -430, z0: 0, x1: 430, z1: 0, right: 2, left: 2 },
    ],
    blocks: [{ x: 0, z: -192, w: 40, d: 30, h: 26, fixed: true }],
    // Across both your lanes: a fast run off the lip comes down on the jam, a slower one runs into the back of it
    ramps: [{ x: 3.6, z: 150, len: 10, h: 1.0, w: 7.2 }],
    props: [
      ...[160, 166, 172, 178, 184].flatMap(z => [['cone', 0.4, z, 0], ['cone', 7.6, z, 0]]),
      ['barrier', 0.5, 152, Math.PI / 2], ['barrier', 7.7, 152, Math.PI / 2],
    ],
    lanes: [
      // Your way: nothing but the ramp, and a long queue back from the red light
      { road: 'main', side: 1, i: 0, speed: [19, 23], gap: [50, 90], stop: 410.3, queue: [null, 'van', null, null, 'bus', null, null] },
      { road: 'main', side: 1, i: 1, speed: [21, 25], gap: [60, 120], stop: 410.3, queue: [null, 'tanker', null, null, 'lorry', null, null] },
      // Oncoming: a queue the other side, and cars to dodge
      { road: 'main', side: -1, i: 0, speed: [20, 24], fill: [190, 580], gap: [60, 120], stop: 165.3, queue: 3 },
      { road: 'main', side: -1, i: 1, speed: [18, 22], fill: [190, 580], gap: [80, 150], stop: 165.3, queue: 2 },
      // Across: green for them, and busy
      { road: 'cross', side: 1, i: 0, speed: [15, 18], gap: [1.6, 3.0], spawn: true },
      { road: 'cross', side: 1, i: 1, speed: [16, 20], gap: [1.8, 3.4], spawn: true },
      { road: 'cross', side: -1, i: 0, speed: [15, 18], gap: [1.6, 3.0], spawn: true },
      { road: 'cross', side: -1, i: 1, speed: [16, 20], gap: [1.8, 3.4], spawn: true },
    ],
    specials: [
      { lane: 6, kind: 'tanker', eta: 7 },
      { lane: 5, kind: 'bus', eta: 8.5 },
    ],
    medals: [50000, 150000, 350000],
  },
  fork: {
    ...FORK,
    name: 'The Fork', blurb: 'Your road splits ahead. Pick a side, or don\'t: take out the nose and everything streaming through it.',
    seed: 41,
    start: { x: 5.4, z: 380, speed: 28 },
    lanes: [
      // Your way: traffic to thread, splitting left and straight on
      { road: 'main', side: 1, i: 0, then: { road: 'branch', side: 1, i: 0 }, speed: [18, 22], fill: [0, 380], gap: [40, 75] },
      { road: 'main', side: 1, i: 1, speed: [19, 23], fill: [0, 400], gap: [40, 75] },
      // Down the straight branch: a busy stream through the fork, toward you
      { road: 'main', side: -1, i: 0, speed: [16, 20], gap: [1.6, 2.8], spawn: true },
      { road: 'main', side: -1, i: 1, speed: [17, 21], gap: [1.9, 3.4], spawn: true },
      // Down the left branch: held at the merge, and more joining the back of the queue
      { road: 'branch', side: -1, i: 0, then: { road: 'main', side: -1, i: 0 }, speed: [16, 19], gap: [2.6, 4.2], spawn: true, stopBefore: 24, queue: [null, null, 'van', null, null] },
      { road: 'branch', side: -1, i: 1, then: { road: 'main', side: -1, i: 1 }, speed: [16, 20], gap: [2.6, 4.2], spawn: true, stopBefore: 22, queue: [null, 'bus', null, null] },
    ],
    specials: [
      { lane: 2, kind: 'tanker', eta: 6.6 },
      { lane: 3, kind: 'bus', eta: 7.8 },
    ],
    medals: [40000, 120000, 300000],
  },

  merge: {
    ...FORK,
    name: 'The Merge', blurb: 'Down the slip road into the main drag. They\'re waiting to let you in. Don\'t wait.',
    seed: 43,
    start: { x: -360 * SIN - 5.4 * COS, z: 10 - 360 * COS + 5.4 * SIN, yaw: -5 * Math.PI / 6, speed: 28 },
    lanes: [
      // Your way: down the branch and into the main road
      { road: 'branch', side: -1, i: 0, then: { road: 'main', side: -1, i: 0 }, speed: [18, 22], fill: [0, 340], gap: [40, 75] },
      { road: 'branch', side: -1, i: 1, then: { road: 'main', side: -1, i: 1 }, speed: [19, 23], fill: [0, 330], gap: [45, 80] },
      // The straight branch: held at the merge, and more joining the queue
      { road: 'main', side: -1, i: 0, speed: [16, 20], gap: [2.6, 4.2], spawn: true, stopBefore: 22, queue: [null, 'lorry', null, null, null] },
      { road: 'main', side: -1, i: 1, speed: [16, 20], gap: [2.6, 4.2], spawn: true, stopBefore: 22, queue: [null, null, 'tanker', null] },
      // Up the main road: a busy stream splitting both ways, across your nose
      { road: 'main', side: 1, i: 0, then: { road: 'branch', side: 1, i: 0 }, speed: [16, 20], gap: [1.7, 3.0], spawn: true },
      { road: 'main', side: 1, i: 1, speed: [17, 21], gap: [1.8, 3.2], spawn: true },
    ],
    specials: [
      { lane: 5, kind: 'tanker', eta: 6.8 },
      { lane: 4, kind: 'bus', eta: 7.6 },
    ],
    medals: [40000, 120000, 300000],
  },

  gas: {
    name: 'Last Chance Gas', blurb: 'A T-junction, and the petrol station straight across it. Thread the gap and light it up.',
    seed: 47,
    bounds: [-440, 440, -140, 470],
    start: { x: 1.8, z: 380, speed: 28 },
    junction: [0, 0],
    roads: [
      { name: 'main', x0: 0, z0: 420, x1: 0, z1: 0, right: 2, left: 2 },
      { name: 'cross', x0: -430, z0: 0, x1: 430, z1: 0, right: 2, left: 2 },
    ],
    // The forecourt, under its canopy, with the shop at the back
    lots: [{ rect: [-21, 21, -52, -7.3], colour: '#c4bfb4' }],
    station: { x: 0, z: -30, w: 30, d: 24, h: 5.4 },
    blocks: [{ x: 0, z: -59, w: 30, d: 13, h: 6, fixed: true },
      // and the backs of the next street
      ...[-66, -38, 38, 66].map((x, i) => ({ x, z: -40, w: 26, d: 40, h: 11 + (i % 2) * 3.3, type: 'walkup', brick: i % 2, tank: i < 2, fixed: true })),
      ...[-75, -45, -15, 15, 45, 75].map((x, i) => ({ x, z: -92, w: 28, d: 26, h: [18, 26, 14.5, 22, 30, 16][i], type: i % 3 === 2 ? 'walkup' : 'tower', brick: i % 2, fixed: true }))],
    props: [
      ...[-6, 6].flatMap(x => [-24, -34].map(z => ['pump', x, z, 0])),
      ['pump', -1.3, -44, 0], ['pump', 1.3, -44, 0],
      ['sign', 17, -10, 0],
    ],
    // Filling up, and waiting their turn: the aisle down the middle is a car and a half wide
    parked: [
      ...[-2.8, 2.8, -9.2, 9.2].flatMap(x => [-15.5, -24, -34].map(z => ({ kind: Math.abs(x) < 5 && z === -34 ? 'van' : null, x, z }))),
      { kind: 'tanker', x: 16.5, z: -38 }, { kind: 'pickup', x: -16, z: -44 }, { kind: null, x: -16, z: -36 },
    ],
    lanes: [
      // Your way: a queue in each lane at the lights, longer on the right
      { road: 'main', side: 1, i: 0, speed: [19, 23], fill: [60, 330], gap: [60, 110], stop: 410.3, queue: 3 },
      { road: 'main', side: 1, i: 1, speed: [21, 25], fill: [80, 320], gap: [60, 120], stop: 410.3, queue: [null, null, 'bus', null, null, null] },
      // Leaving the junction toward you
      { road: 'main', side: -1, i: 0, speed: [18, 22], fill: [12, 400], gap: [55, 100] },
      { road: 'main', side: -1, i: 1, speed: [17, 21], fill: [12, 400], gap: [70, 130] },
      // Across: busy both ways
      { road: 'cross', side: 1, i: 0, speed: [15, 18], gap: [1.6, 3.0], spawn: true },
      { road: 'cross', side: 1, i: 1, speed: [16, 20], gap: [1.8, 3.4], spawn: true },
      { road: 'cross', side: -1, i: 0, speed: [15, 18], gap: [1.6, 3.0], spawn: true },
      { road: 'cross', side: -1, i: 1, speed: [16, 20], gap: [1.8, 3.4], spawn: true },
    ],
    specials: [
      { lane: 6, kind: 'tanker', eta: 7 },
      { lane: 5, kind: 'bus', eta: 8.2 },
    ],
    medals: [50000, 150000, 350000],
  },
};
