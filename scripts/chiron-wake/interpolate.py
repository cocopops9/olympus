# Slow, even timeline: the drawings are reached at the times in SEG (seconds per step), with a
# monotone cubic through them, so the speed changes smoothly instead of stopping at each drawing.
import numpy as np, json, sys
from scipy.interpolate import PchipInterpolator
from seq import *
ORDER = json.load(open('/tmp/claude-0/ch3/order.json'))
keys = [load(p, m) for p, m in ORDER]
SEG = [0.30,0.28,0.26,0.22,0.26,0.26,0.26,0.32,0.26,0.18,0.26,0.22,0.18,0.26,0.26,0.22,0.32,0.22,0.22,0.26,0.26]
assert len(SEG) == len(keys) - 1
HOLD0, HOLD1 = 0.35, 0.35
FPS = int(sys.argv[1]) if len(sys.argv) > 1 else 18
N = int(sys.argv[2]) if len(sys.argv) > 2 else 108
lo, hi = (float(sys.argv[3]), float(sys.argv[4])) if len(sys.argv) > 4 else (0.2, 0.8)
move = sum(SEG)
total = N / FPS
scale = (total - HOLD0 - HOLD1) / move
times = [0.0, HOLD0]
for d in SEG: times.append(times[-1] + d * scale)
times.append(total)
idx = [0] + list(range(len(keys))) + [len(keys) - 1]
P = PchipInterpolator(times, idx)
flows = [(flow(keys[i], keys[i + 1]), flow(keys[i + 1], keys[i])) for i in range(len(keys) - 1)]
fr = []
for k in range(N):
    p = float(P(min(k / FPS, total)))
    i = min(int(np.floor(p)), len(keys) - 2); t = p - i
    fr.append(between(keys[i], keys[i + 1], flows[i][0], flows[i][1], t, lo, hi) if t > 1e-4 else keys[i])
fr[-1] = keys[-1]
np.save('/tmp/claude-0/ch3/frames2.npy', np.stack(fr).astype(np.float16))
print('seconds at which each drawing is reached:', {i: round(t, 2) for i, t in zip(range(len(keys)), times[1:-1])})
json.dump({'fps': FPS, 'frames': N, 'times': times}, open('/tmp/claude-0/ch3/timeline.json', 'w'))
