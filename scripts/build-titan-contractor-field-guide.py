from pathlib import Path
import shutil

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import BaseDocTemplate, Frame, PageBreak, PageTemplate, Paragraph, Spacer, Table, TableStyle

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "pdf" / "titan-contractor-field-guide.pdf"
PUBLIC = ROOT / "public" / "downloads" / "titan-contractor-field-guide.pdf"
LOGO = ROOT / "public" / "images" / "brand" / "logo-system" / "titan-horizontal-light.png"
BLACK = colors.HexColor("#080A0D")
ORANGE = colors.HexColor("#FF7900")
INK = colors.HexColor("#16191E")
GRAY = colors.HexColor("#667085")
PALE = colors.HexColor("#F3F4F6")

SPEEDS = [
    ["4", "1", "3/4", "9,075", "15,000"], ["4-1/2", "1-1/4", "1", "8,065", "13,300"],
    ["5", "1-1/2", "1-1/4", "7,255", "12,000"], ["7", "2-1/2", "2-1/4", "5,185", "8,730"],
    ["8", "3", "2-3/4", "4,535", "7,640"], ["10", "3-3/4", "3-3/4", "3,630", "6,115"],
    ["12", "3-5/8 flat", "-", "3,025", "5,095"], ["14", "4-5/8 flat / 5 masonry", "-", "2,595", "4,365"],
    ["16", "5-5/8 flat / 6 masonry", "-", "2,270", "3,820"], ["18", "6-5/8 flat / 7 masonry", "-", "2,015", "3,395"],
    ["20", "7-5/8 flat / 8 masonry", "-", "1,815", "3,055"], ["24", "9-5/8 flat", "-", "1,510", "2,550"],
    ["30", "11-3/4 flat", "-", "1,120", "2,040"], ["36", "14-3/4 flat", "-", "1,010", "1,700"],
    ["42", "17-3/4 flat", "-", "865", "1,455"], ["48", "19-3/4 flat", "-", "755", "1,275"],
]

def decorate(canvas, doc):
    width, height = letter
    canvas.saveState()
    canvas.setFillColor(BLACK); canvas.rect(0, height - .68*inch, width, .68*inch, fill=1, stroke=0)
    canvas.drawImage(str(LOGO), .42*inch, height-.53*inch, width=1.7*inch, height=.28*inch, preserveAspectRatio=True, mask="auto", anchor="sw")
    canvas.setFillColor(ORANGE); canvas.rect(0, height-.72*inch, width, .04*inch, fill=1, stroke=0)
    canvas.setFillColor(BLACK); canvas.rect(0, 0, width, .38*inch, fill=1, stroke=0)
    canvas.setFillColor(colors.white); canvas.setFont("Helvetica-Bold", 7.5)
    canvas.drawString(.42*inch, .15*inch, "TITAN DIAMOND USA | CONTRACTOR FIELD GUIDE")
    canvas.setFont("Helvetica", 7.5); canvas.drawRightString(width-.42*inch, .15*inch, f"(480) 470-2577 | Page {doc.page}")
    canvas.restoreState()

base = getSampleStyleSheet()
styles = {
    "eyebrow": ParagraphStyle("eyebrow", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=8, leading=10, textColor=ORANGE, spaceAfter=7),
    "title": ParagraphStyle("title", parent=base["Title"], fontName="Helvetica-Bold", fontSize=31, leading=33, textColor=BLACK, spaceAfter=10),
    "h1": ParagraphStyle("h1", parent=base["Heading1"], fontName="Helvetica-Bold", fontSize=23, leading=26, textColor=BLACK, spaceAfter=10),
    "h2": ParagraphStyle("h2", parent=base["Heading2"], fontName="Helvetica-Bold", fontSize=13, leading=16, textColor=INK, spaceBefore=9, spaceAfter=5),
    "body": ParagraphStyle("body", parent=base["BodyText"], fontName="Helvetica", fontSize=9.2, leading=13, textColor=INK, spaceAfter=6),
    "small": ParagraphStyle("small", parent=base["BodyText"], fontName="Helvetica", fontSize=7.5, leading=10, textColor=GRAY, spaceAfter=4),
    "cell": ParagraphStyle("cell", parent=base["BodyText"], fontName="Helvetica", fontSize=7.2, leading=9, textColor=INK),
    "cellHead": ParagraphStyle("cellHead", parent=base["BodyText"], fontName="Helvetica-Bold", fontSize=7.2, leading=9, textColor=colors.white),
    "callout": ParagraphStyle("callout", parent=base["BodyText"], fontName="Helvetica-Bold", fontSize=10, leading=14, textColor=BLACK, backColor=colors.HexColor("#FFF1E6"), borderColor=ORANGE, borderWidth=.6, borderPadding=10, spaceAfter=10),
}

def p(text, style="body"):
    return Paragraph(text, styles[style])

def bullet(text):
    return Paragraph(f"• {text}", styles["body"])

def table(rows, widths):
    wrapped = []
    for row_index, row in enumerate(rows):
        wrapped.append([Paragraph(str(value), styles["cellHead" if row_index == 0 else "cell"]) for value in row])
    result = Table(wrapped, colWidths=widths, repeatRows=1)
    result.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), BLACK), ("TEXTCOLOR", (0,0), (-1,0), colors.white),
        ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"), ("FONTSIZE", (0,0), (-1,-1), 7.5),
        ("GRID", (0,0), (-1,-1), .35, colors.HexColor("#D7DAE0")), ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("LEFTPADDING", (0,0), (-1,-1), 6), ("RIGHTPADDING", (0,0), (-1,-1), 6),
        ("TOPPADDING", (0,0), (-1,-1), 5), ("BOTTOMPADDING", (0,0), (-1,-1), 5),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, PALE]),
    ]))
    return result

def build():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    doc = BaseDocTemplate(str(OUT), pagesize=letter, leftMargin=.52*inch, rightMargin=.52*inch, topMargin=.94*inch, bottomMargin=.58*inch,
                          title="Titan Diamond USA Contractor Field Guide", author="Titan Diamond USA")
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="content")
    doc.addPageTemplates([PageTemplate(id="Titan", frames=[frame], onPage=decorate)])
    story = [
        Spacer(1, .35*inch), p("CONTRACTOR TECHNICAL SERIES", "eyebrow"),
        p("Diamond Tool<br/>Field Guide", "title"),
        p("Select, mount, operate, troubleshoot, and reorder professional diamond tooling with less guesswork.", "h2"),
        Spacer(1, .22*inch), p("THE SIX FACTS THAT DRIVE EVERY RECOMMENDATION", "eyebrow"),
        table([["1. SAW", "2. MATERIAL", "3. AGGREGATE"], ["Model, horsepower, arbor", "Concrete age, asphalt, masonry, stone", "Hard, medium, soft, unknown"],
               ["4. CUT", "5. COOLING", "6. PRODUCTION"], ["Diameter, depth, rebar", "Wet, dry, available flow", "Daily footage, speed, finish"]], [2.18*inch]*3),
        Spacer(1, .25*inch), p("Use the Blade Finder at tdusales.com/blade-finder or call (480) 470-2577 when any one of these facts is unknown.", "callout"),
        p("Safety first", "h2"), bullet("Use only a blade specifically rated for the machine, material, direction, and operating speed."),
        bullet("Never exceed the lower of the blade's marked maximum RPM or the saw manufacturer's limit."),
        bullet("Inspect guards, flanges, arbor fit, blade condition, water delivery, and rotation before every shift."),
        bullet("Follow the saw manual, blade label, applicable ANSI/OSHA requirements, and the jobsite safety plan."),
        PageBreak(), p("BLADE SELECTION", "eyebrow"), p("Match the bond to the material", "h1"),
        p("Diamond crystals do the cutting while the bond controls how quickly worn diamonds release. The correct bond exposes fresh cutting points at a rate matched to the material's abrasiveness."),
        table([["Material condition", "Typical selection direction", "Watch for"],
               ["Hard cured concrete / hard aggregate", "Softer bond", "Glazing, slow cutting, heat"],
               ["Green concrete / asphalt / abrasive block", "Harder bond with undercut protection", "Fast segment wear, core undercut"],
               ["Reinforced concrete", "Application-rated blade and suitable horsepower", "Heat, pinching, side pressure"],
               ["Tile / porcelain / glass", "Continuous or application-specific rim", "Chipping, overheating, feed pressure"],
               ["Granite / engineered stone / quartzite", "Stone-specific bond and rim geometry", "Deflection, edge quality, coolant flow"]], [1.65*inch, 2.65*inch, 2.25*inch]),
        p("Segment and rim choices", "h2"),
        bullet("Segmented rims prioritize debris clearance and cooling for production cutting."),
        bullet("Turbo rims balance speed with a cleaner edge on masonry, stone, and tile applications."),
        bullet("Continuous rims prioritize finish quality for tile, glass, and delicate materials."),
        bullet("Undercut protection helps protect the steel core where abrasive slurry attacks beneath the segment."),
        p("Wet or dry", "h2"), p("Use water whenever the product and machine are designed for it. Adequate flow cools the segment, controls dust, and carries fines out of the cut. A dry-rated blade still needs cooling pauses and correct feed pressure; never force a blade that is slowing or changing sound."),
        PageBreak(), p("OPERATING REFERENCE", "eyebrow"), p("Cutting depth and RPM", "h1"),
        p("Depths are approximate. Flange diameter, saw geometry, blade diameter, and component condition change usable depth. High-speed saw limits can differ from general recommended speeds."),
        Spacer(1, 8), p("Never exceed the marked blade or saw limit.", "callout"),
        table([["Blade", "Typical depth", "Tile depth", "Rec. RPM", "Max RPM"]] + SPEEDS, [.65*inch, 2.35*inch, .8*inch, 1.0*inch, 1.0*inch]),
        PageBreak(), p("SETUP & OPERATION", "eyebrow"), p("A clean mount makes a clean cut", "h1"),
        p("Before mounting", "h2"), bullet("Disconnect power or disable the engine. Inspect the blade for cracks, missing segments, distortion, glazing, and shipping damage."),
        bullet("Clean the arbor, flanges, and contact surfaces. Confirm arbor size, drive pin, rotation arrow, and flange diameter."),
        bullet("Do not use makeshift bushings, damaged flanges, or a blade that does not seat flat."),
        p("During the cut", "h2"), bullet("Bring the blade to operating speed before entering the material and keep the cut straight."),
        bullet("Use steady feed pressure. Do not twist, pry, side-load, or use a cutting blade for unauthorized grinding."),
        bullet("Maintain specified water flow on wet systems and control silica dust with compliant engineering controls."),
        bullet("Stop if vibration, unusual noise, color change, loss of tension, or segment damage appears."),
        p("After the cut", "h2"), bullet("Allow the blade to stop normally. Inspect it before the next operation and record unusual wear while the job conditions are still known."),
        table([["Equipment", "Information to confirm"], ["Angle grinder", "Guard, arbor, side handle, rated diameter/RPM"],
               ["High-speed cutoff saw", "Rotation, drive pin, guard, dry/wet rating, max RPM"], ["Walk-behind saw", "Horsepower, shaft speed, flange, depth, water flow"],
               ["Masonry / tile saw", "Capacity, arbor, cart alignment, pump flow, material support"], ["Core rig", "Thread, diameter, stand anchoring, water swivel, RPM/gear"]], [2.0*inch, 4.0*inch]),
        PageBreak(), p("TROUBLESHOOTING", "eyebrow"), p("Read the wear pattern", "h1"),
        table([["Symptom", "Likely checks", "Immediate response"],
               ["Will not cut", "Bond too hard, glazing, low power, wrong rotation", "Stop forcing; verify application and approved dressing method"],
               ["Short life", "Bond too soft, abrasive material, low water, misalignment", "Verify blade family, flow, bearings, and tracking"],
               ["Segment loss", "Heat, impact, pinching, loose mount, undercut", "Stop immediately; remove blade from service"],
               ["Cracked core", "Side pressure, twisting, impact, loose flanges", "Stop immediately; never repair or reuse"],
               ["Uneven wear", "Bad bearings, bent shaft, misalignment, unequal water", "Service saw and correct water delivery"],
               ["Excess vibration", "Arbor fit, flanges, blade flatness, bearings, overspeed", "Stop immediately and inspect complete system"],
               ["Burning / discoloration", "Insufficient cooling, excessive feed, wrong bond", "Stop; correct cooling and application before reuse"]], [1.25*inch, 2.65*inch, 2.3*inch]),
        p("Capture what happened", "h2"), p("Record the SKU, blade diameter, saw model, RPM, material and aggregate, wet/dry condition, footage, depth, failure location, and clear photos. This turns a complaint into an actionable technical diagnosis."),
        PageBreak(), p("CORE DRILLING", "eyebrow"), p("Control the rig before the bit", "h1"),
        bullet("Anchor or vacuum-mount the stand exactly as the equipment manufacturer requires; confirm the base cannot shift."),
        bullet("Match bit diameter, barrel length, thread, segment specification, motor power, and gear/RPM to the material."),
        bullet("Start square, establish a stable kerf, and use enough water to cool the segments and evacuate slurry."),
        bullet("When rebar is encountered, maintain alignment and controlled feed. Do not lever the barrel or force a stalled motor."),
        bullet("If the bit binds, stop power before attempting removal. Check loose aggregate, segment condition, core wedging, and stand movement."),
        p("Common drilling symptoms", "h2"),
        table([["Symptom", "Check first"], ["Slow penetration", "Bond/application, glaze, RPM/gear, feed, motor load"],
               ["Barrel binds", "Stand movement, loose core, debris evacuation, bent barrel"], ["Segment wear accelerates", "Abrasive material, water flow, excessive RPM or pressure"],
               ["Core breaks repeatedly", "Rig alignment, rebar, interrupted cut, material condition"], ["Water does not return", "Blocked kerf, insufficient flow, deep-hole evacuation"]], [2.0*inch, 4.0*inch]),
        PageBreak(), p("JOB & REORDER RECORD", "eyebrow"), p("Make the next recommendation better", "h1"),
        table([["Field", "Record"], ["Customer / job", ""], ["Saw model / horsepower", ""], ["Material / aggregate", ""], ["Blade or bit SKU", ""],
               ["Diameter / arbor / thread", ""], ["Depth / rebar", ""], ["Wet or dry / water flow", ""], ["Daily footage", ""], ["Observed life / speed", ""],
               ["What should improve", ""], ["Recommended next configuration", ""]], [2.2*inch, 3.8*inch]),
        Spacer(1, .2*inch), p("Titan Diamond application support", "h2"), p("Call (480) 470-2577 or use the Blade Finder. Product availability, machine compatibility, and specifications must be confirmed before ordering."),
        p("Technical reference compiled by Titan Diamond USA from manufacturer data and general diamond-tool operating principles. It does not replace the product label, machine manual, qualified operator training, or applicable safety requirements.", "small"),
    ]
    doc.build(story)
    PUBLIC.parent.mkdir(parents=True, exist_ok=True); shutil.copy2(OUT, PUBLIC)
    print(OUT)

if __name__ == "__main__":
    build()
