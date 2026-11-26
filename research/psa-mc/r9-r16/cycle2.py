import cv2,numpy as np,json,time
from PIL import Image,ImageDraw,ImageFont
from glyphs import bank,FONT_ROOT
from structured import fused
from joint import joint
from fixtures import evaluate

def make(case):
 im=Image.new('L',(1050,1350),248);d=ImageDraw.Draw(im);truth=[];font=ImageFont.truetype(str(FONT_ROOT/'open-sans/OpenSans-Regular.ttf'),23)
 for g,ys in enumerate(([190,230,270,350,390,430,470,510,550],[190,230,310,350,390])):
  x0=150+g*310;pitch=37;n=5 if case=='five' else 4
  if not case.startswith('no-header'):
   for c in range(n):d.text((x0+c*pitch,145),chr(65+c),font=font,fill=25,anchor='mm')
  for r,y in enumerate(ys):
   num=(1 if g==0 else 10)+r
   if case!='no-numbers' and not(case=='missing-label' and r==3):d.text((x0-43,y),str(num),font=font,fill=25,anchor='rm')
   coords=[]
   for c in range(n):
    x=x0+c*pitch;coords.append([x,y])
    if case in ('missing-row','no-header-missing') and g==0 and r==4:continue
    if case=='edge-loss' and r in (2,4,6) and c==0:continue
    d.ellipse((x-7,y-7,x+7,y+7),outline=25,width=2)
   truth.append(coords)
  if case in ('gap-rings','no-header-gap'):
   y=310 if g==0 else 270
   for c in range(n):
    x=x0+c*pitch;d.ellipse((x-7,y-7,x+7,y+7),outline=25,width=2)
 if case=='mixed':
  sm=ImageFont.truetype(str(FONT_ROOT/'open-sans/OpenSans-Regular.ttf'),10)
  for j in range(4):
   x=150+j*23;d.rectangle((x-10,700,x+10,722),outline=25,width=2)
   for k in range(10):
    y=765+k*20;d.ellipse((x-7,y-7,x+7,y+7),outline=25,width=2);d.text((x,y),str(k),font=sm,fill=25,anchor='mm')
   if j in (1,2):d.ellipse((x-7,738,x+7,752),outline=25,width=2);d.text((x,745),'.',font=sm,fill=25,anchor='mm')
 a=np.array(im)
 if case=='shadow':a=cv2.GaussianBlur(np.uint8(a*np.linspace(.56,1,1050)[None,:]),(3,3),.8)
 return a,truth

def score(rows,t):
 z=evaluate(rows,t,4);z['confirmed']=evaluate([r for r in rows if r['decision']=='confirmed'],t,4);z['numbered']=sum('number'in r for r in rows);return z
if __name__=='__main__':
 B,Y=bank();out=[]
 for case in ['clean','no-header','missing-row','no-header-missing','edge-loss','gap-rings','no-header-gap','five','no-numbers','missing-label','mixed','shadow']:
  a,t=make(case);s=time.perf_counter();old,_=fused(a,B,Y);new,e,h=joint(a,B,Y);num,_,_=joint(a,B,Y,True);z=dict(case=case,first=score(old,t),joint=score(new,t),number=score(num,t),headers=len(h),details=e,seconds=round(time.perf_counter()-s,3));print(json.dumps(z),flush=True);out.append(z)
 open('cycle2-results.json','w').write(json.dumps(out,indent=2))
