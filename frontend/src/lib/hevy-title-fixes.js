// Olympus: corrections to the generated Hevy title table (hevy-id-map.js).
//
// The generated table matched Hevy titles to the catalogue by word overlap, and for these titles
// the overlap picked a different movement or different equipment: "Walking" filed as a walking
// lunge, "Chin Up (Weighted)" as an *assisted* chin-up, every sumo squat as a Smith machine one.
// Records, progress charts and the muscle map are computed per exercise, so a wrong match puts
// years of history under the wrong lift. Each id below was checked against the catalogue by name.
//
// A value of null means the catalogue has no entry for that movement: the title imports as a
// custom exercise under its own name, which the person can see and merge, rather than as a
// wrong one. Keys are Hevy's English titles, lowercased. Both the CSV import (import-csv.js) and
// the API import (import-hevy.js) read this before the generated table, so regenerating that
// table does not undo these.
export const HEVY_TITLE_FIX = {
  // Cardio and bodyweight basics
  'running': '0685',                         // run (was: weighted backpack running)
  'walking': '2258',                         // walking (was: walking lunge)
  'high knees': '3556',                      // high knee run (was: walking high knees lunge)
  'cycling': null,                           // no outdoor bike entry (was: cycle cross trainer)
  'jumping jack': '3094',                    // jumping jack (was: astride jumps)
  'jumping jacks': '3094',
  'plank': '0463',                           // front plank (was: weighted front plank)
  'reverse plank': '0867',
  'superman': '3436',                        // superman (was: superman push-up)
  'squat (bodyweight)': '3948',              // air squat (was: drop jump squat)
  'sumo squat': '4936',                      // sumo air squat (was: Smith sumo squat)
  'lunge': '0612',                           // lunge (was: barbell lunge)
  'lateral lunge': null,                     // only weighted side lunges in the catalogue
  'pistol squat': '1759',                    // single leg squat (pistol) (was: kettlebell)
  'wall sit': '1546',                        // bodyweight wall squat
  'bicycle crunch': '6211',                  // bicycle crunch (was: band bicycle crunch)
  'hanging knee raise': '9819',              // hanging knee raise (was: hanging leg raise)
  'triceps dip': '0814',                     // triceps dip (was: lever machine dip)
  'triceps dip (weighted)': '0814',
  'bench dip': '0129',                       // bench dip (was: weighted bench dip)

  // Weighted variants that matched the assisted or plain version
  'chin up (weighted)': '4102',              // weighted chin up (was: lever ASSISTED chin-up)
  'pull up (weighted)': '0841',              // weighted pull-up

  // Equipment or grip mismatches
  'seated overhead press (dumbbell)': '0405', // dumbbell seated shoulder press (was: barbell)
  'standing military press (barbell)': '1162', // barbell standing military press (was: wide)
  'bench press - wide grip (barbell)': null, // catalogue only has the REVERSE wide grip
  'decline bench press (machine)': '1300',   // lever decline chest press (was: barbell)
  'skullcrusher (dumbbell)': '0351',         // dumbbell lying triceps extension (was: barbell)
  'triceps extension (barbell)': '0109',     // barbell standing overhead triceps extension
  'triceps extension (dumbbell)': '0430',    // dumbbell standing triceps extension
  'triceps extension (suspension)': null,
  'sumo squat (barbell)': '1063',
  'sumo squat (dumbbell)': '5121',
  'sumo squat (kettlebell)': '4089',
  'split squat (dumbbell)': '2960',          // dumbbell split squat (was: suspended split squat)
  'seated leg curl (machine)': '0599',       // lever seated leg curl (was: lying leg curl)
  'lat pulldown (machine)': '0579',          // lever front pulldown (was: reverse grip)
  'lat pulldown (band)': '4358',             // band kneeling lat pulldown (was: cable)
  'seated cable row - v grip (cable)': '6032', // cable low seated row with v bar (was: wide grip)
  'spider curl (dumbbell)': '9931',          // dumbbell spider curl (was: REVERSE spider curl)
  'seated wrist curl (barbell)': '0126',     // barbell wrist curl (was: Smith)
  'renegade row (dumbbell)': '2980',         // dumbbell renegade row (was: kettlebell)
  'romanian deadlift (smith machine)': null, // was: barbell
  'bent over row (band)': '3899',            // band bent over row (was: barbell)
  'deadlift (band)': '4618',                 // band deadlift (was: barbell)
  'hammer curl (band)': '0897',              // band hammer curl (was: dumbbell)
  'low row (suspension)': '1080',            // suspension inverted row (was: cable)
  'squat (suspension)': null,                // was: barbell full squat
  'bicep curl (suspension)': null,           // was: dumbbell
  'front raise (suspension)': null,          // was: weighted front raise

  // Olympic lifts filed under a different lift
  'clean': null,                             // no squat clean entry (was: clean and PRESS)
  'hang clean': '1520',                      // barbell hang clean (was: kettlebell)
  'push press': '1200',                      // push press (was: dumbbell)
  'snatch': '1533',                          // barbell snatch (was: one arm snatch)
  'kettlebell snatch': '0542',               // kettlebell one arm snatch (was: double)
}

const has = Object.prototype.hasOwnProperty

/** The correction for a Hevy title: an id, null (import as custom), or undefined (no correction). */
export function hevyTitleFix(title) {
  const key = String(title || '').trim().toLowerCase()
  return has.call(HEVY_TITLE_FIX, key) ? HEVY_TITLE_FIX[key] : undefined
}
