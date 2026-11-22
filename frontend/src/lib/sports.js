// Sports in the exercise menu: football, basketball, swimming and so on, each tied to what it
// actually trains.
//
// A sport is logged like cardio, by minutes. It has no weight, no reps and no speed, since a
// football match has none of them. It still counts for the muscle map: every sport carries
// `muscleWeights` (0 to 1, same scale as the lifts), and the minutes played are turned into
// sets-equivalent by `setsEquivalent`, so ninety minutes of football moves the legs more than
// thirty minutes of table tennis.
//
// The weights are an estimate, not a measurement. They come from where the movement of the sport
// is: running and kicking load the legs, swimming loads the back and shoulders, and so on. They
// are meant to put the sport on the right map and the right order of magnitude, nothing finer.
// The `trains` list says it in plain words, for the exercise sheet.
//
// Names are lower case English like the rest of the catalogue and go through t() when shown
// (exerciseNameFor in i18n-core.js), so each one has a line in every language pack.

/** One set of a sport stands for this many minutes of play, for the muscle map. */
export const SPORT_MINUTES_PER_SET = 10

/** The qualities a sport can train, as shown on the exercise sheet. Keys are the English labels. */
export const QUALITIES = [
  'Endurance', 'Speed', 'Power', 'Agility', 'Coordination', 'Balance',
  'Reaction time', 'Grip strength', 'Core stability', 'Mobility',
]

const SPORT_LIST = [
  {
    id: 'sport-football', n: 'football (soccer)', icon: 'figureRun', min: 60,
    trains: ['Endurance', 'Speed', 'Agility', 'Coordination'],
    muscleWeights: { quadriceps: 0.9, hamstring: 0.8, gluteal: 0.7, calves: 0.8, adductors: 0.6, 'hip-flexors': 0.5, abs: 0.3, 'lower-back': 0.2 },
  },
  {
    id: 'sport-basketball', n: 'basketball', icon: 'figureRun', min: 45,
    trains: ['Endurance', 'Power', 'Agility', 'Coordination'],
    muscleWeights: { quadriceps: 0.8, calves: 0.9, gluteal: 0.7, hamstring: 0.5, deltoids: 0.4, triceps: 0.3, forearm: 0.3, abs: 0.3 },
  },
  {
    id: 'sport-swimming', n: 'swimming', icon: 'swim', min: 30,
    trains: ['Endurance', 'Core stability', 'Mobility', 'Coordination'],
    muscleWeights: { 'upper-back': 0.9, deltoids: 0.9, chest: 0.6, triceps: 0.5, abs: 0.5, gluteal: 0.4, quadriceps: 0.4, hamstring: 0.3, calves: 0.3, biceps: 0.3 },
  },
  {
    id: 'sport-tennis', n: 'tennis', icon: 'figureRun', min: 60,
    trains: ['Agility', 'Reaction time', 'Endurance', 'Coordination'],
    muscleWeights: { quadriceps: 0.6, calves: 0.6, gluteal: 0.5, obliques: 0.6, deltoids: 0.6, forearm: 0.6, chest: 0.3, 'upper-back': 0.3, abs: 0.3 },
  },
  {
    id: 'sport-padel', n: 'padel', icon: 'figureRun', min: 60,
    trains: ['Agility', 'Reaction time', 'Endurance', 'Coordination'],
    muscleWeights: { quadriceps: 0.6, calves: 0.5, gluteal: 0.5, obliques: 0.5, deltoids: 0.5, forearm: 0.5, chest: 0.3, abs: 0.3 },
  },
  {
    id: 'sport-volleyball', n: 'volleyball', icon: 'figureRun', min: 60,
    trains: ['Power', 'Reaction time', 'Agility', 'Coordination'],
    muscleWeights: { quadriceps: 0.7, calves: 0.8, gluteal: 0.6, deltoids: 0.7, triceps: 0.4, chest: 0.3, abs: 0.4, 'upper-back': 0.3 },
  },
  {
    id: 'sport-rugby', n: 'rugby', icon: 'figureStrength', min: 60,
    trains: ['Power', 'Endurance', 'Speed', 'Grip strength'],
    muscleWeights: { quadriceps: 0.8, gluteal: 0.8, hamstring: 0.7, calves: 0.5, trapezius: 0.7, 'upper-back': 0.6, chest: 0.5, deltoids: 0.5, forearm: 0.5, abs: 0.5, neck: 0.4 },
  },
  {
    id: 'sport-handball', n: 'handball', icon: 'figureRun', min: 60,
    trains: ['Power', 'Speed', 'Agility', 'Coordination'],
    muscleWeights: { quadriceps: 0.7, calves: 0.6, gluteal: 0.6, deltoids: 0.7, triceps: 0.5, chest: 0.4, obliques: 0.4, abs: 0.4, forearm: 0.4 },
  },
  {
    id: 'sport-badminton', n: 'badminton', icon: 'figureRun', min: 45,
    trains: ['Reaction time', 'Agility', 'Speed', 'Coordination'],
    muscleWeights: { quadriceps: 0.6, calves: 0.7, gluteal: 0.4, 'hip-flexors': 0.4, deltoids: 0.5, forearm: 0.5, triceps: 0.3, abs: 0.2 },
  },
  {
    id: 'sport-table-tennis', n: 'table tennis', icon: 'figureStrength', min: 30,
    trains: ['Reaction time', 'Coordination', 'Agility'],
    muscleWeights: { forearm: 0.4, deltoids: 0.3, calves: 0.3, quadriceps: 0.3, obliques: 0.2 },
  },
  {
    id: 'sport-climbing', n: 'rock climbing', icon: 'pullup', min: 60,
    trains: ['Grip strength', 'Core stability', 'Mobility', 'Balance'],
    muscleWeights: { forearm: 1, 'upper-back': 0.9, biceps: 0.7, deltoids: 0.6, abs: 0.6, quadriceps: 0.5, gluteal: 0.4, 'hip-flexors': 0.4, calves: 0.3, trapezius: 0.3 },
  },
  {
    id: 'sport-hiking', n: 'hiking', icon: 'steps', min: 120,
    trains: ['Endurance', 'Balance'],
    muscleWeights: { quadriceps: 0.7, gluteal: 0.7, calves: 0.7, hamstring: 0.5, 'hip-flexors': 0.3, tibialis: 0.3, 'lower-back': 0.2 },
  },
  {
    id: 'sport-skiing', n: 'skiing', icon: 'figureRun', min: 90,
    trains: ['Balance', 'Endurance', 'Power', 'Core stability'],
    muscleWeights: { quadriceps: 1, gluteal: 0.7, hamstring: 0.6, calves: 0.4, adductors: 0.5, abs: 0.5, obliques: 0.4, 'lower-back': 0.4 },
  },
]

// A drill that is itself a catalogue exercise (a hangboard hang, a wall sit, a step-up) shows that
// exercise's drawing (the value is its catalogue id): same artist and style as every other
// exercise, and a real animation. Only an exact match counts: a sport, or a drill done with the
// sport's ball or racket, keeps a drawing of its own that shows the sport (sport-media.js), since
// a look-alike exercise (a medicine-ball throw for a handball shot) does not show the sport.
export const CATALOGUE_DRAWING = {
  'drill-climbing-hangboard': '3832', // handboard slope hang
  'drill-climbing-lock-off': '3835', // handboard hang with 90 degree elbow
  'drill-hiking-step-up': '4579', // bodyweight step up on stepbox
  'drill-hiking-lunge': '9700', // bodyweight walking low lunge
  'drill-skiing-wall-sit': '7557', // wall sit (narrow stance)
  'drill-skiing-squat-jump': '3222', // semi squat jump
}

const primariesOf = w => Object.keys(w).filter(k => w[k] >= 0.6)
const secondariesOf = w => Object.keys(w).filter(k => w[k] > 0 && w[k] < 0.6)

/**
 * The sports as catalogue entries: cardio mode (minutes), a category of their own, and a drawing
 * each: the catalogue's own (`media`, see CATALOGUE_DRAWING) or else an original one (`img` and
 * `gif` only mark that there is one; the files are found by id in sport-media.js, made by
 * scripts/sports-media).
 */
export const SPORTS = SPORT_LIST.map(s => ({
  id: s.id,
  n: s.n,
  bp: 'cardio',
  eq: 'body weight',
  tg: 'cardiovascular system',
  sm: [],
  cat: 'sport',
  sport: true,
  media: CATALOGUE_DRAWING[s.id] || null,
  img: s.id + '.webp',
  gif: s.id + '.mp4',
  icon: s.icon,
  min: s.min,
  trains: s.trains,
  muscleWeights: s.muscleWeights,
  primaries: primariesOf(s.muscleWeights),
  secondaries: secondariesOf(s.muscleWeights),
}))

// The drills: how each sport is trained, two for each, with an original animation of their own
// (scripts/sports-media/drills.mjs). They are catalogue entries of the same kind as the sports
// (logged in minutes, category "sport"), each tied to its sport by `drillOf` and described by
// `desc`, one or two plain sentences on how it is done (a t() string like the name). They are
// common coaching drills, chosen because each trains a skill or quality the sport depends on and
// can be shown by one figure seen from the side; the weights follow the same reasoning as the
// sports' own, from where the movement of the drill is.
const DRILL_LIST = [
  {
    id: 'drill-football-cone-dribble', of: 'sport-football', n: 'football cone dribbling', min: 15,
    desc: 'Weave through a line of cones with small touches, the ball always close to your feet. Use both feet and both the inside and the outside of the foot, and look up between touches.',
    trains: ['Agility', 'Coordination', 'Speed'],
    muscleWeights: { quadriceps: 0.7, calves: 0.7, adductors: 0.6, hamstring: 0.5, 'hip-flexors': 0.5, gluteal: 0.5, abs: 0.3 },
  },
  {
    id: 'drill-football-wall-pass', of: 'sport-football', n: 'football wall passes', min: 15,
    desc: 'Pass the ball against a wall with the inside of the foot, the standing foot beside the ball, then control the rebound with one touch. Switch feet every ten passes.',
    trains: ['Coordination', 'Reaction time'],
    muscleWeights: { adductors: 0.6, quadriceps: 0.6, 'hip-flexors': 0.5, calves: 0.4, hamstring: 0.3, abs: 0.3 },
  },
  {
    id: 'drill-basketball-dribble', of: 'sport-basketball', n: 'basketball stationary dribbling', min: 10,
    desc: 'In a low stance, pound the ball hard at hip height with the fingertips, not the palm, and keep your eyes up. Do 30 seconds with each hand, then crossovers.',
    trains: ['Coordination', 'Reaction time'],
    muscleWeights: { forearm: 0.7, deltoids: 0.5, quadriceps: 0.5, triceps: 0.4, gluteal: 0.4, calves: 0.3, abs: 0.3 },
  },
  {
    id: 'drill-basketball-form-shooting', of: 'sport-basketball', n: 'basketball form shooting', min: 15,
    desc: 'Close to the basket, shoot with one hand: elbow under the ball, legs and arm extend together, and hold the follow-through with the wrist relaxed. Step back only when most shots go in.',
    trains: ['Coordination'],
    muscleWeights: { deltoids: 0.6, triceps: 0.5, forearm: 0.5, calves: 0.5, quadriceps: 0.4, gluteal: 0.3 },
  },
  {
    id: 'drill-swimming-kickboard', of: 'sport-swimming', n: 'swimming kickboard flutter kick', min: 10,
    desc: 'Hold a kickboard with straight arms and kick from the hips with nearly straight legs and loose ankles: small, quick kicks that barely break the surface.',
    trains: ['Endurance', 'Core stability'],
    muscleWeights: { quadriceps: 0.7, 'hip-flexors': 0.7, gluteal: 0.6, hamstring: 0.5, calves: 0.4, abs: 0.4, 'lower-back': 0.3 },
  },
  {
    id: 'drill-swimming-pull-buoy', of: 'sport-swimming', n: 'swimming pull buoy freestyle', min: 15,
    desc: 'Swim freestyle with a pull buoy between the thighs and the legs still, so the arms do all the work: reach long, catch the water early, pull back to the hip.',
    trains: ['Endurance', 'Coordination'],
    muscleWeights: { 'upper-back': 0.9, deltoids: 0.9, triceps: 0.6, chest: 0.5, abs: 0.4, biceps: 0.3 },
  },
  {
    id: 'drill-tennis-split-step', of: 'sport-tennis', n: 'tennis split step', min: 10,
    desc: 'As the other player hits, make a small hop and land on the balls of the feet, a little wider than the hips, then push off at once into the first step toward the ball.',
    trains: ['Reaction time', 'Agility', 'Speed'],
    muscleWeights: { calves: 0.8, quadriceps: 0.7, gluteal: 0.6, adductors: 0.5, hamstring: 0.4 },
  },
  {
    id: 'drill-tennis-wall-rally', of: 'sport-tennis', n: 'tennis wall rally', min: 15,
    desc: 'Hit forehands against a wall: turn the shoulders early, meet the ball in front of the body, finish over the shoulder, and get back to the ready position before the rebound.',
    trains: ['Coordination', 'Reaction time'],
    muscleWeights: { obliques: 0.6, deltoids: 0.6, forearm: 0.6, chest: 0.4, quadriceps: 0.4, calves: 0.4 },
  },
  {
    id: 'drill-padel-volley', of: 'sport-padel', n: 'padel net volleys', min: 15,
    desc: 'Close to the net with the racket up in front, block the ball with a short punch and no backswing, and split step between hits.',
    trains: ['Reaction time', 'Coordination'],
    muscleWeights: { forearm: 0.6, deltoids: 0.6, quadriceps: 0.5, calves: 0.5, obliques: 0.3 },
  },
  {
    id: 'drill-padel-bandeja', of: 'sport-padel', n: 'padel bandeja', min: 15,
    desc: 'Side on, the racket up beside the head, hit the ball at head height with a forward slicing swing, so it stays low and lets you keep the net.',
    trains: ['Coordination', 'Power'],
    muscleWeights: { deltoids: 0.7, obliques: 0.6, forearm: 0.5, triceps: 0.4, quadriceps: 0.4, chest: 0.3 },
  },
  {
    id: 'drill-volleyball-forearm-pass', of: 'sport-volleyball', n: 'volleyball forearm passing', min: 10,
    desc: 'Join the hands and lock the arms into a flat platform, bend the knees, and send the ball up with the legs rather than a swing of the arms. Keep it going above your head.',
    trains: ['Coordination', 'Reaction time'],
    muscleWeights: { quadriceps: 0.7, gluteal: 0.5, calves: 0.5, deltoids: 0.4, abs: 0.4 },
  },
  {
    id: 'drill-volleyball-setting', of: 'sport-volleyball', n: 'volleyball overhead setting', min: 10,
    desc: 'Hands above the forehead in a window shape, touch the ball with the fingertips only, and push it up with the legs and arms together. Keep it going above your head.',
    trains: ['Coordination'],
    muscleWeights: { deltoids: 0.6, triceps: 0.6, forearm: 0.5, quadriceps: 0.5, calves: 0.4 },
  },
  {
    id: 'drill-rugby-tackle-bag', of: 'sport-rugby', n: 'rugby tackle bag', min: 10,
    desc: 'Come in low with short steps, head to the side of the bag, hit it with the shoulder, wrap both arms and keep driving with the legs.',
    trains: ['Power', 'Core stability'],
    muscleWeights: { quadriceps: 0.8, gluteal: 0.8, trapezius: 0.7, neck: 0.6, hamstring: 0.5, deltoids: 0.5, chest: 0.5, 'upper-back': 0.5, abs: 0.5 },
  },
  {
    id: 'drill-rugby-ground-pass', of: 'sport-rugby', n: 'rugby pass from the ground', min: 10,
    desc: 'Feet either side of the ball and low, sweep it off the ground toward the target in one move, without lifting it first, and follow through with the hands.',
    trains: ['Power', 'Coordination'],
    muscleWeights: { obliques: 0.7, quadriceps: 0.6, gluteal: 0.6, deltoids: 0.5, triceps: 0.4, hamstring: 0.4, 'lower-back': 0.4 },
  },
  {
    id: 'drill-handball-wall-throw', of: 'sport-handball', n: 'handball wall throws', min: 10,
    desc: 'Step in with the opposite leg, bring the elbow up to shoulder height, and whip the ball at the wall with the trunk turning first, then catch the rebound.',
    trains: ['Power', 'Coordination'],
    muscleWeights: { deltoids: 0.8, triceps: 0.6, obliques: 0.6, chest: 0.5, 'upper-back': 0.4, forearm: 0.4, quadriceps: 0.3 },
  },
  {
    id: 'drill-handball-defense-step', of: 'sport-handball', n: 'handball defensive step-out', min: 10,
    desc: 'From the six-metre line, step out fast toward the shooter with the arms up, then shuffle back to the line. Stay low and never cross the feet.',
    trains: ['Agility', 'Speed'],
    muscleWeights: { quadriceps: 0.8, calves: 0.7, gluteal: 0.6, adductors: 0.5, deltoids: 0.3 },
  },
  {
    id: 'drill-badminton-net-lunge', of: 'sport-badminton', n: 'badminton net lunge', min: 10,
    desc: 'From the centre of the court, step forward and lunge to the net on the racket leg, heel first, racket up in front, then push back to the centre.',
    trains: ['Agility', 'Speed', 'Balance'],
    muscleWeights: { quadriceps: 0.9, gluteal: 0.7, adductors: 0.6, calves: 0.6, hamstring: 0.4, forearm: 0.3 },
  },
  {
    id: 'drill-badminton-high-serve', of: 'sport-badminton', n: 'badminton high serve', min: 10,
    desc: 'Drop the shuttle in front of you and swing the racket from low to high, so the shuttle goes high and deep, and finish over the opposite shoulder.',
    trains: ['Coordination'],
    muscleWeights: { deltoids: 0.6, forearm: 0.6, obliques: 0.5, chest: 0.3 },
  },
  {
    id: 'drill-table-tennis-serve', of: 'sport-table-tennis', n: 'table tennis serve practice', min: 10,
    desc: 'Toss the ball from an open palm at least 16 cm straight up, behind the end line, and hit it as it falls. Vary spin and length.',
    trains: ['Coordination'],
    muscleWeights: { forearm: 0.6, deltoids: 0.4, obliques: 0.3, calves: 0.3 },
  },
  {
    id: 'drill-table-tennis-multiball', of: 'sport-table-tennis', n: 'table tennis multiball forehand', min: 10,
    desc: 'A partner feeds balls quickly one after another; play a short forehand from the hip to the forehead and return to the ready position after every ball.',
    trains: ['Reaction time', 'Coordination'],
    muscleWeights: { forearm: 0.6, deltoids: 0.5, obliques: 0.4, quadriceps: 0.4, calves: 0.4 },
  },
  {
    id: 'drill-climbing-hangboard', of: 'sport-climbing', n: 'climbing hangboard repeaters', min: 10,
    desc: 'Hang from an edge with open hands and active shoulders for 7 seconds, rest 3, and repeat six times. Start on a big edge; this loads the fingers, so build up slowly.',
    trains: ['Grip strength'],
    muscleWeights: { forearm: 1, 'upper-back': 0.6, biceps: 0.4, deltoids: 0.3 },
  },
  {
    id: 'drill-climbing-lock-off', of: 'sport-climbing', n: 'climbing lock-off pull-ups', min: 10,
    desc: 'Pull up, hold for 3 to 5 seconds with the chin over the bar and again with the elbows at a right angle, then lower slowly.',
    trains: ['Grip strength', 'Core stability'],
    muscleWeights: { 'upper-back': 0.9, biceps: 0.9, forearm: 0.7, deltoids: 0.5, abs: 0.4 },
  },
  {
    id: 'drill-hiking-step-up', of: 'sport-hiking', n: 'hiking step-ups with a pack', min: 15,
    desc: 'With a loaded backpack, step onto a box or a step with the whole foot, push through the heel to stand tall, and step down under control. Switch the leading leg.',
    trains: ['Endurance', 'Balance'],
    muscleWeights: { quadriceps: 0.9, gluteal: 0.8, hamstring: 0.4, calves: 0.4, abs: 0.3 },
  },
  {
    id: 'drill-hiking-lunge', of: 'sport-hiking', n: 'hiking walking lunges with a pack', min: 10,
    desc: 'With a backpack on, take long steps and lower the back knee close to the floor, the front knee over the foot, then push into the next step.',
    trains: ['Balance', 'Endurance'],
    muscleWeights: { quadriceps: 0.8, gluteal: 0.8, hamstring: 0.5, adductors: 0.4, calves: 0.3 },
  },
  {
    id: 'drill-skiing-wall-sit', of: 'sport-skiing', n: 'skiing wall sit', min: 5,
    desc: 'Back flat against a wall, slide down until the thighs are almost level, knees over the ankles, and hold 30 to 60 seconds. Rest and repeat.',
    trains: ['Endurance'],
    muscleWeights: { quadriceps: 1, gluteal: 0.5, adductors: 0.3, calves: 0.2 },
  },
  {
    id: 'drill-skiing-squat-jump', of: 'sport-skiing', n: 'skiing squat jumps', min: 10,
    desc: 'Sit back into a squat, jump straight up, and land softly with bent knees straight into the next squat. Keep the knees in line with the feet.',
    trains: ['Power', 'Balance'],
    muscleWeights: { quadriceps: 0.9, gluteal: 0.7, calves: 0.6, hamstring: 0.4, abs: 0.3 },
  },
]

/**
 * The drills as catalogue entries, like the sports (cardio mode, category "sport", a drawing
 * each), plus `drillOf` (the sport's id) and `desc`.
 */
export const DRILLS = DRILL_LIST.map(d => ({
  id: d.id,
  n: d.n,
  bp: 'cardio',
  eq: 'body weight',
  tg: 'cardiovascular system',
  sm: [],
  cat: 'sport',
  sport: true,
  drillOf: d.of,
  desc: d.desc,
  media: CATALOGUE_DRAWING[d.id] || null,
  img: d.id + '.webp',
  gif: d.id + '.mp4',
  icon: SPORT_LIST.find(s => s.id === d.of).icon,
  min: d.min,
  trains: d.trains,
  muscleWeights: d.muscleWeights,
  primaries: primariesOf(d.muscleWeights),
  secondaries: secondariesOf(d.muscleWeights),
}))

/** The drills of a sport (its id), in their order; [] for anything else. */
export const drillsOf = sportId => DRILLS.filter(d => d.drillOf === sportId)

/** Whether an exercise (or its id) is one of the sports. */
export const isSportEx = ex => !!ex && typeof ex === 'object' && ex.cat === 'sport'

/** Minutes of a sport's done sets, as the number of sets they count for on the muscle map. */
export const setsEquivalent = minutes => Math.max(0, Number(minutes) || 0) / SPORT_MINUTES_PER_SET
