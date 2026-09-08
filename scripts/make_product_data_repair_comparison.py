import json
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(r"C:\Users\titan\Documents\ChatGPT\Titan Diamond")
report = json.loads((root / "outputs/product-data-comparison/processing-circular-v4.json").read_text())
items = sorted(report, key=lambda item: item["repairedPixels"], reverse=True)[:24]
cell, label = 240, 30
sheet = Image.new("RGB", (cell * 4, (cell + label) * 12), "#d0d0d0")
draw = ImageDraw.Draw(sheet)
for index, item in enumerate(items):
    row, pair = divmod(index, 2)
    for side, folder in enumerate(("transparent-v1", "circular-v4")):
        image = Image.open(root / "public/product-images/product-data" / folder / item["output"]).convert("RGBA")
        image.thumbnail((cell - 8, cell - 8), Image.Resampling.LANCZOS)
        tile = Image.new("RGB", (cell, cell), "white")
        tdraw = ImageDraw.Draw(tile)
        for y in range(0, cell, 16):
            for x in range(0, cell, 16):
                if (x // 16 + y // 16) % 2:
                    tdraw.rectangle((x, y, x + 15, y + 15), fill="#bdbdbd")
        tile.paste(image, ((cell-image.width)//2, (cell-image.height)//2), image)
        x = (pair * 2 + side) * cell
        y = row * (cell + label)
        sheet.paste(tile, (x, y))
        draw.text((x + 4, y + cell + 3), f"{'OLD' if side == 0 else 'NEW'} {item['output'][:18]} {item['repairedPixels']}", fill="black")
out = root / "outputs/product-data-comparison/circular-v4-old-new.jpg"
sheet.save(out, quality=90)
print(out)


