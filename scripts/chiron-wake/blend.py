# The restored frames (restore.py) blended with the plain upscaled ones: Real-ESRGAN's anime model
# draws crisp outlines but flattens the painted texture of the portraits (beard, cloth folds), so
# each frame is 65 % restored and 35 % the video's own frame enlarged the same way.
# Usage: python blend.py video_frames_dir restored_dir out_dir [weight]
import glob, os, sys
from PIL import Image

src, restored, dst = sys.argv[1:4]
weight = float(sys.argv[4]) if len(sys.argv) > 4 else 0.65
os.makedirs(dst, exist_ok=True)
for f in sorted(glob.glob(os.path.join(restored, '*.png'))):
    r = Image.open(f).convert('RGB')
    o = Image.open(os.path.join(src, os.path.basename(f))).convert('RGB').resize(r.size, Image.LANCZOS)
    Image.blend(o, r, weight).save(os.path.join(dst, os.path.basename(f)))
