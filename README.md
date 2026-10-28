# Hangtime

A low-poly stunt-driving game that runs in the browser. It has no build step and no assets: three.js,
WebAudio synthesis and about 3,000 lines of plain JavaScript modules.

**Play it: https://jeroenubbink.github.io/hangtime/**

- **Stunt tracks:** loops, ramp jumps over water, banked bowls, humps and boost pads across five built-in
  tracks, plus a tile-based **track editor** with shareable links.
- **Air tricks:** flips, spins and barrel rolls on their own keys, slow motion while airborne, a level
  camera and a pitch/roll gauge so you know how you'll land.
- **Stunt score and nitro:** combos up to ×5, and every point fills the nitro tank.
- **Race a rival:** an AI driver (Rookie, Pro or Ace) on a racing line, plus a ghost of your best lap,
  split times and bronze/silver/gold medals.
- **Stunt attack:** 90 seconds to score as many points as you can.
- **Three cars:** Comet, Hopper and Brute, each with its own handling and engine note.
- **Day, dusk, rain or night:** street lamps and working headlights after dark.
- **Replays:** trackside TV cameras and automatic slow motion on big air.
- **Controls:** keyboard, gamepad and touch screens.

## Run

ES modules need to be served over HTTP (three.js loads from a CDN):

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

## Controls

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
- **Cars:** Comet (all-rounder), Hopper (light buggy: grippy, quick in the air, lower top speed) and
  Brute (muscle car: big power, slides more, heavy in the air).
- **Time and weather:** day, dusk, rain (less grip, spray) or night (street lamps and headlights).

## Stunts and nitro

Airtime and distance, backflips, frontflips, barrel rolls, spins, loops, drifts and smooth landings score
points. Stunts landed within 6 seconds of each other build a combo up to ×5. Crashing during a stunt loses
it. Points fill the nitro tank; orange chevrons on the road are boost pads.

## Driving tips

- **Loops** need about 75 km/h at the bottom. Enter in the middle of the lane; you come out in the right-hand lane.
- **Jumps** (ramp → water → ramp facing back) want roughly 95–120 km/h at the foot of the ramp; double-width
  water gaps need a boost pad or a long run-up. Landing on the down-slope is smoothest.
- **Banked curves** have a flat inner lane and a bowl on the outside. Ride up the bowl to carry
  about 70 km/h through the turn, against roughly 50 km/h for a flat curve.
- **Humps** throw the car into the air at speed, and you can't brake while flying.
- You must pass every tile in order; cutting across the grass shows a "missed checkpoint" warning.

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
