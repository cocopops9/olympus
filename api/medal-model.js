// Olympus: the personal medal targets, worked out on the server (POST /api/medals/targets).
//
// The app sends, for each exercise it has calibrated (frontend lib/athlete-profile.js), the
// athlete's sex, age, body weight and starting z score; the answer is the gain of z the median
// lifter of that profile made after 6, 16, 40, 80 and 156 weeks, read from a model fitted to
// OpenPowerlifting meet histories (scripts/medal-model/train.py, data in medal-model-data.js).
// The app turns those gains into its bronze to Olympian targets. Only squat, bench press and
// deadlift are measured; every other exercise asks for the lift closest to it (`lift`).
//
// The answer is a lookup with linear interpolation between grid points, clamped to the grid:
// a profile outside what the data covers gets the nearest edge, never an extrapolation.
import { MEDAL_MODEL } from './medal-model-data.js';

export const MODEL_LIFTS = MEDAL_MODEL.axes.lift;
export const MODEL_WEEKS = MEDAL_MODEL.axes.weeks;
const MAX_ITEMS = 40;

/** Where `x` falls on `axis`: [index below, weight of the one above]. */
function locate(axis, x) {
  if (!(x > axis[0])) return [0, 0];
  if (x >= axis[axis.length - 1]) return [axis.length - 2, 1];
  let i = 0;
  while (axis[i + 1] < x) i++;
  return [i, (x - axis[i]) / (axis[i + 1] - axis[i])];
}

/**
 * The median gains of z at MODEL_WEEKS for one profile: { sex: 'male' | 'female', lift: 'squat' |
 * 'bench' | 'deadlift', age, bwRatio (body weight / 80 kg for men, / 62 kg for women), z0 }.
 * null when the profile is not one the model reads.
 */
export function medalGains({ sex, lift, age, bwRatio, z0 }) {
  const s = sex === 'female' ? 1 : sex === 'male' ? 0 : -1;
  const l = MODEL_LIFTS.indexOf(lift);
  if (s < 0 || l < 0 || !Number.isFinite(age) || !Number.isFinite(bwRatio) || !Number.isFinite(z0)) return null;
  const { age: A, bwRatio: B, z0: Z } = MEDAL_MODEL.axes;
  const [ia, fa] = locate(A, age), [ib, fb] = locate(B, bwRatio), [iz, fz] = locate(Z, z0);
  const cube = MEDAL_MODEL.gain[s][l];
  const out = MODEL_WEEKS.map(() => 0);
  for (const [da, wa] of [[0, 1 - fa], [1, fa]]) for (const [db, wb] of [[0, 1 - fb], [1, fb]]) for (const [dz, wz] of [[0, 1 - fz], [1, fz]]) {
    const w = wa * wb * wz;
    if (!w) continue;
    const g = cube[ia + da][ib + db][iz + dz];
    for (let h = 0; h < out.length; h++) out[h] += w * g[h];
  }
  return out.map(v => Math.round(v * 1000) / 1000);
}

/** The route's work: { items: [{ key, ...profile }] } to { weeks, gains: { key: [...] } }. */
export function handleMedalTargets(body) {
  const items = (Array.isArray(body?.items) ? body.items : []).slice(0, MAX_ITEMS);
  const gains = {};
  for (const it of items) {
    const key = String(it?.key ?? '').slice(0, 40);
    if (!key) continue;
    const g = medalGains({ sex: it.sex, lift: it.lift, age: Number(it.age), bwRatio: Number(it.bwRatio), z0: Number(it.z0) });
    if (g) gains[key] = g;
  }
  return { weeks: MODEL_WEEKS, gains };
}
