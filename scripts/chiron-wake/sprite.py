# Packs the interpolated frames (frames.npy, premultiplied RGBA at 640 px) into the sprite sheet
# the app plays: 64 frames of 320 px, 8 by 8, as lossy WebP with alpha.
import sys
import numpy as np
import cv2
from PIL import Image

SIZE, COLS, ROWS = 320, 8, 8

def main(frames_path, out_path):
    frames = np.load(frames_path).astype(np.float32)
    if len(frames) != COLS * ROWS:
        raise SystemExit('expected %d frames, got %d' % (COLS * ROWS, len(frames)))
    sheet = np.zeros((ROWS * SIZE, COLS * SIZE, 4), np.float32)
    for i, f in enumerate(frames):
        small = cv2.resize(f, (SIZE, SIZE), interpolation=cv2.INTER_AREA)  # premultiplied: area average is right
        a = small[..., 3:]
        rgb = np.where(a > 1e-4, small[..., :3] / np.maximum(a, 1e-4), 0)
        sheet[(i // COLS) * SIZE:(i // COLS + 1) * SIZE, (i % COLS) * SIZE:(i % COLS + 1) * SIZE] = np.concatenate([np.clip(rgb, 0, 1), a], axis=2)
    Image.fromarray((np.clip(sheet, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA').save(out_path, 'WEBP', quality=80, alpha_quality=90, method=6)

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
