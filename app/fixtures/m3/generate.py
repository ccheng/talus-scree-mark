"""Build public, synthetic M3 answer-sheet examples. No private benchmark inputs."""
import argparse
import hashlib
import json
from pathlib import Path

import fitz
from reportlab.lib.colors import Color, HexColor
from reportlab.pdfgen import canvas

WIDTH, HEIGHT = 612, 792
INK = HexColor("#20252c")
SUBTLE = HexColor("#5d6570")
LINE = HexColor("#bbc1c9")


def mc_block(heading, first, rows, x, y, alphabet="ABCD", dx=24, dy=18, radius=3.6):
    items = []
    for row in range(rows):
        cy = y + dy * row
        choices = [{"symbol": symbol, "x": x + 32 + dx * col, "y": cy, "radius": radius}
                   for col, symbol in enumerate(alphabet)]
        items.append({"id": f"MC{first + row}", "kind": "mc", "choices": choices})
    return {"label": heading, "kind": "mc", "x": x, "y": y, "items": items}


def nr_block(heading, number, x, y, dx=24, dy=9.9, radius=3.5):
    slots = []
    for col in range(4):
        choices = []
        if col in (1, 2):
            choices.append({"symbol": ".", "x": x + dx * col, "y": y, "radius": radius})
        choices.extend({"symbol": str(digit), "x": x + dx * col, "y": y + (digit + 1) * dy,
                        "radius": radius} for digit in range(10))
        slots.append({"id": f"NR{number}.{col + 1}", "choices": choices})
    item = {"id": f"NR{number}", "kind": "nr", "slots": slots}
    return {"label": heading, "kind": "nr", "x": x, "y": y, "items": [item]}


def all_options(item):
    if item["kind"] == "mc":
        return item["choices"]
    return [choice for slot in item["slots"] for choice in slot["choices"]]


def add_geometry(spec):
    for block in spec["blocks"]:
        for item in block["items"]:
            choices = all_options(item)
            left = min(c["x"] - c["radius"] for c in choices) - 4
            top = min(c["y"] - c["radius"] for c in choices) - 4
            right = max(c["x"] + c["radius"] for c in choices) + 4
            bottom = max(c["y"] + c["radius"] for c in choices) + 4
            item["bounds"] = {"x": round(left, 3), "y": round(top, 3), "width": round(right - left, 3),
                              "height": round(bottom - top, 3)}
        block["region"] = make_region([choice for item in block["items"] for choice in all_options(item)])
    return spec


def make_region(choices):
    left = min(c["x"] - c["radius"] for c in choices) - 7
    top = min(c["y"] - c["radius"] for c in choices) - 7
    right = max(c["x"] + c["radius"] for c in choices) + 7
    bottom = max(c["y"] + c["radius"] for c in choices) + 7
    return {"x": round(left, 3), "y": round(top, 3), "width": round(right - left, 3),
            "height": round(bottom - top, 3)}


def public_specs():
    specs = [
        {"slug": "mc-only", "title": "Kinematics Checkpoint", "subtitle": "Selected-response answer sheet",
         "unit": "Practice form K", "sections": [("Choose one answer in each row.", 58, 154),
                                                 ("Review both columns before handing in the sheet.", 58, 530)],
         "blocks": [mc_block("Questions 1–12", 1, 12, 58, 211, dy=22),
                    mc_block("Questions 13–24", 13, 12, 333, 211, dy=22)],
         "note": "Use A–D. If you change an answer, erase the original mark fully.",
         "numerical": {}},
        {"slug": "mixed", "title": "Chemistry Practice", "subtitle": "Multiple-choice and numerical response",
         "unit": "Practice form C", "sections": [("Part A   Selected response", 58, 152),
                                                 ("Part B   Numerical response", 58, 417)],
         "blocks": [mc_block("Questions 1–8", 1, 8, 58, 194, dy=20),
                    mc_block("Questions 9–16", 9, 8, 319, 194, dy=20),
                    nr_block("NR 1", 1, 82, 461), nr_block("NR 2", 2, 218, 461),
                    nr_block("NR 3", 3, 354, 461), nr_block("NR 4", 4, 490, 461)],
         "note": "For numerical responses, fill the matching bubbles in up to four positions.",
         "numerical": {"NR1": "5.3 ", "NR2": "12.3", "NR3": "0.25", "NR4": "3008"}},
        {"slug": "interleaved", "title": "Science Skills Review", "subtitle": "Record responses in the matching block",
         "unit": "Practice form S", "sections": [("Section A   Observation and measurement", 58, 144),
                                                 ("Section B   Analysis and interpretation", 58, 338),
                                                 ("Section C   Experimental design", 58, 531)],
         "blocks": [mc_block("Questions 1–5", 1, 5, 61, 205, "ABCDE", dx=26, dy=17),
                    nr_block("NR 1", 1, 416, 183),
                    nr_block("NR 2", 2, 101, 386),
                    mc_block("Questions 6–11", 6, 6, 331, 401, dy=17),
                    mc_block("Questions 12–17", 12, 6, 62, 600, dy=17),
                    nr_block("NR 3", 3, 416, 583)],
         "note": "The answer blocks follow section order. Follow the printed item labels.",
         "numerical": {"NR1": "004 ", "NR2": "7.00", "NR3": "    "}},
    ]
    return [add_geometry(spec) for spec in specs]


def y(pdf_top):
    return HEIGHT - pdf_top


def label(pdf, value, x, top, size=9, bold=False, color=INK):
    pdf.setFillColor(color)
    pdf.setFont("Helvetica-Bold" if bold else "Helvetica", size)
    pdf.drawString(x, y(top), value)


def rule(pdf, x1, x2, top, color=LINE):
    pdf.setStrokeColor(color)
    pdf.setLineWidth(.65)
    pdf.line(x1, y(top), x2, y(top))


def ring(pdf, choice, filled):
    x, top, radius = (choice[name] for name in ("x", "y", "radius"))
    pdf.setStrokeColor(INK)
    pdf.setLineWidth(.8)
    pdf.circle(x, y(top), radius, stroke=1, fill=0)
    if filled:
        pdf.setFillColor(Color(.16, .16, .16))
        pdf.circle(x + .12, y(top - .12), radius * .78, stroke=0, fill=1)


def answers_for(spec):
    answers = {}
    count = 0
    for block in spec["blocks"]:
        for item in block["items"]:
            if item["kind"] == "mc":
                options = item["choices"]
                raw = None if count % 11 == 6 else options[(count * 3 + count // 4 + 1) % len(options)]["symbol"]
                answers[item["id"]] = {"kind": "mc", "state": "blank" if raw is None else "single", "rawText": raw}
                count += 1
            else:
                raw = spec["numerical"][item["id"]]
                slots = [None if cell == " " else cell for cell in raw]
                answers[item["id"]] = {"kind": "nr", "state": "blank" if not raw.strip() else "single",
                                       "rawText": raw, "slots": slots}
    return answers


def draw_profile(destination, spec, answers=None):
    pdf = canvas.Canvas(str(destination), pagesize=(WIDTH, HEIGHT), invariant=True, pageCompression=1)
    pdf.setTitle(f"{spec['title']} — synthetic answer sheet")
    pdf.setAuthor("Talus Scree Mark synthetic fixtures")
    label(pdf, spec["title"], 56, 62, 24, True)
    label(pdf, spec["subtitle"], 57, 82, 11, False, SUBTLE)
    label(pdf, spec["unit"], 463, 61, 11, True)
    label(pdf, "Name", 57, 112, 9, True)
    label(pdf, "Date", 392, 112, 9, True)
    rule(pdf, 89, 336, 113)
    rule(pdf, 421, 556, 113)
    for text, x, top in spec["sections"]:
        label(pdf, text, x, top, 10, True)
        if text.startswith(("Part", "Section")):
            rule(pdf, x, 550, top + 8)

    for block in spec["blocks"]:
        x, top = block["x"], block["y"]
        if block["kind"] == "mc":
            label(pdf, block["label"], x, top - 22, 9, True)
            for choice in block["items"][0]["choices"]:
                label(pdf, choice["symbol"], choice["x"] - 2.4, top - 10, 7.2, True)
            for item in block["items"]:
                label(pdf, item["id"][2:], x + 1, item["choices"][0]["y"] + 2.6, 8.2)
                raw = answers[item["id"]]["rawText"] if answers else None
                for choice in item["choices"]:
                    ring(pdf, choice, choice["symbol"] == raw)
        else:
            label(pdf, block["label"], x - 24, top - 13, 8.8, True)
            item = block["items"][0]
            for pos, slot in enumerate(item["slots"]):
                label(pdf, str(pos + 1), slot["choices"][0]["x"] - 1.8, top - 12, 7.2, True)
                raw = answers[item["id"]]["slots"][pos] if answers else None
                for choice in slot["choices"]:
                    ring(pdf, choice, choice["symbol"] == raw)
            for choice in item["slots"][1]["choices"]:
                label(pdf, choice["symbol"], x - 12, choice["y"] + 2.3, 6.4, False, SUBTLE)

    rule(pdf, 57, 556, 742)
    label(pdf, spec["note"], 57, 756, 8.6, False, SUBTLE)
    label(pdf, "SYNTHETIC PRACTICE MATERIAL", 57, 772, 7.3, True, SUBTLE)
    label(pdf, "1 / 1", 526, 772, 7.3, False, SUBTLE)
    pdf.showPage()
    pdf.save()


def make_png(pdf_path, png_path):
    with fitz.open(pdf_path) as pdf:
        page = pdf[0]
        page.get_pixmap(matrix=fitz.Matrix(2.5, 2.5), colorspace=fitz.csGRAY, alpha=False).save(png_path)


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def build(target):
    target.mkdir(parents=True, exist_ok=True)
    fixture_files = []
    for spec in public_specs():
        slug = spec["slug"]
        answers = answers_for(spec)
        for kind, data in (("blank", None), ("filled", answers)):
            pdf_path = target / f"{slug}-{kind}.pdf"
            png_path = target / f"{slug}-{kind}.png"
            draw_profile(pdf_path, spec, data)
            make_png(pdf_path, png_path)
            fixture_files.extend((pdf_path, png_path))
        key = target / f"{slug}-key.json"
        write_json(key, {"id": slug, "name": spec["title"], "paper": {"width": WIDTH, "height": HEIGHT, "units": "pt"},
                         "itemOrder": list(answers), "expected": answers,
                         "blocks": [{"kind": block["kind"], "label": block["label"], "bounds": block["region"],
                                     "items": block["items"]} for block in spec["blocks"]]})
        fixture_files.append(key)
    manifest = {path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in sorted(fixture_files)}
    write_json(target / "manifest.sha256.json", manifest)
    print(f"Generated {len(fixture_files)} synthetic artifacts across {len(public_specs())} layouts.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parent)
    build(parser.parse_args().output)
