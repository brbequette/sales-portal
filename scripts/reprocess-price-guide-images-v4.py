"""AI-segmented transparent catalog cutouts from untouched workbook masters."""

from __future__ import annotations

import json
import argparse
from io import BytesIO
from pathlib import Path

import numpy as np
from PIL import Image
from rembg import new_session, remove


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MASTERS = ROOT / "public/product-images/pioneer-price-guide/masters"
DEFAULT_OUTPUT = ROOT / "public/product-images/pioneer-price-guide/transparent-v4"
DEFAULT_REPORT = ROOT / "outputs/price-guide-db-images/processing-v4.json"


def normalize(result: Image.Image) -> tuple[Image.Image, dict]:
    rgba = result.convert("RGBA")
    alpha = np.asarray(rgba)[:, :, 3]
    ys, xs = np.where(alpha >= 8)
    if not len(xs):
        raise RuntimeError("empty segmentation mask")
    margin = max(3, round(max(xs.max() - xs.min(), ys.max() - ys.min()) * 0.012))
    box = (
        max(0, int(xs.min()) - margin), max(0, int(ys.min()) - margin),
        min(rgba.width, int(xs.max()) + margin + 1), min(rgba.height, int(ys.max()) + margin + 1),
    )
    product = rgba.crop(box)
    stage = 1128
    scale = min(stage / product.width, stage / product.height)
    product = product.resize((max(1, round(product.width * scale)), max(1, round(product.height * scale))), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (1200, 1200), (0, 0, 0, 0))
    canvas.alpha_composite(product, ((1200 - product.width) // 2, (1200 - product.height) // 2))
    final_alpha = np.asarray(canvas)[:, :, 3]
    return canvas, {
        "crop": list(box), "placed": list(product.size),
        "transparentPixels": int((final_alpha == 0).sum()),
        "opaquePixels": int((final_alpha >= 245).sum()),
        "partialPixels": int(((final_alpha > 0) & (final_alpha < 245)).sum()),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="isnet-general-use")
    parser.add_argument("--match", default="")
    parser.add_argument("--masters", type=Path, default=DEFAULT_MASTERS)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    session = new_session(args.model)
    report = {"completed": {}, "failed": {}}
    for source in sorted(path for path in args.masters.iterdir() if path.is_file()):
        if args.match and source.stem not in set(args.match.split(",")):
            continue
        try:
            original = Image.open(source).convert("RGBA")
            cut = remove(
                original,
                session=session,
                alpha_matting=True,
                alpha_matting_foreground_threshold=235,
                alpha_matting_background_threshold=12,
                alpha_matting_erode_size=4,
                post_process_mask=True,
            )
            normalized, metrics = normalize(cut)
            destination = args.output / f"{source.stem}.png"
            normalized.save(destination, "PNG", optimize=True)
            report["completed"][source.name] = metrics
            print(f"OK {source.name}", flush=True)
        except Exception as error:
            report["failed"][source.name] = str(error)
            print(f"FAIL {source.name}: {error}", flush=True)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({"completed": len(report["completed"]), "failed": len(report["failed"])}, indent=2))


if __name__ == "__main__":
    main()
