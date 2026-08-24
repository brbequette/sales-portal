"""Rebuild clean catalog cutouts from untouched master images.

This intentionally does not feed previous cutouts back into segmentation.
Uniform studio backgrounds are removed by color distance, then connected
components are evaluated so page labels and isolated artifacts do not expand
the product bounds.  Circular blades receive a geometry-aware cleanup that
preserves the repeating segment crown and narrow gullets.
"""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
MASTERS = PUBLIC / "product-images"
DEFAULT_OUTPUT = MASTERS / "cutouts-v2"
IMAGE_MAP = ROOT / "src" / "lib" / "image-map.json"


@dataclass
class Run:
    row: int
    start: int
    end: int
    parent: int
    area: int


def resolve_master(mapped_path: str) -> Path:
    path = PUBLIC / mapped_path.lstrip("/")
    if path.parent.name in {"cutouts", "cutouts-v2"}:
        path = MASTERS / path.name
    if not path.exists():
        normalized = re.sub(r"[^a-z0-9]", "", path.stem.casefold())
        candidates = [
            candidate for candidate in MASTERS.iterdir()
            if candidate.is_file()
            and re.sub(r"[^a-z0-9]", "", candidate.stem.casefold()) == normalized
        ]
        if len(candidates) == 1:
            path = candidates[0]
        else:
            raise FileNotFoundError(f"Original master not found for {mapped_path}: {path}")
    return path


def border_color(rgb: np.ndarray) -> tuple[np.ndarray, float]:
    h, w, _ = rgb.shape
    band = max(2, min(h, w) // 80)
    border = np.concatenate((
        rgb[:band].reshape(-1, 3), rgb[-band:].reshape(-1, 3),
        rgb[:, :band].reshape(-1, 3), rgb[:, -band:].reshape(-1, 3),
    ))
    border = border.astype(np.float32)
    color = np.median(border, axis=0)
    spread = float(np.percentile(np.sqrt(np.sum((border - color) ** 2, axis=1)), 90))
    return color, spread


def find(parent: list[int], value: int) -> int:
    while parent[value] != value:
        parent[value] = parent[parent[value]]
        value = parent[value]
    return value


def union(parent: list[int], a: int, b: int) -> None:
    ra, rb = find(parent, a), find(parent, b)
    if ra != rb:
        parent[rb] = ra


def connected_subject(mask: np.ndarray) -> np.ndarray:
    """Keep meaningful 8-connected components using row runs, not per-pixel BFS."""
    h, _ = mask.shape
    runs: list[Run] = []
    parent: list[int] = []
    previous: list[int] = []

    for row in range(h):
        padded = np.pad(mask[row].astype(np.int8), (1, 1))
        changes = np.diff(padded)
        starts = np.flatnonzero(changes == 1)
        ends = np.flatnonzero(changes == -1) - 1
        current: list[int] = []
        prior_cursor = 0
        for start, end in zip(starts.tolist(), ends.tolist()):
            index = len(runs)
            runs.append(Run(row, start, end, index, end - start + 1))
            parent.append(index)
            current.append(index)
            while prior_cursor < len(previous) and runs[previous[prior_cursor]].end < start - 1:
                prior_cursor += 1
            cursor = prior_cursor
            while cursor < len(previous) and runs[previous[cursor]].start <= end + 1:
                union(parent, index, previous[cursor])
                cursor += 1
        previous = current

    if not runs:
        return np.zeros_like(mask)
    areas: dict[int, int] = {}
    bounds: dict[int, list[int]] = {}
    for index, run in enumerate(runs):
        root = find(parent, index)
        areas[root] = areas.get(root, 0) + run.area
        if root not in bounds:
            bounds[root] = [run.start, run.row, run.end, run.row]
        else:
            box = bounds[root]
            box[0], box[1] = min(box[0], run.start), min(box[1], run.row)
            box[2], box[3] = max(box[2], run.end), max(box[3], run.row)
    largest = max(areas.values())
    keep_roots = {
        root for root, area in areas.items()
        if area >= max(48, largest * 0.03)
        # Zoho/Shopify presentation exports frequently contain a detached
        # "TYPE: BLADE" badge at the lower-left edge. It is metadata, not part
        # of the physical product, and must never determine the crop.
        and not (bounds[root][1] >= int(h * 0.78))
    }
    output = np.zeros_like(mask)
    for index, run in enumerate(runs):
        if find(parent, index) in keep_roots:
            output[run.row, run.start:run.end + 1] = True
    return output


def looks_like_round_blade(subject: np.ndarray) -> bool:
    ys, xs = np.where(subject)
    if not len(xs):
        return False
    width, height = xs.max() - xs.min() + 1, ys.max() - ys.min() + 1
    ratio = width / max(1, height)
    extent = len(xs) / max(1, width * height)
    return 0.78 <= ratio <= 1.28 and extent >= 0.18 and min(width, height) >= 180


def extract_master(source: Path, size: int) -> Image.Image:
    original = Image.open(source).convert("RGBA")
    rgba = np.asarray(original).copy()
    rgb = rgba[:, :, :3].astype(np.float32)
    bg, border_spread = border_color(rgb)
    if border_spread > 28:
        raise RuntimeError(f"Non-uniform master background ({border_spread:.1f})")
    distance = np.sqrt(np.sum((rgb - bg) ** 2, axis=2))
    border_luma = float(bg.mean())

    # Flat white and near-black studio canvases use different ramps.  The
    # loose mask locates geometry; the soft ramp supplies the final edge.
    flat_white = border_luma >= 225
    if flat_white:
        loose, solid = distance >= 18, distance >= 55
        alpha = np.clip((distance - 15) * (255 / 38), 0, 255)
    elif border_luma <= 38:
        loose, solid = distance >= 10, distance >= 34
        alpha = np.clip((distance - 6) * (255 / 30), 0, 255)
    else:
        loose, solid = distance >= 12, distance >= 42
        alpha = np.clip((distance - 8) * (255 / 36), 0, 255)

    subject = connected_subject(loose)
    if not subject.any():
        raise RuntimeError(f"No subject found in {source.name}")

    # Close only tiny pinholes. On round blades this stabilizes identical
    # segment crowns without bridging the intentional gullets or arbor holes.
    subject_img = Image.fromarray((subject * 255).astype(np.uint8), "L")
    close_size = 5 if looks_like_round_blade(subject) else 3
    subject = np.asarray(
        subject_img.filter(ImageFilter.MaxFilter(close_size)).filter(ImageFilter.MinFilter(close_size))
    ) > 0

    if flat_white:
        # A one-pixel inward contour removes the baked-in white matte from
        # commodity catalog exports. Lanczos scaling below creates the final
        # clean anti-alias against transparency.
        clean_subject = np.asarray(
            Image.fromarray((subject * 255).astype(np.uint8), "L").filter(ImageFilter.MinFilter(3))
        ) > 0
        alpha = (clean_subject * 255).astype(np.uint8)
    else:
        alpha[~subject] = 0
        alpha[solid & subject] = 255
        alpha = np.minimum(alpha, rgba[:, :, 3]).astype(np.uint8)
        alpha[alpha < 10] = 0

    # Remove the studio-background contribution from anti-aliased edge
    # pixels. Without this unmatting step, white masters leave a bright halo
    # when placed on Titan's dark UI.
    fractional = (alpha > 0) & (alpha < 255)
    if fractional.any():
        a = (alpha[fractional].astype(np.float32) / 255.0)[:, None]
        observed = rgb[fractional]
        clean = (observed - (1.0 - a) * bg[None, :]) / np.maximum(a, 0.04)
        rgba[fractional, :3] = np.clip(clean, 0, 255).astype(np.uint8)
    rgba[:, :, 3] = alpha

    # Strong source-color evidence determines the crop. Very faint JPEG
    # canvas noise may retain a tiny soft alpha, but can never shrink the
    # physical product on the final 1200px stage.
    crop_mask = solid & subject
    ys, xs = np.where(crop_mask)
    if not len(xs):
        raise RuntimeError(f"Empty alpha after cleanup in {source.name}")
    margin = max(2, int(max(xs.max() - xs.min(), ys.max() - ys.min()) * 0.008))
    left, top = max(0, xs.min() - margin), max(0, ys.min() - margin)
    right, bottom = min(original.width, xs.max() + margin + 1), min(original.height, ys.max() + margin + 1)
    print(f"  crop {source.name}: ({left},{top})-({right},{bottom})", flush=True)
    product = Image.fromarray(rgba, "RGBA").crop((left, top, right, bottom))
    stage = int(size * 0.94)
    scale = min(stage / product.width, stage / product.height)
    product = product.resize(
        (max(1, round(product.width * scale)), max(1, round(product.height * scale))),
        Image.Resampling.LANCZOS,
    )
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(product, ((size - product.width) // 2, (size - product.height) // 2))
    return canvas


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--size", type=int, default=1200)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--match", default="", help="Only process source names containing this text")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--update-map", action="store_true")
    parser.add_argument("--map-only", action="store_true", help="Point mapped products at existing approved outputs without reprocessing")
    args = parser.parse_args()

    mapping = json.loads(IMAGE_MAP.read_text(encoding="utf-8"))
    masters = sorted({resolve_master(entry["image"]) for entry in mapping.values() if entry.get("image")})
    if args.match:
        masters = [path for path in masters if args.match.casefold() in path.name.casefold()]
    if args.limit:
        masters = masters[:args.limit]
    args.output.mkdir(parents=True, exist_ok=True)

    completed = 0
    skipped: list[str] = []
    if not args.map_only:
        for index, source in enumerate(masters, 1):
            destination = args.output / f"{source.stem}.png"
            try:
                extract_master(source, args.size).save(destination, "PNG", optimize=True)
                completed += 1
                print(f"[{index}/{len(masters)}] {source.name} -> {destination.name}", flush=True)
            except Exception as error:
                skipped.append(f"{source.name}: {error}")
                print(f"[{index}/{len(masters)}] SKIP {source.name}: {error}", flush=True)

    print(f"Completed {completed}; skipped {len(skipped)}", flush=True)
    if skipped:
        report = args.output / "skipped.json"
        report.write_text(json.dumps(skipped, indent=2) + "\n", encoding="utf-8")
        print(f"Wrote {report}", flush=True)

    if (args.update_map or args.map_only) and not args.limit and not args.match:
        for entry in mapping.values():
            source = resolve_master(entry["image"])
            destination = args.output / f"{source.stem}.png"
            if destination.exists():
                entry["image"] = f"/product-images/{args.output.name}/{destination.name}"
        IMAGE_MAP.write_text(json.dumps(mapping, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
