import numpy as np, cv2, sys, json
from seq import *
A = '/root/olympus/frontend/src/assets/'
L = '/tmp/claude-0/ch3/'
ORDER = json.load(open('/tmp/claude-0/ch3/order.json'))
keys = [load(p, m) for p, m in ORDER]
per = int(sys.argv[1]) if len(sys.argv) > 1 else 3
fr, seg = [], []
for i in range(len(keys) - 1):
    a, b = keys[i], keys[i + 1]
    fab, fba = flow(a, b), flow(b, a)
    for k in range(per):
        fr.append(between(a, b, fab, fba, k / per)); seg.append(i)
fr.append(keys[-1]); seg.append(len(keys) - 1)
np.save('/tmp/claude-0/ch3/frames.npy', np.stack(fr).astype(np.float16))
json.dump(seg, open('/tmp/claude-0/ch3/seg.json', 'w'))
print(len(fr))
