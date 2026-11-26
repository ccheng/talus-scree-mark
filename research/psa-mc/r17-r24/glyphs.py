"""Standalone printed glyph pilot. Train/test font families disjoint; no private training data."""
import cv2,numpy as np
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
from scipy.spatial.distance import cdist
FONT_ROOT=Path('/usr/share/fonts/truetype')
TRAIN=['dejavu/DejaVuSans.ttf','dejavu/DejaVuSans-Bold.ttf','liberation/LiberationSans-Regular.ttf','liberation/LiberationSerif-Regular.ttf','lato/Lato-Regular.ttf','freefont/FreeSans.ttf']
TEST=['roboto/Roboto-Regular.ttf','open-sans/OpenSans-Regular.ttf','croscore/Arimo-Regular.ttf','gentiumplus/GentiumPlus-Regular.ttf']
LABELS='0123456789ABCDE'
HOG=cv2.HOGDescriptor((24,24),(12,12),(6,6),(6,6),9)
def canonical(a):
 a=np.maximum(a.astype(np.float32),0);a[a<.10]=0;peak=np.percentile(a[a>0],90) if (a>0).any() else 0
 if peak<.025:return np.zeros((24,24),np.float32)
 a=np.clip(a/peak,0,1);ys,xs=np.where(a>.30)
 if not len(ys):return np.zeros((24,24),np.float32)
 q=a[ys.min():ys.max()+1,xs.min():xs.max()+1];h,w=q.shape;s=min(20/h,20/w);q=cv2.resize(q,(max(1,round(w*s)),max(1,round(h*s))));h,w=q.shape;z=np.zeros((24,24),np.float32);z[(24-h)//2:(24-h)//2+h,(24-w)//2:(24-w)//2+w]=q
 return z

def feature(a):return HOG.compute(np.uint8(canonical(a)*255)).ravel()
def render(ch,path,size):
 im=Image.new('L',(70,70),0);d=ImageDraw.Draw(im);d.text((35,35),ch,font=ImageFont.truetype(str(FONT_ROOT/path),size),anchor='mm',fill=255);return np.array(im,dtype=np.float32)/255

def bank():
 data=[];ys=[]
 for f in TRAIN:
  if not (FONT_ROOT/f).exists():continue
  for ch in LABELS:
   for size in [13,21,32]:
    a=render(ch,f,size)
    for blur in [0,.7]:
     q=cv2.GaussianBlur(a,(3,3),blur) if blur else a
     data.append(feature(q));ys.append(ch)
 return np.array(data),np.array(ys)

def classify(features,B,Y):
 d=cdist(np.atleast_2d(features),B,'euclidean');out=[]
 for row in d:
  z=sorted((float(row[Y==c].min()),c) for c in LABELS);out.append((z[0][1],z[0][0],z[1][0]-z[0][0]))
 return out

def glyph_components(im,B,Y,svm=None,mode="template"):
 h,w=im.shape;s=min(h,w);bw=cv2.adaptiveThreshold(im,255,cv2.ADAPTIVE_THRESH_GAUSSIAN_C,cv2.THRESH_BINARY_INV,max(15,int(s*.025)//2*2+1),7)
 n,_,stats,_=cv2.connectedComponentsWithStats(bw,8);out=[];feats=[]
 for x,y,ww,hh,area in stats[1:]:
  if not s*.008<=hh<=s*.04 or not .13<=ww/hh<=1.15 or not .12<=area/(ww*hh)<=.9:continue
  if x==0 or y==0:continue
  patch=im[y:y+hh,x:x+ww];fg=np.maximum(float(np.percentile(im[max(0,y-2):y+hh+2,max(0,x-2):x+ww+2],90))-patch.astype(float),0)/255
  feats.append(feature(fg));out.append((float(x+ww/2),float(y+hh/2),int(ww),int(hh),int(x),int(y)))
 if not feats:return []
 predictions=classify(np.array(feats),B,Y)
 if svm is not None and mode!='template':
  inds=[i for i,(ch,dist,margin) in enumerate(predictions) if ch.isdigit() and dist<1.7]
  if inds:
   probs=svm.predict_proba(np.asarray(feats)[inds]);classes=svm.classes_
   for i,p in zip(inds,probs):
    ch,dist,margin=predictions[i];order=np.argsort(p);digit=str(classes[order[-1]]);conf=p[order[-1]];gap=conf-p[order[-2]]
    # A digit-only classifier cannot establish that an unknown glyph is a digit.
    if mode=='svm' or (mode=='hybrid' and conf>=.85 and margin<.20):
     predictions[i]=(digit,dist,float(gap) if mode=='svm' else min(float(gap),.20))
 return [(*a,*b) for a,b in zip(out,predictions)]

def header_candidates(glyphs):
 # Independent of bubble outlines. Require four adjacent, similarly sized letters, plausible gaps.
 valid=[g for g in glyphs if g[7]<1.7 and g[8]>.05];out=[]
 for a in [g for g in valid if g[6]=='A']:
  for b in [g for g in valid if g[6]=='B' and 1.15*a[3]<g[0]-a[0]<4*a[3] and abs(g[1]-a[1])<.35*a[3]]:
   dx=b[0]-a[0];seq=[a,b]
   for j,c in enumerate('CDE',2):
    options=[g for g in valid if g[6]==c and abs(g[0]-a[0]-j*dx)<.22*dx and abs(g[1]-a[1])<.35*a[3] and .65<g[3]/a[3]<1.5]
    if not options:break
    seq.append(min(options,key=lambda g:abs(g[0]-a[0]-j*dx)))
   if len(seq)>=4:out.append({'centers':[[g[0],g[1]] for g in seq],'letters':''.join(g[6] for g in seq)})
 return out
if __name__=='__main__':
 import joblib,sys,json
 B,Y=bank();rng=np.random.default_rng(407);X=[];labels=[];fonts=[]
 for f in TEST:
  if not (FONT_ROOT/f).exists():continue
  fonts.append(f)
  for ch in LABELS:
   for size in (12,17,25,34):
    a=render(ch,f,size);a=cv2.GaussianBlur(a,(3,3),float(rng.uniform(.2,1.1)));a=np.clip(a+rng.normal(0,.008,a.shape),0,1);X.append(feature(a));labels.append(ch)
 X=np.array(X);labels=np.array(labels);p=np.array([z[0] for z in classify(X,B,Y)]);mask=np.isin(labels,list('0123456789'))
 svm=joblib.load(sys.argv[1])[-1];pred=svm.predict(X[mask]);p2=np.array([str(d) for d in pred]);res={'fonts':fonts,'digit_samples':int(mask.sum()),'svm_correct':int((p2==labels[mask]).sum()),'template_digit_correct':int((p[mask]==labels[mask]).sum()),'letter_samples':int((~mask).sum()),'template_letter_correct':int((p[~mask]==labels[~mask]).sum())};print(res);open('glyph-results.json','w').write(json.dumps(res,indent=2))
