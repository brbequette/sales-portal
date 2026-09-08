"""Preservation-first catalog normalization for reflective product photos.

No product pixels are segmented or removed. Originals are conservatively
cropped, resized without distortion, and centered on a clean 1200px studio mat.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
MASTERS = ROOT / "public/product-images/pioneer-price-guide/masters"
OUTPUT = ROOT / "public/product-images/pioneer-price-guide/studio-v3"
REPORT = ROOT / "outputs/price-guide-db-images/processing-v3.json"


def conservative_box(image: Image.Image) -> tuple[int, int, int, int]:
    rgb = np.asarray(image.convert("RGB")).astype(np.float32)
    h, w, _ = rgb.shape
    band = max(4, min(h, w) // 24)
    border = np.concatenate((rgb[:band].reshape(-1, 3), rgb[-band:].reshape(-1, 3), rgb[:, :band].reshape(-1, 3), rgb[:, -band:].reshape(-1, 3)))
    bg = np.median(border, axis=0)
    distance = np.sqrt(((rgb - bg) ** 2).sum(axis=2))
    # A conservative mask only locates the crop. It never becomes transparency.
    mask = distance >= max(22.0, float(np.percentile(np.sqrt(((border - bg) ** 2).sum(axis=1)), 95)) + 10.0)
    ys, xs = np.where(mask)
    if len(xs) < 40:
        return 0, 0, w, h
    pad = max(8, round(max(xs.max() - xs.min(), ys.max() - ys.min()) * 0.06))
    left, top = max(0, int(xs.min()) - pad), max(0, int(ys.min()) - pad)
    right, bottom = min(w, int(xs.max()) + pad + 1), min(h, int(ys.max()) + pad + 1)
    # Reject aggressive crops; retaining background is preferable to clipping a tool.
    if right - left < w * 0.42 or bottom - top < h * 0.42:
        return 0, 0, w, h
    return left, top, right, bottom


def process(source: Path) -> tuple[Image.Image, dict]:
    original = Image.open(source).convert("RGB")
    box = conservative_box(original)
    product = original.crop(box)
    stage = 1080
    scale = min(stage / product.width, stage / product.height)
    product = product.resize((max(1, round(product.width * scale)), max(1, round(product.height * scale))), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (1200, 1200), "white")
    canvas.paste(product, ((1200 - product.width) // 2, (1200 - product.height) // 2))
    return canvas, {"source": list(original.size), "crop": list(box), "placed": list(product.size)}


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    completed = {}
    for source in sorted(path for path in MASTERS.iterdir() if path.is_file()):
        image, metrics = process(source)
        destination = OUTPUT / f"{source.stem}.jpg"
        image.save(destination, "JPEG", quality=94, subsampling=0, optimize=True)
        completed[source.name] = metrics
        print(f"OK {source.name}")
    REPORT.write_text(json.dumps({"completed": completed}, indent=2), encoding="utf-8")
    print(json.dumps({"completed": len(completed), "failed": 0}, indent=2))


if __name__ == "__main__":
    main()
