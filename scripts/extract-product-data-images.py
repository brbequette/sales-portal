"""Extract unique embedded PRODUCT DATA images with SKU/family provenance."""

from __future__ import annotations

import hashlib
import json
import re
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WORKBOOK = Path(r"C:\Users\titan\Downloads\PRODUCT DATA.xlsx")
COMPARISON = ROOT / "outputs/product-data-comparison/comparison.json"
ASSET_ROOT = ROOT / "public/product-images/product-data"
MASTERS = ASSET_ROOT / "masters"
MANIFEST = ROOT / "outputs/product-data-comparison/image-manifest.json"


def slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.casefold()).strip("-")[:55] or "product"


def main() -> None:
    comparison = json.loads(COMPARISON.read_text(encoding="utf-8"))
    by_media: dict[str, dict] = {}
    for row in comparison["rows"]:
        for media in row["images"]:
            entry = by_media.setdefault(media, {"families": set(), "skus": [], "matchedSkus": [], "sourceRows": []})
            if row["workbook"]["bladeFamily"]:
                entry["families"].add(row["workbook"]["bladeFamily"])
            entry["skus"].append(row["workbook"]["sku"])
            if row["database"]:
                entry["matchedSkus"].append(row["database"]["sku"])
            entry["sourceRows"].append(row["sourceRow"])

    MASTERS.mkdir(parents=True, exist_ok=True)
    output = []
    names: set[str] = set()
    with zipfile.ZipFile(WORKBOOK) as archive:
        for media, meta in sorted(by_media.items()):
            data = archive.read(media)
            digest = hashlib.sha256(data).hexdigest()
            family = sorted(meta["families"])[0] if meta["families"] else Path(media).stem
            base = f"{slug(family)}-{digest[:10]}"
            if base in names:
                base = f"{base}-{len(names)}"
            names.add(base)
            suffix = Path(media).suffix.casefold() or ".png"
            master = MASTERS / f"{base}{suffix}"
            master.write_bytes(data)
            output.append({
                "sourceMedia": media,
                "master": master.relative_to(ROOT).as_posix(),
                "outputStem": base,
                "sha256": digest,
                "families": sorted(meta["families"]),
                "skus": sorted(set(meta["skus"])),
                "matchedSkus": sorted(set(meta["matchedSkus"])),
                "sourceRows": sorted(set(meta["sourceRows"])),
            })
    MANIFEST.write_text(json.dumps({"images": output}, indent=2), encoding="utf-8")
    print(json.dumps({
        "uniqueImages": len(output),
        "workbookSkusWithImages": len({sku for item in output for sku in item["skus"]}),
        "databaseMatchedSkusWithImages": len({sku for item in output for sku in item["matchedSkus"]}),
        "masters": str(MASTERS),
    }, indent=2))


if __name__ == "__main__":
    main()
