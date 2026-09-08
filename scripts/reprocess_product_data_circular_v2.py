#!/usr/bin/env python3
"""Rebuild product-data cutouts and repair dropped pixels on circular blades."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image
from rembg import new_session, remove
from scipy import ndimage


def connected_background(rgb: np.ndarray) -> np.ndarray:
    h, w, _ = rgb.shape
    border = np.concatenate((rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]), axis=0).astype(np.float32)
    bg = np.median(border, axis=0)
    distance = np.sqrt(((rgb.astype(np.float32) - bg) ** 2).sum(axis=2))
    # Workbook assets overwhelmingly use flat white/neutral canvases. Keep the
    # threshold conservative so pale metal texture is retained without filling slots.
    similar = distance < 8.0
    seeds = np.zeros((h, w), dtype=bool)
    seeds[[0, -1], :] = similar[[0, -1], :]
    seeds[:, [0, -1]] = similar[:, [0, -1]]
    background = ndimage.binary_propagation(seeds, mask=similar)
    return background


def repair_circle(original: Image.Image, cutout: Image.Image) -> tuple[Image.Image, dict]:
    rgba = np.asarray(cutout.convert("RGBA")).copy()
    rgb = np.asarray(original.convert("RGB"))
    alpha = rgba[:, :, 3]
    background = connected_background(rgb)
    evidence = ~background
    # Infer geometry from the original photograph, never from the damaged alpha.
    evidence = ndimage.binary_opening(evidence, structure=np.ones((3, 3)))
    evidence = ndimage.binary_closing(evidence, structure=np.ones((5, 5)))
    labels, count = ndimage.label(evidence)
    if count == 0:
        return cutout, {"circular": False, "repairedPixels": 0}
    sizes = np.bincount(labels.ravel())
    sizes[0] = 0
    component = labels == int(np.argmax(sizes))
    ys, xs = np.where(component)
    if len(xs) < 2000:
        return cutout, {"circular": False, "repairedPixels": 0}
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    bw, bh = x1 - x0 + 1, y1 - y0 + 1
    aspect = bw / max(bh, 1)
    if not 0.82 <= aspect <= 1.22:
        return cutout, {"circular": False, "repairedPixels": 0}
    cx, cy = (x0 + x1) / 2.0, (y0 + y1) / 2.0
    yy, xx = np.indices(alpha.shape)
    radius = min(bw, bh) * 0.515
    circle = (xx - cx) ** 2 + (yy - cy) ** 2 <= radius ** 2
    radial2 = (xx - cx) ** 2 + (yy - cy) ** 2
    outer_annulus = circle & (radial2 >= (radius * 0.56) ** 2)
    restore = outer_annulus & evidence & (alpha < 245)
    repaired = int(restore.sum())
    repair_fraction = repaired / max(int(outer_annulus.sum()), 1)
    if repair_fraction > 0.85:
        return cutout, {
            "circular": True,
            "repairedPixels": 0,
            "rejectedRepairPixels": repaired,
            "repairFraction": round(repair_fraction, 4),
        }
    if repaired:
        rgba[restore, :3] = rgb[restore]
        rgba[restore, 3] = 255
        edge = ndimage.binary_dilation(restore, iterations=1) & ~restore
        rgba[edge & (rgba[:, :, 3] < 160), 3] = 160
    return Image.fromarray(rgba, "RGBA"), {
        "circular": True,
        "repairedPixels": repaired,
        "center": [round(cx, 2), round(cy, 2)],
        "radius": round(radius, 2),
        "repairFraction": round(repair_fraction, 4),
    }


def normalize(rgba: Image.Image) -> Image.Image:
    alpha = np.asarray(rgba)[:, :, 3]
    ys, xs = np.where(alpha >= 8)
    if not len(xs):
        return Image.new("RGBA", (1200, 1200), (0, 0, 0, 0))
    crop = rgba.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    scale = min(1080 / crop.width, 1080 / crop.height)
    size = (max(1, round(crop.width * scale)), max(1, round(crop.height * scale)))
    crop = crop.resize(size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (1200, 1200), (0, 0, 0, 0))
    canvas.alpha_composite(crop, ((1200 - crop.width) // 2, (1200 - crop.height) // 2))
    return canvas


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--masters", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--model", default="isnet-general-use")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    session = new_session(args.model)
    records = []
    for index, source in enumerate(sorted(args.masters.iterdir()), start=1):
        if not source.is_file():
            continue
        original = Image.open(source).convert("RGB")
        cutout = remove(
            original,
            session=session,
            alpha_matting=False,
        ).convert("RGBA")
        excluded = {"asfm-288888c690", "smx10lv-e4a30c42a5", "zashp-0-1-2-3-a3-a50295735e", "zlgw20p-124d1d2d84", "zlgw20u-dafe15b469", "zlw10ut-9dcf787019", "zrgq10s-31e373748b"}
        if source.stem in excluded:
            repaired, info = cutout, {"circular": False, "repairedPixels": 0, "excluded": True}
        else:
            repaired, info = repair_circle(original, cutout)
        final = normalize(repaired)
        target = args.output / f"{source.stem}.png"
        final.save(target, optimize=True)
        records.append({"source": source.name, "output": target.name, **info})
        print(f"[{index}] {source.name}: circular={info['circular']} repaired={info['repairedPixels']}", flush=True)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(records, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()









