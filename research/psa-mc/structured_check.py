import cv2,numpy as np,json
from PIL import Image,ImageDraw,ImageFont
from glyphs import bank,FONT_ROOT
from structured import fused
from fixtures import evaluate
from mc_core import discover

def page(case):
 im=Image.new('L',(1100,1400),248);d=ImageDraw.Draw(im);truth=[];font=ImageFont.truetype(str(FONT_ROOT/'croscore/Arimo-Regular.ttf'),22)
 n=5 if case=='five' else 4
 for g,ys in enumerate(([190,232,316,358,400,442,484,526,568],[190,232,274,358,400])):
  x0=160+g*280;pitch=38
  for c in range(n):d.text((x0+c*pitch,150),chr(65+c),font=font,fill=20,anchor='mm')
  for r,y in enumerate(ys):
   number=(1 if g==0 else 10)+r;d.text((x0-48,y),str(number),font=font,fill=20,anchor='rm');coords=[]
   for c in range(n):
    x=x0+c*pitch;coords.append([x,y]);
    if case=='missing-row' and g==0 and r==4:continue
    if case=='partial' and g==0 and r==4 and c==2:continue
    d.ellipse((x-7,y-7,x+7,y+7),outline=25,width=2)
   truth.append(coords)
  if case=='empty-ring-distractor':
   y=274 if g==0 else 316
   for c in range(n):
    x=x0+c*pitch;d.ellipse((x-7,y-7,x+7,y+7),outline=25,width=2)
 if case=='shadow':
  a=np.array(im,dtype=float);shade=np.linspace(.65,1,1100)[None,:];a=np.uint8(np.clip(a*shade,0,255));return cv2.GaussianBlur(a,(3,3),.7),truth
 return np.array(im),truth
if __name__=='__main__':
 B,Y=bank();out=[]
 for case in ['clean','missing-row','partial','empty-ring-distractor','five','shadow']:
  im,t=page(case);rows,_=discover(im);f,e=fused(im,B,Y);z={'case':case,'outline':evaluate(rows,t,4),'fused':evaluate(f,t,4),'labelled':sum('number'in r for r in f),'conflict_review':sum(r.get('source')=='unlabelled-row-conflict' for r in f),'headers':e};print(z,flush=True);out.append(z)
 open('structured-results.json','w').write(json.dumps(out,indent=2))
