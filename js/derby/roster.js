// Crunchtime's cars and drivers. Each car is a Kenney kit model with its own weight, engine, grip and
// armour. They trade off along one line: light cars are quick and turn sharp but fold up when hit; heavy
// ones shrug off hits and shove others around but are slow to get going. Balanced by AI-only tournaments
// (see `simulate` in main.js), where every car wins about as often as any other.
//
// power: drive force (N); top: top speed (m/s); grip: tyre friction; mass (kg); armour: damage taken ×;
// hp: hit points; size: [width, length] of the collision shape (m); scale: kit model scale.

export const ROSTER = {
  zipper: { name: 'Zipper', file: 'hatchback-sports', blurb: 'Hot hatch. Darts in, darts out. Folds like paper.',
    mass: 1000, power: 12000, top: 46, grip: 1.86, armour: 1.1, hp: 96, size: [1.9, 4.5], scale: 1.62, paint: '#ff7a1a', tone: 1.25 },
  comet: { name: 'Comet', file: 'sedan-sports', blurb: 'Sports coupe with a wing. Quick and keen to turn.',
    mass: 1120, power: 12700, top: 45, grip: 1.82, armour: 1.04, hp: 100, size: [1.9, 4.3], scale: 1.7, paint: '#e8352b', tone: 1.15 },
  cabbie: { name: 'Cabbie', file: 'taxi', blurb: 'Seen it all. Takes a knock, gives one back.',
    mass: 1250, power: 12700, top: 43, grip: 1.78, armour: 1.0, hp: 100, size: [2.0, 4.6], scale: 1.68, paint: null, tone: 1 },
  sedan: { name: 'Sunday', file: 'sedan', blurb: 'Family saloon. Steady, honest, underestimated.',
    mass: 1300, power: 12900, top: 42, grip: 1.76, armour: 0.98, hp: 104, size: [2.0, 4.3], scale: 1.7, paint: '#2f7fe0', tone: 0.95 },
  police: { name: 'Interceptor', file: 'police', blurb: 'Pursuit special. Big engine, push bar up front.',
    mass: 1360, power: 14300, top: 46, grip: 1.74, armour: 1.0, hp: 98, size: [2.0, 4.8], scale: 1.66, paint: null, tone: 0.9 },
  truck: { name: 'Mule', file: 'truck', blurb: 'Pickup with a heavy nose. Hits hard going forward.',
    mass: 1550, power: 14400, top: 41, grip: 1.68, armour: 0.92, hp: 108, size: [2.1, 5.0], scale: 1.7, paint: '#22b35a', tone: 0.8 },
  suv: { name: 'Boulder', file: 'suv', blurb: 'Tall, heavy four-by-four. Hard to stop, slow to turn.',
    mass: 1650, power: 15000, top: 40, grip: 1.64, armour: 0.9, hp: 112, size: [2.1, 4.6], scale: 1.72, paint: '#ffcf2e', tone: 0.75 },
  van: { name: 'Brick', file: 'van', blurb: 'A delivery van that delivers dents. Heaviest of the lot.',
    mass: 1800, power: 15600, top: 38, grip: 1.58, armour: 0.88, hp: 116, size: [2.1, 4.8], scale: 1.74, paint: '#f2f2f2', tone: 0.68 },
  // Unlockables
  dumpster: { name: 'Dumpster', file: 'garbage-truck', blurb: 'Garbage truck. Unstoppable, unhurried. (Win a championship.)',
    mass: 2300, power: 18800, top: 35, grip: 1.52, armour: 0.8, hp: 124, size: [2.3, 5.6], scale: 1.6, paint: null, tone: 0.55, locked: 'cup' },
  proto: { name: 'Prototype', file: 'race-future', blurb: 'Track car from the future. Blink and it\'s gone. (Win with 4 different cars.)',
    mass: 950, power: 12200, top: 50, grip: 2.0, armour: 1.18, hp: 88, size: [1.8, 4.4], scale: 1.65, paint: '#9b4dff', tone: 1.4, locked: 'four' },
};
export const CORE = ['zipper', 'comet', 'cabbie', 'sedan', 'police', 'truck', 'suv', 'van'];

// Opponents. Each has a temperament: `aggro` (how hard they chase), `skill` (aim and reactions),
// `caution` (how early they go for repairs and back off), `grudge` (how much they hold being hit against
// you) and `reverse` (whether they like ramming backwards, protecting the engine, like real derby drivers).
export const DRIVERS = [
  { name: 'Rusty', aggro: 1.0, skill: 0.75, caution: 0.4, grudge: 1.4, reverse: 0.2 },
  { name: 'Dent', aggro: 1.25, skill: 0.7, caution: 0.2, grudge: 1.2, reverse: 0 },
  { name: 'Mags', aggro: 0.9, skill: 0.9, caution: 0.6, grudge: 1.0, reverse: 0.5 },
  { name: 'Bumper', aggro: 1.1, skill: 0.8, caution: 0.35, grudge: 1.6, reverse: 0.1 },
  { name: 'Granny', aggro: 0.8, skill: 0.95, caution: 0.7, grudge: 2.0, reverse: 0.6 },
  { name: 'Crash', aggro: 1.35, skill: 0.65, caution: 0.1, grudge: 1.0, reverse: 0 },
  { name: 'Duchess', aggro: 0.95, skill: 0.85, caution: 0.5, grudge: 1.3, reverse: 0.3 },
];

export const PAINTS = ['#e8352b', '#ff7a1a', '#ffcf2e', '#22b35a', '#2f7fe0', '#9b4dff', '#f2f2f2', '#2a2d33'];

// Stat bars for the garage, 0..1
export function statBars(c) {
  const all = Object.values(ROSTER);
  const range = (k, f = x => x[k]) => { const v = all.map(f); return [Math.min(...v), Math.max(...v)]; };
  const norm = (v, [a, b]) => 0.12 + 0.88 * (v - a) / (b - a);
  return [
    ['Speed', norm(c.top, range('top'))],
    ['Pickup', norm(c.power / c.mass, range(0, x => x.power / x.mass))],
    ['Handling', norm(c.grip, range('grip'))],
    ['Toughness', norm(c.hp / c.armour, range(0, x => x.hp / x.armour))],
    ['Weight', norm(c.mass, range('mass'))],
  ];
}
