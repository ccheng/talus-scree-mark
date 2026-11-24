"""Deterministic, synthetic tuning data. No physical captures are included."""
import importlib.util
import json
from pathlib import Path
import sys

import cv2 as cv
import numpy as np
from PIL import ImageDraw

from match import warp_points

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('portfolio', HERE.parents[1]/'tests/acceptance/m4/portfolio-fixtures.py')
portfolio = importlib.util.module_from_spec(spec)
spec.loader.exec_module(portfolio)


def corners(points):
    return [{'x': float(x), 'y': float(y)} for x, y in points]


def bend(points, strength):
    x, y = np.asarray(points).T
    u, v = x/612, y/792
    return np.stack((strength*np.sin(np.pi*u)*np.sin(np.pi*v)*np.cos(np.pi*v),
                     strength*np.sin(np.pi*u)*np.sin(np.pi*v)*np.cos(np.pi*u)), axis=1)


def photograph(image, quad, size, strength, shade):
    page = np.float32([(0,0), (612,0), (612,792), (0,792)])
    matrix = cv.getPerspectiveTransform(page, np.float32(quad))
    y, x = np.mgrid[:size[1], :size[0]]
    flat = warp_points(np.linalg.inv(matrix), np.column_stack((x.ravel(), y.ravel())))
    original = flat
    for _ in range(5):
        original = flat - bend(original, strength)
    map_x, map_y = (original*portfolio.SCALE).reshape(size[1], size[0], 2).astype('float32').transpose(2,0,1)
    photo = cv.remap(cv.cvtColor(np.asarray(image), cv.COLOR_RGB2BGR), map_x, map_y, cv.INTER_CUBIC,
                     borderValue=(134, 141, 145))
    light = (1-shade*(.15+.85*x/size[0])*(.24+.76*y/size[1]))[:, :, None]
    return cv.GaussianBlur((photo*light).astype(np.uint8), (3,3), .42), matrix


def layout(blocks, written, label):
    image = portfolio.render(blocks, written, label)
    draw = ImageDraw.Draw(image)
    for x, y, words in [(43, 306, 'Part two: explain your method'), (315, 390, 'Use the reference values shown above'),
                        (45, 586, 'End of assessment — check all responses'), (326, 696, 'Proctor only  /  version record')]:
        portfolio.text(draw, x, y, words, 10, True)
        draw.line(portfolio.scaled((x, y+20, x+220, y+20, x+220, y+44)), fill=(83,86,91), width=2)
    return image


def generate(output):
    output.mkdir(parents=True, exist_ok=True)
    mc = [portfolio.mc_block('a', 82, [102,124], 1), portfolio.mc_block('b', 82, [165,187,209,231,253,275,297], 3),
          portfolio.mc_block('c', 218, [102,124,146], 10), portfolio.mc_block('d', 218, [198,220], 13)]
    nr = [portfolio.nr_block(1, 343, 20, 153, 12, 95, 28, 3.9)]
    written = [portfolio.bounds(42, 414, 520, 115)]
    profile = dict(schemaVersion=1, strategy='markerless', id='research-mc', name='Synthetic research form', revision=1,
                   page=dict(width=612, height=792, units='pt', origin='top-left', orientation='portrait'), components=mc)
    answers = {f'MC{i}': (None if i in (4,11) else 'BCAD'[i%4]) for i in range(1,15)}
    tokens = {**answers, 'NR1': '123 '}
    blank = layout(mc+nr, written, 'mechanical systems / FORM K')
    blank_quad = [(62,48), (1480,107), (1430,1920), (35,1830)]
    photo, _ = photograph(blank, blank_quad, (1520,1970), 0, .04)
    cv.imwrite(str(output/'blank.jpg'), photo, [cv.IMWRITE_JPEG_QUALITY, 93])
    cases = []
    for name, quad, size, curl, shadow, valid in [
        ('flat', [(166,60),(1290,90),(1380,1750),(90,1800)], (1460,1860), 0, .09, True),
        ('distance', [(290,169),(1170,87),(1260,1290),(244,1420)], (1520,1570), 0, .18, True),
        ('curl', [(73,98),(1412,40),(1510,1840),(135,1970)], (1580,2010), 11, .13, True),
        ('compound-curl', [(128,50),(1530,159),(1427,1960),(40,1812)], (1590,2010), 24, .18, True),
        ('one-row-shift', [(166,60),(1290,90),(1380,1750),(90,1800)], (1460,1860), 0, .09, False),
        ('similar-layout', [(110,64),(1390,90),(1422,1730),(90,1800)], (1480,1860), 0, .13, False),
        ('heading-only', [(110,64),(1390,90),(1422,1730),(90,1800)], (1480,1860), 0, .13, False),
    ]:
        use = mc
        if name == 'one-row-shift':
            use = mc[:1]+[portfolio.mc_block('b', 82, [187,209,231,253,275,297,319], 3)]+mc[2:]
        if name == 'similar-layout':
            use = mc[:3]+[portfolio.mc_block('d', 218, [208,230], 13)]
        label = 'thermal energy / FORM Z' if name in ('similar-layout', 'heading-only') else 'mechanical systems / FORM K'
        filled, _ = portfolio.marked(layout(use+nr, written, label), use+nr, written, tokens, pencil=True)
        photo, matrix = photograph(filled, quad, size, curl, shadow)
        file = f'{name}.jpg'
        cv.imwrite(str(output/file), photo, [cv.IMWRITE_JPEG_QUALITY, 89])
        case = dict(name=name, image=file, valid=valid, scanCorners=corners(quad))
        if valid:
            choices = [(f"{item['id']}:{choice['symbol']}", (choice['x'],choice['y']))
                       for block in mc for item in block['items'] for choice in item['choices']]
            points = np.asarray([p for _, p in choices])
            projected = warp_points(matrix, points+bend(points,curl))
            case.update(answers=answers, centers=dict(zip((key for key,_ in choices), corners(projected))))
        cases.append(case)
    (output/'manifest.json').write_text(json.dumps(dict(blank='blank.jpg', blankCorners=corners(blank_quad), profile=profile, cases=cases),indent=2)+'\n')


if __name__ == '__main__':
    generate(Path(sys.argv[1]) if len(sys.argv)>1 else HERE/'generated')
