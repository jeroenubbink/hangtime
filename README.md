# Hangtime, Crunchtime & Rushtime

Three low-poly driving games that run in the browser, sharing one car physics engine. There's no build step:
three.js, WebAudio synthesis, plain JavaScript modules and a handful of small car models. All other scenery and
textures are generated in code.

**Play: https://jeroenubbink.github.io/hangtime/** (pick a game on the start screen)

- **Hangtime** is stunt racing: loops, jumps and flips against the clock and a rival.
- **Crunchtime** is a demolition derby: eight cars in an arena, last one running wins.
- **Rushtime** is about traffic crashes: thread through traffic at speed, then plough into a busy junction.

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
- **Three toy cars:** Comet, Hopper and Brute, each with its own handling and engine note, in any of twelve five-colour liveries (body, second colour, accent stripes, trim and hubs).
- **Day, dusk, rain or night:** street lamps and working headlights after dark.
- **Replays:** trackside TV cameras and automatic slow motion on big air.
- **Controls:** keyboard, gamepad and touch screens.

## Crunchtime

- **Eight cars, eight drivers.** Pick from eight (plus two to unlock) toy cars, from a 1-tonne hot hatch to
  a 1.8-tonne van, each in any of the twelve liveries (the taxi, police car and garbage truck also have their own); the other seven are driven by computer opponents with their own temper: some go for the weak,
  some hold grudges, some ram in reverse to spare their engine.
- **Damage where you hit.** Bodywork dents where it's struck. The nose is built to take hits, the doors aren't, so a
  T-bone hurts far more than a head-on. A battered nose loses engine power; hits near a wheel knock it off (the car
  then drags and pulls); doors, bumpers, spoilers and push bars fly off; a big side hit on a car that's finished
  **tears it in half**.
- **Three arenas:** the **Dust Bowl**, a country fair among fields, barns and windmills (banked edges lined with hay
  bales and a hill in the middle), the **Scrapyard** (a patchwork tin fence, heaps of squashed cars, two jumps and a
  mud pit) and the **Sky Deck**, a rooftop with no walls where you can shove cars off the edge.
- **Four events:**
  - **Last Car Standing:** the last car running wins. After 2:30 it's sudden death, and engines overheat.
  - **Brawl:** three minutes, wrecked cars come back, most points wins.
  - **Wrecking Spree:** a 60-second clock that only stops for carnage: damage, takedowns and smashed props buy
    time, a wreck costs 15 seconds, and points buy repairs (<kbd>X</kbd>).
  - **Championship:** three rounds across the three arenas, with points for placing.
- **Pickups:** repair, nitro, shield and spikes (double damage from the nose) work at once; shockwaves, mines (which
  launch cars a few metres into the air) and hops wait for <kbd>E</kbd>. Hop onto someone and land on their roof for a
  **roof crush**: big damage, and a car finished that way is flattened.
- **Arcade hits:** solid hits pop cars up and twist them, wrecks blow up and leap into the air, damage numbers fly out
  of every hit you deal or take, and big ones freeze the frame for a moment.
- **Points** for damage, T-bones, roof crushes, reverse rams, air strikes, spin-outs, wheels knocked off, takedowns, ring-outs,
  revenge, double takedowns and smashed cones, hay bales and oil drums, with a combo for keeping it up.
- **Unlocks:** two mystery cars wait in wrapped boxes: win a championship for one, and win with four different cars for the other.
- **Play with friends online:** see below.
- Day, sunset or floodlit night; keyboard, gamepad and touch.

### Playing online

Click **Play with friends online** in the menu and send the link to up to seven friends. Each one picks a car and takes
the place of a computer driver in your next match; you choose the event and arena as usual. Last Car Standing, Brawl
and the Championship can be played together; Wrecking Spree stays single-player.

There's no game server. Your browser runs the match, and your friends' browsers send their controls and show what yours
sends back, directly over WebRTC. To find each other, the browsers exchange a short encrypted handshake through five
public [Nostr](https://nostr.com) relays (via [Trystero](https://github.com/dmotz/trystero)); nothing else passes
through them. Things to know:

- Keep the game in front while you host: a browser pauses hidden tabs, which pauses the match for everyone.
- If you leave, your friends go back to the menu with a message. If a friend leaves, a computer driver takes over
  their car.
- Players can see each other's IP addresses, as with any peer-to-peer connection.
- A few networks (some offices, universities and mobile carriers) block direct connections; those players can't join
  without a relay server, which this game doesn't use.

### Crunchtime controls

| Key | Action |
| --- | --- |
| ↑ ↓ ← → or W A S D | Drive (↓ brakes, then reverses) |
| Space | Handbrake |
| Shift | Nitro (refills slowly, and faster as you deal damage) |
| E | Use item (shockwave, mine, hop) |
| Q (hold) | Look back |
| R | Flip back over / get unstuck |
| X | Wrecking Spree: buy a repair |
| C | Camera (chase, far chase, hood, overhead) |
| Esc | Pause |

## Rushtime

- **Six junctions:** **Market Cross**, a four-way crossroads in town with four lanes of traffic crossing your path;
  **Dockside Drop**, a downhill run with a crest that throws you, ending at a six-lane harbour road with the
  water behind it; **Gridlock Leap**, where your way is jammed solid back from the lights and the roadworks left
  a ramp: fly onto the jam and shove it into the busy junction; **Over the Edge**, a jam backed up across a bridge,
  two lanes each way, over a busy road (one lane each way) that dips under it through wide open grass: hit the jam
  at an angle and the wrecks go through the crash barrier and down the banks into the traffic below; **Short Cut**,
  where your road bends right and you don't: across the corner's traffic, off a kicker on a building site and
  120-220 m through the air, down on the queue at the first of two busy crossings (or, with full rush, on the
  queue at the second), to shove it through both; and
  **Last Chance Gas**, a T-junction with Fuel's Paradise straight across it, a petrol station with a
  sunset-and-flaming-palm logo on its roof. Anything that hits it hard enough sets it off: your car under the canopy at speed or through a pump or pillar, or, once
  you've crashed, the traffic you've thrown at it, or a blast beside it. Then the pumps go, the canopy and its logo
  fly, and every car on the forecourt is thrown 10-15 m into the air and out over the junction.
- **Eight rough ones, for ideas** (not shown to players yet: open `rush.html?drafts`): **Tanker Row** (tankers parked nose to tail along the far kerb: light one and
  the blasts run down the row both ways into two junctions); **Pick Your Poison** (one ramp: hold back for the
  queue at the lights, or rush all the way to Fuel's Paradise); **Bank Shot** (your road comes in at 45° and stops
  at the avenue: bounce the wreckage off the shops and down to the big junction); **High Octane** (Fuel's Paradise
  out on a bridge deck: its forecourt goes over the edge onto the road below); **Mind the Gap** (the road stops at a
  canal, the ramp doesn't: short and you're swimming, long and you land on the queue past the quay road);
  **Rendezvous** (three tankers and a bus cross the park nose to tail: flat out you're early, so ease off and meet
  them); **Double Decker** (a jam on a bridge with a wall down one side and a junction down below the other); and
  **Tower Dive** (see below).
- **Tower Dive** (a draft): the biggest ramp in town, five ramps side by side, 30° to 50° at the lip (white fins
  between them keep you in yours), with a nitro crate in front of each. Off the 35° to 45° ones at full speed you
  come down on the first of three **sky decks**, tower roofs 40, 26 and 12 m up stepping down away from you, with
  rows of cars stacked in glass boxes, three or four high. A boxed car doesn't move till something loose touches it;
  then its glass goes and it falls the way it was pushed, the one over it a moment later, so a row topples into the
  next, and off the deck's far edge onto the one below. Past the top of your flight comes the **skydive**: time
  slows right down and you fly the car like a rocket, as fast as ever in the slow motion. ↑ and ↓ tip the nose
  down and up, ← and → turn it, and the rush key fires the nitro the way the nose points (the gas and rush you were
  holding up the ramp only count in the air once you've let go of them; on a phone RUSH is a switch up there, tap it
  for nitro and again to stop, so one thumb can tip the nose while it burns). A ring and a dotted line show where you'll
  come down if you do nothing more: orange into a stack, yellow on a deck, white in the street. Every full flip end
  over end and every full spin is heat. Come down hard and that's the crash, where you land, with a shock wave that
  sets off the stacks round about; then you aim your wreck as anywhere else. Too shallow (30°) and you hit the top
  tower's wall; rush and you fly clean over the lot. Gold takes the dive: nitro, flips, or both, and most of the
  stacks.
- **Guide lines** (for testing only, not shown to players: open `rush.html?guides`): up to three coloured routes painted on the road
  per junction, each the best of a different idea that route bots found (20 runs per junction: either lane, a late
  swerve either way, rush or not, easing off), ending in a ring where the car first hit, labelled with what to do
  ("Rush, left lane", "Steady, swerve left") and what the bot scored. Off the ground the line goes dashed.
- **The opening shot** pans across the junction from over the low roofs round it (only walk-ups near a junction),
  then flies back down the road to your car and round behind it for the countdown.
- **The traffic is scripted:** the same every time, so a junction can be learned. Until you crash its drivers are
  model drivers (queues wait, nobody crashes without you); once you've crashed they're slow to see trouble and
  slower to stop, so mostly they drive straight into it.
- **The run-up:** about six seconds through traffic. Near misses (closer counts more, oncoming more still), the
  oncoming lane, drifts and air build **heat**, the multiplier on your final score, and fill **rush**, the boost.
  Burning rush widens the view, blurs the edges and pulls the camera in.
- **The crash:** the moment you hit something solid, time slows right down and the camera rides up behind your
  wreck. Steer it (↑ pushes it on, ↓ holds it back) into more traffic: each new one you hit fills the **explosion
  meter**, and once it's full Space blows your car up as big as a tanker. After 20 seconds it blows anyway, smaller
  the less you filled. Then time picks up again and the camera follows the pile-up.
  Traffic keeps coming for the first 14 seconds or so (longer on Over the Edge, where a crash takes a while to get
  going), then stops before the end, and its drivers react a moment too late, so one hit becomes many. Everything that crashes
  around your crash or in the junction scores; each vehicle hit by something your crash already reached is a link in
  the **chain** and scores more. The crash runs while it keeps scoring: after 19 seconds the drivers start stopping
  in time, and at 30 it's over. When things go quiet (or near the limit) a countdown shows, swelling as it runs out.
- **Scores pop up** over every incident: everything scored within a few metres in half a second, added up, small
  and yellow for a dent, big and red for well above the crash's average.
- **The tour of the wreckage:** when it's over everything stops dead on the 0 for two seconds, then the camera
  sweeps over what's left, gathered into up to six heaps, a second and a half each (a second if there's only one),
  each with its score and a name (The Pile, Stragglers, Just a Dent, Ground Zero…), the biggest last. Enter skips it. Then the results, circling over the lot, with a **wreck report**: the
  damage by type, and the vehicles that took the most, with what happened to each.
- **The crash camera** keeps out of buildings and vehicles, rising over anything it would end up inside. With two
  or more separate crashes going at once it pulls back (never so far you can't tell the cars apart) and holds one shot
  of them all. It keeps to its side of the action from one subject to the next, so left stays left. It slides over a
  short way, flies over the roofs to anything far off, and goes up and over any building in the way. The tour pulls
  up and back between heaps, so you see where each lies from the last, and looks at each from where all of it shows.
- **The edge of town:** wrecks fly as far as they're thrown, but anything heading out past the buildings along the
  roads and round the forecourts (or off the end of the ground) meets an invisible wall and comes down on the
  outskirts, on a flat roof or in the street, never out in the empty ground beyond.
- **The town:** brick walk-ups over shop fronts mixed with stone-based towers, the tallest stepping back in tiers to
  a crown, water tanks on the roofs. Tankers explode, other wrecks
  sometimes catch fire and go up, cars split in half, lamp posts and trees go flying, hydrants gush, and on the
  docks cars go over the quay into the water.
- **Traffic:** six kinds of car, vans, pickups, police cars, garbage trucks, city buses, fuel tankers, box lorries
  and flatbeds with a load.
- **Medals** per junction: bronze is a decent crash; gold needs heat and a well-timed hit.
- **Your car:** an arcade model on top of the shared physics: you set the turn rate, the car keeps its grip (or
  slides in a drift), and it goes exactly where you point it at 280 km/h. Comet (light and agile), Interceptor
  (fastest) or Brick (a heavy van).

### Rushtime controls

| Key | Action |
| --- | --- |
| ↑ ↓ ← → or W A S D | Drive (↓ brakes, then reverses) |
| Shift | Rush (boost) |
| Space | Drift; after impact, blow your wreck up (once the explosion meter's full) |
| R | Retry, at any time |
| Esc | Pause |

### Balance

All cars sit on one trade-off: light cars are quicker and turn sharper but take more damage; heavy ones shrug off
hits and shove others around but are slow to get going. The numbers come from AI-only tournaments
(`await derby.simulate(20, 'elim', 'bowl')` in the browser console on the Crunchtime page), adjusted until every car's
average finishing place lands near the middle.

## Run

ES modules need to be served over HTTP (three.js loads from a CDN):

```sh
python3 serve.py          # port 8765; or python3 serve.py 8000
# then open http://localhost:8765 (or, from a phone on the same network, http://<this machine's IP>:8765)
```

Any static server works (`python3 -m http.server`), but `serve.py` also takes in Rushtime **replays**: the
results screen then has a **Send replay** button, and the run lands in `replays/` as JSON (not committed):
every vehicle's position and turn 20 times a second of game time, your inputs, the camera and what it was
following, and what scored where. To look into one, open the game and in the console:

```js
rush.manual = true;   // stop the game's own clock
const R = rush.debug.replay(await (await fetch('replays/<name>.json')).json());
R.seek(14.2);                          // the vehicles at game time 14.2 s, seen from the camera you had
R.seek(14.2, [0, 30, 40, 0, 0, 0]);    // or from anywhere: [x, y, z, look x, y, z]
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
- `js/scenery.js`: instanced trees, bushes, flowers, rocks and tyre walls, the grandstand, and the rounded hills
- `assets/cars/toy-*.glb`, `assets/scenery/nature.glb`, `assets/scenery/derby.glb`: both games' toy cars, the round
  trees, bushes and flowers, and Crunchtime's cones, drums, bales, tyre stacks, fence panels, barn and windmill,
  modelled in Blender (source: `assets/src/toys.blend`)
- `js/net.js`: online rooms over WebRTC, found through public Nostr relays (Trystero, loaded only when you go online)
- `js/toon.js`: the shared toybox look for both games: two-tone shading, rim light and a colour boost, patched into three.js's shaders
- `js/derby/`: Crunchtime
  - `main.js`: events, scoring, hits and damage rules, cameras, HUD, menus, online play (the host runs the match and
    sends snapshots and effects to guests) and the balancing simulator
  - `vehicle.js`: a derby car: model, dents, lost wheels and parts, splitting in two, and car-to-car impacts
  - `arena.js`: the three arenas (height functions for the ground, distance functions for the walls) and their scenery
  - `ai.js`: opponents: picking victims, leading their aim, swooping run-ups, reverse rams, repairs, the rooftop edge
  - `roster.js`: cars, stats and drivers
  - `pickups.js`: pickups, mines and smashable props
  - `fx.js`: smoke, fire and sparks as GPU points, and tumbling debris
  - `stage.js`: renderer, sky, lights and time of day (Rushtime uses it too)
- `js/rush/`: Rushtime
  - `main.js`: your car's handling, the run-up (heat, rush, near misses), the crash (chains, explosions, slow motion,
    crash camera), speed effects (radial blur, streaks), HUD and menus
  - `city.js`: streets as axis-aligned roads with lane markings, kerbs and pavements, buildings, the quay, and
    bridges (the ground is one height everywhere, except over a bridge deck, where it depends on whether you're
    above or below it)
  - `levels.js`: the junctions: roads, traffic lanes, red lights and queues, ramps, bridges, and the timed tanker and bus
  - `traffic.js`: lanes and drivers (following, stopping at red, reacting late, swerving); far traffic glides along
    its lane without physics
  - `props.js`: lamp posts, trees, traffic lights, bins, hydrants, bollards and crash barriers that get knocked flying
  - `stacks.js`: Tower Dive's stacks of cars in glass boxes, and how they come down
  - `replay.js`: records each run for the Send replay button (see Run)
  - `guides.js`, `routes.js`: the guide lines, and the bots' routes they draw (generated)
  - `roster.js`: your cars and the traffic
- `assets/cars/toy-bus.glb`, `toy-tanker.glb`, `toy-lorry.glb`, `toy-flatbed.glb`: Rushtime's big vehicles, made in
  Blender (source: `assets/src/rush-vehicles.blend`)

## Performance

Scenery is instanced, so a Hangtime track takes about 170 draw calls and a Crunchtime arena about 100–170 with
eight cars. Crunchtime's ground and walls are height and distance functions, so eight cars' physics costs well
under a millisecond per step. If the frame rate stays under 50 fps, the game
lowers its rendering resolution step by step (down to 60% of the screen's pixel density) and shrinks the shadow
map. Phones and tablets start at 1.5× pixel density.

## Credits

Flying debris models: [Car Kit](https://kenney.nl/assets/car-kit) by Kenney, CC0 (see `assets/cars/LICENSE.txt`).
