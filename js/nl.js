// Hangtime in Dutch, and what all three games share: the paint jobs and the times of day
import { addDutch } from './i18n.js';

addDutch({
  // shared
  'Cherry Pop': 'Kers', 'Lemonade': 'Limonade', 'Leafy': 'Blaadje', 'Lagoon': 'Lagune', 'Bubblegum': 'Kauwgom', 'Royal': 'Koningsblauw',
  'Tangerine': 'Mandarijn', 'Grape Soda': 'Druif', 'Snowcone': 'Sneeuw', 'Choc Mint': 'Munt', 'Sunset': 'Avond',
  'Midnight': 'Middernacht', 'Police': 'Politie', 'Taxi': 'Taxi', 'Council': 'Gemeente',
  'Day': 'Dag', 'Dusk': 'Schemer', 'Rain': 'Regen', 'Night': 'Nacht', 'Floodlit': 'Nacht',
  'Comet': 'Komeet', 'Menu': 'Menu', 'Paused': 'Pauze', 'Resume': 'Verder', 'How to play': 'Uitleg', 'Got it': 'Oké!',
  'Time': 'Tijd', 'Car': 'Auto', 'Total': 'Totaal', 'GO!': 'GAAN!', '‹ Games': '‹ Spellen', 'Drive': 'Rijden',

  // the game picker
  'Hangtime': 'Hangtime', 'Three driving games · free · in your browser': 'Drie racespellen · gratis · in je browser',
  'Stunt racing. Loops, corkscrews, ramp jumps and flips, a rival to beat, and a track editor.': 'Stuntracen. Loopings, kurkentrekkers, schansen en salto\'s, een tegenstander om te verslaan, en zelf banen bouwen.',
  'Demolition derby. Eight cars, three arenas. Dent them, de-wheel them, tear them in half.': 'Sloopderby. Acht auto\'s, drie arena\'s. Deuk ze, sla hun wielen eraf, scheur ze doormidden.',
  'Traffic crashes. Thread the traffic at 250 km/h, then plough into a busy junction and watch it pile up.': 'Verkeerscrashes. Slalom met 250 km/u door het verkeer, knal dan een druk kruispunt op en kijk hoe alles op elkaar klapt.',

  // the menu
  'stunt driving · loops · jumps · your own tracks': 'stuntrijden · loopings · sprongen · je eigen banen',
  'Track': 'Baan', 'Mode': 'Spel', 'Laps': 'Rondes', 'Rival': 'Tegenstander', 'Livery': 'Kleur',
  'Race ▸': 'Racen ▸', 'Go ▸': 'Gaan ▸', 'Track editor': 'Baan bouwen', 'Race': 'Race', 'Stunt attack': 'Stuntrace', 'Off': 'Uit',
  'custom': 'eigen', '{0} livery': 'kleur {0}',
  'Rookie': 'Groentje', 'Pro': 'Pro', 'Ace': 'Kampioen',
  'All-rounder': 'Alleskunner', 'Hopper': 'Springer', 'Light open-wheeler: grippy, flips fast, lower top speed': 'Lichte formulewagen: veel grip, salto\'s gaan snel, lagere topsnelheid',
  'Brute': 'Bruut', 'Muscle car: big power, slides, heavy in the air': 'Musclecar: veel vermogen, glijdt, zwaar in de lucht',
  'Sunday Drive': 'Zondagsritje', 'Corkscrew Valley': 'Kurkentrekkerdal', 'Big Air': 'Hoog Vliegen', 'Switchback': 'Haarspeldbocht',
  'Stunt Park': 'Stuntpark', 'Funhouse': 'Kermis',
  'Shared track': 'Gedeelde baan', 'Shared track “{0}” added to your tracks.': 'Gedeelde baan “{0}” toegevoegd aan je banen.',

  // how to play
  'Stay in one piece': 'Blijf heel', 'Air tricks': 'Luchttrucs', 'Stunts & nitro': 'Stunts & nitro', 'Rival & medals': 'Tegenstander & medailles', 'Build': 'Bouwen',
  'hang.help1': '<kbd>↑</kbd> gas · <kbd>↓</kbd> remmen/achteruit · <kbd>←</kbd><kbd>→</kbd> sturen · <kbd>Shift</kbd> nitro<br><kbd>Spatie</kbd> handrem · <kbd>R</kbd> terug naar het laatste checkpoint<br><kbd>C</kbd> camera · <kbd>Esc</kbd> pauze · <kbd>M</kbd> geluid',
  'hang.help2': 'Neem schansen met zo\'n 100 km/u. Loopings willen 75 km/u of meer, recht door het midden. Kombochten houden meer snelheid vast als je hoog in de kom rijdt.',
  'hang.help3': 'Druk in de lucht op <kbd>↑</kbd>/<kbd>↓</kbd> voor een salto, <kbd>←</kbd>/<kbd>→</kbd> om te draaien, en <kbd>Spatie</kbd>+<kbd>←</kbd>/<kbd>→</kbd> voor een rol. Toetsen die je al vasthield bij het opstijgen tellen niet, dus laat los en druk opnieuw. De tijd gaat langzamer terwijl je vliegt. Laat op tijd los: de auto draait nog een beetje door. Land op je wielen!',
  'hang.help4': 'Vliegen, salto\'s, rollen, draaien, loopings, drifts (met de handrem door een bocht) en zachte landingen leveren punten op. Rijg ze binnen 6 s aan elkaar voor een combo tot ×5. Punten vullen de nitrotank: houd <kbd>Shift</kbd> in om hem te verbranden. Oranje pijlen op de weg zijn boostplaten.',
  'hang.help5': 'Race tegen een Groentje, een Pro of een Kampioen (die ook nitro gebruikt). Vaste banen geven brons, zilver en goud voor je snelste ronde.',
  'hang.help6': 'Met Baan bouwen maak je je eigen banen. "Deellink kopiëren" geeft een link die je baan installeert voor iedereen die hem opent.',

  // the race
  'LAP 1/3': 'RONDE 1/3', 'NITRO': 'NITRO', 'DRIFT': 'DRIFT', 'FLIP ↻': 'SALTO ↻', 'FLIP ↺': 'SALTO ↺', 'SPIN': 'DRAAI', 'ROLL': 'ROL', 'CAM': 'CAMERA', 'RESET': 'TERUG',
  '↑↓←→ drive · Space handbrake · Shift nitro · tricks in the air: W/S flip, A/D spin, Q/E roll · C camera · R reset · Esc pause':
    '↑↓←→ rijden · Spatie handrem · Shift nitro · trucs in de lucht: W/S salto, A/D draaien, Q/E rollen · C camera · R terug · Esc pauze',
  'Chase': 'Achter', 'Far chase': 'Ver achter', 'Bumper': 'Bumper', 'TV': 'TV', '{0} camera': 'Camera: {0}',
  'LAP {0}/{1}': 'RONDE {0}/{1}', 'STUNT ATTACK': 'STUNTRACE', 'Record {0}': 'Record {0}', 'L{0} {1}': 'R{0} {1}', 'Best {0}': 'Beste {0}', '/2 vs {0}': '/2 tegen {0}',
  'PITCH': 'KANTELEN', 'COMBO ×{0}': 'COMBO ×{0}', 'AIR {0} s': 'VLIEGEN {0} s', 'DRIFT {0} s': 'DRIFT {0} s',
  '−3 seconds': '−3 seconden', 'SPLASH!': 'PLONS!', 'Too slow for the jump': 'Te langzaam voor de sprong', 'CRASHED!': 'GECRASHT!', 'Land on your wheels': 'Land op je wielen',
  '{0} rival has finished!': '{0} is al binnen!', '↩ Missed a checkpoint — go back, or press R': '↩ Checkpoint gemist — ga terug, of druk op R',
  'LAP RECORD!': 'RONDERECORD!', 'LAP {0}': 'RONDE {0}', 'TIME!': 'TIJD!', '{0} points': '{0} punten', 'YOU WIN!': 'GEWONNEN!', '2ND PLACE': '2E PLEK', 'FINISH!': 'FINISH!',
  // stunts (with DOUBLE, TRIPLE or 3× in front)
  'BAILED': 'MISLUKT', 'LAP BONUS': 'RONDEBONUS', 'LOOP': 'LOOPING', 'CORKSCREW': 'KURKENTREKKER', 'WALL RIDE': 'LANGS DE MUUR', 'HUGE AIR': 'MEGAVLUCHT', 'BIG AIR': 'HOGE VLUCHT',
  'AIR': 'VLUCHT', 'DOUBLE': 'DUBBELE', 'TRIPLE': 'DRIEDUBBELE', 'BACKFLIP': 'SALTO ACHTEROVER', 'FRONTFLIP': 'SALTO VOOROVER', 'BARREL ROLL': 'ROL', 'SMOOTH LANDING': 'ZACHTE LANDING',

  // results
  'Finished': 'Binnen', 'Test drive done': 'Proefrit klaar', 'Watch replay': 'Herhaling kijken', 'Race again': 'Nog een keer', 'Quit': 'Stoppen', 'Restart race': 'Race opnieuw',
  'beat the {0} rival by {1} s': '{0} verslagen met {1} s', 'the {0} rival is still on lap {1}': '{0} zit nog in ronde {1}', 'the {0} rival won by {1} s': '{0} won met {1} s',
  '{0} needs {1}': '{0}: {1} nodig', '{0} needs {1}, {2} s to find': '{0}: {1} nodig, nog {2} s eraf', 'the best there is': 'beter wordt het niet',
  'Gold medal': 'Gouden medaille', 'Silver medal': 'Zilveren medaille', 'Bronze medal': 'Bronzen medaille', 'No medal yet': 'Nog geen medaille',
  'gold': 'goud', 'silver': 'zilver', 'bronze': 'brons',
  'points in {0} seconds on {1}': 'punten in {0} seconden op {1}', '★ New stunt attack record': '★ Nieuw stuntrecord',
  '★ New lap record': '★ Nieuw ronderecord', '★ New stunt record': '★ Nieuw stuntrecord',
  'Stunts landed': 'Geslaagde stunts', 'Longest air': 'Langste vlucht', 'Record': 'Record', 'Lap {0}': 'Ronde {0}', 'Track record': 'Baanrecord', 'Stunt score': 'Stuntscore', 'Stunt record': 'Stuntrecord',
  '● REPLAY': '● HERHALING', 'TV cam': 'TV-camera', 'Done': 'Klaar',

  // the editor
  'Rotate brush (R)': 'Stuk draaien (R)', 'Name': 'Naam', 'My track': 'Mijn baan', 'Test drive ▸': 'Proefrit ▸', 'Save': 'Opslaan', 'Delete': 'Verwijderen',
  'Copy code': 'Code kopiëren', 'Paste code': 'Code plakken', 'Copy share link': 'Deellink kopiëren', 'Clear': 'Alles wissen', 'Load track…': 'Baan laden…',
  'hang.editor': 'Klik om te plaatsen · klik op een geplaatst stuk om het te draaien · rechtsklik om te wissen · scrollwiel of R draait het stuk. Een baan moet één gesloten ronde zijn door het startstuk. Sprongen: Schans → Water → Schans de andere kant op. Kurkentrekkers willen zo\'n 50 km/u om over de top te komen; Schansen en Kickers lanceren alleen in de richting van de pijl.',
  'Erase': 'Wissen', 'Start': 'Start', 'Straight': 'Recht', 'Curve': 'Bocht', 'Banked': 'Kombocht', 'Ramp': 'Schans', 'Water': 'Water', 'Loop': 'Looping', 'Hump': 'Bult',
  'Boost': 'Boost', 'Corkscrew': 'Kurkentrekker', 'Half-pipe': 'Halfpipe', 'Tunnel': 'Tunnel', 'Chicane': 'Chicane', 'Dirt': 'Zand', 'Ice': 'IJs', 'Kicker': 'Kicker',
  'Untitled': 'Naamloos', 'Give the track a name first': 'Geef de baan eerst een naam', 'Saved “{0}”': '“{0}” opgeslagen', 'Could not save (storage unavailable)': 'Opslaan lukt niet (geen opslag)',
  'No saved track with that name': 'Geen opgeslagen baan met die naam', 'Deleted “{0}”': '“{0}” verwijderd', 'Track code copied to clipboard': 'Baancode gekopieerd',
  'Copy this track code:': 'Kopieer deze baancode:', 'Link copied: anyone who opens it gets this track': 'Link gekopieerd: iedereen die hem opent krijgt deze baan',
  'Copy this link:': 'Kopieer deze link:', 'Paste a track code:': 'Plak een baancode:', 'That code is not valid': 'Die code klopt niet',
  '✔ Track OK — {0} tiles': '✔ Baan OK — {0} tegels', ' ({0} unconnected)': ' ({0} los)',
  'Place a start/finish piece': 'Plaats een start/finish', 'Only one start/finish piece allowed': 'Maar één start/finish toegestaan',
  'Track ends at column {0}, row {1}': 'Baan houdt op bij kolom {0}, rij {1}', 'Pieces don\'t connect at column {0}, row {1}': 'Stukken sluiten niet aan bij kolom {0}, rij {1}',
  'Track runs into the start the wrong way': 'Baan komt verkeerd om bij de start uit', 'Track crosses itself': 'Baan kruist zichzelf', 'Track does not close': 'Baan is niet rond',
});
