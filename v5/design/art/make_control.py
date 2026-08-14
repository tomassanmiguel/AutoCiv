"""Render ControlNet guide images for an AutoCiv terrain tile — a flat-top isometric
hex PRISM at the locked geometry (tilt/squish 0.75, height 0.48 x radius).

    pip install pillow
    python make_control.py

Writes control_lineart.png (edges, for a canny/lineart ControlNet) and
control_depth.png (filled block, for a depth ControlNet), both 1024x1024.
Feed one into ComfyUI's ControlNet so every biome is painted onto the SAME block.
Keep SIZE/SQUISH/HEIGHT/CX/CY identical to pixelize.py.
"""
import math
from PIL import Image, ImageDraw

W = 1024
SIZE = 380            # hex radius in px
SQUISH = 0.75         # vertical tilt
HEIGHT = int(0.48 * SIZE)   # block height
CX, CY = 512, 421     # centre of the top face (chosen so the whole prism is centred)

def top_verts(cx, cy, size, squish):
    return [(cx + size * math.cos(math.radians(60 * i)),
             cy + size * math.sin(math.radians(60 * i)) * squish) for i in range(6)]

def side_quads():
    v = top_verts(CX, CY, SIZE, SQUISH)
    vp = [(x, y + HEIGHT) for (x, y) in v]
    chain = [3, 2, 1, 0]                      # left -> bottom -> right, the visible faces
    return [[v[chain[i]], v[chain[i + 1]], vp[chain[i + 1]], vp[chain[i]]] for i in range(3)]

v = top_verts(CX, CY, SIZE, SQUISH)
vp = [(x, y + HEIGHT) for (x, y) in v]

# --- lineart (white edges on black) ---
la = Image.new('RGB', (W, W), (0, 0, 0)); d = ImageDraw.Draw(la)
for i in range(6):
    d.line([v[i], v[(i + 1) % 6]], fill=(255, 255, 255), width=4)   # top hex
for k in (3, 2, 1, 0):
    d.line([v[k], vp[k]], fill=(255, 255, 255), width=4)            # vertical edges
for a, b in ((3, 2), (2, 1), (1, 0)):
    d.line([vp[a], vp[b]], fill=(255, 255, 255), width=4)           # bottom edges
la.save('control_lineart.png')

# --- depth (filled block, top brighter than sides) ---
dp = Image.new('RGB', (W, W), (0, 0, 0)); dd = ImageDraw.Draw(dp)
for q in side_quads():
    dd.polygon(q, fill=(120, 120, 120))
dd.polygon(top_verts(CX, CY, SIZE, SQUISH), fill=(205, 205, 205))
dp.save('control_depth.png')

print('wrote control_lineart.png and control_depth.png (1024x1024)')
