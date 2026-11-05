# Chiron's wake-up

`frontend/src/assets/chiron-wake.webp` is the wake-up as a sprite sheet: 64 frames of 320 px in an
8 by 8 grid, played at 24 frames a second by `components/ChironFigure.jsx`.

How it was made (the scripts are the ones used, with paths as they were on the machine that ran them):

1. Twenty-two drawings of the movement, from lying asleep to standing awake, were made in Canva
   (an image generated from the two neighbouring poses each time, so the style stays the same).
   Each was upscaled 4x (Real-ESRGAN, `digital-art-4x`, through ncnn) and cut out from its white
   background with `matte.py`, then scaled to 640 px and set on a common ground line.
2. `interpolate.py` follows the motion of every part between neighbouring drawings (dense optical
   flow, OpenCV DIS) and renders three frames per step: the first drawing moved a third of the way,
   the second drawing moved a third back, and the drawing itself. Each frame comes from a single
   drawing, so no frame is two poses laid over each other. `order.json` lists the drawings
   (path, mirrored or not), `seq.py` has the loading and warping.
3. `sprite.py` packs the 64 frames into the sheet.

The drawings were made facing left, except the last two, which face right like the awake portrait;
they are mirrored in step 2 so the whole movement faces right. The drawings themselves are not
kept in the repository, only the result.
