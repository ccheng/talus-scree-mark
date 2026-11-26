"""Public development fixtures; optionally pass a local photo for private diagnostics."""
from pathlib import Path
import argparse,json,cv2,joblib
from nr_reference import Reference
from dev_fixtures import make
p=argparse.ArgumentParser();p.add_argument('model');p.add_argument('--output',default='native-fixtures');p.add_argument('--photo');args=p.parse_args()
P=Path(args.output).resolve();P.mkdir(exist_ok=True,parents=True);ref=Reference(joblib.load(args.model));rows=[]
def record(id,im,t):
 r=ref.discover(im);path=P/f'{id}.raw';path.write_bytes(im.tobytes());rows.append(dict(id=id,path=str(path),w=im.shape[1],h=im.shape[0],truth=[dict(valid=z['valid'],points=z['points'].tolist(),pitch=z['pitch']) for z in t],python=[dict(centers=q['centers'],decimals=q['decimals'],decision=q['decision']) for q in r['proposals']]))
for i,(ks,angle,project) in enumerate([(['normal','separate','faint','broken'],0,False),(['normal','shift_col','outer','missing_decimal'],2,True),(['normal','swap','shift_header','normal'],-3,True),([],0,False)]):
 im,t=make(180010+i*137,ks,angle,project);record(i,im,t)
if args.photo:
 im=cv2.imread(args.photo,0);h,w=im.shape;s=min(1,2000/h);im=cv2.resize(im,(round(w*s),round(h*s)),interpolation=cv2.INTER_AREA);record('private',im,[])
(P/'manifest.json').write_text(json.dumps(rows))
