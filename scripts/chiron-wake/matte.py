# White background to alpha: flood fill of near-white pixels from the border, soft edge, colour de-fringed.
import numpy as np, cv2
from PIL import Image

def matte(path, thr=238):
    rgb = np.asarray(Image.open(path).convert('RGB'))
    h, w, _ = rgb.shape
    near = (rgb.min(axis=2) >= thr).astype(np.uint8)
    n, lab = cv2.connectedComponents(near, connectivity=4)
    border = set(lab[0, :]) | set(lab[-1, :]) | set(lab[:, 0]) | set(lab[:, -1])
    bg = np.isin(lab, [l for l in border if l != 0]).astype(np.float32)
    # soft edge: blur the background mask a little, alpha is what is left
    a = 1.0 - cv2.GaussianBlur(bg, (0, 0), 1.1)
    a = np.clip((a - 0.08) / 0.84, 0, 1)
    a[bg == 0] = np.maximum(a[bg == 0], 0)
    # de-fringe: remove the white that bleeds into the edge pixels
    f = rgb.astype(np.float32)
    aa = np.maximum(a[..., None], 1e-3)
    c = np.clip((f - (1 - a[..., None]) * 255.0) / aa, 0, 255)
    out = np.dstack([np.where(a[..., None] > 0.02, c, f), a * 255]).astype(np.uint8)
    return Image.fromarray(out, 'RGBA')

if __name__ == '__main__':
    import sys
    matte(sys.argv[1]).save(sys.argv[2])
