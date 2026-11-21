"""Create independent M2 marks and camera-like transforms on the printable reference."""

import argparse
from hashlib import sha256
import json
from pathlib import Path
import random
from subprocess import run
from tempfile import TemporaryDirectory

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageOps


DPI = 144
CANONICAL_WIDTH = 612
CANONICAL_HEIGHT = 792
POINT_SCALE = DPI / 72
BASELINE_TOKENS = ("5.3 ", "12.3", "0.25", "3008", "    ", "03.0", "1   ", "1010")
INVALID_TOKENS = (" 123", "5. 2", "5..3", "12. ")


def homography(source, target):
    """Obtain a known transform from the four fixed fixture corner correspondences."""
    equations = []
    for (x, y), (u, v) in zip(source, target):
        equations.append([x, y, 1, 0, 0, 0, -u * x, -u * y, u])
        equations.append([0, 0, 0, x, y, 1, -v * x, -v * y, v])
    for index in range(8):
        pivot = max(range(index, 8), key=lambda row: abs(equations[row][index]))
        equations[index], equations[pivot] = equations[pivot], equations[index]
        row = equations[index]
        value = row[index]
        assert abs(value) > 1e-12
        equations[index] = [cell / value for cell in row]
        for other in range(8):
            if other == index:
                continue
            row = equations[other]
            factor = row[index]
            equations[other] = [a - factor * b for a, b in zip(row, equations[index])]
    return [row[-1] for row in equations]


def answer_pattern(items, seed):
    dice = random.Random(seed)
    truth = []
    for index, item in enumerate(items):
        if item['kind'] == 'mc':
            symbols = [option['symbol'] for option in item['choices']]
            selected = (None if dice.randrange(13) == 0 else symbols[(seed + index + dice.randrange(4)) % 4])
            truth.append({'id': item['id'], 'status': 'recognized' if selected else 'blank', 'rawText': selected})
            continue
        slot_index = index - sum(other['kind'] == 'mc' for other in items[:index])
        token = BASELINE_TOKENS[(slot_index + seed) % len(BASELINE_TOKENS)] if seed < 8 else ''.join(str(dice.randrange(10)) for _ in range(4))
        truth.append({'id': item['id'], 'status': 'recognized' if token.strip() else 'blank', 'rawText': token})
    return truth


def mark(draw, option, value=26):
    x, y = (option[axis] * POINT_SCALE for axis in ('x', 'y'))
    radius = option['radius'] * POINT_SCALE * 0.80
    draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=(value,) * 3)


def marked_page(blank, items, truth):
    rendered = blank.copy()
    canvas = ImageDraw.Draw(rendered)
    for item, expected in zip(items, truth):
        text = expected['rawText']
        if item['kind'] == 'mc':
            if text:
                mark(canvas, next(option for option in item['choices'] if option['symbol'] == text))
            continue
        for slot, symbol in zip(item['slots'], text):
            if symbol != ' ':
                mark(canvas, next(option for option in slot['choices'] if option['symbol'] == symbol))
    return rendered


def box_from_points(x, y, width, height):
    return tuple(round(position * POINT_SCALE) for position in (x, y, x + width, y + height))


def code_box(marker, extra=0):
    """The profile's code locations are mark midpoints in page points."""
    half = marker['size'] / 2
    return box_from_points(marker['x'] - half - extra, marker['y'] - half - extra, marker['size'] + 2 * extra, marker['size'] + 2 * extra)


def erase_code(image, marker):
    ImageDraw.Draw(image).rectangle(code_box(marker, 1.5), fill='white')


def alternate_revision(image, marker):
    # Preserve border and geometry. Change the bits independently of the app renderer.
    draw = ImageDraw.Draw(image)
    cell = marker['size'] / 6
    left = marker['x'] - marker['size'] / 2
    top = marker['y'] - marker['size'] / 2
    for y, row in enumerate(marker['code'], 1):
        for x, value in enumerate(row, 1):
            draw.rectangle(box_from_points(left + x * cell, top + y * cell, cell, cell), fill='white' if value == '1' else 'black')


def capture(page, index):
    source_corners = [(0, 0), (page.width, 0), (page.width, page.height), (0, page.height)]
    rotation = index % 4
    family = index // 4
    settings = [
        (1.00, [(0, 0), (0, 0), (0, 0), (0, 0)]),
        (0.76, [(8, 16), (-4, 3), (4, 12), (0, -6)]),
        (0.90, [(25, 34), (-36, 0), (-10, 16), (20, -26)]),
        (1.03, [(12, -12), (40, 15), (25, -15), (-22, 6)]),
        (0.83, [(-14, 9), (8, 20), (-18, -8), (17, 18)]),
    ]
    scale, offsets = settings[family]
    w, h = page.width * scale, page.height * scale
    quad = [(0, 0), (w, 0), (w, h), (0, h)]
    skew = [(x + dx, y + dy) for (x, y), (dx, dy) in zip(quad, offsets)]
    for _ in range(rotation):
        skew = [(-y, x) for x, y in skew]
    x0, y0 = (min(point[axis] for point in skew) for axis in (0, 1))
    destination = [(x - x0 + 48 + 5 * family, y - y0 + 55 + 3 * rotation) for x, y in skew]
    width = round(max(x for x, _ in destination) + 64)
    height = round(max(y for _, y in destination) + 70)
    image_to_raster = homography(destination, source_corners)
    raster_corners = [(x / POINT_SCALE, y / POINT_SCALE) for x, y in source_corners]
    page_to_image = homography(raster_corners, destination)
    transformed = page.transform((width, height), Image.Transform.PERSPECTIVE, image_to_raster,
                                 resample=Image.Resampling.BICUBIC, fillcolor=(166, 169, 170))
    return transformed, page_to_image, rotation * 90


def fixture_setup(app, out):
    profile_path = app / 'reference' / 'profile.json'
    profile = json.loads(profile_path.read_text())
    items = profile['items']
    assert [i['kind'] for i in items].count('mc') == 12
    assert [i['kind'] for i in items].count('nr') == 4
    assert len(profile['anchors']) == 4 and len(profile['checks']) >= 6
    out.mkdir(parents=True, exist_ok=True)
    profile_sha256 = sha256(profile_path.read_bytes()).hexdigest()
    official_digest = (app / 'reference' / 'profile.sha256').read_text().split()[0]
    assert official_digest == profile_sha256
    def rasterize_pdf(name):
        with TemporaryDirectory() as tmp:
            raster = Path(tmp) / name
            run(['pdftoppm', '-f', '1', '-l', '1', '-r', str(DPI), '-png', '-singlefile',
                 str(app / 'reference' / f'reference-{name}.pdf'), str(raster)], check=True)
            image = Image.open(raster.with_suffix('.png')).convert('RGB')
        assert image.size == (round(CANONICAL_WIDTH * POINT_SCALE), round(CANONICAL_HEIGHT * POINT_SCALE))
        return image

    return profile, rasterize_pdf('blank'), rasterize_pdf('filled'), items, profile_sha256


def generate(app, out):
    profile, blank, filled, items, digest = fixture_setup(app, out)
    records = []

    def save(name, image, mode, *, truth=None, geometry=None, rotation=None, note=None):
        filename = f'{name}.jpg'
        image.save(out / filename, quality=93, subsampling=0)
        records.append({'id': name, 'file': filename, 'mode': mode, 'truth': truth,
                        'geometry': geometry, 'rotation': rotation, 'note': note})

    for index in range(20):
        truth = answer_pattern(items, index)
        image, geometry, rotation = capture(marked_page(blank, items, truth), index)
        save(f'standard-{index:02d}', image, 'standard', truth=truth, geometry=geometry, rotation=rotation)

    example_key = json.loads((app / 'reference' / 'reference-key.json').read_text())
    assert example_key['profile']['sha256'] == digest
    example_truth = [{'id': item['id'], **example_key['items'][item['id']]} for item in items]
    save('official-example-from-printable-pdf', filled, 'official-example', truth=example_truth)

    base_truth = answer_pattern(items, 35)
    seeded = marked_page(blank, items, base_truth)
    for index, anchor in enumerate(profile['anchors']):
        image = seeded.copy()
        erase_code(image, anchor)
        save(f'no-anchor-{index}', image, 'must-retake')
    identity = profile['discriminator']
    image = seeded.copy()
    erase_code(image, identity)
    save('no-layout-identity', image, 'must-retake')
    image = seeded.copy()
    alternate_revision(image, identity)
    save('alternate-layout-revision', image, 'must-retake')
    save('mirrored-page', ImageOps.mirror(seeded), 'must-retake')
    save('page-crop-and-clipped-anchor', seeded.crop((110, 95, seeded.width, seeded.height)), 'must-retake')
    save('insufficient-frame', blank.crop((160, 160, 360, 400)), 'must-retake')
    check = profile['checks'][3]
    x, y, radius = (check[key] for key in ('x', 'y', 'radius'))
    checked = seeded.copy()
    draw = ImageDraw.Draw(checked)
    draw.rectangle(box_from_points(x - radius - 1, y - radius - 1, 2 * radius + 2, 2 * radius + 2), fill='white')
    save('missing-interior-check-with-valid-anchors', checked, 'must-retake')
    draw.ellipse(box_from_points(x + 2.8 - radius, y - radius, 2 * radius, 2 * radius), fill='black')
    save('displaced-interior-check-with-valid-anchors', checked, 'must-retake')

    doubled = seeded.copy()
    mc = next(item for item in items if item['kind'] == 'mc')
    for choice in mc['choices'][:2]:
        mark(ImageDraw.Draw(doubled), choice)
    doubled_truth = [entry.copy() for entry in base_truth]
    doubled_truth[items.index(mc)] = {'id': mc['id'], 'status': 'multiple', 'rawText': None}
    save('unmistakable-mc-double', doubled, 'must-review-items', truth=doubled_truth, note=mc['id'])

    multi_nr = seeded.copy()
    nr = next(item for item in items if item['kind'] == 'nr')
    for choice in nr['slots'][1]['choices'][:2]:
        mark(ImageDraw.Draw(multi_nr), choice)
    nr_truth = [entry.copy() for entry in base_truth]
    nr_truth[items.index(nr)] = {'id': nr['id'], 'status': 'multiple', 'rawText': None}
    save('unmistakable-nr-double-slot', multi_nr, 'must-review-items', truth=nr_truth, note=nr['id'])

    invalid_truth = [entry.copy() for entry in base_truth]
    for entry, token in zip((entry for entry, item in zip(invalid_truth, items) if item['kind'] == 'nr'), INVALID_TOKENS):
        entry.update(status='literal-review', rawText=token)
    save('invalid-nr-literals-preserved', marked_page(blank, items, invalid_truth), 'must-review-items', truth=invalid_truth)

    occluded = seeded.copy()
    bounds = mc['bounds']
    ImageDraw.Draw(occluded).rectangle(box_from_points(**bounds), fill='white')
    opaque_truth = [entry.copy() for entry in base_truth]
    opaque_truth[items.index(mc)] = {'id': mc['id'], 'status': 'unreadable', 'rawText': None}
    save('unreadable-mc-by-occlusion', occluded, 'must-review-items', truth=opaque_truth, note=mc['id'])

    image = seeded.copy()
    anchor = profile['anchors'][0]
    duplicate = image.crop(code_box(anchor, 1.0))
    _left, top, right, _bottom = code_box(anchor, 1.0)
    image.paste(duplicate, (right + 12, top))
    save('duplicate-anchor-glyph', image, 'characterize', truth=base_truth, note='Record rejection or correct layout. Wrong accepted values fail.')

    for index, strength in enumerate((0.75, 1.45, 2.1)):
        blurred = seeded.filter(ImageFilter.GaussianBlur(strength))
        save(f'blur-{index}', blurred, 'characterize', truth=base_truth)
    for index, strength in enumerate((0.72, 1.16)):
        changed = ImageEnhance.Brightness(seeded).enhance(strength)
        save(f'light-level-{index}', changed, 'characterize', truth=base_truth)
    radial = seeded.copy()
    selected = next((choice for choice in mc['choices'] if choice['symbol'] == base_truth[items.index(mc)]['rawText']), None)
    if selected:
        x, y = (selected[axis] * POINT_SCALE for axis in ('x', 'y'))
        radius = selected['radius'] * POINT_SCALE * 0.85
        draw = ImageDraw.Draw(radial)
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=(158, 158, 158))
    save('moderate-pencil-mark', radial, 'characterize', truth=base_truth)
    erased = seeded.copy()
    if selected:
        x, y = (selected[axis] * POINT_SCALE for axis in ('x', 'y'))
        radius = selected['radius'] * POINT_SCALE * .8
        draw = ImageDraw.Draw(erased)
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=(211, 211, 211))
        draw.line((x - 2, y - 1, x + 2, y + 1), fill=(128, 128, 128), width=2)
    save('partly-erased-mark', erased, 'characterize', truth=None, note='Record decision on visible erasure; intended upper mark is not an observable-truth oracle.')
    for index, radius in enumerate((7, 10)):
        partial_glare = seeded.copy()
        bubble = mc['choices'][index]
        x, y = (bubble[axis] * POINT_SCALE for axis in ('x', 'y'))
        ImageDraw.Draw(partial_glare).ellipse((x - radius, y - radius, x + radius, y + radius), fill='white')
        save(f'local-glare-{index}', partial_glare, 'characterize', truth=base_truth)
    output = {'profileDigest': digest, 'rasterDpi': DPI, 'fixtures': records}
    (out / 'oracles.json').write_text(json.dumps(output, indent=2) + '\n')
    print(f'Generated {len(records)} independent fixtures across {len(set(entry["mode"] for entry in records))} modes.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('app', type=Path)
    parser.add_argument('--out', type=Path, default=Path(__file__).with_name('fixtures'))
    options = parser.parse_args()
    generate(options.app, options.out)
