"""Turn a 1024x1024 generated tile into a crunchy transparent pixel-art asset.

    pip install pillow
    python pixelize.py my_tile_1024.png plains.png

Steps: mask to the hex-prism silhouette (transparent outside) -> crop -> downscale
to TARGET_PX -> quantize to a tight palette (no dither = crisp pixels) -> save.
The game upscales the little PNG nearest-neighbour. Geometry MUST match make_control.py.
For heavier background removal instead of the geometric mask: pip install rembg.
"""
import sys, math
from PIL import Image, ImageDraw

TARGET_PX = 96        # output height in pixels (bump up for chunkier detail, down for crunchier)
COLORS = 32           # palette size

# --- keep identical to make_control.py ---
SIZE = 380
SQUISH = 0.75
HEIGHT = int(0.48 * SIZE)
CX, CY = 512, 421

def top_verts(cx, cy, size, squish):
    return [(cx + size * math.cos(math.radians(60 * i)),
             cy + size * math.sin(math.radians(60 * i)) * squish) for i in range(6)]

def prism_outline():
    v = top_verts(CX, CY, SIZE, SQUISH)
    vp = [(x, y + HEIGHT) for (x, y) in v]
    # top boundary v3->v4->v5->v0, then bottom boundary v0'->v1'->v2'->v3'
    return [v[3], v[4], v[5], v[0], vp[0], vp[1], vp[2], vp[3]]

def main(inp, out):
    im = Image.open(inp).convert('RGBA')
    if im.size != (1024, 1024):
        im = im.resize((1024, 1024), Image.LANCZOS)
    mask = Image.new('L', (1024, 1024), 0)
    ImageDraw.Draw(mask).polygon(prism_outline(), fill=255)
    im.putalpha(mask)
    im = im.crop(im.getbbox())

    w, h = im.size
    scale = TARGET_PX / h
    small = im.resize((max(1, round(w * scale)), TARGET_PX), Image.LANCZOS)

    alpha = small.getchannel('A').point(lambda a: 255 if a > 128 else 0)   # crisp edges
    try:
        rgb = small.convert('RGB').quantize(colors=COLORS, method=Image.Quantize.FASTOCTREE).convert('RGB')
    except Exception:
        rgb = small.convert('RGB').quantize(colors=COLORS).convert('RGB')
    rgb.putalpha(alpha)
    rgb.save(out)
    print(f'wrote {out}  {rgb.size}  ({COLORS} colors)')

if __name__ == '__main__':
    inp = sys.argv[1] if len(sys.argv) > 1 else 'tile_1024.png'
    out = sys.argv[2] if len(sys.argv) > 2 else 'tile_pixel.png'
    main(inp, out)
