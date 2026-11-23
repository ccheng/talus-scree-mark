"""Generate public template captures with independent page-corner oracles."""

import json
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps


HERE = Path(__file__).resolve().parent
APP = HERE.parents[2] / 'app'
SOURCE = APP / 'fixtures' / 'm3'
OUTPUT = HERE / 'fixtures'
POSE_MATH = spec_from_file_location('pose_fixture_math', HERE.parent / 'm2' / 'fixtures.py')
pose_math = module_from_spec(POSE_MATH)
POSE_MATH.loader.exec_module(pose_math)

SCENES = [
    ('weak-edge', (1480, 1860), [(95, 146), (1325, 91), (1310, 1615), (142, 1746)], (244, 244, 244)),
    ('ordinary-perspective', (1480, 1900), [(103, 182), (1244, 82), (1378, 1693), (177, 1804)], (146, 153, 155)),
    ('ordinary-perspective-2', (1480, 1900), [(81, 103), (1390, 177), (1270, 1762), (147, 1705)], (132, 142, 147)),
]


def render(page, frame, corners, background, output_name):
    source = [(0, 0), (page.width - 1, 0), (page.width - 1, page.height - 1), (0, page.height - 1)]
    perspective = pose_math.homography(corners, source)
    capture = page.transform(frame, Image.Transform.PERSPECTIVE, perspective,
                             Image.Resampling.BICUBIC, fillcolor=background)
    capture.save(OUTPUT / output_name, quality=92, subsampling=0)


def generate():
    OUTPUT.mkdir(exist_ok=True)
    blank = Image.open(SOURCE / 'mixed-blank.png').convert('RGB')
    filled = Image.open(SOURCE / 'mixed-filled.png').convert('RGB')
    records = []
    for identifier, frame, corners, background in SCENES:
        blank_name, filled_name = f'{identifier}-blank.jpg', f'{identifier}-filled.jpg'
        render(blank, frame, corners, background, blank_name)
        render(filled, frame, corners, background, filled_name)
        records.append({'id': identifier, 'blank': blank_name, 'filled': filled_name,
                        'corners': [{'x': x, 'y': y} for x, y in corners]})

    _, frame, corners, background = SCENES[1]
    key = json.loads((SOURCE / 'mixed-key.json').read_text())
    block = key['blocks'][-1]['bounds']
    scale = filled.width / key['paper']['width']
    cover = (round(block['x'] * scale), round(block['y'] * scale),
             round((block['x'] + block['width']) * scale), round((block['y'] + block['height']) * scale))
    missing = filled.copy()
    ImageDraw.Draw(missing).rectangle(cover, fill='white')
    render(missing, frame, corners, background, 'pose-missing-response-block.jpg')
    render(ImageOps.mirror(filled), frame, corners, background, 'pose-mirrored.jpg')
    (OUTPUT / 'pose-oracles.json').write_text(json.dumps({
        'scenes': records, 'missingBlock': 'pose-missing-response-block.jpg', 'mirror': 'pose-mirrored.jpg',
    }, indent=2) + '\n')
    print('Generated three independently projected template pairs and two hard negatives.')


if __name__ == '__main__':
    generate()
