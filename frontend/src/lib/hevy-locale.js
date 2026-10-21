// Olympus: Hevy exercise titles written in another language, back to Hevy's English title.
//
// Hevy's export writes each built-in exercise under the name the app showed, so a history kept
// with Hevy set to Spanish says "Press de Banca (Mancuerna)" where the English export says
// "Bench Press (Dumbbell)". The importer's tables (hevy-id-map.js, hevy-title-fixes.js) and its
// word matcher are English, so without this every Spanish title became a custom exercise.
//
// The exact table comes first: Hevy's own Spanish titles, each written out. A title not in it is
// translated word by word (equipment, common movement words) and handed to the word matcher,
// which still refuses anything that is not a single clear match; an exercise that matches
// nothing stays the person's own, under its original name.
//
// Exports made by hand also carry spelling slips ("Dumbell", "Barbel"); those are corrected here
// as well, in any language.

const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/\s+/g, ' ').trim()

// Spanish (Hevy) -> English (Hevy). Keys folded: lower case, no accents, single spaces.
const ES = {
  'press de banca (mancuerna)': 'Bench Press (Dumbbell)',
  'press de banca (barra)': 'Bench Press (Barbell)',
  'press de banca (maquina smith)': 'Bench Press (Smith Machine)',
  'press de banca - agarre cerrado (barra)': 'Bench Press - Close Grip (Barbell)',
  'press de banca inclinado (mancuerna)': 'Incline Bench Press (Dumbbell)',
  'press de banca inclinado (barra)': 'Incline Bench Press (Barbell)',
  'press de banca inclinado (maquina smith)': 'Incline Bench Press (Smith Machine)',
  'press de banca en declive (barra)': 'Decline Bench Press (Barbell)',
  'press de banca en declive (mancuerna)': 'Decline Bench Press (Dumbbell)',
  'press de pecho (maquina)': 'Chest Press (Machine)',
  'press de pecho iso-lateral (maquina)': 'Iso-Lateral Chest Press (Machine)',
  'aperturas (maquina)': 'Chest Fly (Machine)',
  'aperturas (mancuerna)': 'Chest Fly (Dumbbell)',
  'aperturas inclinadas (mancuerna)': 'Incline Chest Fly (Dumbbell)',
  'mariposa (pec deck)': 'Butterfly (Pec Deck)',
  'cables cruzados': 'Cable Fly Crossovers',
  'cables cruzados bajos': 'Low Cable Fly Crossovers',
  'fondos': 'Chest Dip',
  'fondos (con peso anadido)': 'Chest Dip (Weighted)',
  'fondos (asistido)': 'Chest Dip (Assisted)',
  'fondos en banco': 'Bench Dip',
  'fondo de triceps': 'Triceps Dip',
  'fondo de triceps (con peso anadido)': 'Triceps Dip (Weighted)',
  'flexiones': 'Push Up',
  'flexiones diamante': 'Diamond Push Up',
  'flexiones (con peso anadido)': 'Push Up (Weighted)',
  'flexion a una mano': 'One Arm Push Up',

  'press de hombros (mancuerna)': 'Shoulder Press (Dumbbell)',
  'press de hombros (barra)': 'Overhead Press (Barbell)',
  'press de hombros (maquina de discos)': 'Shoulder Press (Machine Plates)',
  'press de hombros (maquina de placas)': 'Shoulder Press (Machine Plates)',
  'press de hombros sentado (maquina)': 'Seated Shoulder Press (Machine)',
  'press de hombros sentado (barra)': 'Seated Overhead Press (Barbell)',
  'press de hombros sentado (mancuerna)': 'Seated Overhead Press (Dumbbell)',
  'press militar de pie (barra)': 'Standing Military Press (Barbell)',
  'press arnold (mancuerna)': 'Arnold Press (Dumbbell)',
  'elevacion lateral (mancuerna)': 'Lateral Raise (Dumbbell)',
  'elevacion laterales (mancuerna)': 'Lateral Raise (Dumbbell)',
  'elevacion lateral (cable)': 'Lateral Raise (Cable)',
  'elevacion laterales (cable)': 'Lateral Raise (Cable)',
  'elevacion lateral (maquina)': 'Lateral Raise (Machine)',
  'elevacion lateral a un brazo (cable)': 'Single Arm Lateral Raise (Cable)',
  'elevacion frontal (mancuerna)': 'Front Raise (Dumbbell)',
  'elevacion frontal (cable)': 'Front Raise (Cable)',
  'elevacion frontal (barra)': 'Front Raise (Barbell)',
  'vuelos posteriores (mancuerna)': 'Rear Delt Reverse Fly (Dumbbell)',
  'vuelos posteriores (maquina)': 'Rear Delt Reverse Fly (Machine)',
  'vuelos posteriores (cable)': 'Rear Delt Reverse Fly (Cable)',
  'vuelos invertidos para deltoides posteriores (mancuerna)': 'Rear Delt Reverse Fly (Dumbbell)',
  'remo al menton (cable)': 'Upright Row (Cable)',
  'remo al menton (barra)': 'Upright Row (Barbell)',
  'remo al menton (mancuerna)': 'Upright Row (Dumbbell)',
  'remo vertical (barra)': 'Upright Row (Barbell)',
  'remo vertical (cable)': 'Upright Row (Cable)',
  'remo vertical (mancuerna)': 'Upright Row (Dumbbell)',
  'encogimiento de hombros (mancuerna)': 'Shrug (Dumbbell)',
  'encogimiento de hombros (barra)': 'Shrug (Barbell)',
  'encogimiento de hombros (maquina)': 'Shrug (Machine)',
  'encogimiento de hombros (cable)': 'Shrug (Cable)',
  'face pull': 'Face Pull',

  'jalon al pecho (cable)': 'Lat Pulldown (Cable)',
  'jalon al pecho (maquina)': 'Lat Pulldown (Machine)',
  'jalon al pecho - agarre cerrado (cable)': 'Lat Pulldown - Close Grip (Cable)',
  'jalon al pecho a un brazo': 'Single Arm Lat Pulldown',
  'jalon de remo a un brazo': 'Single Arm Cable Row',
  'jalon con brazos rectos (cable)': 'Straight Arm Lat Pulldown (Cable)',
  'dominada': 'Pull Up',
  'dominada (con peso anadido)': 'Pull Up (Weighted)',
  'dominada (asistida)': 'Pull Up (Assisted)',
  'dominadas con kipping': 'Kipping Pull Up',
  'dominadas escapulares': 'Scapular Pull Ups',
  'dominada supina': 'Chin Up',
  'dominada supina (con peso anadido)': 'Chin Up (Weighted)',
  'remo inclinado (barra)': 'Bent Over Row (Barbell)',
  'remo inclinado (mancuerna)': 'Bent Over Row (Dumbbell)',
  'remo inclinado con apoyo de pecho (mancuerna)': 'Chest Supported Incline Row (Dumbbell)',
  'remo con mancuerna': 'Dumbbell Row',
  'remo sentado con agarre en v (cable)': 'Seated Cable Row - V Grip (Cable)',
  'remo sentado con cable': 'Seated Cable Row - Bar Grip',
  'remo sentado (maquina)': 'Seated Row (Machine)',
  'remo en punta': 'T Bar Row',
  'remo pendlay (barra)': 'Pendlay Row (Barbell)',
  'peso muerto (barra)': 'Deadlift (Barbell)',
  'peso muerto (mancuerna)': 'Deadlift (Dumbbell)',
  'peso muerto (barra hexagonal)': 'Deadlift (Trap Bar)',
  'peso muerto rumano (barra)': 'Romanian Deadlift (Barbell)',
  'peso muerto rumano (mancuerna)': 'Romanian Deadlift (Dumbbell)',
  'peso muerto sumo': 'Sumo Deadlift',
  'peso muerto parcial desde el rack': 'Rack Pull',
  'extension de espalda (hiperextension)': 'Back Extension (Hyperextension)',
  'extension de espalda (hiperextension con peso)': 'Back Extension (Weighted Hyperextension)',
  'extension de espalda (maquina)': 'Back Extension (Machine)',
  'superman': 'Superman',
  'buenos dias (barra)': 'Good Morning (Barbell)',

  'curl de biceps (mancuerna)': 'Bicep Curl (Dumbbell)',
  'curl de biceps (barra)': 'Bicep Curl (Barbell)',
  'curl de biceps (cable)': 'Bicep Curl (Cable)',
  'curl de biceps (maquina)': 'Bicep Curl (Machine)',
  'curl de biceps inclinado (mancuerna)': 'Seated Incline Curl (Dumbbell)',
  'curl de biceps 21': '21s Bicep Curl',
  'curl con barra ez': 'EZ Bar Biceps Curl',
  'curl martillo (mancuerna)': 'Hammer Curl (Dumbbell)',
  'curl martillo (cable)': 'Hammer Curl (Cable)',
  'curl predicador (barra)': 'Preacher Curl (Barbell)',
  'curl predicador (mancuerna)': 'Preacher Curl (Dumbbell)',
  'curl predicador (maquina)': 'Preacher Curl (Machine)',
  'curl de concentracion': 'Concentration Curl',
  'curl arana (barra)': 'Spider Curl (Barbell)',
  'curl arana (mancuerna)': 'Spider Curl (Dumbbell)',
  'curl invertido (barra)': 'Reverse Curl (Barbell)',
  'curl de muneca palmas arriba': 'Seated Palms Up Wrist Curl',
  'curl de extension de muneca (barra)': 'Reverse Wrist Curl (Barbell)',
  'rodillo de antebrazos': 'Wrist Roller',
  'extension de triceps (barra)': 'Triceps Extension (Barbell)',
  'extension de triceps (mancuerna)': 'Triceps Extension (Dumbbell)',
  'extension de triceps (cable)': 'Triceps Extension (Cable)',
  'extension de triceps (maquina)': 'Triceps Extension (Machine)',
  'extension triceps (suspension)': 'Triceps Extension (Suspension)',
  'extension de triceps (suspension)': 'Triceps Extension (Suspension)',
  'extension de triceps atras (cable)': 'Overhead Triceps Extension (Cable)',
  'extension de triceps a un brazo (cable)': 'Single Arm Triceps Pushdown (Cable)',
  'jalon de triceps con cuerda': 'Triceps Rope Pushdown',
  'triceps con polea': 'Triceps Pushdown',
  'press frances (barra)': 'Skullcrusher (Barbell)',
  'press frances (mancuerna)': 'Skullcrusher (Dumbbell)',
  'patada de triceps (cable)': 'Triceps Kickback (Cable)',
  'patada de triceps (mancuerna)': 'Triceps Kickback (Dumbbell)',

  'sentadilla (barra)': 'Squat (Barbell)',
  'sentadilla (mancuerna)': 'Squat (Dumbbell)',
  'sentadilla (peso corporal)': 'Squat (Bodyweight)',
  'sentadilla (maquina smith)': 'Squat (Smith Machine)',
  'sentadilla frontal': 'Front Squat',
  'sentadilla goblet': 'Goblet Squat',
  'sentadilla sumo (barra)': 'Sumo Squat (Barbell)',
  'sentadilla sumo (mancuerna)': 'Sumo Squat (Dumbbell)',
  'sentadilla hack (maquina)': 'Hack Squat (Machine)',
  'sentadilla bulgara (mancuerna)': 'Bulgarian Split Squat (Dumbbell)',
  'press de piernas': 'Leg Press (Machine)',
  'press de piernas (maquina)': 'Leg Press (Machine)',
  'extension de pierna': 'Leg Extension (Machine)',
  'extension de piernas (maquina)': 'Leg Extension (Machine)',
  'extensiones a una pierna': 'Single Leg Extensions',
  'curl de piernas acostado (maquina)': 'Lying Leg Curl (Machine)',
  'curl de pierna sentado': 'Seated Leg Curl (Machine)',
  'curl de piernas sentado (maquina)': 'Seated Leg Curl (Machine)',
  'curls nordicos de isquiotibiales': 'Nordic Hamstrings Curls',
  'zancada (mancuerna)': 'Lunge (Dumbbell)',
  'zancada (barra)': 'Lunge (Barbell)',
  'zancada curtsy (mancuerna)': 'Curtsy Lunge (Dumbbell)',
  'zancada caminando (mancuerna)': 'Walking Lunge (Dumbbell)',
  'aduccion de cadera (cable)': 'Hip Adduction (Cable)',
  'aduccion de caderas': 'Hip Adduction (Machine)',
  'aduccion de cadera (maquina)': 'Hip Adduction (Machine)',
  'abduccion de caderas': 'Hip Abduction (Machine)',
  'abduccion de cadera (cable)': 'Hip Abduction (Cable)',
  'abduccion de cadera (maquina)': 'Hip Abduction (Machine)',
  'impulso de cadera (maquina)': 'Hip Thrust (Machine)',
  'impulso de cadera (barra)': 'Hip Thrust (Barbell)',
  'puente de gluteos (barra)': 'Glute Bridge (Barbell)',
  'patada de burro (maquina)': 'Glute Kickback (Machine)',
  'elevacion de gemelos de pie (barra)': 'Standing Calf Raise (Barbell)',
  'elevacion de gemelos de pie (maquina)': 'Standing Calf Raise (Machine)',
  'elevacion de gemelos de pie (mancuerna)': 'Standing Calf Raise (Dumbbell)',
  'elevacion de gemelos sentado': 'Seated Calf Raise',
  'elevacion de gemelos a una pierna (maquina)': 'Single Leg Standing Calf Raise (Machine)',
  'press de pantorrilla (maquina)': 'Calf Press (Machine)',

  'abdominal corto (maquina)': 'Crunch (Machine)',
  'abdominal corto con cable': 'Cable Crunch',
  'abdominal corto en banco inclinado (con peso anadido)': 'Decline Crunch (Weighted)',
  'abdominal corto en banco inclinado': 'Decline Crunch',
  'abdominal corto (con peso anadido)': 'Crunch (Weighted)',
  'abdominal bicicleta': 'Bicycle Crunch',
  'russian twist (con peso anadido)': 'Russian Twist (Weighted)',
  'russian twist (peso corporal)': 'Russian Twist (Bodyweight)',
  'plancha': 'Plank',
  'elevacion de piernas colgado': 'Hanging Leg Raise',
  'elevacion de rodillas colgado': 'Hanging Knee Raise',
  'pies a barra': 'Toes to Bar',
  'rueda abdominal': 'Ab Wheel',
  'escaladores': 'Mountain Climber',

  'correr': 'Running',
  'caminar': 'Walking',
  'cinta': 'Treadmill',
  'cinta de correr': 'Treadmill',
  'ciclismo': 'Cycling',
  'bicicleta estatica': 'Stationary Bike',
  'eliptica': 'Elliptical Trainer',
  'remo (maquina)': 'Rowing Machine',
  'salto a la cuerda': 'Jump Rope',
  'saltos de rana': 'Frog Jumps',
  'sprints': 'Sprints',
  'burpee': 'Burpee',
  'saltos de tijera': 'Jumping Jack',
  // Titles that could be more than one exercise: kept as the person's own rather than guessed.
  'triceps sentado': null,
}

// Word-level fallback for Spanish titles the table does not have: equipment in parentheses and
// common movement words. Longer phrases first, so "press de banca" goes before "press".
const ES_WORDS = [
  ['con peso anadido', 'weighted'], ['peso corporal', 'bodyweight'], ['maquina smith', 'smith machine'],
  ['maquina de discos', 'machine'], ['maquina de placas', 'machine'], ['barra ez', 'ez bar'],
  ['press de banca', 'bench press'], ['press de hombros', 'shoulder press'], ['press de pecho', 'chest press'],
  ['press de piernas', 'leg press'], ['press frances', 'skullcrusher'], ['peso muerto rumano', 'romanian deadlift'],
  ['peso muerto', 'deadlift'], ['jalon al pecho', 'lat pulldown'], ['curl de biceps', 'bicep curl'],
  ['curl martillo', 'hammer curl'], ['curl predicador', 'preacher curl'], ['curl de piernas', 'leg curl'],
  ['curl de pierna', 'leg curl'], ['extension de triceps', 'triceps extension'], ['extension de pierna', 'leg extension'],
  ['extension de espalda', 'back extension'], ['elevacion lateral', 'lateral raise'], ['elevacion frontal', 'front raise'],
  ['elevacion de gemelos', 'calf raise'], ['encogimiento de hombros', 'shrug'], ['agarre cerrado', 'close grip'],
  ['agarre ancho', 'wide grip'], ['a un brazo', 'single arm'], ['a una pierna', 'single leg'],
  ['mancuerna', 'dumbbell'], ['mancuernas', 'dumbbell'], ['barra', 'barbell'], ['maquina', 'machine'],
  ['polea', 'cable'], ['banda', 'band'], ['suspension', 'suspension'], ['sentadilla', 'squat'],
  ['zancada', 'lunge'], ['dominada', 'pull up'], ['dominadas', 'pull up'], ['fondos', 'dip'], ['remo', 'row'],
  ['inclinado', 'incline'], ['declive', 'decline'], ['sentado', 'seated'], ['de pie', 'standing'],
  ['acostado', 'lying'], ['aperturas', 'fly'], ['flexiones', 'push up'],
]

// Spelling slips seen in exports made by hand: whole words only.
const TYPOS = [[/\bdumbell?s?\b/gi, 'Dumbbell'], [/\bdumbel\b/gi, 'Dumbbell'], [/\bbarbel\b/gi, 'Barbell'], [/\bbarbelll\b/gi, 'Barbell'],
  // Italian words people mix into their own exercise names.
  [/\bseduto\b/gi, 'Seated'], [/\bin piedi\b/gi, 'Standing'], [/\bmanubri[oi]\b/gi, 'Dumbbell'], [/\bbilanciere\b/gi, 'Barbell'], [/\bcavo\b/gi, 'Cable']]

/** Hevy's English title for `title` when it is a known Spanish one, else null. */
export function hevyEnglishTitle(title) {
  return ES[fold(title)] || null
}
const has = Object.prototype.hasOwnProperty
/** True for a translated title known to be ambiguous: it is imported as a custom exercise. */
export const hevyKeepOwn = title => has.call(ES, fold(title)) && ES[fold(title)] === null

/**
 * The name the importer should match for `title`: Hevy's English title for a known translation,
 * a word-for-word English rendering of another Spanish title, or the title with its spelling
 * slips corrected. `exact` says whether it came from the table (trusted like an English title).
 */
export function englishForMatching(title) {
  const known = hevyEnglishTitle(title)
  if (known) return { name: known, exact: true }
  if (hevyKeepOwn(title)) return { name: fold(title), exact: true, keepOwn: true }
  let s = String(title || '')
  for (const [re, to] of TYPOS) s = s.replace(re, to)
  const f = fold(s)
  // Only titles that look Spanish are translated: one Spanish word is enough to tell.
  if (/\b(de|con|en|al|del|la|el|mancuerna|barra|maquina|polea|sentado|inclinado|sentadilla|remo|jalon|elevacion|extension|zancada|dominada|fondos?)\b/.test(f)) {
    let t = ' ' + f.replace(/[()]/g, ' ') + ' '
    for (const [es, en] of ES_WORDS) t = t.replace(new RegExp(' ' + es + ' ', 'g'), ' ' + en + ' ')
    t = t.replace(/ (de|del|con|en|al|la|el|y|para|los|las) /g, ' ').replace(/\s+/g, ' ').trim()
    return { name: t, exact: false }
  }
  return { name: s, exact: false }
}
