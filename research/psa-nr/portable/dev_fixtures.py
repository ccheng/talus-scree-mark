"""Public development-only synthetic fixture generator. No private or sealed holdout data."""
import cv2,numpy as np
from PIL import Image,ImageDraw,ImageFont
def make(seed,kinds,angle=0,project=False):
 rng=np.random.default_rng(seed);W,H=1050,1350;im=Image.new('L',(W,H),248);d=ImageDraw.Draw(im);truth=[]
 for col in range(2):
  for r in range(11):
   for c in range(4):
    x=82+col*195+c*29;y=80+r*25;d.ellipse((x-7,y-7,x+7,y+7),outline=65,width=2)
 for y in [950,1150]:d.line((50,y,W-50,y),fill=80,width=2)
 for j,k in enumerate(kinds):
  dx=float(rng.uniform(30,43));dy=float(rng.uniform(21,29));x=62+(j%4)*252;y=505+int(rng.integers(-18,19));rx=dx*rng.uniform(.22,.35);ry=dy*rng.uniform(.27,.40);fg=150 if k=='faint' else int(rng.integers(30,90));lw=2;hh=dy*rng.uniform(1.6,2.2);bottom=y-dy*1.65;top=bottom-hh;half=dx*(.39 if k=='separate' else .5);font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',max(9,round(ry*1.45)))
  centers=[];heads=[]
  def ring(xx,yy,text):
   d.ellipse((xx-rx,yy-ry,xx+rx,yy+ry),outline=fg,width=lw)
   if text=='.':d.ellipse((xx-1.3,yy-1.3,xx+1.3,yy+1.3),fill=fg)
   elif text is not None:d.text((xx,yy),str(text),font=font,fill=fg,anchor='mm')
  for c in range(4):
   xx=x+c*dx;xh=xx+(.38*dx if k=='shift_header' else 0);heads.append([xh,(top+bottom)/2]);d.rectangle((xh-half,top,xh+half,bottom),outline=fg,width=lw)
   if k=='broken':d.rectangle((xh-2,top-1,xh+2,top+3),fill=248)
  for r in range(10):
   for c in range(4):
    xx=x+c*dx+(dx*.32 if k=='shift_col' and c==2 else 0);yy=y+r*dy;centers.append([xx,yy]);
    if k=='missing_row' and r==5:continue
    ring(xx,yy,(1-r if r<2 else r) if k=='swap' else r)
  for c in [1,2]:centers.append([x+c*dx,y-dy]);
  for c in ([0,1,2] if k=='outer' else [1] if k=='missing_decimal' else [1,2]):ring(x+c*dx,y-dy,'.')
  truth.append(dict(kind=k,valid=k in ('normal','separate','faint','broken'),points=np.array(centers),heads=np.array(heads),pitch=min(dx,dy)))
 a=np.array(im);M=cv2.getRotationMatrix2D((W/2,H/2),angle,1);P=np.vstack([M,[0,0,1.]])
 if project:
  p0=np.float32([[0,0],[W-1,0],[W-1,H-1],[0,H-1]]);p1=np.float32([[23,14],[W-25,0],[W-1,H-18],[0,H-1]]);P=cv2.getPerspectiveTransform(p0,p1)@P
 a=cv2.warpPerspective(a,P,(W,H),borderValue=248);a=cv2.GaussianBlur(a,(3,3),.45)
 for z in truth:
  for key in ('points','heads'):z[key]=cv2.perspectiveTransform(z[key].reshape(1,-1,2),P)[0]
 return a,truth

def evalout(out,truth):
 result=[]
 for q in out:
  if q['centers'] is None:continue
  p=np.r_[q['centers'],q['decimals']];dist=[np.linalg.norm(p-z['points'],axis=1).mean()/z['pitch'] for z in truth];i=int(np.argmin(dist)) if truth else -1
  match=i>=0 and dist[i]<.7;e=float(np.linalg.norm(p-truth[i]['points'],axis=1).max()/truth[i]['pitch']) if match else None
  result.append(dict(idx=i if match else -1,kind=truth[i]['kind'] if match else 'distractor',path=q['path'],decision=q['decision'],exact42=bool(match and truth[i]['valid'] and e<=.25),maxerr=e))
 return result
