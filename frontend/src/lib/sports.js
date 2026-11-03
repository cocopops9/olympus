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

const primariesOf = w => Object.keys(w).filter(k => w[k] >= 0.6)
const secondariesOf = w => Object.keys(w).filter(k => w[k] > 0 && w[k] < 0.6)

/** The sports as catalogue entries: cardio mode (minutes), no picture, a category of their own. */
export const SPORTS = SPORT_LIST.map(s => ({
  id: s.id,
  n: s.n,
  bp: 'cardio',
  eq: 'body weight',
  tg: 'cardiovascular system',
  sm: [],
  cat: 'sport',
  sport: true,
  icon: s.icon,
  min: s.min,
  trains: s.trains,
  muscleWeights: s.muscleWeights,
  primaries: primariesOf(s.muscleWeights),
  secondaries: secondariesOf(s.muscleWeights),
}))

/** Whether an exercise (or its id) is one of the sports. */
export const isSportEx = ex => !!ex && typeof ex === 'object' && ex.cat === 'sport'

/** Minutes of a sport's done sets, as the number of sets they count for on the muscle map. */
export const setsEquivalent = minutes => Math.max(0, Number(minutes) || 0) / SPORT_MINUTES_PER_SET
