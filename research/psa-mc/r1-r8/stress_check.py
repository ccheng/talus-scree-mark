import cv2,numpy as np,json
from structured_check import page
from structured import fused,rectified_fused
from glyphs import bank
from fixtures import evaluate
B,Y=bank();out=[]
for case in ['clean','partial','empty-ring-distractor','five']:
 im,t=page(case);h,w=im.shape
 for angle in [-5,3]:
  m=cv2.getRotationMatrix2D((w/2,h/2),angle,1);a=cv2.warpAffine(im,m,(w,h),borderValue=255);truth=[[(m@[x,y,1]).tolist() for x,y in row]for row in t]
  f,_=fused(a,B,Y);r,e,est=rectified_fused(a,B,Y);z={'case':case,'angle':angle,'estimated_correction':round(est,3),'before':evaluate(f,truth,4),'after':evaluate(r,truth,4),'labels':sum('number'in q for q in r),'conflicts':sum(q.get('source')=='unlabelled-row-conflict'for q in r)};print(z,flush=True);out.append(z)
open('stress-results.json','w').write(json.dumps(out,indent=2))
