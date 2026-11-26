"""Local affine pilot on page shears. No ground-truth corners supplied to this pilot."""
import cv2,numpy as np,json
from cycle2 import make,score
from glyphs import bank
from joint import joint
B,Y=bank();out=[]
for case in ('clean','missing-row','edge-loss','gap-rings'):
 a,t=make(case);h,w=a.shape
 for sx in (.018,.036,-.036):
  M=np.float32([[1,sx,0],[.012,1,0]]);b=cv2.warpAffine(a,M,(w,h),borderValue=255);truth=[cv2.transform(np.float32([r]),M)[0].tolist() for r in t];r=joint(b,B,Y)[0];q=joint(b,B,Y,local_affine=True)[0];out.append(dict(case=case,shear=sx,before=score(r,truth),after=score(q,truth)))
print(json.dumps(out,indent=2));open('affine-results.json','w').write(json.dumps(out,indent=2))
