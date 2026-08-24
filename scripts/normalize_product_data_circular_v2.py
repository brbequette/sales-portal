from pathlib import Path
import shutil
import numpy as np
from PIL import Image

root = Path(r"C:\Users\titan\Documents\ChatGPT\Titan Diamond\public\product-images\product-data")
source = root / "circular-v2"

# This ring diagram's interior printed card was mistaken for blade material.
# Preserve its previously approved transparent mask.
shutil.copy2(root / "transparent-v1/zrgq10s-31e373748b.png", source / "zrgq10s-31e373748b.png")

for path in sorted(source.glob("*.png")):
    image = Image.open(path).convert("RGBA")
    alpha = np.asarray(image)[:, :, 3]
    ys, xs = np.where(alpha >= 8)
    if not len(xs):
        continue
    crop = image.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    scale = min(1080 / crop.width, 1080 / crop.height)
    size = (max(1, round(crop.width * scale)), max(1, round(crop.height * scale)))
    crop = crop.resize(size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (1200, 1200), (0, 0, 0, 0))
    canvas.alpha_composite(crop, ((1200 - crop.width) // 2, (1200 - crop.height) // 2))
    canvas.save(path, optimize=True)
print(len(list(source.glob("*.png"))))
