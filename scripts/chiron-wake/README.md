# Chiron's wake-up

`frontend/src/assets/chiron-wake.webp` is the wake-up as a sprite sheet: 144 frames of 256 px in a
12 by 12 grid, played at 24 frames a second (6 s) by `components/ChironFigure.jsx`, on a canvas, at
every screen refresh, with the two frames around the moment blended.

How it was made (the scripts are the ones used, with paths as they were on the machine that ran them):

1. Twenty-two drawings of the movement, from lying asleep to standing awake, were made in Canva
   (an image generated from the two neighbouring poses each time, so the style stays the same).
   Each was upscaled 4x (Real-ESRGAN, `digital-art-4x`, through ncnn) and cut out from its white
   background with `matte.py`, then scaled to 640 px and set on a common ground line.
2. `interpolate.py` follows the motion of every part between neighbouring drawings (dense optical
   flow, OpenCV DIS) and renders the 144 frames along a slow timeline: each step between drawings
   has its own duration and its own cross-fade window, set from how well the flow could follow the
   motion (the error of the first drawing moved onto the second). Where an arm travels far the flow
   cannot follow it, so that step is quick and its window narrow: the double image lasts one frame
   and reads as motion blur instead of a flicker. A monotone cubic through the drawing times makes
   the speed change smoothly instead of stopping at each drawing. A frame is the neighbouring
   drawing moved along the flow, the two cross-fading only in the middle of a step. `order.json`
   lists the drawings (name, mirrored or not), `seq.py` has the loading (it also removes white
   pockets the cut-out missed, between an arm and the body) and the warping. Earlier versions
   (64 frames in 2.7 s, then 108 frames at 18 a second) were too frantic and then too jerky.
3. `sprite.py` packs the 144 frames into the sheet.

The drawings were made facing left, except the last two, which face right like the awake portrait;
they are mirrored in step 2 so the whole movement faces right. The drawings themselves are not
kept in the repository, only the result.
