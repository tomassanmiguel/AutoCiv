# AutoCiv — Terrain Tile Art Pipeline (v0)

Turnkey guide to generate the first terrain tiles locally on the **RTX 5080 (16 GB)**.
Everything here is **free + commercially licensed**. Do the stages in order; **Stage 1 is
"give it a rip"** (prove the *style*). Geometry-lock and pixel-crunch come after we like the look.

---

## 0. The spec (what we're making)

**Style bible**
- North stars: **Dorfromantik** (cozy cohesion, soft forms) + **Songs of Conquest** (pixel-painterly richness).
- Palette / mood: **Into the Breach** — muted, dreary-but-varied, high contrast on the focal shape.
- **Final render = pixel art**, reached by *generate rich HD → quantize down* (never ask the model for clean pixels).
- Consistent **sunlight from the upper-left**, one angle for every tile, forever.

**Tile geometry (locked)** — a flat-top isometric **hex prism**:
- Flat-top hexagon, vertical **tilt/squish = 0.75**, block **height ≈ 0.48 × hex-radius** (the demo's "height 20").
- **Self-contained** (no edge-blend tiles), visible earthy **side cliffs**, transparent background.
- Work resolution **1024×1024**; final pixel asset **~72 px** tall, ~24–40 colors.

**Biomes to make (in order):** plains → forest → hills → mountain → sand(desert) → water → tundra.

---

## 1. Install ComfyUI on the 5080  ⚠️ Blackwell note

The 50-series (Blackwell / `sm_120`) needs **CUDA 12.8+** and a matching PyTorch. Easiest path that
avoids torch/CUDA hell:

**Option A — ComfyUI Desktop / Portable (recommended, least fuss)**
1. Grab the latest **ComfyUI** Windows build: https://github.com/comfyanonymous/ComfyUI/releases
   (use the newest release / nightly — older bundles predate Blackwell support).
2. Unzip, run `run_nvidia_gpu.bat`. It should detect the 5080.
3. If it errors about the GPU/`sm_120`, do Option B.

**Option B — manual (if the bundle's torch is too old)**
```
git clone https://github.com/comfyanonymous/ComfyUI
cd ComfyUI
python -m venv venv && venv\Scripts\activate
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128
pip install -r requirements.txt
python main.py
```
(If cu128 stable isn't out for your torch yet, use the nightly index:
`https://download.pytorch.org/whl/nightly/cu128`.)

ComfyUI opens at http://127.0.0.1:8188.

---

## 2. Download the models (free, commercial-OK)

Drop each file in the shown ComfyUI folder.

| What | File | → folder | License |
|---|---|---|---|
| **SDXL base** | `sd_xl_base_1.0.safetensors` from [stabilityai/stable-diffusion-xl-base-1.0](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/tree/main) | `models/checkpoints` | OpenRAIL++ — **commercial OK** |
| SDXL VAE (fp16 fix) | `sdxl_vae.safetensors` / [madebyollin/sdxl-vae-fp16-fix](https://huggingface.co/madebyollin/sdxl-vae-fp16-fix) | `models/vae` | MIT |
| *(Stage 2)* ControlNet | an SDXL **lineart/canny** or **union** controlnet, e.g. [xinsir/controlnet-union-sdxl-1.0](https://huggingface.co/xinsir/controlnet-union-sdxl-1.0) | `models/controlnet` | Apache |
| *(Stage 3)* Upscaler | `4x-UltraSharp.pth` (OpenModelDB) | `models/upscale_models` | free |

> Avoid **Flux-dev** (non-commercial). If you ever want Flux, only **Flux-schnell** (Apache) is commercial-safe — but SDXL is the better fit for a stylized/pixel target anyway.

---

## 3. STAGE 1 — style test (do this first)

Goal: does the *look* sing? Ignore geometry/transparency for now.

1. In ComfyUI: **Workflow → Browse Templates → "SDXL"** (or the default graph). Set the **Load Checkpoint**
   to `sd_xl_base_1.0`.
2. **Empty Latent** size **1024 × 1024**, **batch_size 8**.
3. **KSampler:** steps **30**, cfg **6**, sampler **dpmpp_2m**, scheduler **karras**.
4. Paste the prompts below (swap `PLAINS grassland` for other biomes from §6). Queue, then **curate hard —
   generate 8, keep 1.** Save the winners.

**Positive**
```
isometric hexagonal terrain tile, single flat-top hexagon block, PLAINS grassland biome,
cozy stylized fantasy map tile, painterly pixel-art, Dorfromantik and Songs of Conquest art style,
muted dreary but varied color palette, soft warm sunlight from the upper-left, long soft shadows,
chunky earthen block with visible cliff side faces, crisp readable shapes, centered, dark flat background
```
**Negative**
```
photorealistic, photo, 3d render, blurry, text, watermark, signature, UI, HUD, grid of tiles,
multiple hexagons, top-down flat, harsh neon saturation, low contrast, jpeg artifacts, frame, border
```

If SDXL base is close-but-flat, try one **commercially-licensed** stylized SDXL LoRA from Civitai
(search "isometric", "game asset", "stylized") — **check the license says commercial use OK** before shipping.
Longer-term we replace it with our own trained LoRA (§5).

**Decision point:** when a few tiles nail the mood/palette/charm → lock those as the style reference and move to Stage 2.

---

## 4. STAGE 2 — lock the geometry (ControlNet)

SDXL won't hit "flat-top hex at tilt 0.75" by prompt alone, so we **paint texture onto the correct shape**.

1. Run the included **`make_control.py`** to render exact prism guides at our locked geometry:
   ```
   pip install pillow
   python make_control.py
   ```
   → writes `control_lineart.png` and `control_depth.png` (1024², flat-top hex prism, tilt 0.75, height 0.48).
2. In ComfyUI add **Load Image → ControlNet Apply** (lineart or depth model), strength ~0.6–0.8, feeding the
   same prompt from Stage 1. Now every biome comes out on the identical block silhouette → instant cohesion.

---

## 5. STAGE 3 — transparency + pixel crunch (post)

Run the included **`pixelize.py`** on chosen outputs:
```
python pixelize.py my_tile_1024.png plains.png
```
It: hex-masks to transparent → downscales to ~72 px → quantizes to a tight palette (crunchy pixel look) →
saves a small PNG. The game upscales it nearest-neighbor. Tune `TARGET_PX` / `COLORS` at the top of the script.
(Optional heavier bg removal: `pip install rembg` and swap in `rembg` before masking.)

Drop finished tiles into `public/sprites/tiles/` — the game already loads PNGs from there.

---

## 6. Biome prompt swaps (keep everything else identical)

| Biome | swap the subject phrase to |
|---|---|
| plains  | `PLAINS grassland biome, gentle green meadow` |
| forest  | `FOREST biome, dense stylized pine trees on the block` |
| hills   | `rolling HILLS biome, grassy mounds` |
| mountain| `MOUNTAIN biome, grey rocky peak with a snow cap rising above the tile` |
| sand    | `DESERT biome, sandy dunes, pale ochre` |
| water   | `OCEAN water tile, deep muted blue, gentle wave texture, lower surface` |
| tundra  | `TUNDRA biome, pale snow and frost, sparse` |

Only the biome phrase changes — same style tail, same ControlNet, same post → cohesive set.

---

## 7. Next: train the style LoRA (once ~20 tiles are locked)

When you've got ~20 tiles you love, train a **style LoRA** so *everything future* (units, buildings, eras)
inherits the exact look:
- Tool: **Kohya_ss** (free) — https://github.com/bmaltais/kohya_ss
- Dataset: your 20 locked tiles, captioned with a shared trigger word (e.g. `acvtile`).
- Then generation is one-click and rock-consistent; era palettes shift via prompt, style stays put.

---

### Quick reference — settings that worked as a starting point
SDXL base · 1024² · steps 30 · cfg 6 · dpmpp_2m karras · batch 8 · ControlNet 0.6–0.8 · final 72 px / ~32 colors.
