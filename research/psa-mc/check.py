import cv2, json,time
from mc_core import discover
from fixtures import fixture,CASES,evaluate
from pathlib import Path
out=[]
for case in CASES:
    im,t=fixture(case);st=time.monotonic();rows,p=discover(im);h=2166136261
    for v in im.ravel():h=((h^int(v))*16777619)&0xffffffff
    z={'case':case,'hash':f'{h:x}',**evaluate(rows,t,3),'points':len(p),'seconds':round(time.monotonic()-st,3)};print(z,flush=True);out.append(z)
Path('results.json').write_text(json.dumps(out,indent=2))
