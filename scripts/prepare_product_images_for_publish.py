"""Convert formatted catalog images to PNG files ready for portal and Zoho upload."""

from pathlib import Path
from PIL import Image


def convert_folder(source: Path, output: Path) -> int:
    count = 0
    output.mkdir(parents=True, exist_ok=True)
    for file in sorted(source.glob("*.jpg")):
        destination = output / f"{file.stem}.png"
        with Image.open(file) as image:
            image.convert("RGB").save(destination, "PNG", optimize=True)
        count += 1
    return count


if __name__ == "__main__":
    target = Path("All Pics/publish-ready")
    local_count = convert_folder(Path("All Pics/formatted"), target)
    zoho_count = convert_folder(Path("All Pics/zoho-current-formatted"), target / "zoho-current")
    titan_count = convert_folder(Path("All Pics/TITAN BLADES formatted"), Path("All Pics/TITAN BLADES publish-ready"))
    print(f"LOCAL_READY={local_count}")
    print(f"ZOHO_CURRENT_READY={zoho_count}")
    print(f"TITAN_BLADES_READY={titan_count}")
