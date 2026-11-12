# Wake-up sprite from a generated video (Wan 2.2, first and last frame = the two portraits, white
# background, 33 frames at 16 a second): every frame cut out, a frame added between each two by
# following the motion (optical flow, seq.py), so 65 frames at 32 a second, packed as COLS x ROWS
# cells of 256 px. Usage: python video_sprite.py frames_dir out.webp (frames_dir: ffmpeg -i v.mp4 %03d.png)
import glob, os, sys
import numpy as np, cv2
from PIL import Image

def matte(path, thr=234):
    # White background to alpha. Besides the background touching the border, white pockets shut in
    # by the figure (between the legs, inside a bent arm) are background too: no part of him is
    # that white over that many pixels (his coat is cream).
    rgb = np.asarray(Image.open(path).convert('RGB'))
    mn = rgb.min(axis=2)
    near = (mn >= thr).astype(np.uint8)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(near, connectivity=4)
    border = set(lab[0, :]) | set(lab[-1, :]) | set(lab[:, 0]) | set(lab[:, -1])
    keep = [l for l in range(1, n) if l in border or (stats[l, cv2.CC_STAT_AREA] >= 30 and mn[lab == l].mean() >= 242)]
    bg = np.isin(lab, keep).astype(np.float32)
    a = 1.0 - cv2.GaussianBlur(bg, (0, 0), 1.0)
    a = np.clip((a - 0.08) / 0.84, 0, 1)
    f = rgb.astype(np.float32)
    aa = np.maximum(a[..., None], 1e-3)
    c = np.clip((f - (1 - a[..., None]) * 255.0) / aa, 0, 255)
    out = np.dstack([np.where(a[..., None] > 0.02, c, f), a * 255]).astype(np.uint8)
    return Image.fromarray(out, 'RGBA')

# 384 px cells: the figure is drawn at about 150 CSS px, 400 to 450 device pixels on a phone, so
# 256 px cells were enlarged and looked soft next to the 640 px portraits.
SIZE, COLS, ROWS = 384, 9, 8
from seq import flow, between
A = '/root/olympus/frontend/src/assets/'

def premul(im, size=480):
    a = np.asarray(im.convert('RGBA').resize((size, size), Image.LANCZOS), np.float32) / 255
    a[..., :3] *= a[..., 3:]
    return a

def portrait(name, mirror):
    im = Image.open(A + name).convert('RGBA')
    return premul(im.transpose(Image.FLIP_LEFT_RIGHT) if mirror else im)

files = sorted(glob.glob(sys.argv[1] + '/*.png'))
frames = []
def clean(path):
    # The video is compressed: blocks and ringing are smoothed away first (non-local means, which
    # keeps edges), then the lines are brought back with an unsharp mask.
    bgr = cv2.cvtColor(np.asarray(Image.open(path).convert('RGB')), cv2.COLOR_RGB2BGR)
    bgr = cv2.fastNlMeansDenoisingColored(bgr, None, 3, 3, 5, 15)
    soft = cv2.GaussianBlur(bgr, (0, 0), 1.2)
    bgr = cv2.addWeighted(bgr, 1.7, soft, -0.7, 0)
    return Image.fromarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))

for f in files:
    tmp = '/tmp/_chiron_frame.png'
    # Frames restored by restore.py are already clean; the raw ones are cleaned here.
    (Image.open(f).convert('RGB') if os.environ.get('RESTORED') else clean(f)).save(tmp)
    frames.append(premul(matte(tmp)))
start, end = portrait('chiron-full-asleep.webp', True), portrait('chiron-full-awake.webp', False)
# The video starts and ends on the portraits already (same place, same size); the exact pictures
# replace its first and last frame so the app's hand-over is pixel for pixel.
frames[0], frames[-1] = start, end
full = []
for a, b in zip(frames, frames[1:]):
    full += [a, between(a, b, flow(a, b), flow(b, a), 0.5)]
frames = [cv2.resize(f, (SIZE, SIZE), interpolation=cv2.INTER_AREA) for f in full + [frames[-1]]]
n = len(frames)
sheet = np.zeros((ROWS * SIZE, COLS * SIZE, 4), np.float32)
for i, fr in enumerate(frames):
    a = fr[..., 3:]
    rgb = np.where(a > 1e-4, fr[..., :3] / np.maximum(a, 1e-4), 0)
    sheet[(i // COLS) * SIZE:(i // COLS + 1) * SIZE, (i % COLS) * SIZE:(i % COLS + 1) * SIZE] = np.concatenate([np.clip(rgb, 0, 1), a], 2)
Image.fromarray((np.clip(sheet, 0, 1) * 255 + .5).astype(np.uint8), 'RGBA').save(sys.argv[2], 'WEBP', quality=78, alpha_quality=90, method=6)
print(n, 'frames')
