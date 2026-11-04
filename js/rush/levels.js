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

// Tower Dive's grounds. The stream through the park between the avenue and the skyway: its middle at x
const brook = x => -85 + 7 * Math.sin(x / 26 + 0.4) + 2.5 * Math.sin(x / 11);
// The car park behind the hotel: two rows of bays nosed in either side of an aisle, four bays then a green island, and
// most of them taken
// (centred: the islands between the fours at x -15.2, 0 and 15.2)
const BAYS = [[-294, Math.PI], [-308.6, 0]].flatMap(([z, yaw]) => [0, 1, 2, 3].flatMap(g => [0, 1, 2, 3].map(k => ({ x: -28.6 + g * 15.2 + k * 2.9 + 1.45, z, yaw }))));
const EMPTY_BAYS = [2, 9, 13, 20, 27];
// Round the square behind the hotel, shut in on three sides: shops, tall and side by side, with no gaps. Along each
// side, [depth along z, height, type, sign]; along the back, between the sides' fronts, [width along x, ...]
const SHOPS_LEFT = [[26, 38, 'store', 'AISLE BE BACK'], [30, 52, 'tower', 'VINYL COUNTDOWN'], [22, 30, 'walkup', 'Knead to Know'], [28, 60, 'tower', 'REEL DEAL'],
  [24, 40, 'store', 'SOLE MATES'], [34, 56, 'tiers', 'BOWL ME OVER'], [20, 34, 'walkup', 'Petal to the Metal'], [22, 62, 'store', 'TOYING AROUND']];
const SHOPS_RIGHT = [[22, 46, 'tower', 'WOK THIS WAY'], [28, 34, 'walkup', 'Novel Ideas'], [32, 58, 'store', 'OHM SWEET OHM'], [24, 42, 'tower', 'PILLS & THRILLS'],
  [26, 54, 'store', 'HAVING A BALL'], [30, 38, 'walkup', 'Pizza My Heart'], [20, 60, 'tiers', 'ARCADE-IA'], [24, 50, 'store', 'SCREWS LOOSE']];
const SHOPS_BACK = [[20, 64, 'tiers', 'MALL OR NOTHING'], [18, 48, 'store', 'FROCK & ROLL'], [18, 72, 'tower', 'LETTUCE EAT'], [18, 56, 'store', 'TREBLE MAKERS'],
  [18, 68, 'tiers', 'Carat & Stick'], [20, 52, 'store', 'PAWS FOR THOUGHT']];
// (`face`: the side its sign's on, toward the square: worked out from where the square's middle is, the ones near its
// ends would put theirs on a side that's up against the next shop's wall)
const shop = ([len, h, type, sign], x, z, w, d, face) => ({ x, z, w, d, h, type: type === 'tiers' ? 'tower' : type, tiers: type === 'tiers', brick: Math.round(h) % 2,
  sign, face, font: /[a-z]/.test(sign) ? 'script' : null, bare: type === 'walkup', fixed: true });
// and the town behind the shops, block after block of it, so it's town as far as you can see from up there (the taller
// the further back; `r`, a steady hash of where it stands, picks the rest)
const TOWN = [...[98, 126, 154, 182, 210].flatMap(x => [x, -x]).flatMap(x => Array.from({ length: 10 }, (_, i) => [x, -158 - i * 28])),
  ...[-70, -42, -14, 14, 42, 70].flatMap(x => [-392, -420].map(z => [x, z]))].map(([x, z]) => {
  const r = Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
  return { x, z, w: 26, d: 26, h: 24 + r * 34 + (-150 - z) * 0.09, type: r < 0.3 ? 'store' : r < 0.45 ? 'hall' : 'tower', tiers: r > 0.82, fixed: true };
});
const along = (list, from, at) => { let s = from; return list.map(r => { const m = s + r[0] / 2; s += r[0]; return at(r, m); }); };

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
    // (the time of day it's first shown at, for its mood, till one's picked for it: the sign lit against the evening)
    time: 'sunset',
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
    // (the hotel's grounds paved, past the skyway and its pavement; the park between it and the avenue)
    lots: [{ rect: [-160, 160, -400, -142.2], colour: '#c4c2bb' }],
    park: [-160, 160, -122, -52],
    // Hotel California: its name in lights across the front of the tall one (you can check out any time you like),
    // the drive round it, the car park behind it, and the shops round the square; and the park with the stream
    grounds: {
      sign: { text: 'Hotel California', x: 0, z: -160, y: 29.5, w: 41, h: 12 },
      square: [0, -255],
      stream: { x0: -160, x1: 160, z: brook, w: 6, bridges: [-104, -36, 38, 106] },
      paths: [
        // along the stream, on the avenue side, and over it at each footbridge from one street to the other
        { pts: Array.from({ length: 161 }, (_, i) => [-160 + i * 2, brook(-160 + i * 2) + 9.5]), w: 2.8 },
        ...[-104, -36, 38, 106].map(x => ({ pts: [[x, -117.8], [x, -52.2]], w: 2.8 })),
      ],
      loop: { x: 0, z: -213, a: 46, b: 75.5, w: 7, door: [-12, 12, -160, -141.6] },
      carpark: { rect: [-34, 34, -290.5, -312.5], bays: BAYS, arrows: [-24, -8, 8, 24] },
      lawns: [
        // the corners of the hotel's grounds, outside the drive, and the ends of the car park
        ...[-1, 1].flatMap(s => [[s * 42, -152, 22, 12, 4], [s * 44, -278, 18, 12, 4], [s * 43, -301.5, 14, 20, 4]]),
        // islands between the bays
        ...[-1, 0, 1].flatMap(k => [[k * 15.2, -294, 2.6, 5.4, 1.2], [k * 15.2, -308.6, 2.6, 5.4, 1.2]]),
        // planters along the shops at the back
        ...[-50, -25, 25, 50].map(x => [x, -330, 14, 6, 2.5]),
      ],
    },
    // (picked from random numbers of their own: the traffic's the same as before they were here)
    parked: BAYS.filter((_, i) => !EMPTY_BAYS.includes(i)).map(B => ({ kind: null, ...B })),
    parkedSeed: 61,
    // The sky decks: three towers stepping down away from you, 40, 26 and 12 m up, each with its rows of stacked
    // glass boxes. A row knocked over falls on the next, and off the deck's far edge onto the one below. Off the
    // 40 to 50 degree ramps at full speed you come down on the top one, a couple of seconds after the top of your flight.
    // (each a little under the one in front: no gap between for a wreck to drop down, and the camera after it)
    blocks: [
      ...[{ x: 0, z: -177.5, w: 44, d: 35, h: 40 }, { x: 0, z: -212.75, w: 44, d: 35, h: 26 }, { x: 0, z: -248, w: 44, d: 35, h: 12 }]
        .map(b => ({ ...b, type: 'tower', bare: true, tank: false, fixed: true, deck: true })),
      // and the shops round the square, well clear of your flight (rush, and you'll meet the ones at the back)
      ...along(SHOPS_LEFT, 144, (r, s) => shop(r, -69, -s, 26, r[0], [1, 0])),
      ...along(SHOPS_RIGHT, 144, (r, s) => shop(r, 69, -s, 26, r[0], [-1, 0])),
      ...along(SHOPS_BACK, -56, (r, x) => shop(r, x, -364, r[0], 28, [0, 1])),
      // and the town over the roofs behind them
      ...TOWN,
      // and the back corners, behind the ends of the sides, where nobody'd see a shop's sign (last: the town's colours
      // are drawn in order, and stay what they were)
      ...[-69, 69].map((x, i) => ({ x, z: -364, w: 26, d: 28, h: 58 + i * 8, type: 'tower', fixed: true })),
    ],
    stacks: [
      ...[-166, -176, -186].map(z => ({ deck: 0, x: 0, z, n: 4, high: 4, along: 'x', gap: 4.6 })),
      ...[-203, -215].map(z => ({ deck: 1, x: 0, z, n: 5, high: 3, along: 'x', gap: 4 })),
      ...[-240, -252].map(z => ({ deck: 2, x: 0, z, n: 4, high: 2, along: 'x', gap: 4.5 })),
    ],
    // The park and the hotel's grounds: trees down the stream's far bank and round the edges, benches along the path
    // facing the water, a bin by each, lamps; round the drive, along the car park and in front of the shops the same
    props: [
      ...Array.from({ length: 18 }, (_, i) => -153 + i * 18).filter(x => [-104, -36, 38, 106].every(b => Math.abs(x - b) > 6))
        .flatMap((x, i) => [['tree', x, brook(x) - 7 - (i % 3), i], ...(x + 9 < 155 ? [['tree', x + 9, -57 - (i % 2) * 3, i + 1]] : [])]),
      ...[-130, -88, -60, -14, 14, 60, 84, 132].flatMap(x => [['bench', x, brook(x) + 11.6, 0], ['bin', x + 1.8, brook(x) + 11.4, 0]]),
      ...[-120, -70, -20, 20, 70, 120].map(x => ['lamp', x, brook(x) + 11.2, Math.PI / 2]),
      ...[[-142, -100], [-80, -108], [-6, -110], [12, -104], [76, -110], [146, -104], [-50, -64], [52, -66]].map(([x, z], i) => ['bush', x, z, i]),
      // palms round the drive, either side of the door and down the lawn inside it, and outside it along the shops
      ...[-1, 1].flatMap(s => [[s * 42, -152], [s * 47, -155], [s * 38, -149], [s * 44, -278], [s * 41, -281]].map(([x, z], i) => [i % 3 === 1 ? 'bush' : 'palm', x, z, i])),
      ...[-1, 1].flatMap(s => [[s * 14, -151], [s * 17.5, -153.5], ...[-170, -188, -206, -224, -242, -258].map(z => [s * 28, z])].map(([x, z], i) => ['palm', x, z, i * 1.7])),
      ...[-1, 1].flatMap(s => [-175, -200, -225, -250].flatMap(z => [['lamp', s * 50, z, s > 0 ? 0 : Math.PI], ['bench', s * 53, z + 6, s * Math.PI / 2], ['palm', s * 52.5, z + 12.5, z]])),
      ...[-1, 1].flatMap(s => [['bin', s * 52.8, -170, 0], ['bin', s * 52.8, -220, 0]]),
      // the car park's islands and ends
      ...[-1, 0, 1].flatMap(k => [['tree', k * 15.2, -294, k], ['tree', k * 15.2, -308.6, k + 2]]),
      ...[-1, 1].flatMap(s => [['tree', s * 43, -296, 0], ['tree', s * 43, -307, 1], ['bush', s * 40, -301.5, 2]]),
      // and in front of the shops
      ...[-50, -25, 25, 50].flatMap((x, i) => [['tree', x - 4, -330, i], ['tree', x + 4, -330, i + 1], ['bench', x - 2, -326.4, Math.PI], ['bench', x + 2, -333.6, 0]]),
      // (and the fountain in the middle, benches round it)
      ['fountain', 0, -330, 0], ...[0, 1, 2, 3].map(k => ['bench', Math.sin(k * Math.PI / 2 + Math.PI / 4) * 5.4, -330 + Math.cos(k * Math.PI / 2 + Math.PI / 4) * 5.4, k * Math.PI / 2 + Math.PI / 4]),
      ...[-37.5, -12.5, 12.5, 37.5].flatMap(x => [['lamp', x, -322, Math.PI / 2], ['bin', x, -336, 0]]),
    ],
    // Fly it: slow motion on the way down
    dive: true,
    // (no nitro crates: the nitro up there is the rush you saved, near misses and all, on the way. They'd go back as
    // crates: [-12, -6, 0, 6, 12].map(x => [x, 100]))
    lanes: [
      // Your way, as far as the crossing: they turn off there
      { road: 'main', side: 1, i: 0, speed: [18, 22], fill: [90, 230], gap: [60, 110], then: { road: 'first', side: 1, i: 0 } },
      { road: 'main', side: 1, i: 1, speed: [20, 24], fill: [110, 230], gap: [70, 120], then: { road: 'first', side: -1, i: 0 } },
      // and toward you, out of the crossing
      { road: 'first', side: -1, i: 1, speed: [16, 20], gap: [3, 6], spawn: true, then: { road: 'main', side: -1, i: 0 } },
      // (the crossing on the run-up: one lane each way, with gaps to thread at full speed, for near misses)
      ...busy('first', [3.4, 6]).filter(l => l.i === 0),
      // (one lane each way under your flight: busy, but not so many cars on top of all the stacked ones)
      ...busy('avenue').filter(l => l.i === 0),
      ...busy('skyway', [2.2, 4]).filter(l => l.i === 0),
    ],
    // (from bot runs: a good landing hands-off makes silver, 200-350k; the best with nitro and flips came to 545k, so
    // gold takes that and some heat off the run-up as well)
    medals: [70000, 200000, 550000],
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
