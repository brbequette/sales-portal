"""High-quality deterministic cutouts for Pioneer price-guide product photos."""

from __future__ import annotations

import json
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
MASTERS = ROOT / "public/product-images/pioneer-price-guide/masters"
OUTPUT = ROOT / "public/product-images/pioneer-price-guide/cutouts-v2"
REPORT = ROOT / "outputs/price-guide-db-images/processing-v2.json"


def corner_colors(rgb: np.ndarray) -> np.ndarray:
    h, w, _ = rgb.shape
    band = max(5, min(h, w) // 18)
    patches = [rgb[:band, :band], rgb[:band, -band:], rgb[-band:, :band], rgb[-band:, -band:]]
    return np.array([np.median(p.reshape(-1, 3), axis=0) for p in patches], dtype=np.float32)


def border_connected(candidate: np.ndarray) -> np.ndarray:
    h, w = candidate.shape
    seen = np.zeros((h, w), dtype=bool)
    queue: deque[tuple[int, int]] = deque()
    for x in range(w):
        if candidate[0, x]: queue.append((0, x)); seen[0, x] = True
        if candidate[h - 1, x] and not seen[h - 1, x]: queue.append((h - 1, x)); seen[h - 1, x] = True
    for y in range(h):
        if candidate[y, 0] and not seen[y, 0]: queue.append((y, 0)); seen[y, 0] = True
        if candidate[y, w - 1] and not seen[y, w - 1]: queue.append((y, w - 1)); seen[y, w - 1] = True
    while queue:
        y, x = queue.popleft()
        for ny in range(max(0, y - 1), min(h, y + 2)):
            for nx in range(max(0, x - 1), min(w, x + 2)):
                if candidate[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    queue.append((ny, nx))
    return seen


def keep_components(mask: np.ndarray) -> np.ndarray:
    h, w = mask.shape
    seen = np.zeros_like(mask)
    components: list[tuple[int, list[tuple[int, int]]]] = []
    for y in range(h):
        for x in range(w):
            if not mask[y, x] or seen[y, x]: continue
            q = [(y, x)]; seen[y, x] = True; pts = []
            for cy, cx in q:
                pts.append((cy, cx))
                for ny in range(max(0, cy - 1), min(h, cy + 2)):
                    for nx in range(max(0, cx - 1), min(w, cx + 2)):
                        if mask[ny, nx] and not seen[ny, nx]: seen[ny, nx] = True; q.append((ny, nx))
            components.append((len(pts), pts))
    if not components: return mask
    largest = max(size for size, _ in components)
    out = np.zeros_like(mask)
    for size, pts in components:
        if size >= max(32, largest * 0.012):
            ys, xs = zip(*pts); out[np.array(ys), np.array(xs)] = True
    return out


def process(source: Path) -> tuple[Image.Image, dict]:
    original = Image.open(source).convert("RGBA")
    rgba = np.asarray(original).copy()
    rgb = rgba[:, :, :3].astype(np.float32)
    h, w, _ = rgb.shape
    corners = corner_colors(rgb)
    distances = np.sqrt(((rgb[:, :, None, :] - corners[None, None, :, :]) ** 2).sum(axis=3))
    nearest = distances.min(axis=2)
    border_values = np.concatenate([nearest[0], nearest[-1], nearest[:, 0], nearest[:, -1]])
    threshold = float(np.clip(np.percentile(border_values, 92) + 22, 30, 82))
    candidate = nearest <= threshold
    luma = rgb.mean(axis=2)
    chroma = rgb.max(axis=2) - rgb.min(axis=2)
    corner_luma = corners.mean(axis=1)
    if float(np.median(corner_luma)) >= 205:
        candidate |= (luma >= 224) & (chroma <= 38)
    elif float(np.median(corner_luma)) <= 55:
        candidate |= (luma <= 42) & (chroma <= 42)
    background = border_connected(candidate)
    subject = keep_components(~background)
    # Close small holes/noise without bridging blade gullets.
    subject_img = Image.fromarray((subject * 255).astype(np.uint8), "L")
    subject_img = subject_img.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))
    subject = np.asarray(subject_img) > 127
    ys, xs = np.where(subject)
    if not len(xs): raise RuntimeError("no subject")
    if xs.min() == 0 and xs.max() == w - 1 and ys.min() == 0 and ys.max() == h - 1:
        raise RuntimeError("background remained connected to full frame")
    alpha = Image.fromarray((subject * 255).astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(0.65))
    alpha_np = np.asarray(alpha)
    alpha_np = np.where(alpha_np < 8, 0, alpha_np).astype(np.uint8)
    rgba[:, :, 3] = alpha_np
    # Unmatte fractional edge pixels against their nearest corner background.
    fractional = (alpha_np > 0) & (alpha_np < 255)
    if fractional.any():
        nearest_corner = distances.argmin(axis=2)
        bg = corners[nearest_corner[fractional]]
        a = (alpha_np[fractional].astype(np.float32) / 255.0)[:, None]
        clean = (rgb[fractional] - (1 - a) * bg) / np.maximum(a, 0.08)
        rgba[fractional, :3] = np.clip(clean, 0, 255).astype(np.uint8)
    margin = max(2, round(max(xs.max() - xs.min(), ys.max() - ys.min()) * 0.012))
    box = (max(0, xs.min() - margin), max(0, ys.min() - margin), min(w, xs.max() + margin + 1), min(h, ys.max() + margin + 1))
    product = Image.fromarray(rgba, "RGBA").crop(box)
    stage = 1128
    scale = min(stage / product.width, stage / product.height)
    product = product.resize((max(1, round(product.width * scale)), max(1, round(product.height * scale))), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (1200, 1200), (0, 0, 0, 0))
    canvas.alpha_composite(product, ((1200 - product.width) // 2, (1200 - product.height) // 2))
    alpha_final = np.asarray(canvas)[:, :, 3]
    return canvas, {
        "threshold": round(threshold, 1), "source": [w, h], "crop": list(map(int, box)),
        "opaquePixels": int((alpha_final > 245).sum()), "edgePixels": int(((alpha_final > 0) & (alpha_final < 245)).sum()),
    }


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    report = {"completed": {}, "failed": {}}
    for source in sorted(MASTERS.iterdir()):
        if not source.is_file(): continue
        try:
            image, metrics = process(source)
            destination = OUTPUT / f"{source.stem}.png"
            image.save(destination, "PNG", optimize=True)
            report["completed"][source.name] = metrics
            print(f"OK {source.name}")
        except Exception as error:
            report["failed"][source.name] = str(error)
            print(f"FAIL {source.name}: {error}")
    REPORT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({"completed": len(report["completed"]), "failed": len(report["failed"])}, indent=2))


if __name__ == "__main__":
    main()
