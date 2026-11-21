from pathlib import Path
from PIL import Image, ImageDraw
import json

output = Path(__file__).with_name('fixtures')
output.mkdir(exist_ok=True)
width, height = 120, 80
image = Image.new('RGB', (width, height))
draw = ImageDraw.Draw(image)
colors = {'R': '#e90000', 'G': '#00dc00', 'B': '#0000e9', 'Y': '#ecd900'}
for index, color in enumerate(colors.values()):
    x = index % 2 * (width // 2)
    y = index // 2 * (height // 2)
    draw.rectangle((x, y, x + width // 2 - 1, y + height // 2 - 1), fill=color)
expected_corners = ['RGBY', 'GRYB', 'YBGR', 'BYRG', 'RBGY', 'BRYG', 'YGBR', 'GYRB']
expected = {}
for orientation, corners in enumerate(expected_corners, 1):
    exif = Image.Exif()
    exif[274] = orientation
    path = output / f'corners-{orientation}.jpeg'
    image.save(path, exif=exif, quality=92)
    expected[path.name] = {'corners': list(corners), 'width': width if orientation < 5 else height, 'height': height if orientation < 5 else width}
image.save(output / 'corners.png')
expected['corners.png'] = {'corners': list('RGBY'), 'width': width, 'height': height}
image.resize((6500, 3500)).save(output / 'normalize.jpeg', quality=85)
expected['normalize.jpeg'] = {'corners': list('RGBY'), 'width': 2400, 'height': 1292}
for label, size in [('dimension', (8193, 4)), ('pixels', (5001, 5000))]:
    Image.new('RGB', size, color='white').save(output / f'oversized-{label}.jpeg')
image.save(output / 'unsupported.gif')
(output / 'truncated.jpeg').write_bytes((output / 'corners-1.jpeg').read_bytes()[:90])
encoded = (output / 'corners-1.jpeg').read_bytes()
(output / 'oversized-encoded.jpeg').write_bytes(encoded + b'\x00' * (20 * 1024 * 1024 + 1 - len(encoded)))
(output / 'oracles.json').write_text(json.dumps(expected, indent=2) + '\n')
