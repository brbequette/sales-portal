"""Create dark, tightly framed product images without modifying source files."""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter


def corner_background(rgb: np.ndarray) -> np.ndarray:
    h, w, _ = rgb.shape
    size = max(8, min(h, w) // 18)
    samples = np.concatenate([
        rgb[:size, :size].reshape(-1, 3),
        rgb[:size, -size:].reshape(-1, 3),
        rgb[-size:, :size].reshape(-1, 3),
        rgb[-size:, -size:].reshape(-1, 3),
    ])
    return np.median(samples, axis=0)


def subject_mask(image: Image.Image) -> Image.Image:
    rgba = np.asarray(image.convert("RGBA"), dtype=np.float32)
    rgb = rgba[:, :, :3]
    source_alpha = rgba[:, :, 3] / 255.0
    bg = corner_background(rgb)
    distance = np.sqrt(np.sum((rgb - bg) ** 2, axis=2))
    # Soft transition preserves anti-aliased metal edges.
    alpha = np.clip((distance - 10.0) / 28.0, 0.0, 1.0) * source_alpha
    h, w = alpha.shape
    # Remove the legacy bottom-left "TYPE: BLADE" badge and edge noise.
    alpha[int(h * 0.925):, :int(w * 0.18)] = 0
    alpha[:2, :] = 0
    alpha[-2:, :] = 0
    alpha[:, :2] = 0
    alpha[:, -2:] = 0
    mask = Image.fromarray(np.uint8(alpha * 255), "L")
    return mask.filter(ImageFilter.GaussianBlur(radius=max(0.6, min(h, w) / 1600)))


def dark_background(size: int) -> Image.Image:
    y, x = np.mgrid[0:size, 0:size]
    cx, cy = size * 0.5, size * 0.43
    radius = np.sqrt(((x - cx) / size) ** 2 + ((y - cy) / size) ** 2)
    glow = np.clip(1.0 - radius / 0.72, 0.0, 1.0)
    vertical = np.clip(y / size, 0.0, 1.0)
    base = np.zeros((size, size, 3), dtype=np.float32)
    base[:, :, 0] = 8 + glow * 17 + vertical * 2
    base[:, :, 1] = 13 + glow * 21 + vertical * 3
    base[:, :, 2] = 16 + glow * 23 + vertical * 4
    # Subtle floor line like the supplied reference.
    floor = y > size * 0.84
    base[floor] *= (0.86 + ((y[floor] / size - 0.84) / 0.16) * 0.12)[:, None]
    return Image.fromarray(np.uint8(np.clip(base, 0, 255)), "RGB")


def format_image(source: Path, destination: Path, size: int = 1024, fill: float = 0.91) -> tuple[int, int]:
    image = Image.open(source).convert("RGBA")
    mask = subject_mask(image)
    bbox = mask.getbbox()
    if not bbox:
        raise ValueError("No product subject detected")
    subject = image.crop(bbox)
    subject_mask_crop = mask.crop(bbox)
    target = int(size * fill)
    scale = min(target / subject.width, target / subject.height)
    new_size = (max(1, round(subject.width * scale)), max(1, round(subject.height * scale)))
    subject = subject.resize(new_size, Image.Resampling.LANCZOS)
    subject_mask_crop = subject_mask_crop.resize(new_size, Image.Resampling.LANCZOS)
    subject = ImageEnhance.Contrast(subject).enhance(1.04)
    subject = ImageEnhance.Sharpness(subject).enhance(1.08)

    canvas = dark_background(size).convert("RGBA")
    x = (size - new_size[0]) // 2
    y = max(int(size * 0.035), (size - new_size[1]) // 2 - int(size * 0.01))
    shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    shadow_mask = Image.new("L", (size, size), 0)
    shadow_mask.paste(subject_mask_crop, (x + 12, y + 18))
    shadow_mask = shadow_mask.filter(ImageFilter.GaussianBlur(radius=18))
    shadow.putalpha(shadow_mask.point(lambda p: int(p * 0.50)))
    canvas.alpha_composite(shadow)
    canvas.paste(subject, (x, y), subject_mask_crop)
    destination.parent.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(destination, "JPEG", quality=94, subsampling=0, optimize=True)
    return new_size


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default="All Pics/processed")
    parser.add_argument("--output", default="All Pics/formatted")
    parser.add_argument("--names", nargs="*")
    parser.add_argument("--size", type=int, default=1024)
    parser.add_argument("--skip-existing", action="store_true")
    args = parser.parse_args()
    source_dir = Path(args.source)
    output_dir = Path(args.output)
    if args.names:
        files = [source_dir / name for name in args.names]
    else:
        files = sorted(p for p in source_dir.glob("*.png") if "_detail_" not in p.stem.lower())
    successes = 0
    errors: list[str] = []
    for source in files:
        destination = output_dir / f"{source.stem}.jpg"
        if args.skip_existing and destination.exists() and destination.stat().st_size > 0:
            print(f"SKIP\t{source.name}\talready formatted")
            continue
        try:
            new_size = format_image(source, destination, args.size)
            print(f"OK\t{source.name}\t{new_size[0]}x{new_size[1]}")
            successes += 1
        except Exception as exc:
            errors.append(f"{source.name}: {exc}")
            print(f"ERROR\t{source.name}\t{exc}")
    print(f"SUMMARY\t{successes} formatted\t{len(errors)} errors")
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
