"""Verify the supplied synthetic blank and make independently mapped filled controls."""

from hashlib import sha256
from importlib.util import module_from_spec, spec_from_file_location
import json
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
SOURCE = HERE.parents[2] / 'app' / 'fixtures' / 'm3'
OUTPUT = HERE / 'fixtures'
ATTACHMENT = HERE / 'inputs' / 'cropped-interleaved-blank.jpeg'
ATTACHMENT_SHA256 = 'bd42f28a7c0a96b38e1e35bbf98bef585680582e3f38d6261fe7ea909d4207e7'
POSE_MATH = spec_from_file_location('pose_fixture_math', HERE.parent / 'm2' / 'fixtures.py')
pose_math = module_from_spec(POSE_MATH)
POSE_MATH.loader.exec_module(pose_math)

PAGE = [(0, 0), (612, 0), (612, 792), (0, 792)]
# Fit from the centroids of 199 attachment bubble outlines and the published page coordinates.
# Alternating disjoint fitting/check sets each had maximum residual below 0.50 pixels.
MEASURED = (1.97069674, -.0000142283, -.514105,
            -.000166386, 1.97072396, -22.390717, 0, 0, 1)


def translated(dx, dy):
    a, b, c, d, e, f = MEASURED[:6]
    return [(a * x + b * y + c + dx, d * x + e * y + f + dy) for x, y in PAGE]


def generate():
    assert sha256(ATTACHMENT.read_bytes()).hexdigest() == ATTACHMENT_SHA256
    with Image.open(ATTACHMENT) as original:
        assert original.format == 'JPEG' and original.size == (1206, 1664) and original.getexif().get(274, 1) == 1
    with Image.open(SOURCE / 'interleaved-filled.png') as original:
        filled = original.convert('RGB')
    assert filled.size == (1530, 1980)
    OUTPUT.mkdir(exist_ok=True)
    source_pixels = [(x * 2.5, y * 2.5) for x, y in PAGE]
    cases = [
        ('attachment-measured', (1206, 1664), translated(0, 0), True),
        ('white-padding', (1430, 1810), translated(109, 61), True),
        ('page-translation', (1190, 1530), translated(62, -52), True),
        ('ordinary-perspective', (1240, 1600), [(-23, -72), (1283, 34), (1170, 1584), (-63, 1509)], True),
        ('margin-crop', (1056, 1420), translated(-57, -50), True),
        ('response-crop', (944, 1664), translated(0, 0), False),
    ]
    records = []
    for name, size, corners, complete in cases:
        inverse = pose_math.homography(corners, source_pixels)
        matrix = pose_math.homography(PAGE, corners)
        result = filled.transform(size, Image.Transform.PERSPECTIVE, inverse, Image.Resampling.BICUBIC, fillcolor='white')
        filename = f'interleaved-{name}.jpg'
        result.save(OUTPUT / filename, quality=94, subsampling=0)
        records.append({'id': name, 'file': filename, 'width': size[0], 'height': size[1],
                        'complete': complete, 'corners': [{'x': x, 'y': y} for x, y in corners],
                        'pageToSource': [*matrix, 1]})
    (OUTPUT / 'interleaved-crop-oracles.json').write_text(json.dumps({
        'attachment': {'sha256': ATTACHMENT_SHA256, 'width': 1206, 'height': 1664, 'pageToSource': list(MEASURED)},
        'filled': records,
    }, indent=2) + '\n')
    print(f'Verified exact attached JPEG and generated {len(records)} independent interleaved capture controls.')


if __name__ == '__main__':
    generate()
