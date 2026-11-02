// Rushtime's junctions. Each is a long run-up through traffic into a busy crossing, laid out as roads,
// traffic lanes on them, and the vehicles that make a good crash (a tanker, a bus) timed to arrive at the
// junction when a fast run would.
//
// Roads: { x0, z0, x1, z1, right, left, median, open } — `right` lanes carry traffic from (x0, z0) to
// (x1, z1), `left` lanes the other way; `open` lists sides (1: right of travel, -1: left) with no buildings.
// Lanes: { road, side, i, speed: [lo, hi], gap: [lo, hi] seconds (spawning) or metres (`fill`), fill: [from, to]
//   along the road in metres, spawn, stop (metres along the road: the red light), queue (cars waiting there) }
// Specials: { lane, kind, eta } — a vehicle placed so it reaches the junction `eta` seconds after the start.

export const LEVELS = {
  cross: {
    name: 'Market Cross', blurb: 'Four lanes in, four lanes across. The lights are red for you; they don\'t have to be.',
    seed: 11,
    bounds: [-440, 440, -210, 760],
    start: { x: 5.4, z: 690, speed: 28 },
    junction: [0, 0],
    roads: [
      { name: 'main', x0: 0, z0: 730, x1: 0, z1: -175, right: 2, left: 2 },
      { name: 'cross', x0: -430, z0: 0, x1: 430, z1: 0, right: 2, left: 2 },
    ],
    // The road north ends at a town hall
    blocks: [{ x: 0, z: -192, w: 40, d: 30, h: 26, fixed: true }],
    lanes: [
      // Your way: a few cars to get past, and a queue at the red light
      { road: 'main', side: 1, i: 0, speed: [19, 23], fill: [80, 690], gap: [45, 90], stop: 720.3, queue: 4 },
      { road: 'main', side: 1, i: 1, speed: [21, 25], fill: [100, 680], gap: [60, 120], stop: 720.3, queue: 3 },
      // Oncoming, and a queue waiting the other side of the junction
      { road: 'main', side: -1, i: 0, speed: [20, 24], fill: [190, 880], gap: [55, 110], stop: 165.3, queue: 3 },
      { road: 'main', side: -1, i: 1, speed: [18, 22], fill: [190, 880], gap: [70, 140], stop: 165.3, queue: 2 },
      // Across: green for them, and busy
      { road: 'cross', side: 1, i: 0, speed: [15, 18], gap: [1.6, 3.0], spawn: true },
      { road: 'cross', side: 1, i: 1, speed: [16, 20], gap: [1.8, 3.4], spawn: true },
      { road: 'cross', side: -1, i: 0, speed: [15, 18], gap: [1.6, 3.0], spawn: true },
      { road: 'cross', side: -1, i: 1, speed: [16, 20], gap: [1.8, 3.4], spawn: true },
    ],
    specials: [
      { lane: 6, kind: 'tanker', eta: 11.5 },
      { lane: 5, kind: 'bus', eta: 13 },
    ],
    medals: [25000, 80000, 180000],
  },

  docks: {
    name: 'Dockside Drop', blurb: 'Downhill all the way to the harbour road, with a crest that throws you. Don\'t miss the quay.',
    seed: 23,
    bounds: [-470, 470, -170, 850],
    start: { x: 5.4, z: 800, speed: 28 },
    junction: [0, 0],
    // Down from the hills: a long gentle slope, a short rise to a crest that throws you, then steeper to the flat
    height: (x, z) => {
      if (z < 110) return 0;
      const s = z - 110;
      if (s < 40) return 0.0818 * s * s / 80;
      if (z < 330) return 1.636 + (s - 40) * 0.0818;
      if (z < 345) return 16.36 - (z - 330) * 0.05;
      return 15.61 + (z - 345) * 0.045;
    },
    roads: [
      { name: 'main', x0: 0, z0: 860, x1: 0, z1: 0, right: 2, left: 1 },
      { name: 'quay', x0: -460, z0: 0, x1: 460, z1: 0, right: 3, left: 3, median: 2, open: [-1] },
    ],
    // Warehouses across the water
    blocks: [-300, -200, -100, 0, 100, 200, 300].map((x, i) => ({ x: x + (i % 2) * 20, z: -150, w: 70, d: 30, h: 14 + (i % 3) * 6, fixed: true })),
    water: { rect: [-470, 470, -170, -16.8], edge: -16.8, y: -1.6, floor: -5, below: (x, z) => z < -16.8 },
    ramps: [{ x: 5.4, z: 70, len: 8, h: 0.9, w: 3.4 }],
    lanes: [
      { road: 'main', side: 1, i: 0, speed: [20, 24], fill: [100, 830], gap: [50, 100], stop: 845.7, queue: 3 },
      { road: 'main', side: 1, i: 1, speed: [22, 26], fill: [120, 820], gap: [70, 130], stop: 845.7, queue: 2 },
      { road: 'main', side: -1, i: 0, speed: [19, 23], fill: [20, 820], gap: [55, 100] },
      { road: 'quay', side: 1, i: 0, speed: [16, 19], gap: [1.6, 3.0], spawn: true },
      { road: 'quay', side: 1, i: 1, speed: [17, 21], gap: [1.8, 3.2], spawn: true },
      { road: 'quay', side: 1, i: 2, speed: [18, 22], gap: [2.0, 3.6], spawn: true },
      { road: 'quay', side: -1, i: 0, speed: [16, 19], gap: [1.6, 3.0], spawn: true },
      { road: 'quay', side: -1, i: 1, speed: [17, 21], gap: [1.8, 3.2], spawn: true },
      { road: 'quay', side: -1, i: 2, speed: [18, 22], gap: [2.0, 3.6], spawn: true },
    ],
    specials: [
      { lane: 6, kind: 'tanker', eta: 12.5 },
      { lane: 4, kind: 'bus', eta: 14 },
    ],
    medals: [25000, 80000, 180000],
  },
};
