"""Make synthetic response forms from geometry measured on two Letter layouts."""

from math import pi, sin
from importlib.util import module_from_spec, spec_from_file_location
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).resolve().parent
OUT = HERE / 'fixtures'
MATH = spec_from_file_location('synthetic_projector', HERE.parent / 'm2' / 'fixtures.py')
pose_math = module_from_spec(MATH)
MATH.loader.exec_module(pose_math)
SCALE = 2.5
PAGE = (612, 792)
RASTER = tuple(round(value * SCALE) for value in PAGE)
PAGE_QUAD = [(0, 0), (612, 0), (612, 792), (0, 792)]
INK = (28, 29, 31)


def scaled(bounds):
    return tuple(round(value * SCALE) for value in bounds)


def text(draw, x, y, content, size=10, bold=False, anchor='lt'):
    path = 'DejaVuSans-Bold.ttf' if bold else 'DejaVuSans.ttf'
    draw.text(scaled((x, y)), content, font=ImageFont.truetype(path, round(size*SCALE)), fill=INK, anchor=anchor)


def bounds(x, y, width, height):
    return {'x': x, 'y': y, 'width': width, 'height': height}


def bubble(symbol, x, y, radius):
    return {'symbol': symbol, 'x': x, 'y': y, 'radius': radius}


def mc_block(id, x, rows, first):
    items = []
    for number, y in enumerate(rows, first):
        options = [bubble(symbol, x + 17.25*column, y, 3.45) for column, symbol in enumerate('ABCD')]
        items.append({'id': f'MC{number}', 'kind': 'mc', 'bounds': bounds(x-5.5, y-5.5, 63, 11), 'choices': options})
    return {'id': id, 'kind': 'mc', 'bounds': bounds(x-6, rows[0]-6, 64, rows[-1]-rows[0]+12), 'items': items}


def nr_block(number, x, pitch, row_zero, row_pitch, top, height, radius):
    slots = []
    for n in range(4):
        cx = x + n*pitch
        options = [bubble('.', cx, row_zero-row_pitch, radius)] if n in (1, 2) else []
        options.extend(bubble(str(k), cx, row_zero+k*row_pitch, radius) for k in range(10))
        slots.append({'id': f'NR{number}.{n+1}', 'choices': options})
    region = bounds(x-6, row_zero-row_pitch-6, 3*pitch+12, 10*row_pitch+12)
    writing = [bounds(x+(slot-.5)*pitch, top, pitch, height) for slot in range(4)]
    return {'id': f'numeric-{number}', 'kind': 'nr', 'bounds': region, 'writingBoxes': writing,
            'items': [{'id': f'NR{number}', 'kind': 'nr', 'bounds': region, 'slots': slots}]}


def outline(draw, item, factor=1, mark=False):
    x, y, r = item['x'], item['y'], item['radius']*factor
    box = scaled((x-r, y-r, x+r, y+r))
    draw.ellipse(box, outline=INK, width=1 if mark else 2, fill=INK if mark else None)


def render(components, writer_areas, name):
    image = Image.new('RGB', RASTER, (250, 249, 247))
    draw = ImageDraw.Draw(image)
    text(draw, 40, 40, f'Practice survey – {name}', 16, True)
    text(draw, 40, 63, 'Multiple choice', 11, True)
    text(draw, 318, 59, 'Computed results', 12, True)
    for x in [158, 303]:
        draw.line(scaled((x, 61, x, 288)), fill=(97, 97, 97), width=2)
    for block in components:
        if block['kind'] == 'mc':
            for choice in block['items'][0]['choices']:
                text(draw, choice['x'], choice['y']-16, choice['symbol'], 8, True, 'mm')
            for item in block['items']:
                first = item['choices'][0]
                text(draw, first['x']-21, first['y'], item['id'][2:], 8, True, 'mm')
                for choice in item['choices']:
                    outline(draw, choice)
        else:
            item = block['items'][0]
            leading = block['writingBoxes'][0]
            text(draw, leading['x']+leading['width']*2, leading['y']-11, item['id'].replace('NR','NR '), 10, True, 'mm')
            for cell in block['writingBoxes']:
                x,y,w,h = (cell[k] for k in ('x','y','width','height'))
                draw.rectangle(scaled((x,y,x+w,y+h)), outline=INK, width=2)
            for slot in item['slots']:
                for choice in slot['choices']:
                    outline(draw, choice)
                    text(draw, choice['x'], choice['y'], choice['symbol'], 6.4, True, 'mm')
    for index, area in enumerate(writer_areas, 1):
        y = area['y']
        draw.line(scaled((42,y,571,y)), fill=INK, width=2)
        text(draw, 42, y-11, f'Written work {index}', 9, True)
    return image


def marked(blank, components, written, tokens, pencil=False):
    image = blank.copy()
    draw = ImageDraw.Draw(image)
    facts = []
    for block in components:
        for item in block['items']:
            value = tokens[item['id']]
            groups = [item['choices']] if item['kind']=='mc' else [slot['choices'] for slot in item['slots']]
            for group, symbol in zip(groups, value or ''):
                if symbol == ' ':
                    continue
                choice = next(choice for choice in group if choice['symbol'] == symbol)
                if not pencil:
                    outline(draw, choice, .78, mark=True)
                    continue
                x, y, radius = choice['x'], choice['y'], choice['radius']
                shade = 44 + (ord(symbol) % 5) * 7
                draw.ellipse(scaled((x - .74*radius, y - .70*radius, x + .78*radius, y + .76*radius)),
                             fill=(shade, shade+2, shade+4))
                draw.line(scaled((x - .47*radius, y + .26*radius, x + .48*radius, y - .30*radius)),
                          fill=(shade+35, shade+35, shade+35), width=1)
            facts.append({'id': item['id'], 'kind': item['kind'], 'state': 'single' if (value or '').strip() else 'blank',
                          'rawText': value, 'review': False})
    for number, area in enumerate(written):
        y = area['y'] + 32
        points = [(54, y+12), (68, y), (82, y+7), (96,y+4), (115,y+11), (141,y+6), (150,y+10)]
        draw.line([scaled(p) for p in points], fill=(50,66,82), width=3)
        if pencil:
            for column in range(9):
                x = 56 + 11*column
                draw.line([scaled((x, y+31)), scaled((x+3, y+23+column%4)),
                           scaled((x+7, y+30)), scaled((x+9, y+27))], fill=(65, 69, 76), width=2)
        else:
            text(draw, 66, y+31, f'Working line {number+1}', 11)
    return image, facts


def capture(image, projection, desk=(159, 164, 167), shade=0):
    if projection is None:
        return image
    corners, dimensions = projection
    source = [(0,0),(RASTER[0]-1,0),(RASTER[0]-1,RASTER[1]-1),(0,RASTER[1]-1)]
    inverse = pose_math.homography(corners, source)
    transformed = image.transform(dimensions, Image.Transform.PERSPECTIVE, inverse, Image.Resampling.BICUBIC,
                                  fillcolor=desk)
    if shade:
        light = Image.linear_gradient('L').rotate(90).resize(dimensions).point(
            lambda value: round(shade * value / 255))
        transformed = Image.composite(Image.new('RGB', dimensions, (30, 36, 48)), transformed, light)
    return transformed.filter(ImageFilter.GaussianBlur(.38))


def generate():
    configurations = [
        ('document', [318, 391, 462, 533.5], [15,14.3,14.3,14.3], 153.4, 11.85, 105.8, 27.9, 4.4, None),
        ('camera', [321, 389, 457, 525], [14.1]*4, 163.7, 11.4, 122, 22, 4.15,
         ([(56,74),(1514,39),(1480,1946),(34,1971)],(1560,2010))),
    ]
    written = [bounds(42,313,529,201),bounds(42,531,529,212)]
    OUT.mkdir(exist_ok=True)
    records = []
    for variant, xs, pitches, zero, pitch, top, height, radius, projection in configurations:
        blocks = [
            mc_block('left', 78, [91.5,112.5,154.75,176,197.25,218.5,240,261,282.25], 1),
            mc_block('right', 205, [91.5,112.5,133.75,176,197.25], 10),
            *[nr_block(i, x, spacing, zero, pitch, top, height, radius) for i,(x,spacing) in enumerate(zip(xs,pitches),1)],
        ]
        values = {'MC1':'B','MC2':'A','MC3':'C','MC4':'D','MC5':None,'MC6':'C','MC7':'A','MC8':'D','MC9':'B',
                  'MC10':'A','MC11':'D','MC12':'C','MC13':'A','MC14':'B',
                  'NR1':'0.25','NR2':'23.7','NR3':'004 ','NR4':'    '}
        blank = render(blocks, written, variant)
        filled, truth = marked(blank, blocks, written, values)
        extension = 'jpg' if projection else 'png'
        paths = (f'top-portfolio-{variant}-blank.{extension}', f'top-portfolio-{variant}-marked.{extension}')
        for name, source in zip(paths,(blank,filled)):
            capture(source, projection).save(OUT / name, **({'quality': 91, 'subsampling': 0} if projection else {}))
        corners = projection[0] if projection else [(x*SCALE,y*SCALE) for x,y in PAGE_QUAD]
        records.append({
            'variant': variant, 'blank': paths[0], 'marked': paths[1], 'blocks': blocks, 'truth': truth,
            'corners': [{'x':x,'y':y} for x,y in corners], 'writtenAreas': written,
            'key': {'MC1':'B','MC10':'D','NR1':'0.25','NR2':'23.7','NR3':'4','NR4':'0'},
        })
        if variant == 'camera':
            generate_independent(blank, blocks, written, values)
    (OUT / 'portfolio-oracles.json').write_text(json.dumps(records, indent=2)+'\n')
    print('Generated two synthetic top-loaded document and camera response layouts, with marked pairs and literal keys.')


def curl_response_sheet(image, across=3.5, down=4.5):
    """Vary the interior pose while keeping the physical corners fixed."""
    width, height = image.size

    def source(x, y):
        u, v = x/width, y/height
        return (x - SCALE*across*sin(pi*u)*sin(2*pi*v),
                y - SCALE*down*sin(2*pi*u)*sin(pi*v))

    mesh = []
    for y in range(0, height, 48):
        for x in range(0, width, 48):
            right, bottom = min(x+48, width), min(y+48, height)
            quad = [source(x,y), source(x,bottom), source(right,bottom), source(right,y)]
            mesh.append(((x,y,right,bottom), tuple(value for point in quad for value in point)))
    return image.transform(image.size, Image.Transform.MESH, mesh, Image.Resampling.BICUBIC)


def generate_independent(blank, blocks, written, values):
    # A close enrollment photo on a light desk still has visible page edges.
    # Each completed capture uses an independently selected physical page quad.
    enrollment = ([(28, 62), (1490, 43), (1500, 1931), (38, 1944)], (1530, 1980))
    photos = [
        ('angled', ([(224, 179), (1298, 73), (1513, 1734), (216, 1872)], (1650, 2020)), (128, 132, 137), 26),
        ('distant', ([(393, 94), (1320, 220), (1108, 1561), (144, 1495)], (1550, 1800)), (164, 159, 153), 41),
        ('light-desk', ([(50, 46), (1500, 32), (1475, 1950), (41, 1924)], (1550, 2010)), (232, 233, 232), 0),
    ]
    def save_photo(name, image, projection, desk, shade):
        file = f'independent-{name}.jpg'
        capture(image, projection, desk, shade).save(OUT / file, quality=90)
        return {'file': file, 'width': projection[1][0], 'height': projection[1][1], 'corners': [dict(x=x, y=y) for x, y in projection[0]]}

    filled, truth = marked(blank, blocks, written, values, pencil=True)
    captures = [save_photo(name, filled, projection, desk, shade) for name, projection, desk, shade in photos]
    # A genuine wrong layout, with a printed response row moved on the page.
    wrong_blocks = [mc_block('left', 78, [91.5,112.5,133.75,176,197.25,218.5,240,261,282.25], 1), *blocks[1:]]
    wrong, _ = marked(render(wrong_blocks, written, 'wrong layout'), wrong_blocks, written, values, pencil=True)
    _, projection, desk, shade = photos[0]
    # Keep the first right group fixed and shift the entire second group.
    # This looks like a plausible local correction on the wrong form.
    moved_blocks = [
        blocks[0], mc_block('right-top', 205, [91.5,112.5,133.75], 10),
        mc_block('right-bottom', 211.4, [176,197.25], 13), *blocks[2:],
    ]
    moved, _ = marked(render(moved_blocks, written, 'shifted block'), moved_blocks, written, values, pencil=True)
    # Preserve fixed print near each grid when moving the two grid blocks.
    # Individual questions and the broader printed layout remain unchanged.
    def displaced(left, right):
        altered = [
            mc_block('left-start', 78 + left, [91.5,112.5], 1),
            mc_block('left-rest', 78, [154.75,176,197.25,218.5,240,261,282.25], 3),
            mc_block('right-start', 205 + right, [91.5,112.5,133.75], 10),
            mc_block('right-rest', 205, [176,197.25], 13), *blocks[2:],
        ]
        return marked(render(altered, written, 'camera'), altered, written, values, pencil=True)[0]

    # Dark graphite, lighter pressure, an erasure, and penned work in a
    # non-graded area. The grading oracle retains the intended MC answers.
    marked_copy = filled.copy()
    draw = ImageDraw.Draw(marked_copy)
    draw.line([scaled((52,401)), scaled((72,391)), scaled((74,406)),
               scaled((94,397)), scaled((103,401))], fill=(39,50,93), width=4)
    erased = blocks[0]['items'][4]['choices'][2]
    for shift in [-.8, -.3, .2, .6]:
        x,y = erased['x'],erased['y']
        draw.line([scaled((x-1.4,y+shift)), scaled((x+1.1,y+shift-.5))], fill=(222,221,218), width=1)
    marks = marked_copy.filter(ImageFilter.GaussianBlur(.65))
    regression = [
        {'name': 'written-and-erased', 'valid': True, **save_photo('written-erased', marks, *photos[1][1:])},
        {'name': 'opposing-curl', 'valid': True,
         **save_photo('opposing-curl', curl_response_sheet(marked_copy, -4, 5), *photos[2][1:])},
        {'name': 'opposed-shifted-blocks', 'valid': False,
         **save_photo('opposed-shifts', displaced(-6, 6.2), projection, desk, shade)},
        {'name': 'same-direction-shifted-blocks', 'valid': False,
         **save_photo('same-shifts', displaced(6, 6.2), projection, desk, shade)},
    ]
    (OUT / 'independent-oracle.json').write_text(json.dumps({
        'blank': save_photo('enrollment', blank, enrollment, (232, 233, 232), 0),
        'scans': captures,
        'curl': save_photo('curl', curl_response_sheet(filled), projection, desk, shade),
        'wrong': save_photo('wrong', wrong, projection, desk, shade),
        'shiftedBlock': save_photo('shifted-block', moved, projection, desk, shade),
        'photographicRegression': regression,
        'truth': truth,
    }, indent=2)+'\n')

if __name__ == '__main__':
    generate()
