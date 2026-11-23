"""Generate a photo-like Alberta form with tall, shared borders on the writing cells."""

from importlib.util import module_from_spec, spec_from_file_location
import json
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

from fixtures import HEIGHT, WIDTH, PAPER, font, items, mc_block, nr_block, write

HERE = Path(__file__).resolve().parent
OUT = HERE / 'fixtures'
POSE_MATH = spec_from_file_location('pose_fixture_math', HERE.parent / 'm2' / 'fixtures.py')
pose_math = module_from_spec(POSE_MATH)
POSE_MATH.loader.exec_module(pose_math)

PITCH = 40
ROW_STEP = 28
BOX_HEIGHT = 64


def numeric_block(identifier, number, x, y):
    block = nr_block(identifier, f'NR {number}', f'NR{number}', x, y, dx=PITCH, dy=ROW_STEP)
    for slot in block['items'][0]['slots']:
        for choice in slot['choices']:
            choice['radius'] = 11
            choice['y'] = y if choice['symbol'] == '.' else choice['y'] + ROW_STEP
    block['writingBoxes'] = [
        {'x': x + slot * PITCH - PITCH / 2, 'y': y - 84, 'width': PITCH, 'height': BOX_HEIGHT}
        for slot in range(4)
    ]
    return block


def circle_bounds(choice, factor=1):
    x, y = choice['x'], choice['y']
    radius = choice['radius'] * factor
    return x - radius, y - radius, x + radius, y + radius


def print_form(components):
    blank = Image.new('RGB', (WIDTH, HEIGHT), PAPER)
    draw = ImageDraw.Draw(blank)
    write(draw, (80, 86), 'Applied measurements', 53, True)
    write(draw, (84, 161), 'Record one answer for every row.', 24)
    draw.line((78, 218, 1140, 218), fill=(46, 51, 55), width=3)
    for block in components:
        if block['kind'] == 'mc':
            for choice in block['items'][0]['choices']:
                draw.text((choice['x'], choice['y'] - 27), choice['symbol'], font=font(15), anchor='mm', fill=(28, 29, 31))
            for item in block['items']:
                x, y = item['choices'][0]['x'], item['choices'][0]['y']
                write(draw, (x - 58, y - 13), item['id'][2:], 20, True)
                for choice in item['choices']:
                    draw.ellipse(circle_bounds(choice), outline=(24, 27, 30), width=2)
            continue
        x = block['topLeft']['x']
        y = block['topLeft']['y']
        write(draw, (x + 13, y - 130), block['label'], 27, True)
        for box in block['writingBoxes']:
            left, top = box['x'], box['y']
            draw.rectangle((left, top, left + box['width'], top + box['height']), outline=(28, 29, 31), width=3)
        for slot in block['items'][0]['slots']:
            for choice in slot['choices']:
                draw.ellipse(circle_bounds(choice), outline=(27, 30, 33), width=2)
                draw.text((choice['x'], choice['y']), choice['symbol'], font=font(17, True),
                          anchor='mm', fill=(42, 44, 46))
    write(draw, (85, 1494), 'Practice material', 22)
    return blank


def photo(page):
    frame = (1350, 1740)
    corners = [(112, 106), (1273, 57), (1234, 1661), (63, 1602)]
    source = [(0, 0), (WIDTH - 1, 0), (WIDTH - 1, HEIGHT - 1), (0, HEIGHT - 1)]
    inverse = pose_math.homography(corners, source)
    capture = page.transform(frame, Image.Transform.PERSPECTIVE, inverse, Image.Resampling.BICUBIC, fillcolor=(155, 160, 164))
    shade = Image.linear_gradient('L').rotate(90).resize(frame).point(lambda x: 222 + int(x * .115)).convert('RGB')
    return ImageChops.multiply(capture, shade).filter(ImageFilter.GaussianBlur(.48)), corners


def generate():
    components = [
        numeric_block('number-first', 1, 217, 468),
        numeric_block('number-second', 2, 797, 491),
        mc_block('selected-left', 'Choices', ['MC4', 'MC5', 'MC6'], 352, 848, 'ABCD', dx=58, dy=39),
        mc_block('selected-right', 'Choices', ['MC1', 'MC2', 'MC3'], 768, 849, 'ABCD', dx=58, dy=39),
        numeric_block('number-third', 3, 237, 1120),
        numeric_block('number-fourth', 4, 776, 1088),
    ]
    tokens = {'NR1': '0.25', 'NR2': '23.7', 'MC4': 'B', 'MC5': 'A', 'MC6': '',
              'MC1': 'D', 'MC2': 'C', 'MC3': '', 'NR3': '    ', 'NR4': '004 '}
    blank = print_form(components)
    marked = blank.copy()
    draw = ImageDraw.Draw(marked)
    truth = []
    for item in items(components):
        identifier = item['id']
        token = tokens[identifier]
        groups = [item['choices']] if item['kind'] == 'mc' else [slot['choices'] for slot in item['slots']]
        for choices, symbol in zip(groups, token):
            if symbol == ' ':
                continue
            choice = next(choice for choice in choices if choice['symbol'] == symbol)
            draw.ellipse(circle_bounds(choice, .75), fill=(24, 25, 26))
        truth.append({'id': identifier, 'status': 'single' if token.strip() else 'blank',
                      'value': token if token else None, 'review': False})
    OUT.mkdir(exist_ok=True)
    clean, corners = photo(blank)
    filled, _ = photo(marked)
    clean.save(OUT / 'alberta-phone-blank.jpg', quality=87, subsampling=0)
    filled.save(OUT / 'alberta-phone-marked.jpg', quality=87, subsampling=0)
    (OUT / 'alberta-photo-oracles.json').write_text(json.dumps({
        'blank': 'alberta-phone-blank.jpg', 'marked': 'alberta-phone-marked.jpg',
        'components': components, 'truth': truth,
        'corners': [{'x': x, 'y': y} for x, y in corners],
    }, indent=2) + '\n')
    print('Generated the Alberta phone-like blank and paired filled form with overlapping draft IDs during a block swap.')


if __name__ == '__main__':
    generate()
