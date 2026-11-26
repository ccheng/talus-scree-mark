"""R12 two-path NR discovery reference, consolidated from the frozen research implementation.
Offline, no student-mark reading. Input is a bounded uint8 grayscale page.
Requires OpenCV, NumPy, SciPy, Pillow and a compatible synthetic SVM.
"""
import os
os.environ.setdefault('OPENBLAS_NUM_THREADS','1')
os.environ.setdefault('OMP_NUM_THREADS','1')
import cv2, numpy as np, time, json
from scipy.spatial import cKDTree
from scipy.optimize import linear_sum_assignment
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
cv2.setNumThreads(1)
def ink(im):
 bg=np.percentile(im,90);return np.clip((bg-im.astype(np.float32))/max(50,bg),0,1)

X,DX,HALF=np.meshgrid(np.arange(16,61),np.arange(26,39),[.38,.40,.43,.48,.50],indexing='ij');X=X.ravel();DX=DX.ravel();HALF=HALF.ravel();centers=X[:,None]+DX[:,None]*np.arange(4);edges=(centers[:,:,None]+DX[:,None,None]*HALF[:,None,None]*np.array([-1,1])).round().astype(int);valid=(edges.min((1,2))>=2)&(edges.max((1,2))<168);edges=np.clip(edges,0,169)

def independent_header(a):
 roi=a[:80];hor=cv2.morphologyEx(roi,cv2.MORPH_OPEN,np.ones((1,15),np.uint8));hs=hor.mean(1)
 pairs=sorted([(min(hs[t],hs[b]),t,b) for t in range(3,41) for b in range(t+23,min(t+53,79))],reverse=True);selected=[]
 for _,t,b in pairs:
  if all(abs(t-u)>3 or abs(b-v)>3 for u,v in selected):selected.append((t,b))
  if len(selected)==4:break
 best=(-1,0,0,0,0)
 for t,b in selected:
  vert=cv2.morphologyEx(roi[t:b+1],cv2.MORPH_OPEN,np.ones((max(9,(b-t)//2),1),np.uint8)).mean(0);vert=cv2.dilate(vert[None,:],np.ones((1,5),np.uint8))[0];side=vert[edges];end=np.minimum(side[:,0,0],side[:,3,1]);score=.55*side.mean((1,2))+.30*end+.15*side.min((1,2));score=np.where(valid,score,-1);i=int(score.argmax());z=(float(score[i]*min(1,4*min(hs[t],hs[b]))),float(X[i]),float(DX[i]),t,b)
  if z[0]>best[0]:best=z
 return best

def normalize_patch(im,x,y,rx,ry):
    # output pixel coordinate -> source pixel coordinate; normalized ellipse radius 7.5
    M=np.float32([[rx/7.5,0,x-11*rx/7.5],[0,ry/7.5,y-11*ry/7.5]])
    return cv2.warpAffine(im,M,(23,23),flags=cv2.INTER_LINEAR|cv2.WARP_INVERSE_MAP,borderValue=255)

def decimals(im,H,shape,E):
    _,x,y,dx,dy=H; r=[]
    for c in range(4):
      cx=int(x+c*dx);cy=int(y-dy); q=E[cy-4:cy+5,cx-4:cx+5];j,i=np.unravel_index(q.argmax(),q.shape);xx=cx+i-4;yy=cy+j-4
      p=normalize_patch(im,xx,yy,*shape);a=ink(p);Y,X=np.mgrid[-11:12,-11:12];rad=np.hypot(X,Y);dot=float(a[rad<=1.8].mean()-a[(rad>2.5)&(rad<5)].mean());r.append([xx,yy,float(q[j,i]),dot])
    return np.array(r)

def blobs(im):
 h,w=im.shape; out=[]
 for bw in [cv2.threshold(im,0,255,cv2.THRESH_BINARY_INV|cv2.THRESH_OTSU)[1],cv2.adaptiveThreshold(im,255,cv2.ADAPTIVE_THRESH_GAUSSIAN_C,cv2.THRESH_BINARY_INV, max(15,round(min(h,w)*.15)//2*2+1),5)]:
  cnts,_=cv2.findContours(bw,cv2.RETR_LIST,cv2.CHAIN_APPROX_SIMPLE)
  for c in cnts:
   if len(c)<5:continue
   (x,y),(a,b),ang=cv2.fitEllipse(c); area=cv2.contourArea(c); per=cv2.arcLength(c,True)
   if min(a,b)<max(3,min(h,w)*.025) or max(a,b)>min(h,w)*.23 or max(a,b)/min(a,b)>2.6 or area/(np.pi*a*b/4)<.60 or 4*np.pi*area/max(1,per**2)<.50:continue
   # horizontal and vertical projected diameters
   t=np.deg2rad(ang);rx=np.hypot(a*np.cos(t),b*np.sin(t))/2;ry=np.hypot(a*np.sin(t),b*np.cos(t))/2
   out.append((x,y,rx,ry,area))
 out.sort(key=lambda x:-x[4]); kept=[]
 for p in out:
  if not any(np.linalg.norm(np.array(p[:2])-q[:2])<max(2,min(p[2:4])*.55) for q in kept):kept.append(np.array(p))
 return np.array(kept).reshape(-1,5)

def canonical(a):
 a=a.astype(np.float32);a=np.clip(a,0,None);peak=np.percentile(a[a>0],90) if (a>0).any() else 0
 if peak<.025:return np.zeros((24,24),np.float32)
 a=np.clip(a/peak,0,1);mask=a>.30
 if not mask.any():return np.zeros((24,24),np.float32)
 y,x=np.where(mask);q=a[y.min():y.max()+1,x.min():x.max()+1]; h,w=q.shape
 s=min(20/h,20/w);q=cv2.resize(q,(max(1,round(w*s)),max(1,round(h*s))),interpolation=cv2.INTER_LINEAR)
 h,w=q.shape;z=np.zeros((24,24),np.float32);z[(24-h)//2:(24-h)//2+h,(24-w)//2:(24-w)//2+w]=q
 return z

def glyph_patch(im,x,y,rx,ry):
 # Resample physical ellipse into a circular region; keep center, mask ring.
 p=normalize_patch(im,x,y,rx,ry).astype(np.float32);Y,X=np.mgrid[-11:12,-11:12];R=np.hypot(X,Y);bg=np.percentile(p[R<=6],90);a=np.clip((bg-p)/max(bg,50),0,1);a[R>6.1]=0
 return canonical(a)

def descriptor(a):
 a=cv2.GaussianBlur(a,(3,3),.8);v=a.ravel();return v/max(np.linalg.norm(v),1e-5)

def templates():
 # Use previously declared generic synthetic font families, not real sheet data.
 paths=[p for p in Path('/usr/share/fonts/truetype').rglob('*.ttf') if 'Regular' in p.name or p.name in ['DejaVuSans.ttf','DejaVuSerif.ttf','LiberationSans-Regular.ttf']]
 paths=sorted(paths);X=[];Y=[]
 for path in paths:
  for d in range(10):
   try:f=ImageFont.truetype(str(path),40)
   except OSError:continue
   im=Image.new('L',(64,64),0);draw=ImageDraw.Draw(im);b=draw.textbbox((0,0),str(d),font=f);draw.text((32-(b[0]+b[2])/2,32-(b[1]+b[3])/2),str(d),font=f,fill=255)
   a=np.array(im,dtype=np.float32)/255
   for s in (.7,1.,1.3):
    for thick in [-1,0,1]:
     q=cv2.resize(a,None,fx=s,fy=1,interpolation=cv2.INTER_LINEAR)
     if thick<0:q=cv2.erode(q,np.ones((2,2),np.uint8))
     if thick>0:q=cv2.dilate(q,np.ones((2,2),np.uint8))
     X.append(descriptor(canonical(q)));Y.append(d)
 return np.array(X),np.array(Y),len(paths)

def pitch(vals,lo,hi):
 a=vals[(vals>=lo)&(vals<=hi)]; bins=np.arange(int(lo),int(hi)+1); score=np.array([np.exp(-.5*((a-v)/1.3)**2).sum() for v in bins]); ix=np.argsort(-score); ret=[]
 for j in ix:
  if all(abs(bins[j]-z)>1 for z in ret):ret.append(bins[j])
  if len(ret)>=5:break
 return ret

def grid(im):
 # The initial resize standardizes computational resolution, not bubble diameter.
 b=blobs(im);h,w=im.shape
 if len(b)<10:return None
 hs,bx,bdx,top,bot=independent_header(ink(im));xy=b[:,:2];d=xy[:,None]-xy[None]; dxs=pitch(np.abs(d[:,:,0])[np.abs(d[:,:,1])<4],w*.11,w*.30);dys=pitch(np.abs(d[:,:,1])[np.abs(d[:,:,0])<4],h*.04,h*.10)
 tree=cKDTree(xy); rr,cc=np.indices((10,4));uv=np.c_[cc.ravel(),rr.ravel()];best=None
 for dx in dxs:
  for dy in dys:
   P=uv*[dx,dy]; origins=(xy[:,None]-P).reshape(-1,2);origins=origins[(origins[:,0]>=5)&(origins[:,1]>=dy*2.5)&(origins[:,0]+3*dx<w-5)&(origins[:,1]+9*dy<h-5)]
   if not len(origins):continue
   dist,idx=tree.query(origins[:,None,:]+P);v=np.exp(-.5*(dist/(.12*min(dx,dy)))**2).sum(1);
   if hs>.07:
    gap=(origins[:,1]-bot)/dy; v-=8*np.maximum(0,abs(gap-1.65)-.30)
   i=v.argmax()
   if best is None or v[i]>best[0]:best=(v[i],origins[i],dx,dy)
 if best is None:return None
 _,o,dx,dy=best; A=np.c_[np.ones(40),uv];pred=o+uv*[dx,dy]
 for _ in range(3):
  dist,idx=tree.query(pred);ok=dist<.25*min(dx,dy)
  if ok.sum()<12:return None
  coef=np.linalg.lstsq(A[ok],xy[idx[ok]],rcond=None)[0];pred=A@coef
 dist,idx=tree.query(pred);ok=dist<.20*min(dx,dy)
 rx,ry=np.median(b[idx[ok],2:4],axis=0);return coef,pred,ok,(rx,ry)

def shape_map(im,rx,ry):
 a=ink(im);r=int(np.ceil(max(rx,ry)*1.6));y,x=np.mgrid[-r:r+1,-r:r+1];D=np.hypot(x/rx,y/ry);ang=np.arctan2(y/ry,x/rx)
 def f(m):
  k=m.astype('float32');return cv2.filter2D(a,-1,k/max(k.sum(),1))
 ring=(D>=.82)&(D<=1.08);base=.5*(f((D>.60)&(D<.77))+f((D>1.14)&(D<1.38)));s=np.stack([f(ring&(ang>=-np.pi+i*np.pi/4)&(ang<-np.pi+(i+1)*np.pi/4)) for i in range(8)]);return np.maximum(0,.65*(s.mean(0)-base)+.35*(np.sort(s,axis=0)[1]-base))

def assess(src,T,Y):
 im=cv2.resize(src,(170,310),interpolation=cv2.INTER_AREA);z=grid(im)
 if z is None:return dict(status='no_lattice')
 coef,pred,ok,shape=z
 # Canonical coordinate frame defined by inferred lattice, including its shear/rotation.
 o,ux,uy=coef;B=np.column_stack((ux/32,uy/20));offset=o-B@np.array([35,88]);M=np.c_[B,offset];norm=cv2.warpAffine(im,M.astype('float32'),(170,310),flags=cv2.INTER_LINEAR|cv2.WARP_INVERSE_MAP,borderValue=255);r=np.array(shape)/np.linalg.norm(B,axis=0)
 # one ellipse size for entire grid; only choose a shared scale adjustment
 H=(0,35,88,32,20);pts=np.array([(35+c*32,88+rr*20) for rr in range(10) for c in range(4)]);maps=[shape_map(norm,*np.maximum(2,r*s)) for s in [.82,.94,1.06]];ix=np.argmax([np.mean(m[pts[:,1],pts[:,0]]) for m in maps]);E=maps[ix];r=np.maximum(2,r*[.82,.94,1.06][ix]);P=[]
 for x,y in pts:
  q=E[y-3:y+4,x-3:x+4];j,i=np.unravel_index(q.argmax(),q.shape);P.append([x+i-3,y+j-3,float(q[j,i])])
 P=np.array(P);v=P[:,2].reshape(10,4);med=max(.001,np.median(v)); hs,bx,bdx,top,bot=independent_header(ink(norm));axes=float(np.max(np.abs(bx+bdx*np.arange(4)-(35+32*np.arange(4))))/32)
 # decimals may have a different radius from digit bubbles
 D=[]
 for factor in [.65,.82,1.,1.18]:
  sr=np.maximum(2,r*factor);d=decimals(norm,H,sr,shape_map(norm,*sr));D.append(d)
 D=np.array(D);best=D[D[:,:,2].argmax(0),np.arange(4)];inner=float(best[1:3,2].min());outer=float(best[[0,3],2].max());dot=float(best[1:3,3].min());
 A=np.array([descriptor(glyph_patch(norm,x,y,*r)) for x,y,_ in P]);S=A@T.T;D=np.stack([S[:,Y==i].max(1) for i in range(10)],1).reshape(10,4,10).mean(1);diag=np.diag(D);ii,jj=linear_sum_assignment(-D);alt=[]
 # best nonidentity assignment: forbid one diagonal edge at a time.
 for i in range(10):
  Q=D.copy();Q[i,i]=-100;u,w=linear_sum_assignment(-Q);alt.append(D[u,w].sum())
 perm=float(diag.sum()-max(alt));repeat=float((diag-D.max(1)).sum());rowwins=int((D.argmax(1)==np.arange(10)).sum());
 G=A.reshape(10,4,-1).mean(1);G/=np.maximum(np.linalg.norm(G,axis=1,keepdims=True),1e-5);sim=G@G.T;np.fill_diagonal(sim,-1);repeat_similarity=float(sim.max());out=dict(repeat_similarity=repeat_similarity,status='mapped',support=int(ok.sum()),shape=r.tolist(),row=float(v.mean(1).min()/med),col=float(v.mean(0).min()/med),ring=float(med),header=float(hs),axes=axes,header_gap=float((88-bot)/20),inner=inner,outer=outer,outer_ratio=outer/max(inner,.001),dot=dot,rowwins=rowwins,permutation_margin=perm,repeated_margin=repeat,expected=float(diag.mean()),centers=(P[:,:2]@B.T+offset).tolist(),decimal_centers=(best[1:3,:2]@B.T+offset).tolist())
 return out

hog=cv2.HOGDescriptor((24,24),(12,12),(6,6),(6,6),9)

def features(X):return np.array([hog.compute(np.uint8(x*255)).ravel() for x in X])

def structural(z):
 return z.get('status')=='mapped' and z['row']>=.5 and z['col']>=.6 and z['header']>=.08 and z['axes']<=.2 and .9<=z['header_gap']<=2.2 and z['inner']>=.035 and z['dot']>=.06 and z['outer_ratio']<=.5

def evidence(im,T,Y,svm):
 z=assess(im,T,Y)
 if z['status']!='mapped':return z
 im=cv2.resize(im,(170,310));P=np.array(z['centers']);rr,cc=np.indices((10,4));Q=np.c_[np.ones(40),cc.ravel(),rr.ravel()];o,ux,uy=np.linalg.lstsq(Q,P,rcond=None)[0];B=np.column_stack([ux/32,uy/20]);offset=o-B@np.array([35,88]);M=np.c_[B,offset];norm=cv2.warpAffine(im,M.astype('float32'),(170,310),flags=cv2.INTER_LINEAR|cv2.WARP_INVERSE_MAP,borderValue=255);coords=(P-offset)@np.linalg.inv(B).T;X=np.array([glyph_patch(norm,x,y,*z['shape']) for x,y in coords]);p=svm.predict_proba(features(X));D=np.log(np.clip(p,1e-5,1)).reshape(10,4,10).mean(1);diag=np.diag(D);alts=[]
 for i in range(10):
  q=D.copy();q[i,i]=-1e4;a,b=linear_sum_assignment(-q);alts.append(q[a,b].sum())
 z['svm_margin']=float(diag.sum()-max(alts));z['svm_repeat_margin']=float((diag-D.max(1)).sum());z['svm_wins']=int((D.argmax(1)==np.arange(10)).sum());z['svm_expected']=float(diag.mean());z['svm_row_conflict']=float(np.max(D.max(1)-diag));z['svm_exact_glyphs']=int((p.argmax(1)==np.repeat(np.arange(10),4)).sum());return z

def decide(z,rule):
 if z.get('status')!='mapped':return 'review'
 # Strong geometric contradictions, not missing evidence, may support rejection.
 if z['axes']>.30 and z['header']>=.08 or z['outer_ratio']>.80 and z['inner']>=.035:return 'reject'
 if not structural(z):return 'review'
 model,margin,repeat=rule
 if z['svm_margin']>=margin and z['svm_repeat_margin']>=repeat and (model!='joint' or z['permutation_margin']>=-.12):return 'accept'
 # semantic disagreement: abstain, do not invent digit identities
 return 'review'

def headers(im):
 h,w=im.shape; out=[]
 for bw in (cv2.threshold(im,0,255,cv2.THRESH_BINARY_INV|cv2.THRESH_OTSU)[1],cv2.adaptiveThreshold(im,255,cv2.ADAPTIVE_THRESH_GAUSSIAN_C,cv2.THRESH_BINARY_INV,41,7)):
  for length in (max(7,round(w*.008)),max(12,round(w*.015))):
   gap=max(3,round(w*.003));a=cv2.morphologyEx(bw,cv2.MORPH_CLOSE,np.ones((1,gap),np.uint8));b=cv2.morphologyEx(bw,cv2.MORPH_CLOSE,np.ones((gap,1),np.uint8));a=cv2.morphologyEx(a,cv2.MORPH_OPEN,np.ones((1,length),np.uint8));b=cv2.morphologyEx(b,cv2.MORPH_OPEN,np.ones((length,1),np.uint8));mask=cv2.dilate(a|b,np.ones((3,3),np.uint8));cs,_=cv2.findContours(mask,cv2.RETR_LIST,cv2.CHAIN_APPROX_SIMPLE)
   for c in cs:
    x,y,ww,hh=cv2.boundingRect(c)
    if not .009*w<ww<.14*w or not .008*w<hh<.15*w or not .3<ww/hh<2.6 or cv2.contourArea(c)/(ww*hh)<.77:continue
    pad=max(3,round(min(ww,hh)*.12))
    if x<pad or y<pad or x+ww+pad>=w or y+hh+pad>=h:continue
    side=[np.mean(a[y-pad:y+pad+1,x:x+ww].max(0)>0),np.mean(a[y+hh-pad:y+hh+pad+1,x:x+ww].max(0)>0),np.mean(b[y:y+hh,x-pad:x+pad+1].max(1)>0),np.mean(b[y:y+hh,x+ww-pad:x+ww+pad+1].max(1)>0)]
    if min(side)<.48:continue
    z=np.array([x+ww/2,y+hh/2,ww,hh])
    if not any(np.linalg.norm(z[:2]-q[:2])<min(ww,hh)*.22 for q in out):out.append(z)
 cells=np.array(out).reshape(-1,4);found=[]
 if not len(cells):return found,cells
 tree=cKDTree(cells[:,:2])
 for i,(x,y,ww,hh) in enumerate(cells):
  for j in tree.query_ball_point([x,y],ww*2.2):
   dx,dy=cells[j,:2]-cells[i,:2]
   if not .75*ww<dx<1.85*ww or abs(dy)>.24*dx:continue
   v=np.array([dx,dy]);pred=cells[i,:2]+np.arange(4)[:,None]*v;d,idx=tree.query(pred)
   if max(d)>.20*dx or len(set(idx))<4:continue
   q=cells[idx]
   if np.max(abs(q[:,2]/ww-1))>.30 or np.max(abs(q[:,3]/hh-1))>.30:continue
   if any(np.linalg.norm(q[:,:2].mean(0)-p['cells'][:,:2].mean(0))<dx*.5 for p in found):continue
   found.append(dict(cells=q,pitch=float(np.linalg.norm(v)),score=float(4-np.sum(d)/dx)))
 return found,cells

def hypotheses(blobs,o,ux,uy,shifts=True):
 if not len(blobs):return []
 xy=blobs[:,:2];tree=cKDTree(xy);rr,cc=np.indices((10,4));A=np.c_[np.ones(40),cc.ravel(),rr.ravel()];pitch=min(np.linalg.norm(ux),np.linalg.norm(uy));out=[]
 for dc in (-1,0,1) if shifts else (0,):
  for dr in (-1,0,1) if shifts else (0,):
   for f in (.94,1,1.06) if shifts else (1,):
    start=o+dc*ux+dr*uy;P=A@np.array([start,ux*f,uy*f]);d,ix=tree.query(P);ok=d<.28*pitch
    if ok.sum()<18 or len(set(ix[ok]))<sum(ok):continue
    coef=np.linalg.lstsq(A[ok],xy[ix[ok]],rcond=None)[0];P=A@coef;d,ix=tree.query(P);ok=d<.23*pitch
    if ok.sum()<18 or len(set(ix[ok]))<sum(ok):continue
    P[ok]=xy[ix[ok]];score=float(ok.sum()-np.minimum(d/pitch,1).sum()*.35);out.append(dict(score=score,coef=coef,positions=P,observed=ok,shift=(dc,dr)))
 return sorted(out,key=lambda q:-q['score'])

def header_seeds(header,blobs):
 cells=header['cells'];u=(cells[-1,:2]-cells[0,:2])/3;dx=np.linalg.norm(u);down=np.array([-u[1],u[0]])/dx;bottom=cells[0,:2]+down*np.median(cells[:,3])/2;xy=blobs[:,:2];delta=xy-bottom;along=delta@u/dx;below=delta@down
 local=xy[(along>-.4*dx)&(along<3.4*dx)&(below>.2*dx)&(below<13*dx)]
 if len(local)<8:return []
 d=local[:,None]-local[None];horizontal=d@u/dx;vertical=d@down;vals=vertical[(abs(horizontal)<.22*dx)&(vertical>.38*dx)&(vertical<1.4*dx)]
 if not len(vals):return []
 bins=np.linspace(.4*dx,1.35*dx,42);strength=np.exp(-.5*((vals[:,None]-bins)/(.045*dx))**2).sum(0);pitches=[]
 for i in np.argsort(-strength):
  if all(abs(bins[i]-p)>.12*dx for p in pitches):pitches.append(bins[i])
  if len(pitches)==3:break
 return [(bottom+gap*p*down,u,p*down) for p in pitches for gap in (1.,1.65,2.)]

def header_proposals(im,blobs,shifts=True):
 hs,cells=headers(im);out=[]
 for h in hs:
  candidates=[]
  for o,u,v in header_seeds(h,blobs):
   for q in hypotheses(blobs,o,u,v,shifts):
    a,b,c=q['coef'];down=c/np.linalg.norm(c);base=h['cells'][0,:2]+down*np.median(h['cells'][:,3])/2;dx=np.linalg.norm(b);dy=np.linalg.norm(c)
    diff=a+np.arange(4)[:,None]*b-h['cells'][:,:2];axes=np.max(np.linalg.norm(diff-(diff@down)[:,None]*down,axis=1))/dx;gap=(a-base)@down/dy
    if axes>.30 or not .65<gap<2.5:continue
    q['rank']=q['score']-5*axes-3*abs(gap-1.65);candidates.append(q)
  if candidates:out.append(max(candidates,key=lambda q:q['rank']))
 return out,len(hs)

def lattice_proposals(blobs):
 if len(blobs)<20:return []
 xy=blobs[:,:2];tree=cKDTree(xy);out=[];rr,cc=np.indices((10,4));cc=cc.reshape(-1,1);rr=rr.reshape(-1,1)
 for i,(x,y,rx,ry,_) in enumerate(blobs):
  p=xy[i]
  for j in tree.query_ball_point(p,6*max(rx,ry)):
   u=xy[j]-p;dx=np.linalg.norm(u)
   if not 2.0*rx<u[0]<6*rx or abs(u[1])>.15*u[0] or not .6<blobs[j,2]/rx<1.7:continue
   d,ix=tree.query(p+np.arange(4)[:,None]*u)
   if sum(d<.20*dx)<3:continue
   for k in tree.query_ball_point(p,5*max(rx,ry)):
    v=xy[k]-p;dy=np.linalg.norm(v)
    if not 1.7*ry<v[1]<4.5*ry or abs(v[0])>.20*v[1]:continue
    P=p+cc*u+rr*v;d,ix=tree.query(P);ok=d<.27*min(dx,dy)
    if ok.sum()<30 or min(ok.reshape(10,4).sum(0))<6:continue
    out.append(dict(score=float(ok.sum()),coef=np.array([p,u,v]),positions=P,observed=ok))
 return out

def merge(proposals):
 keep=[]
 for q in sorted(proposals,key=lambda q:-q['score']):
  P=q['positions'];pitch=min(np.linalg.norm(q['coef'][1]),np.linalg.norm(q['coef'][2]))
  if any(np.mean(cKDTree(k['positions']).query(P)[0]<.35*pitch)>.55 for k in keep):continue
  keep.append(q)
  if len(keep)>=24:break
 return keep

def page_blobs(im):
 h,w=im.shape;out=[]
 for bw in [cv2.threshold(im,0,255,cv2.THRESH_BINARY_INV|cv2.THRESH_OTSU)[1],cv2.adaptiveThreshold(im,255,cv2.ADAPTIVE_THRESH_GAUSSIAN_C,cv2.THRESH_BINARY_INV,31,5)]:
  cs,_=cv2.findContours(bw,cv2.RETR_LIST,cv2.CHAIN_APPROX_SIMPLE)
  for c in cs:
   if len(c)<5:continue
   (x,y),(a,b),ang=cv2.fitEllipse(c);area=cv2.contourArea(c);per=cv2.arcLength(c,True)
   if min(a,b)<3.6 or max(a,b)>min(h,w)*.07 or max(a,b)/min(a,b)>2.7 or area/(np.pi*a*b/4)<.55 or 4*np.pi*area/max(1,per**2)<.43:continue
   t=np.deg2rad(ang);rx=np.hypot(a*np.cos(t),b*np.sin(t))/2;ry=np.hypot(a*np.sin(t),b*np.cos(t))/2;out.append((x,y,rx,ry,area))
 kept=[]
 for p in sorted(out,key=lambda x:-x[4]):
  if not any(np.hypot(p[0]-q[0],p[1]-q[1])<max(1.6,min(p[2:4])*.55) for q in kept):kept.append(p)
 return np.array(kept).reshape(-1,5)

def proposals(im):
 b=page_blobs(im);xy=b[:,:2];tree=cKDTree(xy);out=[];rr,cc=np.indices((10,4));rc=np.c_[cc.ravel()-1,rr.ravel()]
 for i,(x,y,rx,ry,_) in enumerate(b):
  p=xy[i];neighbors=tree.query_ball_point(p,max(rx,ry)*6)
  for j in neighbors:
   v=xy[j]-p;dx=np.linalg.norm(v)
   if v[0]<2.05*rx or abs(v[1])>.24*v[0] or dx>rx*6 or not .55<b[j,2]/rx<1.8:continue
   u=v/dx;down=np.array([-u[1],u[0]])
   # An outer ring at decimal height is evidence against this pair; do not silently remove it.
   if max(tree.query([p-v,p+2*v])[0])<.20*dx:continue
   local=tree.query_ball_point(p, max(rx,ry)*11)
   for k in local:
    delta=xy[k]-p;dy=delta@down
    if abs(delta@u)>.30*dx or not 1.7*ry<dy<4.2*ry:continue
    # decimal-to-first-row distance need not equal subsequent row pitch
    for pitch in [dy*.85,dy,dy*1.15]:
     z=p+delta+rc[:,0,None]*v+rc[:,1,None]*pitch*down
     d,ix=tree.query(z);ok=(d<.26*min(dx,pitch))&(b[ix,2]>.52*rx)&(b[ix,2]<1.85*rx)
     if ok.sum()<20 or ok.reshape(10,4).sum(0).min()<3 or (ok.reshape(10,4).sum(1)>0).sum()<8:continue
     score=float(ok.sum()-np.minimum(d/min(dx,pitch),1).sum()*.25)
     A=np.c_[np.ones(40),rc[:,0]+1,rc[:,1]];coef=np.linalg.lstsq(A[ok],xy[ix[ok]],rcond=None)[0];o,ux,uy=coef;pp=A@coef;out.append((score,o,ux,uy,pp))
 # suppress duplicate hypotheses that share most of the grid, retain competing nearby disjoint grids
 keep=[]
 for t in sorted(out,key=lambda z:-z[0]):
  if not any(np.mean(cKDTree(q[4]).query(t[4])[0]<.35*np.linalg.norm(t[2]))>.55 for q in keep):keep.append(t)
  if len(keep)>=24:break
 return keep,len(b),len(out)

def scan(src,T,Y,svm,rule,paths=('header','decimal')):
 h,w=src.shape;scale=min(1,2000/h);im=cv2.resize(src,(round(w*scale),round(h*scale)),interpolation=cv2.INTER_AREA);b=page_blobs(im);allp=[];stats={}
 if 'header' in paths:
  p,n=header_proposals(im,b);stats['headers']=n;stats['header_proposals']=len(p);allp.extend(dict(q,path='header') for q in p)
 if 'decimal' in paths:
  p,_,raw=proposals(im);stats['decimal_proposals']=len(p);allp.extend(dict(score=q[0],coef=np.array(q[1:4]),positions=q[4],path='decimal') for q in p)
 if 'lattice' in paths:
  p=lattice_proposals(b);stats['lattice_raw']=len(p);allp.extend(dict(q,path='lattice') for q in p)
 keep=merge(allp);out=[];unsubstantiated=0
 for q in keep:
  o,ux,uy=q['coef'];B=np.column_stack([ux/32,uy/20]);offset=o-B@np.array([35,88]);M=np.c_[B,offset];crop=cv2.warpAffine(src,(M/scale).astype('float32'),(170,310),flags=cv2.INTER_LINEAR|cv2.WARP_INVERSE_MAP,borderValue=255);a=evidence(crop,T,Y,svm);decision=decide(a,rule);c=a.pop('centers',None);d=a.pop('decimal_centers',None)
  # A lattice by itself is not positive NR evidence. Keep diagnostics, but do not burden author with plain MC grids.
  if q['path']=='lattice' and (c is None or (a['header']<.08 and a['inner']<.035 and a['svm_wins']<8)):
   decision='unsubstantiated';unsubstantiated+=1
  if c is not None:c=((np.array(c)@B.T+offset)/scale).tolist();d=((np.array(d)@B.T+offset)/scale).tolist()
  out.append(dict(accepted=decision=='accept',decision=decision,old_accepted=structural(a) and a['permutation_margin']>=-.12 if c is not None else False,centers=c,decimals=d,path=q['path'],evidence=a))
 return out,dict(stats,blobs=len(b),regions=len(keep),unsubstantiated=unsubstantiated)
RULE=('svm',0,-10)

class Reference:
    def __init__(self, svm):
        self.T, self.Y, _=templates()
        self.svm=svm
    def discover(self, gray, paths=('header','decimal')):
        if not isinstance(gray,np.ndarray) or gray.ndim!=2 or gray.dtype!=np.uint8 or min(gray.shape)<32 or max(gray.shape)>8000:
            raise ValueError('Expected one bounded uint8 grayscale page')
        if not paths or not set(paths)<= {'header','decimal','lattice'}:
            raise ValueError('Unknown discovery path')
        out,stats=scan(gray,self.T,self.Y,self.svm,RULE,paths)
        return {'proposals':out,'stats':stats}
