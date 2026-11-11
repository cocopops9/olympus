# The quick wake-up: flow-interpolated frames between a few key drawings, with almost no waiting at
# either end. The shipped sheet is `python short.py frames.npy 36 48 asleep,g1a,g4a,a2b,g5a,w3,g6b,b1,w4,awake`
# then `python sprite.py frames.npy ../../frontend/src/assets/chiron-wake.webp` (48 frames, 1.33 s).
# Names are those of order.json (22 drawings); paths are as on the machine that ran it.
import sys, json
import numpy as np
from scipy.interpolate import PchipInterpolator
from seq import load, flow, warp, between
out, FPS, N, names = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4].split(',')
ALL = ['asleep','w1','g1a','g1b','a1','g2a','g2b','w2','g3a','g3b','a2a','g4a','g4b','a2b','g5a','g5b','w3','g6b','g6a','b1','w4','awake']
ORDER = json.load(open('/tmp/claude-0/ch3/order.json'))
keys = [load(*ORDER[ALL.index(n)]) for n in names]
HOLD0, HOLD1 = 0.04, 0.08
flows = [(flow(keys[i], keys[i + 1]), flow(keys[i + 1], keys[i])) for i in range(len(keys) - 1)]
err = np.array([np.abs(warp(keys[i], flows[i][0], -1) - keys[i + 1]).mean() * 1000 for i in range(len(keys) - 1)])
width = np.clip(1.0 - err / 130, 0.2, 0.8)
seg = np.clip(1.25 - err / 160, 0.55, 1.15)
print('error', np.round(err).astype(int).tolist(), 'width', np.round(width, 2).tolist())
total = N / FPS
scale = (total - HOLD0 - HOLD1) / seg.sum()
times = [0.0, HOLD0]
for d in seg: times.append(times[-1] + d * scale)
times.append(total)
P = PchipInterpolator(times, [0] + list(range(len(keys))) + [len(keys) - 1])
fr = []
for k in range(N):
    p = float(P(min(k / FPS, total)))
    i = min(int(np.floor(p)), len(keys) - 2); t = p - i
    lo, hi = 0.5 - width[i] / 2, 0.5 + width[i] / 2
    fr.append(between(keys[i], keys[i + 1], flows[i][0], flows[i][1], t, lo, hi) if t > 1e-4 else keys[i])
fr[-1] = keys[-1]
np.save(out, np.stack(fr).astype(np.float16))
print('times', np.round(times, 2).tolist())
