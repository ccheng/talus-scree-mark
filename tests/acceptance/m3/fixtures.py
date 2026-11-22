"""Build independently labeled, wholly synthetic conventional markerless forms."""

import argparse
import json
from pathlib import Path
from random import Random

from PIL import Image, ImageDraw, ImageEnhance, ImageFont, ImageOps


WIDTH = 1224
HEIGHT = 1584
MC_RADIUS = 13
NR_RADIUS = 9
PAPER = (254, 253, 249)
NAME_FIELD = (735, 235, 1160, 286)


def font(size, bold=False):
    name = 'DejaVuSans-Bold.ttf' if bold else 'DejaVuSans.ttf'
    try:
        return ImageFont.truetype(name, size)
    except OSError:
        return ImageFont.load_default(size=size)




def point(x, y):
    return {'x': x, 'y': y}


def rect(x, y, width, height):
    return {'x': x, 'y': y, 'width': width, 'height': height}


def option(symbol, x, y, radius):
    return {'symbol': symbol, **point(x, y), 'radius': radius}


def mc_block(identifier, label, item_ids, x, y, choices, dx=65, dy=62):
    items = []
    for row, item_id in enumerate(item_ids):
        cy = y + row * dy
        items.append({'id': item_id, 'kind': 'mc', 'bounds': rect(x - 31, cy - 24, (len(choices) - 1) * dx + 61, 48),
                      'choices': [option(symbol, x + column * dx, cy, MC_RADIUS) for column, symbol in enumerate(choices)]})
    return {'id': identifier, 'kind': 'mc', 'label': label, 'bounds': rect(x - 40, y - 26, (len(choices) - 1) * dx + 78, (len(item_ids) - 1) * dy + 54),
            'rows': len(items), 'columns': len(choices), 'items': items,
            'topLeft': point(x, y), 'topRight': point(x + (len(choices) - 1) * dx, y), 'bottomLeft': point(x, y + (len(items) - 1) * dy), 'radius': MC_RADIUS}


def nr_block(identifier, label, item_id, x, y, symbols='0123456789', dx=80, dy=31):
    slots = []
    for column in range(4):
        column_symbols = symbols + ('.' if column in (1, 2) else '')
        slots.append({'id': f'{item_id}.slot{column + 1}', 'choices': [option(symbol, x + column * dx, y + row * dy, NR_RADIUS)
                       for row, symbol in enumerate(column_symbols)]})
    bounds = rect(x - 30, y - 27, 3 * dx + 62, len(symbols) * dy + 55)
    return {'id': identifier, 'kind': 'nr', 'label': label, 'bounds': bounds,
            'rows': len(symbols) + 1, 'columns': 4, 'topLeft': point(x, y), 'topRight': point(x + 3 * dx, y),
            'bottomLeft': point(x, y + len(symbols) * dy), 'radius': NR_RADIUS,
            'items': [{'id': item_id, 'kind': 'nr', 'bounds': bounds, 'slots': slots}]}


FAMILIES = [
    ('mc-only', 'Field observations', ['Select one option per item', 'Record responses before discussion', 'Check that every page is present'], [
        mc_block('science-basics', 'PART A | Basics', [f'A{i}' for i in range(1, 7)], 210, 470, 'ABCD', dx=61, dy=66),
        mc_block('science-application', 'PART B | Application', [f'B{i}' for i in range(1, 5)], 740, 890, 'ABCDE', dx=62, dy=62),
    ]),
    ('mixed', 'Measurement practice', ['Show units in your working', 'Use the four response positions', 'Put a single mark in each box column'], [
        mc_block('measurement-mc', 'MULTIPLE CHOICE', [f'Q{i}' for i in range(1, 9)], 205, 455, 'ABCD', dx=66, dy=69),
        nr_block('measure-a', 'NUMERICAL RESPONSE 1', 'NM1', 190, 1060, dx=77, dy=32),
        nr_block('measure-b', 'NUMERICAL RESPONSE 2', 'NM2', 755, 1060, dx=77, dy=32),
    ]),
    ('interleaved', 'Problem solving', ['Read one part at a time', 'Shade the circle for your choice', 'Check results against each prompt'], [
        nr_block('numbers-first', 'TASK 1 | Numerical response', 'T1', 795, 470, symbols='9876543210', dx=73, dy=28),
        mc_block('application-next', 'TASK 2 | Multiple choice', [f'T{i}' for i in range(2, 7)], 193, 470, 'WXYZ', dx=63, dy=64),
        nr_block('numbers-again', 'TASK 7 | Numerical response', 'T7', 190, 1045, dx=74, dy=31),
        mc_block('application-last', 'TASK 8 | Multiple choice', [f'T{i}' for i in range(8, 12)], 736, 1095, 'ABCD', dx=64, dy=66),
    ]),
]


def write(draw, xy, text, size=24, bold=False):
    draw.text(xy, text, fill=(17, 19, 23), font=font(size, bold))


def text_patch(xy, text, size, bold=False):
    face = font(size, bold)
    fragment = text.strip()
    while face.getlength(fragment) > 237:
        fragment = fragment[:-1]
    left, top, right, bottom = face.getbbox(fragment)
    return rect(xy[0] + left - 2, xy[1] + top - 2, right - left + 4, bottom - top + 4)


def circles(item):
    if item['kind'] == 'mc':
        return item['choices']
    return [choice for slot in item['slots'] for choice in slot['choices']]


def bubble(draw, choice, filled=False):
    radius = choice['radius'] * (0.8 if filled else 1)
    x, y = choice['x'], choice['y']
    box = (x - radius, y - radius, x + radius, y + radius)
    draw.ellipse(box, fill=(22, 22, 22) if filled else None, outline=(20, 20, 20), width=2)


def make_sheet(title, notices, components):
    paper = Image.new('RGB', (WIDTH, HEIGHT), PAPER)
    draw = ImageDraw.Draw(paper)
    write(draw, (74, 78), title, 53, True)
    write(draw, (820, 92), 'MOCK SHEET', 36, True)
    draw.line((74, 159, 1140, 159), fill=(19, 20, 22), width=4)
    write(draw, (74, 233), notices[0], 26, True)
    write(draw, (754, 231), 'Name: ____________________', 24)
    write(draw, (78, 326), notices[1], 27)
    write(draw, (737, 327), notices[2], 24)
    write(draw, (81, 1475), f'End of {title.lower()} response form', 25, True)
    write(draw, (836, 1480), 'Attach this page to your work.', 21)
    for component in components:
        first, *_ = component['items']
        x, y = component['topLeft']['x'], component['topLeft']['y']
        write(draw, (x - 88, y - 70), component['label'], 24, True)
        if component['kind'] == 'mc':
            for choice in first['choices']:
                write(draw, (choice['x'] - 7, choice['y'] - 37), choice['symbol'], 20, True)
            for item in component['items']:
                choice = item['choices'][0]
                write(draw, (choice['x'] - 74, choice['y'] - 15), item['id'], 22)
        else:
            for slot in first['slots']:
                for choice in slot['choices']:
                    write(draw, (choice['x'] - 26, choice['y'] - 10), choice['symbol'], 17)
        for item in component['items']:
            for choice in circles(item):
                bubble(draw, choice)
    return paper


def items(components):
    return [item for component in components for item in component['items']]


def mark_copy(blank, components, seed, *, double=False, names=False):
    dice = Random(seed)
    marked = blank.copy()
    draw = ImageDraw.Draw(marked)
    truth = []
    first_mc = next(item['id'] for item in items(components) if item['kind'] == 'mc')
    for index, item in enumerate(items(components)):
        if item['kind'] == 'mc':
            available = item['choices']
            chosen = None if (seed + index) % 13 == 0 else dice.choice(available)
            if double and item['id'] == first_mc:
                bubble(draw, available[0], True)
                bubble(draw, available[1], True)
                truth.append({'id': item['id'], 'status': 'multiple', 'value': None, 'review': True})
            else:
                if chosen:
                    bubble(draw, chosen, True)
                truth.append({'id': item['id'], 'status': 'single' if chosen else 'blank', 'value': chosen['symbol'] if chosen else None, 'review': False})
        else:
            tokens = ['5.3 ', '3008', '02.5', '    ', '1000', '7.40']
            token = tokens[(seed + index) % len(tokens)]
            for slot, symbol in zip(item['slots'], token):
                if symbol == ' ':
                    continue
                bubble(draw, next(choice for choice in slot['choices'] if choice['symbol'] == symbol), True)
            truth.append({'id': item['id'], 'status': 'single' if token.strip() else 'blank', 'value': token, 'review': False})
    if names:
        # Arbitrary synthetic strokes absent from both the blank and the fixed-feature descriptors.
        draw.line([(790, 246), (820, 258), (858, 239), (897, 269), (933, 240), (1000, 266)], (15, 16, 22), width=5)
    return marked, truth


def inverse_matrix(m):
    a, b, c, d, e, f, g, h, i = m
    result = [e * i - f * h, c * h - b * i, b * f - c * e,
              f * g - d * i, a * i - c * g, c * d - a * f,
              d * h - e * g, b * g - a * h, a * e - b * d]
    return [coefficient / result[-1] for coefficient in result]


def framed(paper, seed):
    scale = [1.0, .81, .91, .96][seed // 2 % 4]
    if seed in (3, 4):
        skew = -.035 if seed == 3 else .033
        matrix = [scale, skew, 94, -skew * 0.7, scale, 68, .000012, -.000008, 1]
        inverse = inverse_matrix(matrix)
        transformed = paper.transform((round(WIDTH * scale + 155), round(HEIGHT * scale + 145)),
                                      Image.Transform.PERSPECTIVE, inverse[:8], Image.Resampling.BICUBIC,
                                      fillcolor=(160, 161, 157))
        return transformed, matrix, 0
    orientation = 0 if seed < 5 else ((seed - 4) * 90) % 360
    w, h = round(WIDTH * scale), round(HEIGHT * scale)
    transform = [w / WIDTH, 0, 0, 0, h / HEIGHT, 0, 0, 0, 1]
    scaled = paper.resize((w, h), Image.Resampling.BICUBIC)
    if orientation:
        scaled = scaled.rotate(-orientation, expand=True)
    left, top = 46 + seed * 2, 52 + seed
    frame = Image.new('RGB', (scaled.width + left + 52, scaled.height + top + 62), (160, 161, 157))
    frame.paste(scaled, (left, top))
    sx, sy = transform[0], transform[4]
    options = {0:[sx, 0, left, 0, sy, top], 90:[0, -sy, left + h - 1, sx, 0, top],
               180:[-sx, 0, left + w - 1, 0, -sy, top + h - 1], 270:[0, sy, left, -sx, 0, top + w - 1]}
    return frame, options[orientation] + [0, 0, 1], orientation


def generate(out):
    out.mkdir(parents=True, exist_ok=True)
    records = []
    for family_index, (family_id, title, notices, components) in enumerate(FAMILIES):
        blank = make_sheet(title, notices, components)
        blank_path = f'{family_id}-blank.png'
        blank.save(out / blank_path)
        fixtures = []

        def save(case, image, mode, truth=None, geometry=None, orientation=None):
            filename = f'{family_id}-{case}.jpg'
            image.save(out / filename, quality=93, subsampling=0)
            fixtures.append({'id': case, 'file': filename, 'mode': mode, 'truth': truth, 'pageToSource': geometry, 'orientation': orientation})

        for seed in range(8):
            marked, truth = mark_copy(blank, components, seed + 18 * family_index, names=seed % 2 == 1)
            image, transform, orientation = framed(marked, seed)
            save(f'standard-{seed}', image, 'standard', truth, transform, orientation)
        marked, truth = mark_copy(blank, components, 47)
        save('mirrored', framed(ImageOps.mirror(marked), 0)[0], 'must-retake')
        wrong = make_sheet('Practice page altered', ['Select the most accurate option', 'Different instructions for this version', 'Hand this page in after the test'], components)
        negative, _ = mark_copy(wrong, components, 53)
        wrong_frame, wrong_matrix, _ = framed(negative, 0)
        save('wrong-same-grid', wrong_frame, 'must-retake', geometry=wrong_matrix)
        if family_id == 'interleaved':
            changed_title = marked.copy()
            draw = ImageDraw.Draw(changed_title)
            draw.rectangle((71, 76, 755, 147), fill=PAPER)
            write(draw, (74, 78), 'Energy transfers', 53, True)

            missing_title = marked.copy()
            ImageDraw.Draw(missing_title).rectangle((71, 76, 755, 147), fill=PAPER)

            changed_labels = marked.copy()
            draw = ImageDraw.Draw(changed_labels)
            replacement_lines = [
                ((74, 233), 'Describe your observations', 26, True, (70, 225, 725, 286)),
                ((78, 326), 'Enter a response below', 27, False, (75, 315, 643, 363)),
                ((737, 327), 'Follow the prompts in sequence', 24, False, (720, 315, 1218, 363)),
                ((81, 1475), 'Hand in this sheet separately', 25, True, (74, 1467, 800, 1519)),
                ((836, 1480), 'Keep the rest of the packet.', 21, False, (818, 1467, 1216, 1519)),
            ]
            for position, text, size, bold, cover in replacement_lines:
                draw.rectangle(cover, fill=PAPER)
                write(draw, position, text, size, bold)

            for case, page in [('changed-title-only', changed_title), ('missing-title', missing_title),
                               ('same-title-changed-labels', changed_labels)]:
                image, matrix, orientation = framed(page, 0)
                save(case, image, 'identity-regression', geometry=matrix, orientation=orientation)
        save('clipped', marked.crop((0, 0, WIDTH - 180, HEIGHT - 251)), 'must-retake')
        sanitized = marked.copy()
        last = components[-1]['bounds']
        bounds = (last['x'] - 4, last['y'] - 2, last['x'] + last['width'] + 1, last['y'] + last['height'] + 4)
        ImageDraw.Draw(sanitized).rectangle(bounds, fill=PAPER)
        save('missing-block', framed(sanitized, 0)[0], 'must-review-missing-block', None)
        doubled, double_truth = mark_copy(blank, components, 54, double=True)
        double_frame, double_matrix, _ = framed(doubled, 0)
        save('double-mark', double_frame, 'must-review', double_truth, geometry=double_matrix)
        save('low-contrast-edge', ImageEnhance.Contrast(framed(marked, 1)[0]).enhance(.38), 'characterize')
        records.append({'id': family_id, 'blank': blank_path, 'page': {'width': WIDTH, 'height': HEIGHT}, 'nameField': NAME_FIELD,
                        'features': [text_patch((74, 78), title, 53, True), text_patch((820, 92), 'MOCK SHEET', 36, True),
                                     text_patch((74, 233), notices[0], 26, True), text_patch((78, 326), notices[1], 27),
                                     text_patch((737, 327), notices[2], 24), text_patch((81, 1475), f'End of {title.lower()} response form', 25, True),
                                     text_patch((836, 1480), 'Attach this page to your work.', 21)] +
                                    [text_patch((block['topLeft']['x'] - 88, block['topLeft']['y'] - 70), block['label'], 24, True) for block in components],
                        'components': components, 'fixtures': fixtures})
    (out / 'oracles.json').write_text(json.dumps({'families': records}, indent=2) + '\n')
    print(f'Generated {len(records)} markerless families and {sum(len(form["fixtures"]) for form in records)} marked cases.')


if __name__ == '__main__':
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--out', type=Path, default=Path(__file__).with_name('fixtures'))
    generate(cli.parse_args().out)
