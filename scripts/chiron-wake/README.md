# Chiron's wake-up

`frontend/src/assets/chiron-wake.webp` is the wake-up as a sprite sheet: 108 frames of 288 px in a
12 by 9 grid, played at 18 frames a second (6 s) by `components/ChironFigure.jsx`.

How it was made (the scripts are the ones used, with paths as they were on the machine that ran them):

1. Twenty-two drawings of the movement, from lying asleep to standing awake, were made in Canva
   (an image generated from the two neighbouring poses each time, so the style stays the same).
   Each was upscaled 4x (Real-ESRGAN, `digital-art-4x`, through ncnn) and cut out from its white
   background with `matte.py`, then scaled to 640 px and set on a common ground line.
2. `interpolate.py` follows the motion of every part between neighbouring drawings (dense optical
   flow, OpenCV DIS) and renders the 108 frames along a slow timeline: each step between drawings
   has its own duration (`SEG`), and a monotone cubic through them makes the speed change smoothly
   instead of stopping at each drawing (a first version, 64 frames in 2.7 s, was too frantic). A
   frame is the neighbouring drawing moved along the flow, the two drawings cross-fading only in
   the middle of a step. `order.json` lists the drawings (name, mirrored or not), `seq.py` has the
   loading and warping.
3. `sprite.py` packs the 108 frames into the sheet.

The drawings were made facing left, except the last two, which face right like the awake portrait;
they are mirrored in step 2 so the whole movement faces right. The drawings themselves are not
kept in the repository, only the result.
