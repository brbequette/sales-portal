"""Build transparent, presentation-ready cutouts for catalog master images.

Only the primary image referenced by ``src/lib/image-map.json`` is processed.
Annotated detail diagrams remain untouched because they are documentation, not
product photography. Originals are preserved and the image map is updated to
point at generated PNG cutouts.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image
from rembg import new_session, remove
import numpy as np
from scipy import ndimage


ROOT = Path(__file__).resolve().parents[1]
IMAGE_MAP = ROOT / "src" / "lib" / "image-map.json"
PUBLIC = ROOT / "public"
OUTPUT = PUBLIC / "product-images" / "cutouts"


def normalized_cutout(source: Path, session: object, size: int) -> Image.Image:
    image = Image.open(source).convert("RGBA")
    alpha = image.getchannel("A")
    corners = [alpha.getpixel((0, 0)), alpha.getpixel((image.width - 1, 0)), alpha.getpixel((0, image.height - 1)), alpha.getpixel((image.width - 1, image.height - 1))]
    if max(corners) > 20:
        image = remove(
            image,
            session=session,
            alpha_matting=False,
        )
    alpha_array = np.asarray(image.getchannel("A")).copy()
    alpha_array[alpha_array < 8] = 0
    labels, count = ndimage.label(alpha_array > 0)
    if count:
        areas = np.bincount(labels.ravel())
        minimum = max(64, int(areas[1:].max() * 0.005))
        keep = np.flatnonzero(areas >= minimum)
        keep = keep[keep != 0]
        alpha_array[~np.isin(labels, keep)] = 0
        image.putalpha(Image.fromarray(alpha_array.astype("uint8"), "L"))
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if not bbox:
        raise RuntimeError(f"No product subject detected in {source.name}")
    image = image.crop(bbox)
    image.thumbnail((int(size * 0.9), int(size * 0.9)), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(image, ((size - image.width) // 2, (size - image.height) // 2))
    return canvas


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=0, help="Process only N images for QA")
    parser.add_argument("--start", type=int, default=1, help="Resume at this 1-based source index")
    parser.add_argument("--size", type=int, default=1200)
    parser.add_argument("--model", default="isnet-general-use")
    parser.add_argument("--no-map-update", action="store_true")
    args = parser.parse_args()

    mapping = json.loads(IMAGE_MAP.read_text(encoding="utf-8"))
    sources = sorted({entry["image"] for entry in mapping.values() if entry.get("image")})
    sources = sources[max(0, args.start - 1):]
    if args.limit:
        sources = sources[: args.limit]
    OUTPUT.mkdir(parents=True, exist_ok=True)
    session = new_session(args.model)
    rewritten: dict[str, str] = {}

    for index, public_path in enumerate(sources, 1):
        source = PUBLIC / public_path.lstrip("/")
        output_name = f"{source.stem}.png"
        output = OUTPUT / output_name
        cutout = normalized_cutout(source, session, args.size)
        cutout.save(output, "PNG", optimize=True)
        rewritten[public_path] = f"/product-images/cutouts/{output_name}"
        print(f"[{index}/{len(sources)}] {source.name} -> {output_name}", flush=True)

    if not args.no_map_update and not args.limit:
        for entry in mapping.values():
            source_path = entry.get("image")
            if source_path:
                output_name = f"{Path(source_path).stem}.png"
                if (OUTPUT / output_name).exists():
                    entry["image"] = f"/product-images/cutouts/{output_name}"
        IMAGE_MAP.write_text(json.dumps(mapping, indent=2) + "\n", encoding="utf-8")
        print(f"Updated {IMAGE_MAP.relative_to(ROOT)}", flush=True)


if __name__ == "__main__":
    main()
