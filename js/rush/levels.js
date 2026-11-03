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
// Specials: { lane, kind, eta, exact } — a vehicle placed so it reaches the junction `eta` seconds after the start
//   (a long eta is cut short to where its lane's traffic starts, unless `exact`).
// Parked: { kind, x, z, yaw } — vehicles standing still off the road (yaw 0 faces -z).
// Bridges: `under` on a road runs it under the others, `deck` ({ rect, y, piers }) carries them over it, and
//   `park` is open ground (no buildings) round about.
// Station: a petrol station's canopy { x, z, w, d, h }; hit it hard enough and it goes up. Its pumps and price
//   sign are props, and the block marked `shop` gets its shopfront.

// A cross street busy both ways (two lanes each way, green for them), and a dip for a road to run under the
// others in (see Over the Edge): 1 along its line, falling to 0 up grass banks `bank` m either side of it
// (the outer lane's gaps a little longer: rounded, so they're exactly the figures written out, and the traffic's the same)
const busy = (road, gap = [1.6, 3.0]) => [1, -1].flatMap(side => [0, 1].map(i =>
  ({ road, side, i, speed: [15 + i, 18 + i * 2], gap: [gap[0] + i * 0.2, gap[1] + i * 0.4].map(g => Math.round(g * 100) / 100), spawn: true })));
const dip = (a, bank = 21) => {
  if (a <= 8.6) return 1;
  const k = Math.min(1, (a - 8.6) / bank);
  return 1 - k * k * (3 - 2 * k);
};
const fade = x => { const t = Math.min(1, Math.max(0, (Math.abs(x) - 50) / 170)); return 1 - t * t * (3 - 2 * t); };
const rails = (x, z0, z1) => Array.from({ length: Math.floor((z1 - z0) / 3) + 1 }, (_, i) => ['rail', x, z0 + i * 3, Math.PI / 2]);
const D45 = Math.SQRT1_2;

// (a `draft` is still rough: only there with rush.html?drafts)
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
    // Car parks along the cross street, either side of the junction: a row of cars nosed in to the kerb each side of
    // the road, side on to a wreck coming off the junction to steer into
    lots: [-1, 1].flatMap(sx => [-1, 1].map(sz => ({ rect: [sx > 0 ? 13 : -58, sx > 0 ? 58 : -13, sz > 0 ? 12.2 : -21, sz > 0 ? 21 : -12.2], colour: '#a9a59c' }))),
    parked: [-1, 1].flatMap(sx => [-1, 1].flatMap(sz => Array.from({ length: 12 }, (_, i) => ({ kind: null, x: sx * (18 + i * 3.2), z: sz * 15.6, yaw: sz > 0 ? 0 : Math.PI })))),
    lanes: [
      // Your way: a few cars to get past, and a queue at the red light
      { road: 'main', side: 1, i: 0, speed: [19, 23], fill: [70, 330], gap: [45, 90], stop: 410.3, queue: 4 },
      { road: 'main', side: 1, i: 1, speed: [21, 25], fill: [90, 320], gap: [60, 120], stop: 410.3, queue: 3 },
      // Oncoming, and a queue waiting the other side of the junction
      { road: 'main', side: -1, i: 0, speed: [20, 24], fill: [190, 580], gap: [55, 110], stop: 165.3, queue: 3 },
      { road: 'main', side: -1, i: 1, speed: [18, 22], fill: [190, 580], gap: [70, 140], stop: 165.3, queue: 2 },
      // Across: green for them, and busy
      ...busy('cross'),
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
    // and a jetty out into it off to your left, with three tankers parked side by side at the end: something to aim for
    water: { rect: [-470, 470, -170, -16.8], edge: -16.8, y: -1.6, floor: -5, below: (x, z) => z < -16.8, jetties: [[-38, -18, -46, -16.8]] },
    ramps: [{ x: 5.4, z: 70, len: 8, h: 0.9, w: 3.4 }],
    parked: [-32, -28, -24].map(x => ({ kind: 'tanker', x, z: -36 })),
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
    // Past the junction, on your right: a park, and along its far side a car park, cars nosed in to the grass and three
    // buses side by side in the middle. Keep your wreck going through the junction and over the grass to get there.
    park: [12.2, 136, -104, -12.2],
    // (and buildings behind the car park, and along the park's far end, so it's a square in the town, not the edge of it)
    blocks: [
      { x: 0, z: -192, w: 40, d: 30, h: 26, fixed: true },
      ...[[30, 16], [58, 22], [86, 12], [114, 18]].map(([x, h], i) => ({ x, z: -122 - (i % 2) * 4, w: 26, d: 28, h, fixed: true })),
      { x: 150, z: -96, w: 22, d: 40, h: 15, fixed: true }, { x: 152, z: -54, w: 24, d: 36, h: 21, fixed: true },
    ],
    // (and paths over the park: one from the junction, lined up on the buses, and one along it)
    lots: [{ rect: [22, 126, -104, -78], colour: '#a9a59c' }, { rect: [72.4, 75.6, -78, -12.2], colour: '#c9b994' }, { rect: [12.2, 136, -46.6, -43.4], colour: '#c9b994' }],
    parked: [
      ...[32, 36.2, 40.4, 44.6, 48.8, 53, 57.2, 61.4, 86.6, 90.8, 95, 99.2, 103.4, 107.6, 111.8, 116].map(x => ({ kind: null, x, z: -82.4, yaw: Math.PI })),
      ...[70, 74, 78].map(x => ({ kind: 'bus', x, z: -84.6, yaw: Math.PI })),
    ],
    // Across both your lanes: a fast run off the lip comes down on the jam, a slower one runs into the back of it
    ramps: [{ x: 3.6, z: 150, len: 10, h: 1.0, w: 7.2 }],
    props: [
      ...[160, 166, 172, 178, 184].flatMap(z => [['cone', 0.4, z, 0], ['cone', 7.6, z, 0]]),
      ['barrier', 0.5, 152, Math.PI / 2], ['barrier', 7.7, 152, Math.PI / 2],
      // The park: benches facing the paths, a lamp and a bin now and then, bushes in clumps, and trees only round its
      // edges and corners, where they don't stand between the junction and the car park
      ...[-70, -58, -32, -20].flatMap(z => [['bench', 71, z, -Math.PI / 2], ['bench', 77, z, Math.PI / 2]]),
      ...[26, 46, 100, 120].flatMap(x => [['bench', x, -48, Math.PI], ['bench', x, -42, 0]]),
      ...[-64, -26].flatMap(z => [['lamp', 71.2, z, Math.PI / 2], ['bin', 71.3, z + 3, 0]]),
      ...[36, 110].flatMap(x => [['lamp', x, -47.8, Math.PI / 2], ['bin', x + 3, -47.8, 0]]),
      ...[[70.8, -48], [70.8, -42], [77.2, -48], [77.2, -42]].map(([x, z]) => ['bin', x, z, 0]),
      ...[[30, -66], [32, -63], [54, -28], [56, -25], [94, -30], [108, -62], [111, -59], [118, -24], [56, -70], [90, -20]].map(([x, z], i) => ['bush', x, z, i]),
      ...[[16, -74], [16, -60], [17, -30], [22, -18], [132, -74], [132, -58], [131, -30], [126, -18], [42, -74], [106, -74], [40, -36], [100, -56]].map(([x, z], i) => ['tree', x, z, i]),
    ],
    lanes: [
      // Your way: nothing but the ramp, and a long queue back from the red light
      { road: 'main', side: 1, i: 0, speed: [19, 23], gap: [50, 90], stop: 410.3, queue: [null, 'van', null, null, 'bus', null, null] },
      { road: 'main', side: 1, i: 1, speed: [21, 25], gap: [60, 120], stop: 410.3, queue: [null, 'tanker', null, null, 'lorry', null, null] },
      // Oncoming: a queue the other side, and cars to dodge
      { road: 'main', side: -1, i: 0, speed: [20, 24], fill: [190, 580], gap: [60, 120], stop: 165.3, queue: 3 },
      { road: 'main', side: -1, i: 1, speed: [18, 22], fill: [190, 580], gap: [80, 150], stop: 165.3, queue: 2 },
      // Across: green for them, and busy
      ...busy('cross'),
    ],
    specials: [
      { lane: 6, kind: 'tanker', eta: 7 },
      { lane: 5, kind: 'bus', eta: 8.5 },
    ],
    medals: [50000, 150000, 350000],
  },
  bridge: {
    name: 'Over the Edge', blurb: 'Two lanes each way over the bridge, a jam backed up across it, and a busy road down below. Send it over.',
    seed: 59,
    bounds: [-440, 440, -210, 470],
    start: { x: 5.4, z: 380, speed: 28 },
    junction: [0, 0],
    // The road under the bridge: down from street level into a wide grassy dip, with a slight slope west to east
    // through it and banked toward the north; grass banks up to the street either side
    height: (x, z) => {
      const d = 7 * fade(x);
      if (d < 0.001) return 0;
      const floor = v => -d * (1 + 0.0015 * x - 0.006 * v);
      const a = Math.abs(z);
      if (a <= 8.6) return floor(z);
      const k = (a - 8.6) / (3 * d);
      return k >= 1 ? 0 : floor(Math.sign(z) * 8.6) * (1 - k * k * (3 - 2 * k));
    },
    roads: [
      { name: 'main', x0: 0, z0: 420, x1: 0, z1: -175, right: 2, left: 2 },
      { name: 'under', x0: -430, z0: 0, x1: 430, z1: 0, right: 1, left: 1, under: true },
      { name: 'cross', x0: -430, z0: -75, x1: 430, z1: -75, right: 2, left: 2 },
    ],
    // The bridge: the main road and its pavements, from bank top to bank top
    deck: { rect: [-12.2, 12.2, -29.6, 29.6], y: 0, piers: [-8, 0, 8].flatMap(x => [[x, -14], [x, 14]]) },
    // and open ground all round it
    park: [-130, 130, -62, 55],
    blocks: [{ x: 0, z: -192, w: 40, d: 30, h: 26, fixed: true }],
    props: [...rails(-12.05, -27, 27), ...rails(12.05, -27, 27)],
    lanes: [
      // Your way: a long jam back from the lights across the bridge, with a bus and a lorry in it
      { road: 'main', side: 1, i: 0, speed: [19, 23], gap: [50, 100], stop: 485.3, queue: [null, null, 'van', null, null, 'bus', null, null, null, null, 'suv', null, null] },
      { road: 'main', side: 1, i: 1, speed: [21, 25], gap: [60, 120], stop: 485.3, queue: [null, 'lorry', null, null, null, 'pickup', null, null, null, 'van', null, null] },
      // Oncoming over the bridge toward you
      { road: 'main', side: -1, i: 0, speed: [18, 22], fill: [12, 590], gap: [45, 90] },
      { road: 'main', side: -1, i: 1, speed: [17, 21], fill: [12, 590], gap: [55, 110] },
      // Down below: one lane each way, nose to tail
      { road: 'under', side: 1, i: 0, speed: [15, 19], gap: [1.5, 2.8], spawn: true },
      { road: 'under', side: -1, i: 0, speed: [15, 19], gap: [1.5, 2.8], spawn: true },
      // and across at the lights past the bridge
      ...busy('cross', [2.0, 3.6]),
    ],
    specials: [
      { lane: 4, kind: 'tanker', eta: 6.9 },
      { lane: 5, kind: 'bus', eta: 7.6 },
    ],
    // (a crash here takes a while to get going, down on the road below: traffic keeps coming a bit longer, for a few late hits)
    arrive: 18,
    medals: [40000, 120000, 300000],
  },
  cut: {
    name: 'Short Cut', blurb: 'The road bends right. You don\'t have to: flat out, off the building site\'s ramp, down on the queue, and on through two junctions.',
    seed: 71,
    bounds: [-440, 440, -330, 470],
    start: { x: 5.4, z: 380, speed: 28 },
    junction: [0, -140],
    roads: [
      // Your way, round the corner to the right
      { name: 'main', x0: 0, z0: 420, x1: 0, z1: 52.8, right: 2, left: 2 },
      { name: 'bend', x0: -7.2, z0: 60, x1: 430, z1: 60, right: 2, left: 2 },
      // Straight on, past the building site: one way, down to two busy crossings. (At the speed you'll be doing,
      // the ramp throws you 120-220 m: down on the queue at the first, or with full rush on the one at the second.)
      { name: 'down', x0: 0, z0: 28, x1: 0, z1: -295, right: 2, left: 0 },
      { name: 'first', x0: -430, z0: -140, x1: 430, z1: -140, right: 2, left: 2 },
      { name: 'second', x0: -430, z0: -200, x1: 430, z1: -200, right: 2, left: 2 },
    ],
    // The building site, with its kicker, and the backs of the buildings either side of it
    lots: [{ rect: [-12, 12, 28, 47.8], colour: '#b19c7c' }],
    ramps: [{ x: 3.6, z: 46, len: 9, h: 1.35, w: 7.2 }],
    blocks: [{ x: 0, z: -312, w: 40, d: 30, h: 26, fixed: true },
      { x: -38, z: 36, w: 46, d: 20, h: 17, type: 'walkup', brick: 1, fixed: true }],
    props: [
      ...[-5.4, -2.7, 0, 2.7, 5.4].map(x => ['barrier', x, 30, 0]),
      ...[[-9, 44], [-9, 38], [-9, 32], [9.5, 42], [9.5, 34], [-4, 40], [-6, 35]].map(([x, z]) => ['cone', x, z, 0]),
    ],
    lanes: [
      // Your way is clear all the way to the corner; only oncoming traffic, and (below) a few coming round the
      // corner across your way, to time
      { road: 'main', side: -1, i: 0, speed: [18, 22], fill: [20, 360], gap: [50, 100] },
      // The queue at the first lights, where you come down
      { road: 'down', side: 1, i: 0, speed: [16, 20], stop: 158.3, queue: [null, null, 'van', null, null, 'bus', null, null, null, 'pickup', null, null] },
      { road: 'down', side: 1, i: 1, speed: [16, 20], stop: 158.3, queue: [null, 'tanker', null, null, null, 'lorry', null, null, null, null, null] },
      // and both crossings: green for them, and busy
      ...busy('first'), ...busy('second', [1.7, 3.2]),
      // and a queue at the second lights too, for the long jump (full rush lands you here)
      { road: 'down', side: 1, i: 0, speed: [16, 20], stop: 218.3, queue: [null, 'bus', null, null, null] },
      { road: 'down', side: 1, i: 1, speed: [16, 20], stop: 218.3, queue: [null, null, 'van', null, 'lorry'] },
      // Round the corner, across your way straight on: now and then, for a close call
      { road: 'bend', side: -1, i: 0, speed: [14, 17], gap: [5, 9], spawn: true, then: { road: 'main', side: -1, i: 0 } },
      { road: 'bend', side: -1, i: 1, speed: [15, 18], gap: [6, 11], spawn: true, then: { road: 'main', side: -1, i: 1 } },
    ],
    specials: [
      { lane: 5, kind: 'tanker', eta: 7.4 },
      { lane: 8, kind: 'bus', eta: 8.8 },
    ],
    medals: [50000, 150000, 350000],
  },
  row: {
    draft: true,
    name: 'Tanker Row', blurb: 'The depot\'s tankers wait nose to tail along the far kerb. Light one and they all go, both ways, into both junctions.',
    seed: 83,
    bounds: [-440, 440, -210, 470],
    start: { x: 5.4, z: 380, speed: 28 },
    junction: [0, 0],
    roads: [
      { name: 'main', x0: 0, z0: 420, x1: 0, z1: -7.2, right: 2, left: 2 },
      { name: 'depot', x0: -430, z0: 0, x1: 430, z1: 0, right: 2, left: 2 },
      { name: 'west', x0: -90, z0: 420, x1: -90, z1: -175, right: 2, left: 2 },
      { name: 'east', x0: 90, z0: 420, x1: 90, z1: -175, right: 2, left: 2 },
    ],
    // On the far pavement, 11 m apart: each one's blast is just enough to set off the next
    parked: Array.from({ length: 13 }, (_, i) => ({ kind: 'tanker', x: -66 + i * 11, z: -9.7, yaw: Math.PI / 2, hp: 20 })),
    lanes: [
      { road: 'main', side: 1, i: 0, speed: [19, 23], gap: [50, 100], stop: 410.3, queue: 2 },
      { road: 'main', side: 1, i: 1, speed: [21, 25], gap: [60, 120], stop: 410.3, queue: 1 },
      { road: 'main', side: -1, i: 0, speed: [18, 22], fill: [20, 400], gap: [50, 100] },
      ...busy('depot'), ...busy('west', [2.0, 3.6]), ...busy('east', [2.0, 3.6]),
    ],
    specials: [{ lane: 4, kind: 'bus', eta: 7.6 }],
    medals: [60000, 180000, 400000],
  },
  pick: {
    draft: true,
    name: 'Pick Your Poison', blurb: 'One ramp, two targets: hold back and come down on the queue at the lights, or rush it all the way to Fuel\'s Paradise.',
    seed: 89,
    bounds: [-440, 440, -330, 470],
    start: { x: 5.4, z: 380, speed: 28 },
    junction: [0, -180],
    roads: [
      { name: 'main', x0: 0, z0: 420, x1: 0, z1: -180, right: 2, left: 2 },
      { name: 'lights', x0: -430, z0: -100, x1: 430, z1: -100, right: 2, left: 2 },
      { name: 'end', x0: -430, z0: -180, x1: 430, z1: -180, right: 2, left: 2 },
    ],
    ramps: [{ x: 3.6, z: 49, len: 9, h: 1.35, w: 7.2 }],
    lots: [{ rect: [-21, 21, -232, -187.3], colour: '#c4bfb4' }],
    station: { x: 0, z: -210, w: 30, d: 24, h: 5.4 },
    blocks: [{ x: 0, z: -239, w: 30, d: 13, h: 6, fixed: true, shop: true }],
    props: [
      ...[-6, 6].flatMap(x => [-204, -214].map(z => ['pump', x, z, 0])),
      ['sign', 17, -190, 0],
      ...[56, 62, 68].flatMap(z => [['cone', 0.4, z, 0], ['cone', 7.6, z, 0]]),
    ],
    parked: [...[-2.8, 2.8, -9.2, 9.2].flatMap(x => [-196, -205, -214].map(z => ({ kind: null, x, z }))), { kind: 'tanker', x: 16.5, z: -218 }],
    lanes: [
      // Your way: clear to the ramp, then the queue at the lights
      { road: 'main', side: 1, i: 0, speed: [16, 20], stop: 510.3, queue: [null, null, 'van', null, null, 'bus', null, null, null, null] },
      { road: 'main', side: 1, i: 1, speed: [16, 20], stop: 510.3, queue: [null, 'tanker', null, null, null, 'lorry', null, null, null] },
      { road: 'main', side: -1, i: 0, speed: [18, 22], fill: [20, 560], gap: [50, 100] },
      ...busy('lights'), ...busy('end'),
    ],
    specials: [{ lane: 9, kind: 'tanker', eta: 8.4 }],
    medals: [60000, 180000, 400000],
  },
  bank: {
    draft: true,
    name: 'Bank Shot', blurb: 'Your road comes in at an angle and stops at the avenue. The big junction is down it: bounce the wreckage off the shops and send it there.',
    seed: 97,
    bounds: [-440, 440, -210, 470],
    // (on the diagonal, in its right-hand lane, facing down it)
    start: { x: -300 + D45 * (40 + 5.4), z: 300 - D45 * 40 + D45 * 5.4, yaw: -Math.PI / 4, speed: 28 },
    junction: [0, 0],
    roads: [
      { name: 'main', x0: -300, z0: 300, x1: 0, z1: 0, right: 2, left: 2 },
      { name: 'avenue', x0: -430, z0: -2, x1: 430, z1: -2, right: 2, left: 2 },
      { name: 'north', x0: 70, z0: 420, x1: 70, z1: -175, right: 2, left: 2 },
    ],
    lanes: [
      { road: 'main', side: -1, i: 0, speed: [18, 22], fill: [20, 400], gap: [50, 100] },
      ...busy('avenue'),
      // The big junction: queues both ways on the cross street, waiting for the avenue
      { road: 'north', side: 1, i: 0, speed: [16, 20], stop: 412.3, queue: [null, null, 'bus', null, null] },
      { road: 'north', side: 1, i: 1, speed: [16, 20], stop: 412.3, queue: [null, 'tanker', null, null] },
      { road: 'north', side: -1, i: 0, speed: [16, 20], stop: 163.3, queue: 4 },
      { road: 'north', side: -1, i: 1, speed: [16, 20], stop: 163.3, queue: [null, 'lorry', null] },
    ],
    specials: [{ lane: 1, kind: 'tanker', eta: 7.2 }, { lane: 3, kind: 'bus', eta: 7.0 }],
    medals: [40000, 120000, 300000],
  },
  octane: {
    draft: true,
    name: 'High Octane', blurb: 'Fuel\'s Paradise, built out over the edge of a bridge. Light it up and the forecourt goes over, onto the road below.',
    seed: 101,
    bounds: [-440, 440, -210, 470],
    start: { x: 5.4, z: 380, speed: 28 },
    junction: [56, 0],
    height: (x, z) => -7 * fade(x) * dip(Math.abs(z)),
    roads: [
      { name: 'main', x0: 0, z0: 420, x1: 0, z1: -175, right: 2, left: 2 },
      { name: 'under', x0: -430, z0: 0, x1: 430, z1: 0, right: 1, left: 1, under: true },
    ],
    deck: { rect: [-12.2, 48, -29.6, 29.6], y: 0, piers: [-8, 0, 8, 20, 32, 44].flatMap(x => [[x, -14], [x, 14]]) },
    park: [-130, 130, -62, 55],
    lots: [{ rect: [12.2, 47.5, -15, 15], colour: '#c4bfb4' }],
    station: { x: 31, z: 0, w: 26, d: 20, h: 5.4 },
    blocks: [{ x: 0, z: -192, w: 40, d: 30, h: 26, fixed: true }],
    props: [
      ...[25, 37].flatMap(x => [-5, 5].map(z => ['pump', x, z, 0])),
      ...rails(-12.05, -27, 27), ...rails(47.8, -27, 27),
    ],
    parked: [...[19, 25, 31, 37, 43].flatMap(x => [-12.3, 12.3].map(z => ({ kind: null, x, z, yaw: Math.PI / 2 }))), { kind: 'tanker', x: 31, z: 0, yaw: Math.PI / 2 }],
    lanes: [
      // A jam on the bridge in the inside lane; the outside lane's clear, for the turn into the forecourt
      { road: 'main', side: 1, i: 0, speed: [19, 23], gap: [50, 100], stop: 425, queue: [null, null, 'van', null, null, 'lorry'] },
      { road: 'main', side: -1, i: 0, speed: [18, 22], fill: [12, 590], gap: [45, 90] },
      { road: 'main', side: -1, i: 1, speed: [17, 21], fill: [12, 590], gap: [55, 110] },
      { road: 'under', side: 1, i: 0, speed: [15, 19], gap: [1.5, 2.8], spawn: true },
      { road: 'under', side: -1, i: 0, speed: [15, 19], gap: [1.5, 2.8], spawn: true },
    ],
    specials: [{ lane: 3, kind: 'tanker', eta: 7.4 }, { lane: 4, kind: 'bus', eta: 7.8 }],
    medals: [50000, 150000, 350000],
  },
  canal: {
    draft: true,
    name: 'Mind the Gap', blurb: 'The road stops at the canal. The ramp doesn\'t. Too slow and you\'re swimming; fast enough and the quay road\'s yours.',
    seed: 103,
    bounds: [-440, 440, -210, 470],
    start: { x: 5.4, z: 380, speed: 28 },
    junction: [0, -47],
    roads: [
      { name: 'main', x0: 0, z0: 420, x1: 0, z1: 24, right: 2, left: 2 },
      { name: 'quay', x0: -430, z0: -47, x1: 430, z1: -47, right: 2, left: 2, open: [1] },
      { name: 'far', x0: 0, z0: -54.2, x1: 0, z1: -175, right: 2, left: 2 },
      { name: 'back', x0: -430, z0: -115, x1: 430, z1: -115, right: 2, left: 2 },
    ],
    // (its far bank where the quay road's pavement ends: -47 + 2 lanes + WALK)
    water: { rect: [-440, 440, -34.8, 20], walls: [[19, 20], [-34.8, -33.8]], y: -1.6, floor: -5, below: (x, z) => z < 20 && z > -34.8 },
    ramps: [{ x: 3.6, z: 33, len: 9, h: 0.58, w: 7.2 }],
    blocks: [{ x: 0, z: -192, w: 40, d: 30, h: 26, fixed: true }],
    props: [...[-9, -6, 9.5].map(x => ['bollard', x, 21.5, 0]), ...[-9, -4.5, 9].map(x => ['bollard', x, -36, 0])],
    lanes: [
      { road: 'main', side: -1, i: 0, speed: [18, 22], fill: [20, 380], gap: [50, 100] },
      ...busy('quay'), ...busy('back', [2.0, 3.6]),
      { road: 'far', side: 1, i: 0, speed: [16, 20], stop: 50.6, queue: [null, null, 'van', null] },
      { road: 'far', side: 1, i: 1, speed: [16, 20], stop: 50.6, queue: [null, 'bus', null] },
    ],
    specials: [{ lane: 1, kind: 'tanker', eta: 6.4 }],
    medals: [40000, 120000, 300000],
  },
  meet: {
    draft: true,
    name: 'Rendezvous', blurb: 'Three tankers and a bus are crossing the park, nose to tail. Watch them come and be there when they are: flat out you\'re early.',
    seed: 107,
    bounds: [-440, 440, -210, 470],
    start: { x: 5.4, z: 380, speed: 28 },
    junction: [0, 0],
    roads: [
      { name: 'main', x0: 0, z0: 420, x1: 0, z1: -175, right: 2, left: 2 },
      { name: 'cross', x0: -430, z0: 0, x1: 430, z1: 0, right: 2, left: 2 },
    ],
    // Open ground round the junction, so you can see them coming a long way off
    park: [-330, 330, -70, 120],
    blocks: [{ x: 0, z: -192, w: 40, d: 30, h: 26, fixed: true }],
    lanes: [
      { road: 'main', side: -1, i: 0, speed: [18, 22], fill: [20, 380], gap: [55, 110] },
      { road: 'main', side: -1, i: 1, speed: [17, 21], fill: [20, 380], gap: [70, 140] },
      ...busy('cross', [3.0, 5.0]),
    ],
    specials: [
      { lane: 2, kind: 'tanker', eta: 7.6, exact: true }, { lane: 2, kind: 'tanker', eta: 8.4, exact: true },
      { lane: 2, kind: 'tanker', eta: 9.2, exact: true }, { lane: 3, kind: 'bus', eta: 8.0, exact: true },
    ],
    medals: [40000, 120000, 300000],
  },
  decker: {
    draft: true,
    name: 'Double Decker', blurb: 'A jam on the bridge, a wall down one side of it, and a busy junction down below on the other. Go in at an angle.',
    seed: 109,
    bounds: [-440, 440, -210, 470],
    start: { x: 5.4, z: 380, speed: 28 },
    junction: [-42, 0],
    // Two roads down below, crossing just west of the bridge: one under it, one alongside it
    height: (x, z) => -7 * Math.max(fade(x) * dip(Math.abs(z)), dip(Math.abs(x + 42))),
    roads: [
      { name: 'main', x0: 0, z0: 420, x1: 0, z1: -175, right: 2, left: 2 },
      { name: 'under', x0: -430, z0: 0, x1: 430, z1: 0, right: 1, left: 1, under: true },
      { name: 'beside', x0: -42, z0: 420, x1: -42, z1: -175, right: 1, left: 1, under: true },
    ],
    deck: { rect: [-12.2, 12.2, -29.6, 29.6], y: 0, piers: [-8, 0, 8].flatMap(x => [[x, -14], [x, 14]]), wall: [12.2, 13, -29.6, 29.6] },
    park: [-130, 130, -62, 55],
    blocks: [{ x: 0, z: -192, w: 40, d: 30, h: 26, fixed: true }],
    props: rails(-12.05, -27, 27),
    lanes: [
      { road: 'main', side: 1, i: 0, speed: [19, 23], gap: [50, 100], stop: 485.3, queue: [null, null, 'van', null, null, 'bus', null, null, null, null, 'suv', null, null] },
      { road: 'main', side: 1, i: 1, speed: [21, 25], gap: [60, 120], stop: 485.3, queue: [null, 'lorry', null, null, null, 'pickup', null, null, null, 'van', null, null] },
      { road: 'main', side: -1, i: 0, speed: [18, 22], fill: [12, 590], gap: [45, 90] },
      { road: 'main', side: -1, i: 1, speed: [17, 21], fill: [12, 590], gap: [55, 110] },
      { road: 'under', side: 1, i: 0, speed: [15, 19], gap: [1.6, 3.0], spawn: true },
      { road: 'under', side: -1, i: 0, speed: [15, 19], gap: [1.6, 3.0], spawn: true },
      // and the road alongside, waiting at its lights
      { road: 'beside', side: 1, i: 0, speed: [15, 19], stop: 413.9, queue: [null, null, 'van', null, null, null] },
      { road: 'beside', side: -1, i: 0, speed: [15, 19], stop: 168.9, queue: [null, 'bus', null, null, null] },
    ],
    specials: [{ lane: 4, kind: 'tanker', eta: 6.9 }, { lane: 5, kind: 'bus', eta: 7.6 }],
    medals: [40000, 120000, 300000],
  },
  tower: {
    draft: true,
    name: 'Tower Dive', blurb: 'The biggest ramp in town, five angles wide. Up, over the avenue, and down onto the sky decks, where the cars are stacked in glass.',
    seed: 83,
    bounds: [-440, 440, -440, 470],
    start: { x: 1.8, z: 400, speed: 28 },
    junction: [0, -177],
    roads: [
      // Your way, four lanes wide all the way to the ramp
      { name: 'main', x0: 0, z0: 440, x1: 0, z1: -6, right: 4, left: 4 },
      { name: 'first', x0: -430, z0: 180, x1: 430, z1: 180, right: 2, left: 2 },
      // The avenue under your flight, past the ramp
      { name: 'avenue', x0: -430, z0: -40, x1: 430, z1: -40, right: 2, left: 2 },
      // and the street in front of the sky decks: come down short and that's where you land
      { name: 'skyway', x0: -430, z0: -130, x1: 430, z1: -130, right: 2, left: 2 },
    ],
    // The ramp: five side by side, 30 to 50 degrees at the lip, their lips in a line 6 m past the end of the road
    ramps: [30, 35, 40, 45, 50].map((angle, i) => ({ x: -12 + i * 6, z: 64, len: 70, w: 6, angle, colour: ['#2fb3a8', '#3a8fd0', '#ff8a1e', '#ff5a3a', '#e8336a'][i] })),
    lots: [{ rect: [-160, 160, -400, -52], colour: '#b8bcb8' }],
    park: [-160, 160, -122, -52],
    // The sky decks: three towers stepping down away from you, 40, 26 and 12 m up, each with its rows of stacked
    // glass boxes. A row knocked over falls on the next, and off the deck's far edge onto the one below. Off the
    // 40 to 50 degree ramps at full speed you come down on the top one, a couple of seconds after the top of your flight.
    blocks: [{ x: 0, z: -177.5, w: 44, d: 35, h: 40 }, { x: 0, z: -213, w: 44, d: 35, h: 26 }, { x: 0, z: -248.5, w: 44, d: 35, h: 12 }]
      .map(b => ({ ...b, type: 'tower', bare: true, tank: false, fixed: true, deck: true })),
    stacks: [
      ...[-166, -176, -186].map(z => ({ deck: 0, x: 0, z, n: 5, high: 4, along: 'x', gap: 4 })),
      ...[-203, -215].map(z => ({ deck: 1, x: 0, z, n: 5, high: 3, along: 'x', gap: 4 })),
      ...[-240, -252].map(z => ({ deck: 2, x: 0, z, n: 4, high: 2, along: 'x', gap: 4.5 })),
    ],
    // Fly it: slow motion on the way down, nitro in the air (a crate in front of each ramp)
    dive: true,
    crates: [-12, -6, 0, 6, 12].map(x => [x, 100]),
    lanes: [
      // Your way, as far as the crossing: they turn off there
      { road: 'main', side: 1, i: 0, speed: [18, 22], fill: [90, 230], gap: [60, 110], then: { road: 'first', side: 1, i: 0 } },
      { road: 'main', side: 1, i: 1, speed: [20, 24], fill: [110, 230], gap: [70, 120], then: { road: 'first', side: -1, i: 0 } },
      // and toward you, out of the crossing
      { road: 'first', side: -1, i: 1, speed: [16, 20], gap: [3, 6], spawn: true, then: { road: 'main', side: -1, i: 0 } },
      ...busy('first').filter(l => !(l.side === -1 && l.i === 1)),
      // (one lane each way under your flight: busy, but not so many cars on top of all the stacked ones)
      ...busy('avenue').filter(l => l.i === 0),
      ...busy('skyway', [2.2, 4]).filter(l => l.i === 0),
    ],
    // (from bot runs: a good landing hands-off is silver; gold takes the dive, nitro or flips, and most of the stacks)
    medals: [80000, 220000, 500000],
  },
  gas: {
    name: 'Last Chance Gas', blurb: 'A T-junction, and Fuel\'s Paradise straight across it. Thread the gap and light it up.',
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
    blocks: [{ x: 0, z: -59, w: 30, d: 13, h: 6, fixed: true, shop: true },
      // and the backs of the next street
      ...[-66, -38, 38, 66].map((x, i) => ({ x, z: -32.6, w: 26, d: 40, h: 11 + (i % 2) * 3.3, type: 'walkup', brick: i % 2, tank: i < 2, fixed: true })),
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
      ...busy('cross'),
    ],
    specials: [
      { lane: 6, kind: 'tanker', eta: 7 },
      { lane: 5, kind: 'bus', eta: 8.2 },
    ],
    medals: [50000, 150000, 350000],
  },
};
