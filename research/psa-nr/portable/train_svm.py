"""Regenerate R5 synthetic SVM. Does not use any physical photograph or holdout data."""
from nr_reference import glyph_patch,features
import numpy as np,cv2,joblib,sys
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
from sklearn.svm import SVC
ROOT=Path('/usr/share/fonts/truetype')
GROUPS=[['dejavu','liberation','freefont','lato','clear-sans'],['croscore','open-sans'],['gentiumplus','ebgaramond','andika','paratype']]
def fonts(group):
 return sorted([p for f in GROUPS[group] for p in (ROOT/f).glob('*.ttf') if not any(t in p.name.lower() for t in ['italic','oblique','math','bold','black','heavy'])])

def data(group,n,seed):
 rng=np.random.default_rng(seed);F=fonts(group);out=[];labels=[]
 for i in range(n):
  d=i%10;rx,ry=rng.uniform(6,22,2);x,y=35+rng.uniform(-1,1,2);im=Image.new('L',(70,70),int(rng.integers(222,256)));dr=ImageDraw.Draw(im);fg=int(rng.integers(15,155));dr.ellipse((x-rx,y-ry,x+rx,y+ry),outline=fg,width=max(1,round(min(rx,ry)*rng.uniform(.07,.19))));f=ImageFont.truetype(str(F[rng.integers(len(F))]),max(5,round(ry*rng.uniform(.95,1.85))));dr.text((x,y),str(d),font=f,anchor='mm',fill=fg);a=cv2.GaussianBlur(np.array(im),(3,3),float(rng.uniform(.15,.9)));a=np.clip(a.astype(float)+rng.normal(0,2,a.shape),0,255).astype('uint8');out.append(glyph_patch(a,x+rng.uniform(-.12,.12)*rx,y+rng.uniform(-.12,.12)*ry,rx,ry));labels.append(d)
 return np.array(out,dtype='float32'),np.array(labels)
if __name__=='__main__':
 X,y=data(0,4800,602)
 svm=SVC(C=4,probability=True,random_state=602).fit(features(X),y)
 joblib.dump(svm,sys.argv[1] if len(sys.argv)>1 else 'regenerated-svm.pkl')
 print('Support vectors',svm.support_vectors_.shape,'training font files',len(fonts(0)))
