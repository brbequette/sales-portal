from pathlib import Path
from PIL import Image, ImageDraw

root = Path(r"C:\Users\titan\Documents\ChatGPT\Titan Diamond\public\product-images\product-data")
files = sorted((root / "circular-v4").glob("*.png"))
cell_w, cell_h, cols = 180, 205, 8
rows = (len(files) + cols - 1) // cols
sheet = Image.new("RGB", (cols * cell_w, rows * cell_h), "#bdbdbd")
for index, file in enumerate(files):
    canvas = Image.new("RGBA", (cell_w, cell_h), "white")
    draw = ImageDraw.Draw(canvas)
    for y in range(0, 180, 18):
        for x in range(0, cell_w, 18):
            fill = "#d8d8d8" if (x // 18 + y // 18) % 2 else "#ffffff"
            draw.rectangle((x, y, x + 17, y + 17), fill=fill)
    image = Image.open(file).convert("RGBA")
    image.thumbnail((168, 168), Image.Resampling.LANCZOS)
    canvas.alpha_composite(image, ((cell_w - image.width) // 2, 5 + (170 - image.height) // 2))
    draw.text((5, 184), file.stem[:27], fill="black")
    sheet.paste(canvas.convert("RGB"), ((index % cols) * cell_w, (index // cols) * cell_h))
output = root / "contact-sheet-circular-v4.jpg"
sheet.save(output, quality=92)
print(output)

