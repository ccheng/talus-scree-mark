"""Generate synthetic forms with the four-position Alberta optical response convention."""

import json
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

from fixtures import HEIGHT, WIDTH, PAPER, font, items, mc_block, nr_block, write

OUT = Path(__file__).resolve().parent / 'fixtures'


def numeric_block(identifier, number, x, y):
    block = nr_block(identifier, f'Numerical response {number}', f'NR{number}', x, y, dx=62, dy=29)
    for slot in block['items'][0]['slots']:
        for choice in slot['choices']:
            choice['radius'] = 11
            choice['y'] = y if choice['symbol'] == '.' else choice['y'] + 29
    block['writingBoxes'] = [
        {'x': x + slot * 62 - 22, 'y': y - 44, 'width': 44, 'height': 28}
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
    write(draw, (76, 75), 'Measurement and estimation', 45, True)
    write(draw, (83, 154), 'Practice form', 27)
    draw.line((79, 205, 1140, 205), fill=(61, 66, 69), width=2)
    for block in components:
        if block['kind'] == 'mc':
            for choice in block['items'][0]['choices']:
                draw.text((choice['x'], choice['y'] - 25), choice['symbol'], font=font(16), anchor='mm', fill=(24, 26, 30))
            for item in block['items']:
                x, y = item['choices'][0]['x'], item['choices'][0]['y']
                write(draw, (x - 60, y - 13), item['id'][2:], 24, True)
                for choice in item['choices']:
                    draw.ellipse(circle_bounds(choice), outline=(22, 25, 28), width=2)
            continue
        x = block['topLeft']['x']
        y = block['topLeft']['y']
        write(draw, (x - 40, y - 88), block['label'], 24, True)
        for box in block['writingBoxes']:
            left, top = box['x'], box['y']
            draw.rectangle((left, top, left + box['width'], top + box['height']), outline=(22, 25, 28), width=2)
        for slot in block['items'][0]['slots']:
            for choice in slot['choices']:
                draw.ellipse(circle_bounds(choice), outline=(24, 26, 30), width=2)
                draw.text((choice['x'], choice['y']), choice['symbol'], font=font(16, True),
                          anchor='mm', fill=(45, 48, 51))
    return blank


def marked_form(blank, by_id):
    marks = Image.new('RGB', blank.size, 'white')
    draw = ImageDraw.Draw(marks)
    choice_sets = {'MC4': 'D', 'MC24': 'C', 'MC25': 'A', 'NR1': '0.25', 'NR2': '23.7', 'NR4': '1842'}
    for identifier, token in choice_sets.items():
        item = by_id[identifier]
        groups = [item['choices']] if item['kind'] == 'mc' else [slot['choices'] for slot in item['slots']]
        for choices, symbol in zip(groups, token):
            choice = next(choice for choice in choices if choice['symbol'] == symbol)
            draw.ellipse(circle_bounds(choice, .74), fill=(25, 25, 25))
    ghost = next(choice for choice in by_id['NR4']['slots'][1]['choices'] if choice['symbol'] == '.')
    draw.ellipse(circle_bounds(ghost, .72), fill=(196, 196, 196))
    return ImageChops.darker(blank, marks)


def generate():
    components = [
        numeric_block('numeric-a', 1, 172, 425),
        numeric_block('numeric-b', 2, 772, 462),
        mc_block('selected-response', 'Selected response', ['MC24', 'MC25', 'MC26'], 425, 803, 'ABCD', dx=64, dy=48),
        mc_block('second-choice', 'Selected response', ['MC4', 'MC5', 'MC6'], 826, 802, 'ABCD', dx=64, dy=48),
        numeric_block('numeric-c', 3, 195, 1064),
        numeric_block('numeric-d', 4, 733, 1012),
    ]
    outcomes = {'MC24': ('single', 'C', False), 'MC25': ('single', 'A', False), 'MC26': ('blank', None, False),
                'MC4': ('single', 'D', False), 'MC5': ('blank', None, False), 'MC6': ('blank', None, False),
                'NR1': ('single', '0.25', False), 'NR2': ('single', '23.7', False),
                'NR3': ('blank', '    ', False), 'NR4': ('ambiguous', None, True)}
    by_id = {item['id']: item for item in items(components)}
    blank = print_form(components)
    OUT.mkdir(exist_ok=True)
    blank.save(OUT / 'alberta-labeled-blank.png')
    marked_form(blank, by_id).save(OUT / 'alberta-labeled-marked.png')
    truth = {identifier: {'id': identifier, 'status': state, 'value': value, 'review': review}
             for identifier, (state, value, review) in outcomes.items()}
    (OUT / 'alberta-oracles.json').write_text(json.dumps({
        'blank': 'alberta-labeled-blank.png', 'marked': 'alberta-labeled-marked.png',
        'components': components, 'truth': truth,
    }, indent=2) + '\n')
    print('Generated Alberta-style blank and marked sheets with printed center glyphs.')


if __name__ == '__main__':
    generate()
