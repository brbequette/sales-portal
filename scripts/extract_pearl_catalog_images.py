"""Extract sufficiently large embedded product images from the Pearl catalog.

Outputs are review-only vendor assets: they are not added to the public catalog
or image map. Each image is normalized to a 1200px transparent canvas using the
same border/background treatment as Titan's product cutout pipeline.
"""
from pathlib import Path
from collections import deque
import re
import numpy as np
from PIL import Image
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
PDF = ROOT / "tmp/pdfs/pearl-2026-catalog.pdf"
OUT = ROOT / "output/vendor/pearl-2026-extracted"
OUT.mkdir(parents=True, exist_ok=True)

def cutout(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    a = np.array(im)
    rgb = a[:, :, :3].astype(np.int16)
    h, w = rgb.shape[:2]
    band = max(2, min(h, w) // 50)
    border = np.concatenate([rgb[:band].reshape(-1,3), rgb[-band:].reshape(-1,3),
                             rgb[:, :band].reshape(-1,3), rgb[:, -band:].reshape(-1,3)])
    bg = np.median(border, axis=0)
    dist = np.sqrt(((rgb - bg) ** 2).sum(axis=2))
    spread = max(8.0, float(np.percentile(np.sqrt(((border-bg)**2).sum(axis=1)), 90)))
    mask = dist > max(28.0, spread * 2.4)
    # Remove only background-connected pixels, preserving white product detail.
    seen = np.zeros((h,w), bool); q = deque()
    for x in range(w): q.extend([(0,x),(h-1,x)])
    for y in range(h): q.extend([(y,0),(y,w-1)])
    while q:
        y,x=q.popleft()
        if y<0 or y>=h or x<0 or x>=w or seen[y,x] or mask[y,x]: continue
        seen[y,x]=True
        q.extend(((y-1,x),(y+1,x),(y,x-1),(y,x+1)))
    a[:,:,3] = np.where(seen, 0, 255).astype(np.uint8)
    ys,xs=np.where(a[:,:,3]>0)
    if len(xs)==0: return Image.new("RGBA", (1200,1200), (0,0,0,0))
    crop=Image.fromarray(a[ys.min():ys.max()+1,xs.min():xs.max()+1], "RGBA")
    scale=min(1120/crop.width,1120/crop.height)
    crop=crop.resize((max(1,round(crop.width*scale)),max(1,round(crop.height*scale))), Image.Resampling.LANCZOS)
    out=Image.new("RGBA",(1200,1200),(0,0,0,0)); out.alpha_composite(crop,((1200-crop.width)//2,(1200-crop.height)//2))
    return out

reader=PdfReader(str(PDF)); count=0; manifest=[]
for page_no,page in enumerate(reader.pages,1):
    for index,img in enumerate(page.images,1):
        if img.image.width < 300 or img.image.height < 300: continue
        name=f"page-{page_no:03d}-image-{index:02d}.png"
        out=OUT/name
        try:
            cutout(img.image).save(out)
            manifest.append({"page":page_no,"source":img.name,"file":name,"width":img.image.width,"height":img.image.height})
            count += 1
        except Exception as exc:
            manifest.append({"page":page_no,"source":img.name,"error":str(exc)})
(OUT/"manifest.json").write_text(__import__('json').dumps(manifest,indent=2),encoding="utf-8")
print(f"Extracted {count} images from {len(reader.pages)} pages to {OUT}")
