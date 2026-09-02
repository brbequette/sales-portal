from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import shutil
import urllib.request
from collections import defaultdict
from pathlib import Path

from PIL import Image
from pypdf import PdfReader
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    Image as RLImage,
    KeepTogether,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
SOURCE_HTML = ROOT / "tmp" / "gtdiamond-publication.html"
SOURCE_DIR = ROOT / "tmp" / "pdfs" / "gtdiamond-source"
THUMB_DIR = ROOT / "tmp" / "pdfs" / "gtdiamond-thumbnails"
OUTPUT_DIR = ROOT / "output" / "pdf" / "titan-product-sheets"
PUBLIC_DIR = ROOT / "public" / "downloads" / "product-sheets"
LOGO = ROOT / "public" / "images" / "brand" / "logo-system" / "titan-horizontal-light.png"
MANIFEST = OUTPUT_DIR / "manifest.json"

ORANGE = colors.HexColor("#FF7900")
BLACK = colors.HexColor("#080A0D")
CHARCOAL = colors.HexColor("#15191F")
MID = colors.HexColor("#667085")
LIGHT = colors.HexColor("#F4F5F7")
WHITE = colors.white


def decode_json_string(value: str) -> str:
    try:
        return json.loads(f'"{value}"')
    except json.JSONDecodeError:
        return html.unescape(value.replace('\\"', '"').replace('\\/', '/'))


def inventory() -> list[dict[str, object]]:
    raw = SOURCE_HTML.read_text(encoding="utf-8")
    pattern = re.compile(
        r'\\"categorySlugs\\":\[(?P<categories>.*?)\],'
        r'\\"productName\\":\\"(?P<name>.*?)\\",'
        r'\\"thumbnailUrl\\":\\"(?P<thumb>.*?)\\",'
        r'\\"typeName\\":\\"(?P<type>.*?)\\",'
        r'\\"url\\":\\"(?P<url>https://admin\.gtdiamond\.com/.*?\.pdf(?:\.pdf)?)\\"'
    )
    items: list[dict[str, object]] = []
    seen: set[tuple[str, str]] = set()
    for match in pattern.finditer(raw):
        name = decode_json_string(match.group("name"))
        url = decode_json_string(match.group("url"))
        key = (name, url)
        if key in seen:
            continue
        seen.add(key)
        categories = re.findall(r'\\"(.*?)\\"', match.group("categories"))
        items.append(
            {
                "productName": name,
                "typeName": decode_json_string(match.group("type")),
                "thumbnailUrl": decode_json_string(match.group("thumb")),
                "sourceUrl": url,
                "categories": [decode_json_string(value) for value in categories],
            }
        )
    return sorted(items, key=lambda item: str(item["productName"]).casefold())


def safe_slug(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.casefold()).strip("-")
    return slug[:90] or "product"


def download(url: str, destination: Path) -> None:
    if destination.exists() and destination.stat().st_size > 500:
        return
    destination.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(url, headers={"User-Agent": "TitanDiamondProductSheetBuilder/1.0"})
    with urllib.request.urlopen(request, timeout=60) as response, destination.open("wb") as output:
        shutil.copyfileobj(response, output)


def clean_source_lines(pdf_path: Path) -> list[str]:
    lines: list[str] = []
    for page in PdfReader(str(pdf_path)).pages:
        text = page.extract_text() or ""
        for raw_line in text.splitlines():
            line = " ".join(raw_line.split()).strip(" -|•")
            if not line or len(line) < 2:
                continue
            if re.search(r"gtdiamond\.com|zenesistechnology\.com|general tool,? inc|alton parkway|800[- ]850[- ]2322", line, re.I):
                continue
            if line.casefold() in {existing.casefold() for existing in lines[-12:]}:
                continue
            lines.append(line)
    return lines


def classification(item: dict[str, object]) -> str:
    categories = [str(value) for value in item.get("categories", [])]
    priorities = (
        ("specialty", "Specialty Products"),
        ("core", "Core Bits"),
        ("polishing", "Polishing Products"),
        ("grinding", "Grinding Products"),
        ("diamond-blade", "Diamond Blades"),
    )
    for token, label in priorities:
        if any(token in value for value in categories):
            return label
    return str(item.get("typeName") or "Diamond Tool")


def header_footer(canvas, doc) -> None:
    width, height = letter
    canvas.saveState()
    canvas.setFillColor(BLACK)
    canvas.rect(0, height - 0.68 * inch, width, 0.68 * inch, stroke=0, fill=1)
    if LOGO.exists():
        canvas.drawImage(str(LOGO), 0.42 * inch, height - 0.53 * inch, width=1.7 * inch, height=0.28 * inch,
                         preserveAspectRatio=True, mask="auto", anchor="sw")
    canvas.setFillColor(ORANGE)
    canvas.rect(0, height - 0.72 * inch, width, 0.04 * inch, stroke=0, fill=1)
    canvas.setFillColor(BLACK)
    canvas.rect(0, 0, width, 0.38 * inch, stroke=0, fill=1)
    canvas.setFillColor(WHITE)
    canvas.setFont("Helvetica-Bold", 7.5)
    canvas.drawString(0.42 * inch, 0.15 * inch, "TITAN DIAMOND USA  |  CONTRACTOR DIRECT")
    canvas.setFont("Helvetica", 7.5)
    canvas.drawRightString(width - 0.42 * inch, 0.15 * inch, f"(480) 470-2577  |  Page {doc.page}")
    canvas.restoreState()


def styles():
    base = getSampleStyleSheet()
    return {
        "eyebrow": ParagraphStyle("eyebrow", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=8,
                                  leading=10, textColor=ORANGE, spaceAfter=5, uppercase=True),
        "title": ParagraphStyle("title", parent=base["Title"], fontName="Helvetica-Bold", fontSize=27,
                                leading=29, textColor=BLACK, alignment=TA_LEFT, spaceAfter=5),
        "type": ParagraphStyle("type", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=11,
                               leading=14, textColor=MID, spaceAfter=12),
        "section": ParagraphStyle("section", parent=base["Heading2"], fontName="Helvetica-Bold", fontSize=11,
                                  leading=14, textColor=BLACK, spaceBefore=7, spaceAfter=6),
        "body": ParagraphStyle("body", parent=base["BodyText"], fontName="Helvetica", fontSize=8.6,
                               leading=11.2, textColor=CHARCOAL, spaceAfter=3),
        "small": ParagraphStyle("small", parent=base["BodyText"], fontName="Helvetica", fontSize=7,
                                leading=9, textColor=MID),
        "indexTitle": ParagraphStyle("indexTitle", parent=base["Title"], fontName="Helvetica-Bold", fontSize=30,
                                     leading=32, textColor=BLACK, alignment=TA_CENTER, spaceAfter=10),
    }


def build_sheet(item: dict[str, object], source_pdf: Path, thumb: Path, output_pdf: Path) -> dict[str, object]:
    sheet_styles = styles()
    doc = BaseDocTemplate(
        str(output_pdf), pagesize=letter, leftMargin=0.48 * inch, rightMargin=0.48 * inch,
        topMargin=0.92 * inch, bottomMargin=0.56 * inch,
        title=f'{item["productName"]} - Titan Diamond USA Product Sheet',
        author="Titan Diamond USA",
        subject="Contractor product specification sheet",
    )
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="content")
    doc.addPageTemplates([PageTemplate(id="Titan", frames=[frame], onPage=header_footer)])
    lines = clean_source_lines(source_pdf)
    name = str(item["productName"])
    product_type = str(item["typeName"])
    category = classification(item)
    story = [
        Paragraph(category.upper(), sheet_styles["eyebrow"]),
        Paragraph(html.escape(name), sheet_styles["title"]),
        Paragraph(html.escape(product_type), sheet_styles["type"]),
    ]
    intro_lines = [line for line in lines if name.casefold() not in line.casefold()][:5]
    detail_lines = [line for line in lines if line not in intro_lines][:42]
    if thumb.exists():
        try:
            with Image.open(thumb) as source_image:
                ratio = source_image.width / max(source_image.height, 1)
            image_width = 2.25 * inch
            image_height = min(2.18 * inch, image_width / max(ratio, 0.4))
            product_image = RLImage(str(thumb), width=image_width, height=image_height)
            overview = [Paragraph("APPLICATION SNAPSHOT", sheet_styles["section"])]
            overview.extend(Paragraph(html.escape(line), sheet_styles["body"]) for line in intro_lines or [product_type])
            hero = Table([[product_image, overview]], colWidths=[2.55 * inch, 4.0 * inch], hAlign="LEFT")
            hero.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), LIGHT),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#D5D9E0")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 12),
                ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ]))
            story.extend([hero, Spacer(1, 8)])
        except Exception:
            pass
    story.append(Paragraph("CONFIGURATIONS & TECHNICAL DETAILS", sheet_styles["section"]))
    chunks = [detail_lines[index:index + 2] for index in range(0, len(detail_lines), 2)]
    if not chunks:
        chunks = [["Contact Titan Diamond for configuration and application matching."]]
    rows = []
    for chunk in chunks:
        cells = [Paragraph(html.escape(value), sheet_styles["body"]) for value in chunk]
        while len(cells) < 2:
            cells.append(Paragraph("", sheet_styles["body"]))
        rows.append(cells)
    table = Table(rows, colWidths=[3.28 * inch, 3.28 * inch], repeatRows=0)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#D9DCE2")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.extend([
        table,
        Spacer(1, 9),
        KeepTogether([
            Paragraph("MATCH IT TO THE JOB", sheet_styles["section"]),
            Paragraph("For the right bond and configuration, have the saw, material, aggregate hardness, cut depth, wet/dry requirement, and daily production target ready.", sheet_styles["body"]),
            Paragraph("Technical data reformatted for Titan Diamond USA from the OEM product sheet. Verify availability and current specifications with Titan before ordering.", sheet_styles["small"]),
        ]),
    ])
    doc.build(story)
    return {
        **item,
        "category": category,
        "outputFile": output_pdf.name,
        "sourceFile": source_pdf.name,
        "sourceSha256": hashlib.sha256(source_pdf.read_bytes()).hexdigest(),
        "extractedLineCount": len(lines),
    }


def build_index(records: list[dict[str, object]], output_pdf: Path) -> None:
    sheet_styles = styles()
    doc = BaseDocTemplate(
        str(output_pdf), pagesize=letter, leftMargin=0.5 * inch, rightMargin=0.5 * inch,
        topMargin=0.94 * inch, bottomMargin=0.56 * inch,
        title="Titan Diamond USA Product Sheet Library", author="Titan Diamond USA",
    )
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="content")
    doc.addPageTemplates([PageTemplate(id="Titan", frames=[frame], onPage=header_footer)])
    story = [
        Paragraph("PRODUCT SHEET LIBRARY", sheet_styles["eyebrow"]),
        Paragraph("Titan Diamond USA<br/>Contractor Product Sheets", sheet_styles["indexTitle"]),
        Paragraph("A field-ready reference organized by product family. Pricing and availability remain account-specific.", sheet_styles["type"]),
        Spacer(1, 8),
    ]
    grouped: dict[str, list[dict[str, object]]] = defaultdict(list)
    for record in records:
        grouped[str(record["category"])].append(record)
    for category in sorted(grouped):
        story.append(Paragraph(category.upper(), sheet_styles["section"]))
        rows = [[Paragraph("PRODUCT", sheet_styles["eyebrow"]), Paragraph("TYPE", sheet_styles["eyebrow"])]]
        for record in grouped[category]:
            rows.append([
                Paragraph(html.escape(str(record["productName"])), sheet_styles["body"]),
                Paragraph(html.escape(str(record["typeName"])), sheet_styles["body"]),
            ])
        table = Table(rows, colWidths=[3.7 * inch, 2.8 * inch], repeatRows=1)
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), BLACK),
            ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
            ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#D9DCE2")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 7),
            ("RIGHTPADDING", (0, 0), (-1, -1), 7),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        story.extend([table, Spacer(1, 8)])
    doc.build(story)


def main() -> None:
    parser = argparse.ArgumentParser(description="Build Titan-branded product sheets from the official GT publication index.")
    parser.add_argument("--download", action="store_true", help="Download source PDFs and thumbnails before building.")
    args = parser.parse_args()
    items = inventory()
    if len(items) != 51:
        raise RuntimeError(f"Expected 51 named sheets from the current official index; found {len(items)}")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    records = []
    for item in items:
        source_name = Path(str(item["sourceUrl"]).split("?", 1)[0]).name
        source_pdf = SOURCE_DIR / source_name
        thumb_ext = Path(str(item["thumbnailUrl"]).split("?", 1)[0]).suffix or ".jpg"
        thumb = THUMB_DIR / f'{safe_slug(str(item["productName"]))}{thumb_ext}'
        if args.download:
            download(str(item["sourceUrl"]), source_pdf)
            download(str(item["thumbnailUrl"]), thumb)
        if not source_pdf.exists():
            raise FileNotFoundError(f"Missing source PDF: {source_pdf}")
        output_pdf = OUTPUT_DIR / f'titan-{safe_slug(str(item["productName"]))}.pdf'
        records.append(build_sheet(item, source_pdf, thumb, output_pdf))
    index_pdf = OUTPUT_DIR / "titan-product-sheet-library-index.pdf"
    build_index(records, index_pdf)
    MANIFEST.write_text(json.dumps({"count": len(records), "sheets": records}, indent=2), encoding="utf-8")
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    for pdf in OUTPUT_DIR.glob("*.pdf"):
        shutil.copy2(pdf, PUBLIC_DIR / pdf.name)
    shutil.copy2(MANIFEST, PUBLIC_DIR / MANIFEST.name)
    print(json.dumps({"sheets": len(records), "index": str(index_pdf), "manifest": str(MANIFEST)}, indent=2))


if __name__ == "__main__":
    main()
