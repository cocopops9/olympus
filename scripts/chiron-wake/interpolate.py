# Wake-up frames, 24 a second. Each step between two drawings gets its time and its cross-fade
# window from how well the motion could be followed: where the computer follows it well the step
# is slow with a wide window (a clean move), where an arm travels far it is quick with a narrow
# window, so a double image lasts a single frame and reads as motion blur, not as a flicker.
import numpy as np, json, sys
from scipy.interpolate import PchipInterpolator
from seq import *
ORDER = json.load(open('/tmp/claude-0/ch3/order.json'))
keys = [load(p, m) for p, m in ORDER]
SEG = [0.30,0.28,0.26,0.22,0.26,0.26,0.26,0.32,0.26,0.18,0.26,0.22,0.18,0.26,0.26,0.22,0.32,0.22,0.22,0.26,0.26]
FPS = int(sys.argv[1]) if len(sys.argv) > 1 else 24
N = int(sys.argv[2]) if len(sys.argv) > 2 else 144
HOLD0, HOLD1 = 0.35, 0.35
flows = [(flow(keys[i], keys[i + 1]), flow(keys[i + 1], keys[i])) for i in range(len(keys) - 1)]
err = np.array([np.abs(warp(keys[i], flows[i][0], -1) - keys[i + 1]).mean() * 1000 for i in range(len(keys) - 1)])
width = np.clip(1.0 - err / 130, 0.2, 0.8)
fac = np.clip(1.25 - err / 160, 0.55, 1.15)
seg = np.array(SEG) * fac
print('error', np.round(err).astype(int).tolist()); print('width', np.round(width, 2).tolist()); print('time factor', np.round(fac, 2).tolist())
total = N / FPS
scale = (total - HOLD0 - HOLD1) / seg.sum()
times = [0.0, HOLD0]
for d in seg: times.append(times[-1] + d * scale)
times.append(total)
idx = [0] + list(range(len(keys))) + [len(keys) - 1]
P = PchipInterpolator(times, idx)
fr = []
for k in range(N):
    p = float(P(min(k / FPS, total)))
    i = min(int(np.floor(p)), len(keys) - 2); t = p - i
    lo, hi = 0.5 - width[i] / 2, 0.5 + width[i] / 2
    fr.append(between(keys[i], keys[i + 1], flows[i][0], flows[i][1], t, lo, hi) if t > 1e-4 else keys[i])
fr[-1] = keys[-1]
np.save('/tmp/claude-0/ch3/frames3.npy', np.stack(fr).astype(np.float16))
json.dump({'fps': FPS, 'frames': N, 'times': times}, open('/tmp/claude-0/ch3/timeline3.json', 'w'))
print({i: round(t, 2) for i, t in zip(range(len(keys)), times[1:-1])})
