import json,cv2,numpy as np,time
from PIL import Image,ImageDraw,ImageFont
from glyphs import bank,FONT_ROOT,render,feature,classify,TEST
from joint import joint
from header_path import header_rows
from structured import fused
from cycle2 import make,score
from mc_core import discover

def partial_header():
 a,t=make('no-numbers')
 for i,row in enumerate(t):
  x,y=row[i%4];a[y-9:y+10,x-9:x+10]=248
 return a,t
if __name__=="__main__":
 B,Y=bank();out=[]
 a,t=partial_header();out.append(dict(case='every-row-missing-one-no-labels',first=score(fused(a,B,Y)[0],t),joint=score(joint(a,B,Y)[0],t),header=score(header_rows(a,B,Y),t)))
 # Test page perspective with ground-truth corners and inverse known homography; not auto corner detection.
 for case in ('clean','edge-loss','gap-rings','mixed'):
  a,t=make(case);h,w=a.shape;src=np.float32([[0,0],[w-1,0],[w-1,h-1],[0,h-1]]);dst=np.float32([[130,80],[w-110,5],[w-1,h-60],[20,h-1]]);H=cv2.getPerspectiveTransform(src,dst);warp=cv2.warpPerspective(a,H,(w,h),borderValue=255);wt=[cv2.perspectiveTransform(np.float32([r]),H)[0].tolist() for r in t];before=joint(warp,B,Y)[0];rect=cv2.warpPerspective(warp,np.linalg.inv(H),(w,h),borderValue=255);after=joint(rect,B,Y)[0];out.append(dict(case='perspective-'+case,raw=score(before,wt),rectified=score(after,t)))
 # Header-only evaluation on ordinary cases.
 for case in ('clean','five','no-numbers','mixed','gap-rings'):
  a,t=make(case);out.append(dict(case='header-'+case,header=score(header_rows(a,B,Y),t)))
 for z in out:print(z,flush=True)
 open('extension-results.json','w').write(json.dumps(out,indent=2))
