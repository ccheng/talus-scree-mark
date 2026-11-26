import cv2,numpy as np,json,time,joblib,sys
from pathlib import Path
from glyphs import bank,FONT_ROOT,render,feature,classify
from cycle2 import make,score
from extension import partial_header
from combined import combined,reconcile_nr
from joint import joint
from structured import fused
B,Y=bank();a,t=partial_header();r=combined(a,B,Y)[0];out={'header_recovery':score(r,t),'combined':[]}
for case in ['clean','no-header','missing-row','no-header-missing','edge-loss','gap-rings','no-header-gap','five','no-numbers','missing-label','mixed','shadow']:
 a,t=make(case);s=time.perf_counter();r=combined(a,B,Y)[0];out['combined'].append(dict(case=case,**score(r,t),seconds=round(time.perf_counter()-s,3)))
# Segmented digit classifier transfer, including genuinely difficult small glyphs.
svm=joblib.load(sys.argv[1]);rng=np.random.default_rng(2916);records=[]
for size in (9,13,20,30):
 X=[];labels=[]
 for font in ['charis/CharisSIL-Regular.ttf','andika/Andika-Regular.ttf','crosextra/Carlito-Regular.ttf','ebgaramond/EBGaramond12-Regular.ttf']:
  for ch in '0123456789':
   for j in range(3):
    a=render(ch,font,size);a=cv2.GaussianBlur(a,(3,3),float(rng.uniform(.2,1.15)));a=np.clip(a*rng.uniform(.5,1)+rng.normal(0,.025,a.shape),0,1);X.append(feature(a));labels.append(ch)
 X=np.array(X);lab=np.array(labels);tp=np.array([z[0] for z in classify(X,B,Y)]);sp=svm.predict(X).astype(str);records.append(dict(size=size,n=len(lab),svm=int((sp==lab).sum()),template=int((tp==lab).sum()),agree=int((sp==tp).sum())))
out['glyph_transfer']=records
# Known real image, private only. Count/recognized labels are not an independently measured localization oracle.
if len(sys.argv)>2:
 p=Path(sys.argv[2]);a=cv2.imread(str(p),0)
 if a is None:raise ValueError('Unable to read supplied private diagnostic image')
 a=cv2.resize(a,(850,1100),interpolation=cv2.INTER_AREA);r,e,h=combined(a,B,Y);out['private_aggregate']=dict(rows=len(r),numbered=sum('number'in z for z in r),numbers=sorted([z['number'] for z in r if 'number'in z]),review=sum(z['decision']=='review' for z in r),headers=len(h))
# Only aggregate results are written; no private pixels or positions.
print(json.dumps(out,indent=2));Path('final-results.json').write_text(json.dumps(out,indent=2))
