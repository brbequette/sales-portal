"""Build transparent, size-specific Titan logo assets from the 2026 masters."""

from pathlib import Path
from PIL import Image, ImageChops, ImageOps

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "images" / "brand" / "logo-system"
LIGHT_SOURCE = Path(r"C:\Users\titan\Downloads\LOGO NEW 2026 BLK.png")
DARK_SOURCE = Path(r"C:\Users\titan\Downloads\LOGO NEW 2026.png")


def transparent_logo(source: Path, light: bool) -> Image.Image:
    image = Image.open(source).convert("RGB")
    gray = ImageOps.grayscale(image)
    alpha = gray if light else ImageOps.invert(gray)
    # Remove compression haze while retaining antialiased metallic edges.
    alpha = alpha.point(lambda value: 0 if value < 10 else min(255, round((value - 10) * 255 / 245)))
    ink = (246, 246, 244) if light else (10, 12, 14)
    result = Image.new("RGBA", image.size, (*ink, 0))
    result.putalpha(alpha)
    return result


def content_crop(image: Image.Image, padding: int = 18) -> Image.Image:
    bbox = image.getchannel("A").getbbox()
    if not bbox:
        raise ValueError("Logo source contains no visible pixels")
    cropped = image.crop(bbox)
    return ImageOps.expand(cropped, border=padding, fill=(0, 0, 0, 0))


def region(image: Image.Image, box: tuple[int, int, int, int], padding: int = 16) -> Image.Image:
    return content_crop(image.crop(box), padding)


def resize_width(image: Image.Image, width: int) -> Image.Image:
    height = round(image.height * width / image.width)
    return image.resize((width, height), Image.Resampling.LANCZOS)


def stacked(mark: Image.Image, wordmark: Image.Image) -> Image.Image:
    mark = resize_width(mark, 350)
    wordmark = resize_width(wordmark, 680)
    canvas = Image.new("RGBA", (760, mark.height + wordmark.height + 42), (0, 0, 0, 0))
    canvas.alpha_composite(mark, ((canvas.width - mark.width) // 2, 0))
    canvas.alpha_composite(wordmark, ((canvas.width - wordmark.width) // 2, mark.height + 18))
    return content_crop(canvas, 22)


def clean_wordmark(image: Image.Image) -> Image.Image:
    """Remove the helmet edge that overlaps the type crop in the source master."""
    alpha = image.getchannel("A")
    cutoff_x = min(28, image.width)
    cutoff_y = round(image.height * 0.42)
    alpha.paste(0, (0, cutoff_y, cutoff_x, image.height))
    image.putalpha(alpha)
    return image


def save_set(source: Path, theme: str, light: bool) -> None:
    master = transparent_logo(source, light)
    width, height = master.size
    horizontal = content_crop(master, 24)
    # The master has a clean visual handoff at x=470 between helmet and type.
    mark = region(master, (0, 0, 470, height), 20)
    wordmark = clean_wordmark(region(master, (470, round(height * 0.30), width, round(height * 0.68)), 20))
    assets = {
        f"titan-horizontal-{theme}.png": horizontal,
        f"titan-mark-{theme}.png": mark,
        f"titan-wordmark-{theme}.png": wordmark,
        f"titan-stacked-{theme}.png": stacked(mark, wordmark),
    }
    for name, asset in assets.items():
        asset.save(OUT / name, optimize=True)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    save_set(LIGHT_SOURCE, "light", True)
    save_set(DARK_SOURCE, "dark", False)
    print(f"Created 8 transparent logo assets in {OUT}")


if __name__ == "__main__":
    main()
