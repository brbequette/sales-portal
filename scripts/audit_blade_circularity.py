#!/usr/bin/env python3
"""Rank transparent catalog cutouts by broken circular outer envelopes."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


def analyze(path: Path) -> dict | None:
    image = Image.open(path).convert("RGBA")
    alpha = np.asarray(image)[:, :, 3]
    ys, xs = np.where(alpha >= 96)
    if len(xs) < 2000:
        return None
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    width, height = x1 - x0 + 1, y1 - y0 + 1
    aspect = width / height
    if not 0.78 <= aspect <= 1.28:
        return None
    cx, cy = float(np.median(xs)), float(np.median(ys))
    yy, xx = np.indices(alpha.shape)
    radii = np.hypot(xx - cx, yy - cy)
    angles = (np.degrees(np.arctan2(yy - cy, xx - cx)) + 360).astype(int) % 360
    radial = np.zeros(360, dtype=float)
    mask = alpha >= 96
    # Maximum radial support per degree avoids 360 full-frame scans per image.
    np.maximum.at(radial, angles[mask], radii[mask])
    valid = radial[radial > 0]
    if valid.size < 300:
        return None
    outer = float(np.percentile(valid, 90))
    normalized = radial / max(outer, 1)
    # A smooth circular blade keeps most angular rays near the common radius.
    severe = normalized < 0.72
    moderate = normalized < 0.86
    score = float(severe.mean() * 2.0 + moderate.mean())
    return {
        "file": path.name,
        "center": [round(cx, 2), round(cy, 2)],
        "radius": round(outer, 2),
        "aspect": round(aspect, 3),
        "severeDegrees": int(severe.sum()),
        "moderateDegrees": int(moderate.sum()),
        "score": round(score, 4),
    }


def contact_sheet(items: list[dict], source: Path, output: Path, count: int = 40) -> None:
    selected = items[:count]
    cell = 260
    cols = 5
    rows = (len(selected) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cell, rows * (cell + 34)), "#d7d7d7")
    draw = ImageDraw.Draw(sheet)
    for index, item in enumerate(selected):
        x = (index % cols) * cell
        y = (index // cols) * (cell + 34)
        tile = Image.open(source / item["file"]).convert("RGBA")
        tile.thumbnail((cell - 14, cell - 14), Image.Resampling.LANCZOS)
        checker = Image.new("RGB", (cell, cell), "white")
        cdraw = ImageDraw.Draw(checker)
        for yy in range(0, cell, 20):
            for xx in range(0, cell, 20):
                if (xx // 20 + yy // 20) % 2:
                    cdraw.rectangle((xx, yy, xx + 19, yy + 19), fill="#bcbcbc")
        checker.paste(tile, ((cell - tile.width) // 2, (cell - tile.height) // 2), tile)
        sheet.paste(checker, (x, y))
        draw.text((x + 5, y + cell + 4), f"{item['file'][:24]}  score {item['score']}", fill="black")
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output, quality=92)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("report", type=Path)
    parser.add_argument("contact", type=Path)
    args = parser.parse_args()
    items = [result for path in sorted(args.source.glob("*.png")) if (result := analyze(path))]
    items.sort(key=lambda item: item["score"], reverse=True)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps({"candidates": len(items), "items": items}, indent=2), encoding="utf-8")
    contact_sheet(items, args.source, args.contact)
    print(json.dumps({"candidates": len(items), "highest": items[:10]}, indent=2))


if __name__ == "__main__":
    main()

