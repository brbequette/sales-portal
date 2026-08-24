"""Extract verified workbook product images and build SKU-scoped catalog assets.

Only exact database SKUs from dedicated category sheets are accepted. The
duplicated ORIGINAL QUOTE reference sheet and ambiguous candidates are ignored.
"""

from __future__ import annotations

import json
import re
import zipfile
from pathlib import Path

from rebuild_product_cutouts_from_masters import extract_master


ROOT = Path(__file__).resolve().parents[1]
WORKBOOK = Path(r"C:\Users\titan\Downloads\Pioneer Titan Diamond PRICE GUIDE 2023 (2).xlsx")
AUDIT = ROOT / ".codex-artifact/price-guide-inspect/db-match-audit.json"
IMAGE_MAP = ROOT / "src/lib/image-map.json"
ASSET_ROOT = ROOT / "public/product-images/pioneer-price-guide"
MASTER_ROOT = ASSET_ROOT / "masters"
CUTOUT_ROOT = ASSET_ROOT / "cutouts"
PLAN = ROOT / "outputs/price-guide-db-images/update-plan.json"


def media_stem(media: str) -> str:
    raw = Path(media).stem.casefold()
    safe = re.sub(r"[^a-z0-9]+", "-", raw).strip("-")
    return f"price-guide-{safe}"


def main() -> None:
    audit = json.loads(AUDIT.read_text(encoding="utf-8"))
    eligible = [
        row for row in audit["matchedProducts"]
        if row["sheet"] != "ORIGINAL QUOTE" and not row["ambiguous"]
    ]
    selected: dict[str, dict] = {}
    for row in sorted(eligible, key=lambda item: (item["databaseSku"], item["distance"])):
        selected.setdefault(row["databaseSku"], row)

    MASTER_ROOT.mkdir(parents=True, exist_ok=True)
    CUTOUT_ROOT.mkdir(parents=True, exist_ok=True)
    media_outputs: dict[str, str] = {}
    skipped: dict[str, str] = {}
    with zipfile.ZipFile(WORKBOOK) as archive:
        for media in sorted({row["media"] for row in selected.values()}):
            suffix = Path(media).suffix.casefold() or ".jpg"
            stem = media_stem(media)
            master = MASTER_ROOT / f"{stem}{suffix}"
            master.write_bytes(archive.read(media))
            cutout = CUTOUT_ROOT / f"{stem}.png"
            try:
                extract_master(master, 1200).save(cutout, "PNG", optimize=True)
                media_outputs[media] = f"/product-images/pioneer-price-guide/cutouts/{cutout.name}"
            except Exception as error:
                skipped[media] = str(error)
                media_outputs[media] = f"/product-images/pioneer-price-guide/masters/{master.name}"

    image_map = json.loads(IMAGE_MAP.read_text(encoding="utf-8"))
    updates = []
    for sku, row in sorted(selected.items()):
        image = media_outputs[row["media"]]
        prior = image_map.get(sku.upper(), {})
        image_map[sku.upper()] = {
            "image": image,
            "detail_a": prior.get("detail_a"),
            "detail_b": prior.get("detail_b"),
        }
        updates.append({
            "productId": row["productId"],
            "sku": sku,
            "name": row["productName"],
            "sheet": row["sheet"],
            "sourceRow": row["row"] + 1,
            "sourceMedia": row["media"],
            "oldImageUrl": row["existingImageUrl"],
            "newImageUrl": image,
        })

    IMAGE_MAP.write_text(json.dumps(image_map, indent=2) + "\n", encoding="utf-8")
    PLAN.parent.mkdir(parents=True, exist_ok=True)
    PLAN.write_text(json.dumps({
        "sourceWorkbook": WORKBOOK.name,
        "selectionRules": [
            "Exact normalized SKU match to Product.sku",
            "Dedicated category sheets only; ORIGINAL QUOTE excluded",
            "Ambiguous equal-distance image candidates excluded",
        ],
        "productUpdates": updates,
        "uniqueMedia": len(media_outputs),
        "cutouts": sum("/cutouts/" in value for value in media_outputs.values()),
        "masterFallbacks": skipped,
    }, indent=2), encoding="utf-8")
    print(json.dumps({
        "verifiedProducts": len(updates),
        "uniqueMedia": len(media_outputs),
        "cutouts": sum("/cutouts/" in value for value in media_outputs.values()),
        "masterFallbacks": len(skipped),
        "plan": str(PLAN),
    }, indent=2))


if __name__ == "__main__":
    main()
