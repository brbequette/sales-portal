#!/usr/bin/env python3
"""Create a lossless-looking cutout for products photographed on white."""

import argparse
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage


def smoothstep(value: np.ndarray) -> np.ndarray:
    value = np.clip(value, 0.0, 1.0)
    return value * value * (3.0 - 2.0 * value)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    rgb = np.asarray(Image.open(args.source).convert("RGB"), dtype=np.float32)
    distance = np.sqrt(((255.0 - rgb) ** 2).sum(axis=2))
    candidate = distance > 15.0
    labels, count = ndimage.label(candidate)
    sizes = np.bincount(labels.ravel())
    sizes[0] = 0
    blade = labels == int(np.argmax(sizes))
    blade = ndimage.binary_fill_holes(blade) & candidate
    # Erode one contaminated source pixel, then rebuild a narrow antialiased
    # edge from the exact blade component. This removes JPEG-white fringe.
    clean = ndimage.binary_erosion(blade, iterations=1)
    inside = ndimage.distance_transform_edt(blade)
    alpha = np.zeros(blade.shape, dtype=np.uint8)
    alpha[blade] = np.clip(inside[blade] * 220.0, 0, 255).astype(np.uint8)
    alpha[clean] = 255
    clean_rgb = rgb.astype(np.uint8).copy()
    edge = blade & ~clean
    _, nearest = ndimage.distance_transform_edt(~clean, return_indices=True)
    clean_rgb[edge] = clean_rgb[nearest[0][edge], nearest[1][edge]]
    rgba = np.dstack((clean_rgb, alpha))
    image = Image.fromarray(rgba, "RGBA")

    ys, xs = np.where(alpha >= 8)
    crop = image.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    scale = min(1080 / crop.width, 1080 / crop.height)
    size = (round(crop.width * scale), round(crop.height * scale))
    crop = crop.resize(size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (1200, 1200), (0, 0, 0, 0))
    canvas.alpha_composite(crop, ((1200 - crop.width) // 2, (1200 - crop.height) // 2))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(args.output, optimize=True)


if __name__ == "__main__":
    main()



