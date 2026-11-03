// Rushtime's cars and traffic.
//
// Your car's handling is its own arcade model on top of the shared physics (see `drive` in main.js):
// accel: m/s² pulling away; top / rushTop: top speed (m/s) normally and burning rush; lat: how hard it can
// corner (m/s² of sideways pull, which sets the turn rate at speed); brake: m/s².
// Traffic uses the shared physics as it is. value: what wrecking one is worth; hp: how much it takes.

export const RIDES = {
  comet: { name: 'Comet', file: 'toy-comet', blurb: 'Light and eager. Darts through gaps others don\'t see.',
    mass: 1150, size: [1.9, 4.3], hp: 100, armour: 1, power: 13000, top: 62, grip: 1.9, livery: 'blaze', tone: 1.15,
    accel: 17, rushTop: 80, lat: 27, brake: 30 },
  police: { name: 'Interceptor', file: 'toy-interceptor', blurb: 'The fastest thing on the road, and heavy with it.',
    mass: 1450, size: [2.0, 4.8], hp: 110, armour: 0.95, power: 14700, top: 66, grip: 1.8, livery: 'volt', tone: 0.9,
    accel: 15, rushTop: 85, lat: 24, brake: 28 },
  van: { name: 'Brick', file: 'toy-brick', blurb: 'A delivery van. Slow to get going; nothing stops it once it is.',
    mass: 2000, size: [2.1, 4.8], hp: 130, armour: 0.9, power: 15600, top: 56, grip: 1.6, livery: 'sun', tone: 0.68,
    accel: 12.5, rushTop: 74, lat: 21, brake: 25 },
};

const car = (file, mass, size, hp, value) => ({ file, mass, size, hp, value, armour: 1, power: mass * 8, top: 30, grip: 1.7, lazy: true });
export const TRAFFIC = {
  hatch: car('toy-zipper', 1000, [1.9, 4.5], 60, 1),
  coupe: car('toy-comet', 1100, [1.9, 4.3], 60, 1.2),
  cab: { ...car('toy-cabbie', 1250, [2.0, 4.6], 70, 1.1), livery: 'rush-taxi' },
  saloon: car('toy-sunday', 1300, [2.0, 4.3], 70, 1),
  suv: car('toy-brute', 1650, [2.1, 4.6], 80, 1.3),
  pickup: car('toy-mule', 1550, [2.1, 5.0], 80, 1.3),
  police: { ...car('toy-interceptor', 1400, [2.0, 4.8], 80, 1.8), livery: 'rush-police' },
  van: car('toy-brick', 1800, [2.1, 4.8], 90, 1.5),
  garbage: { ...car('toy-dumpster', 2600, [2.3, 5.6], 120, 2.2), livery: 'rush-council' },
  bus: { ...car('toy-bus', 5200, [2.5, 9.2], 170, 3.2), livery: 'rush-bus' },
  tanker: { ...car('toy-tanker', 4600, [2.5, 8.4], 120, 3.6), explosive: true },
  lorry: car('toy-lorry', 4200, [2.5, 7.6], 150, 2.8),
  flatbed: car('toy-flatbed', 3900, [2.5, 7.8], 140, 2.6),
};
// Paint for ordinary traffic: Rushtime's own family (see RUSH in car.js), none as hot as yours
export const TRAFFIC_PAINTS = ['coral', 'amber', 'cream', 'slate', 'teal', 'navy'];
