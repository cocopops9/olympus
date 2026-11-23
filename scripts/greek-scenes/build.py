"""Prepare the workout calendar's month scenes (components/GreekMonth.jsx).

The sources in scripts/greek-scenes/src/<art>.webp are 1344 x 576 black-figure friezes from the
Z-Image Turbo model (prompts in prompts.md). Each is cropped to the frieze (the model paints a
dark vase rim above and below it) and scaled to 960 px wide, enough for a 2x phone screen
(the banner is at most ~480 css px wide), as WebP at quality 70.

    python3 scripts/greek-scenes/build.py
"""
from pathlib import Path
from PIL import Image

HERE = Path(__file__).parent
OUT = HERE.parent.parent / 'frontend' / 'src' / 'assets' / 'greek-months'
TOP, BOTTOM = 22, 556  # rows of the 576 px source that hold the frieze and its key borders
WIDTH = 960

OUT.mkdir(parents=True, exist_ok=True)
for src in sorted((HERE / 'src').glob('*.webp')):
    im = Image.open(src).convert('RGB')
    w, h = im.size
    im = im.crop((0, round(TOP * h / 576), w, round(BOTTOM * h / 576)))
    im = im.resize((WIDTH, round(im.height * WIDTH / w)), Image.LANCZOS)
    dst = OUT / src.name
    im.save(dst, 'WEBP', quality=70, method=6)
    print(dst.name, im.size, dst.stat().st_size // 1024, 'KB')
