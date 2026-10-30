# Hangtime & Crunchtime

Two low-poly driving games that run in the browser, sharing one car physics engine. There's no build step:
three.js, WebAudio synthesis, plain JavaScript modules and a handful of small car models. All other scenery and
textures are generated in code.

**Play: https://jeroenubbink.github.io/hangtime/** (pick a game on the start screen)

- **Hangtime** is stunt racing: loops, jumps and flips against the clock and a rival.
- **Crunchtime** is a demolition derby: eight cars in an arena, last one running wins.

## Hangtime

- **Stunt tracks:** loops, corkscrews, ramp jumps over water, kickers, half-pipes, banked bowls, chicanes,
  tunnels, dirt and ice, humps and boost pads across six built-in tracks, plus a tile-based **track editor**
  with shareable links.
- **Air tricks:** flips, spins and barrel rolls on their own keys, slow motion while airborne, a level
  camera and a pitch/roll gauge so you know how you'll land.
- **Stunt score and nitro:** combos up to ×5, and every point fills the nitro tank.
- **Race a rival:** an AI driver (Rookie, Pro or Ace) on a racing line, plus a ghost of your best lap,
  split times and bronze/silver/gold medals.
- **Stunt attack:** 90 seconds to score as many points as you can.
- **Three cars:** Comet, Hopper and Brute, each with its own handling and engine note, in any of seven paints.
- **Day, dusk, rain or night:** street lamps and working headlights after dark.
- **Replays:** trackside TV cameras and automatic slow motion on big air.
- **Controls:** keyboard, gamepad and touch screens.

## Crunchtime

- **Eight cars, eight drivers.** Pick from eight (plus two to unlock) Kenney kit cars, from a 1-tonne hot hatch to
  a 1.8-tonne van; the other seven are driven by computer opponents with their own temper: some go for the weak,
  some hold grudges, some ram in reverse to spare their engine.
- **Damage where you hit.** Bodywork dents where it's struck. The nose is built to take hits, the doors aren't, so a
  T-bone hurts far more than a head-on. A battered nose loses engine power; hits near a wheel knock it off (the car
  then drags and pulls); doors, bumpers, spoilers and push bars fly off; a big side hit on a car that's finished
  **tears it in half**.
- **Three arenas:** the **Dust Bowl** (banked edges and a hill in the middle), the **Scrapyard** (walls of crushed
  cars, two jumps and a mud pit) and the **Sky Deck**, a rooftop with no walls where you can shove cars off the edge.
- **Four events:**
  - **Last Car Standing:** the last car running wins. After 2:30 it's sudden death, and engines overheat.
  - **Brawl:** three minutes, wrecked cars come back, most points wins.
  - **Wrecking Spree:** a 60-second clock that only stops for carnage: damage, takedowns and smashed props buy
    time, a wreck costs 15 seconds, and points buy repairs (<kbd>X</kbd>).
  - **Championship:** three rounds across the three arenas, with points for placing.
- **Pickups:** repair, nitro, shield and spikes (double damage from the nose) work at once; shockwaves and mines wait
  for <kbd>E</kbd>.
- **Points** for damage, T-bones, reverse rams, air strikes, spin-outs, wheels knocked off, takedowns, ring-outs,
  revenge, double takedowns and smashed cones and barrels, with a combo for keeping it up.
- **Unlocks:** win a championship for the Dumpster (a garbage truck); win with four different cars for the Prototype.
- Day, sunset or floodlit night; keyboard, gamepad and touch.

### Crunchtime controls

| Key | Action |
| --- | --- |
| ↑ ↓ ← → or W A S D | Drive (↓ brakes, then reverses) |
| Space | Handbrake |
| Shift | Nitro (refills slowly, and faster as you deal damage) |
| E | Use item (shockwave, mine) |
| Q (hold) | Look back |
| R | Flip back over / get unstuck |
| X | Wrecking Spree: buy a repair |
| C | Camera (chase, far chase, hood, overhead) |
| Esc | Pause |

### Balance

All cars sit on one trade-off: light cars are quicker and turn sharper but take more damage; heavy ones shrug off
hits and shove others around but are slow to get going. The numbers come from AI-only tournaments
(`await derby.simulate(20, 'elim', 'bowl')` in the browser console on the Crunchtime page), adjusted until every car's
average finishing place lands near the middle.

## Run

ES modules need to be served over HTTP (three.js loads from a CDN):

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

## Hangtime controls

| Key | Action |
| --- | --- |
| ↑ | Accelerate |
| ↓ | Brake, then reverse |
| ← → | Steer |
| Space | Handbrake (drifts) |
| Shift / N | Nitro |
| W / S | In the air: flip forward / back |
| A / D | In the air: spin left / right |
| Q / E | In the air: barrel roll |
| C | Cycle camera (chase, far chase, bumper, TV) |
| R | Reset to the last checkpoint |
| Esc | Pause |
| M | Mute |

Trick keys are separate from driving so they never fight the steering. While airborne, time slows down
("hangtime"), the chase camera stays level and follows your direction of travel, and a pitch/roll gauge
shows how the car sits against the ground (green: you'll land on your wheels). Landing on the wheels is fine,
even hard or a bit crooked; the roof, a big nose or side hit, or a brutal landing wrecks the car.

Gamepads: left stick steers, triggers or A/X drive and brake, B handbrake, Y nitro, right stick flips and spins,
LB/RB roll. Touch screens get on-screen buttons, including trick buttons.

## Modes and options

- **Race:** 1–5 laps against the clock, optionally against a computer **rival** (Rookie, Pro, or Ace, who
  also uses nitro). Built-in tracks award bronze, silver and gold medals for your best lap, and the HUD shows
  split times against your best lap.
- **Stunt attack:** 90 seconds to score as many stunt points as possible. Each lap adds a bonus; each crash
  costs 3 seconds. Medals at 3,000 / 6,000 / 10,000 points.
- **Cars:** Comet (all-rounder), Hopper (light open-wheeler: grippy, quick in the air, lower top speed) and
  Brute (muscle car: big power, slides more, heavy in the air).
- **Time and weather:** day, dusk, rain (less grip, spray) or night (street lamps and headlights).

## Stunts and nitro

Airtime and distance, backflips, frontflips, barrel rolls, spins, loops, corkscrews, wall rides, drifts and
smooth landings score
points. Stunts landed within 6 seconds of each other build a combo up to ×5. Crashing during a stunt loses
it. Points fill the nitro tank; orange chevrons on the road are boost pads.

## Driving tips

- **Loops** need about 75 km/h at the bottom. Enter in the middle of the lane; you come out in the right-hand lane.
- **Jumps** (ramp → water → ramp facing back) want roughly 95–120 km/h at the foot of the ramp; double-width
  water gaps need a boost pad or a long run-up. Landing on the down-slope is smoothest.
- **Banked curves** have a flat inner lane and a bowl on the outside. Ride up the bowl to carry
  about 70 km/h through the turn, against roughly 50 km/h for a flat curve.
- **Humps** throw the car into the air at speed, and you can't brake while flying.
- **Corkscrews** roll you all the way round. They need about 50 km/h going in; any slower and you drop off
  the top onto your roof.
- **Kickers** are small jumps in the middle of a straight. At speed they throw you a long way, so watch what
  comes after them.
- **Half-pipes** let you ride up the walls (a wall ride scores points).
- **Chicanes** are a tight S between barriers: about 55 km/h.
- **Dirt** has noticeably less grip, and **ice** has very little: brake before it, not on it.
- You must pass every tile in order; cutting across the grass shows a "missed checkpoint" warning. Press R
  to go back to the last checkpoint.

## Track editor

Pick a piece, click to place it, click it again to rotate it, right-click to erase (R or the mouse wheel rotates
the brush). A track must be a single closed circuit through the start piece; the status line tells you where it breaks.
Tracks are saved in the browser (localStorage). "Copy code" and "Paste code" share tracks as text, and
"Copy share link" makes a URL that installs the track for whoever opens it.

## Code layout

- `js/pieces.js`: the track piece catalogue plus visual and collision geometry builders
- `js/track.js`: grid model, path validation, built-in tracks, and the 3D world/collision queries
- `js/car.js`: raycast-suspension rigid-body car physics and the car model
- `js/main.js`: game loop, race rules, cameras, HUD, replay and ghost
- `js/ai.js`: the computer rival (racing line, pure-pursuit steering, speed planning)
- `js/stunts.js`: stunt detection and scoring
- `js/editor.js`: the 2D track editor
- `js/audio.js`: synthesised engine, tyre and crash sounds (WebAudio)
- `js/textures.js`: procedural textures (asphalt grit, grass, blotches), applied in world space, and the water shader
- `js/scenery.js`: instanced trees, bushes, rocks and tyre walls, the grandstand, and the mountains
- `js/derby/`: Crunchtime
  - `main.js`: events, scoring, hits and damage rules, cameras, HUD, menus, and the balancing simulator
  - `vehicle.js`: a derby car: model, dents, lost wheels and parts, splitting in two, and car-to-car impacts
  - `arena.js`: the three arenas (height functions for the ground, distance functions for the walls) and their scenery
  - `ai.js`: opponents: picking victims, leading their aim, swooping run-ups, reverse rams, repairs, the rooftop edge
  - `roster.js`: cars, stats and drivers
  - `pickups.js`: pickups, mines and smashable props
  - `fx.js`: smoke, fire and sparks as GPU points, and tumbling debris
  - `stage.js`: renderer, sky, lights and time of day

## Performance

Scenery is instanced, so a Hangtime track takes about 170 draw calls and a Crunchtime arena about 100–170 with
eight cars. Crunchtime's ground and walls are height and distance functions, so eight cars' physics costs well
under a millisecond per step. If the frame rate stays under 50 fps, the game
lowers its rendering resolution step by step (down to 60% of the screen's pixel density) and shrinks the shadow
map. Phones and tablets start at 1.5× pixel density.

## Credits

Car, debris and cone models: [Car Kit](https://kenney.nl/assets/car-kit) by Kenney, CC0 (see `assets/cars/LICENSE.txt`).
