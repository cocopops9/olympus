# 10 poses of the wake-up, all facing right, aligned on the ground, flow-interpolated.
import cv2, numpy as np, sys
from PIL import Image, ImageOps
A = '/root/olympus/frontend/src/assets/'
L = '/tmp/claude-0/ch3/'
# (file, mirror)
POSES = [(A+'chiron-full-asleep.webp', True), (A+'chiron-wake-1.webp', True), (L+'a1-m.png', True), (A+'chiron-wake-2.webp', True),
         (L+'a2a-m.png', True), (L+'a2b-m.png', True), (A+'chiron-wake-3.webp', True), (L+'b1-m.png', True),
         (A+'chiron-wake-4.webp', False), (A+'chiron-full-awake.webp', False)]

def load(p, mirror, size=640):
    im = Image.open(p).convert('RGBA')
    if mirror: im = ImageOps.mirror(im)
    im = im.resize((size, size), Image.LANCZOS)
    a = np.asarray(im, dtype=np.float32) / 255.0
    return np.concatenate([a[..., :3] * a[..., 3:], a[..., 3:]], axis=2)

def over_bg(pm, bg=0.5):
    return pm[..., :3] + (1 - pm[..., 3:]) * bg

def gray(pm):
    return cv2.cvtColor((np.clip(over_bg(pm), 0, 1) * 255).astype(np.uint8), cv2.COLOR_RGB2GRAY)

def flow(a, b):
    d = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
    d.setVariationalRefinementIterations(10)
    d.setPatchSize(12); d.setPatchStride(4); d.setGradientDescentIterations(40)
    return d.calc(gray(a), gray(b), None)

def warp(img, fl, s):
    h, w = img.shape[:2]
    gx, gy = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
    return cv2.remap(img, gx + fl[..., 0] * s, gy + fl[..., 1] * s, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)

def between(a, b, fab, fba, t, lo=0.3, hi=0.7):
    ia = warp(a, fab, -t)
    ib = warp(b, fba, -(1 - t))
    w = np.clip((t - lo) / (hi - lo), 0, 1); w = w * w * (3 - 2 * w)
    return ia * (1 - w) + ib * w
