"""Synthetic independently photographed Alberta grids with varied marks."""
import json
import sys
from copy import deepcopy
from importlib.util import module_from_spec, spec_from_file_location
from random import Random
from PIL import ImageDraw

spec = spec_from_file_location('portfolio', __file__.replace('numerical-photos.py', 'portfolio-fixtures.py'))
portfolio = module_from_spec(spec)
sys.dont_write_bytecode = True
spec.loader.exec_module(portfolio)
P = portfolio

poses = [
    ([(42, 50), (1495, 55), (1479, 1941), (36, 1932)], (1540, 1990)),
    ([(181, 105), (1370, 146), (1495, 1825), (107, 1971)], (1650, 2020)),
    ([(370, 99), (1332, 223), (1156, 1567), (109, 1478)], (1550, 1770)),
    ([(103, 112), (1481, 51), (1436, 1902), (204, 1955)], (1600, 2020)),
    ([(249, 196), (1331, 115), (1490, 1801), (104, 1918)], (1590, 1970)),
]

def photo(name, image, pose, shade, desk):
    file = f'numerical-{name}.jpg'
    P.capture(image, poses[pose], desk, shade).save(P.OUT / file, quality=90)
    corners, (width, height) = poses[pose]
    return dict(file=file, width=width, height=height, corners=[dict(x=x,y=y) for x,y in corners])

def draw_mark(draw, choice, medium, seed):
    x, y, r = (choice[key] for key in ('x','y','radius'))
    rng = Random(seed)
    if medium == 'pen':
        for dy in [-.43, -.24, -.06, .14, .32, .49]:
            draw.line([P.scaled((x-.59*r, y+(dy+.17)*r)), P.scaled((x+.55*r, y+(dy-.11)*r))],
                      fill=(36,58,106), width=2)
    elif medium == 'pencil':
        for dy in [-.5,-.31,-.15,.03,.22,.43,.55]:
            shade = rng.randint(48, 99)
            draw.line([P.scaled((x-.55*r, y+(dy+.12)*r)), P.scaled((x+.61*r, y+(dy-.13)*r))],
                      fill=(shade,shade,shade), width=2)
    elif medium == 'erased':
        for dy in [-.41,-.20,.04,.20,.43]:
            shade = rng.randint(211, 237)
            draw.line([P.scaled((x-.50*r, y+dy*r)), P.scaled((x+.43*r, y+(dy-.1)*r))],
                      fill=(shade,shade,shade), width=1)
    elif medium == 'weak':
        draw.line([P.scaled((x-.41*r, y-.20*r)), P.scaled((x+.40*r, y+.13*r))],
                  fill=(108,108,109), width=4)

def mark_form(blank, blocks, answers, medium, extra=()):
    only_mc = [b for b in blocks if b['kind'] == 'mc']
    values = {i['id']: answers[i['id']] for b in only_mc for i in b['items']}
    image,_ = P.marked(blank, only_mc, [], values, pencil=True)
    draw = ImageDraw.Draw(image)
    numerical = {i['id']: i for b in blocks if b['kind']=='nr' for i in b['items']}
    def mark(name, pos, symbol, ink):
        choice = next(c for c in numerical[name]['slots'][pos]['choices'] if c['symbol']==symbol)
        draw_mark(draw, choice, ink, sum(map(ord, name+symbol))+pos)
    for name,item in numerical.items():
        for pos,symbol in enumerate(answers[name]):
            if symbol != ' ': mark(name,pos,symbol,medium)
        for pos,symbol in enumerate(answers[name].rstrip()):
            if symbol != ' ':
                box = next(b['writingBoxes'][pos] for b in blocks if b['items'][0]['id']==name)
                P.text(draw, box['x']+box['width']*.34, box['y']+box['height']*.65, symbol, 9, False, 'mm')
    for entry in extra: mark(*entry)
    return image

def generate():
    P.OUT.mkdir(exist_ok=True)
    mc = P.mc_block('letters', 86, [105,123,141,159], 1)
    blocks = [mc, *[P.nr_block(i, x, pitch, 150, step, 99, 26, radius) for i,(x,pitch,step,radius) in enumerate(
        [(286,17.0,13.0,4.3),(425,20,13.6,4.7),(285,17.4,14.2,4.6),(423,19.5,15.1,4.75)],1)]]
    for block in blocks[3:]:
        for data in [block['bounds'],*block['writingBoxes']]:
            data['y'] += 231
        for slot in block['items'][0]['slots']:
            for cell in slot['choices']: cell['y'] += 231

    blank = P.render(blocks, [], 'Alberta recognition')
    mc_answers = dict(MC1='A',MC2='D',MC3='C',MC4=None)
    definitions = [
        ('pencil',1,20,'pencil',dict(NR1='0.25', NR2='12.7', NR3='    ', NR4='9   '),[],{}),
        ('pen',2,36,'pen',dict(NR1='7.2 ', NR2='38  ', NR3='1.60', NR4='99  '),[],{}),
        ('blank',3,25,'pencil',dict.fromkeys(['NR1','NR2','NR3','NR4'],'    '),[],{}),
        ('unsafe',4,28,'pencil',dict(NR1='004 ', NR2='3 7 ', NR3='44  ', NR4='    '),
         [('NR3',0,'7','pen'),('NR4',0,'2','weak')],{'NR1':'format','NR2':'format','NR3':'multiple','NR4':'weak'}),
        ('erased',3,20,'pencil',dict(NR1='21  ', NR2='    ', NR3='9.6 ', NR4='1   '),
         [('NR1',1,'7','erased'),('NR2',2,'3','erased')],{}),
    ]
    records = []
    for name,pose,shade,ink,answers,extra,review in definitions:
        truth = {**mc_answers,**answers}
        completed = mark_form(blank,blocks,truth,ink,extra)
        records.append(dict(name=name, valid=True, truth=truth, review=review, optionalReview=list(answers) if name == 'pen' else [],
                            **photo(name,completed,pose,shade,(147,144,145))))

    shifted = deepcopy(blocks)
    for slot in shifted[2]['items'][0]['slots']:
        next(c for c in slot['choices'] if c['symbol'] == '4')['y'] += 7
    wrong = P.render(shifted, [], 'wrong NR geometry')
    records.append(dict(name='shifted-nr-row', valid=False, **photo('wrong',wrong,4,12,(146,143,146))))
    manifest = dict(blank=photo('blank-enrollment',blank,0,5,(216,214,211)),components=blocks,cases=records)
    (P.OUT/'numerical-oracle.json').write_text(json.dumps(manifest, indent=2)+'\n')

if __name__ == '__main__':
    generate()
