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

// A cross street busy both ways (two lanes each way, green for them)
// (the outer lane's gaps a little longer: rounded, so they're exactly the figures written out, and the traffic's the same)
const busy = (road, gap = [1.6, 3.0]) => [1, -1].flatMap(side => [0, 1].map(i =>
  ({ road, side, i, speed: [15 + i, 18 + i * 2], gap: [gap[0] + i * 0.2, gap[1] + i * 0.4].map(g => Math.round(g * 100) / 100), spawn: true })));
const fade = x => { const t = Math.min(1, Math.max(0, (Math.abs(x) - 50) / 170)); return 1 - t * t * (3 - 2 * t); };
const rails = (x, z0, z1) => Array.from({ length: Math.floor((z1 - z0) / 3) + 1 }, (_, i) => ['rail', x, z0 + i * 3, Math.PI / 2]);
const D45 = Math.SQRT1_2;
// (Tanker Row: how far in through the gate the first of the tankers waiting in the yard are: just far enough that the
// one at the gate going up mostly, not always, takes them with it)
const YARD_IN = -27.2;
const CUE = 4.5, QN = 6;
// (Bank Shot's road, in from the corner at 45°: a point s down it, off to the right of its middle)
const diag = (s, off) => ({ x: -300 + D45 * (s + off), z: 300 - D45 * s + D45 * off });

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
  sign, face, bare: type === 'walkup', fixed: true });
// and the town behind the shops, block after block of it, so it's town as far as you can see from up there (the taller
// the further back; `r`, a steady hash of where it stands, picks the rest)
const TOWN = [...[98, 126, 154, 182, 210].flatMap(x => [x, -x]).flatMap(x => Array.from({ length: 10 }, (_, i) => [x, -158 - i * 28])),
  ...[-70, -42, -14, 14, 42, 70].flatMap(x => [-392, -420].map(z => [x, z]))].map(([x, z]) => {
  const r = Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
  return { x, z, w: 26, d: 26, h: 24 + r * 34 + (-150 - z) * 0.09, type: r < 0.3 ? 'store' : r < 0.45 ? 'hall' : 'tower', tiers: r > 0.82, fixed: true };
});
const along = (list, from, at) => { let s = from; return list.map(r => { const m = s + r[0] / 2; s += r[0]; return at(r, m); }); };

// A block of town behind the streets, 26 m square, standing at (x, z): its height and look picked by a steady hash of
// where it is, the taller the further out
const town = (x, z) => {
  const r = Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
  return { x, z, w: 26, d: 26, h: 16 + r * 24 + Math.hypot(x, z) * 0.04, type: r < 0.3 ? 'store' : r < 0.42 ? 'hall' : r < 0.6 ? 'walkup' : 'tower', brick: Math.round(r * 9) % 2, tiers: r > 0.85, fixed: true };
};

// Dockside Drop's quay: the water's edge, the promenade between it and the road (grass round the trees, a path along
// the water with benches looking out over it), and the jetty with the crane and the yacht
const DS_EDGE = -22.8;
const DS_JETTY = [-38, -18, -46, DS_EDGE];
// (the beds broken for a path down to the water every 40 m, and at the jetty)
const DS_BEDS = Array.from({ length: 22 }, (_, i) => -430 + i * 40).filter(x => x + 18 < DS_JETTY[0] - 2 || x - 18 > DS_JETTY[1] + 2);
const DS_TOWN = [
  ...[-1, 1].flatMap(sx => [54, 82, 110, 138, 166, 194, 222].flatMap(x => [62, 90, 118, 146, 174, 202, 230].map(z => [sx * x, z]))),
  ...[54, 82].flatMap(x => [x, -x]).flatMap(x => Array.from({ length: 7 }, (_, i) => [x, 258 + i * 28])),
].map(([x, z]) => town(x, z));

// Gridlock Leap: the town round its square, out behind the streets (none in the square, or the shops round its car
// park), and two rows back along the run-up
const GL_TOWN = [
  ...[[1, 1], [-1, 1], [-1, -1], [1, -1]].flatMap(([sx, sz]) => [54, 82, 110, 138, 166, 194, 222].flatMap(x => [62, 90, 118, 146, 174, 202, 230].map(z => [sx * x, sz * z])))
    .filter(([x, z]) => !(x > 0 && z < 0) || x > 170 || z < -150).filter(([, z]) => z > -210),
  ...[54, 82].flatMap(x => [x, -x]).flatMap(x => Array.from({ length: 7 }, (_, i) => [x, 258 + i * 28])),
].map(([x, z]) => town(x, z));
// and the building site beside the ramp, where the roadworks came from: fenced off along the pavement, with a gap to
// get the plant in and out
const GL_SITE = [12.2, 44, 144, 197];

// Over the Edge: town round the open ground about the bridge, behind the streets, and up the run-up
const BR_TOWN = [54, 82, 110, 138, 166, 194, 222].flatMap(x => [x, -x]).flatMap(x => [62, 90, 118, 146, 174, 202, 230, -126, -154, -182].map(z => [x, z]))
  .filter(([x, z]) => Math.abs(x) > 144 || z > 70 || z < -76).concat([54, 82].flatMap(x => [x, -x]).flatMap(x => Array.from({ length: 7 }, (_, i) => [x, 258 + i * 28])))
  .map(([x, z]) => town(x, z));

// Market Cross's shopping: on each corner of the junction a car park, its row along the kerb (as it always was) and
// two rows back to back behind the aisle, in twelve columns of 3.2 m bays; shops round its back and its far side; and
// town behind them
const MC_COLS = Array.from({ length: 12 }, (_, i) => 18 + i * 3.2);
const MC_CORNERS = [-1, 1].flatMap(sx => [-1, 1].map(sz => [sx, sz]));
// (the two new rows: how far from the cross street's middle, and which way they face, away from it or toward it;
// some bays empty, the same ones every time)
const MC_BAYS = MC_CORNERS.flatMap(([sx, sz]) => [[28.2, 1], [33.8, -1]].flatMap(([z, away]) => MC_COLS.map(x => ({ x: sx * x, z: sz * z, yaw: away * sz > 0 ? Math.PI : 0 }))));
const MC_PARKED = MC_BAYS.filter((B, i) => Math.abs(Math.sin(i * 91.7 + 3.1)) > 0.42);
// The shops: along the back of each car park, [width along x, height, type, sign], from the main road out; down its far
// side, [depth along z, ...], from the cross street back. (Low ones, walk-ups and stores: a shopping street, not towers)
const MC_SHOPS = [
  [[[16, 14.9, 'walkup', 'Knead to Know'], [17, 19, 'store', 'AISLE BE BACK'], [16, 11.6, 'walkup', 'Petal to the Metal']], [[18, 18, 'store', 'TOYING AROUND'], [17.8, 14.9, 'walkup', 'Novel Ideas']]],
  [[[16, 18, 'store', 'SOLE MATES'], [17, 14.9, 'walkup', 'Pizza My Heart'], [16, 21, 'store', 'FROCK & ROLL']], [[18, 11.6, 'walkup', 'Carat & Stick'], [17.8, 20, 'store', 'PILLS & THRILLS']]],
  [[[16, 20, 'store', 'VINYL COUNTDOWN'], [17, 11.6, 'walkup', 'WOK THIS WAY'], [16, 18, 'store', 'REEL DEAL']], [[18, 14.9, 'walkup', 'LETTUCE EAT'], [17.8, 19, 'store', 'OHM SWEET OHM']]],
  [[[16, 14.9, 'walkup', 'PAWS FOR THOUGHT'], [17, 22, 'store', 'MALL OR NOTHING'], [16, 18, 'store', 'TREBLE MAKERS']], [[18, 21, 'store', 'HAVING A BALL'], [17.8, 11.6, 'walkup', 'SCREWS LOOSE']]],
];
const MC_BLOCKS = MC_CORNERS.flatMap(([sx, sz], q) => [
  ...along(MC_SHOPS[q][0], 13, (r, x) => shop(r, sx * x, sz * 61, r[0], 26, [0, -sz])),
  ...along(MC_SHOPS[q][1], 12.2, (r, z) => shop(r, sx * 75, sz * z, 26, r[0], [-sx, 0])),
  // (and the corner behind, where nobody'd see a sign)
  { x: sx * 75, z: sz * 61, w: 26, d: 26, h: 24 + q * 3, type: 'tower', fixed: true },
]);
// The town behind: the corners filled out to 240 m or so, and two rows back along the run-up (the taller the further out)
const MC_TOWN = [
  ...MC_CORNERS.flatMap(([sx, sz]) => [54, 82, 110, 138, 166, 194, 222].flatMap(x => [62, 90, 118, 146, 174].map(z => [sx * x, sz * z])))
    .filter(([x, z]) => Math.abs(x) > 100 || Math.abs(z) > 80),
  ...[54, 82].flatMap(x => [x, -x]).flatMap(x => Array.from({ length: 8 }, (_, i) => [x, 202 + i * 28])),
].map(([x, z]) => town(x, z));

// Short Cut: a film shoot (your jump's the stunt), and its two junctions famous corners. Neon Corner, at the first:
// tall blocks round it, screens and neon signs all up them, the biggest facing you as you come down; Clock Corner, at
// the second: the clock tower on one corner (and a low block behind it), the old cinema on the other
const SC_BLOCKS = [
  { x: -19, z: -114.8, w: 28, d: 26, h: 16, type: 'store', fixed: true }, { x: 26.2, z: -114.8, w: 28, d: 26, h: 14, type: 'store', fixed: true },
  { x: -19, z: -170, w: 28, d: 35.6, h: 40, type: 'tower', fixed: true }, { x: 26.2, z: -170, w: 28, d: 35.6, h: 34, type: 'tower', fixed: true },
  { x: -22.5, z: -232.2, w: 21, d: 40, h: 22, type: 'hall', fixed: true }, { x: -8.5, z: -236, w: 7, d: 32, h: 12, type: 'hall', fixed: true },
  { x: 26.2, z: -232.2, w: 28, d: 40, h: 18, type: 'hall', fixed: true },
];
// and the town round about, so it's town as far as you can see from up there (not over the walk-up by the site)
const SC_TOWN = [
  ...[54, 82, 110, 138, 166, 194, 222].flatMap(x => [x, -x]).flatMap(x => [25.2, -2.8, -30.8, -58.8, -86.8, -114.8, -170, -225.2, -253.2, -281.2, -309.2].map(z => [x, z])),
  ...[54, 82].flatMap(x => [x, -x]).flatMap(x => Array.from({ length: 12 }, (_, i) => [x, 85.2 + i * 28])),
].filter(([x, z]) => !(x < 0 && x > -80 && z > 0 && z < 60)).map(([x, z]) => town(x, z));

// (a `draft` is still rough: only there in dev mode, see dev.js)
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
    // The road north ends at a town hall; the shops round the car parks, and the town behind
    blocks: [{ x: 0, z: -192, w: 40, d: 30, h: 26, fixed: true }, ...MC_BLOCKS, ...MC_TOWN],
    // Car parks on the corners of the junction, for the shops: a row of cars nosed in to the kerb each side of the cross
    // street, side on to a wreck coming off the junction to steer into, and two more rows behind
    lots: MC_CORNERS.map(([sx, sz]) => ({ rect: [sx > 0 ? 13 : -62, sx > 0 ? 62 : -13, sz > 0 ? 12.2 : -48, sz > 0 ? 48 : -12.2], colour: '#c9c2b4' })),
    grounds: {
      carpark: MC_CORNERS.map(([sx, sz]) => ({
        rect: [sx * 13, sx * 58, sz * 12.2, sz * 43.6], bay: 3.2,
        bays: [...MC_COLS.map(x => ({ x: sx * x, z: sz * 15.6, yaw: sz > 0 ? 0 : Math.PI })), ...MC_BAYS.filter(B => Math.sign(B.x) === sx && Math.sign(B.z) === sz)],
        arrows: [], })),
      // (green islands at the ends of the back rows, and planters along the shops)
      lawns: MC_CORNERS.flatMap(([sx, sz]) => [[sx * 14.7, sz * 31, 2.8, 10.6, 1.2], [sx * 56.4, sz * 31, 2.8, 10.6, 1.2],
        ...[22, 38].map(x => [sx * x, sz * 45.8, 7, 2.2, 1])]),
    },
    // (the kerb rows as they always were, then the rows behind, picked and painted from random numbers of their own: the
    // traffic's the same as before they were here)
    parked: [
      ...[-1, 1].flatMap(sx => [-1, 1].flatMap(sz => Array.from({ length: 12 }, (_, i) => ({ kind: null, x: sx * (18 + i * 3.2), z: sz * 15.6, yaw: sz > 0 ? 0 : Math.PI })))),
      ...MC_PARKED.map(B => ({ kind: null, own: true, ...B })),
    ],
    parkedSeed: 29,
    // Trees on the islands, lamps down the aisles, and benches and bins along the shops
    props: MC_CORNERS.flatMap(([sx, sz]) => [
      ...[14.7, 56.4].flatMap((x, i) => [['tree', sx * x, sz * 28, i], ['tree', sx * x, sz * 34, i + 1]]),
      ...[26, 42].map(x => ['lamp', sx * x, sz * 31, 0]),
      ...[22, 38].flatMap((x, i) => [['tree', sx * x, sz * 45.8, i + 2], ['bench', sx * (x + 6), sz * 46.2, sz > 0 ? Math.PI : 0], ['bin', sx * (x - 5), sz * 46.4, 0]]),
      ['bench', sx * 59.8, sz * 26, sx > 0 ? Math.PI / 2 : -Math.PI / 2], ['bin', sx * 59.8, sz * 21, 0],
    ]),
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
    // Warehouses across the water, and town up the hill behind the streets
    blocks: [...[-300, -200, -100, 0, 100, 200, 300].map((x, i) => ({ x: x + (i % 2) * 20, z: -150, w: 70, d: 30, h: 14 + (i % 3) * 6, fixed: true })), ...DS_TOWN],
    // and a jetty out into it off to your left, with three tankers parked side by side at the end under the crane:
    // something to aim for. Moored on its far side, the yacht: a tanker going up beside it sinks it
    water: { rect: [-470, 470, -170, DS_EDGE], edge: DS_EDGE, y: -1.6, floor: -5, below: (x, z) => z < DS_EDGE, jetties: [DS_JETTY] },
    crane: { x: -28, z: -36 },
    boat: { x: -13.6, z: -38, name: 'UNSINKABLE II', pts: 5000 },
    // The promenade: beds of grass round the trees along the kerb, a path along the water, and benches on it facing out
    grounds: {
      paths: [{ pts: [[-470, DS_EDGE + 2.6], [470, DS_EDGE + 2.6]], w: 5.2, colour: '#d6cfbf' }, { pts: [[-470, -14.8], [470, -14.8]], w: 6, colour: '#c9c2b4' }],
      lawns: DS_BEDS.map(x => [x, -15.6, 34, 3.6, 1.4]),
    },
    props: [
      ...DS_BEDS.flatMap((x, i) => [['bench', x - 6, -20.6, 0], ['bench', x + 6, -20.6, 0], ['bin', x, -20.4, 0], ['bush', x - 12, -15.6, i], ['bush', x + 12, -15.6, i + 1],
        ['tree', x - 3, -16.2, i + 2], ['lamp', x + 17, -21.6, Math.PI]]),
    ],
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
    // (a hot, hazy afternoon)
    time: 'haze',
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
    // (shops, looking out over it)
    blocks: [
      { x: 0, z: -192, w: 40, d: 30, h: 26, fixed: true },
      ...[[16, 'store', 'BOWL ME OVER'], [14.9, 'walkup', 'Pizza My Heart'], [19, 'store', 'ARCADE-IA'], [11.6, 'walkup', 'LETTUCE EAT']]
        .map(([h, type, sign], i) => shop([26, h, type, sign], 30 + i * 28, -122 - (i % 2) * 4, 26, 28, [0, 1])),
      shop([40, 14.9, 'walkup', 'Novel Ideas'], 150, -96, 22, 40, [-1, 0]), shop([36, 20, 'store', 'VINYL COUNTDOWN'], 152, -54, 24, 36, [-1, 0]),
      ...GL_TOWN,
    ],
    // (nothing of its own on the ground: there for the shops' signs)
    grounds: {},
    // (and paths over the park: one from the junction, lined up on the buses, and one along it)
    lots: [{ rect: GL_SITE, colour: '#a8946c' }, { rect: [22, 126, -104, -78], colour: '#a9a59c' }, { rect: [72.4, 75.6, -78, -12.2], colour: '#c9b994' }, { rect: [12.2, 136, -46.6, -43.4], colour: '#c9b994' }],
    parked: [
      ...[32, 36.2, 40.4, 44.6, 48.8, 53, 57.2, 61.4, 86.6, 90.8, 95, 99.2, 103.4, 107.6, 111.8, 116].map(x => ({ kind: null, x, z: -82.4, yaw: Math.PI })),
      ...[70, 74, 78].map(x => ({ kind: 'bus', x, z: -84.6, yaw: Math.PI })),
    ],
    // Across both your lanes: a fast run off the lip comes down on the jam, a slower one runs into the back of it
    ramps: [{ x: 3.6, z: 150, len: 10, h: 1.0, w: 7.2 }],
    fixtures: [
      ['excavator', 22, 161, Math.PI / 2], ['cabin', 36, 170, 0], ['roller', 25, 170.5, 0], ['sand', 35, 152, 0.4],
      ['skip', 19, 148, 0], ['pipes', 40.5, 160, Math.PI / 2], ['cabin', 37, 189, 0], ['sand', 21, 188, 1.2], ['worksign', 9.6, 198, 0], ['worksign', 9.6, 140, Math.PI],
    ],
    props: [
      ...[147, 150, 153, 165, 168, 171, 174, 177, 180, 183, 186, 189, 192, 195].map(z => ['barrier', 13.4, z, Math.PI / 2]),
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
    // (at night, the bridge lit up)
    time: 'night',
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
    blocks: [{ x: 0, z: -192, w: 40, d: 30, h: 26, fixed: true }, ...BR_TOWN],
    // Made a bridge you see coming: teal girders, a pylon at each corner, lamp standards along it (see gateway.js), and
    // billboards on the banks facing you
    gateway: {
      name: 'VICTORIA BRIDGE', year: 1897,
      pylons: [[-14.4, 31.6, 0], [14.4, 31.6, 0], [-14.4, -31.6, Math.PI], [14.4, -31.6, Math.PI]],
      // (at the park's corners by the road, turned to you as you come out from between the buildings)
      boards: [[-24, 45, 0.55, 0], [24, 45, -0.55, 1]],
    },
    // and paths along the tops of the banks, benches looking down on the road below
    grounds: { paths: [-1, 1].flatMap(sz => [-1, 1].map(sx => ({ pts: [[sx * 30, sz * 39], [sx * 128, sz * 39]], w: 3, colour: '#cdbf9c' }))) },
    props: [...rails(-12.05, -27, 27), ...rails(12.05, -27, 27),
      ...[-22.5, -7.5, 7.5, 22.5].flatMap(z => [['lantern', -11.6, z, Math.PI / 2], ['lantern', 11.6, z, Math.PI / 2]]),
      ...[-1, 1].flatMap(sz => [50, 74, 98].flatMap(x => [-x, x]).map(x => ['bench', x, sz * 37.2, sz > 0 ? 0 : Math.PI])),
      // (lanterns along the paths too, between the benches)
      ...[-1, 1].flatMap(sz => [38, 62, 86, 110].flatMap(x => [-x, x]).map(x => ['lantern', x, sz * 40.9, 0])),
      ...[[-62, 44], [-88, 50], [-114, 43], [64, 45], [92, 51], [118, 42], [-58, -45], [-96, -50], [-120, -42], [70, -47], [100, -43], [124, -51]].map(([x, z], i) => ['tree', x, z, i]),
    ],
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
    // (in the rain, the street wet)
    time: 'rain',
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
    // (and at the end of the road, the studio)
    blocks: [{ x: 0, z: -312, w: 40, d: 30, h: 26, fixed: true },
      { x: -38, z: 36, w: 46, d: 20, h: 17, type: 'walkup', brick: 1, fixed: true }, ...SC_BLOCKS, ...SC_TOWN],
    props: [
      ...[-5.4, -2.7, 0, 2.7, 5.4].map(x => ['barrier', x, 30, 0]),
      ...[[9.5, 34], [-4, 40], [1, 30.5]].map(([x, z]) => ['cone', x, z, 0]),
      // On the corner at the first junction, on your left: a fruit stand. You know what happens to fruit stands.
      ['fruitstand', -2.6, -123.5, Math.PI / 2],
      // (and a bench up from it, looking out at the street)
      ['bench', -4, -104, -Math.PI / 2],
    ],
    // (the pavement in front of it kept clear, so you see it coming; and across the road, round the camera crane)
    clear: [[-8, 0, -128, -100], [7, 14, -128, -100]],
    filmset: {
      // The unit on the site: a trailer, the catering truck, the director's chairs looking at the ramp, a light on it, the
      // clapperboard facing you, and signs; the camera crane on the first junction's corner, filming you coming, and a
      // light by it. And the clock tower.
      kit: [['trailer', -10.2, 41.5, Math.PI / 2], ['catering', -9.5, 31.5, 0], ['chairs', -4.5, 35.5, Math.PI / 2], ['lights', 10, 41, -Math.PI / 2],
        ['clapper', -4.5, 46.2, 0], ['filmcrane', 9.8, -121.5, 0], ['lights', 10.2, -108, Math.PI], ['clocktower', -8.5, -216.2, 0]],
      signs: [[-11, 49, 0], [11.2, 49, 0]],
      screens: [
        [-19, 29, -151.9, 0, 20, 11, [1, 0, 4]], [26.2, 25, -151.9, 0, 16, 9, [2, 3]],
        [-19, 22, -103, 0, 16, 8, [3, 5]], [26.2, 20, -103, 0, 14, 7, [0, 4]],
        [-19, 9.5, -128.1, Math.PI, 14, 7, [5, 0]], [26.2, 9, -128.1, Math.PI, 14, 7, [1, 2]],
        [-4.7, 9.5, -110, Math.PI / 2, 10, 6, [3]], [11.9, 8.5, -110, -Math.PI / 2, 10, 6, [4]],
        [-4.7, 24, -172, Math.PI / 2, 12, 7, [2, 4]], [11.9, 20, -172, -Math.PI / 2, 12, 7, [0, 5]],
        [11.9, 10, -238, -Math.PI / 2, 10, 6, [5]],
      ],
      blades: [[-4.2, 9, -123, Math.PI / 2, 'HOTEL', '#ff4fd8'], [11.4, 9, -103.5, -Math.PI / 2, 'KARAOKE', '#3ff5ea', 9],
        [-4.2, 12, -157, Math.PI / 2, 'PIZZA', '#ffb12e'], [11.4, 12, -157, -Math.PI / 2, 'BAR', '#7fd0ff', 6],
        [11.4, 10.5, -215.5, -Math.PI / 2, 'GRAND', '#ffd84a', 11]],
      clock: [-8.5, -216.2],
      marquee: { x: 26.2, z: -212.2, yaw: 0 },
      studio: { x: 0, z: -297, yaw: 0, y: 26 },
      clapper: [-4.5, 46.2, 0],
    },
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
    name: 'Tanker Row', blurb: 'Every tanker the depot has, parked in a row outside its gate. Light one and they all go, both ways, into both junctions.',
    seed: 83,
    time: 'dawn',
    bounds: [-440, 440, -210, 470],
    start: { x: 5.4, z: 380, speed: 28 },
    junction: [0, 0],
    roads: [
      { name: 'main', x0: 0, z0: 420, x1: 0, z1: -7.2, right: 2, left: 2 },
      // (a parking lane along the far side, bays for the tankers: 11 m each, round the junction)
      { name: 'depot', x0: -430, z0: 0, x1: 430, z1: 0, right: 2, left: 2, parking: { side: -1, from: 358.5, to: 501.5, bay: 11 } },
      { name: 'west', x0: -90, z0: 420, x1: -90, z1: -175, right: 2, left: 2 },
      { name: 'east', x0: 90, z0: 420, x1: 90, z1: -175, right: 2, left: 2 },
    ],
    // In the parking lane, a bay each, 11 m apart: each one's blast is just enough to set off the next. The middle one
    // is next in, turned to face the gate, its back clear of the traffic (and still near enough both its neighbours)
    parked: [...Array.from({ length: 13 }, (_, i) => i === 6 ? { kind: 'tanker', x: 0, z: -12.2, hp: 20 } : { kind: 'tanker', x: -66 + i * 11, z: -9, yaw: Math.PI / 2, hp: 20 }),
      // (and in the yard, why the rest are waiting out there: both racks full, a tanker filling in each bay and three
      // more waiting behind, nose to tail, and two more each side just in through the gate, waiting to get round to
      // them: near enough each other to go up together, the first two only just too far from the one at the gate)
      ...[-1, 1].flatMap(s => [[44, -36.2], [44, -43.8], [33, -36.2], [22, -36.2], [12, -36.2]].map(([x, z]) => ({ kind: 'tanker', x: s * x, z, yaw: -s * Math.PI / 2, hp: 20 }))),
      ...[-1, 1].flatMap(s => [YARD_IN, YARD_IN - 11].map(z => ({ kind: 'tanker', x: s * 5, z, hp: 20 })))],
    lanes: [
      { road: 'main', side: 1, i: 0, speed: [19, 23], gap: [50, 100], stop: 410.3, queue: 2 },
      { road: 'main', side: 1, i: 1, speed: [21, 25], gap: [60, 120], stop: 410.3, queue: 1 },
      { road: 'main', side: -1, i: 0, speed: [18, 22], fill: [20, 400], gap: [50, 100] },
      // (the side streets wait at the depot road's crossings, red for them for good: they'd only go through each other)
      ...busy('depot'), ...['west', 'east'].flatMap(r => busy(r, [2.0, 3.6]).map(l => ({ ...l, stop: l.side === 1 ? 410.3 : 165.3, hold: true, queue: 3 }))),
    ],
    specials: [{ lane: 4, kind: 'bus', eta: 7.6 }],
    // Across the end of your road, the depot: its yard paved from the far pavement back, between the side streets
    lots: [{ rect: [-77.8, 77.8, -172, -15.8], colour: '#b4b2a8' }],
    depot: {
      gate: [0, -17.6],
      fence: [[-77, -16.8, -8, -16.8], [8, -16.8, 77, -16.8], [-77.2, -17, -77.2, -171], [77.2, -17, 77.2, -171], [-77, -171.2, 77, -171.2]],
      kit: [
        // the tank farm: the biggest in the middle, straight down your road behind the gate, and a walled compound each
        // side of it
        ['depot_tank_huge', 0, -108],
        ['depot_tank_big', -52, -96, 0.4], ['depot_tank_mid', -56, -145, 2.6], ['depot_tank_small', -38, -126, -1.2],
        ['depot_tank_mid', 52, -90, -0.8], ['depot_tank_mid', 52, -122, 2.2], ['depot_tank_small', 40, -153, 1.4], ['depot_tank_small', 62, -153, -2.4],
        ['depot_bullet', 0, -147], ['depot_bullet', 0, -157],
        // up front, the loading racks, one each side (tankers filling up under them), the office, and the gas in its
        // white bullets along the side
        ['depot_gantry', -44, -40], ['depot_gantry', 44, -40], ['depot_office', 26, -27], ['depot_bullet', 67.5, -36, Math.PI / 2], ['depot_bullet', 73, -36, Math.PI / 2],
        // the pipes across the yard from the tanks to the rack
        ...[-66, -54, -42, -30, -18, -6, 6, 18, 30, 42, 54, 66].map(x => ['depot_pipes', x, -62]),
        ...[-74, -86].flatMap(z => [['depot_pipes', -26, z, Math.PI / 2], ['depot_pipes', 26, z, Math.PI / 2]]),
        ['depot_firepoint', -26, -29], ['depot_firepoint', 13, -22], ['depot_firepoint', 40, -52, Math.PI / 2], ['depot_firepoint', -20, -134, Math.PI],
      ],
      // the low concrete walls round the tanks (to hold what they'd spill): [x0, x1, z0, z1]
      bunds: [[-22, 22, -86, -132], [-74, -30, -70, -168], [30, 74, -70, -168]],
      // yellow lines on the yard: the way in from the gate, round to the racks, and along the pipes
      lines: [[[-5, -19], [-5, -52], [-30, -52]], [[5, -19], [5, -52], [70, -52]], [[-30, -52], [-58, -52], [-58, -28], [-30, -28], [-30, -52]], [[30, -52], [58, -52], [58, -28], [30, -28], [30, -52]]],
      // the floodlights, two at the front lighting the yard in from the gate, two in the back corners over the tanks
      masts: [[-64, -22, 2.76], [64, -22, -2.76], [-73, -167, 0.79], [73, -167, -0.79]],
      slabs: [-77.8, 77.8, -172, -15.8],
      lettered: [0, -108, 16, 9.2],
    },
    // (and once the tour comes, the chain going up again: from up in a front corner of the yard, along the row)
    // (and while it goes, the camera up over the whole row, a second and a half after your car's gone up, from back up
    // your road: the chain runs both ways at once, and cutting between its ends is just a scrap for the shot; from
    // across the row, its smoke goes up beside it, not in front)
    overview: { after: 1.5, from: 0 },
    reel: { kind: 'tanker', min: 4, eyes: [[-72, 21, -64], [72, 21, -64]] },
    // The warnings on the way down, each more worried than the last, and the sign over the bays
    warnings: [
      { kind: 'smoking', x: 5.4, z: 340, over: 4.8 }, { kind: 'flammable', x: 5.4, z: 220, over: 4.8 }, { kind: 'seriously', x: 5.4, z: 110, over: 4.8 },
      { kind: 'permit', x: -30, z: -13.4 },
    ],
    medals: [150000, 350000, 650000],
  },
  bank: {
    draft: true,
    name: 'Bank Shot', blurb: 'Your road comes in at an angle and stops at the avenue. The big junction is down it: bounce the wreckage off the shops and send it there.',
    seed: 97,
    time: 'afternoon',
    bounds: [-440, 440, -210, 470],
    // (on the diagonal, facing down it, in the left lane of the two your way: the right's queued solid)
    start: { x: -300 + D45 * (40 + 1.8), z: 300 - D45 * 40 + D45 * 1.8, yaw: -Math.PI / 4, speed: 28 },
    junction: [0, 0],
    roads: [
      { name: 'main', x0: -300, z0: 300, x1: 0, z1: 0, right: 2, left: 2 },
      { name: 'avenue', x0: -430, z0: -2, x1: 430, z1: -2, right: 2, left: 2 },
      { name: 'north', x0: 70, z0: 420, x1: 70, z1: -175, right: 2, left: 2 },
    ],
    lanes: [
      { road: 'main', side: -1, i: 0, speed: [18, 22], fill: [20, 400], gap: [50, 100] },
      // (the avenue's near lane, the one they pull out into, a little lighter: else they'd never get out)
      ...busy('avenue').map(l => l.side === 1 && l.i === 1 ? { ...l, gap: [10, 14] } : l),
      // Your road's right lane, queued back from the avenue, every one of them waiting to pull out onto it and going
      // when there's a gap, one at a time: by the time you get there, only the last few are left
      { road: 'main', side: 1, i: 1, then: { road: 'avenue', side: 1, i: 1 }, bend: 10, speed: [14, 18], stop: 414,
        merge: { every: [0.7, 1.1], after: 1.5, keep: 3, cue: { kind: 'tanker', eta: CUE } },
        // (the back of it, the ones still there when you are: a tanker, Fiatmine's cash van and a bus)
        queue: [...Array(QN).fill(null), 'tanker', 'cash', 'bus'] },
      // The big junction: queues both ways on the cross street, waiting for the avenue
      { road: 'north', side: 1, i: 0, speed: [16, 20], stop: 412.3, queue: [null, null, 'bus', null, null] },
      { road: 'north', side: 1, i: 1, speed: [16, 20], stop: 412.3, queue: [null, 'tanker', null, null] },
      { road: 'north', side: -1, i: 0, speed: [16, 20], stop: 163.3, queue: 4 },
      { road: 'north', side: -1, i: 1, speed: [16, 20], stop: 163.3, queue: [null, 'lorry', null] },
    ],
    specials: [{ lane: 1, kind: 'tanker', eta: 7.2 }, { lane: 3, kind: 'bus', eta: 7.0 }],
    // Across the avenue from the end of your road, the bank, on a stone forecourt where the shops were: what's coming
    // out of your road at its angle goes into its front, and off it toward the big junction
    bank: { x: 19, z: -19.2 },
    // and beside it, the roadworks' compound (behind barriers, in what was the next shop along): the cabin, the skip, the
    // roller, the sand, and what goes up when a blast comes near enough: the gas bottles in their cage, and the tar
    // boiler with its fire lit. Yours to send the wreck over to and set off, while the tanker goes the other way
    fixtures: [['cabin', -47, -22, 0, 2], ['skip', -44, -36, 0.2, 1.5], ['sand', -16, -40, 0, 1.5], ['roller', -53, -43, 1.2, 1.5], ['pipes', -32, -44, Math.PI / 2, 1.5], ['worksign', -10.5, -16.2, 0, 1.5]],
    charges: [
      { kind: 'works_gascage', x: -16, z: -21, yaw: 0, scale: 2, r: 5, name: 'Gas cage', callout: 'GAS CAGE', pts: 6000,
        pops: [[0, 1.4], [0.25, 0.8, 1.1, 0.3], [0.45, 0.9, -1.2, 0.4], [0.7, 0.7, 0.6, -0.5], [1.0, 1.2, -0.4, 0], [1.4, 0.6, 1.3, 0.6]] },
      { kind: 'works_tar', x: -27, z: -29, yaw: Math.PI / 2, scale: 1.5, r: 4, name: 'Tar boiler', callout: 'TAR BOILER', pts: 5000, pops: [[0, 1.6], [0.6, 1.0, 1.2, 0]] },
    ],
    // Roadworks on your road, the reason for the queue: merge in turn, hung over it a way back, and cones between it
    // and your lane down to the end (`diag(s, off)`: a point s down your road, off to the right of its middle)
    warnings: [{ kind: 'merge', ...diag(290, 5.4), over: 4.8, yaw: -Math.PI / 4 }],
    props: [...Array.from({ length: 12 }, (_, i) => ['cone', ...Object.values(diag(330 + i * 7, 3.6)), 0]),
      // (the compound's barriers along the pavement, a gap for the way in)
      ...Array.from({ length: 19 }, (_, i) => -56 + i * 2.5).filter(x => x < -40 || x > -34).map(x => ['barrier', x, -15.6, 0])],
    lots: [{ rect: [-8, 46, -54, -14.4], colour: '#d9d2c0' }, { rect: [-58, -8, -50, -14.4], colour: '#8d8a82' }],
    medals: [80000, 160000, 320000],
  },
  canal: {
    draft: true,
    name: 'Mind the Gap', blurb: 'The road stops at the canal. The ramp doesn\'t. Too slow and you\'re swimming; fast enough and the quay road\'s yours.',
    time: 'noon',
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
    // The towpath along the near bank, either side of the end of your road: paved, the lanterns along the water's edge
    // and benches looking out over it, and trees behind past the buildings
    // (and your road carried on to the water's edge, and across the pavement on the far side from the bridge's deck to
    // the quay road)
    grounds: { paths: [...[-1, 1].map(s => ({ pts: [[s * 13, 22], [s * 430, 22]], w: 3.6, y: 0.22, colour: '#c9a47e' })),
      { pts: [[0, 24.2], [0, 20.05]], w: 14, y: 0.175, colour: '#3b3e44' }, { pts: [[0, -34.05], [0, -40.6]], w: 14, y: 0.175, colour: '#3b3e44' }] },
    // (the road closed at both ends of the bridge: fences across it, there to be driven through)
    props: [...[-9, 9.5].map(x => ['bollard', x, 21.5, 0]), ...[-9, 9].map(x => ['bollard', x, -36, 0]),
      ...[22.4, -30.2].flatMap(z => Array.from({ length: 7 }, (_, i) => ['stopfence', -7.8 + i * 2.6, z, 0])),
      ...[-1, 1].flatMap(s => [16, 40, 64, 88, 112, 136, 160].map(x => ['lantern', s * x, 20.5, 0])),
      ...[-1, 1].flatMap(s => [28, 52, 76, 100, 124, 148].filter(x => s > 0 || x !== 28).map(x => ['bench', s * x, 23.2, 0])),
      ...[-1, 1].flatMap(s => [46, 58, 82, 94, 118, 130, 154].map((x, i) => ['tree', s * x, 27.5, i])),
      ...[-1, 1].flatMap(s => [52, 100, 148].map(x => ['bin', s * (x + 3), 23.6, 0]))],
    // Moored along the walls, out of the way of the jump: a houseboat on your side, a little way along; and across the
    // water the canal tour boat, waiting for its next lot. Neither's any sturdier than it looks: anything in your crash
    // coming down on one or going into it, or a blast reaching it, sends it down
    boat: [
      { model: 'houseboat', name: 'Houseboat', callout: 'HOUSEBOAT SUNK', x: -30, z: 16.4, yaw: Math.PI / 2, out: [0, -1], pts: 5000, frail: true, board: null,
        parts: [{ dz: 0, w: 4.6, d: 15, up: 1.6 }, { dz: -1.4, w: 4.2, d: 10.4, up: 4.2 }],
        titles: ['Underwater Living', 'Moving Day', 'Waterbed', 'Home and Dry', 'Flooded Basement'] },
      { model: 'tourboat', name: 'SIGHTSEER', callout: 'TOUR CANCELLED', x: 62, z: -31.6, yaw: Math.PI / 2, out: [0, 1], pts: 5000, frail: true,
        parts: [{ dz: 0, w: 3.8, d: 17, up: 1.05 }, { dz: 0.9, w: 3.4, d: 12, up: 2.7 }], board: [1.82, 1.3, 0.9, '#f1efe6'],
        titles: ['Tour Cancelled', 'Glass Bottom Boat', 'Last Tour of the Day', 'No Refunds', 'Sights Seen'] },
    ],
    // The old bridge, its deck gone: you fly through between its trusses, under the steel overhead; a piece of the
    // right-hand one going up on the floating crane's hook beside it
    ruin: { x: 0, z0: 20, z1: -7, z2: -34, side: 11, crane: { x: 36 } },
    // and on the way to it, the warnings, more and more insistent
    warnings: [
      { kind: 'closed', x: 5.4, z: 330, over: 4.8 }, { kind: 'bridgeout', x: 5.4, z: 270, over: 4.8 },
      { kind: 'deadend', x: 5.4, z: 205, to: 20, over: 4.8 }, { kind: 'noway', x: 5.4, z: 140, over: 4.8 },
      { kind: 'gap', x: 5.4, z: 80, over: 4.8 },
    ],
    lanes: [
      { road: 'main', side: -1, i: 0, speed: [18, 22], fill: [20, 380], gap: [50, 100] },
      ...busy('quay'), ...busy('back', [2.0, 3.6]),
      { road: 'far', side: 1, i: 0, speed: [16, 20], stop: 50.6, queue: [null, null, 'van', null] },
      { road: 'far', side: 1, i: 1, speed: [16, 20], stop: 50.6, queue: [null, 'bus', null] },
    ],
    specials: [{ lane: 1, kind: 'tanker', eta: 6.4 }],
    medals: [60000, 130000, 220000],
  },
  tower: {
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
    // (at dusk, the station's lights coming on)
    time: 'sunset',
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
    // On the pavement on your right, just after the start: how far to go
    roadsign: { x: 9.4, z: 345, to: -7.3 },
    blocks: [{ x: 0, z: -59, w: 30, d: 13, h: 6, fixed: true, shop: true },
      // and the backs of the next street, shoulder to shoulder with the forecourt and run back to the towers behind, so
      // the station sits in a tight pocket of town and not on a patch of waste ground
      ...[[-66.5, 27], [-37, 30], [37, 30], [66.5, 27]].map(([x, w], i) => ({ x, z: -40.6, w, d: 56, h: 11 + (i % 2) * 3.3, type: 'walkup', brick: i % 2, tank: i < 2, fixed: true })),
      ...[-75, -45, -15, 15, 45, 75].map((x, i) => ({ x, z: -82, w: 29, d: 26, h: [18, 26, 14.5, 22, 30, 16][i], type: i % 3 === 2 ? 'walkup' : 'tower', brick: i % 2, fixed: true }))],
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
